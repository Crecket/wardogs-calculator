/*
 * The firing-positions layer's bookkeeping. The one thing it does that the
 * flatness layer does not is key its cache on the arc as well as the map,
 * so switching the toggle fetches the other raster instead of redrawing the
 * one already in hand.
 *
 * Run with: npm run test:scripts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadRuntime, callRuntime } from './runtime-globals.mjs';

function firingCtx(overrides = {}) {
    return loadRuntime(['js/map/firing-positions.js'], {
        getCoordinateMetersPerUnit: () => 100,
        firingPositionsArc: () => 'low',
        decodeMapImage: () => Promise.reject(new Error('no decoder in the test')),
        fetch: () => Promise.reject(new Error('no network in the test')),
        document: { createElement: () => { throw new Error('no canvas in the test'); } },
        draw: () => {},
        console: { warn: () => {} },
        ...overrides
    });
}

test('only the maps with a baked raster are offered the layer', () => {
    const ctx = firingCtx();

    assert.deepEqual(
        JSON.parse(callRuntime(ctx, 'JSON.stringify(FIRING_POSITION_MAP_IDS)')),
        ['bakurani', 'ozeti']
    );

    assert.deepEqual(
        JSON.parse(callRuntime(ctx, 'JSON.stringify(FIRING_POSITION_ARCS)')),
        ['low', 'any']
    );

    assert.equal(callRuntime(ctx, 'mapHasFiringPositions("ozeti")'), true);
    assert.equal(callRuntime(ctx, 'mapHasFiringPositions("custom")'), false);
});

test('the two arcs are fetched from different files and cached apart', () => {
    const asked = [];

    const ctx = firingCtx({
        fetch: url => {
            asked.push(url);

            return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
        }
    });

    return callRuntime(ctx, 'loadFiringPositions("bakurani", "low")')
        .then(() => callRuntime(ctx, 'loadFiringPositions("bakurani", "any")'))
        .then(() => callRuntime(ctx, 'loadFiringPositions("bakurani", "low")'))
        .then(() => {
            assert.deepEqual(asked, [
                'data/terrain/bakurani/firing-positions-low.json',
                'data/terrain/bakurani/firing-positions-any.json'
            ]);
        });
});

test('an unknown arc is refused rather than fetched', () => {
    let fetched = 0;

    const ctx = firingCtx({
        fetch: () => { fetched += 1; return Promise.reject(new Error('x')); }
    });

    return callRuntime(ctx, 'loadFiringPositions("bakurani", "medium")').then(entry => {
        assert.equal(entry, null);
        assert.equal(fetched, 0);
    });
});

test('a payload baked for the other arc is refused rather than drawn', () => {
    const ctx = firingCtx({
        fetch: () => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
                format: 'wardogs-firing-positions-v1',
                arc: 'any',
                grid: { width: 4, height: 4, originX: 1, originY: 2, stepX: 0.08, stepY: 0.08 }
            })
        })
    });

    return callRuntime(ctx, 'loadFiringPositions("bakurani", "low")').then(entry => {
        assert.equal(entry, null);
    });
});

test('the palette draws the edge and nothing else', () => {
    const ctx = firingCtx();
    const palette = JSON.parse(callRuntime(ctx, 'JSON.stringify(firingPositionsPalette())'));

    assert.equal(palette.length, 3);
    assert.equal(palette[0][3], 0, 'ground outside the set is fully transparent');
    assert.equal(palette[2][3], 255, 'the boundary is drawn at full strength');

    /*
     * The interior says which side of the outline is the good ground, but
     * the flatness ramp has to stay readable through it: measured, an alpha
     * past about 64 starts flattening neighbouring bands into each other.
     */
    assert.ok(palette[1][3] > 0, 'the interior is washed, not empty');
    assert.ok(palette[1][3] <= 64, 'but slightly, so the ramp underneath survives');

    assert.deepEqual(
        palette[1].slice(0, 3),
        palette[2].slice(0, 3),
        'the wash and the edge are the same colour'
    );

    /*
     * Not a terrain colour. The viable set always sits on the flatness
     * ramp's green and amber, so an outline sharing that hue is the one
     * that cannot be seen where it matters.
     */
    const [red, green, blue] = palette[2];

    assert.ok(red > green && blue > green, 'the edge is magenta, not a green or amber');
});
