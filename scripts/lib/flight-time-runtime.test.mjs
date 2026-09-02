import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const model = JSON.parse(readFileSync(join(root, 'data/ballistics/projectile-model.json'), 'utf8'));

function flightCtx() {
    const ctx = loadRuntime(['js/ballistics/model.js', 'js/features/flight-time.js'], { WEAPONS: {} });
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', model);
    return ctx;
}

test('the mortar interpolates the measured timings and clamps at the ends', () => {
    const ctx = flightCtx();
    assert.equal(callRuntime(ctx, 'flightTimeSecondsForMil("mortar", "single", 150)'), 16.5);
    assert.equal(callRuntime(ctx, 'flightTimeSecondsForMil("mortar", "single", 850)'), 22.4);
    assert.ok(Math.abs(callRuntime(ctx, 'flightTimeSecondsForMil("mortar", "single", 525)') - 19.15) < 1e-9);
    assert.equal(callRuntime(ctx, 'flightTimeSecondsForMil("mortar", "single", 120)'), 16.5);
    assert.equal(callRuntime(ctx, 'flightTimeSecondsForMil("mortar", "single", 950)'), 22.4);
    assert.equal(callRuntime(ctx, 'flightTimeSecondsForMil("mortar", "single", 600, -100)'), 20);
});

test('the SPH-2 derives its seconds from the drag model and they move with height', () => {
    const ctx = flightCtx();
    const low = callRuntime(ctx, 'flightTimeSecondsForMil("spg", "low", 300)');
    const high = callRuntime(ctx, 'flightTimeSecondsForMil("spg", "high", 1200)');
    assert.ok(Math.abs(low - 14.22) < 0.4, String(low));
    assert.ok(Math.abs(high - 35.4) < 0.4, String(high));
    assert.ok(callRuntime(ctx, 'flightTimeSecondsForMil("spg", "low", 300, -200)') > low);
    assert.ok(callRuntime(ctx, 'flightTimeSecondsForMil("spg", "low", 300, 50)') < low);
    assert.equal(callRuntime(ctx, 'flightTimeSecondsForMil("spg", "low", 1600)'), null);
    assert.equal(callRuntime(ctx, 'flightTimeSecondsForMil("nope", "low", 300)'), null);
});

test('flightTimeBadges hides the row when any arc has no answer', () => {
    const ctx = flightCtx();
    setRuntimeGlobal(ctx, '__spg', { id: 'spg' });
    const badges = callRuntime(ctx, 'flightTimeBadges(__spg, { low: { mil: 300 }, high: { minMil: 1190, maxMil: 1210 } })');
    assert.equal(badges.length, 2);
    assert.equal(badges[0].arc, 'low');
    assert.equal(badges[1].labelKey, 'highArcShort');
    assert.equal(callRuntime(ctx, 'flightTimeBadges(__spg, { low: { mil: 300 }, high: { mil: 1600 } })').length, 0);
});
