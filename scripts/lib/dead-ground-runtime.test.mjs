import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const model = {
    schema: 'wardogs-projectile-model-v1',
    weapons: { mortar: { single: { branch: 'high', muzzleVelocity: 86.7, angleOffsetDeg: 52.5, anglePerMilDeg: 0.0375 } } }
};

const mortar = {
    id: 'mortar', minRange: 0.132, maxRange: 0.684, minElevationMil: 150, maxElevationMil: 850,
    ballistics: { single: [[80, 950], [697, 120]] }
};

test('a 250 m ridge at 500 m casts mortar dead ground from the ridge outward', () => {
    const ctx = loadRuntime(
        ['js/ballistics/model.js', 'js/ballistics/reachability.js', 'js/map/dead-ground.js'],
        { RANGE_RING_MARCH_METRES: 25, RANGE_RING_CACHE: new Map(), getCoordinateMetersPerUnit: () => 100 }
    );
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', model);
    setRuntimeGlobal(ctx, '__mortar', mortar);

    const count = 26;
    const ranges = Array.from({ length: count }, (v, i) => 25 * (i + 1));
    const deltas = ranges.map(r => (r === 500 ? 250 : 0));

    setRuntimeGlobal(ctx, '__ranges', Float64Array.from(ranges));
    setRuntimeGlobal(ctx, '__deltas', Float64Array.from(deltas));

    const arcs = callRuntime(ctx, 'deadGroundArcs("mortar")');
    assert.ok(Array.isArray(arcs) && arcs.length === 1);

    const intervals = callRuntime(
        ctx,
        `deadGroundBearingIntervals(__mortar, deadGroundArcs("mortar"), __ranges, __deltas, ${count}, 132)`
    );

    assert.equal(intervals.length, 2);
    assert.ok(intervals[0] > 450 && intervals[0] < 500, String(intervals[0]));
    assert.equal(intervals[1], 650);
});

test('flat ground casts no mortar dead ground', () => {
    const ctx = loadRuntime(
        ['js/ballistics/model.js', 'js/ballistics/reachability.js', 'js/map/dead-ground.js'],
        { RANGE_RING_MARCH_METRES: 25, RANGE_RING_CACHE: new Map(), getCoordinateMetersPerUnit: () => 100 }
    );
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', model);
    setRuntimeGlobal(ctx, '__mortar', mortar);

    const count = 26;
    setRuntimeGlobal(ctx, '__ranges', Float64Array.from({ length: count }, (v, i) => 25 * (i + 1)));
    setRuntimeGlobal(ctx, '__deltas', new Float64Array(count));

    const intervals = callRuntime(
        ctx,
        `deadGroundBearingIntervals(__mortar, deadGroundArcs("mortar"), __ranges, __deltas, ${count}, 132)`
    );

    assert.equal(intervals.length, 0);
});
