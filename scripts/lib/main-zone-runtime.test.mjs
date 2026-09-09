import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

function context() {
    const ctx = loadRuntime(['js/map/maps.js'], {
        URL,
        MAPS: {},
        S: { map: 'bakurani', mainZone: {} },
        $: () => null
    });

    setRuntimeGlobal(ctx, '__map', {
        id: 'bakurani',
        mainZones: [
            { id: 'default', name: 'Default', x: 7991, y: 7183, radius: 500 },
            { id: 'farmland', name: 'Farmland', x: 8137, y: 6938, radius: 500 }
        ]
    });

    return ctx;
}

test('the first variant is the zone when nothing was chosen', () => {
    const ctx = context();

    assert.equal(callRuntime(ctx, 'resolveMainZone(__map, {}).id'), 'default');
});

test('a chosen variant wins and an unknown choice falls back to the first', () => {
    const ctx = context();

    assert.equal(callRuntime(ctx, "resolveMainZone(__map, { bakurani: 'farmland' }).id"), 'farmland');
    assert.equal(callRuntime(ctx, "resolveMainZone(__map, { bakurani: 'stadium' }).id"), 'default');
});

test('hidden and mapless cases resolve to nothing', () => {
    const ctx = context();

    assert.equal(callRuntime(ctx, "resolveMainZone(__map, { bakurani: 'none' })"), null);
    assert.equal(callRuntime(ctx, 'resolveMainZone({ id: "zestafona" }, {})'), null);
    assert.equal(callRuntime(ctx, 'resolveMainZone(null, {})'), null);
});

test('normalizeMap keeps only well-formed variants', () => {
    const ctx = context();

    const ids = callRuntime(ctx, `normalizeMap({
        id: 'x', name: 'X', w: 16, h: 16,
        mainZones: [
            { id: 'default', name: 'Default', x: 1, y: 2, radius: 500 },
            { id: 'broken', name: 'Broken', x: 'a', y: 2, radius: 500 },
            { name: 'No id', x: 1, y: 2, radius: 500 }
        ]
    }).mainZones.map(zone => zone.id).join(',')`);

    assert.equal(ids, 'default');
});
