import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const model = {
    schema: 'wardogs-projectile-model-v2',
    weapons: {
        spg: {
            low: { branch: 'low', muzzleVelocity: 262.4, dragPerMeter: 0.00039, angleOffsetDeg: 2.254, anglePerMilDeg: 0.05625 },
            high: { branch: 'high', muzzleVelocity: 262.4, dragPerMeter: 0.00039, angleOffsetDeg: 2.254, anglePerMilDeg: 0.05625 }
        }
    }
};

const spg = {
    id: 'spg', minRange: 0.78, maxRange: 2.629, minElevationMil: 35, maxElevationMil: 1390,
    ballistics: { low: [[822, 35], [2639, 630]], high: [[815, 1390], [2638, 640]] }
};

function flatProfile(distanceMeters) {
    return {
        ground: new Float64Array(212),
        gunIndex: 10,
        targetIndex: 201,
        distanceMeters,
        stepMeters: distanceMeters / 191
    };
}

function sectionCtx() {
    const ctx = loadRuntime(
        [
            'js/ballistics/model.js',
            'js/ballistics/reachability.js',
            'js/map/cross-section.js'
        ],
        {
            tr: key => key,
            $: () => null,
            RANGE_RING_MARCH_METRES: 25,
            rangeRingSample: () => 0,
            isMapLayerVisible: () => false
        }
    );
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', model);
    setRuntimeGlobal(ctx, '__spg', spg);
    setRuntimeGlobal(ctx, '__profile', flatProfile(917));
    return ctx;
}

test('the 800 m SPG shot is drawn as a tooClose overshoot on both arcs, never a green hit', () => {
    const ctx = sectionCtx();
    setRuntimeGlobal(ctx, '__near', flatProfile(800));
    const low = callRuntime(ctx, 'crossSectionShot(__spg, "low", __near)');
    assert.equal(low.status, 'tooClose');
    assert.equal(low.kind, 'over');
    assert.equal(callRuntime(ctx, '__low = crossSectionShot(__spg, "low", __near); crossSectionShotCaption(__low)'), 'crossSectionOver');
    const high = callRuntime(ctx, 'crossSectionShot(__spg, "high", __near)');
    assert.equal(high.status, 'tooClose');
    assert.equal(high.kind, 'over');
});

test('the 917 m SPG shot hits on both arcs', () => {
    const ctx = sectionCtx();
    const low = callRuntime(ctx, 'crossSectionShot(__spg, "low", __profile)');
    assert.equal(low.status, 'hit');
    assert.equal(low.kind, 'hit');
    const high = callRuntime(ctx, 'crossSectionShot(__spg, "high", __profile)');
    assert.equal(high.status, 'hit');
    assert.equal(high.kind, 'hit');
    assert.equal(callRuntime(ctx, '__high = crossSectionShot(__spg, "high", __profile); crossSectionShotCaption(__high)'), null);
});

test('beyond the anchored maximum the arc is tooFar and captioned short', () => {
    const ctx = sectionCtx();
    setRuntimeGlobal(ctx, '__far', flatProfile(2700));
    const far = callRuntime(ctx, 'crossSectionShot(__spg, "high", __far)');
    assert.equal(far.status, 'tooFar');
    assert.equal(far.kind, 'short');
    assert.ok(far.impactMeters < 2700);
});

test('the shared verdict, not the drawing march, decides blocked versus hit', () => {
    const ctx = sectionCtx();

    const ridged = flatProfile(917);
    for (let i = 100; i < 120; i += 1) {
        ridged.ground[i] = 2000;
    }
    setRuntimeGlobal(ctx, '__ridged', ridged);

    const own = callRuntime(ctx, 'crossSectionShot(__spg, "high", __ridged)');
    assert.equal(own.masked, true);
    assert.equal(own.kind, 'blocked');

    const clear = callRuntime(ctx, `(() => {
        const shared = assessArc(__spg, 'high', 917, 0);
        shared.masked = false;
        return crossSectionShot(__spg, 'high', __ridged, shared);
    })()`);
    assert.equal(clear.masked, false);
    assert.equal(clear.kind, 'hit');
    assert.equal(clear.endIndex, ridged.targetIndex);

    const blocked = callRuntime(ctx, `(() => {
        const shared = assessArc(__spg, 'high', 917, 0);
        shared.masked = true;
        return crossSectionShot(__spg, 'high', __profile, shared);
    })()`);
    assert.equal(blocked.masked, true);
    assert.equal(blocked.kind, 'blocked');
});

test('the ceiling-capped table sliver draws honest model shortfall, not a mask', () => {
    const ctx = sectionCtx();
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', {
        schema: 'wardogs-projectile-model-v2',
        weapons: { toy: { low: { branch: 'low', muzzleVelocity: 100, dragPerMeter: 0, angleOffsetDeg: 0, anglePerMilDeg: 0.05 } } }
    });
    setRuntimeGlobal(ctx, '__toy', {
        id: 'toy', minRange: 0.1, maxRange: 1.1, minElevationMil: 200, maxElevationMil: 1600,
        ballistics: { low: [[100, 200], [1100, 800]] }
    });
    setRuntimeGlobal(ctx, '__edge', flatProfile(1050));
    const low = callRuntime(ctx, 'crossSectionShot(__toy, "low", __edge)');
    assert.equal(low.status, 'hit');
    assert.equal(low.ceilingCapped, true);
    assert.equal(low.masked, false);
    assert.equal(low.kind, 'short');
    assert.ok(Math.abs(low.shortfallMeters - 30) < 8, String(low.shortfallMeters));
});
