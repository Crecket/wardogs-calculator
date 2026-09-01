import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const model = {
    schema: 'wardogs-projectile-model-v1',
    weapons: {
        mortar: { single: { branch: 'high', muzzleVelocity: 86.7, angleOffsetDeg: 52.5, anglePerMilDeg: 0.0375 } },
        spg: {
            low: { branch: 'low', muzzleVelocity: 160.1, angleOffsetDeg: 12.75, anglePerMilDeg: 0.058 },
            high: { branch: 'high', muzzleVelocity: 160.4, angleOffsetDeg: 14.5, anglePerMilDeg: 0.048 }
        }
    }
};

const spg = {
    id: 'spg', minRange: 0.78, maxRange: 2.629, minElevationMil: 20, maxElevationMil: 1390,
    ballistics: { low: [[1181, 20], [2629, 600]], high: [[735, 1400], [2629, 610]] }
};

const mortar = {
    id: 'mortar', minRange: 0.132, maxRange: 0.684, minElevationMil: 150, maxElevationMil: 850,
    ballistics: { single: [[80, 950], [697, 120]] }
};

function ctxWith() {
    const ctx = loadRuntime(['js/ballistics/model.js', 'js/ballistics/reachability.js']);
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', model);
    setRuntimeGlobal(ctx, '__spg', spg);
    setRuntimeGlobal(ctx, '__mortar', mortar);
    return ctx;
}

test('arcDeclaredRange intersects the weapon gates with the table coverage', () => {
    const ctx = ctxWith();
    assert.deepEqual(JSON.parse(callRuntime(ctx, 'JSON.stringify(arcDeclaredRange(__spg, "low"))')), { minMeters: 1181, maxMeters: 2629 });
    assert.deepEqual(JSON.parse(callRuntime(ctx, 'JSON.stringify(arcDeclaredRange(__spg, "high"))')), { minMeters: 780, maxMeters: 2629 });
    assert.deepEqual(JSON.parse(callRuntime(ctx, 'JSON.stringify(arcDeclaredRange(__mortar, "single"))')), { minMeters: 132, maxMeters: 684 });
});

test('the 917 m SPG shot: low arc is tooClose, high arc hits', () => {
    const ctx = ctxWith();
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "low", 917, 0).status'), 'tooClose');
    const high = callRuntime(ctx, 'assessArc(__spg, "high", 917, 0)');
    assert.equal(high.status, 'hit');
    assert.equal(high.tableRow, true);
});

test('anchored gates shift with deltaZ', () => {
    const ctx = ctxWith();
    assert.equal(callRuntime(ctx, 'assessArc(__mortar, "single", 690, 0).status'), 'tooFar');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "high", 800, -200).status'), 'tooClose');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "high", 800, 100).status'), 'hit');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "high", 2600, 200).status'), 'tooFar');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "low", 2600, 200).status'), 'tooFar');
});

test('the table edge stays a hit and the beyond-table window is modelled', () => {
    const ctx = ctxWith();
    const edge = callRuntime(ctx, 'assessArc(__spg, "low", 2620, 0)');
    assert.equal(edge.status, 'hit');
    assert.equal(edge.tableRow, true);
    assert.equal(edge.ceilingCapped, true);
    assert.ok(Number.isFinite(edge.tan));
    assert.equal(edge.mil, null);
    const beyond = callRuntime(ctx, 'assessArc(__spg, "high", 2650, -100)');
    assert.equal(beyond.status, 'hit');
    assert.equal(beyond.tableRow, false);
    assert.ok(Number.isFinite(beyond.mil));
});

test('a table-covered row is never envelope-refused despite fit noise', () => {
    const ctx = ctxWith();
    const row = callRuntime(ctx, 'assessArc(__spg, "low", 1181, 0)');
    assert.equal(row.status, 'hit');
    assert.equal(row.tableRow, true);
});

test('a modelled mil outside the envelope is refused', () => {
    const ctx = ctxWith();
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', {
        schema: 'wardogs-projectile-model-v1',
        weapons: { toy: { low: { branch: 'low', muzzleVelocity: 100, angleOffsetDeg: 0, anglePerMilDeg: 0.05 } } }
    });
    setRuntimeGlobal(ctx, '__toy', { id: 'toy', minRange: 0.1, maxRange: 10, minElevationMil: 200, maxElevationMil: 1600, ballistics: {} });
    assert.equal(callRuntime(ctx, 'assessArc(__toy, "low", 200, 0).status'), 'belowMinElevation');
    assert.equal(callRuntime(ctx, 'assessArc(__toy, "low", 900, 0).status'), 'hit');
});
