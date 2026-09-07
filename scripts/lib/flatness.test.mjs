/*
 * Pins down the tilt arithmetic: a plane of known slope reads that slope
 * whatever direction it faces, symmetric noise about a plane does not move
 * the answer, and the band edges land where the 8 degree warning does.
 *
 * Run with: npm run test:scripts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    TILT_BAND_EDGES,
    TILT_LIMIT_BAND,
    planeTiltDegrees,
    tiltBand
} from './flatness.mjs';

const SPACING = 2;
const SIZE = 5;

/*
 * A perfect plane over a 5x5 stencil. Columns run west to east and rows run
 * north to south, so a positive perEast raises the ground to the east and a
 * positive perNorth raises it to the north.
 */
function plane(perEast, perNorth, base = -900) {
    const samples = new Float64Array(SIZE * SIZE);
    const centre = (SIZE - 1) / 2;

    for (let row = 0; row < SIZE; row += 1) {
        for (let col = 0; col < SIZE; col += 1) {
            samples[row * SIZE + col] =
                base +
                (col - centre) * SPACING * perEast +
                (centre - row) * SPACING * perNorth;
        }
    }

    return samples;
}

const degrees = radians => radians * 180 / Math.PI;
const tangent = deg => Math.tan(deg * Math.PI / 180);

test('level ground reads zero degrees', () => {
    assert.equal(planeTiltDegrees(plane(0, 0), SPACING), 0);
});

test('a ten degree ramp reads ten degrees whichever way it faces', () => {
    const g = tangent(10);

    for (const [east, north] of [[g, 0], [-g, 0], [0, g], [0, -g]]) {
        assert.ok(
            Math.abs(planeTiltDegrees(plane(east, north), SPACING) - 10) < 1e-9,
            `${east},${north}`
        );
    }
});

test('a diagonal plane reads the magnitude of its gradient, not one axis', () => {
    const g = tangent(10);
    const expected = degrees(Math.atan(Math.hypot(g, g)));

    assert.ok(
        Math.abs(planeTiltDegrees(plane(g, g), SPACING) - expected) < 1e-9
    );
});

test('the fit is least squares, so noise on points opposite the centre cancels', () => {
    const clean = plane(tangent(6), tangent(3));
    const noisy = Float64Array.from(clean);

    /*
     * Each pair sits opposite through the centre of the stencil, so equal
     * bumps contribute equal and opposite terms to both gradient sums.
     */
    noisy[0] += 5;
    noisy[SIZE * SIZE - 1] += 5;
    noisy[SIZE * 2] += 3;
    noisy[SIZE * 2 + 4] += 3;

    assert.ok(
        Math.abs(
            planeTiltDegrees(noisy, SPACING) - planeTiltDegrees(clean, SPACING)
        ) < 1e-9
    );
});

test('spacing scales the gradient, so the same heights over twice the ground are half as steep', () => {
    const heights = plane(tangent(20), 0);

    const near = planeTiltDegrees(heights, SPACING);
    const far = planeTiltDegrees(heights, SPACING * 2);

    assert.ok(Math.abs(Math.tan(far * Math.PI / 180) * 2 - Math.tan(near * Math.PI / 180)) < 1e-9);
});

test('the bands are anchored on the eight degree warning', () => {
    assert.deepEqual(TILT_BAND_EDGES, [2, 4, 6, 8]);
    assert.equal(TILT_LIMIT_BAND, 4);

    assert.equal(tiltBand(0), 0);
    assert.equal(tiltBand(1.999), 0);
    assert.equal(tiltBand(2), 1);
    assert.equal(tiltBand(3.999), 1);
    assert.equal(tiltBand(4), 2);
    assert.equal(tiltBand(5.999), 2);
    assert.equal(tiltBand(6), 3);
    assert.equal(tiltBand(7.999), 3);
    assert.equal(tiltBand(8), TILT_LIMIT_BAND);
    assert.equal(tiltBand(90), TILT_LIMIT_BAND);
});

test('unusable input falls into the steepest band rather than reading flat', () => {
    assert.equal(tiltBand(NaN), TILT_LIMIT_BAND);
    assert.equal(tiltBand(null), TILT_LIMIT_BAND);
});
