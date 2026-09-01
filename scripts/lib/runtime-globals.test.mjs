import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

test('loads a runtime global script and calls its functions', () => {
    const ctx = loadRuntime(['js/map/heightfield.js']);

    setRuntimeGlobal(ctx, '__field', {
        heights: Float32Array.of(0, 10, 20, 30),
        width: 2,
        height: 2,
        originX: 0,
        originY: 0,
        stepGameUnits: 1,
        minZMeters: 0
    });

    assert.equal(callRuntime(ctx, 'heightfieldSample(__field, 0.5, 0.5)'), 15);
    assert.equal(callRuntime(ctx, 'heightfieldSample(__field, 5, 0)'), null);
});
