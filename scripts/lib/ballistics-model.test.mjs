import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

const spg = { id: 'spg', minElevationMil: 35, maxElevationMil: 1390 };
const mortar = { id: 'mortar', minElevationMil: 150, maxElevationMil: 850 };
const fits = {
    mortarSingle: { branch: 'high', muzzleVelocity: 86.7, dragPerMeter: 0, angleOffsetDeg: 52.5, anglePerMilDeg: 0.0375 },
    spgLow: { branch: 'low', muzzleVelocity: 262.4, dragPerMeter: 0.00039, angleOffsetDeg: 2.254, anglePerMilDeg: 0.05625 },
    spgHigh: { branch: 'high', muzzleVelocity: 262.4, dragPerMeter: 0.00039, angleOffsetDeg: 2.254, anglePerMilDeg: 0.05625 }
};

function ctxWith() {
    const ctx = loadRuntime(['js/ballistics/model.js']);
    setRuntimeGlobal(ctx, '__spg', spg);
    setRuntimeGlobal(ctx, '__mortar', mortar);
    setRuntimeGlobal(ctx, '__fits', fits);
    return ctx;
}

const degrees = radians => radians * 180 / Math.PI;

test('arcAngleStops splits the envelope at the model\'s own maximum-range angle', () => {
    const ctx = ctxWith();
    const low = callRuntime(ctx, 'arcAngleStops(__spg, __fits.spgLow)');
    assert.ok(Math.abs(degrees(low.minRadians) - 4.223) < 0.01);
    assert.ok(Math.abs(degrees(low.maxRadians) - 37.75) < 0.01);
    const high = callRuntime(ctx, 'arcAngleStops(__spg, __fits.spgHigh)');
    assert.ok(Math.abs(degrees(high.minRadians) - 37.75) < 0.01);
    assert.ok(Math.abs(degrees(high.maxRadians) - 80.44) < 0.01);
    const single = callRuntime(ctx, 'arcAngleStops(__mortar, __fits.mortarSingle)');
    assert.ok(Math.abs(degrees(single.minRadians) - 58.125) < 1e-9);
    assert.ok(Math.abs(degrees(single.maxRadians) - 84.375) < 1e-9);
});

test('arcMaxRangeModel clamps the optimal angle into the achievable stops', () => {
    const ctx = ctxWith();
    assert.ok(Math.abs(callRuntime(ctx, 'arcMaxRangeModel(__spg, __fits.spgHigh, 0)') - 2638.6) < 0.1);
    assert.ok(Math.abs(callRuntime(ctx, 'arcMaxRangeModel(__spg, __fits.spgLow, 0)') - 2638.6) < 0.1);
    assert.ok(Math.abs(callRuntime(ctx, 'arcMaxRangeModel(__mortar, __fits.mortarSingle, 0)') - 687.2) < 0.1);
    assert.ok(Math.abs(callRuntime(ctx, 'arcMaxRangeModel(__mortar, __fits.mortarSingle, -100)') - 744.4) < 1);
});

test('arcMinRangeModel evaluates the binding stop per branch', () => {
    const ctx = ctxWith();
    assert.ok(Math.abs(callRuntime(ctx, 'arcMinRangeModel(__spg, __fits.spgHigh, 0)') - 815.3) < 0.1);
    assert.ok(Math.abs(callRuntime(ctx, 'arcMinRangeModel(__spg, __fits.spgLow, 0)') - 822.3) < 0.5);
    assert.ok(Math.abs(callRuntime(ctx, 'arcMinRangeModel(__mortar, __fits.mortarSingle, 0)') - 149.5) < 0.5);
    assert.ok(Math.abs(callRuntime(ctx, 'arcMinRangeModel(__spg, __fits.spgHigh, -200)') - 831.2) < 0.5);
    assert.equal(callRuntime(ctx, 'arcMinRangeModel(__spg, __fits.spgLow, 200)'), null);
});

test('modelArcTanForMil converts a mil through the fit and rejects out-of-quadrant angles', () => {
    const ctx = ctxWith();
    assert.ok(Math.abs(callRuntime(ctx, 'modelArcTanForMil(__fits.spgLow, 35)') - 0.0738) < 0.001);
    assert.equal(callRuntime(ctx, 'modelArcTanForMil(__fits.spgLow, 1600)'), null);
});

test('a fit without a drag term is not a fit', () => {
    const ctx = ctxWith();
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', {
        schema: 'wardogs-projectile-model-v2',
        weapons: { spg: { low: { branch: 'low', muzzleVelocity: 262.4, angleOffsetDeg: 2.254, anglePerMilDeg: 0.05625 } } }
    });
    assert.equal(callRuntime(ctx, 'projectileModelArc("spg", "low")'), null);
});

test('the launch angle solved for a range lands on that range on both branches', () => {
    const ctx = ctxWith();
    for (const [fit, range, dz] of [['spgLow', 1800, 0], ['spgLow', 1500, -150], ['spgHigh', 1800, 0], ['spgHigh', 2000, 120], ['mortarSingle', 400, 60]]) {
        const tan = callRuntime(ctx, `modelArcLaunchTan(__fits.${fit}, ${range}, ${dz})`);
        assert.ok(Number.isFinite(tan), `${fit} ${range} ${dz}`);
        const back = callRuntime(ctx, `modelRangeAtAngle(__fits.${fit}, Math.atan(${tan}), ${dz})`);
        assert.ok(Math.abs(back - range) < 0.05, `${fit} ${range} ${dz} -> ${back}`);
        const height = callRuntime(ctx, `modelShellHeight(__fits.${fit}, ${tan}, ${range})`);
        assert.ok(Math.abs(height - dz) < 0.5, `${fit} ${range} ${dz} height ${height}`);
    }
    assert.ok(callRuntime(ctx, 'modelArcLaunchTan(__fits.spgLow, 1800, 0)') < callRuntime(ctx, 'modelArcLaunchTan(__fits.spgHigh, 1800, 0)'));
    assert.equal(callRuntime(ctx, 'modelArcLaunchTan(__fits.spgHigh, 2700, 0)'), null);
});

test('with no drag the integrator reproduces the vacuum closed form', () => {
    const ctx = ctxWith();
    const v = fits.mortarSingle.muzzleVelocity;
    for (const deg of [60, 70, 80]) {
        const theta = deg * Math.PI / 180;
        const vacuum = v * v * Math.sin(2 * theta) / 9.81;
        const range = callRuntime(ctx, `modelRangeAtAngle(__fits.mortarSingle, ${theta}, 0)`);
        assert.ok(Math.abs(range - vacuum) < 0.05, `${deg} deg: ${range} vs ${vacuum}`);
        const time = callRuntime(ctx, `modelFlightTime(__fits.mortarSingle, Math.tan(${theta}), 0)`);
        assert.ok(Math.abs(time - 2 * v * Math.sin(theta) / 9.81) < 0.01, `${deg} deg time ${time}`);
    }
});

/*
 * The shipped SPH-2 fit against the twelve dials measured at the firing
 * range on 2026-09-02 (docs/firing-range-measurements.md). A regression
 * fence on the model, not on the game: 19.7 m RMS is what the fit
 * achieved, and the 150 mil residual is its known worst case.
 */
test('the shipped SPH-2 fit reproduces the firing-range measurements', () => {
    const model = JSON.parse(readFileSync(join(root, 'data/ballistics/projectile-model.json'), 'utf8'));
    const ctx = ctxWith();
    setRuntimeGlobal(ctx, '__model', model);

    const measured = [
        [150, 1642.5], [200, 1844.3], [300, 2191.7], [450, 2497.6], [600, 2618.8],
        [800, 2511.0], [910, 2368.3], [1000, 2185.4], [1030, 2103.8], [1200, 1604.0], [1300, 1223.9], [1380, 889.9]
    ];

    let squared = 0;

    for (const [mil, range] of measured) {
        const modelled = callRuntime(ctx, `modelRangeAtAngle(__model.weapons.spg.low, Math.atan(modelArcTanForMil(__model.weapons.spg.low, ${mil})), 0)`);
        const error = modelled - range;
        squared += error * error;
        assert.ok(Math.abs(error) < 40, `${mil} mil: ${modelled} vs ${range}`);
    }

    assert.ok(Math.abs(Math.sqrt(squared / measured.length) - 19.7) < 0.3);

    for (const [mil, seconds] of [[600, 23.43], [300, 14.22], [1200, 35.40]]) {
        const time = callRuntime(ctx, `modelFlightTime(__model.weapons.spg.low, modelArcTanForMil(__model.weapons.spg.low, ${mil}), 0)`);
        assert.ok(Math.abs(time - seconds) < 0.4, `${mil} mil: ${time} s vs ${seconds} s`);
    }
});
