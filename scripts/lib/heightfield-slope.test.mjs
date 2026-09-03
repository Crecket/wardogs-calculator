import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

/*
 * The slope readout exists to warn that a gun is parked on a hill, because
 * hull tilt was measured at up to 95 m of range error on the high arc and
 * nothing in the app can correct it. See docs/firing-range-measurements.md.
 */

function fieldFrom(heights, width, height, step = 0.32) {
    return {
        heights: Float32Array.from(heights),
        width,
        height,
        originX: 0,
        originY: 0,
        stepGameUnits: step
    };
}

function slopeCtx() {
    return loadRuntime(
        ['js/map/heightfield.js'],
        { getCoordinateMetersPerUnit: () => 100, fetchJSON: () => {}, document: {} }
    );
}

function slopeAt(ctx, field, x, y) {
    setRuntimeGlobal(ctx, '__field', field);

    return callRuntime(ctx, `heightfieldSlopeDegrees(__field, ${x}, ${y})`);
}

test('level ground reads zero degrees', () => {
    const ctx = slopeCtx();
    const field = fieldFrom(new Array(25).fill(-800), 5, 5);

    assert.equal(slopeAt(ctx, field, 0.64, 0.64), 0);
});

test('a 32 m rise over one 32 m cell reads 45 degrees', () => {
    const ctx = slopeCtx();
    // ramp along x: each cell is 0.32 units = 32 m across and rises 32 m
    const heights = [];
    for (let j = 0; j < 5; j += 1) {
        for (let i = 0; i < 5; i += 1) {
            heights.push(-800 + i * 32);
        }
    }

    const slope = slopeAt(ctx, fieldFrom(heights, 5, 5), 0.64, 0.64);

    assert.ok(Math.abs(slope - 45) < 0.01, `expected 45 degrees, got ${slope}`);
});

test('slope does not depend on which way the hill faces', () => {
    const ctx = slopeCtx();
    const along = [];
    const across = [];
    for (let j = 0; j < 5; j += 1) {
        for (let i = 0; i < 5; i += 1) {
            along.push(-800 + i * 16);
            across.push(-800 + j * 16);
        }
    }

    const a = slopeAt(ctx, fieldFrom(along, 5, 5), 0.64, 0.64);
    const b = slopeAt(ctx, fieldFrom(across, 5, 5), 0.64, 0.64);

    assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
    assert.ok(a > 26 && a < 27, `expected about 26.6 degrees, got ${a}`);
});

test('a point whose neighbours fall outside the grid returns null, not a wrong angle', () => {
    const ctx = slopeCtx();
    const field = fieldFrom(new Array(25).fill(-800), 5, 5);

    assert.equal(slopeAt(ctx, field, 0, 0), null);
});

test('no field returns null', () => {
    const ctx = slopeCtx();

    assert.equal(callRuntime(ctx, 'heightfieldSlopeDegrees(null, 1, 1)'), null);
});
