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
