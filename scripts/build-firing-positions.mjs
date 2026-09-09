/*
 * Precomputes the ground an SPG can be parked on that can also put a shell
 * into every tower.
 *
 *     node scripts/build-firing-positions.mjs            # every map
 *     node scripts/build-firing-positions.mjs bakurani   # one map
 *
 * Writes data/terrain/<map>/firing-positions-low.{png,json} and
 * firing-positions-any.{png,json}, all committed. Takes minutes per map,
 * which is the whole reason it is a build step: js/map/firing-positions.js
 * does nothing at runtime but blit the result.
 *
 * This is the go-to layer: not everywhere a gun could sit, but the spots
 * worth driving to. Four filters, cheapest first, because the last one is a
 * terrain march per aim point and only a few percent of the map ever
 * reaches it:
 *
 *   1. every aim point inside the arc's declared range envelope
 *   2. hull tilt under 4 degrees
 *   3. not inside woodland, read from the canopy raster
 *   4. the shell clearing the ground, with thick woods standing 30 m tall
 *
 * Tilt reads the 2 m chunks, because a hull footprint is 8 m and the 32 m
 * heightfield cannot answer a question at that scale. Clearance reads the
 * 32 m heightfield through the shipped assessShot, with the canopy lifted
 * onto it first. That makes the layer stricter than the verdict the app
 * gives when the player clicks the spot, which does not see trees; the
 * layer errs toward refusing ground, never toward offering it.
 *
 * The low arc keeps a cell when it has a clean flat lane to the centre of
 * all but one tower. The any arc keeps the original rule, every tower and
 * every ring point with whichever arc works. What survives is opened with
 * a three by three block so nothing narrower than 24 m is offered as a
 * place to park, then specks go.
 *
 * A second tier rides in the same raster: the original rule, tilt under 8
 * degrees and trees ignored, drawn in a second colour where the go-to set
 * is not. It costs a second clearance pass over the plain heightfield, and
 * it is there because the strict set leaves one Bakurani spawn with almost
 * nothing to drive to.
 *
 * The first three filters run here; the fourth is handed to a pool of
 * workers, because it is 1.7 million terrain marches and everything else is
 * noise beside it. Ordering the aim points to fail faster was measured and
 * buys nothing — 99% of the cells that reach the march pass it — and
 * bypassing assessShot's memo buys 5%. The work itself is irreducible, so
 * the only lever left is not doing it on one core.
 *
 * A map without a canopy raster is skipped: run scripts/build-canopy.mjs
 * first. Baking without it would offer every flat forest floor.
 *
 * Options:
 *   --spacing <m>   cell spacing, metres            (default 8)
 *   --stencil <m>   spacing of the fitted samples   (default 2)
 *   --ring <m>      aim ring around each tower      (default 300)
 *   --workers <n>   parallel clearance workers      (default: every core)
 *   --minregion <n> smallest region kept, in cells  (default 16)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { planeTiltDegrees } from './lib/flatness.mjs';

import {
    AIM_RING_METRES,
    AIM_RING_POINTS,
    CELL_BOUNDARY,
    CELL_FALLBACK_BOUNDARY,
    CELL_INTERIOR,
    FALLBACK_TILT_LIMIT_DEGREES,
    LOW_ARC_MISSABLE_TOWERS,
    MIN_REGION_CELLS,
    TILT_LIMIT_DEGREES,
    aimPoints,
    dropSmallRegions,
    parkingMask,
    tierMask
} from './lib/firing-positions.mjs';

import { CANOPY_METRES, raiseCanopy } from './lib/canopy.mjs';

import { decodePng, encodePng } from './lib/png.mjs';

import {
    createTerrainSampler,
    loadTerrainChunks
} from './lib/terrain-source.mjs';

import {
    callRuntime,
    loadRuntime,
    setRuntimeGlobal
} from './lib/runtime-globals.mjs';

import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FIRING_POSITION_FORMAT = 'wardogs-firing-positions-v1';

const METRES_PER_GAME_UNIT = 100;

const WEAPON_ID = 'spg';

const STENCIL_SAMPLES = 5;

const ARCS = ['low', 'any'];

const SPAWN_ICONS = ['valkyra', 'manticore', 'lonestar'];

function parseArgs(argv) {
    const options = {
        spacing: 8,
        stencil: 2,
        ring: AIM_RING_METRES,
        workers: availableParallelism(),
        minregion: MIN_REGION_CELLS,
        maps: []
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];

        if (arg.startsWith('--')) {
            const key = arg.slice(2);

            if (!(key in options) || key === 'maps') {
                throw new Error(`Unknown option ${arg}`);
            }

            const value = Number(argv[i + 1]);

            if (!Number.isFinite(value) || value <= 0) {
                throw new Error(`${arg} needs a positive number`);
            }

            options[key] = value;
            i += 1;
            continue;
        }

        options.maps.push(arg);
    }

    return options;
}

async function readJson(path) {
    return JSON.parse(await readFile(path, 'utf8'));
}

/*
 * The same decode js/map/heightfield.js does, so the field assessShot walks
 * here is the field it walks in the browser.
 */
async function loadHeightfield(terrainDir) {
    const header = await readJson(join(terrainDir, 'heightfield.json'));
    const buffer = await readFile(join(terrainDir, header.file));

    const raw = new Uint16Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength / 2
    );

    const expected = header.grid.width * header.grid.height;

    if (raw.length !== expected) {
        throw new Error(
            `Heightfield has ${raw.length} samples, header says ${expected}`
        );
    }

    const span = header.maxZMeters - header.minZMeters;
    const heights = new Float32Array(expected);

    for (let i = 0; i < expected; i += 1) {
        heights[i] = header.minZMeters + (raw[i] / 65535) * span;
    }

    return {
        heights,
        width: header.grid.width,
        height: header.grid.height,
        originX: header.grid.originX,
        originY: header.grid.originY,
        stepGameUnits: header.grid.stepGameUnits
    };
}

/*
 * The canopy raster scripts/build-canopy.mjs wrote, or null when the map has
 * none. It has to share the firing grid exactly, since it is indexed by the
 * same cell.
 */
async function loadCanopy(terrainDir, grid) {
    const headerPath = join(terrainDir, 'canopy.json');

    if (!existsSync(headerPath)) {
        return null;
    }

    const header = await readJson(headerPath);
    const decoded = decodePng(await readFile(join(terrainDir, header.file)));

    if (decoded.channels !== 1) {
        throw new Error(`${header.mapId}: canopy raster is not one byte per cell`);
    }

    const cells = decoded.pixels;

    const same =
        header.grid.width === grid.width &&
        header.grid.height === grid.height &&
        Math.abs(header.grid.originX - grid.originX) < 1e-9 &&
        Math.abs(header.grid.originY - grid.originY) < 1e-9 &&
        Math.abs(header.grid.stepX - grid.stepX) < 1e-9;

    if (!same) {
        throw new Error(
            `${header.mapId}: canopy grid does not match the firing grid; ` +
            'rebuild it with the same spacing'
        );
    }

    if (cells.length !== grid.width * grid.height) {
        throw new Error(
            `${header.mapId}: canopy raster has ${cells.length} cells, ` +
            `header says ${grid.width * grid.height}`
        );
    }

    return { cells, grid: header.grid };
}

/*
 * The declared range envelopes, read from the shipped code rather than from
 * data/weapons.json directly. Raw entries carry minRangeKm / maxRangeKm and
 * arcDeclaredRange reads minRange / maxRange, so skipping normalizeWeapon
 * silently widens the envelope instead of failing.
 */
async function declaredRanges() {
    const context = loadRuntime(
        [
            'js/map/heightfield.js',
            'js/map/range-ring.js',
            'js/ballistics/model.js',
            'js/ballistics/reachability.js',
            'js/features/weapons.js'
        ],
        {
            getCoordinateMetersPerUnit: () => METRES_PER_GAME_UNIT,
            fetchJSON: () => {},
            document: {},
            draw: () => {},
            localStorage: { getItem: () => null, setItem: () => {} }
        }
    );

    setRuntimeGlobal(
        context,
        'PROJECTILE_MODEL',
        await readJson(join(root, 'data', 'ballistics', 'projectile-model.json'))
    );

    const weapons = await readJson(join(root, 'data', 'weapons.json'));
    const raw = weapons.weapons.find(entry => entry.id === WEAPON_ID);

    if (!raw) {
        throw new Error(`data/weapons.json has no ${WEAPON_ID}`);
    }

    setRuntimeGlobal(context, '__rawWeapon', raw);
    callRuntime(context, 'var __weapon = normalizeWeapon(__rawWeapon);');

    return {
        low: callRuntime(context, 'arcDeclaredRange(__weapon, "low")'),
        high: callRuntime(context, 'arcDeclaredRange(__weapon, "high")')
    };
}

/*
 * Runs the clearance filter over the candidate cells across a pool of
 * workers, each striding through the list so the uneven cost of a cell
 * evens out instead of stranding one worker on a hard block.
 *
 * The heightfield is half a megabyte, so every worker gets its own copy and
 * no shared memory is needed. The 2 m chunks stay here: they are 58 MB and
 * only the tilt filter, which already ran, ever reads them.
 */
function runClearance(field, aims, towers, xs, ys, workerCount, lowRule) {
    const count = Math.max(1, Math.min(workerCount, xs.length || 1));

    const aimsPerTower = 1 + AIM_RING_POINTS;
    const lowTowersRequired = Math.max(1, towers - LOW_ARC_MISSABLE_TOWERS);

    const heightfield = {
        heights: field.heights.buffer,
        width: field.width,
        height: field.height,
        originX: field.originX,
        originY: field.originY,
        stepGameUnits: field.stepGameUnits
    };

    const workerPath = new URL('./lib/firing-positions-worker.mjs', import.meta.url);

    return Promise.all(
        Array.from({ length: count }, (value, offset) => new Promise(
            (resolve, reject) => {
                const worker = new Worker(workerPath, {
                    workerData: {
                        root,
                        heightfield,
                        aims,
                        aimsPerTower,
                        lowTowersRequired,
                        lowRule,
                        weaponId: WEAPON_ID,
                        xs: xs.buffer,
                        ys: ys.buffer,
                        stride: count,
                        offset
                    }
                });

                worker.on('message', resolve);
                worker.on('error', reject);

                worker.on('exit', code => {
                    if (code !== 0) {
                        reject(new Error(`Clearance worker exited with ${code}`));
                    }
                });
            }
        ))
    );
}

function markerPoints(markers, icons) {
    return markers
        .filter(marker => icons.includes(marker.icon))
        .map(marker => ({
            label: marker.label,
            x: marker.x / METRES_PER_GAME_UNIT,
            y: marker.y / METRES_PER_GAME_UNIT
        }));
}

/*
 * Which spawn is nearest to each viable cell, straight line. Not a driving
 * time — terrain and river crossings could reorder anything close — but a
 * shape the spec's per-spawn table can be checked against, and the number
 * that says whether the arc rule has moved the balance between teams.
 */
function spawnShares(viable, width, height, bounds, step, spawns) {
    if (!spawns.length) {
        return [];
    }

    const distances = spawns.map(() => []);

    for (let y = 0; y < height; y += 1) {
        const gameY = bounds.maxY - y * step;

        for (let x = 0; x < width; x += 1) {
            if (!viable[y * width + x]) {
                continue;
            }

            const gameX = bounds.minX + x * step;

            let nearest = 0;
            let best = Infinity;

            for (let i = 0; i < spawns.length; i += 1) {
                const d = Math.hypot(spawns[i].x - gameX, spawns[i].y - gameY);

                if (d < best) {
                    best = d;
                    nearest = i;
                }
            }

            distances[nearest].push(best * METRES_PER_GAME_UNIT);
        }
    }

    const total = distances.reduce((sum, list) => sum + list.length, 0) || 1;

    return spawns.map((spawn, i) => {
        const sorted = distances[i].sort((a, b) => a - b);

        return {
            label: spawn.label,
            share: sorted.length / total,
            nearestMeters: sorted.length ? Math.round(sorted[0]) : null,
            medianMeters: sorted.length
                ? Math.round(sorted[Math.floor(sorted.length / 2)])
                : null
        };
    });
}

async function buildMap(mapId, options) {
    const terrainDir = join(root, 'data', 'terrain', mapId);
    const manifestPath = join(terrainDir, 'manifest.json');
    const mapPath = join(root, 'maps', `${mapId}.json`);

    if (
        !existsSync(manifestPath) ||
        !existsSync(mapPath) ||
        !existsSync(join(terrainDir, 'heightfield.json'))
    ) {
        return null;
    }

    const manifest = await readJson(manifestPath);
    const mapDefinition = await readJson(mapPath);
    const bounds = mapDefinition.bounds;

    if (!bounds) {
        throw new Error(`${mapId} has no bounds to search`);
    }

    const towers = markerPoints(mapDefinition.markers || [], ['tower']);

    if (!towers.length) {
        throw new Error(`${mapId} has no tower markers to aim at`);
    }

    const spawns = markerPoints(mapDefinition.markers || [], SPAWN_ICONS);

    const aims = aimPoints(towers, {
        ringMeters: options.ring,
        metresPerGameUnit: METRES_PER_GAME_UNIT
    });

    const chunks = await loadTerrainChunks(manifest, terrainDir, bounds);

    if (!chunks.size) {
        throw new Error(`${mapId} bounds do not overlap any terrain chunk`);
    }

    const sample = createTerrainSampler(manifest, chunks);
    const plainField = await loadHeightfield(terrainDir);
    const field = await loadHeightfield(terrainDir);
    const declared = await declaredRanges();

    const step = options.spacing / METRES_PER_GAME_UNIT;
    const width = Math.floor((bounds.maxX - bounds.minX) / step) + 1;
    const height = Math.floor((bounds.maxY - bounds.minY) / step) + 1;

    const grid = {
        width,
        height,
        originX: bounds.minX,
        originY: bounds.maxY,
        stepX: step,
        stepY: step
    };

    const canopy = await loadCanopy(terrainDir, grid);

    if (!canopy) {
        return { mapId, skipped: 'no canopy raster, run build-canopy first' };
    }

    const raised = raiseCanopy(field, canopy);

    /*
     * The cheap gate is the union of the two arcs' envelopes. A cell outside
     * it cannot be viable under either rule, and the test is one hypot per
     * aim point against no terrain at all.
     */
    const envelopeMin = Math.min(declared.low.minMeters, declared.high.minMeters);
    const envelopeMax = Math.max(declared.low.maxMeters, declared.high.maxMeters);

    const emptyMasks = () => ({
        low: new Uint8Array(width * height),
        any: new Uint8Array(width * height)
    });

    const viable = {
        goto: emptyMasks(),
        fallback: emptyMasks()
    };

    const offset = options.stencil / METRES_PER_GAME_UNIT;
    const half = (STENCIL_SAMPLES - 1) / 2;
    const stencil = new Float64Array(STENCIL_SAMPLES * STENCIL_SAMPLES);

    let inEnvelope = 0;
    let underTrees = 0;

    /*
     * The first three filters run here, in one pass, and what survives is
     * the candidate list the workers are given, one list per tier. All are
     * cheap next to the march: a hypot per aim point, twenty-five terrain
     * samples, one byte.
     */
    const candidates = {
        goto: { x: [], y: [], index: [] },
        fallback: { x: [], y: [], index: [] }
    };

    for (let y = 0; y < height; y += 1) {
        const gameY = bounds.maxY - y * step;

        for (let x = 0; x < width; x += 1) {
            const gameX = bounds.minX + x * step;

            let reachable = true;

            for (let i = 0; i < aims.length; i += 1) {
                const metres = Math.hypot(
                    aims[i].x - gameX,
                    aims[i].y - gameY
                ) * METRES_PER_GAME_UNIT;

                if (metres < envelopeMin || metres > envelopeMax) {
                    reachable = false;
                    break;
                }
            }

            if (!reachable) {
                continue;
            }

            inEnvelope += 1;

            for (let row = 0; row < STENCIL_SAMPLES; row += 1) {
                for (let col = 0; col < STENCIL_SAMPLES; col += 1) {
                    stencil[row * STENCIL_SAMPLES + col] = sample(
                        gameX + (col - half) * offset,
                        gameY - (row - half) * offset
                    );
                }
            }

            const tilt = planeTiltDegrees(stencil, options.stencil);

            if (!(tilt < FALLBACK_TILT_LIMIT_DEGREES)) {
                continue;
            }

            const index = y * width + x;

            candidates.fallback.x.push(gameX);
            candidates.fallback.y.push(gameY);
            candidates.fallback.index.push(index);

            if (!(tilt < TILT_LIMIT_DEGREES)) {
                continue;
            }

            if (canopy.cells[index]) {
                underTrees += 1;
                continue;
            }

            candidates.goto.x.push(gameX);
            candidates.goto.y.push(gameY);
            candidates.goto.index.push(index);
        }
    }

    const flatEnough = candidates.goto.index.length;

    /*
     * Every worker returns a full-length mask with only its own stride
     * filled in, so the merge is a union and the order they finish in
     * cannot change the answer.
     */
    const march = async (tier, tierField, lowRule) => {
        const list = candidates[tier];

        const clearance = await runClearance(
            tierField,
            aims,
            towers.length,
            Float64Array.from(list.x),
            Float64Array.from(list.y),
            options.workers,
            lowRule
        );

        for (const slice of clearance) {
            for (let i = 0; i < list.index.length; i += 1) {
                if (slice.any[i]) {
                    viable[tier].any[list.index[i]] = 1;
                }

                if (slice.low[i]) {
                    viable[tier].low[list.index[i]] = 1;
                }
            }
        }
    };

    await march('goto', field, 'tower-centres');
    await march('fallback', plainField, 'every-point');

    const cellKm2 = (options.spacing * options.spacing) / 1e6;
    const results = [];

    for (const arc of ARCS) {
        /*
         * The parking test and the specks go before the outline is traced,
         * not after: ground that is refused should leave no edge behind,
         * and tracing first would draw one for every sliver.
         */
        const settle = raw => {
            const parkable = parkingMask(raw, width, height);
            const kept = dropSmallRegions(parkable, width, height, options.minregion);

            let unparkable = 0;
            let dropped = 0;

            for (let i = 0; i < kept.length; i += 1) {
                if (raw[i] && !parkable[i]) {
                    unparkable += 1;
                } else if (parkable[i] && !kept[i]) {
                    dropped += 1;
                }
            }

            return { kept, unparkable, dropped };
        };

        const goto = settle(viable.goto[arc]);
        const fallback = settle(viable.fallback[arc]);
        const { kept, unparkable, dropped } = goto;

        const mask = tierMask(goto.kept, fallback.kept, width, height);

        let cells = 0;
        let boundary = 0;
        let fallbackCells = 0;

        for (let i = 0; i < mask.length; i += 1) {
            if (mask[i] === CELL_INTERIOR || mask[i] === CELL_BOUNDARY) {
                cells += 1;
            } else if (mask[i]) {
                fallbackCells += 1;
            }

            if (mask[i] === CELL_BOUNDARY || mask[i] === CELL_FALLBACK_BOUNDARY) {
                boundary += 1;
            }
        }

        const png = encodePng(mask, width, height);
        const file = `firing-positions-${arc}.png`;

        await writeFile(join(terrainDir, file), png);

        const payload = {
            format: FIRING_POSITION_FORMAT,
            mapId,
            arc,
            weaponId: WEAPON_ID,
            sampleSpacingMeters: options.spacing,
            stencilSpacingMeters: options.stencil,
            aimRingMeters: options.ring,
            aimPoints: aims.length,
            tiltLimitDegrees: TILT_LIMIT_DEGREES,
            lowArcMissableTowers: LOW_ARC_MISSABLE_TOWERS,
            canopyMeters: CANOPY_METRES,
            fallbackTiltLimitDegrees: FALLBACK_TILT_LIMIT_DEGREES,
            minRegionCells: options.minregion,
            viableKm2: Number((cells * cellKm2).toFixed(3)),
            fallbackKm2: Number((fallbackCells * cellKm2).toFixed(3)),
            droppedAsUnparkableKm2: Number((unparkable * cellKm2).toFixed(3)),
            droppedAsTooSmallKm2: Number((dropped * cellKm2).toFixed(3)),
            spawns: spawnShares(
                kept, width, height, bounds, step, spawns
            ).map(entry => ({
                ...entry,
                share: Number(entry.share.toFixed(3))
            })),
            fallbackSpawns: spawnShares(
                fallback.kept, width, height, bounds, step, spawns
            ).map(entry => ({
                ...entry,
                share: Number(entry.share.toFixed(3))
            })),
            grid,
            file,
            bytes: png.length,
            sha256: createHash('sha256').update(png).digest('hex')
        };

        await writeFile(
            join(terrainDir, `firing-positions-${arc}.json`),
            JSON.stringify(payload, null, 4) + '\n'
        );

        results.push({ arc, cells, fallbackCells, boundary, dropped, payload, bytes: png.length });
    }

    return {
        mapId,
        width,
        height,
        aims: aims.length,
        inEnvelope: inEnvelope * cellKm2,
        underTrees: underTrees * cellKm2,
        raised,
        flatEnough: flatEnough * cellKm2,
        workers: Math.max(1, Math.min(options.workers, flatEnough || 1)),
        results
    };
}

async function discoverMaps() {
    const index = await readJson(join(root, 'maps', 'index.json'));

    return index.map(entry => String(entry).replace(/\.json$/i, '')).filter(Boolean);
}

const options = parseArgs(process.argv.slice(2));
const mapIds = options.maps.length ? options.maps : await discoverMaps();

let built = 0;

for (const mapId of mapIds) {
    const started = Date.now();
    const result = await buildMap(mapId, options);

    if (!result) {
        console.log(`${mapId}: no terrain data, skipped`);
        continue;
    }

    if (result.skipped) {
        console.log(`${mapId}: ${result.skipped}, skipped`);
        continue;
    }

    built += 1;

    console.log(
        `${result.mapId}: ${result.width}x${result.height} cells, ` +
        `${result.aims} aim points, ` +
        `in envelope ${result.inEnvelope.toFixed(2)} km2, ` +
        `${result.raised} heightfield cells under wood, ` +
        `flat enough ${result.flatEnough.toFixed(2)} km2 ` +
        `of which ${result.underTrees.toFixed(2)} km2 in trees, ` +
        `${result.workers} workers, ` +
        `${((Date.now() - started) / 1000).toFixed(0)}s`
    );

    for (const entry of result.results) {
        const describe = list => list
            .map(spawn => `${spawn.label} ${(100 * spawn.share).toFixed(0)}%`)
            .join(' ');

        const shares = describe(entry.payload.spawns);
        const fallbackShares = describe(entry.payload.fallbackSpawns);

        console.log(
            `  ${entry.arc.padEnd(3)} go-to ${entry.payload.viableKm2.toFixed(2)} km2, ` +
            `${entry.payload.droppedAsUnparkableKm2.toFixed(2)} km2 dropped as unparkable, ` +
            `${entry.payload.droppedAsTooSmallKm2.toFixed(2)} km2 dropped as too small, ` +
            `${(entry.bytes / 1024).toFixed(0)} KB PNG` +
            (shares ? `, ${shares}` : '')
        );

        console.log(
            `      fallback ${entry.payload.fallbackKm2.toFixed(2)} km2` +
            (fallbackShares ? `, ${fallbackShares}` : '')
        );
    }
}

if (!built) {
    console.error('No firing positions raster was built.');
    process.exitCode = 1;
}
