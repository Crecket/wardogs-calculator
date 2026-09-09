/*
 * Reads the map tiles and writes down where the trees are.
 *
 *     node scripts/build-canopy.mjs            # every map with local tiles
 *     node scripts/build-canopy.mjs bakurani   # one map
 *
 * Writes data/terrain/<map>/canopy.png and canopy.json, both committed. The
 * PNG is one byte per cell on the same 8 m grid as the firing positions,
 * 1 for canopy, and scripts/build-firing-positions.mjs reads it as its
 * fourth filter. scripts/lib/canopy.mjs owns the thresholds.
 *
 * The input is the finest zoom of the tile pyramid under maps/tiles/<map>,
 * which is git-ignored and served from a bucket, so this step needs a local
 * copy: fetch the tiles over the playable bounds first, and a map without
 * them is skipped rather than baked blind. Decoding WebP takes a browser,
 * which is why playwright-core is here — the same headless chromium the
 * render benchmark uses.
 *
 * Options:
 *   --spacing <m>   cell spacing, metres   (default 8)
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

import {
    CANOPY_MEAN_MAX,
    CANOPY_STD_MIN,
    isCanopy
} from './lib/canopy.mjs';

import { encodePng } from './lib/png.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CANOPY_FORMAT = 'wardogs-canopy-v1';

const METRES_PER_GAME_UNIT = 100;

const TILE_BATCH = 150;

function parseArgs(argv) {
    const options = { spacing: 8, maps: [] };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];

        if (arg === '--spacing') {
            const value = Number(argv[i + 1]);

            if (!Number.isFinite(value) || value <= 0) {
                throw new Error(`${arg} needs a positive number`);
            }

            options.spacing = value;
            i += 1;
            continue;
        }

        if (arg.startsWith('--')) {
            throw new Error(`Unknown option ${arg}`);
        }

        options.maps.push(arg);
    }

    return options;
}

async function readJson(path) {
    return JSON.parse(await readFile(path, 'utf8'));
}

/*
 * The tile pyramid's pixel grid in game units. zoom_0 is one tile over the
 * whole tileBounds extent, so the finest zoom has 2^maxZoom tiles a side.
 */
function tileGeometry(map) {
    const tiles = map.tiles;
    const tileBounds = map.tileBounds;

    if (!tiles || !tileBounds) {
        return null;
    }

    const tilesPerSide = 2 ** Number(tiles.maxZoom);
    const unitsPerPixel =
        (tileBounds.maxX - tileBounds.minX) / (tilesPerSide * tiles.tileSize);

    return {
        zoom: Number(tiles.maxZoom),
        size: Number(tiles.tileSize),
        extension: tiles.extension || 'webp',
        unitsPerPixel,
        minX: tileBounds.minX,
        maxY: tileBounds.maxY
    };
}

async function buildMap(mapId, options) {
    const terrainDir = join(root, 'data', 'terrain', mapId);
    const mapPath = join(root, 'maps', `${mapId}.json`);

    if (!existsSync(mapPath) || !existsSync(terrainDir)) {
        return null;
    }

    const map = await readJson(mapPath);
    const geometry = tileGeometry(map);
    const bounds = map.bounds;

    if (!geometry || !bounds) {
        return null;
    }

    const tileDir = join(root, 'maps', 'tiles', mapId, `zoom_${geometry.zoom}`);

    if (!existsSync(tileDir)) {
        return { mapId, skipped: `no local tiles under ${tileDir}` };
    }

    const step = options.spacing / METRES_PER_GAME_UNIT;
    const width = Math.floor((bounds.maxX - bounds.minX) / step) + 1;
    const height = Math.floor((bounds.maxY - bounds.minY) / step) + 1;

    const cellPixels = step / geometry.unitsPerPixel;

    if (Math.abs(cellPixels - Math.round(cellPixels)) > 1e-6) {
        throw new Error(
            `${mapId}: a ${options.spacing} m cell is ${cellPixels} tile pixels, ` +
            'which is not whole'
        );
    }

    /*
     * A cell is a sample point with half a cell either side, so the raster's
     * north-west pixel corner sits half a step beyond the first sample.
     */
    const pixelX0 = Math.round((bounds.minX - step / 2 - geometry.minX) / geometry.unitsPerPixel);
    const pixelY0 = Math.round((geometry.maxY - (bounds.maxY + step / 2)) / geometry.unitsPerPixel);

    const files = (await readdir(tileDir))
        .filter(name => name.endsWith(`.${geometry.extension}`));

    const browser = await chromium.launch();

    try {
        const page = await browser.newPage();

        await page.setContent(
            `<canvas id="tile" width="${geometry.size}" height="${geometry.size}"></canvas>`
        );

        await page.evaluate(({ width, height, size, cellPixels, pixelX0, pixelY0 }) => {
            window.grid = {
                width,
                height,
                size,
                cellPixels,
                pixelX0,
                pixelY0,
                sum: new Float64Array(width * height),
                squares: new Float64Array(width * height),
                count: new Uint32Array(width * height)
            };

            window.context = document
                .getElementById('tile')
                .getContext('2d', { willReadFrequently: true });

            window.decode = source => new Promise((resolve, reject) => {
                const image = new Image();

                image.onload = () => resolve(image);
                image.onerror = reject;
                image.src = source;
            });
        }, { width, height, size: geometry.size, cellPixels: Math.round(cellPixels), pixelX0, pixelY0 });

        for (let start = 0; start < files.length; start += TILE_BATCH) {
            const batch = await Promise.all(
                files.slice(start, start + TILE_BATCH).map(async name => {
                    const [tx, ty] = name.replace(/\.[^.]+$/, '').split('_').map(Number);
                    const data = await readFile(join(tileDir, name));

                    return { tx, ty, data: data.toString('base64') };
                })
            );

            await page.evaluate(async ({ batch, extension }) => {
                const g = window.grid;

                for (const { tx, ty, data } of batch) {
                    const image = await window.decode(`data:image/${extension};base64,${data}`);

                    window.context.drawImage(image, 0, 0);

                    const pixels = window.context.getImageData(0, 0, g.size, g.size).data;

                    for (let py = 0; py < g.size; py += 1) {
                        const cy = Math.floor((ty * g.size + py - g.pixelY0) / g.cellPixels);

                        if (cy < 0 || cy >= g.height) {
                            continue;
                        }

                        for (let px = 0; px < g.size; px += 1) {
                            const cx = Math.floor((tx * g.size + px - g.pixelX0) / g.cellPixels);

                            if (cx < 0 || cx >= g.width) {
                                continue;
                            }

                            const offset = (py * g.size + px) * 4;
                            const luminance =
                                (pixels[offset] * 2 + pixels[offset + 1] * 3 + pixels[offset + 2]) / 6;
                            const index = cy * g.width + cx;

                            g.sum[index] += luminance;
                            g.squares[index] += luminance * luminance;
                            g.count[index] += 1;
                        }
                    }
                }
            }, { batch, extension: geometry.extension });
        }

        const stats = await page.evaluate(() => {
            const g = window.grid;
            const mean = new Array(g.width * g.height);
            const std = new Array(g.width * g.height);

            for (let i = 0; i < mean.length; i += 1) {
                if (!g.count[i]) {
                    mean[i] = -1;
                    std[i] = 0;
                    continue;
                }

                const m = g.sum[i] / g.count[i];

                mean[i] = m;
                std[i] = Math.sqrt(Math.max(0, g.squares[i] / g.count[i] - m * m));
            }

            return { mean, std };
        });

        const cells = new Uint8Array(width * height);

        let covered = 0;
        let trees = 0;

        for (let i = 0; i < cells.length; i += 1) {
            if (stats.mean[i] < 0) {
                continue;
            }

            covered += 1;

            if (isCanopy(stats.mean[i], stats.std[i])) {
                cells[i] = 1;
                trees += 1;
            }
        }

        const png = encodePng(cells, width, height);
        const file = 'canopy.png';

        await writeFile(join(terrainDir, file), png);

        const payload = {
            format: CANOPY_FORMAT,
            mapId,
            sampleSpacingMeters: options.spacing,
            tileZoom: geometry.zoom,
            luminanceMeanMax: CANOPY_MEAN_MAX,
            luminanceStdMin: CANOPY_STD_MIN,
            coverage: Number((covered / cells.length).toFixed(4)),
            canopyShare: Number((covered ? trees / covered : 0).toFixed(4)),
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
            join(terrainDir, 'canopy.json'),
            JSON.stringify(payload, null, 4) + '\n'
        );

        return { mapId, tiles: files.length, payload };
    } finally {
        await browser.close();
    }
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
        console.log(`${mapId}: no map or terrain data, skipped`);
        continue;
    }

    if (result.skipped) {
        console.log(`${mapId}: ${result.skipped}, skipped`);
        continue;
    }

    built += 1;

    console.log(
        `${mapId}: ${result.tiles} tiles, ` +
        `${result.payload.grid.width}x${result.payload.grid.height} cells, ` +
        `${(100 * result.payload.coverage).toFixed(1)}% covered, ` +
        `${(100 * result.payload.canopyShare).toFixed(1)}% canopy, ` +
        `${(result.payload.bytes / 1024).toFixed(0)} KB, ` +
        `${((Date.now() - started) / 1000).toFixed(0)}s`
    );
}

if (!built) {
    console.error('No canopy raster was built.');
    process.exitCode = 1;
}
