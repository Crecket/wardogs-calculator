/*
 * Resolves measured shots against the shipped terrain and projectile model.
 *
 * For each shot it reports the gun's ground height and local slope, the
 * impact's height and local slope, the height difference, range and bearing,
 * and how the model's range and flight time compare. Two judgements matter
 * more than the numbers and are made explicitly:
 *
 * - Whether the gun was level. Hull attitude on sloped ground was measured
 *   on 2026-09-03 to move the high arc by up to 95 m, which is larger than
 *   any error in the ballistics; shots from a slope cannot be used to fit.
 * - Whether the round reached its ballistic range or struck rising ground
 *   first. A shot that hits a slope measures where the trajectory meets the
 *   terrain, not the range, and the two differ by hundreds of metres.
 *
 * Usage:  node scripts/analyse-shots.mjs shots.json [--map bakurani]
 *
 * The file is an array of { gun: [x, y], dial, arc, impact: [x, y], tof }.
 * `arc` is "low" or "high"; `tof` is seconds and optional. Coordinates are
 * the game's own readout. See docs/firing-range-measurements.md.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadTerrainChunks, createTerrainSampler } from './lib/terrain-source.mjs';
import { rangeAtMil, flightTimeAtMil } from './lib/ballistics.mjs';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './lib/runtime-globals.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const mapId = (args.find(a => a.startsWith('--map=')) || '--map=bakurani').split('=')[1];

if (!file) {
    console.error('usage: node scripts/analyse-shots.mjs shots.json [--map=bakurani]');
    process.exit(1);
}

const terrainDir = join(root, 'data/terrain', mapId);
const manifest = JSON.parse(await readFile(join(terrainDir, 'manifest.json'), 'utf8'));
const model = JSON.parse(await readFile(join(root, 'data/ballistics/projectile-model.json'), 'utf8'));
const shots = JSON.parse(await readFile(file, 'utf8'));

const coverage = manifest.coverage;
const chunks = await loadTerrainChunks(manifest, terrainDir, {
    minX: coverage.gameXMin, maxX: coverage.gameXMax,
    minY: coverage.gameYMin, maxY: coverage.gameYMax
});
const sample = createTerrainSampler(manifest, chunks);

const ctx = loadRuntime(['js/ballistics/model.js']);
setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', model);

const shellHeight = (arc, mil, x) => callRuntime(
    ctx,
    `(function(){const f=projectileModelArc('spg','${arc}');` +
    `const t=modelArcTanForMil(f,${mil});` +
    `return t===null?null:modelShellHeight(f,t,${x});})()`
);

const METRES_PER_UNIT = 100;

/* Slope over several footprints: a hull spans metres, and 2 m terrain data
 * exaggerates the gradient under it at the smallest scale. */
function slopeProfile(x, y) {
    return [4, 8, 16, 32].map(metres => {
        const d = metres / 2 / METRES_PER_UNIT;
        const gx = (sample(x + d, y) - sample(x - d, y)) / (2 * d * METRES_PER_UNIT);
        const gy = (sample(x, y + d) - sample(x, y - d)) / (2 * d * METRES_PER_UNIT);

        return {
            metres,
            degrees: Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI,
            downhill: (Math.atan2(-gx, -gy) * 180 / Math.PI + 360) % 360
        };
    });
}

/* Where the model's trajectory first meets the ground along this bearing. */
function terrainIntercept(gx, gy, gz, ux, uy, arc, mil) {
    let previous = null;

    for (let r = 25; r <= 4000; r += 5) {
        const u = r / METRES_PER_UNIT;
        const z = sample(gx + ux * u, gy + uy * u);

        if (z === null) {
            return null;
        }

        const shell = shellHeight(arc, mil, r);

        if (shell === null) {
            return null;
        }

        const clearance = shell - (z - gz);

        if (previous !== null && previous > 0 && clearance <= 0) {
            return { range: r, deltaZ: z - gz };
        }

        previous = clearance;
    }

    return null;
}

const rows = [];

for (const shot of shots) {
    const [gx, gy] = shot.gun;
    const [ix, iy] = shot.impact;
    const arc = shot.arc || (shot.dial > 700 ? 'high' : 'low');
    const fit = model.weapons.spg?.[arc];

    const gz = sample(gx, gy);
    const iz = sample(ix, iy);

    if (gz === null || iz === null) {
        console.error(`${shot.id}: outside terrain coverage`);
        continue;
    }

    const deltaZ = iz - gz;
    const span = Math.hypot(ix - gx, iy - gy);
    const range = span * METRES_PER_UNIT;
    const bearing = (Math.atan2(ix - gx, iy - gy) * 180 / Math.PI + 360) % 360;

    const gunSlope = slopeProfile(gx, gy);
    const impactSlope = slopeProfile(ix, iy)[1].degrees;
    const gunTilt = Math.max(...gunSlope.map(s => s.degrees));
    const downhill = gunSlope[1].downhill;

    const intercept = terrainIntercept(gx, gy, gz, (ix - gx) / span, (iy - gy) / span, arc, shot.dial);
    const modelRange = rangeAtMil(fit, shot.dial, deltaZ);
    const modelTof = shot.tof == null ? null : flightTimeAtMil(fit, shot.dial, deltaZ);

    /* When the two agree the ground is gentle enough that the shot measures
     * range; when they diverge the round struck a slope on the way in. */
    const clean = intercept !== null && modelRange !== null
        && Math.abs(intercept.range - modelRange) < 20;

    rows.push({
        id: shot.id, dial: shot.dial, arc,
        gun: `${gx}, ${gy}`, gz, gunTilt, downhill,
        impact: `${ix}, ${iy}`, iz, deltaZ, range, bearing, impactSlope,
        modelRange, residual: modelRange === null ? null : range - modelRange,
        intercept: intercept?.range ?? null,
        interceptResidual: intercept === null ? null : range - intercept.range,
        tof: shot.tof ?? null, modelTof,
        tofError: modelTof === null ? null : modelTof - shot.tof,
        clean,
        offDownhill: ((bearing - downhill + 540) % 360) - 180
    });
}

const f = (v, n = 1, sign = false) =>
    v === null || v === undefined ? '—' : `${sign && v >= 0 ? '+' : ''}${v.toFixed(n)}`;

console.log('| # | dial | arc | impact | impact z | ΔZ | range | bearing | impact slope | TOF |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) {
    console.log(
        `| ${r.id} | ${r.dial} | ${r.arc} | ${r.impact} | ${f(r.iz, 2)} | ${f(r.deltaZ, 2, true)} m ` +
        `| ${f(r.range)} m | ${f(r.bearing)}° | ${f(r.impactSlope, 0)}° | ${r.tof === null ? '—' : f(r.tof, 3) + ' s'} |`
    );
}

console.log('\n| # | model range | residual | model intercept | intercept residual | clean range point? |');
console.log('| --- | --- | --- | --- | --- | --- |');
for (const r of rows) {
    console.log(
        `| ${r.id} | ${f(r.modelRange, 0)} m | ${f(r.residual, 0, true)} m | ${f(r.intercept, 0)} m ` +
        `| ${f(r.interceptResidual, 0, true)} m | ${r.clean ? 'yes' : 'NO — struck rising ground'} |`
    );
}

const timed = rows.filter(r => r.tof !== null);
if (timed.length) {
    console.log('\n| # | dial | measured TOF | model TOF | error |');
    console.log('| --- | --- | --- | --- | --- |');
    for (const r of timed) {
        console.log(`| ${r.id} | ${r.dial} | ${f(r.tof, 3)} s | ${f(r.modelTof, 2)} s | ${f(r.tofError, 2, true)} s |`);
    }
}

console.log('\nFiring positions:');
const seen = new Map();
for (const r of rows) {
    if (!seen.has(r.gun)) seen.set(r.gun, r);
}
for (const [gun, r] of seen) {
    const verdict = r.gunTilt < 5 ? 'level — usable for fitting'
        : r.gunTilt < 15 ? 'slightly sloped — attitude error possible'
        : 'SLOPED — hull attitude contaminates these shots, do not fit them';
    console.log(`  ${gun}: ground ${f(r.gz, 2)} m, slope up to ${f(r.gunTilt)}°, downhill ${f(r.downhill, 0)}°`);
    console.log(`    ${verdict}`);
}

const bad = rows.filter(r => !r.clean).map(r => r.id);
if (bad.length) {
    console.log(`\nStruck rising ground, so these measure a terrain intercept rather than range: ${bad.join(', ')}`);
}
