import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Window } from 'happy-dom';
import * as protocol from '../../js/collab/protocol.mjs';
import * as replicaModule from '../../js/collab/replica.mjs';
const roomDoc = () => ({ mapId: 'bakurani', w: 16, h: 16, drawings: [], markers: [], zones: [], polygons: [], savedTargets: [] });
const code = `${'a'.repeat(22)}.${Date.now().toString(36)}.${'b'.repeat(43)}`;
async function client(t, enabled = true) {
    const window = new Window({ url: 'http://localhost:8000/' });
    t.after(() => window.happyDOM.close());
    window.document.body.innerHTML = `<div class="map"><canvas id="canvas"></canvas></div>
        <select id="mapSelect"><option value="custom">Custom</option><option value="bakurani">Bakurani</option></select>
        <select id="weapon"><option value="spg">SPG</option><option value="mortar">L81 Mortar</option></select>
        <button id="apply"></button><input id="w"><input id="h"><input id="ox"><input id="oy"><input id="tx"><input id="ty">
        <div id="customMapSizing"></div><button id="mapToolUndoButton"></button><button id="mapToolRedoButton"></button>`;
    const drawing = { arcs: [], labels: [], lines: [] };
    const canvasContext = {
        save() {}, restore() {}, beginPath() {}, fill() {}, stroke() {},
        setLineDash() {}, fillRect() {}, strokeRect() {},
        arc(x, y, radius) { drawing.arcs.push({ x, y, radius }); },
        moveTo(x, y) { drawing.lines.push({ type: 'move', x, y }); },
        lineTo(x, y) { drawing.lines.push({ type: 'line', x, y }); },
        fillText(text) { drawing.labels.push(text); },
        measureText(text) { return { width: String(text).length * 6 }; }
    };
    window.document.querySelector('canvas').getContext = () => canvasContext;
    const sockets = [], requests = [], timers = new Map(); let timerId = 0;
    class Socket extends window.EventTarget {
        static OPEN = 1;
        constructor(url) { super(); this.url = url; this.readyState = 1; this.sent = []; sockets.push(this); }
        send(text) { this.sent.push(text === 'ping' ? text : JSON.parse(text)); }
        message(data) { this.dispatchEvent(new window.MessageEvent('message', { data: JSON.stringify(data) })); }
        close() { this.readyState = 3; this.dispatchEvent(new window.CloseEvent('close')); }
    }
    const context = vm.createContext({
        window, document: window.document, location: window.location, navigator: window.navigator,
        localStorage: window.localStorage, URL, URLSearchParams, Blob, AbortSignal, TextEncoder, structuredClone, crypto, console,
        WebSocket: Socket, confirm: () => true, queueMicrotask,
        setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id),
        setInterval: (fn, ms) => { timers.set(++timerId, { fn, ms, interval: true }); return timerId; }, clearInterval: id => timers.delete(id),
        fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ code, ownerKey: 'owner-test' }) }; },
        __protocol: protocol, __replicaModule: replicaModule
    });
    const run = source => vm.runInContext(source, context);
    for (const path of ['js/core/core.js', 'js/features/saved-targets.js', 'js/map/map-tools.js', 'js/ui/inputs.js']) {
        run(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'));
    }
    run(`
        APP_CONFIG = {collab: {enabled: ${enabled}, serverUrl: 'https://lobby.test', maxParticipants: 8, batchDelayMs: 1000}};
        MAPS = {bakurani: {w: 16, h: 16}}; WEAPONS = {mortar: {}, spg: {}}; LANG = 'ru';
        Object.assign(S, {map: 'custom', w: 10, h: 10, weapon: 'spg', target: {x: 2, y: 3}, panX: 33});
        savedTargets = [{id: 'personal', name: 'My own target', x: 1, y: 2, saveArtillery: false, origin: null}];
        MAP_TOOL_STATE.markers = [{id: 'personal-marker', mapId: 'custom', icon: 'infantry', x: 2, y: 2}];
        function result() {} function draw() {} function formatGameCoordinate(n) {return String(n);}
        function worldToLocalScreen(x, y) {return {x, y};}
        function clamp(point) {point.x = Math.max(0, Math.min(S.w, point.x)); point.y = Math.max(0, Math.min(S.h, point.y));}
        function versionRuntimeAsset(url) {return url;}
        updateMapToolsUI = () => {}; renderSavedTargets = () => {};
        persistSavedTargets(); saveMapToolState(); persistAppSelections(); writeMapPoints();
    `);
    const source = (await readFile(new URL('../../js/collab/lobby.js', import.meta.url), 'utf8'))
        .replace("await import(versionRuntimeAsset(new URL('js/collab/protocol.mjs', BASE_PATH).href))", '__protocol')
        .replace("await import(versionRuntimeAsset(new URL('js/collab/replica.mjs', BASE_PATH).href))", '__replicaModule');
    run(source); await run('initLobby()');
    const click = action => window.document.querySelector(`[data-action="${action}"]`).click();
    const snapshot = (extra = {}) => sockets.at(-1).message({ type: 'snapshot', revision: 0, doc: roomDoc(), you: 'peer-1', roster: [{ id: 'peer-1', name: '', origin: null, target: null }], maxParticipants: 8, remainingUpdates: 100, expiresAt: Date.now() + 60000, ...extra });
    const tick = () => { for (const [id, timer] of [...timers]) if (!timer.interval && timer.ms <= 1000) { timers.delete(id); timer.fn(); } };
    return { run, window, sockets, requests, click, snapshot, tick, drawing };
}
test('disabled feature has no menu, requests or sockets; personal persistence still works', async t => {
    const c = await client(t, false);
    assert.equal(c.window.document.querySelector('#lobbyControls'), null);
    assert.equal(c.requests.length, 0); assert.equal(c.sockets.length, 0);
    assert.equal(JSON.parse(c.window.localStorage.getItem('wardogs-app-selections')).map, 'custom');
});
test('idle enabled menu creates no connection and uses Russian labels', async t => {
    const c = await client(t);
    assert.ok(c.window.document.querySelector('.map > #lobbyControls'));
    assert.equal(c.window.document.querySelector('#lobbyHeading').textContent, 'Лобби');
    assert.equal(c.window.document.querySelector('.lobby-toggle').textContent.trim(), '');
    assert.equal(c.window.document.querySelector('.lobby-toggle').getAttribute('aria-label'), 'Лобби');
    assert.ok(c.window.document.querySelector('.lobby-toggle svg'));
    assert.equal(c.window.document.querySelector('.lobby-check input').nextElementSibling?.tagName, 'SPAN');
    assert.equal(c.requests.length, 0); assert.equal(c.sockets.length, 0);
});
test('join keeps a personal firing solution while shared annotations retain undo', async t => {
    const c = await client(t);
    const saved = Object.fromEntries(Array.from({ length: c.window.localStorage.length }, (_, i) => { const k = c.window.localStorage.key(i); return [k, c.window.localStorage.getItem(k)]; }));
    c.window.document.querySelector('.lobby-name').value = 'Alpha';
    c.click('create'); await new Promise(setImmediate);
    assert.equal(c.requests.length, 1);
    const createdDoc = JSON.parse(c.requests[0].options.body).doc;
    assert.deepEqual(createdDoc.savedTargets, []);
    assert.equal('origin' in createdDoc, false);
    assert.equal('target' in createdDoc, false);
    assert.equal('weapon' in createdDoc, false);
    c.snapshot();
    assert.equal(c.run('lobby.active'), true);
    assert.equal(c.run('S.map'), 'bakurani');
    assert.equal(c.run('S.target.x'), 2);
    assert.equal(c.run('S.weapon'), 'spg');
    assert.equal(c.window.document.querySelector('#mapSelect').disabled, true);
    const initialPresence = c.sockets[0].sent.find(message => message.type === 'presence');
    assert.equal(initialPresence.name, 'Alpha');
    assert.deepEqual(initialPresence.target, { x: 2, y: 3 });

    c.run('drag = "target"; S.target = {x: 8, y: 8}; inputs();'); c.tick();
    assert.equal(c.sockets[0].sent.filter(message => message.type === 'presence').length, 1);
    assert.equal(c.sockets[0].sent.filter(m => m.type === 'changes').length, 0);
    c.run('drag = null; lobby.capture();'); c.tick();
    const presences = c.sockets[0].sent.filter(message => message.type === 'presence');
    assert.equal(presences.length, 2);
    assert.deepEqual(presences.at(-1).target, { x: 8, y: 8 });
    assert.equal(c.sockets[0].sent.filter(m => m.type === 'changes').length, 0);

    c.run("MAP_TOOL_STATE.markers = [{id: 'room-marker', mapId: 'bakurani', icon: 'infantry', x: 4, y: 4}]; saveMapToolState();");
    c.tick();
    const message = c.sockets[0].sent.find(m => m.type === 'changes');
    assert.equal(message.ops.length, 1); assert.equal(message.ops[0].key, 'markers');
    c.sockets[0].message({ ...message, revision: 1, from: 'peer-1', remainingUpdates: 99 });
    assert.equal(c.run('undoMapToolAction()'), true);
    const undo = c.sockets[0].sent.at(-1);
    c.sockets[0].message({ ...undo, revision: 2, from: 'peer-1', remainingUpdates: 98 });
    assert.equal(c.run('MAP_TOOL_STATE.markers.length'), 0);
    assert.equal(c.run('S.target.x'), 8);
    c.click('leave');
    assert.equal(c.run('lobby.active'), false);
    assert.equal(c.run('S.map'), 'custom'); assert.equal(c.run('S.weapon'), 'spg'); assert.equal(c.run('S.panX'), 33);
    assert.equal(c.run('savedTargets[0].id'), 'personal'); assert.equal(c.run('MAP_TOOL_STATE.markers[0].id'), 'personal-marker');
    for (const [key, value] of Object.entries(saved)) assert.equal(c.window.localStorage.getItem(key), value, key);
});
test('remote annotations during a personal point drag do not replace the local firing solution', async t => {
    const c = await client(t); c.click('create'); await new Promise(setImmediate); c.snapshot();
    c.run('drag = "target"; S.target = {x: 9, y: 9}; inputs();');
    c.sockets[0].message({
        type: 'changes', id: 'remote', from: 'peer-2', revision: 1, remainingUpdates: 99,
        ops: [{ key: 'markers', id: 'remote-marker', before: null, value: { id: 'remote-marker', mapId: 'bakurani', icon: 'infantry', x: 2, y: 2 } }]
    });
    assert.equal(c.run('S.target.x'), 9);
    c.run('drag = null; lobby.capture();'); c.tick();
    assert.equal(c.run('S.origin.x'), 5); assert.equal(c.run('S.target.x'), 9);
    assert.equal(c.run('MAP_TOOL_STATE.markers[0].id'), 'remote-marker');
    assert.equal(c.sockets[0].sent.filter(message => message.type === 'changes').length, 0);
    assert.deepEqual(c.sockets[0].sent.filter(message => message.type === 'presence').at(-1).target, { x: 9, y: 9 });
});
test('teammate markers are labelled and rendered without range circles', async t => {
    const c = await client(t); c.click('create'); await new Promise(setImmediate); c.snapshot();
    c.sockets[0].message({
        type: 'peers',
        roster: [
            { id: 'peer-1', name: 'Alpha', origin: { x: 5, y: 5 }, target: { x: 6, y: 6 } },
            { id: 'peer-2', name: 'Bravo', origin: { x: 7, y: 8 }, target: { x: 9, y: 10 } }
        ]
    });
    assert.equal(c.run('lobby.visiblePeers().length'), 1);
    assert.equal(c.run('lobby.visiblePeers()[0].displayName'), 'Bravo');
    c.run('lobby.drawPeers()');
    assert.deepEqual(c.drawing.arcs.map(arc => arc.radius), [7, 7]);
    assert.ok(c.drawing.labels.includes('Bravo · O'));
    assert.ok(c.drawing.labels.includes('Bravo · T'));
});
test('disconnect does not auto-reconnect; rejected changes expose recovery without personal writes', async t => {
    const c = await client(t); c.click('create'); await new Promise(setImmediate); c.snapshot();
    c.run('S.target = {x: 9, y: 9}; inputs();'); c.tick();
    c.run("MAP_TOOL_STATE.markers = [{id: 'unconfirmed', mapId: 'bakurani', icon: 'infantry', x: 4, y: 4}]; saveMapToolState();"); c.tick();
    const change = c.sockets[0].sent.find(message => message.type === 'changes');
    c.snapshot({ rejected: change.id, error: 'conflict' });
    assert.equal(c.run('S.target.x'), 9);
    assert.equal(c.window.document.querySelector('.lobby-recovery').hidden, false);
    c.sockets[0].close(); c.tick();
    assert.equal(c.sockets.length, 1);
    assert.match(c.window.document.querySelector('.lobby-status').textContent, /Связь потеряна/);
    c.click('leave'); assert.equal(c.run('S.target.x'), 2);
});
