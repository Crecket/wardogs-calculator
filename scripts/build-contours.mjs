/*
 * Precomputes contour lines from the Terrain3D heightfield.
 *
 *     node scripts/build-contours.mjs            # every map with terrain
 *     node scripts/build-contours.mjs bakurani   # one map
 *
 * Writes data/terrain/<map>/contours.json, which is committed. The output
 * is small — roughly 150 KB gzipped for Bakurani, 35 KB for Ozeti — so the
 * client can fetch a whole map's contours in one request.
 *
 * That is the whole reason this runs at build time. The runtime terrain
 * path in js/features/terrain-ballistics.js loads chunks lazily, two per
 * firing solution, because the full heightfield is 256 chunks and 129 MB
 * per map. A contour layer needs all of it at once, so it cannot be a
 * runtime read.
 *
 * Options:
 *   --interval <m>   contour interval, metres      (default 20)
 *   --spacing <m>    sample spacing, metres        (default 4)
 *   --tolerance <m>  line simplification, metres   (default 2)
 *   --major <n>      heavier line every n levels   (default 5)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildLevelLines } from './lib/contours.mjs';

const root = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..'
);

const CONTOURS_FORMAT = 'wardogs-contours-v1';

/*
 * A game unit is 100 m on both maps; every distance in this file is metres
 * and converted at the edges.
 */
const METRES_PER_GAME_UNIT = 100;

/*
 * Coordinates are stored as tenths of a sample cell. At 4 m spacing that is
 * 40 cm, well under a line width at any zoom the map offers, and it keeps
 * the deltas to one or two digits.
 */
const QUANTISATION = 10;

function parseArgs(argv) {
    const options = {
        interval: 20,
        spacing: 4,
        tolerance: 2,
        major: 5,
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
 * Mirrors locateTerrainPoint / decodeRawHeight in
 * js/features/terrain-ballistics.js. The two must agree: if they drift, the
 * contours and the elevation readout describe different ground.
 */
function createSampler(manifest, terrainDir, chunkFiles) {
    const side = Number(manifest.verticesPerSide);
    const chunkQuads = Number(manifest.chunkQuads);
    const quadsPerUnitX = Number(manifest.gameUnitsToLandscapeQuadsX);
    const quadsPerUnitY = Number(manifest.gameUnitsToLandscapeQuadsY);
    const zOffset = Number(manifest.worldZOffsetMeters);
    const zScale = Number(manifest.worldZScaleMetersPerLocalUnit);

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function heightAt(chunk, x, y) {
        const raw = chunk.view.getUint16((y * side + x) * 2, true);

        const localZ =
            chunk.entry.minLocalZ +
            (raw / 65535) *
            (chunk.entry.maxLocalZ - chunk.entry.minLocalZ);

        return zOffset + localZ * zScale;
    }

    return function sample(gameX, gameY) {
        const quadX =
            Number(manifest.globalQuadOffsetX) + gameX * quadsPerUnitX;

        const quadY =
            Number(manifest.globalQuadOffsetY) + gameY * quadsPerUnitY;

        const chunkX = clamp(
            Math.floor(quadX / chunkQuads),
            Number(manifest.chunkXMin),
            Number(manifest.chunkXMax)
        );

        const chunkY = clamp(
            Math.floor(quadY / chunkQuads),
            Number(manifest.chunkYMin),
            Number(manifest.chunkYMax)
        );

        const chunk = chunkFiles.get(`${chunkX},${chunkY}`);

        if (!chunk) {
            return null;
        }

        const localX = clamp(quadX - chunkX * chunkQuads, 0, chunkQuads);
        const localY = clamp(quadY - chunkY * chunkQuads, 0, chunkQuads);

        const x0 = Math.floor(localX);
        const y0 = Math.floor(localY);
        const x1 = Math.min(chunkQuads, x0 + 1);
        const y1 = Math.min(chunkQuads, y0 + 1);

        const fx = localX - x0;
        const fy = localY - y0;

        return (
            heightAt(chunk, x0, y0) * (1 - fx) * (1 - fy) +
            heightAt(chunk, x1, y0) * fx * (1 - fy) +
            heightAt(chunk, x0, y1) * (1 - fx) * fy +
            heightAt(chunk, x1, y1) * fx * fy
        );
    };
}

/*
 * Loads only the chunks the map's playable bounds actually touch. Bakurani
 * needs 144 of its 256, and skipping the rest is 58 MB of reads.
 */
async function loadChunks(manifest, terrainDir, bounds) {
    const chunkQuads = Number(manifest.chunkQuads);

    const quadsX = [
        Number(manifest.globalQuadOffsetX) +
            bounds.minX * Number(manifest.gameUnitsToLandscapeQuadsX),
        Number(manifest.globalQuadOffsetX) +
            bounds.maxX * Number(manifest.gameUnitsToLandscapeQuadsX)
    ];

    const quadsY = [
        Number(manifest.globalQuadOffsetY) +
            bounds.minY * Number(manifest.gameUnitsToLandscapeQuadsY),
        Number(manifest.globalQuadOffsetY) +
            bounds.maxY * Number(manifest.gameUnitsToLandscapeQuadsY)
    ];

    const range = (values, min, max) => {
        const low = Math.max(
            min,
            Math.floor(Math.min(...values) / chunkQuads)
        );

        const high = Math.min(
            max,
            Math.floor(Math.max(...values) / chunkQuads)
        );

        return [low, high];
    };

    const [chunkXMin, chunkXMax] = range(
        quadsX,
        Number(manifest.chunkXMin),
        Number(manifest.chunkXMax)
    );

    const [chunkYMin, chunkYMax] = range(
        quadsY,
        Number(manifest.chunkYMin),
        Number(manifest.chunkYMax)
    );

    const chunks = new Map();

    for (let y = chunkYMin; y <= chunkYMax; y += 1) {
        for (let x = chunkXMin; x <= chunkXMax; x += 1) {
            const key = `${x},${y}`;
            const entry = manifest.chunks?.[key];

            if (!entry) {
                continue;
            }

            const buffer = await readFile(join(terrainDir, entry.file));

            if (buffer.byteLength !== Number(entry.bytes)) {
                throw new Error(
                    `Terrain chunk ${key} is ${buffer.byteLength} bytes, ` +
                    `manifest says ${entry.bytes}`
                );
            }

            chunks.set(key, {
                entry,
                view: new DataView(
                    buffer.buffer,
                    buffer.byteOffset,
                    buffer.byteLength
                )
            });
        }
    }

    return chunks;
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
        throw new Error(`${mapId} has no bounds to contour`);
    }

    const chunks = await loadChunks(manifest, terrainDir, bounds);

    if (!chunks.size) {
        throw new Error(`${mapId} bounds do not overlap any terrain chunk`);
    }

    const sample = createSampler(manifest, terrainDir, chunks);

    /*
     * The grid covers the playable bounds only. Contouring the full
     * coverage rectangle would roughly double the payload to draw lines
     * outside the area the map view ever shows.
     */
    const step = options.spacing / METRES_PER_GAME_UNIT;
    const width = Math.floor((bounds.maxX - bounds.minX) / step) + 1;
    const height = Math.floor((bounds.maxY - bounds.minY) / step) + 1;

    const grid = new Float32Array(width * height);

    let minHeight = Infinity;
    let maxHeight = -Infinity;

    for (let y = 0; y < height; y += 1) {
        /*
         * Rows run north to south so the grid's y axis matches the
         * canvas's, which saves the renderer a flip per point.
         */
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

    const first =
        Math.ceil(minHeight / options.interval) * options.interval;

    const levels = [];

    let lineCount = 0;

    for (
        let level = first, index = 0;
        level <= maxHeight;
        level += options.interval, index += 1
    ) {
        const lines = buildLevelLines(grid, width, height, level, {
            tolerance: options.tolerance / options.spacing,
            quantisation: QUANTISATION
        });

        if (!lines.length) {
            continue;
        }

        lineCount += lines.length;

        levels.push({
            /*
             * Metres above the lowest sample in the map's own bounds. The
             * heightfield sits on an offset datum — see docs/terrain.md —
             * so this is the only height that means anything to a player,
             * and even it is only ever a difference.
             */
            relativeMeters: Math.round(level - minHeight),
            major: index % options.major === 0,
            lines
        });
    }

    const payload = {
        format: CONTOURS_FORMAT,
        mapId,
        intervalMeters: options.interval,
        sampleSpacingMeters: options.spacing,
        toleranceMeters: options.tolerance,
        majorEvery: options.major,
        datum: 'relative',
        reliefMeters: Math.round(maxHeight - minHeight),
        /*
         * Enough for the client to turn a quantised cell coordinate back
         * into a game coordinate, without it needing the bounds again:
         *
         *     gameX = originX + x / QUANTISATION * stepX
         *     gameY = originY - y / QUANTISATION * stepY
         */
        quantisation: QUANTISATION,
        grid: {
            width,
            height,
            originX: bounds.minX,
            originY: bounds.maxY,
            stepX: step,
            stepY: step
        },
        levels
    };

    const outputPath = join(terrainDir, 'contours.json');
    const json = JSON.stringify(payload);

    await writeFile(outputPath, json + '\n');

    return {
        mapId,
        chunks: chunks.size,
        width,
        height,
        levels: levels.length,
        lines: lineCount,
        relief: Math.round(maxHeight - minHeight),
        bytes: json.length
    };
}

async function discoverMaps() {
    const index = await readJson(join(root, 'maps', 'index.json'));

    /*
     * maps/index.json lists file names, not ids.
     */
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
        `${result.levels} levels, ${result.lines} lines, ` +
        `${(result.bytes / 1024).toFixed(0)} KB`
    );
}

if (!built) {
    console.error('No contours were built.');
    process.exitCode = 1;
}
