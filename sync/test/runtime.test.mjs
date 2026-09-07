import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
const origin = 'http://localhost:8000';
const document = () => ({ mapId: 'bakurani', w: 16, h: 16, weapon: 'mortar', origin: { x: 5, y: 5 }, target: { x: 6, y: 6 }, drawings: [], markers: [], zones: [], polygons: [], savedTargets: [] });
async function runtime(t, overrides = {}, env = {}) {
    const result = await build({
        entryPoints: [fileURLToPath(new URL('../src/index.mjs', import.meta.url))], bundle: true, write: false,
        format: 'esm', platform: 'browser', external: ['cloudflare:workers'], logLevel: 'silent',
        plugins: [{ name: 'test-config', setup(b) {
            b.onLoad({ filter: /config[\\/]app\.json$/ }, async args => {
                const config = JSON.parse(await readFile(args.path, 'utf8'));
                config.collab = { ...config.collab, ...overrides };
                return { contents: JSON.stringify(config), loader: 'json' };
            });
        } }]
    });
    const mf = new Miniflare({
        modules: true, script: result.outputFiles[0].text, compatibilityDate: '2026-04-07',
        durableObjects: { ROOMS: { className: 'LobbyRoom', useSQLite: true }, BUDGET: { className: 'LobbyBudget', useSQLite: true } },
        bindings: { LOBBIES_DEV: 'true', ROOM_SECRET: 'local-test-secret-with-at-least-32-characters', ...env }
    });
    t.after(() => mf.dispose());
    return mf;
}
const create = (mf, doc = document(), headers = {}) => mf.dispatchFetch('https://lobby.test/rooms', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ doc }) });
async function join(mf, code) {
    const response = await mf.dispatchFetch(`https://lobby.test/rooms/${code}`, { headers: { Origin: origin, Upgrade: 'websocket' } });
    if (response.status !== 101) return { status: response.status };
    const ws = response.webSocket;
    const queue = [], waiters = [];
    ws.addEventListener('message', event => {
        const msg = event.data === 'pong' ? 'pong' : JSON.parse(event.data);
        const index = waiters.findIndex(w => w.predicate(msg));
        if (index >= 0) { const w = waiters.splice(index, 1)[0]; clearTimeout(w.timer); w.resolve(msg); }
        else queue.push(msg);
    });
    ws.accept();
    return { status: 101, ws, send: msg => ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)), next: (predicate = () => true) => {
        const index = queue.findIndex(predicate);
        if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
        return new Promise((resolve, reject) => {
            const w = { predicate, resolve, timer: setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error('WebSocket message timeout')); }, 5000) };
            waiters.push(w);
        });
    } };
}
test('Worker disabled switch and origin check are enforced server-side', async t => {
    const mf = await runtime(t, {}, { LOBBIES_DEV: 'false' });
    assert.equal((await create(mf)).status, 503);
    assert.equal((await create(mf, document(), { Origin: 'https://evil.test' })).status, 403);
});
test('environment kill switch overrides enabled site config', async t => {
    const mf = await runtime(t, { enabled: true }, { LOBBIES_DISABLED: 'true' });
    assert.equal((await create(mf)).status, 503);
});
test('room admission limit, initial state, heartbeat and late-join state', async t => {
    const mf = await runtime(t, { maxParticipants: 2 });
    const response = await create(mf); assert.equal(response.status, 201);
    const { code } = await response.json();
    const a = await join(mf, code), b = await join(mf, code);
    assert.equal(a.status, 101); assert.equal(b.status, 101);
    assert.deepEqual((await a.next(m => m.type === 'snapshot')).doc, document());
    await b.next(m => m.type === 'snapshot');
    assert.equal((await join(mf, code)).status, 409);
    a.send('ping'); assert.equal(await a.next(m => m === 'pong'), 'pong');
    const ops = [{ key: 'target', before: { x: 6, y: 6 }, value: { x: 8, y: 8 } }];
    a.send({ type: 'changes', id: 'one', ops });
    assert.equal((await a.next(m => m.type === 'changes')).revision, 1);
    assert.equal((await b.next(m => m.type === 'changes')).revision, 1);
    b.ws.close(1000, 'left');
    await a.next(m => m.type === 'peers' && m.roster.length === 1);
    const c = await join(mf, code); assert.equal(c.status, 101);
    assert.deepEqual((await c.next(m => m.type === 'snapshot')).doc.target, { x: 8, y: 8 });
});
test('conflicts, write cap and host-only close are enforced', async t => {
    const mf = await runtime(t, { maxChangeBatchesPerRoom: 1 });
    const { code, ownerKey } = await (await create(mf)).json();
    const a = await join(mf, code); await a.next(m => m.type === 'snapshot');
    a.send({ type: 'changes', id: 'one', ops: [{ key: 'target', before: { x: 6, y: 6 }, value: { x: 8, y: 8 } }] });
    assert.equal((await a.next(m => m.type === 'changes')).remainingUpdates, 0);
    a.send({ type: 'changes', id: 'two', ops: [{ key: 'target', before: { x: 6, y: 6 }, value: { x: 9, y: 9 } }] });
    assert.equal((await a.next(m => m.type === 'snapshot')).error, 'conflict');
    a.send({ type: 'changes', id: 'three', ops: [{ key: 'target', before: { x: 8, y: 8 }, value: { x: 9, y: 9 } }] });
    assert.equal((await a.next(m => m.type === 'snapshot')).error, 'room-budget');
    a.send({ type: 'close', ownerKey: 'wrong' });
    assert.equal((await a.next(m => m.type === 'error')).code, 'not-owner');
    a.send({ type: 'close', ownerKey }); await a.next(m => m.type === 'closed');
    assert.equal((await join(mf, code)).status, 404);
});
test('daily creation cap and malformed input; random invitations fail before admission', async t => {
    const mf = await runtime(t, { maxRoomsPerDay: 1 });
    assert.equal((await create(mf)).status, 201);
    assert.equal((await create(mf)).status, 429);
    assert.equal((await join(mf, 'random')).status, 404);
    assert.equal((await create(mf, { ...document(), markers: [null] })).status, 400);
    const bad = await mf.dispatchFetch('https://lobby.test/rooms', { method: 'POST', headers: { Origin: origin }, body: '{' });
    assert.equal(bad.status, 400);
});
test('global write credits conservatively stop new rooms after daily allowance is reserved', async t => {
    const mf = await runtime(t, { maxChangeBatchesPerDay: 32 });
    const codeA = (await (await create(mf)).json()).code;
    const codeB = (await (await create(mf)).json()).code;
    const a = await join(mf, codeA), b = await join(mf, codeB);
    await a.next(m => m.type === 'snapshot'); await b.next(m => m.type === 'snapshot');
    const msg = { type: 'changes', id: 'one', ops: [{ key: 'target', before: { x: 6, y: 6 }, value: { x: 9, y: 9 } }] };
    a.send(msg); await a.next(m => m.type === 'changes');
    b.send(msg); assert.equal((await b.next(m => m.type === 'snapshot')).error, 'daily-budget');
});
