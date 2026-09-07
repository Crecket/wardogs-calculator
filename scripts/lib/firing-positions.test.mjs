/*
 * Pins down the two pieces of the firing-positions layer that have nothing
 * to do with terrain: where the shots have to land, and where the edge of
 * a viable region is.
 *
 * Run with: npm run test:scripts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    AIM_RING_METRES,
    AIM_RING_POINTS,
    CELL_BOUNDARY,
    CELL_INTERIOR,
    CELL_OUTSIDE,
    aimPoints,
    outlineMask
} from './firing-positions.mjs';

test('each tower contributes its centre and a ring around it', () => {
    const points = aimPoints([{ x: 10, y: 20 }, { x: 30, y: 40 }]);

    assert.equal(points.length, 2 * (1 + AIM_RING_POINTS));
    assert.deepEqual({ ...points[0] }, { x: 10, y: 20 });
    assert.deepEqual({ ...points[1 + AIM_RING_POINTS] }, { x: 30, y: 40 });
});

test('the ring sits at three hundred metres in game units', () => {
    const points = aimPoints([{ x: 0, y: 0 }]);
    const radius = AIM_RING_METRES / 100;

    for (let i = 1; i <= AIM_RING_POINTS; i += 1) {
        assert.ok(
            Math.abs(Math.hypot(points[i].x, points[i].y) - radius) < 1e-12,
            `point ${i}`
        );
    }
});

test('the ring points are evenly spaced and distinct', () => {
    const points = aimPoints([{ x: 0, y: 0 }]).slice(1);

    const bearings = points
        .map(p => (Math.atan2(p.x, p.y) * 180 / Math.PI + 360) % 360)
        .sort((a, b) => a - b);

    for (let i = 0; i < bearings.length; i += 1) {
        assert.ok(
            Math.abs(bearings[i] - i * (360 / AIM_RING_POINTS)) < 1e-9,
            `bearing ${i} was ${bearings[i]}`
        );
    }
});

test('the map decides the scale, so a metre is not assumed to be a hundredth of a unit', () => {
    const points = aimPoints([{ x: 0, y: 0 }], { metresPerGameUnit: 1 });

    assert.ok(
        Math.abs(Math.hypot(points[1].x, points[1].y) - AIM_RING_METRES) < 1e-9
    );
});

test('no towers means no aim points, and every position trivially passes', () => {
    assert.deepEqual(aimPoints([]), []);
});

test('a single viable cell is all edge and no interior', () => {
    const mask = outlineMask([0, 0, 0, 0, 1, 0, 0, 0, 0], 3, 3);

    assert.equal(mask[4], CELL_BOUNDARY);
    assert.equal(mask[0], CELL_OUTSIDE);
    assert.equal(mask.filter(v => v === CELL_INTERIOR).length, 0);
});

test('a solid block has an interior wrapped in a boundary', () => {
    const viable = new Uint8Array(25).fill(1);
    const mask = outlineMask(viable, 5, 5);

    assert.equal(mask[12], CELL_INTERIOR);

    for (const index of [0, 2, 4, 10, 14, 20, 22, 24]) {
        assert.equal(mask[index], CELL_BOUNDARY, `index ${index}`);
    }
});

test('a hole is outlined from the inside', () => {
    const viable = new Uint8Array(25).fill(1);

    viable[12] = 0;

    const mask = outlineMask(viable, 5, 5);

    assert.equal(mask[12], CELL_OUTSIDE);
    assert.equal(mask[7], CELL_BOUNDARY);
    assert.equal(mask[11], CELL_BOUNDARY);
    assert.equal(mask[13], CELL_BOUNDARY);
    assert.equal(mask[17], CELL_BOUNDARY);
});

test('the raster edge counts as an edge, so a region running off the map is still outlined', () => {
    const mask = outlineMask(new Uint8Array(9).fill(1), 3, 3);

    assert.equal(mask.filter(v => v === CELL_INTERIOR).length, 1);
    assert.equal(mask[4], CELL_INTERIOR);
});

test('diagonal neighbours do not keep a cell off the boundary', () => {
    /*
     * A plus shape: the centre has all four orthogonal neighbours and so is
     * interior, while every arm is missing three and is boundary.
     */
    const viable = [0, 1, 0, 1, 1, 1, 0, 1, 0];
    const mask = outlineMask(viable, 3, 3);

    assert.equal(mask[4], CELL_INTERIOR);
    assert.equal(mask[1], CELL_BOUNDARY);
    assert.equal(mask[3], CELL_BOUNDARY);
    assert.equal(mask[5], CELL_BOUNDARY);
    assert.equal(mask[7], CELL_BOUNDARY);
});
