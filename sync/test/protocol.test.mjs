import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../js/collab/protocol.mjs';
import { createReplicaClass } from '../../js/collab/replica.mjs';
const Replica = createReplicaClass(P);
import { mintInvite, verifyInvite } from '../src/tokens.mjs';
const document = () => P.normalizeDocument({ mapId: 'bakurani', w: 16, h: 16, weapon: 'mortar', origin: { x: 5, y: 5 }, target: { x: 6, y: 6 }, drawings: [], markers: [], zones: [], polygons: [], savedTargets: [] });
const change = (key, value, before = document()[key]) => ({ key, before, value });
const marker = id => ({ id, mapId: 'bakurani', icon: 'infantry', x: 4, y: 3 });
test('canonical validation strips unshared fields', () => {
    assert.equal('camera' in P.normalizeDocument({ ...document(), camera: { zoom: 100 } }), false);
    assert.throws(() => P.normalizeDocument({ ...document(), origin: { x: Infinity, y: 1 } }), /bad-coordinate/);
    assert.throws(() => P.normalizeDocument({ ...document(), mapId: '__proto__' }), /bad-id/);
});
test('collection, geometry, duplicate and byte limits', () => {
    assert.throws(() => P.normalizeDocument({ ...document(), markers: Array.from({ length: 129 }, (_, i) => marker(`m${i}`)) }), /too-many/);
    assert.throws(() => P.normalizeDocument({ ...document(), markers: [marker('a'), marker('a')] }), /duplicate-id/);
    assert.throws(() => P.normalizeDocument({ ...document(), zones: [{ id: 'z', mapId: 'bakurani', color: '#d7a452', x: 1, y: 2, radius: -1 }] }), /bad-coordinate/);
    assert.throws(() => P.normalizeDocument({ ...document(), savedTargets: [{ id: 't', name: '\u0001', x: 1, y: 2 }] }), /bad-name/);
    assert.throws(() => P.normalizeDocument({ ...document(), markers: [{ ...marker('a'), mapId: 'custom' }] }), /wrong-map/);
    const drawing = i => ({ id: `d${i}`, mapId: 'bakurani', color: '#d7a452', points: Array.from({ length: 2048 }, () => ({ x: 123.123456, y: 456.123456 })) });
    assert.throws(() => P.normalizeDocument({ ...document(), drawings: [drawing(1), drawing(2)] }), /room-too-large/);
});
test('atomic compare-and-set merges disjoint changes and rejects stale replacement', () => {
    const a = change('origin', { x: 1, y: 2 });
    const b = change('target', { x: 7, y: 8 });
    const after = P.applyOperations(P.applyOperations(document(), [a]), [b]);
    assert.deepEqual(after.origin, a.value);
    assert.deepEqual(after.target, b.value);
    assert.throws(() => P.applyOperations(after, [change('target', { x: 8, y: 9 })]), /conflict/);
    assert.deepEqual(document().origin, { x: 5, y: 5 });
});
test('simultaneous new objects do not clobber one another', () => {
    const a = { key: 'markers', id: 'a', before: null, value: marker('a') };
    const b = { key: 'markers', id: 'b', before: null, value: marker('b') };
    assert.equal(P.applyOperations(P.applyOperations(document(), [a]), [b]).markers.length, 2);
});
test('coalescing sends only final values and eliminates reverted edits', () => {
    const a = change('origin', { x: 1, y: 2 });
    const b = change('origin', { x: 3, y: 4 }, a.value);
    assert.deepEqual(P.coalesceOperations([a], [b]), [{ ...b, before: a.before }]);
    assert.deepEqual(P.coalesceOperations([a], P.invertOperations([a])), []);
});
test('replica acknowledges commits, queues further edits, undo protects teammates', () => {
    const r = new Replica(document());
    const a = change('origin', { x: 1, y: 2 });
    r.edit([a]);
    assert.equal(r.undoStack.length, 0);
    const sent = r.take('one');
    const b = change('origin', { x: 3, y: 4 }, a.value);
    r.edit([b]);
    r.receive({ ...sent, revision: 1 });
    assert.equal(r.undoStack.length, 1);
    assert.deepEqual(r.view().origin, b.value);
    const second = r.take('two'); r.receive({ ...second, revision: 2 });
    const remote = change('origin', { x: 9, y: 9 }, b.value);
    r.receive({ id: 'remote', ops: [remote], revision: 3 });
    assert.throws(() => r.history('undo', 'undo'), /conflict/);
    assert.deepEqual(r.doc.origin, remote.value);
});
test('normal undo and redo operate on own confirmed changes', () => {
    const r = new Replica(document());
    r.edit([change('target', { x: 1, y: 1 })]);
    r.receive({ ...r.take('a'), revision: 1 });
    r.receive({ ...r.history('undo', 'b'), revision: 2 });
    assert.deepEqual(r.doc, document());
    r.receive({ ...r.history('redo', 'c'), revision: 3 });
    assert.deepEqual(r.doc.target, { x: 1, y: 1 });
});
test('rejected operation keeps recovery data and cannot silently replay', () => {
    const r = new Replica(document());
    r.edit([change('target', { x: 8, y: 8 })]); r.take('x');
    const copy = r.snapshot(document(), 5, { rejected: 'x' });
    assert.deepEqual(copy.target, { x: 8, y: 8 });
    assert.equal(r.dirty, false);
    assert.throws(() => r.receive({ revision: 7, ops: [] }), /revision-gap/);
});
test('signed invites reject mutation, random scans, expiry and wrong secret', async () => {
    const secret = 'a'.repeat(64);
    const until = Date.now() + 10000;
    const code = await mintInvite(secret, until);
    assert.equal(await verifyInvite(secret, code), true);
    assert.equal(await verifyInvite('b'.repeat(64), code), false);
    assert.equal(await verifyInvite(secret, code, until), false);
    assert.equal(await verifyInvite(secret, 'random'), false);
    assert.equal(await verifyInvite(secret, code.replace(/^./, code[0] === 'a' ? 'b' : 'a')), false);
});
