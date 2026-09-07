/*
 * Precomputes the hull-tilt raster from the 2 m Terrain3D chunks.
 *
 *     node scripts/build-flatness.mjs            # every map with terrain
 *     node scripts/build-flatness.mjs bakurani   # one map
 *
 * Writes data/terrain/<map>/flatness.png and flatness.json, both committed.
 * Same reasoning as scripts/build-hillshade.mjs: the runtime terrain path
 * streams two chunks per firing solution, but a tilt layer needs the whole
 * map at once, and the whole map is 129 MB of chunks.
 *
 * Tilt reads the 2 m chunks rather than the 32 m heightfield because a hull
 * footprint is 8 m and the coarse field cannot answer a question at that
 * scale: at a 3 degree threshold it calls 7.2% of Bakurani flat, of which
 * 23% is actually steeper than 5 degrees.
 *
 * The PNG is one byte per cell holding a band index, not a grey level.
 * js/map/flatness.js owns the palette, so the ramp can be retuned without
 * rebaking every map.
 *
 * Options:
 *   --spacing <m>   cell spacing, metres            (default 8)
 *   --stencil <m>   spacing of the fitted samples   (default 2)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    TILT_BAND_EDGES,
    TILT_LIMIT_BAND,
    planeTiltDegrees,
    tiltBand
} from './lib/flatness.mjs';

import { encodePng } from './lib/png.mjs';

import {
    createTerrainSampler,
    loadTerrainChunks
} from './lib/terrain-source.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FLATNESS_FORMAT = 'wardogs-flatness-v1';

const METRES_PER_GAME_UNIT = 100;

/*
 * Five samples across the 8 m footprint. Fewer cannot distinguish a slope
 * from a step, and more buys nothing at 2 m source data.
 */
const STENCIL_SAMPLES = 5;

function parseArgs(argv) {
    const options = { spacing: 8, stencil: 2, maps: [] };

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

async function buildMap(mapId, options) {
    const terrainDir = join(root, 'data', 'terrain', mapId);
    const manifestPath = join(terrainDir, 'manifest.json');
    const mapPath = join(root, 'maps', `${mapId}.json`);

    if (!existsSync(manifestPath) || !existsSync(mapPath)) {
        return null;
    }

    const manifest = await readJson(manifestPath);
    const bounds = (await readJson(mapPath)).bounds;

    if (!bounds) {
        throw new Error(`${mapId} has no bounds to measure`);
    }

    const chunks = await loadTerrainChunks(manifest, terrainDir, bounds);

    if (!chunks.size) {
        throw new Error(`${mapId} bounds do not overlap any terrain chunk`);
    }

    const sample = createTerrainSampler(manifest, chunks);

    const step = options.spacing / METRES_PER_GAME_UNIT;
    const width = Math.floor((bounds.maxX - bounds.minX) / step) + 1;
    const height = Math.floor((bounds.maxY - bounds.minY) / step) + 1;

    const bands = new Uint8Array(width * height);
    const counts = new Array(TILT_LIMIT_BAND + 1).fill(0);

    const offset = options.stencil / METRES_PER_GAME_UNIT;
    const half = (STENCIL_SAMPLES - 1) / 2;
    const stencil = new Float64Array(STENCIL_SAMPLES * STENCIL_SAMPLES);

    for (let y = 0; y < height; y += 1) {
        const gameY = bounds.maxY - y * step;

        for (let x = 0; x < width; x += 1) {
            const gameX = bounds.minX + x * step;

            for (let row = 0; row < STENCIL_SAMPLES; row += 1) {
                for (let col = 0; col < STENCIL_SAMPLES; col += 1) {
                    stencil[row * STENCIL_SAMPLES + col] = sample(
                        gameX + (col - half) * offset,
                        gameY - (row - half) * offset
                    );
                }
            }

            const band = tiltBand(planeTiltDegrees(stencil, options.stencil));

            bands[y * width + x] = band;
            counts[band] += 1;
        }
    }

    const png = encodePng(bands, width, height);

    await writeFile(join(terrainDir, 'flatness.png'), png);

    const total = width * height;

    const payload = {
        format: FLATNESS_FORMAT,
        mapId,
        sampleSpacingMeters: options.spacing,
        stencilSpacingMeters: options.stencil,
        stencilSamples: STENCIL_SAMPLES,
        bandEdgeDegrees: TILT_BAND_EDGES,
        bandShares: counts.map(count => Number((count / total).toFixed(4))),
        grid: {
            width,
            height,
            originX: bounds.minX,
            originY: bounds.maxY,
            stepX: step,
            stepY: step
        },
        file: 'flatness.png',
        bytes: png.length,
        sha256: createHash('sha256').update(png).digest('hex')
    };

    await writeFile(
        join(terrainDir, 'flatness.json'),
        JSON.stringify(payload, null, 4) + '\n'
    );

    return { mapId, width, height, counts, total, bytes: png.length };
}

async function discoverMaps() {
    const index = await readJson(join(root, 'maps', 'index.json'));

    return index.map(entry => String(entry).replace(/\.json$/i, '')).filter(Boolean);
}

const options = parseArgs(process.argv.slice(2));
const mapIds = options.maps.length ? options.maps : await discoverMaps();

let built = 0;

for (const mapId of mapIds) {
    const result = await buildMap(mapId, options);

    if (!result) {
        console.log(`${mapId}: no terrain data, skipped`);
        continue;
    }

    built += 1;

    const shares = result.counts
        .map(count => `${(100 * count / result.total).toFixed(1)}%`)
        .join(' ');

    console.log(
        `${result.mapId}: ${result.width}x${result.height} cells, ` +
        `bands ${shares}, ${(result.bytes / 1024).toFixed(0)} KB PNG`
    );
}

if (!built) {
    console.error('No flatness raster was built.');
    process.exitCode = 1;
}
