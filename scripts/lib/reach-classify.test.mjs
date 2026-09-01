import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const model = {
    schema: 'wardogs-projectile-model-v1',
    weapons: {
        spg: {
            low: { branch: 'low', muzzleVelocity: 160.1, angleOffsetDeg: 12.75, anglePerMilDeg: 0.058 },
            high: { branch: 'high', muzzleVelocity: 160.4, angleOffsetDeg: 14.5, anglePerMilDeg: 0.048 }
        },
        mortar: {
            single: { branch: 'high', muzzleVelocity: 86.7, angleOffsetDeg: 52.5, anglePerMilDeg: 0.0375 }
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
    setRuntimeGlobal(ctx, 'WEAPONS', { spg, mortar });
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

const ridged = (() => {
    const width = 9;
    const height = 3;
    const heights = new Float32Array(width * height);

    for (let j = 0; j < height; j += 1) {
        heights[j * width + 5] = 250;
    }

    return { heights, width, height, originX: 0, originY: 0, stepGameUnits: 1, minZMeters: 0 };
})();

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

test('reachClassify reads masked from a mortar target behind a blocking crest', () => {
    const ctx = badgeCtx(ridged);
    setRuntimeGlobal(ctx, '__mortarGun', { gun: { position: { x: 0, y: 1 }, weapon: 'mortar' } });
    assert.equal(callRuntime(ctx, 'reachClassify(__mortarGun, { x: 6.5, y: 1 })'), 'masked');
});

test('reachClassify returns null for a non-numeric target', () => {
    const ctx = badgeCtx(flat);
    setRuntimeGlobal(ctx, '__gun', { gun: { position: { x: 1, y: 1 }, weapon: 'spg' } });
    assert.equal(callRuntime(ctx, "reachClassify(__gun, { x: 'a', y: 1 })"), null);
});
