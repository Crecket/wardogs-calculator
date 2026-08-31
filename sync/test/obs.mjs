/*
 * The OBS overlay route, in a real browser at the size a browser source
 * actually is.
 *
 * Two halves, because the route has two: /obs/ with no room renders the
 * tab's own stored map and opens no socket at all, and /obs/#room=<code>
 * joins an existing room as a read-only viewer.
 *
 * The room code is created over HTTP from node rather than through the UI,
 * so this suite does not need the site served on the one port
 * ALLOWED_ORIGINS lists — joining is open to any origin by design.
 *
 *   npm run build      # in the repo root, to produce dist/
 *   npm run dev        # in sync/, one shell
 *   npm run test:obs   # in sync/, another
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

const SITE_PORT = Number(process.env.SITE_PORT || 8804);
const SYNC = process.env.SYNC_URL || `ws://localhost:${process.env.SYNC_PORT || 8799}`;
const HTTP = SYNC.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');

const VIEWPORT = { width: 1920, height: 1080 };

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
        throw new Error('No Chromium found. Run: npx playwright install chromium');
    }

    return join(cache, build, 'chrome-linux64/chrome');
}

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
    /*
     * The message text for a failed request does not name it, so the
     * console location is carried along: maps/tiles/ is gitignored and
     * absent from a fresh build, and those 404s are expected.
     */
    page.on('console', m => {
        if (m.type() === 'error') {
            errors.push(`${m.text()} ${m.location()?.url || ''}`);
        }
    });
    return page;
}

/*
 * Seeded before the app boots. The overlay with no room renders whatever
 * this tab has stored, which is exactly what a streamer's second window
 * holds.
 */
async function seedPoints(page) {
    await page.addInitScript(() => {
        localStorage.setItem('wardogs-map-points', JSON.stringify({
            map: 'bakurani',
            origin: { x: 60, y: 60 },
            target: { x: 63, y: 64 },
            guns: [
                { id: 'gun-a', name: 'Gun 1', x: 60, y: 60, weapon: 'mortar' },
                { id: 'gun-b', name: 'Gun 2', x: 64, y: 57, weapon: 'mortar' }
            ]
        }));
    });
}

async function overlayReady(page) {
    await page.waitForFunction(
        () => typeof OBS !== 'undefined' && OBS.active === true,
        null, { timeout: 20000 }
    );
}

async function appReady(page) {
    await page.waitForFunction(
        () => typeof MAP_TOOL_STATE !== 'undefined' &&
              document.getElementById('mapToolCollab') &&
              !document.getElementById('mapToolCollab').hidden,
        null, { timeout: 20000 }
    );
}

const context = await browser.newContext({ viewport: VIEWPORT });

console.log('\n== local overlay, no room, no socket ==');

const local = await newPage(context);
await seedPoints(local);
await local.goto(`http://localhost:${SITE_PORT}/obs/`);
await overlayReady(local);

const localState = await local.evaluate(() => ({
    socket: COLLAB.socket,
    status: COLLAB.status,
    overlayHidden: document.getElementById('obsOverlay').hidden,
    mil: document.getElementById('obsMil').textContent,
    azimuth: document.getElementById('obsAzimuth').textContent,
    range: document.getElementById('obsRange').textContent,
    gun: document.getElementById('obsGun').textContent,
    flight: document.getElementById('obsFlightValues').textContent,
    zoom: S.zoom,
    guns: S.guns.length,
    mapWidth: document.querySelector('.map').clientWidth,
    mapHeight: document.querySelector('.map').clientHeight,
    header: getComputedStyle(document.querySelector('header')).display,
    aside: getComputedStyle(document.querySelector('aside')).display,
    tools: getComputedStyle(document.getElementById('mapTools')).display,
    toolbar: getComputedStyle(document.querySelector('.toolbar')).display,
    footer: getComputedStyle(document.getElementById('siteFooter')).display,
    overflow: getComputedStyle(document.body).overflow,
    mapBg: cssVar('--map-bg', 'MISSING')
}));

check('no socket without a room code', localState.socket === null &&
    localState.status === 'off', localState.status);
check('overlay is visible', localState.overlayHidden === false);
check('solution is rendered from stored state', /^\d+$/.test(localState.mil),
    localState.mil);
check('azimuth is rendered', localState.azimuth === '36.9°', localState.azimuth);
check('range is rendered', localState.range === '500 m', localState.range);
check('gun line names the gun and its weapon',
    /Gun 1 · Mortar · 1\/2/.test(localState.gun), localState.gun);
check('time of flight is rendered', localState.flight.length > 0, localState.flight);
check('camera framed the pair', localState.zoom > 1, String(localState.zoom));
check('map fills the browser source', localState.mapWidth === VIEWPORT.width &&
    localState.mapHeight === VIEWPORT.height,
    `${localState.mapWidth}x${localState.mapHeight}`);
check('no app chrome', [
    localState.header, localState.aside, localState.tools,
    localState.toolbar, localState.footer
].every(display => display === 'none'), JSON.stringify(localState));
check('no scrollbars', localState.overflow === 'hidden', localState.overflow);
check('background is transparent by default', localState.mapBg === 'transparent',
    localState.mapBg);

console.log('\n== the overlay never writes the streamer\'s stored map ==');

const storedBefore = await local.evaluate(
    () => localStorage.getItem('wardogs-map-points')
);

await local.evaluate(() => {
    S.target = { x: 70, y: 70 };
    inputs();
    MAP_TOOL_STATE.selectedMarkerIcon = 'medic';
    placeMapToolMarker({ x: 50, y: 60 });
});

await local.waitForTimeout(600);

const storedAfter = await local.evaluate(() => ({
    points: localStorage.getItem('wardogs-map-points'),
    tools: localStorage.getItem('wardogs-map-tools')
}));

check('wardogs-map-points untouched', storedAfter.points === storedBefore);
check('wardogs-map-tools holds no overlay edit',
    !(storedAfter.tools || '').includes('"icon":"medic"'), storedAfter.tools);

console.log('\n== camera motion ==');

const motion = await local.evaluate(() => {
    S.target = { x: 90, y: 100 };
    inputs();
    draw();

    return { animating: OBS.camera !== null, zoom: S.zoom };
});

check('a moved point animates the camera', motion.animating === true);

const calm = await browser.newContext({
    viewport: VIEWPORT,
    reducedMotion: 'reduce'
});

const still = await newPage(calm);
await seedPoints(still);
await still.goto(`http://localhost:${SITE_PORT}/obs/`);
await overlayReady(still);

const jumped = await still.evaluate(() => {
    const before = S.zoom;

    S.target = { x: 90, y: 100 };
    inputs();
    draw();

    return {
        animating: OBS.camera !== null,
        moved: S.zoom !== before
    };
});

check('prefers-reduced-motion cuts instead of animating',
    jumped.animating === false && jumped.moved === true, JSON.stringify(jumped));

await still.close();
await calm.close();

console.log('\n== query API ==');

const configured = await newPage(context);
await seedPoints(configured);
await configured.goto(
    `http://localhost:${SITE_PORT}/obs/?bg=opaque&panel=compact&corner=tr&scale=1.5&maxzoom=3&cursors=off&frame=map&textsize=5&padding=40`
);
await overlayReady(configured);

const options = await configured.evaluate(() => ({
    options: OBS.options,
    bg: document.documentElement.dataset.obsBg,
    panel: document.getElementById('obsOverlay').dataset.panel,
    corner: document.getElementById('obsOverlay').dataset.corner,
    scale: getComputedStyle(document.body).getPropertyValue('--obs-scale').trim(),
    textScale: getComputedStyle(document.body).getPropertyValue('--obs-text-scale').trim(),
    padding: OBS.options.padding,
    milSize: getComputedStyle(document.getElementById('obsMil')).fontSize,
    mapBg: cssVar('--map-bg', 'MISSING'),
    flightVisible: !document.getElementById('obsFlight').hidden,
    zoom: S.zoom
}));

check('bg=opaque keeps the map ground', options.bg === 'opaque' &&
    options.mapBg !== 'transparent', options.mapBg);
check('panel=compact reaches the DOM', options.panel === 'compact');
check('corner=tr reaches the DOM', options.corner === 'tr');
check('scale reaches the CSS variable', options.scale === '1.5', options.scale);
check('textsize reaches the CSS variable as a fraction of ten',
    Math.abs(parseFloat(options.textScale) - 0.62 * 0.5) < 0.001, options.textScale);
check('textsize halves the readout type',
    Math.abs(parseFloat(options.milSize) - 62 * 1.5 * 0.62 * 0.5) < 1.5, options.milSize);
check('padding reaches the framing options',
    options.padding === 40, String(options.padding));
await configured.goto(
    `http://localhost:${SITE_PORT}/obs/?frame=target&maxzoom=8`
);
await overlayReady(configured);

const targetFrame = await configured.evaluate(() => ({
    frame: OBS.options.frame,
    zoom: Number(S.zoom.toFixed(3)),
    cx: Number(OBS.view.cx.toFixed(4)),
    cy: Number(OBS.view.cy.toFixed(4)),
    targetX: Number(S.target.x.toFixed(4)),
    targetY: Number(S.target.y.toFixed(4)),
    gunX: Number(activeGun().position.x.toFixed(4))
}));

check('frame=target centres the target, not the pair',
    targetFrame.frame === 'target' &&
    Math.abs(targetFrame.cx - targetFrame.targetX) < 1e-6 &&
    Math.abs(targetFrame.cx - (targetFrame.targetX + targetFrame.gunX) / 2) > 1e-6,
    JSON.stringify(targetFrame));
check('frame=target zooms to maxzoom',
    Math.abs(targetFrame.zoom - 8) < 1e-6, String(targetFrame.zoom));
check('frame=target centres the target exactly, ignoring the readout',
    Math.abs(targetFrame.cy - targetFrame.targetY) < 1e-6,
    JSON.stringify(targetFrame));

check('the link the app hands out carries the real defaults',
    await configured.evaluate(() =>
        COLLAB_OBS_QUERY.padding === OBS_DEFAULTS.padding &&
        COLLAB_OBS_QUERY.textsize === OBS_DEFAULTS.textSize &&
        COLLAB_OBS_QUERY.frame === 'target'),
    'COLLAB_OBS_QUERY has drifted from OBS_DEFAULTS');
check('cursors=off is parsed', options.options.cursors === 'off');
check('frame=map fits the whole map', Math.abs(options.zoom - 1) < 0.001,
    String(options.zoom));

await configured.close();

console.log('\n== joining a room as a viewer ==');

const created = await fetch(`${HTTP}/room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapId: 'bakurani' })
});

const room = await created.json();
const code = room.code;

check('room created for the test', /^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/.test(code || ''),
    JSON.stringify(room));

const editor = await newPage(await browser.newContext());
await editor.goto(`http://localhost:${SITE_PORT}/#room=${code}`);
await appReady(editor);
await editor.waitForFunction(() => COLLAB.status === 'online', null, { timeout: 15000 });
await editor.evaluate(() => collabSetName('Streamer'));

const overlay = await newPage(context);
await seedPoints(overlay);
await overlay.goto(`http://localhost:${SITE_PORT}/obs/#room=${code}`);
await overlayReady(overlay);
await overlay.waitForFunction(() => COLLAB.status === 'online', null, { timeout: 15000 });

check('overlay joined the room', true);
check('overlay socket declares itself a viewer',
    /\?viewer=1$/.test(await overlay.evaluate(() => COLLAB.socket.url)),
    await overlay.evaluate(() => COLLAB.socket.url));

console.log('\n== the room code never renders ==');

async function codeInDom(page) {
    const html = await page.content();
    return html.includes(code) || html.includes(code.toUpperCase());
}

check('code absent from the overlay DOM', !(await codeInDom(overlay)));
check('the shared-session panel stayed empty',
    (await overlay.evaluate(() => document.getElementById('collabPopover').innerHTML)) === '');
check('code absent from the visible text',
    !(await overlay.evaluate(() => document.body.innerText)).includes(code));

console.log('\n== the overlay is not a peer ==');

await editor.waitForTimeout(1000);

const seenByEditor = await editor.evaluate(() => ({
    peers: COLLAB.peers,
    roster: (COLLAB.roster || []).length,
    rows: document.querySelectorAll('#collabPopover .collab-peer').length
}));

check('editor still counts one peer', seenByEditor.peers === 1,
    JSON.stringify(seenByEditor));
check('editor roster lists only itself', seenByEditor.roster === 1,
    JSON.stringify(seenByEditor));

console.log('\n== the overlay never pushes ==');

const refused = await overlay.evaluate(() => ({
    send: collabSend({ op: 'point.set', point: 'target', x: 50, y: 50 }),
    emit: collabEmit({ op: 'point.set', point: 'target', x: 50, y: 50 })
}));

check('collabSend refuses', refused.send === false);
check('collabEmit refuses', refused.emit === false);

const beforeTarget = await editor.evaluate(() => ({ ...S.target }));

await overlay.evaluate(() => {
    S.target = { x: 51.5, y: 52.5 };
    inputs();
    collabFlushShared();
    collabOnPointerWorld({ x: 51.5, y: 52.5 });
    collabFlushCursor();
});

await editor.waitForTimeout(1200);

const afterTarget = await editor.evaluate(() => ({
    target: { ...S.target },
    cursors: COLLAB.cursors.size
}));

check('no point.set reached the room',
    afterTarget.target.x === beforeTarget.x && afterTarget.target.y === beforeTarget.y,
    JSON.stringify(afterTarget));
check('no cursor reached the room', afterTarget.cursors === 0,
    String(afterTarget.cursors));

console.log('\n== the room refuses a viewer op on its own ==');

const rejected = await overlay.evaluate(() => new Promise(resolve => {
    const socket = COLLAB.socket;

    const onMessage = event => {
        const message = JSON.parse(event.data);

        if (message.type === 'error') {
            socket.removeEventListener('message', onMessage);
            resolve(message.code);
        }
    };

    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ op: 'point.set', point: 'target', x: 50, y: 50 }));

    setTimeout(() => resolve('no-answer'), 5000);
}));

check('server answers read-only', rejected === 'read-only', rejected);

console.log('\n== the overlay follows the room ==');

const cameraBefore = await overlay.evaluate(() => ({
    zoom: S.zoom, panX: S.panX, panY: S.panY
}));

await editor.evaluate(() => {
    S.target = { x: 88.5, y: 96.25 };
    inputs();
});

await overlay.waitForFunction(
    () => Math.abs(S.target.x - 88.5) < 0.001 && Math.abs(S.target.y - 96.25) < 0.001,
    null, { timeout: 10000 }
);

check('the room target reached the overlay', true);

await overlay.waitForFunction(
    previous => S.zoom !== previous.zoom || S.panX !== previous.panX,
    cameraBefore, { timeout: 10000 }
);

check('the camera reframed the new pair', true);

await overlay.waitForTimeout(1200);

const settled = await overlay.evaluate(() => ({
    animating: OBS.camera !== null,
    mil: document.getElementById('obsMil').textContent,
    range: document.getElementById('obsRange').textContent
}));

check('the camera move settled', settled.animating === false);
check('the readout followed the room', settled.range !== '500 m', settled.range);
check('code still absent from the overlay DOM', !(await codeInDom(overlay)));

console.log('\n== peer cursors still render ==');

await editor.evaluate(() => {
    collabOnPointerWorld({ x: 70, y: 70 });
    collabFlushCursor();
});

await overlay.waitForFunction(() => COLLAB.cursors.size === 1, null, { timeout: 10000 });

const cursor = await overlay.evaluate(
    () => Array.from(COLLAB.cursors.values())[0].name
);

check('the peer cursor arrives with its name', cursor === 'Streamer', cursor);

const real = errors.filter(
    error => !/favicon|umami|net::ERR_|maps\/tiles/i.test(error)
);

check('no page errors', real.length === 0, real.slice(0, 4).join(' | '));

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
