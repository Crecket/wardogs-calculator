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
    CELL_FALLBACK_BOUNDARY,
    CELL_FALLBACK_INTERIOR,
    CELL_INTERIOR,
    CELL_OUTSIDE,
    FALLBACK_TILT_LIMIT_DEGREES,
    LOW_ARC_MISSABLE_TOWERS,
    MIN_REGION_CELLS,
    TILT_LIMIT_DEGREES,
    aimPoints,
    dropSmallRegions,
    outlineMask,
    parkingMask,
    tierMask
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

test('the smallest region kept is one heightfield cell, not a hull footprint', () => {
    /*
     * 16 cells of 8 m is 1024 m2, which is one 32 m heightfield cell — the
     * grid the clearance verdict was decided on. Anything smaller claims a
     * resolution the evidence behind it does not have.
     */
    assert.equal(MIN_REGION_CELLS, 16);
});

test('an isolated cell is dropped and a large region is kept', () => {
    const viable = new Uint8Array(100);

    viable[0] = 1;

    for (let y = 2; y < 8; y += 1) {
        for (let x = 2; x < 8; x += 1) {
            viable[y * 10 + x] = 1;
        }
    }

    const kept = dropSmallRegions(viable, 10, 10, 16);

    assert.equal(kept[0], 0, 'the speck goes');
    assert.equal(kept[5 * 10 + 5], 1, 'the 36-cell block stays');
    assert.equal(kept.reduce((sum, v) => sum + v, 0), 36);
});

test('a region exactly at the threshold survives and one cell under it does not', () => {
    const square = (side, extra) => {
        const viable = new Uint8Array(64);

        for (let i = 0; i < side * side; i += 1) {
            viable[Math.floor(i / side) * 8 + (i % side)] = 1;
        }

        if (extra) {
            viable[Math.floor((side * side) / side) * 8] = 1;
        }

        return viable;
    };

    /* 4x4 is exactly 16 cells. */
    assert.equal(
        dropSmallRegions(square(4), 8, 8, 16).reduce((s, v) => s + v, 0),
        16
    );

    /* 15 cells: a 4x4 with one corner missing. */
    const short = square(4);
    short[3 * 8 + 3] = 0;

    assert.equal(
        dropSmallRegions(short, 8, 8, 16).reduce((s, v) => s + v, 0),
        0
    );
});

test('regions touch only through their sides, so a diagonal chain is not one region', () => {
    const viable = new Uint8Array(64);

    /* Eight cells on a diagonal: eight regions of one, not one of eight. */
    for (let i = 0; i < 8; i += 1) {
        viable[i * 8 + i] = 1;
    }

    assert.equal(dropSmallRegions(viable, 8, 8, 2).reduce((s, v) => s + v, 0), 0);
});

test('a region running off the raster edge is measured by what is on the raster', () => {
    const viable = new Uint8Array(64);

    /* A 2x8 strip along the top edge: 16 cells, so it survives at 16. */
    for (let x = 0; x < 8; x += 1) {
        viable[x] = 1;
        viable[8 + x] = 1;
    }

    assert.equal(dropSmallRegions(viable, 8, 8, 16).reduce((s, v) => s + v, 0), 16);
    assert.equal(dropSmallRegions(viable, 8, 8, 17).reduce((s, v) => s + v, 0), 0);
});

test('a threshold of one or less leaves the mask alone', () => {
    const viable = Uint8Array.from([1, 0, 0, 1, 0, 0, 0, 0, 1]);

    assert.deepEqual(
        Array.from(dropSmallRegions(viable, 3, 3, 1)),
        Array.from(viable)
    );
});

test('dropping regions leaves the original mask untouched', () => {
    const viable = Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0, 0]);
    const kept = dropSmallRegions(viable, 3, 3, 16);

    assert.equal(viable[0], 1, 'the caller keeps its own array');
    assert.equal(kept[0], 0);
});

test('a region that is one cell wide is not somewhere to park', () => {
    const viable = new Uint8Array(100);

    for (let x = 0; x < 10; x += 1) {
        viable[5 * 10 + x] = 1;
    }

    const parked = parkingMask(viable, 10, 10);

    assert.equal(parked.filter(Boolean).length, 0);
});

test('a solid three by three block survives the parking test whole', () => {
    const viable = new Uint8Array(100);

    for (let y = 3; y < 6; y += 1) {
        for (let x = 3; x < 6; x += 1) {
            viable[y * 10 + x] = 1;
        }
    }

    const parked = parkingMask(viable, 10, 10);

    assert.deepEqual(Array.from(parked), Array.from(viable));
});

test('the parking test trims a spur off a block but keeps the block', () => {
    const viable = new Uint8Array(100);

    for (let y = 3; y < 6; y += 1) {
        for (let x = 3; x < 6; x += 1) {
            viable[y * 10 + x] = 1;
        }
    }

    viable[4 * 10 + 6] = 1;
    viable[4 * 10 + 7] = 1;

    const parked = parkingMask(viable, 10, 10);

    assert.equal(parked[4 * 10 + 4], 1);
    assert.equal(parked[4 * 10 + 6], 0);
    assert.equal(parked[4 * 10 + 7], 0);
    assert.equal(parked.filter(Boolean).length, 9);
});

test('the parking test leaves the caller\'s mask alone', () => {
    const viable = new Uint8Array(9).fill(1);
    const copy = Uint8Array.from(viable);

    parkingMask(viable, 3, 3);

    assert.deepEqual(Array.from(viable), Array.from(copy));
});

test('the low arc may miss one tower, and the tilt cap is half the hull limit', () => {
    assert.equal(LOW_ARC_MISSABLE_TOWERS, 1);
    assert.equal(TILT_LIMIT_DEGREES, 4);
});

test('the fallback tier fills in around the go-to tier and never over it', () => {
    const primary = new Uint8Array(49);
    const fallback = new Uint8Array(49);

    for (let y = 1; y < 6; y += 1) {
        for (let x = 1; x < 6; x += 1) {
            fallback[y * 7 + x] = 1;
        }
    }

    for (let y = 2; y < 5; y += 1) {
        for (let x = 2; x < 5; x += 1) {
            primary[y * 7 + x] = 1;
        }
    }

    const mask = tierMask(primary, fallback, 7, 7);

    assert.equal(mask[3 * 7 + 3], CELL_INTERIOR, 'centre of the go-to block');
    assert.equal(mask[2 * 7 + 2], CELL_BOUNDARY, 'corner of the go-to block');
    assert.equal(mask[1 * 7 + 1], CELL_FALLBACK_BOUNDARY, 'corner of the orange ring');
    assert.equal(mask[0], CELL_OUTSIDE);

    /*
     * A one cell wide ring has no interior, so every orange cell is edge;
     * what matters is that none of it landed on the green block.
     */
    for (let i = 0; i < 49; i += 1) {
        if (primary[i]) {
            assert.ok(mask[i] === CELL_INTERIOR || mask[i] === CELL_BOUNDARY, `cell ${i}`);
        }
    }
});

test('the fallback tier is the hull limit, twice the go-to tilt', () => {
    assert.equal(FALLBACK_TILT_LIMIT_DEGREES, 8);
});
