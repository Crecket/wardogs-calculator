/*
 * Gun ops against a running `wrangler dev`.
 *
 *   npm run dev          # in sync/, one shell
 *   npm run test:guns    # in sync/, another
 *
 * The last section is the one that matters most: it proves a client that
 * knows nothing about guns can share a room with one that does.
 */

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

const settle = () => new Promise(r => setTimeout(r, 250));

/*
 * A relayed op arrives wrapped: { type: 'op', from, op: { op: 'gun.add' … } }.
 */
function relayed(ws, name) {
    return ws.inbox.filter(m => m.type === 'op' && m.op?.op === name);
}

function docOf(ws) {
    const message = ws.inbox.find(m => m.type === 'snapshot' || m.doc);
    return message?.doc || message;
}

function gun(overrides = {}) {
    return {
        id: 'gun-alpha',
        name: 'Gun 1',
        x: 40,
        y: 41,
        weapon: 'mortar',
        ...overrides
    };
}

const created = await fetch(`${BASE}/room`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mapId: 'bakurani' })
}).then(r => r.json());

const code = created.code;
const a = await open(code);
const b = await open(code);
await settle();
drain(a); drain(b);

/* --- the three ops --- */

a.send(JSON.stringify({ op: 'gun.add', gun: gun() }));
await settle();

check('gun.add is relayed to the other peer',
    relayed(b, 'gun.add').some(m => m.op.gun.id === 'gun-alpha'));

check('gun.add strips unknown fields',
    !('visible' in (relayed(b, 'gun.add')[0]?.op.gun || {})));

drain(a); drain(b);
a.send(JSON.stringify({ op: 'gun.move', id: 'gun-alpha', x: 50, y: 51 }));
await settle();

check('gun.move is relayed',
    relayed(b, 'gun.move').some(m => m.op.x === 50 && m.op.y === 51));

/*
 * A rename or weapon change reuses gun.add, and the client sends the gun's
 * whole current state — position included — so the upsert carries 50/51
 * rather than resetting the move above.
 */
drain(a); drain(b);
a.send(JSON.stringify({
    op: 'gun.add',
    gun: gun({ name: 'Renamed', weapon: 'spg', x: 50, y: 51 })
}));
await settle();

check('gun.add upserts a rename and weapon change',
    relayed(b, 'gun.add').some(
        m => m.op.gun.name === 'Renamed' && m.op.gun.weapon === 'spg'
    ));

/* --- the snapshot carries guns --- */

const c = await open(code);
await settle();

const doc = docOf(c);

check('a joiner sees the gun in its snapshot',
    Array.isArray(doc.guns) && doc.guns.length === 1
        && doc.guns[0].id === 'gun-alpha');

check('the snapshot gun kept the upserted values',
    doc.guns[0].name === 'Renamed' && doc.guns[0].x === 50);

/* --- validation --- */

drain(a);
a.send(JSON.stringify({ op: 'gun.add', gun: gun({ id: 'bad id!' }) }));
await settle();

check('a bad id is rejected',
    a.inbox.some(m => m.type === 'error' && m.code === 'bad-id'));

drain(a);
a.send(JSON.stringify({ op: 'gun.add', gun: gun({ weapon: 'not a slug!' }) }));
await settle();

check('a bad weapon slug is rejected',
    a.inbox.some(m => m.type === 'error' && m.code === 'bad-slug'));

drain(a);
a.send(JSON.stringify({ op: 'gun.add', gun: gun({ x: 1e9 }) }));
await settle();

check('an out-of-bounds coordinate is rejected',
    a.inbox.some(m => m.type === 'error' && m.code === 'bad-coordinate'));

drain(a);
a.send(JSON.stringify({ op: 'gun.add', gun: null }));
await settle();

check('a missing gun body is rejected',
    a.inbox.some(m => m.type === 'error' && m.code === 'bad-gun'));

/* --- the cap --- */

drain(a);
for (let i = 0; i < 12; i += 1) {
    a.send(JSON.stringify({ op: 'gun.add', gun: gun({ id: `gun-cap-${i}` }) }));
}
await settle();

const d = await open(code);
await settle();
const capped = docOf(d).guns;

check('the gun cap holds at 8', capped.length === 8, `got ${capped.length}`);

/* --- remove and clear --- */

drain(a); drain(b);
a.send(JSON.stringify({ op: 'gun.remove', id: 'gun-cap-0' }));
await settle();

check('gun.remove is relayed',
    relayed(b, 'gun.remove').some(m => m.op.id === 'gun-cap-0'));

drain(a);
a.send(JSON.stringify({ op: 'gun.remove', id: 'gun-nonexistent' }));
await settle();

check('removing an absent gun is rejected rather than relayed',
    a.inbox.some(m => m.type === 'error' && m.code === 'rejected'));

drain(a);
a.send(JSON.stringify({ op: 'clear', scope: 'all' }));
await settle();

const e = await open(code);
await settle();
const cleared = docOf(e).guns;

check('clear all removes the guns', cleared.length === 0);

/* --- push --- */

drain(a);
a.send(JSON.stringify({
    op: 'push',
    drawings: [],
    markers: [],
    targets: [],
    guns: [gun({ id: 'gun-pushed' })]
}));
await settle();

const f = await open(code);
await settle();
const pushed = docOf(f).guns;

check('push seeds guns', pushed.some(g => g.id === 'gun-pushed'));

drain(a);
a.send(JSON.stringify({
    op: 'push',
    drawings: [], markers: [], targets: [],
    guns: Array.from({ length: 20 }, (_, i) => gun({ id: `gun-big-${i}` }))
}));
await settle();

check('an oversized push is rejected',
    a.inbox.some(m => m.type === 'error' && m.code === 'too-large'));

/* --- THE COEXISTENCE PROOF --- */

/*
 * `old` stands in for a cached client that predates guns: it never sends a
 * gun op and, like collab.js's `default: break`, ignores any it receives.
 * The requirement is that gun traffic costs it nothing.
 */
const old = await open(code);
const modern = await open(code);
await settle();
drain(old); drain(modern);

modern.send(JSON.stringify({ op: 'gun.add', gun: gun({ id: 'gun-modern' }) }));
modern.send(JSON.stringify({ op: 'gun.move', id: 'gun-modern', x: 12, y: 13 }));
await settle();

check('the old client is sent no error by gun traffic',
    !old.inbox.some(m => m.type === 'error'));

check('the old client\'s socket stayed open',
    old.readyState === 1);

drain(old); drain(modern);
old.send(JSON.stringify({ op: 'point.set', point: 'origin', x: 5, y: 6 }));
await settle();

check('the old client can still set the legacy origin',
    !old.inbox.some(m => m.type === 'error')
        && relayed(modern, 'point.set').some(
            m => m.op.point === 'origin' && m.op.x === 5
        ));

drain(old);
old.send(JSON.stringify({ op: 'point.set', point: 'target', x: 7, y: 8 }));
await settle();

check('the old client can still set the target',
    !old.inbox.some(m => m.type === 'error'));

const g = await open(code);
await settle();
const finalDoc = docOf(g);

check('legacy origin and guns coexist in one document',
    finalDoc.origin?.x === 5 && finalDoc.guns.some(x => x.id === 'gun-modern'));

for (const socket of [a, b, c, d, e, f, old, modern, g]) {
    try { socket.close(); } catch { /* already gone */ }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
