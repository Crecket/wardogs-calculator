/*
 * The collaboration feature must be completely inert when config/app.json
 * has no collab.url. That is the upstream default, so this is the
 * regression that matters most to anyone who does not run the sync
 * service — it needs no worker running, only a built dist/.
 *
 *   npm run build           # in the repo root
 *   npm run test:disabled   # in sync/
 *
 * See browser.mjs for the playwright-core setup notes.
 */

import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../dist');
const PORT = Number(process.env.SITE_PORT || 8803);

let pass = 0;
let fail = 0;

const check = (label, ok, detail = '') => {
    if (ok) {
        pass++;
        console.log(`  ok   ${label}`);
    } else {
        fail++;
        console.log(`  FAIL ${label} ${detail}`);
    }
};

async function findChrome() {
    if (process.env.CHROME_PATH) {
        return process.env.CHROME_PATH;
    }

    const cache = join(homedir(), '.cache/ms-playwright');
    const entries = await readdir(cache).catch(() => []);
    const build = entries
        .filter(name => name.startsWith('chromium-'))
        .sort()
        .pop();

    if (!build) {
        throw new Error('No Chromium found. Run: npx playwright install chromium');
    }

    return join(cache, build, 'chrome-linux64/chrome');
}

const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.bin': 'application/octet-stream'
};

const server = createServer(async (req, res) => {
    try {
        let path = decodeURIComponent(req.url.split('?')[0]);

        if (path.endsWith('/')) {
            path += 'index.html';
        }

        const file = join(ROOT, normalize(path));

        if (!file.startsWith(ROOT)) {
            throw new Error('path escape');
        }

        const body = await readFile(file);

        res.writeHead(200, {
            'Content-Type': TYPES[extname(file)] || 'application/octet-stream'
        });
        res.end(body);
    } catch {
        res.writeHead(404);
        res.end('not found');
    }
});

await new Promise(r => server.listen(PORT, r));

/*
 * The guarantee that matters is what the repo ships, so assert against the
 * source config rather than dist/ — browser.mjs rewrites the built copy to
 * point at a local worker, and these two suites must not depend on which
 * ran last.
 */
const source = JSON.parse(
    await readFile(resolve(HERE, '../../config/app.json'), 'utf8')
);
check('repo ships collab.url = null', source.collab?.url === null,
    JSON.stringify(source.collab));

/* Then force dist/ to the disabled state this suite is about. */
const distConfigPath = join(ROOT, 'config/app.json');
const distConfig = JSON.parse(await readFile(distConfigPath, 'utf8'));
distConfig.collab = { url: null };
await writeFile(distConfigPath, JSON.stringify(distConfig, null, 2));

const browser = await chromium.launch({
    executablePath: await findChrome(),
    args: ['--no-sandbox']
});

for (const [label, path] of [
    ['desktop en', '/'],
    ['desktop de', '/de/'],
    ['mobile', '/mobile/']
]) {
    const errors = [];
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(`${e}`));
    page.on('console', m => {
        if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto(`http://localhost:${PORT}${path}`);
    await page.waitForFunction(
        () => document.documentElement.dataset.appInitState !== 'failed' &&
              typeof MAPS !== 'undefined' && Object.keys(MAPS).length > 0,
        null, { timeout: 20000 }
    );

    console.log(`\n== ${label} ==`);
    check(`${label}: app initialised`, true);
    check(`${label}: collab reports unconfigured`,
        await page.evaluate(() => isCollabConfigured() === false));
    /*
     * Computed display, not the .hidden IDL property: that property stays
     * true no matter what CSS does, so asserting it passes even when an
     * author-origin `display` rule overrides [hidden] and the button is
     * plainly visible on screen.
     */
    check(`${label}: collab button stays hidden`,
        await page.evaluate(() => getComputedStyle(
            document.getElementById('mapToolCollab')
        ).display === 'none'));
    check(`${label}: no socket opened`,
        await page.evaluate(() => COLLAB.socket === null && COLLAB.status === 'off'));

    /* The hooked mutators must behave exactly as they did before. */
    const tools = await page.evaluate(() => {
        const before = MAP_TOOL_STATE.markers.length;
        MAP_TOOL_STATE.selectedMarkerIcon = 'medic';
        placeMapToolMarker({ x: 50, y: 60 });

        const added = MAP_TOOL_STATE.markers.length === before + 1;
        const persisted = (localStorage.getItem('wardogs-map-tools') || '')
            .includes(MAP_TOOL_STATE.markers[MAP_TOOL_STATE.markers.length - 1].id);

        undoMapToolAction();

        return {
            added,
            persisted,
            afterUndo: MAP_TOOL_STATE.markers.length === before
        };
    });

    check(`${label}: marker still places`, tools.added);
    check(`${label}: still persists to local storage`, tools.persisted);
    check(`${label}: snapshot undo still works`, tools.afterUndo);

    const real = errors.filter(e => !/favicon|umami|net::ERR_/i.test(e));
    check(`${label}: no console errors`, real.length === 0, real.slice(0, 4).join(' | '));

    await page.close();
}

console.log('\n== stale share link, service unconfigured ==');
const errors = [];
const page = await browser.newPage();
page.on('pageerror', e => errors.push(`${e}`));

await page.goto(`http://localhost:${PORT}/#room=abcdefghjkmn`);
await page.waitForFunction(
    () => typeof MAPS !== 'undefined' && Object.keys(MAPS).length > 0,
    null, { timeout: 20000 }
);

check('ignored, app still boots', await page.evaluate(() => COLLAB.status === 'off'));
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
