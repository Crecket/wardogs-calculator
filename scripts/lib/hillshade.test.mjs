/*
 * Pins down the hillshade arithmetic: flat ground is uniform, a slope
 * facing the sun is brighter than the same slope turned away, and no
 * sample is ever read from outside the grid.
 *
 * Run with: npm run test:scripts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    computeHillshade,
    neutralShade,
    shadeToGreyAlpha,
    zFactorForRelief
} from './hillshade.mjs';

const OPTIONS = {
    cellSize: 8,
    zFactor: 1,
    azimuth: 315,
    altitude: 45
};

/*
 * Rows run north to south and x runs west to east, so a positive coefficient
 * on either axis means the ground rises in that direction.
 */
function ramp(width, height, perX, perY) {
    const grid = new Float32Array(width * height);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            grid[y * width + x] = x * perX + y * perY;
        }
    }

    return grid;
}

test('a flat grid shades uniformly at the flat-surface value', () => {
    const width = 9;
    const height = 7;

    const shade = computeHillshade(
        new Float32Array(width * height).fill(123.5),
        width,
        height,
        OPTIONS
    );

    const expected = Math.round(neutralShade(OPTIONS.altitude));

    assert.equal(shade.length, width * height);

    for (let i = 0; i < shade.length; i += 1) {
        assert.equal(shade[i], expected, `cell ${i}`);
    }
});

test('a slope facing the sun is brighter than the same slope facing away', () => {
    const width = 11;
    const height = 11;

    /*
     * The sun sits in the north-west, so ground that rises to the south-east
     * faces it and the same gradient reversed turns its back.
     */
    const towards = computeHillshade(
        ramp(width, height, 4, 4),
        width,
        height,
        OPTIONS
    );

    const away = computeHillshade(
        ramp(width, height, -4, -4),
        width,
        height,
        OPTIONS
    );

    const centre = 5 * width + 5;

    assert.ok(
        towards[centre] > away[centre],
        `${towards[centre]} should exceed ${away[centre]}`
    );

    assert.ok(
        towards[centre] > neutralShade(OPTIONS.altitude),
        'a sunward slope should be brighter than flat ground'
    );

    assert.ok(
        away[centre] < neutralShade(OPTIONS.altitude),
        'a slope facing away should be darker than flat ground'
    );

    /*
     * A slope square-on to the light at the sun's own altitude is the
     * brightest thing the model can produce.
     */
    const facing = computeHillshade(
        ramp(width, height, 8, 8),
        width,
        height,
        { ...OPTIONS, zFactor: 1 / Math.SQRT2 }
    );

    assert.equal(facing[centre], 255);
});

test('grid-edge samples do not read out of bounds', () => {
    const width = 6;
    const height = 5;

    /*
     * A plain Array of exactly width * height entries: any index outside it
     * yields undefined, which turns the shade into NaN. A finite result is
     * proof the 3x3 window stayed inside the grid at every edge and corner.
     */
    const grid = Array.from(
        { length: width * height },
        (unused, i) => Math.sin(i) * 40
    );

    const shade = computeHillshade(grid, width, height, OPTIONS);

    for (let i = 0; i < shade.length; i += 1) {
        assert.ok(
            Number.isFinite(shade[i]) && shade[i] >= 0 && shade[i] <= 255,
            `cell ${i} came out as ${shade[i]}`
        );
    }

    /*
     * An edge reads the same gradient the interior would, so a constant
     * slope shades identically everywhere including its own border.
     */
    const uniform = computeHillshade(
        ramp(width, height, 3, -2),
        width,
        height,
        OPTIONS
    );

    for (let i = 1; i < uniform.length; i += 1) {
        assert.equal(uniform[i], uniform[0], `cell ${i}`);
    }
});

test('a grid smaller than its stated size is rejected', () => {
    assert.throws(
        () => computeHillshade(new Float32Array(5), 4, 4, OPTIONS),
        /too small/
    );
});

test('z-exaggeration falls as a map has more relief', () => {
    const bakurani = zFactorForRelief(1077);
    const ozeti = zFactorForRelief(382);

    assert.ok(ozeti > bakurani, `${ozeti} should exceed ${bakurani}`);

    assert.equal(zFactorForRelief(1000), 1);
    assert.equal(zFactorForRelief(10), 4);
    assert.equal(zFactorForRelief(100000), 0.5);
    assert.equal(zFactorForRelief(0), 1);
});

test('flat ground encodes as fully transparent pixels', () => {
    const width = 4;
    const height = 4;

    const shade = computeHillshade(
        new Float32Array(width * height),
        width,
        height,
        OPTIONS
    );

    const pixels = shadeToGreyAlpha(shade, { altitude: OPTIONS.altitude });

    assert.equal(pixels.length, width * height * 2);

    for (let i = 1; i < pixels.length; i += 2) {
        assert.ok(pixels[i] <= 1, `alpha ${pixels[i]} at ${i}`);
    }
});

test('shadow encodes black and highlight encodes white', () => {
    const pixels = shadeToGreyAlpha(
        Uint8Array.from([0, 255]),
        { altitude: 45 }
    );

    assert.equal(pixels[0], 0);
    assert.ok(pixels[1] > 128);
    assert.equal(pixels[2], 255);
    assert.ok(pixels[3] > 0);
});

/*
 * Flat ground shades at 180 out of 255, so an unnormalised delta would give
 * a full highlight barely a quarter of a full shadow's alpha. Both extremes
 * have to land on the same magnitude.
 */
test('a full highlight and a full shadow reach the same alpha', () => {
    for (const altitude of [20, 45, 70]) {
        const pixels = shadeToGreyAlpha(
            Uint8Array.from([0, 255]),
            { altitude }
        );

        assert.equal(pixels[1], 255, `full shadow at ${altitude} degrees`);
        assert.equal(pixels[3], 255, `full highlight at ${altitude} degrees`);
    }
});

test('gain scales both signs by the same factor', () => {
    const shade = Uint8Array.from([60, 220]);

    const plain = shadeToGreyAlpha(shade, { altitude: 45 });
    const doubled = shadeToGreyAlpha(shade, { altitude: 45, gain: 2 });

    assert.equal(doubled[1], Math.min(255, plain[1] * 2));
    assert.equal(doubled[3], Math.min(255, plain[3] * 2));
});
