/*
 * End-to-end smoke test against a running `wrangler dev`.
 *
 *   npm run dev            # in one shell
 *   npm run test:smoke     # in another
 *
 * Exercises the real workerd runtime rather than mocks, because the parts
 * most likely to break here — hibernation handler wiring, SQL cursor
 * semantics, WebSocket upgrade plumbing — are exactly what a mock papers over.
 */

const PORT = process.env.SYNC_PORT || '8799';
const BASE = `http://localhost:${PORT}`;
const WS = `ws://localhost:${PORT}`;

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

function open(code) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`${WS}/room/${code}`);
        ws.inbox = [];
        ws.addEventListener('message', e => {
            ws.inbox.push(JSON.parse(e.data));
        });
        ws.addEventListener('open', () => resolve(ws));
        ws.addEventListener('error', reject);
        setTimeout(() => reject(new Error('open timeout')), 5000);
    });
}

/*
 * Sockets accumulate acks and relayed ops that a given assertion does not
 * care about. Drain between sections so a stale message cannot satisfy the
 * next predicate and shift every result by one.
 */
function drain(ws) {
    ws.inbox.length = 0;
}

async function next(ws, predicate = () => true, ms = 3000) {
    const deadline = Date.now() + ms;

    for (;;) {
        const found = ws.inbox.findIndex(predicate);

        if (found !== -1) {
            return ws.inbox.splice(found, 1)[0];
        }

        if (Date.now() > deadline) {
            throw new Error('message timeout');
        }

        await new Promise(r => setTimeout(r, 20));
    }
}

const drawing = id => ({
    id,
    mapId: 'bakurani',
    color: '#d7a452',
    points: [{ x: 1, y: 1 }, { x: 2, y: 2 }]
});

console.log('\n== room creation ==');
const created = await fetch(`${BASE}/room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapId: 'bakurani' })
});
const room = await created.json();
check('201 created', created.status === 201, created.status);
check('12-char code', /^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/.test(room.code), room.code);
check('echoes mapId', room.mapId === 'bakurani');

const badMap = await fetch(`${BASE}/room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapId: '../../etc/passwd' })
});
check('rejects bad mapId', badMap.status === 400, badMap.status);

console.log('\n== joining ==');
const a = await open(room.code);
const snapA = await next(a, m => m.type === 'snapshot');
check('snapshot on connect', snapA.type === 'snapshot');
check('snapshot has mapId', snapA.doc.mapId === 'bakurani');
check('snapshot empty', snapA.doc.drawings.length === 0 && snapA.doc.markers.length === 0);
check('reports limits', snapA.limits.peers === 16, JSON.stringify(snapA.limits));

let unknownFailed = false;
try {
    await open('zzzzzzzzzzzz');
} catch {
    unknownFailed = true;
}
check('unknown code refused', unknownFailed);

let badShapeFailed = false;
try {
    await open('SHORT');
} catch {
    badShapeFailed = true;
}
check('malformed code refused', badShapeFailed);

console.log('\n== op relay ==');
const b = await open(room.code);
await next(b, m => m.type === 'snapshot');
const peers = await next(a, m => m.type === 'peers');
check('peer count broadcast', peers.count === 2, peers.count);

console.log('\n== roster ==');
check('snapshot lists the joiner itself',
    Array.isArray(snapA.roster) &&
    snapA.roster.length === 1 &&
    snapA.roster[0].id === snapA.you &&
    snapA.roster[0].name === null,
    JSON.stringify(snapA.roster));
check('peers frame carries a roster',
    Array.isArray(peers.roster) &&
    peers.roster.length === peers.count &&
    peers.roster.some(entry => entry.id === snapA.you),
    JSON.stringify(peers.roster));

drain(a);
b.send(JSON.stringify({ type: 'name', name: `Gunner\u0007${'x'.repeat(60)}` }));
const named = await next(a, m => m.type === 'peers');
const bEntry = named.roster.find(entry => entry.id !== snapA.you);
check('a rename reaches the roster', bEntry.name.startsWith('Gunner'), JSON.stringify(named.roster));
check('roster name is cleaned and capped',
    bEntry.name.length <= 24 && !/[\u0000-\u001f\u007f]/.test(bEntry.name),
    JSON.stringify(bEntry.name));
check('a name frame is not acked', !a.inbox.some(m => m.type === 'ack'), JSON.stringify(a.inbox));

drain(a);
const ghost = await open(room.code);
const snapGhost = await next(ghost, m => m.type === 'snapshot');
const joined = await next(a, m => m.type === 'peers');
check('a third peer is listed', joined.roster.some(entry => entry.id === snapGhost.you), JSON.stringify(joined.roster));

drain(a);
ghost.close();
const left = await next(a, m => m.type === 'peers');
check('a departed peer leaves the roster',
    left.count === 2 &&
    left.roster.length === 2 &&
    !left.roster.some(entry => entry.id === snapGhost.you),
    JSON.stringify(left));

console.log('\n== peer views ==');
check('snapshot advertises the view frame',
    Array.isArray(snapA.features) && snapA.features.includes('view'),
    JSON.stringify(snapA.features));

drain(a);
drain(b);
a.send(JSON.stringify({ type: 'view', x: 40.5, y: -12.25, zoom: 2.5 }));
const view = await next(b, m => m.type === 'view');
check('view reaches the peer',
    view.x === 40.5 && view.y === -12.25 && view.zoom === 2.5, JSON.stringify(view));
check('view is stamped with the server-side id', view.from === snapA.you, view.from);

await new Promise(r => setTimeout(r, 250));
check('view is not echoed to the sender', !a.inbox.some(m => m.type === 'view'), JSON.stringify(a.inbox));
check('view is not acked', !a.inbox.some(m => m.type === 'ack'), JSON.stringify(a.inbox));

drain(b);
a.send(JSON.stringify({
    type: 'view', x: 1, y: 2, zoom: 1, from: 'somebody-else', name: 'Scout', evil: 'payload'
}));
const cleanView = await next(b, m => m.type === 'view');
check('a claimed id and extra fields are stripped',
    cleanView.from === snapA.you &&
    cleanView.evil === undefined &&
    cleanView.name === undefined,
    JSON.stringify(cleanView));

drain(a);
const viewRejects = [
    ['view without a zoom', { type: 'view', x: 1, y: 1 }, 'bad-zoom'],
    ['zero zoom', { type: 'view', x: 1, y: 1, zoom: 0 }, 'bad-zoom'],
    ['absurd zoom', { type: 'view', x: 1, y: 1, zoom: 1e9 }, 'bad-zoom'],
    ['NaN view coordinate', { type: 'view', x: 'abc', y: 1, zoom: 1 }, 'bad-coordinate']
];

for (const [label, frame, expected] of viewRejects) {
    a.send(JSON.stringify(frame));
    const res = await next(a, m => m.type === 'error');
    check(label, res.code === expected, JSON.stringify(res));
}

drain(a);
for (let i = 0; i < 120; i++) {
    a.send(JSON.stringify({ type: 'view', x: i % 40, y: 1, zoom: 1 + (i % 3) }));
}
await new Promise(r => setTimeout(r, 250));
check('a view flood never says rate-limited',
    !a.inbox.some(m => m.type === 'error' && m.code === 'rate-limited'),
    JSON.stringify(a.inbox.slice(0, 3)));

a.send(JSON.stringify({ op: 'point.set', point: 'target', x: 3, y: 4 }));
check('an op right after a view flood is still accepted',
    (await next(a, m => m.type === 'ack' || m.type === 'error')).type === 'ack');

drain(a);
drain(b);
const viewer = await open(room.code);
const snapViewer = await next(viewer, m => m.type === 'snapshot');
check('views never enter the document',
    !JSON.stringify(snapViewer.doc).toLowerCase().includes('view') &&
    !JSON.stringify(snapViewer.doc).includes('zoom'),
    JSON.stringify(snapViewer.doc));
viewer.close();
await next(a, m => m.type === 'peers');

drain(a);
drain(b);

a.send(JSON.stringify({ op: 'drawing.add', drawing: drawing('d1') }));
const relayed = await next(b, m => m.type === 'op');
check('drawing relayed to peer', relayed.op.op === 'drawing.add' && relayed.op.drawing.id === 'd1');
check('sender got ack', (await next(a, m => m.type === 'ack')).type === 'ack');

a.send(JSON.stringify({ op: 'marker.add', marker: { id: 'm1', mapId: 'bakurani', icon: 'medic', x: 3, y: 4 } }));
check('marker relayed', (await next(b, m => m.op?.op === 'marker.add')).op.marker.icon === 'medic');

a.send(JSON.stringify({ op: 'point.set', point: 'origin', x: 7.5, y: 8.5 }));
check('point.set relayed', (await next(b, m => m.op?.op === 'point.set')).op.x === 7.5);

a.send(JSON.stringify({ op: 'target.add', target: { id: 't1', name: 'Bravo', x: 1, y: 2, saveArtillery: false } }));
check('target relayed', (await next(b, m => m.op?.op === 'target.add')).op.target.name === 'Bravo');

console.log('\n== late joiner sees state ==');
const c = await open(room.code);
const snapC = await next(c, m => m.type === 'snapshot');
check('late snapshot has drawing', snapC.doc.drawings.length === 1);
check('late snapshot has marker', snapC.doc.markers.length === 1);
check('late snapshot has target', snapC.doc.savedTargets.length === 1);
check('late snapshot has origin', snapC.doc.origin?.x === 7.5, JSON.stringify(snapC.doc.origin));

drain(a);
drain(b);
console.log('\n== removal is exactly-once ==');
a.send(JSON.stringify({ op: 'drawing.remove', id: 'd1' }));
check('remove relayed', (await next(b, m => m.op?.op === 'drawing.remove')).op.op === 'drawing.remove');
b.send(JSON.stringify({ op: 'drawing.remove', id: 'd1' }));
const dup = await next(b, m => m.type === 'error' || m.type === 'ack');
check('duplicate remove rejected', dup.type === 'error' && dup.code === 'rejected', JSON.stringify(dup));

drain(a);
console.log('\n== undo re-add keeps id ==');
a.send(JSON.stringify({ op: 'drawing.add', drawing: drawing('d1') }));
check('re-add accepted', (await next(a, m => m.type === 'ack' || m.type === 'error')).type === 'ack');

drain(a);
drain(b);
console.log('\n== validation ==');
const rejects = [
    ['non-object op', { op: 'drawing.add', drawing: 'nope' }, 'bad-drawing'],
    ['bad color', { op: 'drawing.add', drawing: { ...drawing('d9'), color: 'red' } }, 'bad-color'],
    ['bad id charset', { op: 'drawing.add', drawing: { ...drawing('d9'), id: 'a b/c' } }, 'bad-id'],
    ['NaN coordinate', { op: 'point.set', point: 'origin', x: 'abc', y: 1 }, 'bad-coordinate'],
    ['huge coordinate', { op: 'point.set', point: 'origin', x: 1e9, y: 1 }, 'bad-coordinate'],
    ['single-point path', { op: 'drawing.add', drawing: { ...drawing('d9'), points: [{ x: 1, y: 1 }] } }, 'bad-drawing'],
    ['bad point kind', { op: 'point.set', point: 'elbow', x: 1, y: 1 }, 'bad-point-kind'],
    ['unknown op', { op: 'nuke' }, 'unknown-op'],
    ['bad icon slug', { op: 'marker.add', marker: { id: 'm9', icon: '../x', x: 1, y: 1 } }, 'bad-slug'],
    ['empty name', { op: 'target.rename', id: 't1', name: '   ' }, 'bad-name']
];

for (const [label, op, expected] of rejects) {
    a.send(JSON.stringify(op));
    const res = await next(a, m => m.type === 'error' || m.type === 'ack');
    check(label, res.type === 'error' && res.code === expected, JSON.stringify(res));
}

a.send('{not json');
check('bad json rejected', (await next(a, m => m.type === 'error')).code === 'bad-json');

a.send(JSON.stringify({
    op: 'drawing.add',
    drawing: { ...drawing('big'), color: '#ffffff' },
    pad: 'x'.repeat(70000)
}));
check('oversized message rejected', (await next(a, m => m.type === 'error')).code === 'too-large');

drain(a);
drain(b);
console.log('\n== rebroadcast is canonical, not caller-supplied ==');
a.send(JSON.stringify({
    op: 'marker.add',
    marker: { id: 'm2', mapId: 'bakurani', icon: 'medic', x: 1, y: 1, evil: 'payload' }
}));
const canon = await next(b, m => m.op?.op === 'marker.add' && m.op.marker.id === 'm2');
check('extra fields stripped', canon.op.marker.evil === undefined, JSON.stringify(canon.op.marker));

drain(a);
/*
 * Before the rate-limit burst, deliberately: that section leaves a long
 * backlog of queued frames on this socket, and an auto-response is
 * delivered in order behind them.
 */
console.log('\n== heartbeat ==');

/*
 * The exact frame is what the room's setWebSocketAutoResponse matches, so
 * this asserts the string the client sends and the string the runtime
 * answers stay in step. A pong here does not prove the room stayed asleep,
 * only that the contract is intact.
 */
a.send('{"type":"ping"}');
check('auto-response answers the canonical ping', (await next(a, m => m.type === 'pong')).type === 'pong');

drain(a);
a.send(JSON.stringify({ type: 'ping', extra: 1 }));
check('a non-matching ping still gets the handler', (await next(a, m => m.type === 'pong')).type === 'pong');

drain(a);
drain(b);
console.log('\n== rate limiting ==');
for (let i = 0; i < 120; i++) {
    a.send(JSON.stringify({ op: 'point.set', point: 'target', x: i % 50, y: 1 }));
}
const limited = await next(a, m => m.type === 'error' && m.code === 'rate-limited', 5000)
    .catch(() => null);
check('burst gets rate-limited', limited !== null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
