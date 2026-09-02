import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const model = {
    schema: 'wardogs-projectile-model-v2',
    weapons: {
        mortar: { single: { branch: 'high', muzzleVelocity: 86.7, dragPerMeter: 0, angleOffsetDeg: 52.5, anglePerMilDeg: 0.0375 } },
        spg: {
            low: { branch: 'low', muzzleVelocity: 262.4, dragPerMeter: 0.00039, angleOffsetDeg: 2.254, anglePerMilDeg: 0.05625 },
            high: { branch: 'high', muzzleVelocity: 262.4, dragPerMeter: 0.00039, angleOffsetDeg: 2.254, anglePerMilDeg: 0.05625 }
        }
    }
};

const mortar = {
    id: 'mortar', minRange: 0.132, maxRange: 0.684, minElevationMil: 150, maxElevationMil: 850,
    ballistics: { single: [[80, 950], [697, 120]] }
};

const spg = {
    id: 'spg', minRange: 0.78, maxRange: 2.629, minElevationMil: 35, maxElevationMil: 1390,
    ballistics: { low: [[822, 35], [2639, 630]], high: [[815, 1390], [2638, 640]] }
};

function deadGroundCtx() {
    const ctx = loadRuntime(
        ['js/ballistics/model.js', 'js/ballistics/reachability.js', 'js/map/dead-ground.js'],
        { RANGE_RING_MARCH_METRES: 25, RANGE_RING_CACHE: new Map(), getCoordinateMetersPerUnit: () => 100 }
    );
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', model);
    setRuntimeGlobal(ctx, '__mortar', mortar);
    setRuntimeGlobal(ctx, '__spg', spg);
    return ctx;
}

test('dead ground is solved from the low arc alone', () => {
    const ctx = deadGroundCtx();

    const arcs = callRuntime(ctx, 'deadGroundArcs("spg")');

    assert.ok(Array.isArray(arcs) && arcs.length === 1);
    assert.equal(arcs[0].name, 'low');
});

test('a 250 m ridge at 1500 m casts spg dead ground from the ridge outward', () => {
    const ctx = deadGroundCtx();

    const count = 104;
    const ranges = Array.from({ length: count }, (v, i) => 25 * (i + 1));
    const deltas = ranges.map(r => (r === 1500 ? 250 : 0));

    setRuntimeGlobal(ctx, '__ranges', Float64Array.from(ranges));
    setRuntimeGlobal(ctx, '__deltas', Float64Array.from(deltas));

    const intervals = callRuntime(
        ctx,
        `deadGroundBearingIntervals(__spg, deadGroundArcs("spg"), __ranges, __deltas, ${count}, 822)`
    );

    assert.ok(intervals.length >= 2, String(intervals));
    assert.ok(intervals[0] > 1450 && intervals[0] <= 1550, String(intervals[0]));
});

test('flat ground casts no spg dead ground', () => {
    const ctx = deadGroundCtx();

    const count = 104;
    setRuntimeGlobal(ctx, '__ranges', Float64Array.from({ length: count }, (v, i) => 25 * (i + 1)));
    setRuntimeGlobal(ctx, '__deltas', new Float64Array(count));

    const intervals = callRuntime(
        ctx,
        `deadGroundBearingIntervals(__spg, deadGroundArcs("spg"), __ranges, __deltas, ${count}, 822)`
    );

    assert.equal(intervals.length, 0);
});

test('a weapon with no low arc gets no dead ground at all', () => {
    const ctx = deadGroundCtx();

    assert.equal(callRuntime(ctx, 'deadGroundArcs("mortar")'), null);

    const count = 26;
    const ranges = Array.from({ length: count }, (v, i) => 25 * (i + 1));

    setRuntimeGlobal(ctx, '__ranges', Float64Array.from(ranges));
    setRuntimeGlobal(ctx, '__deltas', Float64Array.from(ranges.map(r => (r === 500 ? 250 : 0))));

    const intervals = callRuntime(
        ctx,
        `deadGroundBearingIntervals(__mortar, deadGroundArcs("mortar"), __ranges, __deltas, ${count}, 132)`
    );

    assert.equal(intervals.length, 0);
});
