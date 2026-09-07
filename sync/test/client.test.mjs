import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Window } from 'happy-dom';
import * as protocol from '../../js/collab/protocol.mjs';
import * as replicaModule from '../../js/collab/replica.mjs';
const roomDoc = () => ({ mapId: 'bakurani', w: 16, h: 16, weapon: 'mortar', origin: { x: 5, y: 5 }, target: { x: 6, y: 6 }, drawings: [], markers: [], zones: [], polygons: [], savedTargets: [] });
const code = `${'a'.repeat(22)}.${Date.now().toString(36)}.${'b'.repeat(43)}`;
async function client(t, enabled = true) {
    const window = new Window({ url: 'http://localhost:8000/' });
    t.after(() => window.happyDOM.close());
    window.document.body.innerHTML = `<div class="map"><canvas id="canvas"></canvas></div>
        <select id="mapSelect"><option value="custom">Custom</option><option value="bakurani">Bakurani</option></select>
        <select id="weapon"><option value="spg">SPG</option><option value="mortar">Mortar</option></select>
        <button id="apply"></button><input id="w"><input id="h"><input id="ox"><input id="oy"><input id="tx"><input id="ty">
        <div id="customMapSizing"></div><button id="mapToolUndoButton"></button><button id="mapToolRedoButton"></button>`;
    window.document.querySelector('canvas').getContext = () => ({});
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
        function versionRuntimeAsset(url) {return url;}
        updateMapToolsUI = () => {}; renderSavedTargets = () => {};
        persistSavedTargets(); saveMapToolState(); persistAppSelections(); writeMapPoints();
    `);
    const source = (await readFile(new URL('../../js/collab/lobby.js', import.meta.url), 'utf8'))
        .replace("await import(versionRuntimeAsset(new URL('js/collab/protocol.mjs', BASE_PATH).href))", '__protocol')
        .replace("await import(versionRuntimeAsset(new URL('js/collab/replica.mjs', BASE_PATH).href))", '__replicaModule');
    run(source); await run('initLobby()');
    const click = action => window.document.querySelector(`[data-action="${action}"]`).click();
    const snapshot = (extra = {}) => sockets.at(-1).message({ type: 'snapshot', revision: 0, doc: roomDoc(), you: 'peer-1', roster: [{ id: 'peer-1', name: '' }], maxParticipants: 8, remainingUpdates: 100, expiresAt: Date.now() + 60000, ...extra });
    const tick = () => { for (const [id, timer] of [...timers]) if (!timer.interval && timer.ms <= 1000) { timers.delete(id); timer.fn(); } };
    return { run, window, sockets, requests, click, snapshot, tick };
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
    assert.equal(c.requests.length, 0); assert.equal(c.sockets.length, 0);
});
test('join, drag batching, acknowledged undo and leave preserve personal storage', async t => {
    const c = await client(t);
    const saved = Object.fromEntries(Array.from({ length: c.window.localStorage.length }, (_, i) => { const k = c.window.localStorage.key(i); return [k, c.window.localStorage.getItem(k)]; }));
    c.click('create'); await new Promise(setImmediate);
    assert.equal(c.requests.length, 1);
    assert.deepEqual(JSON.parse(c.requests[0].options.body).doc.savedTargets, []);
    c.snapshot();
    assert.equal(c.run('lobby.active'), true);
    assert.equal(c.run('S.map'), 'bakurani');
    assert.equal(c.window.document.querySelector('#mapSelect').disabled, true);
    c.run('drag = "target"; S.target = {x: 8, y: 8}; inputs();'); c.tick();
    assert.equal(c.sockets[0].sent.filter(m => m.type === 'changes').length, 0);
    c.run('drag = null; lobby.capture();'); c.tick();
    const message = c.sockets[0].sent.find(m => m.type === 'changes');
    assert.equal(message.ops.length, 1); assert.equal(message.ops[0].key, 'target');
    c.sockets[0].message({ ...message, revision: 1, from: 'peer-1', remainingUpdates: 99 });
    assert.equal(c.run('undoMapToolAction()'), true);
    const undo = c.sockets[0].sent.at(-1);
    c.sockets[0].message({ ...undo, revision: 2, from: 'peer-1', remainingUpdates: 98 });
    assert.equal(c.run('S.target.x'), 6);
    c.click('leave');
    assert.equal(c.run('lobby.active'), false);
    assert.equal(c.run('S.map'), 'custom'); assert.equal(c.run('S.weapon'), 'spg'); assert.equal(c.run('S.panX'), 33);
    assert.equal(c.run('savedTargets[0].id'), 'personal'); assert.equal(c.run('MAP_TOOL_STATE.markers[0].id'), 'personal-marker');
    for (const [key, value] of Object.entries(saved)) assert.equal(c.window.localStorage.getItem(key), value, key);
});
test('remote operations during a drag are deferred without discarding local gesture', async t => {
    const c = await client(t); c.click('create'); await new Promise(setImmediate); c.snapshot();
    c.run('drag = "target"; S.target = {x: 9, y: 9}; inputs();');
    c.sockets[0].message({ type: 'changes', id: 'remote', from: 'peer-2', revision: 1, remainingUpdates: 99, ops: [{ key: 'origin', before: { x: 5, y: 5 }, value: { x: 2, y: 2 } }] });
    assert.equal(c.run('S.target.x'), 9);
    c.run('drag = null; lobby.capture();'); c.tick();
    assert.equal(c.run('S.origin.x'), 2); assert.equal(c.run('S.target.x'), 9);
    assert.equal(c.sockets[0].sent.at(-1).ops[0].key, 'target');
});
test('disconnect does not auto-reconnect; rejected changes expose recovery without personal writes', async t => {
    const c = await client(t); c.click('create'); await new Promise(setImmediate); c.snapshot();
    c.run('S.target = {x: 9, y: 9}; inputs();'); c.tick();
    c.snapshot({ rejected: c.sockets[0].sent.at(-1).id, error: 'conflict' });
    assert.equal(c.run('S.target.x'), 6);
    assert.equal(c.window.document.querySelector('.lobby-recovery').hidden, false);
    c.sockets[0].close(); c.tick();
    assert.equal(c.sockets.length, 1);
    assert.match(c.window.document.querySelector('.lobby-status').textContent, /Связь потеряна/);
    c.click('leave'); assert.equal(c.run('S.target.x'), 2);
});
