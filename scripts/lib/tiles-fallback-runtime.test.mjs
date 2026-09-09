/*
 * The tile loader's second chance: a map carrying tiles.fallbackPath retries
 * a failed tile against that host before giving up, and a map without one
 * still fails after a single request.
 *
 * Run with: npm run test:scripts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadRuntime, callRuntime } from './runtime-globals.mjs';

const MAP = {
    id: 'zestafona',
    bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
    tiles: {
        path: 'https://primary.test/zestafona',
        tileSize: 256,
        minZoom: 0,
        maxZoom: 7,
        extension: 'webp'
    }
};

function tilesCtx(decode) {
    const requested = [];
    const cache = new Map();

    const context = loadRuntime(['js/map/tiles.js'], {
        isValidTileConfig: tiles => Boolean(tiles && tiles.path),
        isValidBounds: bounds => Boolean(bounds),
        view: () => ({ scale: 1 }),
        resourceURL: path => path,
        decodeMapImage: url => {
            requested.push(url);
            return decode(url);
        },
        TILE_CACHE: cache,
        getCachedTile: key => cache.get(key) || null,
        setCachedTile: (key, tile) => cache.set(key, tile),
        closeTileImage: () => {},
        draw: () => {},
        console: { warn: () => {} }
    });

    return { context, requested };
}

function loadOne(context, map) {
    context.__map = map;

    return callRuntime(context, 'loadTile(__map, 3, 4, 4)');
}

function settled() {
    return new Promise(resolve => setImmediate(resolve));
}

test('a map without a fallback fails after one request', async () => {
    const { context, requested } = tilesCtx(
        () => Promise.reject(new Error('404'))
    );

    const tile = loadOne(context, MAP);

    await settled();

    assert.deepEqual(requested, [
        'https://primary.test/zestafona/zoom_3/4_4.webp'
    ]);
    assert.equal(tile.failed, true);
    assert.equal(tile.loaded, false);
});

test('a failed tile is retried against the fallback host', async () => {
    const image = { fallback: true };

    const { context, requested } = tilesCtx(
        url => url.startsWith('https://fallback.test/')
            ? Promise.resolve(image)
            : Promise.reject(new Error('404'))
    );

    const tile = loadOne(context, {
        ...MAP,
        tiles: {
            ...MAP.tiles,
            fallbackPath: 'https://fallback.test/zestafona'
        }
    });

    await settled();

    assert.deepEqual(requested, [
        'https://primary.test/zestafona/zoom_3/4_4.webp',
        'https://fallback.test/zestafona/zoom_3/4_4.webp'
    ]);
    assert.equal(tile.loaded, true);
    assert.equal(tile.failed, false);
    assert.equal(tile.image, image);
});

test('the fallback is not requested when the primary succeeds', async () => {
    const image = { primary: true };

    const { context, requested } = tilesCtx(() => Promise.resolve(image));

    const tile = loadOne(context, {
        ...MAP,
        tiles: {
            ...MAP.tiles,
            fallbackPath: 'https://fallback.test/zestafona'
        }
    });

    await settled();

    assert.deepEqual(requested, [
        'https://primary.test/zestafona/zoom_3/4_4.webp'
    ]);
    assert.equal(tile.loaded, true);
    assert.equal(tile.image, image);
});
