/*
 * The flatness layer's bookkeeping: a map with no raster is never fetched,
 * a failed load is remembered so it does not re-request on every redraw,
 * and the band indices come out of the palette as the colours the ramp
 * promises.
 *
 * Run with: npm run test:scripts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

function flatnessCtx(overrides = {}) {
    return loadRuntime(['js/map/flatness.js'], {
        getCoordinateMetersPerUnit: () => 100,
        decodeMapImage: () => Promise.reject(new Error('no decoder in the test')),
        fetch: () => Promise.reject(new Error('no network in the test')),
        document: { createElement: () => { throw new Error('no canvas in the test'); } },
        draw: () => {},
        console: { warn: () => {} },
        ...overrides
    });
}

test('only the maps with a baked raster are offered the layer', () => {
    const ctx = flatnessCtx();

    /*
     * Through JSON, because the array is built inside the vm's own realm
     * and deepEqual compares constructors.
     */
    assert.deepEqual(
        JSON.parse(callRuntime(ctx, 'JSON.stringify(FLATNESS_MAP_IDS)')),
        ['bakurani', 'ozeti', 'zestafona']
    );

    assert.equal(callRuntime(ctx, 'mapHasFlatness("bakurani")'), true);
    assert.equal(callRuntime(ctx, 'mapHasFlatness("custom")'), false);
    assert.equal(callRuntime(ctx, 'mapHasFlatness(null)'), false);
});

test('an unsupported map resolves to null without touching the network', () => {
    let fetched = 0;

    const ctx = flatnessCtx({
        fetch: () => { fetched += 1; return Promise.reject(new Error('x')); }
    });

    return callRuntime(ctx, 'loadFlatness("custom")').then(entry => {
        assert.equal(entry, null);
        assert.equal(fetched, 0);
    });
});

test('a failed load is cached as null so the redraw does not re-request it', () => {
    let fetched = 0;

    const ctx = flatnessCtx({
        fetch: () => { fetched += 1; return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' }); }
    });

    return callRuntime(ctx, 'loadFlatness("bakurani")')
        .then(entry => {
            assert.equal(entry, null);
            assert.equal(fetched, 1);

            return callRuntime(ctx, 'loadFlatness("bakurani")');
        })
        .then(entry => {
            assert.equal(entry, null);
            assert.equal(fetched, 1);
            assert.equal(callRuntime(ctx, 'cachedFlatness("bakurani")'), null);
        });
});

test('a payload in the wrong format is refused rather than drawn as noise', () => {
    const ctx = flatnessCtx({
        fetch: () => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ format: 'wardogs-hillshade-v1' })
        })
    });

    return callRuntime(ctx, 'loadFlatness("bakurani")').then(entry => {
        assert.equal(entry, null);
    });
});

test('the palette runs green to red across one entry per band', () => {
    const ctx = flatnessCtx();
    const palette = callRuntime(ctx, 'JSON.stringify(flatnessPalette())');
    const bands = JSON.parse(palette);

    assert.equal(bands.length, 5);

    for (const band of bands) {
        assert.equal(band.length, 3);

        for (const channel of band) {
            assert.ok(Number.isInteger(channel) && channel >= 0 && channel <= 255);
        }
    }

    assert.ok(bands[0][1] > bands[0][0], 'the flattest band is green-dominant');
    assert.ok(bands[4][0] > bands[4][1], 'the steepest band is red-dominant');
});
