/*
 * Exercises the contour pipeline on grids small enough to reason about by
 * hand, so a regression in scripts/build-contours.mjs output can be told
 * apart from a regression in the terrain sampling that feeds it.
 *
 * Run with: npm run test:scripts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildLevelLines,
    contourSegments,
    encodeLine,
    simplifyLine,
    stitchSegments
} from './contours.mjs';

/*
 * A ramp rising along x: every column is a constant height, so the level-5
 * contour is one vertical line at x = 1 (halfway between 0 and 10).
 */
function rampGrid(width, height, perColumn) {
    const grid = new Float32Array(width * height);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            grid[y * width + x] = perColumn[x];
        }
    }

    return grid;
}

test('flat ground produces no segments', () => {
    const grid = new Float32Array(9).fill(3);

    assert.deepEqual(
        contourSegments(grid, 3, 3, 5),
        []
    );
});

test('a level above every sample produces no segments', () => {
    const grid = rampGrid(3, 3, [0, 10, 20]);

    assert.deepEqual(
        contourSegments(grid, 3, 3, 99),
        []
    );
});

test('a ramp crosses each cell row once, at the interpolated position', () => {
    const grid = rampGrid(3, 3, [0, 10, 20]);

    const segments = contourSegments(grid, 3, 3, 5);

    assert.equal(segments.length, 2);

    for (const segment of segments) {
        for (const [x] of segment) {
            assert.ok(
                Math.abs(x - 0.5) < 1e-9,
                `expected the crossing at x = 0.5, got ${x}`
            );
        }
    }
});

test('stitching joins a ramp into one polyline spanning the grid', () => {
    const grid = rampGrid(3, 5, [0, 10, 20]);

    const lines = stitchSegments(
        contourSegments(grid, 3, 5, 5)
    );

    assert.equal(lines.length, 1);
    assert.equal(lines[0].length, 5);

    const ys = lines[0].map(point => point[1]).sort((a, b) => a - b);

    assert.deepEqual(ys, [0, 1, 2, 3, 4]);
});

/*
 * Raster order seeds the walk in the middle of the contour, so this is the
 * case that regressed into hundreds of fragments before stitching learned
 * to extend backwards as well as forwards.
 */
test('stitching seeded mid-line still yields one polyline', () => {
    const grid = rampGrid(3, 9, [0, 10, 20]);

    const segments = contourSegments(grid, 3, 9, 5);

    const reordered = [
        ...segments.slice(4),
        ...segments.slice(0, 4)
    ];

    const lines = stitchSegments(reordered);

    assert.equal(lines.length, 1);
    assert.equal(lines[0].length, 9);
});

test('a peak contours into a single closed ring', () => {
    const width = 5;
    const height = 5;
    const grid = new Float32Array(width * height);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            grid[y * width + x] =
                100 - Math.hypot(x - 2, y - 2) * 20;
        }
    }

    const lines = stitchSegments(
        contourSegments(grid, width, height, 70)
    );

    assert.equal(lines.length, 1);

    const ring = lines[0];

    assert.ok(ring.length > 4);
    assert.deepEqual(ring[0], ring[ring.length - 1]);
});

test('simplify drops collinear points and keeps the endpoints', () => {
    const points = [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0]
    ];

    assert.deepEqual(
        simplifyLine(points, 0.5),
        [[0, 0], [3, 0]]
    );
});

test('simplify keeps a deviation larger than the tolerance', () => {
    const points = [
        [0, 0],
        [1, 2],
        [2, 0]
    ];

    assert.deepEqual(
        simplifyLine(points, 0.5),
        points
    );
});

test('simplify leaves short lines and zero tolerance alone', () => {
    const points = [[0, 0], [1, 1]];

    assert.deepEqual(simplifyLine(points, 5), points);

    const three = [[0, 0], [1, 5], [2, 0]];

    assert.deepEqual(simplifyLine(three, 0), three);
});

/*
 * A closed ring has a zero-length chord between its first and last point,
 * which is the degenerate case for perpendicular distance.
 */
test('simplify does not collapse a closed ring to its endpoints', () => {
    const ring = [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [0, 0]
    ];

    assert.deepEqual(simplifyLine(ring, 0.5), ring);
});

test('encodeLine emits an origin followed by quantised deltas', () => {
    assert.deepEqual(
        encodeLine([[0.5, 1], [1, 1], [1, 2.25]], 10),
        [5, 10, 5, 0, 0, 13]
    );
});

test('buildLevelLines round-trips deltas back to the source line', () => {
    const grid = rampGrid(3, 5, [0, 10, 20]);

    const lines = buildLevelLines(grid, 3, 5, 5, {
        tolerance: 0,
        quantisation: 10
    });

    assert.equal(lines.length, 1);

    const flat = lines[0];
    const decoded = [];

    let x = 0;
    let y = 0;

    for (let i = 0; i < flat.length; i += 2) {
        x += flat[i];
        y += flat[i + 1];
        decoded.push([x / 10, y / 10]);
    }

    assert.deepEqual(
        decoded,
        [[0.5, 0], [0.5, 1], [0.5, 2], [0.5, 3], [0.5, 4]]
    );
});

test('buildLevelLines drops lines that simplify below two points', () => {
    const grid = new Float32Array(9).fill(3);

    assert.deepEqual(
        buildLevelLines(grid, 3, 3, 5, { tolerance: 1 }),
        []
    );
});
