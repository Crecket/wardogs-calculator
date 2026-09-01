import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const spg = { id: 'spg', minElevationMil: 20, maxElevationMil: 1390 };
const mortar = { id: 'mortar', minElevationMil: 150, maxElevationMil: 850 };
const fits = {
    mortarSingle: { branch: 'high', muzzleVelocity: 86.7, angleOffsetDeg: 52.5, anglePerMilDeg: 0.0375 },
    spgLow: { branch: 'low', muzzleVelocity: 160.1, angleOffsetDeg: 12.75, anglePerMilDeg: 0.058 },
    spgHigh: { branch: 'high', muzzleVelocity: 160.4, angleOffsetDeg: 14.5, anglePerMilDeg: 0.048 }
};

function ctxWith() {
    const ctx = loadRuntime(['js/ballistics/model.js']);
    setRuntimeGlobal(ctx, '__spg', spg);
    setRuntimeGlobal(ctx, '__mortar', mortar);
    setRuntimeGlobal(ctx, '__fits', fits);
    return ctx;
}

test('arcAngleStops keeps the valid half of the envelope per branch', () => {
    const ctx = ctxWith();
    const low = callRuntime(ctx, 'arcAngleStops(__spg, __fits.spgLow)');
    assert.ok(Math.abs(low.minRadians * 180 / Math.PI - 13.91) < 0.01);
    assert.ok(Math.abs(low.maxRadians * 180 / Math.PI - 45) < 1e-9);
    const high = callRuntime(ctx, 'arcAngleStops(__spg, __fits.spgHigh)');
    assert.ok(Math.abs(high.minRadians * 180 / Math.PI - 45) < 1e-9);
    assert.ok(Math.abs(high.maxRadians * 180 / Math.PI - 81.22) < 0.01);
    const single = callRuntime(ctx, 'arcAngleStops(__mortar, __fits.mortarSingle)');
    assert.ok(Math.abs(single.minRadians * 180 / Math.PI - 58.125) < 1e-9);
    assert.ok(Math.abs(single.maxRadians * 180 / Math.PI - 84.375) < 1e-9);
});

test('arcMaxRangeModel clamps the optimal angle into the achievable stops', () => {
    const ctx = ctxWith();
    assert.ok(Math.abs(callRuntime(ctx, 'arcMaxRangeModel(__spg, __fits.spgHigh, 0)') - 2622.6) < 0.1);
    assert.ok(Math.abs(callRuntime(ctx, 'arcMaxRangeModel(__spg, __fits.spgLow, 0)') - 2612.8) < 0.1);
    assert.ok(Math.abs(callRuntime(ctx, 'arcMaxRangeModel(__mortar, __fits.mortarSingle, 0)') - 687.2) < 0.1);
    assert.ok(Math.abs(callRuntime(ctx, 'arcMaxRangeModel(__mortar, __fits.mortarSingle, -100)') - 744.4) < 1);
});

test('arcMinRangeModel evaluates the binding stop per branch', () => {
    const ctx = ctxWith();
    assert.ok(Math.abs(callRuntime(ctx, 'arcMinRangeModel(__spg, __fits.spgHigh, 0)') - 791.3) < 0.1);
    assert.ok(Math.abs(callRuntime(ctx, 'arcMinRangeModel(__spg, __fits.spgLow, 0)') - 1219.3) < 0.5);
    assert.ok(Math.abs(callRuntime(ctx, 'arcMinRangeModel(__mortar, __fits.mortarSingle, 0)') - 149.5) < 0.5);
    assert.ok(Math.abs(callRuntime(ctx, 'arcMinRangeModel(__spg, __fits.spgHigh, -200)') - 821.0) < 0.5);
});

test('modelArcTanForMil converts a mil through the fit and rejects out-of-quadrant angles', () => {
    const ctx = ctxWith();
    assert.ok(Math.abs(callRuntime(ctx, 'modelArcTanForMil(__fits.spgLow, 20)') - 0.2477) < 0.001);
    assert.equal(callRuntime(ctx, 'modelArcTanForMil(__fits.spgLow, 1390)'), null);
});
