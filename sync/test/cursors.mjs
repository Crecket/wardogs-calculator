
const PORT = process.env.SYNC_PORT || '8799';
const BASE = `http://localhost:${PORT}`;
const WS = `ws://localhost:${PORT}`;

let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
    if (ok) { pass++; console.log(`  ok   ${label}`); }
    else { fail++; console.log(`  FAIL ${label} ${detail}`); }
}

function open(code) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`${WS}/room/${code}`);
        ws.inbox = [];
        ws.addEventListener('message', e => ws.inbox.push(JSON.parse(e.data)));
        ws.addEventListener('open', () => resolve(ws));
        ws.addEventListener('error', reject);
        setTimeout(() => reject(new Error('open timeout')), 5000);
    });
}

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

const settle = () => new Promise(r => setTimeout(r, 250));

const created = await fetch(`${BASE}/room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapId: 'bakurani' })
});
const room = (await created.json()).code;

const a = await open(room);
const snapA = await next(a, m => m.type === 'snapshot');
const b = await open(room);
await next(b, m => m.type === 'snapshot');
await next(a, m => m.type === 'peers');

drain(a);
drain(b);
console.log('\n== relay ==');
a.send(JSON.stringify({ type: 'cursor', x: 12.5, y: -30.25, name: 'Scout' }));
const relayed = await next(b, m => m.type === 'cursor');
check('cursor reaches the peer', relayed.x === 12.5 && relayed.y === -30.25, JSON.stringify(relayed));
check('carries the name', relayed.name === 'Scout', relayed.name);
check('stamped with the server-side id', relayed.from === snapA.you, `${relayed.from} vs ${snapA.you}`);

await settle();
check('not echoed to the sender', !a.inbox.some(m => m.type === 'cursor'), JSON.stringify(a.inbox));
check('not acked', !a.inbox.some(m => m.type === 'ack'), JSON.stringify(a.inbox));

drain(b);
console.log('\n== a claimed id is ignored ==');
a.send(JSON.stringify({ type: 'cursor', x: 1, y: 1, from: 'somebody-else', name: 'Scout' }));
const stamped = await next(b, m => m.type === 'cursor');
check('cannot spoof another peer', stamped.from === snapA.you, stamped.from);

drain(b);
console.log('\n== pointer gone ==');
a.send(JSON.stringify({ type: 'cursor', gone: true }));
const gone = await next(b, m => m.type === 'cursor');
check('gone relayed without a position', gone.gone === true && gone.x === undefined, JSON.stringify(gone));

drain(a);
drain(b);
console.log('\n== untrusted fields ==');
a.send(JSON.stringify({
    type: 'cursor',
    x: 2,
    y: 3,
    name: `bad\nname${'x'.repeat(200)}`,
    color: '#000000',
    evil: 'payload'
}));
const cleaned = await next(b, m => m.type === 'cursor');
check('name is capped', cleaned.name.length <= 24, `${cleaned.name.length}`);
check('control characters stripped', !/[\u0000-\u001f]/.test(cleaned.name), JSON.stringify(cleaned.name));
check('extra fields stripped', cleaned.evil === undefined && cleaned.color === undefined, JSON.stringify(cleaned));

drain(a);
drain(b);
console.log('\n== malformed frames ==');
const rejects = [
    ['NaN coordinate', { type: 'cursor', x: 'abc', y: 1 }, 'bad-coordinate'],
    ['huge coordinate', { type: 'cursor', x: 1e9, y: 1 }, 'bad-coordinate'],
    ['missing coordinates', { type: 'cursor' }, 'bad-coordinate']
];

for (const [label, frame, expected] of rejects) {
    a.send(JSON.stringify(frame));
    const res = await next(a, m => m.type === 'error');
    check(label, res.code === expected, JSON.stringify(res));
}

check('socket survived the malformed frames', a.readyState === WebSocket.OPEN, a.readyState);

drain(a);
a.send(JSON.stringify({ op: 'point.set', point: 'origin', x: 4, y: 5 }));
check('ops still work after a rejected cursor', (await next(a, m => m.type === 'ack' || m.type === 'error')).type === 'ack');

drain(a);
drain(b);
console.log('\n== nothing is stored ==');
for (let i = 0; i < 30; i++) {
    a.send(JSON.stringify({ type: 'cursor', x: i, y: i, name: 'Scout' }));
}
await settle();

const c = await open(room);
const snapC = await next(c, m => m.type === 'snapshot');
check('no cursors in a fresh snapshot',
    !JSON.stringify(snapC.doc).toLowerCase().includes('cursor') &&
    !JSON.stringify(snapC.doc).includes('Scout'),
    JSON.stringify(snapC.doc));
check('snapshot shape unchanged',
    Object.keys(snapC.doc).sort().join(',') ===
    'drawings,guns,mapId,markers,origin,savedTargets,target,weapon',
    Object.keys(snapC.doc).sort().join(','));

drain(a);
console.log('\n== cursor flood does not spend the op budget ==');
for (let i = 0; i < 200; i++) {
    a.send(JSON.stringify({ type: 'cursor', x: i % 40, y: 1, name: 'Scout' }));
}
await settle();
check('flooding cursors never says rate-limited',
    !a.inbox.some(m => m.type === 'error'),
    JSON.stringify(a.inbox.slice(0, 3)));

a.send(JSON.stringify({ op: 'point.set', point: 'target', x: 9, y: 9 }));
check('an op right after the flood is still accepted',
    (await next(a, m => m.type === 'ack' || m.type === 'error')).type === 'ack');

for (const socket of [a, b, c]) {
    try { socket.close(); } catch {  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
