# Firing positions and flatness layers implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two baked map layers — flatness (hull tilt everywhere, on a five-band ramp) and firing positions (the ground which is both flat enough and able to range every tower, with a low-arc / any-mil toggle) — and regroup the Layers popover into five groups so the two land somewhere coherent.

**Architecture:** Both layers are precomputed at build time into single-channel PNGs beside the existing `data/terrain/<map>/hillshade.png`, with a JSON sidecar carrying the grid geometry. Each runtime module is the same five functions as `js/map/hillshade.js` (`mapHasX`, `loadX`, `cachedX`, `ensureXLoaded`, `drawX`), colourising band indices onto an offscreen canvas once at load. The invariant is that neither layer computes anything per frame: drawing is one `drawImage` each.

**Tech Stack:** Plain ES modules for the build scripts (`node --test` for their tests), plain browser globals for the runtime layers (loaded into a `node:vm` context by `scripts/lib/runtime-globals.mjs` for testing), no bundler, no dependencies outside the standard library.

**Spec:** `docs/superpowers/specs/2026-09-07-firing-positions-layer-design.md`

## Global Constraints

- **No code comments beyond what the file already carries in style.** This repo writes long explanatory block comments at the top of a file and above non-obvious functions, explaining *why*. Match that density; do not add line-by-line commentary.
- **Commit messages are a single title line.** No body, no trailers, no `Co-Authored-By`. Present tense, describing what the change makes true.
- **Never hard-wrap prose.** In markdown and in block comments, let paragraphs run as one line.
- **Grid geometry is identical to the hillshade's**: playable `bounds` only, 8 m spacing, rows north to south. `width = Math.floor((bounds.maxX - bounds.minX) / step) + 1`, `height` likewise, `step = 8 / 100`. Bakurani is 1379 × 1379, Ozeti 1069 × 972.
- **`METRES_PER_GAME_UNIT` is 100** and comes from `maps/<id>.json` `coordinateMetersPerUnit`; do not hardcode it in runtime code, use `getCoordinateMetersPerUnit()`.
- **Tilt limit is 8 degrees**, expressed once as `tiltBand(t) < TILT_LIMIT_BAND` so the flatness ramp and the firing-positions filter cannot disagree at the boundary.
- **Aim-point ring is 300 m, eight points at 45 degree intervals, plus the tower centre.** Tower count is read from the map: Bakurani has five, Ozeti four.
- **Weapon is `spg` only.** Raw `data/weapons.json` uses `minRangeKm`/`maxRangeKm`; `assessArc` needs `minRange`/`maxRange` in km. Always normalise through `normalizeWeapon` from `js/features/weapons.js` — skipping this silently widens the range envelope.
- **Locale files are the 11 JSON files in `locales/` other than `index.json`**: `cat de en es fr ko pl pt ru uk zh-cn`. Page templates are the 11 HTML files under `src/pages/` that already carry `<script src="js/map/hillshade.js">`.
- **New test files must be appended to the `test:scripts` script in `package.json`** or they never run.

---

### Task 1: The tilt arithmetic

The pure half of the flatness layer: fit a plane through a stencil of terrain samples and bucket its angle. No file I/O, no terrain source, no ballistics — this is the piece the tests can pin down exactly, because analytic planes have known answers.

**Files:**
- Create: `scripts/lib/flatness.mjs`
- Test: `scripts/lib/flatness.test.mjs`
- Modify: `package.json` (append the new test file to `test:scripts`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `TILT_BAND_EDGES: number[]` — `[2, 4, 6, 8]`, the degree boundaries between bands.
  - `TILT_LIMIT_BAND: number` — `4`, the first band a gun should not be parked in.
  - `tiltBand(degrees: number): number` — `0..4`.
  - `planeTiltDegrees(samples: ArrayLike<number>, spacingMeters: number): number` — `samples` is a square stencil of heights in metres, row-major, rows running north to south and columns west to east. Returns the angle of the least-squares plane from horizontal, in degrees.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/flatness.test.mjs`:

```js
/*
 * Pins down the tilt arithmetic: a plane of known slope reads that slope
 * whatever direction it faces, symmetric noise about a plane does not move
 * the answer, and the band edges land where the 8 degree warning does.
 *
 * Run with: npm run test:scripts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    TILT_BAND_EDGES,
    TILT_LIMIT_BAND,
    planeTiltDegrees,
    tiltBand
} from './flatness.mjs';

const SPACING = 2;
const SIZE = 5;

/*
 * A perfect plane over a 5x5 stencil. Columns run west to east and rows run
 * north to south, so a positive perEast raises the ground to the east and a
 * positive perNorth raises it to the north.
 */
function plane(perEast, perNorth, base = -900) {
    const samples = new Float64Array(SIZE * SIZE);
    const centre = (SIZE - 1) / 2;

    for (let row = 0; row < SIZE; row += 1) {
        for (let col = 0; col < SIZE; col += 1) {
            samples[row * SIZE + col] =
                base +
                (col - centre) * SPACING * perEast +
                (centre - row) * SPACING * perNorth;
        }
    }

    return samples;
}

const degrees = radians => radians * 180 / Math.PI;
const tangent = deg => Math.tan(deg * Math.PI / 180);

test('level ground reads zero degrees', () => {
    assert.equal(planeTiltDegrees(plane(0, 0), SPACING), 0);
});

test('a ten degree ramp reads ten degrees whichever way it faces', () => {
    const g = tangent(10);

    for (const [east, north] of [[g, 0], [-g, 0], [0, g], [0, -g]]) {
        assert.ok(
            Math.abs(planeTiltDegrees(plane(east, north), SPACING) - 10) < 1e-9,
            `${east},${north}`
        );
    }
});

test('a diagonal plane reads the magnitude of its gradient, not one axis', () => {
    const g = tangent(10);
    const expected = degrees(Math.atan(Math.hypot(g, g)));

    assert.ok(
        Math.abs(planeTiltDegrees(plane(g, g), SPACING) - expected) < 1e-9
    );
});

test('the fit is least squares, so noise on points opposite the centre cancels', () => {
    const clean = plane(tangent(6), tangent(3));
    const noisy = Float64Array.from(clean);

    /*
     * Each pair sits opposite through the centre of the stencil, so equal
     * bumps contribute equal and opposite terms to both gradient sums.
     */
    noisy[0] += 5;
    noisy[SIZE * SIZE - 1] += 5;
    noisy[SIZE * 2] += 3;
    noisy[SIZE * 2 + 4] += 3;

    assert.ok(
        Math.abs(
            planeTiltDegrees(noisy, SPACING) - planeTiltDegrees(clean, SPACING)
        ) < 1e-9
    );
});

test('spacing scales the gradient, so the same heights over twice the ground are half as steep', () => {
    const heights = plane(tangent(20), 0);

    const near = planeTiltDegrees(heights, SPACING);
    const far = planeTiltDegrees(heights, SPACING * 2);

    assert.ok(Math.abs(Math.tan(far * Math.PI / 180) * 2 - Math.tan(near * Math.PI / 180)) < 1e-9);
});

test('the bands are anchored on the eight degree warning', () => {
    assert.deepEqual(TILT_BAND_EDGES, [2, 4, 6, 8]);
    assert.equal(TILT_LIMIT_BAND, 4);

    assert.equal(tiltBand(0), 0);
    assert.equal(tiltBand(1.999), 0);
    assert.equal(tiltBand(2), 1);
    assert.equal(tiltBand(3.999), 1);
    assert.equal(tiltBand(4), 2);
    assert.equal(tiltBand(5.999), 2);
    assert.equal(tiltBand(6), 3);
    assert.equal(tiltBand(7.999), 3);
    assert.equal(tiltBand(8), TILT_LIMIT_BAND);
    assert.equal(tiltBand(90), TILT_LIMIT_BAND);
});

test('unusable input falls into the steepest band rather than reading flat', () => {
    assert.equal(tiltBand(NaN), TILT_LIMIT_BAND);
    assert.equal(tiltBand(null), TILT_LIMIT_BAND);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/lib/flatness.test.mjs`
Expected: FAIL — `Cannot find module .../scripts/lib/flatness.mjs`

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/flatness.mjs`:

```js
/*
 * How steep the ground under a hull is, and which band of the flatness ramp
 * that lands in.
 *
 * The gun's footprint spans metres, and 2 m terrain data exaggerates the
 * gradient at the smallest scale, so a central difference across one cell
 * answers a question no vehicle asks. A plane fitted through the whole
 * footprint is the tilt the hull would actually take, and it is least
 * squares rather than a corner-to-corner slope so a single spiky sample
 * cannot dominate.
 *
 * The bands are anchored absolutely on the 8 degree threshold the app
 * already warns at, so the same colour means the same tilt on every map.
 * A per-map relative ramp was rejected in the spec: green would mean 4
 * degrees on Bakurani and 1.6 on Ozeti, and a legend that changes meaning
 * between maps is worse than no legend.
 *
 * Everything here is pure. The build script owns the file I/O and the
 * terrain sampling.
 */

export const TILT_BAND_EDGES = [2, 4, 6, 8];

/*
 * The first band a gun should not be parked in. The flatness ramp's red and
 * the firing-positions filter are the same predicate expressed once, so the
 * two layers cannot disagree about a cell on the boundary.
 */
export const TILT_LIMIT_BAND = TILT_BAND_EDGES.length;

export function tiltBand(degrees) {
    if (!Number.isFinite(degrees)) {
        return TILT_LIMIT_BAND;
    }

    for (let i = 0; i < TILT_BAND_EDGES.length; i += 1) {
        if (degrees < TILT_BAND_EDGES[i]) {
            return i;
        }
    }

    return TILT_LIMIT_BAND;
}

/*
 * Least squares over a regular square stencil collapses to two independent
 * sums: the sample offsets are symmetric about the centre and the two axes
 * are orthogonal, so the normal equations never have to be formed.
 */
export function planeTiltDegrees(samples, spacingMeters) {
    const size = Math.round(Math.sqrt(samples.length));

    if (size < 2 || size * size !== samples.length) {
        return NaN;
    }

    if (!Number.isFinite(spacingMeters) || spacingMeters <= 0) {
        return NaN;
    }

    const centre = (size - 1) / 2;

    let sumEast = 0;
    let sumNorth = 0;
    let sumSquares = 0;

    for (let row = 0; row < size; row += 1) {
        const north = (centre - row) * spacingMeters;

        for (let col = 0; col < size; col += 1) {
            const east = (col - centre) * spacingMeters;
            const z = samples[row * size + col];

            if (!Number.isFinite(z)) {
                return NaN;
            }

            sumEast += east * z;
            sumNorth += north * z;
        }

        sumSquares += size * north * north;
    }

    if (sumSquares <= 0) {
        return NaN;
    }

    const gradientEast = sumEast / sumSquares;
    const gradientNorth = sumNorth / sumSquares;

    return Math.atan(Math.hypot(gradientEast, gradientNorth)) * 180 / Math.PI;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/lib/flatness.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Register the test file**

In `package.json`, append ` scripts/lib/flatness.test.mjs` to the end of the `test:scripts` value.

Run: `npm run test:scripts`
Expected: PASS, the whole suite including the new file.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/flatness.mjs scripts/lib/flatness.test.mjs package.json
git commit -m "Hull tilt is the angle of a plane fitted through the footprint, not the gradient under one sample"
```

---

### Task 2: Bake the flatness raster

Turns the tilt arithmetic into `data/terrain/<map>/flatness.png` and `flatness.json` for both shipped maps. Structurally a copy of `scripts/build-hillshade.mjs` — read that file first, it is the pattern being followed.

Runtime is about 3 seconds per map, so there is no need to optimise the sampling.

**Files:**
- Create: `scripts/build-flatness.mjs`
- Modify: `package.json` (add the `build-flatness` script)
- Generates: `data/terrain/bakurani/flatness.{png,json}`, `data/terrain/ozeti/flatness.{png,json}` — all four committed

**Interfaces:**
- Consumes: `planeTiltDegrees`, `tiltBand`, `TILT_BAND_EDGES` from `scripts/lib/flatness.mjs`; `loadTerrainChunks`, `createTerrainSampler` from `scripts/lib/terrain-source.mjs`; `encodePng` from `scripts/lib/png.mjs`.
- Produces: the sidecar contract Task 4 reads —
  ```json
  {
    "format": "wardogs-flatness-v1",
    "mapId": "bakurani",
    "sampleSpacingMeters": 8,
    "stencilSpacingMeters": 2,
    "stencilSamples": 5,
    "bandEdgeDegrees": [2, 4, 6, 8],
    "bandShares": [0.036, 0.054, 0.066, 0.07, 0.774],
    "grid": { "width": 1379, "height": 1379, "originX": 23.35, "originY": 129.65, "stepX": 0.08, "stepY": 0.08 },
    "file": "flatness.png", "bytes": 0, "sha256": ""
  }
  ```
  The PNG is single-channel greyscale, one byte per cell holding the band index `0..4` verbatim — not a grey level. Task 4 colourises it.

- [ ] **Step 1: Read the file being copied**

Run: `sed -n '1,120p' scripts/build-hillshade.mjs`

Note in particular `parseArgs`, `discoverMaps`, the `existsSync` guard that skips maps without terrain, the grid formula, and the sidecar's `bytes`/`sha256` fields. Keep all of it.

- [ ] **Step 2: Write the builder**

Create `scripts/build-flatness.mjs`:

```js
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
```

- [ ] **Step 3: Add the npm script**

In `package.json`, after the `"build-hillshade"` line, add:

```json
"build-flatness": "node scripts/build-flatness.mjs",
```

- [ ] **Step 4: Run the builder and check the numbers**

Run: `npm run build-flatness`

Expected, and these are acceptance criteria — a band-4 share off by more than half a point means the stencil changed meaning:

```
bakurani: 1379x1379 cells, bands 3.6% 5.4% 6.6% 7.0% 77.4%, ... KB PNG
ozeti: 1069x972 cells, bands 12.4% 11.8% 13.8% 14.0% 48.0%, ... KB PNG
```

- [ ] **Step 5: Check the raster is small and the grid matches the hillshade's**

Run:
```bash
node -e "for (const m of ['bakurani','ozeti']) { const f=require('./data/terrain/'+m+'/flatness.json'), h=require('./data/terrain/'+m+'/hillshade.json'); console.log(m, f.bytes, JSON.stringify(f.grid)===JSON.stringify(h.grid) ? 'grid matches hillshade' : 'GRID MISMATCH'); }"
```
Expected: `grid matches hillshade` for both, and each `bytes` under 300000.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-flatness.mjs package.json data/terrain/bakurani/flatness.png data/terrain/bakurani/flatness.json data/terrain/ozeti/flatness.png data/terrain/ozeti/flatness.json
git commit -m "The flat ground on both maps is baked into a band raster, and Bakurani turns out to be four fifths too steep to park on"
```

---

### Task 3: Regroup the Layers popover

`deadGround` and `crossSection` currently sit in the group titled "Markers", which they are not. This task splits the popover into five groups so the two new layers have somewhere coherent to land. No new layers yet — this is a pure reorganisation, reviewable on its own.

The group-level checkbox selects everything in its group, so this changes what "select all" means: "turn on every terrain layer" becomes possible and "turn on every marker and also dead ground" stops being.

**Files:**
- Modify: `js/map/map-tools.js:1243` (the `groups` array inside `buildMapLayers`)
- Modify: `locales/en.json` (two new keys)

**Interfaces:**
- Consumes: nothing.
- Produces: group ids `base`, `terrain`, `firing`, `tactical`, `personal`. Tasks 4 and 7 append one item each to `terrain` and `firing`.

- [ ] **Step 1: Add the two group titles**

In `locales/en.json`, beside the other `mapLayer*` keys (around line 92):

```json
"mapLayerGroupTerrain": "Terrain",
"mapLayerGroupFiring": "Firing",
```

- [ ] **Step 2: Rewrite the groups array**

In `js/map/map-tools.js`, replace the whole `const groups = [ ... ];` literal (starting at line 1243) with:

```js
    const groups = [
        {
            id: 'base',
            titleKey: 'map',
            items: [
                ['tiles', 'mapLayerMap'],
                ['grid', 'mapLayerGrid']
            ]
        },
        /*
         * Everything baked from the height data and fetched on demand. The
         * three here are the only layers that cost a download, which is why
         * turning the group on as a unit is a thing worth being able to do.
         */
        {
            id: 'terrain',
            titleKey: 'mapLayerGroupTerrain',
            items: [
                ...contourLayer,
                ...hillshadeLayer
            ]
        },
        /*
         * Everything derived from the projectile model: the layers that
         * answer whether a shell can be put somewhere, rather than what is
         * there.
         */
        {
            id: 'firing',
            titleKey: 'mapLayerGroupFiring',
            items: [
                ['deadGround', 'mapLayerDeadGround'],
                ...crossSectionLayer
            ]
        },
        {
            id: 'tactical',
            titleKey: 'mapToolMarkers',
            items: [
                ['zones', 'mapLayerZones'],
                ['polygons', 'mapLayerPolygons'],
                ['presetMarkers', 'mapLayerPresetMarkers'],
                ['mainZone', 'mapLayerMainZone'],
                ['fobAreas', 'mapLayerFobAreas'],
                ['artillery', 'mapLayerArtillery'],
                ['savedTargets', 'mapLayerSavedTargets']
            ]
        },
        {
            id: 'personal',
            titleKey: 'mapToolsToggle',
            items: [
                ['drawings', 'mapLayerDrawings'],
                ['userMarkers', 'mapLayerUserMarkers'],
                ['cursorCoords', 'mapLayerCursorCoordinates'],
                ['milCursor', 'mapLayerMilCursor']
            ]
        }
    ];
```

- [ ] **Step 3: Guard against an empty group**

A map with no contours and no hillshade would render a "Terrain" heading with nothing under it, and its group checkbox would report `every()` on an empty array as checked. Immediately after the `groups` literal, add:

```js
    const visibleGroups = groups.filter(group => group.items.length);
```

and change the two later uses from `groups.forEach(` to `visibleGroups.forEach(`. There is one such call, near the end of `buildMapLayers`.

- [ ] **Step 4: Verify in the running app**

Run: `npm run dev`

Open the map, open the Layers popover, and confirm:
- Five headings in order: Map, Terrain, Firing, Markers, Map tools.
- Terrain holds Contours and Shaded relief; Firing holds Dead ground (low arc) and Trajectory cross-section.
- Markers no longer lists dead ground or the cross-section.
- Ticking the Terrain group checkbox turns both terrain layers on and starts both downloads; unticking turns both off.
- Switching to a map without terrain data does not render an empty Terrain heading.

- [ ] **Step 5: Commit**

```bash
git add js/map/map-tools.js locales/en.json
git commit -m "Dead ground and the cross-section leave the markers group, because neither is a marker"
```

---

### Task 4: Draw the flatness layer

The runtime half. Same five functions as `js/map/hillshade.js`, with one addition: the baked PNG holds band indices, not colours, so the module paints them through a palette onto an offscreen canvas once at load. Read `js/map/hillshade.js` end to end first — this file is deliberately its twin.

**Files:**
- Create: `js/map/flatness.js`
- Test: `scripts/lib/flatness-runtime.test.mjs`
- Modify: `js/map/map-tools.js` (state entry, two load hooks, group item, icon)
- Modify: `js/map/renderer.js:147` (draw call, between the hillshade and the contours)
- Modify: `locales/en.json` (`mapLayerFlatness`)
- Modify: `scripts/lib/config.test.mjs:66` (allowlist assertion)
- Modify: 11 files under `src/pages/` (script tag)
- Modify: `package.json` (`test:scripts`)

**Interfaces:**
- Consumes: `data/terrain/<map>/flatness.{png,json}` from Task 2; the `terrain` group from Task 3.
- Produces: globals `FLATNESS_MAP_IDS`, `mapHasFlatness(mapId)`, `loadFlatness(mapId)`, `cachedFlatness(mapId)`, `ensureFlatnessLoaded(mapId)`, `drawFlatness(currentMap)`, and `flatnessPalette()` returning five `[r, g, b]` triples. Task 7 mirrors this shape.

- [ ] **Step 1: Write the failing runtime test**

Create `scripts/lib/flatness-runtime.test.mjs`:

```js
/*
 * The flatness layer's bookkeeping: a map with no raster is never fetched,
 * a failed load is remembered so it does not re-request on every redraw,
 * and the band indices come out of the palette as the colours the ramp
 * promises.
 *
 * Run with: npm run test:scripts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

function flatnessCtx(overrides = {}) {
    return loadRuntime(['js/map/flatness.js'], {
        getCoordinateMetersPerUnit: () => 100,
        decodeMapImage: () => Promise.reject(new Error('no decoder in the test')),
        fetch: () => Promise.reject(new Error('no network in the test')),
        document: { createElement: () => { throw new Error('no canvas in the test'); } },
        draw: () => {},
        console: { warn: () => {} },
        ...overrides
    });
}

test('only the maps with a baked raster are offered the layer', () => {
    const ctx = flatnessCtx();

    /*
     * Through JSON, because the array is built inside the vm's own realm
     * and deepEqual compares constructors.
     */
    assert.deepEqual(
        JSON.parse(callRuntime(ctx, 'JSON.stringify(FLATNESS_MAP_IDS)')),
        ['bakurani', 'ozeti']
    );

    assert.equal(callRuntime(ctx, 'mapHasFlatness("bakurani")'), true);
    assert.equal(callRuntime(ctx, 'mapHasFlatness("custom")'), false);
    assert.equal(callRuntime(ctx, 'mapHasFlatness(null)'), false);
});

test('an unsupported map resolves to null without touching the network', () => {
    let fetched = 0;

    const ctx = flatnessCtx({
        fetch: () => { fetched += 1; return Promise.reject(new Error('x')); }
    });

    return callRuntime(ctx, 'loadFlatness("custom")').then(entry => {
        assert.equal(entry, null);
        assert.equal(fetched, 0);
    });
});

test('a failed load is cached as null so the redraw does not re-request it', () => {
    let fetched = 0;

    const ctx = flatnessCtx({
        fetch: () => { fetched += 1; return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' }); }
    });

    return callRuntime(ctx, 'loadFlatness("bakurani")')
        .then(entry => {
            assert.equal(entry, null);
            assert.equal(fetched, 1);

            return callRuntime(ctx, 'loadFlatness("bakurani")');
        })
        .then(entry => {
            assert.equal(entry, null);
            assert.equal(fetched, 1);
            assert.equal(callRuntime(ctx, 'cachedFlatness("bakurani")'), null);
        });
});

test('a payload in the wrong format is refused rather than drawn as noise', () => {
    const ctx = flatnessCtx({
        fetch: () => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ format: 'wardogs-hillshade-v1' })
        })
    });

    return callRuntime(ctx, 'loadFlatness("bakurani")').then(entry => {
        assert.equal(entry, null);
    });
});

test('the palette runs green to red across one entry per band', () => {
    const ctx = flatnessCtx();
    const palette = callRuntime(ctx, 'JSON.stringify(flatnessPalette())');
    const bands = JSON.parse(palette);

    assert.equal(bands.length, 5);

    for (const band of bands) {
        assert.equal(band.length, 3);

        for (const channel of band) {
            assert.ok(Number.isInteger(channel) && channel >= 0 && channel <= 255);
        }
    }

    assert.ok(bands[0][1] > bands[0][0], 'the flattest band is green-dominant');
    assert.ok(bands[4][0] > bands[4][1], 'the steepest band is red-dominant');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/lib/flatness-runtime.test.mjs`
Expected: FAIL — `ENOENT ... js/map/flatness.js`

- [ ] **Step 3: Write the layer**

Create `js/map/flatness.js`:

```js
/* =========================
   FLATNESS
   ========================= */

/*
 * Hull tilt everywhere on the map, baked by scripts/build-flatness.mjs into
 * one band raster per map and drawn between the hillshade and the contours.
 *
 * The app has warned about ground steeper than 8 degrees since the firing
 * range measurements of 2026-09-03, because hull tilt moves the impact
 * further than any error in the ballistics. It could never say where the
 * flat ground was, so the warning arrived after the position was chosen,
 * which is the wrong order.
 *
 * The PNG holds band indices, not colours, so the ramp lives here and can
 * be retuned without rebaking every map. The bands are anchored absolutely
 * on that same 8 degree threshold, so a colour means the same tilt on every
 * map: Bakurani reading four fifths red is the correct answer, not a
 * calibration failure.
 *
 * Like the hillshade, this is a separate download nobody who leaves the
 * layer off ever makes.
 *
 * Two things the layer cannot know. There is no water data in the
 * repository, so lake and river surfaces are perfectly flat and read green;
 * both shipped maps have both. And buildings and props are not in the
 * height field, so ground this calls flat can still be occupied.
 */

const FLATNESS_FORMAT = 'wardogs-flatness-v1';

/*
 * Maps known to ship a flatness.png. Listed rather than probed so the
 * Layers popover can decide whether to offer the toggle without a fetch.
 * scripts/lib/config.test.mjs holds this to the files on disk.
 */
const FLATNESS_MAP_IDS = [
    'bakurani',
    'ozeti'
];

const FLATNESS_OPACITY = 0.45;

const FLATNESS_CACHE = new Map();

/*
 * One entry per band, flattest first. Green through amber to red, with the
 * steepest band the only one that reads as a refusal.
 */
function flatnessPalette() {
    return [
        [29, 156, 86],
        [110, 168, 40],
        [192, 147, 19],
        [207, 114, 25],
        [196, 69, 58]
    ];
}

function mapHasFlatness(mapId) {
    return FLATNESS_MAP_IDS.includes(mapId);
}

/*
 * Terrain data is not version-stamped by scripts/version-assets.mjs, so the
 * paths are plain.
 */
function flatnessUrl(mapId) {
    return `data/terrain/${mapId}/flatness.png`;
}

function flatnessHeaderUrl(mapId) {
    return `data/terrain/${mapId}/flatness.json`;
}

function flatnessGrid(payload) {
    const grid = payload?.grid || {};

    const geometry = {
        originX: Number(grid.originX),
        originY: Number(grid.originY),
        stepX: Number(grid.stepX),
        stepY: Number(grid.stepY),
        width: Number(grid.width),
        height: Number(grid.height)
    };

    const usable = Object.values(geometry).every(
        value => Number.isFinite(value) && value !== 0
    );

    if (!usable) {
        throw new Error('Flatness payload has an unusable grid');
    }

    return geometry;
}

/*
 * Paints band indices through the palette once, at load. The alternative is
 * a per-frame pass over 1.9 million cells, which is the thing this layer
 * exists to avoid.
 */
function colouriseFlatness(image, grid) {
    const canvas = document.createElement('canvas');

    canvas.width = grid.width;
    canvas.height = grid.height;

    const context = canvas.getContext('2d', { willReadFrequently: true });

    context.drawImage(image, 0, 0);

    const pixels = context.getImageData(0, 0, grid.width, grid.height);
    const data = pixels.data;
    const palette = flatnessPalette();
    const last = palette.length - 1;

    for (let i = 0; i < data.length; i += 4) {
        const band = palette[Math.min(last, data[i])];

        data[i] = band[0];
        data[i + 1] = band[1];
        data[i + 2] = band[2];
        data[i + 3] = 255;
    }

    context.putImageData(pixels, 0, 0);

    return canvas;
}

/*
 * Resolves to the coloured raster for a map, or null if the map has none.
 * Concurrent callers share one load, and a failure is cached as null so a
 * missing file does not re-request on every redraw.
 */
function loadFlatness(mapId) {
    if (!mapHasFlatness(mapId)) {
        return Promise.resolve(null);
    }

    if (FLATNESS_CACHE.has(mapId)) {
        return Promise.resolve(FLATNESS_CACHE.get(mapId));
    }

    const pending = fetch(flatnessHeaderUrl(mapId))
        .then(response => {
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}`);
            }

            return response.json();
        })
        .then(payload => {
            if (payload?.format !== FLATNESS_FORMAT) {
                throw new Error(`Unsupported flatness format ${payload?.format}`);
            }

            const grid = flatnessGrid(payload);

            return decodeMapImage(flatnessUrl(mapId)).then(image => {
                const entry = { image: colouriseFlatness(image, grid), grid };

                FLATNESS_CACHE.set(mapId, entry);

                return entry;
            });
        })
        .catch(error => {
            console.warn(
                `[flatness] Could not load ${mapId} tilt; ` +
                'the layer will stay empty.',
                error
            );

            FLATNESS_CACHE.set(mapId, null);

            return null;
        });

    FLATNESS_CACHE.set(mapId, pending);

    return pending;
}

function cachedFlatness(mapId) {
    const cached = FLATNESS_CACHE.get(mapId);

    if (!cached || typeof cached.then === 'function') {
        return null;
    }

    return cached;
}

/*
 * Called when the layer is switched on, and on map change while it is on.
 * The load is fire-and-forget: draw() renders nothing until it lands, then
 * redraws.
 */
function ensureFlatnessLoaded(mapId) {
    if (!mapId || FLATNESS_CACHE.has(mapId)) {
        return;
    }

    loadFlatness(mapId).then(entry => {
        if (entry) {
            draw();
        }
    });
}

function drawFlatness(currentMap) {
    const mapId = currentMap?.id;

    if (!mapId || !mapHasFlatness(mapId)) {
        return;
    }

    ensureFlatnessLoaded(mapId);

    const data = cachedFlatness(mapId);

    if (!data) {
        return;
    }

    const v = view();
    const grid = data.grid;

    /*
     * A pixel is a sample point, so the image covers half a cell beyond the
     * outermost samples on every side.
     */
    const gameMinX = grid.originX - grid.stepX / 2;
    const gameMaxY = grid.originY + grid.stepY / 2;
    const gameWidth = grid.width * grid.stepX;
    const gameHeight = grid.height * grid.stepY;

    const previousAlpha = ctx.globalAlpha;

    ctx.globalAlpha = previousAlpha * FLATNESS_OPACITY;

    ctx.drawImage(
        data.image,
        (gameMinX - v.bounds.minX) * v.scale,
        (v.bounds.maxY - gameMaxY) * v.scale,
        gameWidth * v.scale,
        gameHeight * v.scale
    );

    ctx.globalAlpha = previousAlpha;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/lib/flatness-runtime.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit the layer before wiring it**

```bash
git add js/map/flatness.js scripts/lib/flatness-runtime.test.mjs
git commit -m "The tilt raster is coloured once at load, so the layer costs one drawImage a frame"
```

---
- [ ] **Step 6: Wire the state entry**

In `js/map/map-tools.js`, in `MAP_TOOL_STATE.layers` (around line 74), after the `hillshade: false,` entry:

```js
        /*
         * Off by default for the same reason: the tilt raster is a quarter
         * of a megabyte, fetched only when somebody asks for it.
         */
        flatness: false,
```

- [ ] **Step 7: Wire the two load hooks**

In `setMapLayerVisible`, after the existing `hillshade` block:

```js
    if (
        layer === 'flatness' &&
        visible &&
        typeof ensureFlatnessLoaded === 'function'
    ) {
        ensureFlatnessLoaded(currentMapToolMapId());
    }
```

In `setMapLayerGroupVisible`, after the existing `hillshade` block:

```js
    if (
        nextVisible &&
        layerIds.includes('flatness') &&
        typeof ensureFlatnessLoaded === 'function'
    ) {
        ensureFlatnessLoaded(
            currentMapToolMapId()
        );
    }
```

- [ ] **Step 8: Wire the popover entry and icon**

In `buildMapLayers`, after the `hillshadeLayer` declaration:

```js
    const flatnessLayer = (
        typeof mapHasFlatness === 'function' &&
        mapHasFlatness(
            currentMapToolMapId()
        )
    )
        ? [['flatness', 'mapLayerFlatness']]
        : [];
```

Add `...flatnessLayer` as the last item of the `terrain` group.

In the `icons` object, after the `hillshade` entry — a spirit level, which is what the layer measures:

```js
        flatness: `
            <rect x="3" y="9" width="18" height="6" rx="1"/>
            <path d="M10.5 12a1.5 1.5 0 0 1 3 0 1.5 1.5 0 0 1-3 0"/>
            <path d="M9 9v6M15 9v6"/>
        `,
```

In `locales/en.json`, beside the other layer labels:

```json
"mapLayerFlatness": "Flat ground",
```

- [ ] **Step 9: Wire the draw call**

In `js/map/renderer.js`, between the hillshade block and the contours block (after line 150):

```js
    /*
     * Layer 3:
     * hull tilt, above the relief that shades the same ground and below the
     * contours that measure it.
     */
    if (isMapLayerVisible('flatness')) {
        drawFlatness(currentMap);
    }
```

Renumber the comments on the blocks below it — the contours become Layer 4, the grid Layer 5, and so on to the end of `draw()`.

- [ ] **Step 10: Wire the script tag**

In each of the 11 page templates, immediately after the `js/map/hillshade.js` line:

```html
<script src="js/map/flatness.js"></script>
```

Run: `grep -c 'js/map/flatness.js' src/pages/index.html src/pages/mobile/index.html src/pages/locales/*.html`
Expected: `1` for all 11 files.

- [ ] **Step 11: Hold the allowlist to the files on disk**

In `scripts/lib/config.test.mjs`, in the test named `the map allowlists match the terrain files on disk and each other`, after the hillshade assertion:

```js
    assert.deepEqual(allowlist('js/map/flatness.js', 'FLATNESS_MAP_IDS'), withFile('flatness.json'));
```

- [ ] **Step 12: Register the test and run everything**

Append ` scripts/lib/flatness-runtime.test.mjs` to `test:scripts` in `package.json`.

Run: `npm run test:scripts`
Expected: PASS, whole suite.

- [ ] **Step 13: Verify in the running app**

Run: `npm run dev`

- Layers popover, Terrain group, shows "Flat ground".
- Ticking it fetches `flatness.png` once — check the network panel — and paints a green-to-red wash over the map.
- Bakurani is overwhelmingly red; Ozeti is roughly half green and amber. Compare against `data/terrain/<map>/flatness.json` `bandShares`.
- The wash lies under the contour lines and over the shaded relief.
- The colours line up with the terrain: valley floors and ridge tops green, valley walls red.
- Panning and zooming stays smooth — the layer must not cost measurable frame time.
- Unticking and re-ticking does not re-fetch.

- [ ] **Step 14: Commit**

```bash
git add js/map/map-tools.js js/map/renderer.js locales/en.json scripts/lib/config.test.mjs package.json src/pages
git commit -m "The flat ground is a layer of its own, so the tilt warning arrives before the position is chosen"
```

---

### Task 5: Aim points and the outline

The pure half of the firing-positions layer: where the shots have to land, and how a viability mask becomes something with an edge. No terrain, no ballistics, no I/O.

**Files:**
- Create: `scripts/lib/firing-positions.mjs`
- Test: `scripts/lib/firing-positions.test.mjs`
- Modify: `package.json` (`test:scripts`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `AIM_RING_METRES: number` — `300`.
  - `AIM_RING_POINTS: number` — `8`.
  - `CELL_OUTSIDE`, `CELL_INTERIOR`, `CELL_BOUNDARY` — `0`, `1`, `2`.
  - `aimPoints(towers, options?): {x: number, y: number}[]` — `towers` is `[{x, y}]` in game units. Returns each tower's centre followed by `AIM_RING_POINTS` points evenly spaced on a ring of `AIM_RING_METRES`, also in game units. `options` accepts `ringMeters`, `ringPoints`, `metresPerGameUnit` (default `100`).
  - `outlineMask(viable, width, height): Uint8Array` — `viable` is any array-like that is truthy where a cell is viable. Returns one byte per cell.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/firing-positions.test.mjs`:

```js
/*
 * Pins down the two pieces of the firing-positions layer that have nothing
 * to do with terrain: where the shots have to land, and where the edge of
 * a viable region is.
 *
 * Run with: npm run test:scripts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    AIM_RING_METRES,
    AIM_RING_POINTS,
    CELL_BOUNDARY,
    CELL_INTERIOR,
    CELL_OUTSIDE,
    aimPoints,
    outlineMask
} from './firing-positions.mjs';

test('each tower contributes its centre and a ring around it', () => {
    const points = aimPoints([{ x: 10, y: 20 }, { x: 30, y: 40 }]);

    assert.equal(points.length, 2 * (1 + AIM_RING_POINTS));
    assert.deepEqual({ ...points[0] }, { x: 10, y: 20 });
    assert.deepEqual({ ...points[1 + AIM_RING_POINTS] }, { x: 30, y: 40 });
});

test('the ring sits at three hundred metres in game units', () => {
    const points = aimPoints([{ x: 0, y: 0 }]);
    const radius = AIM_RING_METRES / 100;

    for (let i = 1; i <= AIM_RING_POINTS; i += 1) {
        assert.ok(
            Math.abs(Math.hypot(points[i].x, points[i].y) - radius) < 1e-12,
            `point ${i}`
        );
    }
});

test('the ring points are evenly spaced and distinct', () => {
    const points = aimPoints([{ x: 0, y: 0 }]).slice(1);

    const bearings = points
        .map(p => (Math.atan2(p.x, p.y) * 180 / Math.PI + 360) % 360)
        .sort((a, b) => a - b);

    for (let i = 0; i < bearings.length; i += 1) {
        assert.ok(
            Math.abs(bearings[i] - i * (360 / AIM_RING_POINTS)) < 1e-9,
            `bearing ${i} was ${bearings[i]}`
        );
    }
});

test('the map decides the scale, so a metre is not assumed to be a hundredth of a unit', () => {
    const points = aimPoints([{ x: 0, y: 0 }], { metresPerGameUnit: 1 });

    assert.ok(
        Math.abs(Math.hypot(points[1].x, points[1].y) - AIM_RING_METRES) < 1e-9
    );
});

test('no towers means no aim points, and every position trivially passes', () => {
    assert.deepEqual(aimPoints([]), []);
});

test('a single viable cell is all edge and no interior', () => {
    const mask = outlineMask([0, 0, 0, 0, 1, 0, 0, 0, 0], 3, 3);

    assert.equal(mask[4], CELL_BOUNDARY);
    assert.equal(mask[0], CELL_OUTSIDE);
    assert.equal(mask.filter(v => v === CELL_INTERIOR).length, 0);
});

test('a solid block has an interior wrapped in a boundary', () => {
    const viable = new Uint8Array(25).fill(1);
    const mask = outlineMask(viable, 5, 5);

    assert.equal(mask[12], CELL_INTERIOR);

    for (const index of [0, 2, 4, 10, 14, 20, 22, 24]) {
        assert.equal(mask[index], CELL_BOUNDARY, `index ${index}`);
    }
});

test('a hole is outlined from the inside', () => {
    const viable = new Uint8Array(25).fill(1);

    viable[12] = 0;

    const mask = outlineMask(viable, 5, 5);

    assert.equal(mask[12], CELL_OUTSIDE);
    assert.equal(mask[7], CELL_BOUNDARY);
    assert.equal(mask[11], CELL_BOUNDARY);
    assert.equal(mask[13], CELL_BOUNDARY);
    assert.equal(mask[17], CELL_BOUNDARY);
});

test('the raster edge counts as an edge, so a region running off the map is still outlined', () => {
    const mask = outlineMask(new Uint8Array(9).fill(1), 3, 3);

    assert.equal(mask.filter(v => v === CELL_INTERIOR).length, 1);
    assert.equal(mask[4], CELL_INTERIOR);
});

test('diagonal neighbours do not keep a cell off the boundary', () => {
    /*
     * A plus shape: the centre has all four orthogonal neighbours and so is
     * interior, while every arm is missing three and is boundary.
     */
    const viable = [0, 1, 0, 1, 1, 1, 0, 1, 0];
    const mask = outlineMask(viable, 3, 3);

    assert.equal(mask[4], CELL_INTERIOR);
    assert.equal(mask[1], CELL_BOUNDARY);
    assert.equal(mask[3], CELL_BOUNDARY);
    assert.equal(mask[5], CELL_BOUNDARY);
    assert.equal(mask[7], CELL_BOUNDARY);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/lib/firing-positions.test.mjs`
Expected: FAIL — `Cannot find module .../scripts/lib/firing-positions.mjs`

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/firing-positions.mjs`:

```js
/*
 * Where an SPG has to be able to land a shell, and how a mask of the ground
 * that can becomes something with a drawable edge.
 *
 * The aim points are not the towers. Towers move between matches, so a
 * position that can only just reach one of them today cannot be trusted
 * tomorrow; the 300 m ring is what absorbs that, and changing it moves
 * every figure in the spec. A position is viable only if every point in the
 * set is reachable, which is a deliberately strict reading of "can range
 * every tower".
 *
 * The outline exists because the layer is drawn over the flatness ramp and
 * a second translucent wash would tint the bands underneath into
 * illegibility. Marking the boundary at bake time keeps the runtime cost at
 * one drawImage, which is the invariant the whole design rests on.
 *
 * Everything here is pure. The build script owns the terrain and the
 * ballistics.
 */

export const AIM_RING_METRES = 300;

export const AIM_RING_POINTS = 8;

export const CELL_OUTSIDE = 0;
export const CELL_INTERIOR = 1;
export const CELL_BOUNDARY = 2;

const METRES_PER_GAME_UNIT = 100;

export function aimPoints(towers, options = {}) {
    const ringMeters = options.ringMeters ?? AIM_RING_METRES;
    const ringPoints = options.ringPoints ?? AIM_RING_POINTS;
    const scale = options.metresPerGameUnit ?? METRES_PER_GAME_UNIT;

    const radius = ringMeters / scale;
    const points = [];

    for (const tower of towers) {
        points.push({ x: tower.x, y: tower.y });

        for (let i = 0; i < ringPoints; i += 1) {
            const bearing = (i / ringPoints) * 2 * Math.PI;

            points.push({
                x: tower.x + radius * Math.sin(bearing),
                y: tower.y + radius * Math.cos(bearing)
            });
        }
    }

    return points;
}

/*
 * A viable cell is on the boundary when any of its four orthogonal
 * neighbours is not viable. Cells on the raster edge count as boundary
 * too: a region that runs off the map has an edge there as far as anyone
 * looking at the map is concerned, and drawing it open would read as the
 * region continuing.
 */
export function outlineMask(viable, width, height) {
    const mask = new Uint8Array(width * height);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const index = y * width + x;

            if (!viable[index]) {
                continue;
            }

            const enclosed =
                x > 0 && x < width - 1 &&
                y > 0 && y < height - 1 &&
                Boolean(viable[index - 1]) &&
                Boolean(viable[index + 1]) &&
                Boolean(viable[index - width]) &&
                Boolean(viable[index + width]);

            mask[index] = enclosed ? CELL_INTERIOR : CELL_BOUNDARY;
        }
    }

    return mask;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/lib/firing-positions.test.mjs`
Expected: PASS, 10 tests.

- [ ] **Step 5: Register the test and commit**

Append ` scripts/lib/firing-positions.test.mjs` to `test:scripts` in `package.json`.

```bash
npm run test:scripts
git add scripts/lib/firing-positions.mjs scripts/lib/firing-positions.test.mjs package.json
git commit -m "A firing position must reach a ring around each tower, because the towers move between matches"
```

---

### Task 6: Bake the firing-positions rasters

The expensive one. Three filters in cheapest-first order over every 8 m cell of the map, run twice — once forcing the low arc, once allowing either — producing four files per map.

Measured: about nine minutes for Bakurani and seven for Ozeti, on one core. That is why the filter order matters and why nothing here happens at runtime.

**Files:**
- Create: `scripts/build-firing-positions.mjs`
- Modify: `package.json` (add the `build-firing-positions` script)
- Generates: `data/terrain/<map>/firing-positions-{low,any}.{png,json}` for both maps — all eight committed

**Interfaces:**
- Consumes: `planeTiltDegrees`, `tiltBand`, `TILT_LIMIT_BAND` from `scripts/lib/flatness.mjs`; `aimPoints`, `outlineMask`, `CELL_*` from `scripts/lib/firing-positions.mjs`; `loadTerrainChunks`, `createTerrainSampler` from `scripts/lib/terrain-source.mjs`; `encodePng` from `scripts/lib/png.mjs`; and the shipped browser code through `loadRuntime`.
- Produces: the sidecar contract Task 7 reads —
  ```json
  {
    "format": "wardogs-firing-positions-v1",
    "mapId": "bakurani",
    "arc": "low",
    "weaponId": "spg",
    "sampleSpacingMeters": 8,
    "aimRingMeters": 300,
    "aimPoints": 45,
    "viableKm2": 0,
    "grid": { "width": 1379, "height": 1379, "originX": 23.35, "originY": 129.65, "stepX": 0.08, "stepY": 0.08 },
    "file": "firing-positions-low.png", "bytes": 0, "sha256": ""
  }
  ```

#### Why the verdict goes through the shipped code

The clearance filter calls `assessShot` from `js/ballistics/reachability.js` inside a `node:vm` context, rather than reimplementing the march. A position this layer marks viable and `assessShot` then refuses would be worse than no layer, and the only way to guarantee they agree is to run the same function.

Three things make that work, and all three are easy to get subtly wrong:

1. **`assessShot` fetches its own heightfield in the browser.** In the builder there is no `fetch`, so the three functions it uses to get one are replaced after load: `mapHasHeightfield`, `ensureHeightfieldLoaded` and `cachedHeightfield` are reassigned to hand back a field the builder decoded itself.
2. **The weapon must be normalised.** Raw `data/weapons.json` carries `minRangeKm` / `maxRangeKm`; `arcDeclaredRange` reads `minRange` / `maxRange`. Feeding it the raw entry silently widens the envelope, so the builder loads `js/features/weapons.js` and calls `normalizeWeapon`.
3. **Cross the vm boundary once per cell, not once per aim point.** The per-call overhead is roughly 240 µs; at 45 aim points and tens of thousands of cells that is the difference between minutes and hours. The aim loop is compiled once, inside the context, and called with a cell.

- [ ] **Step 1: Confirm the runtime loads under node**

Before writing anything, check the four browser files load cleanly in a vm and expose what is needed:

```bash
node --input-type=module -e "
import { loadRuntime, callRuntime } from './scripts/lib/runtime-globals.mjs';
const ctx = loadRuntime(
  ['js/map/heightfield.js','js/map/range-ring.js','js/ballistics/model.js','js/ballistics/reachability.js','js/features/weapons.js'],
  { getCoordinateMetersPerUnit: () => 100, fetchJSON: () => {}, document: {}, draw: () => {}, localStorage: { getItem: () => null, setItem: () => {} } }
);
console.log(['assessShot','arcDeclaredRange','normalizeWeapon','heightfieldSample'].map(n => n + ':' + typeof callRuntime(ctx, n)).join(' '));
"
```
Expected: `assessShot:function arcDeclaredRange:function normalizeWeapon:function heightfieldSample:function`

- [ ] **Step 2: Write the builder**

Create `scripts/build-firing-positions.mjs`:

```js
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
```

- [ ] **Step 3: Add the npm script**

In `package.json`, after `"build-flatness"`:

```json
"build-firing-positions": "node scripts/build-firing-positions.mjs",
```

- [ ] **Step 4: Run the builder and check the numbers**

Run: `npm run build-firing-positions`

These figures were measured from the implementation above. They are acceptance criteria — a surviving area off by more than about 15% means a filter has changed meaning, and spawn shares that have gone flat across the three spawns mean one has stopped applying at all.

```
bakurani: 1379x1379 cells, 45 aim points, in envelope 6.51 km2, flat enough 2.45 km2, ~550s
  low 0.33 km2, Valkyra 51% Manticore 3% Lonestar 46%
  any 2.43 km2, Valkyra 36% Manticore 25% Lonestar 39%
ozeti: 1069x972 cells, 36 aim points, in envelope 5.02 km2, flat enough 2.48 km2, ~440s
  low 0.27 km2, Valkyra 15% Manticore 55% Lonestar 30%
  any 2.45 km2, Valkyra 50% Manticore 17% Lonestar 33%
```

Two things in that output are worth staring at, because they are what the arc toggle exists for:

- On **Bakurani**, MANTICORE holds 3% of the viable set under the low arc and 25% under any mil. Its problem is not distance — it is that everything within reach has to be lobbed.
- On **Ozeti** the ranking flips the other way. MANTICORE leads at 55% under the low arc and falls to 17%, while VALKYRA climbs from 15% to 50%. Neither map has a team that is simply worse, which is the argument for shipping both rasters rather than picking one.

If those two patterns are not in the output, the arc filter is not doing what the spec says it does, and the areas looking right does not make up for it.

- [ ] **Step 5: Check the rasters against the flatness layer**

The two builders must agree about which ground is flat enough, and forcing the low arc can only ever remove positions:

```bash
node --input-type=module -e "
import { readFile } from 'node:fs/promises';
for (const id of ['bakurani', 'ozeti']) {
  const flat = JSON.parse(await readFile('data/terrain/' + id + '/flatness.json', 'utf8'));
  const low = JSON.parse(await readFile('data/terrain/' + id + '/firing-positions-low.json', 'utf8'));
  const any = JSON.parse(await readFile('data/terrain/' + id + '/firing-positions-any.json', 'utf8'));
  const same = JSON.stringify(flat.grid) === JSON.stringify(low.grid) && JSON.stringify(low.grid) === JSON.stringify(any.grid);
  console.log(id, same ? 'grids agree' : 'GRID MISMATCH', low.viableKm2, any.viableKm2, low.viableKm2 < any.viableKm2 ? 'any is the superset' : 'ARC ORDER WRONG');
}
"
```
Expected: `grids agree` and `any is the superset` for both maps.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-firing-positions.mjs package.json data/terrain/bakurani/firing-positions-* data/terrain/ozeti/firing-positions-*
git commit -m "A third of a square kilometre of Bakurani can range every tower on the low arc, and almost none of it belongs to Manticore"
```

---

### Task 7: Draw the firing-positions layer with its arc toggle

The last piece. Structurally Task 4's twin, with two differences: the cache is keyed on map *and* arc, and the popover row carries a segmented control beneath it. Read the `js/map/flatness.js` you wrote in Task 4 first.

**Files:**
- Create: `js/map/firing-positions.js`
- Test: `scripts/lib/firing-positions-runtime.test.mjs`
- Modify: `js/map/map-tools.js` (state entry, arc state, two load hooks, group item, icon, segmented control)
- Modify: `js/map/renderer.js` (draw call, after the flatness block)
- Modify: `css/` — the stylesheet that holds `.map-layer-toggle` (find it with `grep -rln 'map-layer-toggle' css/`)
- Modify: `locales/en.json` (three keys)
- Modify: `scripts/lib/config.test.mjs` (allowlist assertion)
- Modify: 11 files under `src/pages/` (script tag)
- Modify: `package.json` (`test:scripts`)

**Interfaces:**
- Consumes: `data/terrain/<map>/firing-positions-{low,any}.{png,json}` from Task 6; the `firing` group from Task 3; `CELL_OUTSIDE`/`CELL_INTERIOR`/`CELL_BOUNDARY` values `0`/`1`/`2` from Task 5, restated as literals here because the runtime file cannot import.
- Produces: globals `FIRING_POSITION_MAP_IDS`, `FIRING_POSITION_ARCS`, `mapHasFiringPositions(mapId)`, `loadFiringPositions(mapId, arc)`, `cachedFiringPositions(mapId, arc)`, `ensureFiringPositionsLoaded(mapId, arc)`, `drawFiringPositions(currentMap)`; and in `map-tools.js`, `firingPositionsArc()` and `setFiringPositionsArc(arc)`.

- [ ] **Step 1: Write the failing runtime test**

Create `scripts/lib/firing-positions-runtime.test.mjs`:

```js
/*
 * The firing-positions layer's bookkeeping. The one thing it does that the
 * flatness layer does not is key its cache on the arc as well as the map,
 * so switching the toggle fetches the other raster instead of redrawing the
 * one already in hand.
 *
 * Run with: npm run test:scripts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadRuntime, callRuntime } from './runtime-globals.mjs';

function firingCtx(overrides = {}) {
    return loadRuntime(['js/map/firing-positions.js'], {
        getCoordinateMetersPerUnit: () => 100,
        firingPositionsArc: () => 'low',
        decodeMapImage: () => Promise.reject(new Error('no decoder in the test')),
        fetch: () => Promise.reject(new Error('no network in the test')),
        document: { createElement: () => { throw new Error('no canvas in the test'); } },
        draw: () => {},
        console: { warn: () => {} },
        ...overrides
    });
}

test('only the maps with a baked raster are offered the layer', () => {
    const ctx = firingCtx();

    assert.deepEqual(
        JSON.parse(callRuntime(ctx, 'JSON.stringify(FIRING_POSITION_MAP_IDS)')),
        ['bakurani', 'ozeti']
    );

    assert.deepEqual(
        JSON.parse(callRuntime(ctx, 'JSON.stringify(FIRING_POSITION_ARCS)')),
        ['low', 'any']
    );

    assert.equal(callRuntime(ctx, 'mapHasFiringPositions("ozeti")'), true);
    assert.equal(callRuntime(ctx, 'mapHasFiringPositions("custom")'), false);
});

test('the two arcs are fetched from different files and cached apart', () => {
    const asked = [];

    const ctx = firingCtx({
        fetch: url => {
            asked.push(url);

            return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
        }
    });

    return callRuntime(ctx, 'loadFiringPositions("bakurani", "low")')
        .then(() => callRuntime(ctx, 'loadFiringPositions("bakurani", "any")'))
        .then(() => callRuntime(ctx, 'loadFiringPositions("bakurani", "low")'))
        .then(() => {
            assert.deepEqual(asked, [
                'data/terrain/bakurani/firing-positions-low.json',
                'data/terrain/bakurani/firing-positions-any.json'
            ]);
        });
});

test('an unknown arc is refused rather than fetched', () => {
    let fetched = 0;

    const ctx = firingCtx({
        fetch: () => { fetched += 1; return Promise.reject(new Error('x')); }
    });

    return callRuntime(ctx, 'loadFiringPositions("bakurani", "medium")').then(entry => {
        assert.equal(entry, null);
        assert.equal(fetched, 0);
    });
});

test('a payload baked for the other arc is refused rather than drawn', () => {
    const ctx = firingCtx({
        fetch: () => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
                format: 'wardogs-firing-positions-v1',
                arc: 'any',
                grid: { width: 4, height: 4, originX: 1, originY: 2, stepX: 0.08, stepY: 0.08 }
            })
        })
    });

    return callRuntime(ctx, 'loadFiringPositions("bakurani", "low")').then(entry => {
        assert.equal(entry, null);
    });
});

test('the palette hides the ground outside, washes the interior and draws the edge solid', () => {
    const ctx = firingCtx();
    const palette = JSON.parse(callRuntime(ctx, 'JSON.stringify(firingPositionsPalette())'));

    assert.equal(palette.length, 3);
    assert.equal(palette[0][3], 0, 'ground outside the set is fully transparent');
    assert.ok(palette[1][3] > 0 && palette[1][3] < 128, 'the interior is a faint wash');
    assert.equal(palette[2][3], 255, 'the boundary is full strength');

    assert.deepEqual(palette[1].slice(0, 3), palette[2].slice(0, 3));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/lib/firing-positions-runtime.test.mjs`
Expected: FAIL — `ENOENT ... js/map/firing-positions.js`

- [ ] **Step 3: Write the layer**

Create `js/map/firing-positions.js`:

```js
/* =========================
   FIRING POSITIONS
   ========================= */

/*
 * The ground an SPG can be parked on that can also put a shell into every
 * tower, baked by scripts/build-firing-positions.mjs into one raster per
 * map per arc rule and drawn above the flatness ramp.
 *
 * This is the opinionated layer. Flatness is terrain truth with no view
 * about what the gun is for; this one has been through three filters — in
 * range of every aim point, hull tilt under 8 degrees, and the shell
 * actually clearing the ground on the way — and what survives is a few
 * percent of the map.
 *
 * It is drawn as an outline with a faint wash rather than a second ramp.
 * Every cell here has already passed the tilt filter, so colouring it by
 * tilt would spend a whole scale on a distinction the layer guarantees is
 * irrelevant; and a second opaque wash over the flatness ramp would tint
 * the bands underneath into illegibility. The boundary is marked at bake
 * time, so this still costs one drawImage.
 *
 * The arc rule is the player's choice and it is not cosmetic. Forcing the
 * low arc matches the dead-ground layer and is the flatter, more accurate
 * shot; allowing any mil is more truthful about the gun and far more
 * permissive, because the high arc reaches 1390 mil and clears almost
 * anything. On Bakurani the choice moves MANTICORE from 2% of the viable
 * set to 21%, and on Ozeti it moves the ranking the other way, so neither
 * rule can be shipped as the only one.
 *
 * The same blind spots as the flatness layer apply, and one more: the towers
 * move between matches, which is what the 300 m ring around each of them is
 * absorbing.
 */

const FIRING_POSITION_FORMAT = 'wardogs-firing-positions-v1';

/*
 * Maps known to ship the rasters. Listed rather than probed so the Layers
 * popover can decide whether to offer the toggle without a fetch.
 * scripts/lib/config.test.mjs holds this to the files on disk.
 */
const FIRING_POSITION_MAP_IDS = [
    'bakurani',
    'ozeti'
];

const FIRING_POSITION_ARCS = ['low', 'any'];

const FIRING_POSITION_CACHE = new Map();

/*
 * One entry per cell value: outside the set, inside it, on its edge. RGBA,
 * because the alpha does the work here rather than the colour — the
 * interior has to stay faint enough to read the flatness ramp through.
 */
function firingPositionsPalette() {
    return [
        [0, 0, 0, 0],
        [56, 189, 220, 46],
        [56, 189, 220, 255]
    ];
}

function mapHasFiringPositions(mapId) {
    return FIRING_POSITION_MAP_IDS.includes(mapId);
}

function firingPositionsKey(mapId, arc) {
    return `${mapId}|${arc}`;
}

/*
 * Terrain data is not version-stamped by scripts/version-assets.mjs, so the
 * paths are plain.
 */
function firingPositionsUrl(mapId, arc) {
    return `data/terrain/${mapId}/firing-positions-${arc}.png`;
}

function firingPositionsHeaderUrl(mapId, arc) {
    return `data/terrain/${mapId}/firing-positions-${arc}.json`;
}

function firingPositionsGrid(payload) {
    const grid = payload?.grid || {};

    const geometry = {
        originX: Number(grid.originX),
        originY: Number(grid.originY),
        stepX: Number(grid.stepX),
        stepY: Number(grid.stepY),
        width: Number(grid.width),
        height: Number(grid.height)
    };

    const usable = Object.values(geometry).every(
        value => Number.isFinite(value) && value !== 0
    );

    if (!usable) {
        throw new Error('Firing positions payload has an unusable grid');
    }

    return geometry;
}

function colouriseFiringPositions(image, grid) {
    const canvas = document.createElement('canvas');

    canvas.width = grid.width;
    canvas.height = grid.height;

    const context = canvas.getContext('2d', { willReadFrequently: true });

    context.drawImage(image, 0, 0);

    const pixels = context.getImageData(0, 0, grid.width, grid.height);
    const data = pixels.data;
    const palette = firingPositionsPalette();
    const last = palette.length - 1;

    for (let i = 0; i < data.length; i += 4) {
        const cell = palette[Math.min(last, data[i])];

        data[i] = cell[0];
        data[i + 1] = cell[1];
        data[i + 2] = cell[2];
        data[i + 3] = cell[3];
    }

    context.putImageData(pixels, 0, 0);

    return canvas;
}

/*
 * Resolves to the coloured raster for a map and arc, or null. Concurrent
 * callers share one load, and a failure is cached as null so a missing file
 * does not re-request on every redraw. Switching the arc is a second fetch,
 * kept apart in the cache, so switching back is instant.
 */
function loadFiringPositions(mapId, arc) {
    if (!mapHasFiringPositions(mapId) || !FIRING_POSITION_ARCS.includes(arc)) {
        return Promise.resolve(null);
    }

    const key = firingPositionsKey(mapId, arc);

    if (FIRING_POSITION_CACHE.has(key)) {
        return Promise.resolve(FIRING_POSITION_CACHE.get(key));
    }

    const pending = fetch(firingPositionsHeaderUrl(mapId, arc))
        .then(response => {
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}`);
            }

            return response.json();
        })
        .then(payload => {
            if (payload?.format !== FIRING_POSITION_FORMAT) {
                throw new Error(
                    `Unsupported firing positions format ${payload?.format}`
                );
            }

            /*
             * The two arcs differ by a factor of six in area, so a raster
             * baked for the wrong one would draw as a plausible answer to
             * the wrong question rather than as an obvious fault.
             */
            if (payload?.arc !== arc) {
                throw new Error(
                    `${mapId} ${arc} raster is baked for ${payload?.arc}`
                );
            }

            const grid = firingPositionsGrid(payload);

            return decodeMapImage(firingPositionsUrl(mapId, arc)).then(image => {
                const entry = {
                    image: colouriseFiringPositions(image, grid),
                    grid
                };

                FIRING_POSITION_CACHE.set(key, entry);

                return entry;
            });
        })
        .catch(error => {
            console.warn(
                `[firing-positions] Could not load ${mapId} ${arc}; ` +
                'the layer will stay empty.',
                error
            );

            FIRING_POSITION_CACHE.set(key, null);

            return null;
        });

    FIRING_POSITION_CACHE.set(key, pending);

    return pending;
}

function cachedFiringPositions(mapId, arc) {
    const cached = FIRING_POSITION_CACHE.get(firingPositionsKey(mapId, arc));

    if (!cached || typeof cached.then === 'function') {
        return null;
    }

    return cached;
}

/*
 * Called when the layer is switched on, on map change while it is on, and
 * on every arc change. The load is fire-and-forget: draw() renders nothing
 * until it lands, then redraws.
 */
function ensureFiringPositionsLoaded(mapId, arc) {
    if (!mapId || FIRING_POSITION_CACHE.has(firingPositionsKey(mapId, arc))) {
        return;
    }

    loadFiringPositions(mapId, arc).then(entry => {
        if (entry) {
            draw();
        }
    });
}

function drawFiringPositions(currentMap) {
    const mapId = currentMap?.id;

    if (!mapId || !mapHasFiringPositions(mapId)) {
        return;
    }

    const arc = typeof firingPositionsArc === 'function'
        ? firingPositionsArc()
        : FIRING_POSITION_ARCS[0];

    ensureFiringPositionsLoaded(mapId, arc);

    const data = cachedFiringPositions(mapId, arc);

    if (!data) {
        return;
    }

    const v = view();
    const grid = data.grid;

    /*
     * A pixel is a sample point, so the image covers half a cell beyond the
     * outermost samples on every side.
     */
    const gameMinX = grid.originX - grid.stepX / 2;
    const gameMaxY = grid.originY + grid.stepY / 2;
    const gameWidth = grid.width * grid.stepX;
    const gameHeight = grid.height * grid.stepY;

    ctx.drawImage(
        data.image,
        (gameMinX - v.bounds.minX) * v.scale,
        (v.bounds.maxY - gameMaxY) * v.scale,
        gameWidth * v.scale,
        gameHeight * v.scale
    );
}
```

Note there is no `globalAlpha` here. The alpha is per pixel, because the interior and the boundary need different weights and a layer-wide alpha cannot give them that.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/lib/firing-positions-runtime.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit the layer before wiring it**

```bash
git add js/map/firing-positions.js scripts/lib/firing-positions-runtime.test.mjs
git commit -m "The viable ground is drawn as an outline, because a second wash over the tilt ramp would hide it"
```

- [ ] **Step 6: Wire the state entries**

In `js/map/map-tools.js`, in `MAP_TOOL_STATE.layers`, after the `flatness: false,` entry:

```js
        /*
         * Off by default like the other baked layers, and the heaviest
         * opinion in the popover: three filters have already been applied
         * to what it shows.
         */
        firingPositions: false,
```

And after the `layers: { ... }` block, as a sibling of it inside `MAP_TOOL_STATE`:

```js
    /*
     * Which arc rule the firing-positions layer is showing. Low arc is the
     * default because it matches the dead-ground layer, which is already
     * labelled "Dead ground (low arc)", and because it is the flatter and
     * more accurate shot.
     */
    arcs: {
        firingPositions: 'low'
    },
```

- [ ] **Step 7: Add the arc accessors**

In `js/map/map-tools.js`, immediately after `setMapLayerVisible`:

```js
function firingPositionsArc() {
    return MAP_TOOL_STATE.arcs?.firingPositions === 'any' ? 'any' : 'low';
}

function setFiringPositionsArc(arc) {
    const next = arc === 'any' ? 'any' : 'low';

    if (firingPositionsArc() === next) {
        return;
    }

    MAP_TOOL_STATE.arcs.firingPositions = next;
    saveMapToolState();

    if (
        isMapLayerVisible('firingPositions') &&
        typeof ensureFiringPositionsLoaded === 'function'
    ) {
        ensureFiringPositionsLoaded(currentMapToolMapId(), next);
    }

    draw();
}
```

- [ ] **Step 8: Persist the arc choice**

`saveMapToolState` writes an explicit key list rather than the whole state object, so a new top-level key has to be added in two places or the arc silently resets on every reload.

In `saveMapToolState` (around line 359), extend the stored object:

```js
        localStorage.setItem(
            MAP_TOOLS_STORAGE_KEY,
            JSON.stringify({
                ...stored,
                layers: MAP_TOOL_STATE.layers,
                arcs: MAP_TOOL_STATE.arcs
            })
        );
```

In `loadMapToolState`, immediately after the block that merges `parsed.layers` (around line 399):

```js
        if (parsed?.arcs && typeof parsed.arcs === 'object') {
            MAP_TOOL_STATE.arcs = {
                ...MAP_TOOL_STATE.arcs,
                ...parsed.arcs
            };
        }
```

The merge is what makes state saved before this change safe: a stored object with no `arcs` key leaves the default in place, so `MAP_TOOL_STATE.arcs` is never undefined and `setFiringPositionsArc` never assigns into nothing.

Leave the import path at line 603 and the undo snapshot at line 438 alone. The arc rule is how you are looking at the map, not content someone can hand you or undo.

- [ ] **Step 9: Wire the two load hooks**

In `setMapLayerVisible`, after the `flatness` block:

```js
    if (
        layer === 'firingPositions' &&
        visible &&
        typeof ensureFiringPositionsLoaded === 'function'
    ) {
        ensureFiringPositionsLoaded(
            currentMapToolMapId(),
            firingPositionsArc()
        );
    }
```

In `setMapLayerGroupVisible`, after the `flatness` block:

```js
    if (
        nextVisible &&
        layerIds.includes('firingPositions') &&
        typeof ensureFiringPositionsLoaded === 'function'
    ) {
        ensureFiringPositionsLoaded(
            currentMapToolMapId(),
            firingPositionsArc()
        );
    }
```

- [ ] **Step 10: Wire the popover entry and icon**

In `buildMapLayers`, after `flatnessLayer`:

```js
    const firingPositionsLayer = (
        typeof mapHasFiringPositions === 'function' &&
        mapHasFiringPositions(
            currentMapToolMapId()
        )
    )
        ? [['firingPositions', 'mapLayerFiringPositions']]
        : [];
```

Add `...firingPositionsLayer` as the last item of the `firing` group.

In the `icons` object — a gun on a base, firing:

```js
        firingPositions: `
            <path d="M4 19h6"/>
            <circle cx="7" cy="17" r="2"/>
            <path d="m8 15 9-7"/>
            <path d="M18 4v4h-4"/>
        `,
```

In `locales/en.json`:

```json
"mapLayerFiringPositions": "Firing positions",
"mapLayerArcLow": "Low arc",
"mapLayerArcAny": "Any mil",
```

- [ ] **Step 11: Render the segmented control**

In `buildMapLayers`, inside `group.items.forEach(([id, key]) => { ... })`, replace the final `items.appendChild(label);` with:

```js
                items.appendChild(label);

                if (id !== 'firingPositions') {
                    return;
                }

                const arcs =
                    document.createElement('div');

                arcs.className =
                    'map-layer-arc-toggle';

                FIRING_POSITION_ARCS.forEach(
                    arc => {
                        const button =
                            document.createElement('button');

                        button.type =
                            'button';

                        button.textContent =
                            tr(
                                arc === 'any'
                                    ? 'mapLayerArcAny'
                                    : 'mapLayerArcLow'
                            );

                        button.disabled =
                            !isMapLayerVisible(id);

                        button.setAttribute(
                            'aria-pressed',
                            String(
                                firingPositionsArc() === arc
                            )
                        );

                        button.addEventListener(
                            'click',
                            event => {
                                event.stopPropagation();

                                setFiringPositionsArc(arc);

                                buildMapLayers();
                            }
                        );

                        arcs.appendChild(button);
                    }
                );

                items.appendChild(arcs);
```

- [ ] **Step 12: Style the segmented control**

In `styles/desktop/map-tools.css`, after the `.map-layer-toggle:hover` rule (around line 497):

```css
.map-layer-arc-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;

    margin: 1px 7px 3px 38px;
}

.map-layer-arc-toggle button {
    padding: 3px 6px;

    border: 1px solid var(--border);
    border-radius: 5px;

    background: transparent;
    color: var(--text-dim);
    font-size: 10px;
    line-height: 1.3;

    cursor: pointer;
}

.map-layer-arc-toggle button:hover:not(:disabled) {
    background: var(--input-hover-bg);
}

.map-layer-arc-toggle button[aria-pressed="true"] {
    background: var(--input-hover-bg);
    border-color: var(--accent);
    color: var(--text);
}

.map-layer-arc-toggle button:disabled {
    opacity: 0.45;
    cursor: default;
}
```

Check the variable names against the rest of the file first — run `grep -n 'var(--' styles/desktop/map-tools.css | head -20` and use whatever that file already uses for border, dim text and accent. Do not invent new custom properties.

The `38px` left margin lines the buttons up under the label text rather than under the icon, so the control reads as belonging to the row above it.

- [ ] **Step 13: Wire the draw call**

In `js/map/renderer.js`, immediately after the flatness block from Task 4:

```js
    /*
     * Layer 4:
     * viable firing positions, above the tilt ramp whose flat ground it
     * narrows down.
     */
    if (isMapLayerVisible('firingPositions')) {
        drawFiringPositions(currentMap);
    }
```

Renumber the blocks below it again.

- [ ] **Step 14: Wire the script tag**

In each of the 11 page templates, immediately after the `js/map/flatness.js` line:

```html
<script src="js/map/firing-positions.js"></script>
```

Run: `grep -c 'js/map/firing-positions.js' src/pages/index.html src/pages/mobile/index.html src/pages/locales/*.html`
Expected: `1` for all 11.

- [ ] **Step 15: Hold the allowlist to the files on disk**

In `scripts/lib/config.test.mjs`, after the flatness assertion:

```js
    assert.deepEqual(
        allowlist('js/map/firing-positions.js', 'FIRING_POSITION_MAP_IDS'),
        withFile('firing-positions-low.json')
    );

    assert.deepEqual(
        withFile('firing-positions-low.json'),
        withFile('firing-positions-any.json'),
        'both arcs are baked for the same maps'
    );
```

- [ ] **Step 16: Register the test and run everything**

Append ` scripts/lib/firing-positions-runtime.test.mjs` to `test:scripts` in `package.json`.

Run: `npm run test:scripts`
Expected: PASS, whole suite.

- [ ] **Step 17: Verify in the running app**

Run: `npm run dev`

- Layers popover, Firing group, shows "Firing positions" with two buttons under it, greyed out until the layer is on.
- Ticking it fetches `firing-positions-low.png` only, and draws a small set of outlined regions.
- Clicking "Any mil" fetches `firing-positions-any.png` and the outlined area grows roughly sixfold. Clicking back to "Low arc" redraws instantly with no second fetch.
- Turning the flatness layer on as well: the outlined regions sit inside green and amber ground, never inside red. Any outlined cell over red ground is a bug — the two layers share one tilt predicate.
- Every outlined region is between about 800 m and 2.6 km from the towers.
- The arc choice survives a page reload.
- At map-fit zoom the outline thins as the raster is downscaled; the interior wash must still make the regions findable. If it does not, raise the interior alpha in `firingPositionsPalette` rather than thickening the baked outline.

- [ ] **Step 18: Commit**

```bash
git add js/map/map-tools.js js/map/renderer.js styles/desktop/map-tools.css locales/en.json scripts/lib/config.test.mjs package.json src/pages
git commit -m "The arc rule is the player's to choose, because it decides which spawn is disadvantaged and it does so differently on each map"
```

---

## Self-review notes

**Spec coverage.** Every section of the spec maps to a task: the tilt ramp and its band table to Tasks 1, 2 and 4; the outline encoding to Tasks 5 and 7; the three filters and the two-terrain-source split to Task 6; the aim points to Task 5 and Task 6; the arc toggle to Task 6 for the bake and Task 7 for the control; the five-group layout to Task 3; the wiring paragraph to Tasks 4 and 7; the caveats to the block comments in Tasks 4 and 7.

**Not implemented, deliberately.** The spec's per-spawn table is background rather than a feature — nothing in the app shows it. Task 6 prints it from the builder anyway, because it is the sharpest available check that the arc rule still moves the balance between teams the way the spec says it does. If those percentages come out flat across the three spawns, a filter has stopped doing its job.

**The one place the two layers can disagree.** Both express "flat enough" as `tiltBand(t) < TILT_LIMIT_BAND`, evaluated in Task 2 for the ramp and Task 6 for the filter, from the same 5×5 stencil at the same 8 m grid. If either builder's stencil geometry is changed without the other, an outlined region will appear over red ground. Task 7's verification step checks for exactly that.
