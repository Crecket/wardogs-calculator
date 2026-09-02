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

const spg = { id: 'spg', minRange: 0.78, maxRange: 2.629, range: 2.629, minElevationMil: 20, maxElevationMil: 1390 };
const mortar = { id: 'mortar', minRange: 0.132, maxRange: 0.684, range: 0.684, minElevationMil: 150, maxElevationMil: 850 };

function ringCtx(field) {
    const ctx = loadRuntime(
        ['js/map/heightfield.js', 'js/ballistics/model.js', 'js/ballistics/reachability.js', 'js/map/range-ring.js'],
        { getCoordinateMetersPerUnit: () => 100 }
    );
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', model);
    setRuntimeGlobal(ctx, 'WEAPONS', { spg, mortar });
    setRuntimeGlobal(ctx, '__field', field);
    setRuntimeGlobal(ctx, 'cachedHeightfield', () => field);
    setRuntimeGlobal(ctx, 'ensureHeightfieldLoaded', () => {});
    return ctx;
}

test('weapon reach helpers take the best arc and honour the mortar clamp', () => {
    const ctx = ringCtx(null);
    assert.ok(Math.abs(callRuntime(ctx, 'weaponReachRange(WEAPONS.spg, 0)') - 2622.6) < 0.1);
    assert.ok(Math.abs(callRuntime(ctx, 'weaponReachRange(WEAPONS.mortar, 0)') - 687.2) < 0.1);
    assert.ok(Math.abs(callRuntime(ctx, 'weaponReachRange(WEAPONS.mortar, -100)') - 744.4) < 1);
});

test('a gun at the lowest map height still gets the full declared circle at deltaZ 0', () => {
    const width = 120;
    const height = 120;

    const field = {
        heights: new Float32Array(width * height),
        width,
        height,
        originX: -30,
        originY: -30,
        stepGameUnits: 0.5,
        minZMeters: 0
    };

    const ctx = ringCtx(field);

    const ring = callRuntime(ctx, 'terrainRangeRing({ position: { x: 0, y: 0 }, weapon: "spg" }, "m")');

    assert.ok(ring, 'ring solved');
    assert.ok(Math.abs(ring.radii[0] - 2629) < 1, String(ring.radii[0]));
    assert.ok(Math.abs(ring.radii[90] - 2629) < 1, String(ring.radii[90]));
    assert.equal(ring.minRadii, undefined, 'the min ring is no longer terrain-shaped');
    assert.ok(Math.abs(ring.minRangeMeters - 780) < 1, String(ring.minRangeMeters));
});
