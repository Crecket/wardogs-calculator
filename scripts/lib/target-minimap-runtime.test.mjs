/*
 * The target minimap's framing: the zoom it asks the pyramid for, and the
 * world-to-canvas projection that puts the target in the middle.
 *
 * Run with: npm run test:scripts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadRuntime, callRuntime } from './runtime-globals.mjs';

function close(actual, expected, tolerance = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `${actual} is not within ${tolerance} of ${expected}`
    );
}

const MAP = {
    id: 'zestafona',
    bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
    tiles: {
        path: 'maps/tiles/zestafona',
        tileSize: 256,
        minZoom: 0,
        maxZoom: 7,
        extension: 'webp'
    }
};

function minimapCtx() {
    const context = loadRuntime(['js/map/target-minimap.js'], {
        getTileConfig: map => map.tiles,
        getTileBounds: map => map.bounds,
        getCoordinateMetersPerUnit: () => 1000,
        metersToWorldDistance: metres => metres / 1000,
        S: { map: 'zestafona', target: { x: 50, y: 50 }, origin: { x: 40, y: 45 } }
    });

    context.__map = MAP;

    return context;
}

test('the frame is centred on the target and spans the configured metres', () => {
    const ctx = minimapCtx();

    const frame = JSON.parse(callRuntime(
        ctx,
        'JSON.stringify(targetMinimapWindow(__map, { width: 360, height: 360 }))'
    ));

    close(frame.right - frame.left, 0.18);
    close((frame.left + frame.right) / 2, 50);
    close((frame.top + frame.bottom) / 2, 50);

    close(
        (frame.top - frame.bottom) / (frame.right - frame.left),
        1
    );
});

test('the zoom is clamped to what the pyramid actually has', () => {
    const ctx = minimapCtx();

    const frame = JSON.parse(callRuntime(
        ctx,
        'JSON.stringify(targetMinimapWindow(__map, { width: 360, height: 360 }))'
    ));

    assert.equal(frame.zoom, MAP.tiles.maxZoom);

    assert.equal(
        callRuntime(ctx, 'targetMinimapZoom(__map, 100)'),
        MAP.tiles.minZoom
    );
});

test('the target lands in the middle of the canvas and the gun to its west', () => {
    const ctx = minimapCtx();

    const points = JSON.parse(callRuntime(
        ctx,
        `(() => {
            const frame = targetMinimapWindow(__map, { width: 360, height: 360 });

            return JSON.stringify({
                target: targetMinimapPoint(frame, S.target),
                gun: targetMinimapPoint(frame, S.origin)
            });
        })()`
    ));

    close(points.target.x, 180, 1e-6);
    close(points.target.y, 180, 1e-6);

    /* The gun is west and south of the target, so left of centre and below it. */
    assert.ok(points.gun.x < points.target.x);
    assert.ok(points.gun.y > points.target.y);
});
