/*
 * Exercises the node-side view of the projectile model on values checked
 * by hand, so a regression here can be told apart from a regression in the
 * data that supplies its parameters.
 *
 * Run with: npm run test:scripts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    GRAVITY,
    MODEL_SCHEMA,
    fitArc,
    flightTimeAtMil,
    launchTan,
    maxRangeMeters,
    milCorrection,
    milFromTan,
    missMeters,
    rangeAtMil,
    rangeForTan
} from './ballistics.mjs';

const SPG_HIGH = {
    branch: 'high',
    muzzleVelocity: 262.4,
    dragPerMeter: 0.00039,
    angleOffsetDeg: 2.254,
    anglePerMilDeg: 0.05625
};

const SPG_LOW = { ...SPG_HIGH, branch: 'low' };

const MORTAR = {
    branch: 'high',
    muzzleVelocity: 86.7,
    dragPerMeter: 0,
    angleOffsetDeg: 52.5,
    anglePerMilDeg: 0.0375
};

const close = (actual, expected, tolerance = 1e-6) =>
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `${actual} is not within ${tolerance} of ${expected}`
    );

test('gravity and schema come from the runtime', () => {
    assert.equal(GRAVITY, 9.81);
    assert.equal(MODEL_SCHEMA, 'wardogs-projectile-model-v2');
});

test('45 degrees gives the vacuum maximum range', () => {
    close(rangeForTan(100, 1), 10000 / 9.81, 1e-9);
});

test('milFromTan inverts the affine mil mapping', () => {
    const t = Math.tan((2.254 + 0.05625 * 700) * Math.PI / 180);

    close(milFromTan(SPG_HIGH, t), 700, 1e-6);
});

test('launchTan lands on the range it was solved for', () => {
    for (const [arcModel, range, dz] of [[SPG_LOW, 1800, 0], [SPG_HIGH, 1800, 0], [SPG_HIGH, 1500, 200], [MORTAR, 400, -50]]) {
        const tan = launchTan(arcModel, range, dz);
        const mil = milFromTan(arcModel, tan);

        close(rangeAtMil(arcModel, mil, dz), range, 0.05);
    }
});

test('flat ground needs exactly zero correction', () => {
    assert.equal(milCorrection(SPG_HIGH, 1800, 0), 0);
    assert.equal(milCorrection(SPG_LOW, 1800, 0), 0);
    assert.equal(milCorrection(MORTAR, 400, 0), 0);
});

test('uphill lowers mil on a high-branch arc and raises it on the low branch', () => {
    assert.ok(milCorrection(SPG_HIGH, 1800, 100) < -5);
    assert.ok(milCorrection(MORTAR, 400, 100) < -30);
    assert.ok(milCorrection(SPG_LOW, 1800, 100) > 5);
});

test('downhill raises mil on a high-branch arc', () => {
    assert.ok(milCorrection(SPG_HIGH, 1800, -100) > 5);
    assert.ok(milCorrection(MORTAR, 400, -100) > 20);
});

/*
 * The mortar carries no drag term, so its corrections must match the
 * vacuum closed form the grid used to be computed from.
 */
test('a drag-free arc reproduces the vacuum closed form', () => {
    const v = MORTAR.muzzleVelocity;

    const vacuumTan = (range, dz) => {
        const k = GRAVITY * range * range / (2 * v * v);
        const root = Math.sqrt(range * range - 4 * k * (dz + k));

        return (range + root) / (2 * k);
    };

    const vacuumMil = tan =>
        (Math.atan(tan) * 180 / Math.PI - MORTAR.angleOffsetDeg) / MORTAR.anglePerMilDeg;

    for (const [range, dz] of [[400, 100], [400, -100], [200, 25], [600, -200]]) {
        const expected = vacuumMil(vacuumTan(range, dz)) - vacuumMil(vacuumTan(range, 0));

        close(milCorrection(MORTAR, range, dz), expected, 0.15);
    }

    close(maxRangeMeters(MORTAR, 0), v * v / GRAVITY, 0.05);
});

test('miss distance is short uphill and long downhill', () => {
    assert.ok(missMeters(SPG_HIGH, 1800, 100) > 10);
    assert.ok(missMeters(SPG_HIGH, 1800, -100) < -10);
    assert.ok(missMeters(MORTAR, 400, 100) > 10);
});

test('short-range mortar miss falls under the suppression threshold', () => {
    assert.ok(missMeters(MORTAR, 200, 25) < 10);
});

test('a low arc cannot reach above its own apex', () => {
    assert.equal(missMeters(SPG_LOW, 900, 100), null);
});

test('maxRangeMeters lengthens downhill and shortens uphill', () => {
    const level = maxRangeMeters(SPG_HIGH, 0);

    close(level, 2638.6, 0.1);
    assert.ok(maxRangeMeters(SPG_HIGH, -200) > level);
    assert.ok(maxRangeMeters(SPG_HIGH, 200) < level);
});

test('maxRangeMeters is the boundary launchTan refuses to cross', () => {
    for (const deltaZ of [-400, -100, 0, 100, 300]) {
        const limit = maxRangeMeters(SPG_HIGH, deltaZ);

        assert.ok(
            launchTan(SPG_HIGH, limit * 0.999, deltaZ) !== null,
            `inside the limit at deltaZ ${deltaZ} should solve`
        );

        assert.equal(
            launchTan(SPG_HIGH, limit * 1.001, deltaZ),
            null,
            `outside the limit at deltaZ ${deltaZ} should not solve`
        );
    }
});

test('maxRangeMeters returns null above the ballistic ceiling and for unusable input', () => {
    assert.equal(maxRangeMeters(SPG_HIGH, 5000), null);
    assert.equal(maxRangeMeters(SPG_HIGH, NaN), null);
    assert.equal(maxRangeMeters({ ...SPG_HIGH, muzzleVelocity: 0 }, 0), null);
});

test('drag shortens the flight against a vacuum shot of the same launch', () => {
    const vacuum = { ...SPG_HIGH, dragPerMeter: 0 };

    assert.ok(rangeAtMil(SPG_HIGH, 600) < rangeAtMil(vacuum, 600) * 0.5);
    assert.ok(flightTimeAtMil(SPG_HIGH, 600) < flightTimeAtMil(vacuum, 600));
    close(flightTimeAtMil(SPG_HIGH, 600), 23.43, 0.4);
});

/*
 * A table generated FROM the model must fit back to the model's own
 * parameters. This is the only test of fitArc that does not depend on the
 * shipped tables, so it isolates the search from the data.
 */
test('fitArc recovers parameters from a synthetic table', () => {
    const truth = {
        muzzleVelocity: 160,
        angleOffsetDeg: 14.5,
        anglePerMilDeg: 0.048
    };

    const rows = [];

    for (let mil = 700; mil <= 1300; mil += 10) {
        const deg = truth.angleOffsetDeg + truth.anglePerMilDeg * mil;
        const t = Math.tan(deg * Math.PI / 180);

        rows.push([Math.round(rangeForTan(truth.muzzleVelocity, t)), mil]);
    }

    const fit = fitArc(rows, 'high');

    assert.ok(fit.rmsMeters < 1, `RMS ${fit.rmsMeters} should be under 1 m`);
    close(fit.angleOffsetDeg, truth.angleOffsetDeg, 0.3);
    close(fit.anglePerMilDeg, truth.anglePerMilDeg, 0.001);
    close(fit.muzzleVelocity, truth.muzzleVelocity, 1);
    assert.equal(fit.dragPerMeter, 0);
});

test('fitArc reports the branch it was given', () => {
    const rows = [[822, 35], [850, 40], [901, 50]];

    assert.equal(fitArc(rows, 'low').branch, 'low');
});
