/*
 * Two real browsers, one room, one local worker.
 *
 * Covers the half the smoke test cannot: that the client hooks in
 * map-tools.js / saved-targets.js actually fire, that local storage
 * survives a session untouched, that undo stays per-user, and that
 * leaving puts your own map back.
 *
 *   npm run build          # in the repo root, to produce dist/
 *   npm run dev            # in sync/, one shell
 *   npm run test:browser   # in sync/, another
 *
 * Needs playwright-core and a Chromium build:
 *   npm install --no-save playwright-core
 *   npx playwright install chromium
 * Override the binary with CHROME_PATH= if it lives somewhere unusual.
 */

import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../dist');

const SITE_PORT = Number(process.env.SITE_PORT || 8801);
const SYNC = process.env.SYNC_URL || `ws://localhost:${process.env.SYNC_PORT || 8799}`;

let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
    if (ok) {
        pass++;
        console.log(`  ok   ${label}`);
    } else {
        fail++;
        console.log(`  FAIL ${label} ${detail}`);
    }
}

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
        throw new Error(
            'No Chromium found. Run: npx playwright install chromium'
        );
    }

    return join(cache, build, 'chrome-linux64/chrome');
}

/* Point the built site at the local worker. dist/ is gitignored. */
const configPath = join(ROOT, 'config/app.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
config.collab = { url: SYNC };
await writeFile(configPath, JSON.stringify(config, null, 2));

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

await new Promise(r => server.listen(SITE_PORT, r));

const browser = await chromium.launch({
    executablePath: await findChrome(),
    args: ['--no-sandbox']
});

const errors = [];

async function newPage(context) {
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(`${e}`));
    page.on('console', m => {
        if (m.type() === 'error') errors.push(m.text());
    });
    return page;
}

async function ready(page) {
    /*
     * The collab button is unhidden by initCollab(), which runs last in
     * init() — so this waits for a fully booted app, not merely a parsed
     * one. Waiting on a top-level const would pass before init() ran.
     */
    await page.waitForFunction(
        () => typeof MAP_TOOL_STATE !== 'undefined' &&
              document.getElementById('mapToolCollab') &&
              !document.getElementById('mapToolCollab').hidden,
        null, { timeout: 20000 }
    );

    /* The MOTD banner overlays the toolbar popovers. */
    await page.evaluate(() => document.querySelector('.motd')?.remove());
}

const A = await newPage(await browser.newContext());
const B = await newPage(await browser.newContext());

console.log('\n== boot ==');
await A.goto(`http://localhost:${SITE_PORT}/`);
await ready(A);
check('app boots with collab button visible', true);

/* Seed A's solo map so we can prove local storage survives a session. */
await A.evaluate(() => {
    MAP_TOOL_STATE.markers.push({
        id: 'solo-marker', mapId: S.map, icon: 'medic', x: 2, y: 2
    });
    saveMapToolState();
    savedTargets.push({
        id: 'solo-target', name: 'My Solo Target', x: 3, y: 3,
        saveArtillery: false, origin: null
    });
    persistSavedTargets();
});

const soloBefore = await A.evaluate(() => ({
    tools: localStorage.getItem('wardogs-map-tools'),
    targets: localStorage.getItem('wardogs-saved-targets')
}));
check('solo state seeded to local storage', soloBefore.tools.includes('solo-marker'));

console.log('\n== create room ==');
await A.click('#mapToolCollab');
await A.waitForSelector('#collabPopover.open .collab-primary');
/* Do not push the solo map, so the room starts empty and diffs are clear. */
await A.uncheck('#collabIncludeMine');
await A.click('#collabPopover .collab-primary');
await A.waitForSelector('.collab-code', { timeout: 15000 });
await A.waitForFunction(() => COLLAB.status === 'online', null, { timeout: 15000 });

const code = (await A.textContent('.collab-code')).trim();
check('room code shown', /^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/.test(code), code);
check('url hash carries code', (await A.evaluate(() => location.hash)) === `#room=${code}`);

const status = await A.textContent('#collabPopover .collab-status');
check('status reads live', /live/i.test(status), status);

console.log('\n== local storage untouched while in room ==');
const roomEmpty = await A.evaluate(() => ({
    markers: MAP_TOOL_STATE.markers.length,
    targets: savedTargets.length
}));
check('room state replaced solo view', roomEmpty.markers === 0 && roomEmpty.targets === 0,
    JSON.stringify(roomEmpty));

const soloDuring = await A.evaluate(() => ({
    tools: localStorage.getItem('wardogs-map-tools'),
    targets: localStorage.getItem('wardogs-saved-targets')
}));
check('wardogs-map-tools unchanged', soloDuring.tools === soloBefore.tools);
check('wardogs-saved-targets unchanged', soloDuring.targets === soloBefore.targets);

console.log('\n== second peer joins by link ==');
await B.goto(`http://localhost:${SITE_PORT}/#room=${code}`);
await ready(B);
await B.waitForFunction(() => COLLAB.status === 'online', null, { timeout: 15000 });
check('peer B online', true);

await A.waitForFunction(() => COLLAB.peers === 2, null, { timeout: 10000 });
check('A sees 2 peers', true);

console.log('\n== drawing syncs ==');
await A.click('#mapToolPencil');
/*
 * Drag around the canvas centre. The visible world window is a zoomed
 * region of the map, so canvas offsets near the edges land outside the
 * map bounds and handleMapToolMouseDown ignores them.
 */
const box = await A.locator('#canvas').boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

await A.mouse.move(cx, cy);
await A.mouse.down();
await A.mouse.move(cx + 60, cy + 40, { steps: 8 });
await A.mouse.move(cx + 120, cy, { steps: 8 });
await A.mouse.up();

await A.waitForFunction(() => MAP_TOOL_STATE.drawings.length === 1, null, { timeout: 5000 });
await B.waitForFunction(() => MAP_TOOL_STATE.drawings.length === 1, null, { timeout: 10000 });
check('stroke reached peer B', true);

const strokeIds = await Promise.all([
    A.evaluate(() => MAP_TOOL_STATE.drawings[0].id),
    B.evaluate(() => MAP_TOOL_STATE.drawings[0].id)
]);
check('same drawing id on both peers', strokeIds[0] === strokeIds[1], strokeIds.join(' vs '));

/*
 * Coordinates below are inside bakurani's world bounds (roughly
 * 23.3-133.6 by 19.3-129.7). Out-of-bounds values get clamped on apply,
 * which makes a sync assertion fail for the wrong reason.
 */
console.log('\n== marker syncs ==');
await A.evaluate(() => {
    MAP_TOOL_STATE.selectedMarkerIcon = 'medic';
    placeMapToolMarker({ x: 50, y: 60 });
});
await B.waitForFunction(() => MAP_TOOL_STATE.markers.length === 1, null, { timeout: 10000 });
check('marker reached peer B', true);

console.log('\n== saved target syncs ==');
await A.evaluate(() => {
    S.target = { x: 70.5, y: 80.25 };
    saveCurrentTarget();
});
await B.waitForFunction(() => savedTargets.length === 1, null, { timeout: 10000 });
check('saved target reached peer B', true);

console.log('\n== point.set syncs (throttled diff) ==');
await A.evaluate(() => {
    S.origin = { x: 55.25, y: 45.75 };
    inputs();
});
await B.waitForFunction(
    () => Math.abs(S.origin.x - 55.25) < 0.001 && Math.abs(S.origin.y - 45.75) < 0.001,
    null, { timeout: 10000 }
);
check('origin move reached peer B', true);

console.log('\n== B edits reach A ==');
await B.evaluate(() => {
    MAP_TOOL_STATE.selectedMarkerIcon = 'recon';
    placeMapToolMarker({ x: 90, y: 100 });
});
await A.waitForFunction(() => MAP_TOOL_STATE.markers.length === 2, null, { timeout: 10000 });
check('B marker reached A (bidirectional)', true);

console.log('\n== undo only undoes your own ops ==');
/* Undo pops A's newest own op, so make a marker the newest thing A did. */
await A.evaluate(() => {
    MAP_TOOL_STATE.selectedMarkerIcon = 'medic';
    placeMapToolMarker({ x: 100, y: 40 });
});
await B.waitForFunction(() => MAP_TOOL_STATE.markers.length === 3, null, { timeout: 10000 });

const undoResult = await A.evaluate(() => {
    const before = MAP_TOOL_STATE.markers.map(m => m.id);
    undoMapToolAction();
    return { before, after: MAP_TOOL_STATE.markers.map(m => m.id) };
});
check('A undo removed exactly one marker',
    undoResult.after.length === undoResult.before.length - 1,
    JSON.stringify(undoResult));

check("A's undo did not remove B's marker",
    await A.evaluate(() => MAP_TOOL_STATE.markers.some(m => m.icon === 'recon')));

await B.waitForFunction(() => MAP_TOOL_STATE.markers.length === 2, null, { timeout: 10000 });
check('undo propagated to B', true);

console.log('\n== map is locked during session ==');
check('map select disabled', await A.evaluate(() => $('mapSelect').disabled));

console.log('\n== leaving restores the solo map ==');
await A.click('#mapToolCollab');
await A.waitForSelector('#collabPopover.open .collab-leave');
await A.click('#collabPopover .collab-leave');
await A.waitForFunction(() => COLLAB.status === 'off', null, { timeout: 10000 });

const restored = await A.evaluate(() => ({
    markers: MAP_TOOL_STATE.markers.map(m => m.id),
    targets: savedTargets.map(t => t.id),
    drawings: MAP_TOOL_STATE.drawings.length,
    hash: location.hash,
    mapEnabled: !$('mapSelect').disabled
}));

check('solo marker restored', restored.markers.includes('solo-marker'), JSON.stringify(restored.markers));
check('solo target restored', restored.targets.includes('solo-target'), JSON.stringify(restored.targets));
check('room drawings gone', restored.drawings === 0, restored.drawings);
check('hash cleared', restored.hash === '');
check('map select re-enabled', restored.mapEnabled);

const soloAfter = await A.evaluate(() => ({
    tools: localStorage.getItem('wardogs-map-tools'),
    targets: localStorage.getItem('wardogs-saved-targets')
}));
check('local storage still has solo marker', soloAfter.tools.includes('solo-marker'));
check('local storage still has solo target', soloAfter.targets.includes('solo-target'));

console.log('\n== B unaffected by A leaving ==');
const bAfter = await B.evaluate(() => ({
    markers: MAP_TOOL_STATE.markers.length,
    drawings: MAP_TOOL_STATE.drawings.length
}));
check('B still holds room content', bAfter.markers === 2 && bAfter.drawings === 1, JSON.stringify(bAfter));

console.log('\n== console errors ==');
const real = errors.filter(e => !/favicon|umami|net::ERR_/i.test(e));
check('no page errors', real.length === 0, real.slice(0, 6).join(' | '));

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
