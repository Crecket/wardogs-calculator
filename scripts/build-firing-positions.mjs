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
 * Three filters, cheapest first, because the last one is a terrain march
 * per aim point and only a few percent of the map ever reaches it:
 *
 *   1. every aim point inside the arc's declared range envelope
 *   2. hull tilt at most 8 degrees
 *   3. the shell clearing the ground on the way to every aim point
 *
 * Tilt reads the 2 m chunks, because a hull footprint is 8 m and the 32 m
 * heightfield cannot answer a question at that scale. Clearance reads the
 * 32 m heightfield through the shipped assessShot, because a verdict here
 * that disagreed with the one the app gives when the player clicks that
 * spot would be worse than no layer at all.
 *
 * Options:
 *   --spacing <m>   cell spacing, metres            (default 8)
 *   --stencil <m>   spacing of the fitted samples   (default 2)
 *   --ring <m>      aim ring around each tower      (default 300)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    TILT_LIMIT_BAND,
    planeTiltDegrees,
    tiltBand
} from './lib/flatness.mjs';

import {
    AIM_RING_METRES,
    CELL_BOUNDARY,
    aimPoints,
    outlineMask
} from './lib/firing-positions.mjs';

import { encodePng } from './lib/png.mjs';

import {
    createTerrainSampler,
    loadTerrainChunks
} from './lib/terrain-source.mjs';

import {
    callRuntime,
    loadRuntime,
    setRuntimeGlobal
} from './lib/runtime-globals.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FIRING_POSITION_FORMAT = 'wardogs-firing-positions-v1';

const METRES_PER_GAME_UNIT = 100;

const WEAPON_ID = 'spg';

const STENCIL_SAMPLES = 5;

const ARCS = ['low', 'any'];

const SPAWN_ICONS = ['valkyra', 'manticore', 'lonestar'];

function parseArgs(argv) {
    const options = { spacing: 8, stencil: 2, ring: AIM_RING_METRES, maps: [] };

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
 * One vm context per map, holding the shipped reachability code with its
 * heightfield accessors replaced by the field this script decoded. The aim
 * loop is compiled inside the context and returned as a function, so a cell
 * costs one boundary crossing rather than one per aim point.
 */
async function createReachability(field, aims) {
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
    setRuntimeGlobal(context, '__field', field);
    setRuntimeGlobal(context, '__aims', aims);

    callRuntime(
        context,
        'mapHasHeightfield = () => true;' +
        'ensureHeightfieldLoaded = () => {};' +
        'cachedHeightfield = () => __field;' +
        'var __weapon = normalizeWeapon(__rawWeapon);'
    );

    const declared = {
        low: callRuntime(context, 'arcDeclaredRange(__weapon, "low")'),
        high: callRuntime(context, 'arcDeclaredRange(__weapon, "high")')
    };

    /*
     * Returns [lowReaches, eitherReaches] for one cell, bailing out at the
     * first aim point neither arc can make.
     */
    const reaches = callRuntime(context, `(function (gunX, gunY) {
        var low = true;

        for (var i = 0; i < __aims.length; i += 1) {
            var shot = assessShot(
                __weapon,
                { x: gunX, y: gunY },
                __aims[i],
                'build'
            );

            var lowHits =
                shot.arcs.low &&
                shot.arcs.low.status === 'hit' &&
                !shot.arcs.low.masked;

            var highHits =
                shot.arcs.high &&
                shot.arcs.high.status === 'hit' &&
                !shot.arcs.high.masked;

            if (!lowHits) {
                low = false;
            }

            if (!lowHits && !highHits) {
                return [false, false];
            }
        }

        return [low, true];
    })`);

    return { declared, reaches };
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
    const field = await loadHeightfield(terrainDir);
    const { declared, reaches } = await createReachability(field, aims);

    /*
     * The cheap gate is the union of the two arcs' envelopes. A cell outside
     * it cannot be viable under either rule, and the test is one hypot per
     * aim point against no terrain at all.
     */
    const envelopeMin = Math.min(declared.low.minMeters, declared.high.minMeters);
    const envelopeMax = Math.max(declared.low.maxMeters, declared.high.maxMeters);

    const step = options.spacing / METRES_PER_GAME_UNIT;
    const width = Math.floor((bounds.maxX - bounds.minX) / step) + 1;
    const height = Math.floor((bounds.maxY - bounds.minY) / step) + 1;

    const viable = {
        low: new Uint8Array(width * height),
        any: new Uint8Array(width * height)
    };

    const offset = options.stencil / METRES_PER_GAME_UNIT;
    const half = (STENCIL_SAMPLES - 1) / 2;
    const stencil = new Float64Array(STENCIL_SAMPLES * STENCIL_SAMPLES);

    let inEnvelope = 0;
    let flatEnough = 0;

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

            if (
                tiltBand(planeTiltDegrees(stencil, options.stencil)) >=
                TILT_LIMIT_BAND
            ) {
                continue;
            }

            flatEnough += 1;

            const [low, any] = reaches(gameX, gameY);
            const index = y * width + x;

            if (any) {
                viable.any[index] = 1;
            }

            if (low) {
                viable.low[index] = 1;
            }
        }
    }

    const cellKm2 = (options.spacing * options.spacing) / 1e6;
    const results = [];

    for (const arc of ARCS) {
        const mask = outlineMask(viable[arc], width, height);

        let cells = 0;
        let boundary = 0;

        for (let i = 0; i < mask.length; i += 1) {
            if (mask[i]) {
                cells += 1;
            }

            if (mask[i] === CELL_BOUNDARY) {
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
            viableKm2: Number((cells * cellKm2).toFixed(3)),
            spawns: spawnShares(
                viable[arc], width, height, bounds, step, spawns
            ).map(entry => ({
                ...entry,
                share: Number(entry.share.toFixed(3))
            })),
            grid: {
                width,
                height,
                originX: bounds.minX,
                originY: bounds.maxY,
                stepX: step,
                stepY: step
            },
            file,
            bytes: png.length,
            sha256: createHash('sha256').update(png).digest('hex')
        };

        await writeFile(
            join(terrainDir, `firing-positions-${arc}.json`),
            JSON.stringify(payload, null, 4) + '\n'
        );

        results.push({ arc, cells, boundary, payload, bytes: png.length });
    }

    return {
        mapId,
        width,
        height,
        aims: aims.length,
        inEnvelope: inEnvelope * cellKm2,
        flatEnough: flatEnough * cellKm2,
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

    built += 1;

    console.log(
        `${result.mapId}: ${result.width}x${result.height} cells, ` +
        `${result.aims} aim points, ` +
        `in envelope ${result.inEnvelope.toFixed(2)} km2, ` +
        `flat enough ${result.flatEnough.toFixed(2)} km2, ` +
        `${((Date.now() - started) / 1000).toFixed(0)}s`
    );

    for (const entry of result.results) {
        const shares = entry.payload.spawns
            .map(spawn => `${spawn.label} ${(100 * spawn.share).toFixed(0)}%`)
            .join(' ');

        console.log(
            `  ${entry.arc.padEnd(3)} ${entry.payload.viableKm2.toFixed(2)} km2, ` +
            `${(entry.bytes / 1024).toFixed(0)} KB PNG` +
            (shares ? `, ${shares}` : '')
        );
    }
}

if (!built) {
    console.error('No firing positions raster was built.');
    process.exitCode = 1;
}
