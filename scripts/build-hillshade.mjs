/*
 * Precomputes a shaded-relief raster from the Terrain3D heightfield.
 *
 *     node scripts/build-hillshade.mjs            # every map with terrain
 *     node scripts/build-hillshade.mjs bakurani   # one map
 *
 * Writes data/terrain/<map>/hillshade.png and hillshade.json, both
 * committed. Same reasoning as scripts/build-contours.mjs: the runtime
 * terrain path in js/features/terrain-ballistics.js streams two chunks per
 * firing solution, but a relief layer needs the whole map at once, and the
 * whole map is 129 MB of chunks. Baking it leaves the client one image.
 *
 * The PNG is greyscale with alpha: translucent black where the ground is in
 * shadow, translucent white where it faces the sun, transparent where it is
 * flat, so js/map/hillshade.js can lay it straight over the tiles.
 *
 * Options:
 *   --spacing <m>       sample spacing, metres        (default 8)
 *   --azimuth <deg>     sun bearing, clockwise N      (default 315)
 *   --altitude <deg>    sun height above horizon      (default 45)
 *   --gain <x>          shading strength multiplier   (default 1)
 *   --exaggeration <z>  force the z-factor, instead of deriving it per map
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    computeHillshade,
    shadeToGreyAlpha,
    zFactorForRelief
} from './lib/hillshade.mjs';

import { encodePng } from './lib/png.mjs';

import {
    createTerrainSampler,
    loadTerrainChunks
} from './lib/terrain-source.mjs';

const root = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..'
);

const HILLSHADE_FORMAT = 'wardogs-hillshade-v1';

const METRES_PER_GAME_UNIT = 100;

function parseArgs(argv) {
    const options = {
        spacing: 8,
        azimuth: 315,
        altitude: 45,
        gain: 1,
        exaggeration: 0,
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

async function buildMap(mapId, options) {
    const terrainDir = join(root, 'data', 'terrain', mapId);
    const manifestPath = join(terrainDir, 'manifest.json');
    const mapPath = join(root, 'maps', `${mapId}.json`);

    if (!existsSync(manifestPath) || !existsSync(mapPath)) {
        return null;
    }

    const manifest = await readJson(manifestPath);
    const mapDefinition = await readJson(mapPath);
    const bounds = mapDefinition.bounds;

    if (!bounds) {
        throw new Error(`${mapId} has no bounds to shade`);
    }

    const chunks = await loadTerrainChunks(manifest, terrainDir, bounds);

    if (!chunks.size) {
        throw new Error(`${mapId} bounds do not overlap any terrain chunk`);
    }

    const sample = createTerrainSampler(manifest, chunks);

    /*
     * Same grid convention as the contours: the playable bounds only, rows
     * north to south so the raster's y axis already matches the canvas's.
     */
    const step = options.spacing / METRES_PER_GAME_UNIT;
    const width = Math.floor((bounds.maxX - bounds.minX) / step) + 1;
    const height = Math.floor((bounds.maxY - bounds.minY) / step) + 1;

    const grid = new Float32Array(width * height);

    let minHeight = Infinity;
    let maxHeight = -Infinity;

    for (let y = 0; y < height; y += 1) {
        const gameY = bounds.maxY - y * step;

        for (let x = 0; x < width; x += 1) {
            const value = sample(bounds.minX + x * step, gameY);

            if (value === null || !Number.isFinite(value)) {
                throw new Error(
                    `${mapId} has no terrain sample inside its own bounds`
                );
            }

            grid[y * width + x] = value;

            if (value < minHeight) {
                minHeight = value;
            }

            if (value > maxHeight) {
                maxHeight = value;
            }
        }
    }

    /*
     * The z-factor comes from the map's own relief, not a shared constant.
     * heightfield.json already carries the full-coverage range; the bounds
     * the raster covers are a subset of it, so fall back to what was just
     * sampled if that file is not there.
     */
    const heightfieldPath = join(terrainDir, 'heightfield.json');

    const heightfield = existsSync(heightfieldPath)
        ? await readJson(heightfieldPath)
        : null;

    const relief = heightfield
        ? Number(heightfield.maxZMeters) - Number(heightfield.minZMeters)
        : maxHeight - minHeight;

    const zFactor = options.exaggeration || zFactorForRelief(relief);

    const shade = computeHillshade(grid, width, height, {
        cellSize: options.spacing,
        zFactor,
        azimuth: options.azimuth,
        altitude: options.altitude
    });

    const pixels = shadeToGreyAlpha(shade, {
        altitude: options.altitude,
        gain: options.gain
    });

    const png = encodePng(pixels, width, height);

    await writeFile(join(terrainDir, 'hillshade.png'), png);

    const payload = {
        format: HILLSHADE_FORMAT,
        mapId,
        sampleSpacingMeters: options.spacing,
        sunAzimuthDegrees: options.azimuth,
        sunAltitudeDegrees: options.altitude,
        zFactor: Number(zFactor.toFixed(4)),
        gain: options.gain,
        reliefMeters: Math.round(relief),
        boundsReliefMeters: Math.round(maxHeight - minHeight),
        grid: {
            width,
            height,
            originX: bounds.minX,
            originY: bounds.maxY,
            stepX: step,
            stepY: step
        },
        file: 'hillshade.png',
        bytes: png.length,
        sha256: createHash('sha256').update(png).digest('hex')
    };

    await writeFile(
        join(terrainDir, 'hillshade.json'),
        JSON.stringify(payload, null, 4) + '\n'
    );

    return {
        mapId,
        chunks: chunks.size,
        width,
        height,
        relief: Math.round(relief),
        zFactor,
        bytes: png.length
    };
}

async function discoverMaps() {
    const index = await readJson(join(root, 'maps', 'index.json'));

    return index
        .map(entry => String(entry).replace(/\.json$/i, ''))
        .filter(Boolean);
}

const options = parseArgs(process.argv.slice(2));

const mapIds = options.maps.length
    ? options.maps
    : await discoverMaps();

let built = 0;

for (const mapId of mapIds) {
    const result = await buildMap(mapId, options);

    if (!result) {
        console.log(`${mapId}: no terrain data, skipped`);
        continue;
    }

    built += 1;

    console.log(
        `${result.mapId}: ${result.chunks} chunks -> ` +
        `${result.width}x${result.height} samples, ` +
        `${result.relief} m relief, ` +
        `z x${result.zFactor.toFixed(2)}, ` +
        `${(result.bytes / 1024).toFixed(0)} KB PNG`
    );
}

if (!built) {
    console.error('No hillshade was built.');
    process.exitCode = 1;
}
