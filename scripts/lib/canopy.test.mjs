/*
 * Pins down how a tile patch becomes a tree cell, and how tree cells lift
 * the heightfield the clearance march reads.
 *
 * Run with: npm run test:scripts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    CANOPY_FRACTION,
    CANOPY_MEAN_MAX,
    CANOPY_METRES,
    CANOPY_STD_MIN,
    isCanopy,
    patchStats,
    raiseCanopy
} from './canopy.mjs';

test('dark and rough is canopy; dark and smooth is a road, bright is a field', () => {
    assert.equal(isCanopy(CANOPY_MEAN_MAX - 1, CANOPY_STD_MIN), true);
    assert.equal(isCanopy(CANOPY_MEAN_MAX - 1, CANOPY_STD_MIN - 1), false);
    assert.equal(isCanopy(CANOPY_MEAN_MAX, CANOPY_STD_MIN + 10), false);
    assert.equal(isCanopy(200, 50), false);
});

test('patch stats are the mean and spread of the luminance', () => {
    const stats = patchStats([10, 10, 30, 30]);

    assert.equal(stats.mean, 20);
    assert.equal(stats.std, 10);
});

test('an empty patch is not canopy and does not divide by zero', () => {
    const stats = patchStats([]);

    assert.equal(stats.mean, 0);
    assert.equal(stats.std, 0);
});

function flatField() {
    return {
        heights: new Float32Array(4).fill(100),
        width: 2,
        height: 2,
        originX: 0,
        originY: 0,
        stepGameUnits: 0.32
    };
}

/*
 * A canopy grid four times finer than the field, so each 32 m field cell
 * covers sixteen 8 m canopy cells, the same ratio as the shipped rasters.
 * The origins put a field sample point at the centre of its four by four
 * block of canopy cells: field (0, 0) sits under canopy columns 0 to 3 and
 * rows 4 to 7, since canopy rows count from the north.
 */
function canopyGrid(fill) {
    const cells = new Uint8Array(64);

    fill(cells, index => index % 8, index => Math.floor(index / 8));

    return {
        cells,
        grid: {
            width: 8,
            height: 8,
            originX: -0.12,
            originY: 0.44,
            stepX: 0.08,
            stepY: 0.08
        }
    };
}

test('a field cell under thick wood rises by the canopy height', () => {
    const field = flatField();
    const canopy = canopyGrid(cells => cells.fill(1));

    const raised = raiseCanopy(field, canopy);

    assert.equal(raised, 4);

    for (const height of field.heights) {
        assert.equal(height, 100 + CANOPY_METRES);
    }
});

test('a field cell with a lone tree in it stays on the ground', () => {
    const field = flatField();
    const canopy = canopyGrid(cells => { cells[0] = 1; });

    assert.equal(raiseCanopy(field, canopy), 0);
    assert.equal(field.heights[0], 100);
});

test('the wood has to cover the thick fraction of the cell, and only that cell rises', () => {
    const field = flatField();
    const needed = Math.ceil(CANOPY_FRACTION * 16);

    const canopy = canopyGrid((cells, col, row) => {
        let planted = 0;

        for (let i = 0; i < cells.length && planted < needed; i += 1) {
            if (col(i) < 4 && row(i) >= 4) {
                cells[i] = 1;
                planted += 1;
            }
        }
    });

    assert.equal(raiseCanopy(field, canopy), 1);
    assert.equal(field.heights[0], 100 + CANOPY_METRES, 'south-west field cell');
    assert.equal(field.heights[1], 100);
    assert.equal(field.heights[2], 100);
    assert.equal(field.heights[3], 100);
});
