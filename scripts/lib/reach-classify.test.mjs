import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const model = {
    schema: 'wardogs-projectile-model-v1',
    weapons: {
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

function badgeCtx(field) {
    const ctx = loadRuntime(
        [
            'js/map/heightfield.js',
            'js/ballistics/model.js',
            'js/ballistics/reachability.js',
            'js/features/reach-badges.js'
        ],
        {
            tr: key => key,
            $: () => null,
            setText: () => {},
            S: { map: 'm', guns: [] },
            getCoordinateMetersPerUnit: () => 100,
            RANGE_RING_CACHE: new Map(),
            DEAD_GROUND_CACHE: new Map(),
            rangeRingMemoKey: () => 'k',
            deadGroundArcs: () => null,
            terrainDeadGround: () => null
        }
    );
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', model);
    setRuntimeGlobal(ctx, 'WEAPONS', { spg });
    setRuntimeGlobal(ctx, 'cachedHeightfield', () => field);
    setRuntimeGlobal(ctx, 'mapHasHeightfield', () => true);
    setRuntimeGlobal(ctx, 'ensureHeightfieldLoaded', () => {});
    callRuntime(ctx, `rangeRingSample = (field, x, y) => heightfieldSample(
        field,
        Math.min(field.originX + (field.width - 1) * field.stepGameUnits, Math.max(field.originX, x)),
        Math.min(field.originY + (field.height - 1) * field.stepGameUnits, Math.max(field.originY, y))
    )`);
    return ctx;
}

const flat = {
    heights: new Float32Array(40 * 3),
    width: 40, height: 3, originX: 0, originY: 0, stepGameUnits: 1, minZMeters: 0
};

test('reachClassify mirrors the assessShot verdict', () => {
    const ctx = badgeCtx(flat);
    setRuntimeGlobal(ctx, '__gun', { gun: { position: { x: 1, y: 1 }, weapon: 'spg' } });
    assert.equal(callRuntime(ctx, 'reachClassify(__gun, { x: 10, y: 1 })'), 'reachable');
    assert.equal(callRuntime(ctx, 'reachClassify(__gun, { x: 29, y: 1 })'), 'out');
    assert.equal(callRuntime(ctx, 'reachClassify(__gun, { x: 5, y: 1 })'), 'close');
    assert.equal(callRuntime(ctx, 'reachClassify(__gun, { x: 200, y: 1 })'), 'unknown');
});

test('reachClassify is pending while the heightfield loads', () => {
    const ctx = badgeCtx(null);
    setRuntimeGlobal(ctx, '__gun', { gun: { position: { x: 1, y: 1 }, weapon: 'spg' } });
    assert.equal(callRuntime(ctx, 'reachClassify(__gun, { x: 10, y: 1 })'), 'pending');
});
