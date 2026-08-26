# Terrain-Aware Max Range Ring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed max-range circle around each gun with an outline derived from the terrain the shell flies over, so a gun on a hill is drawn with the reach it actually has.

**Architecture:** A build script bakes a 32 m heightfield per map (234 KB) because the runtime chunk streamer would need 19 MB to cover one ring. At runtime a new solver walks 360 bearings, finding on each the distance where the fitted vacuum model's max range stops exceeding the distance already travelled. The result is added to `weapon.maxRange` as a *difference*, so flat ground redraws today's circle exactly.

**Tech Stack:** Vanilla browser JS loaded as global scripts (no modules, no framework), Canvas 2D. Build scripts are Node ESM under `scripts/`, unit-tested with `node --test` via `npm run test:scripts`. Browser behaviour is checked with Playwright drivers under `test/`.

**Spec:** `docs/superpowers/specs/2026-08-27-terrain-range-ring-design.md`

## Global Constraints

- **The ring is a differential.** `r_ring(ΔZ) = weapon.maxRange + [modelMax(ΔZ) − modelMax(0)]`. At `ΔZ = 0` every bearing must return `weapon.maxRange` exactly. Never `modelMax(ΔZ)` on its own.
- **`ΔZ = z_target − z_gun`** everywhere, matching the rest of the repo. Uphill is positive and shortens range.
- **No absolute height is ever read, stored, or displayed.** The heightfield datum is offset by roughly 900 m; only differences are meaningful.
- **Fallback is always today's circle** — never a blank space, never an error — when the heightfield is absent, still loading, outside coverage, or the weapon has no `projectile-model.json` entry.
- **The solid ring never exceeds `weapon.maxRange`.** Reach beyond it is drawn as a faint dashed advisory outline with no fill.
- **`GRAVITY` is 9.81**, already exported from `scripts/lib/ballistics.mjs`.
- **Grid spacing is 32 m.** Memo rounding is 8 m.
- **360 bearings, 25 m march step, 14 bisection steps.**
- **`js/` has no unit-test harness.** Anything needing unit tests belongs in `scripts/lib/`. Browser code is verified with a Playwright driver plus a manual check.
- **Commit messages are a title line only** — no body, no trailers.
- The 11 HTML shells are `src/pages/index.html`, `src/pages/mobile/index.html`, and `src/pages/locales/{cat,de,es,fr,pl,pt,ru,uk}.html`.
- Supported terrain maps are `bakurani` and `ozeti`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `scripts/lib/ballistics.mjs` | Modify | Add `maxRangeMeters(v, ΔZ)` — the closed form the ring is built on. |
| `scripts/lib/ballistics.test.mjs` | Modify | Cover it, including agreement with `solveTan`'s discriminant. |
| `scripts/lib/heightfield.mjs` | Create | Grid geometry, uint16 quantisation, bilinear sampling. Pure functions, no I/O. |
| `scripts/lib/heightfield.test.mjs` | Create | Round-trip, geometry, and sampling coverage. |
| `scripts/lib/terrain-source.mjs` | Create | Chunk loading and the game-coordinate sampler, extracted from `build-contours.mjs` so two generators cannot drift apart. |
| `scripts/build-contours.mjs` | Modify | Import the extracted sampler instead of its own copy. |
| `scripts/build-heightfield.mjs` | Create | Writes `heightfield.json` + `heightfield.bin` per map. |
| `package.json` | Modify | `build-heightfield` script; new test file in `test:scripts`. |
| `js/map/heightfield.js` | Create | Runtime fetch, decode to `Float32Array`, cache, bilinear sample. |
| `js/map/range-ring.js` | Create | The per-bearing solve and its per-gun memo. |
| `js/map/guns-overlay.js` | Modify | `drawGunRangeRings` draws the terrain ring when available. |
| 11 HTML shells | Modify | Two script tags. |
| `test/range-ring.mjs` | Create | Playwright driver: flat-ground identity, elevated-gun deformation, fallback. |
| `docs/terrain.md` | Modify | Document the new asset. |
| `docs/features.md` | Modify | Explain the two outlines. |

`js/map/heightfield.js` and `js/map/range-ring.js` are new fork-only files, for the same reason `guns-overlay.js` and `contours.js` are: `renderer.js` keeps a single guarded call and the upstream merge surface stays one line.

---

## Task 1: `maxRangeMeters` in the ballistics library

The one piece of physics the ring needs. It belongs next to `solveTan` because it is that function's discriminant solved for `R`, and putting it anywhere else invites the two to drift.

**Files:**
- Modify: `scripts/lib/ballistics.mjs`
- Test: `scripts/lib/ballistics.test.mjs`

**Interfaces:**
- Consumes: `GRAVITY`, `solveTan` from `scripts/lib/ballistics.mjs`.
- Produces: `maxRangeMeters(muzzleVelocity, deltaZMeters)` → metres as a finite number, or `null` when the target height is unreachable at any angle.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/lib/ballistics.test.mjs`:

```js
test('maxRangeMeters on the level is v squared over g', () => {
    close(
        maxRangeMeters(SPG_HIGH.muzzleVelocity, 0),
        SPG_HIGH.muzzleVelocity ** 2 / GRAVITY,
        1e-9
    );
});

test('maxRangeMeters lengthens downhill and shortens uphill', () => {
    const level = maxRangeMeters(SPG_HIGH.muzzleVelocity, 0);

    assert.ok(maxRangeMeters(SPG_HIGH.muzzleVelocity, -200) > level);
    assert.ok(maxRangeMeters(SPG_HIGH.muzzleVelocity, 200) < level);
});

/*
 * The whole design rests on these being the same boundary: solveTan returns
 * null exactly where maxRangeMeters says the range ran out.
 */
test('maxRangeMeters is the boundary solveTan refuses to cross', () => {
    for (const deltaZ of [-400, -100, 0, 100, 300]) {
        const limit = maxRangeMeters(SPG_HIGH.muzzleVelocity, deltaZ);

        assert.ok(
            solveTan(SPG_HIGH.muzzleVelocity, limit * 0.999, deltaZ, 'high') !== null,
            `inside the limit at deltaZ ${deltaZ} should solve`
        );

        assert.equal(
            solveTan(SPG_HIGH.muzzleVelocity, limit * 1.001, deltaZ, 'high'),
            null,
            `outside the limit at deltaZ ${deltaZ} should not solve`
        );
    }
});

test('maxRangeMeters returns null above the ballistic ceiling', () => {
    const ceiling = SPG_HIGH.muzzleVelocity ** 2 / (2 * GRAVITY);

    assert.equal(maxRangeMeters(SPG_HIGH.muzzleVelocity, ceiling + 1), null);
});

test('maxRangeMeters rejects unusable input', () => {
    assert.equal(maxRangeMeters(0, 0), null);
    assert.equal(maxRangeMeters(160, NaN), null);
});
```

Add `maxRangeMeters` to the existing import list at the top of the file, keeping it alphabetical:

```js
import {
    GRAVITY,
    fitArc,
    maxRangeMeters,
    milCorrection,
    milFromTan,
    missMeters,
    rangeForTan,
    solveTan
} from './ballistics.mjs';
```

Keep whatever names the existing import block already has; only add `maxRangeMeters`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:scripts`
Expected: FAIL — `maxRangeMeters is not a function`.

- [ ] **Step 3: Write the implementation**

Add to `scripts/lib/ballistics.mjs`, directly below `solveTan`:

```js
/*
 * Furthest horizontal distance reachable at any launch angle, for a target
 * deltaZMeters above the muzzle.
 *
 * This is solveTan's discriminant solved for R. Setting
 * R^2 - 4k(dZ + k) = 0 with k = g R^2 / 2 v^2 gives
 * R = (v/g) * sqrt(v^2 - 2 g dZ), so the two agree by construction: inside
 * this distance solveTan finds an angle, outside it returns null.
 *
 * Null means no angle reaches that height at all — the target sits above the
 * ballistic ceiling v^2 / 2g.
 */
export function maxRangeMeters(muzzleVelocity, deltaZMeters) {
    if (
        !Number.isFinite(muzzleVelocity) ||
        muzzleVelocity <= 0 ||
        !Number.isFinite(deltaZMeters)
    ) {
        return null;
    }

    const inner =
        muzzleVelocity * muzzleVelocity -
        2 * GRAVITY * deltaZMeters;

    if (inner <= 0) {
        return null;
    }

    return muzzleVelocity * Math.sqrt(inner) / GRAVITY;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:scripts`
Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/ballistics.mjs scripts/lib/ballistics.test.mjs
git commit -m "Solve the vacuum model for its own max range"
```

---

## Task 2: Heightfield grid geometry and sampling

Pure functions shared by the generator, its tests, and — by mirrored implementation — the runtime. No file I/O, so every edge case is cheap to test here rather than in a browser.

**Files:**
- Create: `scripts/lib/heightfield.mjs`
- Test: `scripts/lib/heightfield.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `METRES_PER_GAME_UNIT` → `100`
  - `gridGeometry(bounds, spacingMeters)` → `{ width, height, originX, originY, stepGameUnits }`, where `bounds` is `{ minX, maxX, minY, maxY }` in game units
  - `quantise(z, minZ, maxZ)` → integer in `[0, 65535]`
  - `dequantise(value, minZ, maxZ)` → metres
  - `sampleGrid(field, gameX, gameY)` → metres, or `null` outside the grid, where `field` is `{ heights, width, height, originX, originY, stepGameUnits }` and `heights` is any indexable of numbers in row-major order, rows running south to north

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/heightfield.test.mjs`:

```js
/*
 * Grid geometry and sampling for the baked heightfield. The runtime mirrors
 * sampleGrid in js/map/heightfield.js; if these two drift, the range ring and
 * the generator describe different ground.
 *
 * Run with: npm run test:scripts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    METRES_PER_GAME_UNIT,
    dequantise,
    gridGeometry,
    quantise,
    sampleGrid
} from './heightfield.mjs';

const BAKURANI = { minX: 23.35, maxX: 133.6, minY: 19.34, maxY: 129.65 };

function close(actual, expected, tolerance) {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `${actual} should be within ${tolerance} of ${expected}`
    );
}

test('gridGeometry covers the bounds at the requested spacing', () => {
    const g = gridGeometry(BAKURANI, 32);

    assert.equal(g.width, 346);
    assert.equal(g.height, 346);
    assert.equal(g.originX, BAKURANI.minX);
    assert.equal(g.originY, BAKURANI.minY);
    close(g.stepGameUnits, 32 / METRES_PER_GAME_UNIT, 1e-12);

    /* The last node must sit on or past the far edge, never short of it. */
    assert.ok(g.originX + (g.width - 1) * g.stepGameUnits >= BAKURANI.maxX);
    assert.ok(g.originY + (g.height - 1) * g.stepGameUnits >= BAKURANI.maxY);
});

test('quantise round-trips inside one step of the range', () => {
    const minZ = -1006.55;
    const maxZ = 74.85;
    const step = (maxZ - minZ) / 65535;

    for (const z of [minZ, -800, -500.25, 0, 74.85]) {
        close(dequantise(quantise(z, minZ, maxZ), minZ, maxZ), z, step);
    }
});

test('quantise clamps out-of-range input to the endpoints', () => {
    assert.equal(quantise(-2000, -1000, 0), 0);
    assert.equal(quantise(500, -1000, 0), 65535);
});

test('sampleGrid returns node values exactly', () => {
    const field = {
        heights: [0, 10, 20, 30],
        width: 2,
        height: 2,
        originX: 0,
        originY: 0,
        stepGameUnits: 1
    };

    close(sampleGrid(field, 0, 0), 0, 1e-12);
    close(sampleGrid(field, 1, 0), 10, 1e-12);
    close(sampleGrid(field, 0, 1), 20, 1e-12);
    close(sampleGrid(field, 1, 1), 30, 1e-12);
});

test('sampleGrid interpolates bilinearly between nodes', () => {
    const field = {
        heights: [0, 10, 20, 30],
        width: 2,
        height: 2,
        originX: 0,
        originY: 0,
        stepGameUnits: 1
    };

    close(sampleGrid(field, 0.5, 0), 5, 1e-12);
    close(sampleGrid(field, 0, 0.5), 10, 1e-12);
    close(sampleGrid(field, 0.5, 0.5), 15, 1e-12);
});

test('sampleGrid returns null outside the grid', () => {
    const field = {
        heights: [0, 10, 20, 30],
        width: 2,
        height: 2,
        originX: 0,
        originY: 0,
        stepGameUnits: 1
    };

    assert.equal(sampleGrid(field, -0.001, 0), null);
    assert.equal(sampleGrid(field, 0, 1.001), null);
    assert.equal(sampleGrid(field, NaN, 0), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/lib/heightfield.test.mjs`
Expected: FAIL — cannot find module `./heightfield.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/heightfield.mjs`:

```js
/*
 * Geometry and quantisation for the baked terrain heightfield.
 *
 * The grid is a regular lattice over a map's playable bounds, stored as
 * uint16 because only height *differences* are ever used: at Bakurani's
 * 1081 m relief one step is 1.7 cm, far below anything the range ring can
 * resolve.
 *
 * Rows run south to north, so originY is the minimum and sampling is a
 * plain add — deliberately unlike the contour grid, whose rows run north to
 * south and whose decoder subtracts.
 */

export const METRES_PER_GAME_UNIT = 100;

const U16_MAX = 65535;

export function gridGeometry(bounds, spacingMeters) {
    const stepGameUnits = spacingMeters / METRES_PER_GAME_UNIT;

    return {
        width: Math.ceil((bounds.maxX - bounds.minX) / stepGameUnits) + 1,
        height: Math.ceil((bounds.maxY - bounds.minY) / stepGameUnits) + 1,
        originX: bounds.minX,
        originY: bounds.minY,
        stepGameUnits
    };
}

export function quantise(z, minZ, maxZ) {
    const span = maxZ - minZ;

    if (!(span > 0)) {
        return 0;
    }

    const scaled = Math.round(((z - minZ) / span) * U16_MAX);

    return Math.min(U16_MAX, Math.max(0, scaled));
}

export function dequantise(value, minZ, maxZ) {
    return minZ + (value / U16_MAX) * (maxZ - minZ);
}

export function sampleGrid(field, gameX, gameY) {
    if (!Number.isFinite(gameX) || !Number.isFinite(gameY)) {
        return null;
    }

    const fi = (gameX - field.originX) / field.stepGameUnits;
    const fj = (gameY - field.originY) / field.stepGameUnits;

    if (
        fi < 0 ||
        fj < 0 ||
        fi > field.width - 1 ||
        fj > field.height - 1
    ) {
        return null;
    }

    const i0 = Math.floor(fi);
    const j0 = Math.floor(fj);
    const i1 = Math.min(i0 + 1, field.width - 1);
    const j1 = Math.min(j0 + 1, field.height - 1);

    const tx = fi - i0;
    const ty = fj - j0;

    const z00 = field.heights[j0 * field.width + i0];
    const z10 = field.heights[j0 * field.width + i1];
    const z01 = field.heights[j1 * field.width + i0];
    const z11 = field.heights[j1 * field.width + i1];

    const bottom = z00 + (z10 - z00) * tx;
    const top = z01 + (z11 - z01) * tx;

    return bottom + (top - bottom) * ty;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/lib/heightfield.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add the test file to the suite**

In `package.json`, extend the `test:scripts` script so it reads:

```json
"test:scripts": "node --test scripts/lib/sigv4.test.mjs scripts/lib/dev-env.test.mjs scripts/lib/contours.test.mjs scripts/lib/ballistics.test.mjs scripts/lib/heightfield.test.mjs"
```

- [ ] **Step 6: Run the whole suite**

Run: `npm run test:scripts`
Expected: PASS, every suite including the new one.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/heightfield.mjs scripts/lib/heightfield.test.mjs package.json
git commit -m "Add grid geometry and sampling for a baked heightfield"
```

---

## Task 3: Extract the terrain source into `scripts/lib/`

`build-contours.mjs` keeps `loadChunks` and `createSampler` private, under a comment warning that they must not drift from `js/features/terrain-ballistics.js`. A second generator reading the same chunks makes a private copy untenable, so they move to `scripts/lib/` before anything new consumes them.

This task is a pure refactor. `contours.json` must come out byte-identical.

**Files:**
- Create: `scripts/lib/terrain-source.mjs`
- Modify: `scripts/build-contours.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `loadTerrainChunks(manifest, terrainDir, bounds)` → `Promise<Map<string, {entry, view}>>`
  - `createTerrainSampler(manifest, chunks)` → `(gameX, gameY) => number | null`, metres on the map's own offset datum

Note the dropped argument: the old `createSampler(manifest, terrainDir, chunkFiles)` never used `terrainDir`.

- [ ] **Step 1: Record the current output hash**

Run:

```bash
sha256sum data/terrain/bakurani/contours.json data/terrain/ozeti/contours.json
```

Keep both hashes. They are the test for this task.

- [ ] **Step 2: Create the extracted module**

Create `scripts/lib/terrain-source.mjs`. Move `loadChunks` and `createSampler` out of `scripts/build-contours.mjs` **verbatim** — same bodies, same comments — renamed and exported, with `terrainDir` dropped from the sampler's parameters:

```js
/*
 * Reads the cooked Terrain3D heightfield chunks and samples them in game
 * coordinates.
 *
 * Mirrors locateTerrainPoint / decodeRawHeight in
 * js/features/terrain-ballistics.js. The three must agree: if they drift,
 * the contours, the range ring, and the elevation readout describe
 * different ground.
 *
 * Heights are metres on the map's own offset datum, roughly 900 m below
 * anything a player would call an altitude. Only differences are meaningful.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function loadTerrainChunks(manifest, terrainDir, bounds) {
    /* body moved verbatim from build-contours.mjs loadChunks */
}

export function createTerrainSampler(manifest, chunks) {
    /* body moved verbatim from build-contours.mjs createSampler,
       with the unused terrainDir parameter dropped */
}
```

Copy the real bodies across from `scripts/build-contours.mjs:96-161` and `scripts/build-contours.mjs:167-243`. Do not rewrite them.

- [ ] **Step 3: Point `build-contours.mjs` at the module**

Delete both functions from `scripts/build-contours.mjs` and add the import beside the existing `buildLevelLines` one:

```js
import { buildLevelLines } from './lib/contours.mjs';
import {
    createTerrainSampler,
    loadTerrainChunks
} from './lib/terrain-source.mjs';
```

Update the two call sites in `buildMap`:

```js
    const chunks = await loadTerrainChunks(manifest, terrainDir, bounds);
```

```js
    const sample = createTerrainSampler(manifest, chunks);
```

If `readFile` or `join` are now unused in `build-contours.mjs`, leave them — `readJson` and the output paths still need both.

- [ ] **Step 4: Verify the output is unchanged**

Run:

```bash
npm run build-contours
sha256sum data/terrain/bakurani/contours.json data/terrain/ozeti/contours.json
git status --short data/terrain
```

Expected: both hashes identical to Step 1, and `git status` reports no modification to either `contours.json`. If a hash moved, the move was not verbatim — revert and redo it.

- [ ] **Step 5: Run the test suite**

Run: `npm run test:scripts`
Expected: PASS, unchanged.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/terrain-source.mjs scripts/build-contours.mjs
git commit -m "Share the terrain chunk reader between generators"
```

---

## Task 4: The heightfield generator

Bakes the 32 m grid the runtime reads. This is why the feature is affordable at all: the same coverage streamed from chunks is 19 MB.

**Files:**
- Create: `scripts/build-heightfield.mjs`
- Modify: `package.json`
- Creates as output: `data/terrain/{bakurani,ozeti}/heightfield.{json,bin}`

**Interfaces:**
- Consumes: `loadTerrainChunks`, `createTerrainSampler` (Task 3); `gridGeometry`, `quantise`, `METRES_PER_GAME_UNIT` (Task 2).
- Produces: the committed asset pair described in the spec § 5. Nothing imports this script.

- [ ] **Step 1: Write the generator**

Create `scripts/build-heightfield.mjs`:

```js
/*
 * Bakes a coarse terrain heightfield for the range-ring solver.
 *
 *     node scripts/build-heightfield.mjs            # every map with terrain
 *     node scripts/build-heightfield.mjs bakurani   # one map
 *
 * Writes data/terrain/<map>/heightfield.{json,bin}, both committed.
 *
 * Why this is a build step: js/features/terrain-ballistics.js streams two
 * chunks per firing solution, but a 2.6 km range ring sweeps about 36 of
 * them — roughly 19 MB. At 32 m spacing the whole map is 234 KB and
 * reproduces the ring to 0.7 m median error against the full 2 m data.
 *
 * Options:
 *   --spacing <m>   sample spacing, metres   (default 32)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    METRES_PER_GAME_UNIT,
    gridGeometry,
    quantise
} from './lib/heightfield.mjs';

import {
    createTerrainSampler,
    loadTerrainChunks
} from './lib/terrain-source.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const HEIGHTFIELD_FORMAT = 'wardogs-heightfield-u16-v1';
const DEFAULT_SPACING_METRES = 32;
const TERRAIN_MAP_IDS = ['bakurani', 'ozeti'];

async function readJson(path) {
    return JSON.parse(await readFile(path, 'utf8'));
}

function parseOptions(argv) {
    const mapIds = [];
    let spacingMeters = DEFAULT_SPACING_METRES;

    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--spacing') {
            spacingMeters = Number(argv[i + 1]);
            i += 1;
            continue;
        }

        mapIds.push(argv[i]);
    }

    if (!Number.isFinite(spacingMeters) || spacingMeters <= 0) {
        throw new Error(`Unusable spacing ${spacingMeters}`);
    }

    return {
        mapIds: mapIds.length ? mapIds : TERRAIN_MAP_IDS,
        spacingMeters
    };
}

async function buildMap(mapId, spacingMeters) {
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
        throw new Error(`${mapId} has no bounds to sample`);
    }

    const chunks = await loadTerrainChunks(manifest, terrainDir, bounds);
    const sample = createTerrainSampler(manifest, chunks);
    const grid = gridGeometry(bounds, spacingMeters);

    /*
     * Two passes. The first finds the map's own extremes so the uint16
     * range is spent entirely on relief that exists; the second quantises
     * against them. Holding the floats between passes costs 480 KB.
     */
    const heights = new Float64Array(grid.width * grid.height);

    let minZ = Infinity;
    let maxZ = -Infinity;
    let missing = 0;

    for (let j = 0; j < grid.height; j += 1) {
        for (let i = 0; i < grid.width; i += 1) {
            const z = sample(
                grid.originX + i * grid.stepGameUnits,
                grid.originY + j * grid.stepGameUnits
            );

            if (z === null || !Number.isFinite(z)) {
                missing += 1;
                heights[j * grid.width + i] = NaN;
                continue;
            }

            heights[j * grid.width + i] = z;
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        }
    }

    if (missing) {
        throw new Error(
            `${mapId}: ${missing} of ${heights.length} samples fell outside ` +
            'chunk coverage; the playable bounds and the manifest disagree'
        );
    }

    const values = new Uint16Array(heights.length);

    for (let n = 0; n < heights.length; n += 1) {
        values[n] = quantise(heights[n], minZ, maxZ);
    }

    const binary = Buffer.from(values.buffer, 0, values.byteLength);

    await writeFile(join(terrainDir, 'heightfield.bin'), binary);

    const header = {
        format: HEIGHTFIELD_FORMAT,
        mapId,
        generatedFrom: `data/terrain/${mapId}/manifest.json`,
        generatedAt: new Date().toISOString().slice(0, 10),
        spacingMeters,
        grid,
        minZMeters: minZ,
        maxZMeters: maxZ,
        file: 'heightfield.bin',
        bytes: binary.byteLength,
        sha256: createHash('sha256').update(binary).digest('hex')
    };

    await writeFile(
        join(terrainDir, 'heightfield.json'),
        `${JSON.stringify(header, null, 4)}\n`
    );

    return header;
}

const { mapIds, spacingMeters } = parseOptions(process.argv.slice(2));

for (const mapId of mapIds) {
    const header = await buildMap(mapId, spacingMeters);

    if (!header) {
        console.log(`${mapId}: no terrain data, skipped`);
        continue;
    }

    const relief = header.maxZMeters - header.minZMeters;

    console.log(
        `${mapId}: ${header.grid.width}x${header.grid.height} at ` +
        `${spacingMeters} m, ${(header.bytes / 1024).toFixed(0)} KB, ` +
        `${relief.toFixed(0)} m relief`
    );
}
```

- [ ] **Step 2: Add the npm script**

In `package.json`, beside the existing `build-contours` entry:

```json
"build-heightfield": "node scripts/build-heightfield.mjs"
```

- [ ] **Step 3: Generate the assets**

Run: `npm run build-heightfield`

Expected output, both lines:

```
bakurani: 346x346 at 32 m, 234 KB, 1081 m relief
ozeti: ... at 32 m, ... KB, 388 m relief
```

Bakurani's relief must read **1081 m** and Ozeti's **388 m** — those are the figures `js/map/contours.js` already documents, computed independently. A different number means the sampler or the bounds are wrong, not that the map changed.

- [ ] **Step 4: Verify the header against the file**

Run:

```bash
node -e "
const h = require('./data/terrain/bakurani/heightfield.json');
const fs = require('fs');
const b = fs.readFileSync('data/terrain/bakurani/heightfield.bin');
const c = require('crypto').createHash('sha256').update(b).digest('hex');
console.log('bytes', b.length === h.bytes, b.length, h.bytes);
console.log('sha256', c === h.sha256);
console.log('cells', h.grid.width * h.grid.height * 2 === h.bytes);
"
```

Expected: three `true` values.

- [ ] **Step 5: Spot-check a decoded sample against the chunk data**

Run:

```bash
node -e "
import('./scripts/lib/heightfield.mjs').then(async hf => {
  const src = await import('./scripts/lib/terrain-source.mjs');
  const fs = await import('node:fs/promises');
  const manifest = JSON.parse(await fs.readFile('data/terrain/bakurani/manifest.json','utf8'));
  const map = JSON.parse(await fs.readFile('maps/bakurani.json','utf8'));
  const head = JSON.parse(await fs.readFile('data/terrain/bakurani/heightfield.json','utf8'));
  const bin = await fs.readFile('data/terrain/bakurani/heightfield.bin');
  const raw = new Uint16Array(bin.buffer, bin.byteOffset, bin.byteLength/2);
  const heights = Float64Array.from(raw, v => hf.dequantise(v, head.minZMeters, head.maxZMeters));
  const field = { heights, ...head.grid };
  const chunks = await src.loadTerrainChunks(manifest, 'data/terrain/bakurani', map.bounds);
  const truth = src.createTerrainSampler(manifest, chunks);
  let worst = 0;
  for (const [x, y] of [[50,60],[78,74],[100,100],[40,110],[120,45]]) {
    worst = Math.max(worst, Math.abs(hf.sampleGrid(field, x, y) - truth(x, y)));
  }
  console.log('worst error at 5 probes:', worst.toFixed(1), 'm');
});
"
```

Expected: a few metres at most. This is interpolation error between 32 m nodes on real terrain, not a bug — the ring's own tolerance is 2.6 m p90 (spec § 5). A reading in the hundreds means the grid is transposed or the row order is flipped.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-heightfield.mjs package.json data/terrain/bakurani/heightfield.json data/terrain/bakurani/heightfield.bin data/terrain/ozeti/heightfield.json data/terrain/ozeti/heightfield.bin
git commit -m "Bake a coarse heightfield for the range ring"
```

---

## Task 5: Runtime heightfield loader

Fetches and decodes the baked asset, following the `contours.js` lazy-load pattern. Lands as dead code — nothing calls it until Task 6 — so the app must behave identically when this task ships.

**Files:**
- Create: `js/map/heightfield.js`
- Modify: all 11 HTML shells

**Interfaces:**
- Consumes: the Task 4 asset; `draw()` from `js/map/renderer.js`.
- Produces, all globals:
  - `mapHasHeightfield(mapId)` → boolean
  - `ensureHeightfieldLoaded(mapId)` → starts the fetch; redraws when it lands
  - `cachedHeightfield(mapId)` → `{ heights, width, height, originX, originY, stepGameUnits, minZMeters }` or `null` while pending or failed
  - `heightfieldSample(field, gameX, gameY)` → metres or `null`

- [ ] **Step 1: Write the loader**

Create `js/map/heightfield.js`:

```js
/* =========================
   HEIGHTFIELD
   ========================= */

/*
 * The coarse terrain grid the range ring solves against, baked by
 * scripts/build-heightfield.mjs.
 *
 * js/features/terrain-ballistics.js streams two chunks per firing solution,
 * which is right for two points and hopeless for a ring: a 2.6 km circle
 * sweeps about 36 chunks, roughly 19 MB. This asset is the whole map at
 * 32 m for 234 KB.
 *
 * Unlike the contour layer this is not opt-in. The range ring is always
 * drawn, and drawing it as a flat circle is wrong by a median 470 m on
 * Bakurani, so the fetch starts as soon as a supported map is shown.
 *
 * Heights sit on the same offset datum as everything else in
 * docs/terrain.md — roughly 900 m below a real altitude. Only differences
 * are ever taken.
 */

const HEIGHTFIELD_FORMAT = 'wardogs-heightfield-u16-v1';

const HEIGHTFIELD_MAP_IDS = [
    'bakurani',
    'ozeti'
];

const HEIGHTFIELD_CACHE = new Map();

function mapHasHeightfield(mapId) {
    return HEIGHTFIELD_MAP_IDS.includes(mapId);
}

function heightfieldUrl(mapId, file) {
    return `data/terrain/${mapId}/${file}`;
}

/*
 * Decoded once, at load, into a Float32Array. 346 x 346 floats is 479 KB
 * resident and turns every later sample into two array reads instead of a
 * DataView call and a multiply.
 */
function decodeHeightfield(header, buffer) {
    const raw = new Uint16Array(buffer);

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
        stepGameUnits: header.grid.stepGameUnits,
        minZMeters: header.minZMeters
    };
}

function loadHeightfield(mapId) {
    if (!mapHasHeightfield(mapId)) {
        return Promise.resolve(null);
    }

    if (HEIGHTFIELD_CACHE.has(mapId)) {
        return Promise.resolve(HEIGHTFIELD_CACHE.get(mapId));
    }

    const pending = fetch(heightfieldUrl(mapId, 'heightfield.json'))
        .then(response => {
            if (!response.ok) {
                throw new Error(
                    `${response.status} ${response.statusText}`
                );
            }

            return response.json();
        })
        .then(header => {
            if (header?.format !== HEIGHTFIELD_FORMAT) {
                throw new Error(
                    `Unsupported heightfield format ${header?.format}`
                );
            }

            return fetch(heightfieldUrl(mapId, header.file))
                .then(response => {
                    if (!response.ok) {
                        throw new Error(
                            `${response.status} ${response.statusText}`
                        );
                    }

                    return response.arrayBuffer();
                })
                .then(buffer => decodeHeightfield(header, buffer));
        })
        .then(decoded => {
            HEIGHTFIELD_CACHE.set(mapId, decoded);

            return decoded;
        })
        .catch(error => {
            console.warn(
                `[heightfield] Could not load ${mapId}; ` +
                'range rings will stay circular.',
                error
            );

            HEIGHTFIELD_CACHE.set(mapId, null);

            return null;
        });

    HEIGHTFIELD_CACHE.set(mapId, pending);

    return pending;
}

function cachedHeightfield(mapId) {
    const cached = HEIGHTFIELD_CACHE.get(mapId);

    if (!cached || typeof cached.then === 'function') {
        return null;
    }

    return cached;
}

/*
 * Fire-and-forget. Until it lands cachedHeightfield returns null and the
 * ring falls back to the circle, exactly as it does on an unsupported map.
 */
function ensureHeightfieldLoaded(mapId) {
    if (!mapId || HEIGHTFIELD_CACHE.has(mapId)) {
        return;
    }

    loadHeightfield(mapId).then(decoded => {
        if (decoded) {
            draw();
        }
    });
}

/*
 * Bilinear, mirroring sampleGrid in scripts/lib/heightfield.mjs. Rows run
 * south to north, so the row index is a plain add.
 */
function heightfieldSample(field, gameX, gameY) {
    if (!field || !Number.isFinite(gameX) || !Number.isFinite(gameY)) {
        return null;
    }

    const fi = (gameX - field.originX) / field.stepGameUnits;
    const fj = (gameY - field.originY) / field.stepGameUnits;

    if (
        fi < 0 ||
        fj < 0 ||
        fi > field.width - 1 ||
        fj > field.height - 1
    ) {
        return null;
    }

    const i0 = Math.floor(fi);
    const j0 = Math.floor(fj);
    const i1 = Math.min(i0 + 1, field.width - 1);
    const j1 = Math.min(j0 + 1, field.height - 1);

    const tx = fi - i0;
    const ty = fj - j0;

    const z00 = field.heights[j0 * field.width + i0];
    const z10 = field.heights[j0 * field.width + i1];
    const z01 = field.heights[j1 * field.width + i0];
    const z11 = field.heights[j1 * field.width + i1];

    const bottom = z00 + (z10 - z00) * tx;
    const top = z01 + (z11 - z01) * tx;

    return bottom + (top - bottom) * ty;
}
```

- [ ] **Step 2: Add the script tag to all 11 shells**

In each shell, immediately **before** the existing `js/map/contours.js` line:

```html
<script src="js/map/heightfield.js"></script>
```

The 11 files are `src/pages/index.html`, `src/pages/mobile/index.html`, and `src/pages/locales/{cat,de,es,fr,pl,pt,ru,uk}.html`.

- [ ] **Step 3: Verify every shell got it**

Run:

```bash
grep -c "js/map/heightfield.js" src/pages/index.html src/pages/mobile/index.html src/pages/locales/*.html
```

Expected: `1` for all 11 files.

- [ ] **Step 4: Check it loads clean and changes nothing**

In one shell: `PORT=8123 npm run dev`

Open `http://127.0.0.1:8123/`, select Bakurani, and in the console:

```js
ensureHeightfieldLoaded(S.map);
setTimeout(() => {
    const f = cachedHeightfield(S.map);
    console.log(f.width, f.height, heightfieldSample(f, 78, 74).toFixed(1));
}, 2000);
```

Expected: `346 346 -950.7` — matching the probe's sample at that coordinate to within a few metres. No console errors, and the map looks exactly as it did before.

- [ ] **Step 5: Commit**

```bash
git add js/map/heightfield.js src/pages/index.html src/pages/mobile/index.html src/pages/locales
git commit -m "Load the baked heightfield at runtime"
```

---

## Task 6: The ring solver

The fixed-point solve and its memo. Still dead code — Task 7 draws it — so again nothing visible changes when this lands.

**Files:**
- Create: `js/map/range-ring.js`
- Modify: all 11 HTML shells

**Interfaces:**
- Consumes: `cachedHeightfield`, `ensureHeightfieldLoaded`, `heightfieldSample` (Task 5); `WEAPONS`, `S`.
- Produces, all globals:
  - `PROJECTILE_MODEL` → the loaded model, or `null`
  - `loadProjectileModel()` → `Promise`, called once at startup
  - `weaponMuzzleVelocity(weaponId)` → m/s or `null`
  - `terrainRangeRing(gun, mapId)` → `{ radii: Float64Array (360, metres), maxRangeMeters }` or `null`

The memo key includes `mapId`, so a stale entry can never be served to the wrong map and no map-change hook is needed. It is bounded instead, because dragging a gun across the map mints one entry per 8 m of travel at ~2.9 KB each.

- [ ] **Step 1: Write the solver**

Create `js/map/range-ring.js`:

```js
/* =========================
   RANGE RING
   ========================= */

/*
 * The terrain-aware max range ring.
 *
 * How far a shell reaches on a bearing depends on the height of the ground
 * where it lands, which depends on how far it reached. So each bearing is a
 * fixed point, solved by marching outward until the model's max range stops
 * exceeding the distance already travelled.
 *
 * The result is always a DIFFERENCE added to the weapon's declared max
 * range, never the model's own absolute number. At deltaZ 0 that difference
 * is exactly zero and the ring is pixel-identical to the circle this
 * replaced. See docs/superpowers/specs/2026-08-27-terrain-range-ring-design.md
 * section 1.
 */

const RANGE_RING_BEARINGS = 360;
const RANGE_RING_MARCH_METRES = 25;
const RANGE_RING_BISECTIONS = 14;
const RANGE_RING_GRAVITY = 9.81;
const METRES_PER_GAME_UNIT_RING = 100;

/*
 * Metres the gun may move before its ring is resolved again.
 *
 * 8 m, not the grid's own 32 m, because z_gun enters every bearing: on steep
 * ground two points in one 32 m cell differ by ~20 m of height, which is
 * ~20 m of range — an order of magnitude above the 2.6 m p90 the grid
 * spacing itself contributes. The memo must not become the dominant error.
 */
const RANGE_RING_MEMO_METRES = 8;

const RANGE_RING_CACHE = new Map();

let PROJECTILE_MODEL = null;

function loadProjectileModel() {
    return fetch('data/ballistics/projectile-model.json')
        .then(response => response.ok ? response.json() : null)
        .then(model => {
            PROJECTILE_MODEL =
                model?.schema === 'wardogs-projectile-model-v1'
                    ? model
                    : null;
        })
        .catch(error => {
            console.warn(
                '[range-ring] No projectile model; ' +
                'range rings will stay circular.',
                error
            );

            PROJECTILE_MODEL = null;
        });
}

/*
 * Max range is reached at the arc crossover, so either arc's fit is valid.
 * Take the highest: that branch's own table extends furthest, so its fit is
 * the one anchored by the max-range end of the data.
 */
function weaponMuzzleVelocity(weaponId) {
    const arcs = PROJECTILE_MODEL?.weapons?.[weaponId];

    if (!arcs) {
        return null;
    }

    let best = null;

    for (const arc of Object.values(arcs)) {
        const v = Number(arc?.muzzleVelocity);

        if (Number.isFinite(v) && v > 0 && (best === null || v > best)) {
            best = v;
        }
    }

    return best;
}

/*
 * solveTan's discriminant solved for R:
 * R = (v/g) * sqrt(v^2 - 2 g deltaZ). Mirrors maxRangeMeters in
 * scripts/lib/ballistics.mjs, which is where it is unit-tested.
 */
function modelMaxRange(muzzleVelocity, deltaZMeters) {
    const inner =
        muzzleVelocity * muzzleVelocity -
        2 * RANGE_RING_GRAVITY * deltaZMeters;

    if (inner <= 0) {
        return null;
    }

    return muzzleVelocity * Math.sqrt(inner) / RANGE_RING_GRAVITY;
}

function rangeRingMemoKey(gun, mapId) {
    const cell = RANGE_RING_MEMO_METRES / METRES_PER_GAME_UNIT_RING;

    return [
        mapId,
        gun.weapon,
        Math.round(gun.position.x / cell),
        Math.round(gun.position.y / cell)
    ].join('|');
}

/*
 * Dragging a gun mints one entry per 8 m of travel, 2.9 KB each, so the
 * cache is bounded rather than cleared. Insertion order is iteration order
 * for a Map, which makes the oldest key the first one out.
 */
const RANGE_RING_CACHE_LIMIT = 256;

function rememberRangeRing(key, ring) {
    if (RANGE_RING_CACHE.size >= RANGE_RING_CACHE_LIMIT) {
        RANGE_RING_CACHE.delete(
            RANGE_RING_CACHE.keys().next().value
        );
    }

    RANGE_RING_CACHE.set(key, ring);
}

function terrainRangeRing(gun, mapId) {
    const weapon = WEAPONS[gun.weapon];

    if (!weapon) {
        return null;
    }

    ensureHeightfieldLoaded(mapId);

    const field = cachedHeightfield(mapId);
    const muzzleVelocity = weaponMuzzleVelocity(gun.weapon);

    if (!field || !muzzleVelocity) {
        return null;
    }

    const key = rangeRingMemoKey(gun, mapId);
    const memo = RANGE_RING_CACHE.get(key);

    if (memo) {
        return memo;
    }

    const zGun = heightfieldSample(
        field,
        gun.position.x,
        gun.position.y
    );

    if (zGun === null) {
        return null;
    }

    const declaredMax = (weapon.maxRange ?? weapon.range) * 1000;
    const levelMax = modelMaxRange(muzzleVelocity, 0);

    if (!levelMax) {
        return null;
    }

    /*
     * The furthest this gun could reach if the whole map were at its lowest
     * sample. An exact bound, so a bearing that never crosses still ends.
     */
    const marchLimit = Math.min(
        modelMaxRange(muzzleVelocity, field.minZMeters - zGun) ??
            declaredMax,
        declaredMax * 2
    );

    const radii = new Float64Array(RANGE_RING_BEARINGS);

    for (let b = 0; b < RANGE_RING_BEARINGS; b += 1) {
        const angle = b * 2 * Math.PI / RANGE_RING_BEARINGS;

        const stepX =
            Math.cos(angle) / METRES_PER_GAME_UNIT_RING;

        const stepY =
            Math.sin(angle) / METRES_PER_GAME_UNIT_RING;

        /*
         * True while the shell still outreaches the distance travelled.
         * Null once the ray leaves the grid.
         */
        const reaches = metres => {
            const z = heightfieldSample(
                field,
                gun.position.x + stepX * metres,
                gun.position.y + stepY * metres
            );

            if (z === null) {
                return null;
            }

            const modelled = modelMaxRange(muzzleVelocity, z - zGun);

            if (modelled === null) {
                return false;
            }

            return metres <= declaredMax + (modelled - levelMax);
        };

        let edge = null;
        let previous = RANGE_RING_MARCH_METRES;

        for (
            let r = RANGE_RING_MARCH_METRES;
            r <= marchLimit;
            r += RANGE_RING_MARCH_METRES
        ) {
            const ok = reaches(r);

            if (ok === null) {
                edge = previous;
                break;
            }

            if (!ok) {
                let inside = previous;
                let outside = r;

                for (let i = 0; i < RANGE_RING_BISECTIONS; i += 1) {
                    const middle = (inside + outside) / 2;

                    if (reaches(middle) === true) {
                        inside = middle;
                    } else {
                        outside = middle;
                    }
                }

                edge = (inside + outside) / 2;
                break;
            }

            previous = r;
        }

        radii[b] = edge === null ? marchLimit : edge;
    }

    const ring = {
        radii,
        maxRangeMeters: declaredMax
    };

    rememberRangeRing(key, ring);

    return ring;
}
```

- [ ] **Step 2: Load the model at startup**

In `js/main.js`, alongside the other startup fetches, add:

```js
    loadProjectileModel();
```

Find the existing `loadWeapons()` call and put it immediately after — it is fire-and-forget and nothing awaits it.

- [ ] **Step 3: Add the script tag to all 11 shells**

Immediately **after** the existing `js/map/guns-overlay.js` line in each shell:

```html
<script src="js/map/range-ring.js"></script>
```

- [ ] **Step 4: Verify the tags and check the solve**

Run:

```bash
grep -c "js/map/range-ring.js" src/pages/index.html src/pages/mobile/index.html src/pages/locales/*.html
```

Expected: `1` for all 11.

Then with `PORT=8123 npm run dev` running, on Bakurani in the console:

```js
setTimeout(() => {
    const gun = { position: { x: 51.67, y: 113.74 }, weapon: 'spg' };
    const ring = terrainRangeRing(gun, S.map);
    const r = Array.from(ring.radii);
    console.log('summit', Math.min(...r).toFixed(0), Math.max(...r).toFixed(0));

    const flat = { position: { x: 29.83, y: 45.34 }, weapon: 'spg' };
    const g = Array.from(terrainRangeRing(flat, S.map).radii);
    console.log('valley', Math.min(...g).toFixed(0), Math.max(...g).toFixed(0));
}, 2500);
```

Expected, within a few tens of metres of the probe:

```
summit 2882 3489
valley 2190 2629
```

The summit ring must be **entirely above** 2629 and the valley ring **entirely at or below** it. If both come out flat at 2629 the differential is being computed against the wrong baseline; if they are swapped, the `ΔZ` sign is inverted.

- [ ] **Step 5: Commit**

```bash
git add js/map/range-ring.js js/main.js src/pages/index.html src/pages/mobile/index.html src/pages/locales
git commit -m "Solve the max range ring against the terrain"
```

---

## Task 7: Draw the ring

The first task with a visible effect. Everything before it was inert.

**Files:**
- Modify: `js/map/guns-overlay.js`

**Interfaces:**
- Consumes: `terrainRangeRing` (Task 6); `kilometersToWorldDistance`, `metersToWorldDistance`, `view()`, `ctx`.
- Produces: nothing other tasks call.

- [ ] **Step 1: Replace `drawGunRangeRings`**

In `js/map/guns-overlay.js`, replace the whole `drawGunRangeRings` function with:

```js
/*
 * Traces a ring whose radius varies by bearing. Bearing 0 is +x and the
 * angle increases the same way it does in range-ring.js; screen y is
 * inverted, which is why sin is subtracted.
 */
function traceRangeRing(at, radii, scale, clampMetres) {
    ctx.beginPath();

    for (let b = 0; b < radii.length; b += 1) {
        const angle = b * 2 * Math.PI / radii.length;

        const metres = clampMetres === null
            ? radii[b]
            : Math.min(radii[b], clampMetres);

        const r = metersToWorldDistance(metres) * scale;

        const x = at.x + Math.cos(angle) * r;
        const y = at.y - Math.sin(angle) * r;

        if (b === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.closePath();
}

/*
 * The max range ring, terrain-aware where the data allows it.
 *
 * Two outlines: the solid one is clamped to the weapon's declared max range,
 * because past that the shipped table cannot produce a MIL and drawing it
 * filled would promise a shot we cannot lay. The faint one is the true
 * terrain reach, drawn only where it exceeds the clamp — context in the same
 * register as the deltaZ readout, never a number to fire on.
 *
 * With no heightfield this falls back to the circle it replaced.
 */
function drawGunRangeRings(gun, at) {
    const weapon = WEAPONS[gun.weapon];

    if (!weapon) {
        return;
    }

    const v = view();

    const maxRange = weapon.maxRange ?? weapon.range;
    const minRange = weapon.minRange ?? 0;

    const rangePx =
        kilometersToWorldDistance(maxRange) * v.scale;

    const minRangePx =
        kilometersToWorldDistance(minRange) * v.scale;

    const ring =
        typeof terrainRangeRing === 'function'
            ? terrainRangeRing(gun, S.map)
            : null;

    if (ring) {
        traceRangeRing(at, ring.radii, v.scale, ring.maxRangeMeters);
    } else {
        ctx.beginPath();
        ctx.arc(at.x, at.y, rangePx, 0, Math.PI * 2);
    }

    ctx.fillStyle = 'rgba(215,164,82,.08)';
    ctx.fill();

    ctx.strokeStyle = '#d7a452';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    /*
     * Only worth drawing when the terrain actually buys range somewhere.
     * On flat ground it coincides with the solid ring exactly.
     */
    if (ring && ring.radii.some(r => r > ring.maxRangeMeters + 1)) {
        traceRangeRing(at, ring.radii, v.scale, null);

        ctx.strokeStyle = 'rgba(215,164,82,.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    if (minRangePx > 0) {
        ctx.beginPath();
        ctx.arc(at.x, at.y, minRangePx, 0, Math.PI * 2);
        ctx.strokeStyle = '#d86666';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}
```

`ring.radii` is a `Float64Array`, which has `.some`. The min-range ring stays a circle deliberately — spec § 9.

- [ ] **Step 2: Check the flat-ground identity**

With `PORT=8123 npm run dev`, open a **custom** map (no terrain data) and put a gun down. The ring must be an exact circle, indistinguishable from before this task. Then in the console:

```js
console.log(terrainRangeRing(activeGun(), S.map));
```

Expected: `null` — no heightfield, so the fallback path drew it.

- [ ] **Step 3: Check the terrain path visually**

Switch to Bakurani. Place the active gun on high ground and then on a valley floor.

Expected:
- The ring is visibly non-circular and its outline is smooth, not jagged.
- On high ground a faint dashed outline appears outside the solid ring.
- On a valley floor the solid ring is visibly inside where the circle used to be, and no dashed outline appears.
- Dragging the gun updates the ring without stutter.
- The min-range ring is still a circle.
- No console errors.

- [ ] **Step 4: Check a second gun dims with the ring**

Add a second gun (idea 7's gun list) on different ground and select the first.

Expected: both rings drawn, the unselected one dimmed by `GUN_INACTIVE_ALPHA`, each with its own shape. Hiding the unselected gun removes its ring.

- [ ] **Step 5: Commit**

```bash
git add js/map/guns-overlay.js
git commit -m "Draw the max range ring against the terrain"
```

---

## Task 8: Regression driver and documentation

Pins the properties a future change could silently break — above all the flat-ground identity, which is what makes this feature safe to ship.

**Files:**
- Create: `test/range-ring.mjs`
- Modify: `docs/terrain.md`
- Modify: `docs/features.md`

**Interfaces:**
- Consumes: `test/helpers.mjs` (`launch`, `counter`); everything from Tasks 5–7.
- Produces: nothing.

- [ ] **Step 1: Write the driver**

Create `test/range-ring.mjs`:

```js
/*
 * The terrain-aware max range ring.
 *
 *   PORT=8123 npm run dev      # in one shell
 *   node test/range-ring.mjs   # in another
 */
import { launch, counter } from './helpers.mjs';

const PORT = process.env.PORT || '8123';
const URL = `http://127.0.0.1:${PORT}/`;
const state = counter();
const check = state.check;

const browser = await launch();
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

/* --- the heightfield loads and decodes --- */

const field = await page.evaluate(async () => {
    ensureHeightfieldLoaded('bakurani');

    for (let i = 0; i < 40 && !cachedHeightfield('bakurani'); i += 1) {
        await new Promise(r => setTimeout(r, 250));
    }

    const f = cachedHeightfield('bakurani');

    return f && { width: f.width, height: f.height };
});

check('bakurani heightfield decodes', field?.width === 346 && field?.height === 346);

/* --- an elevated gun outreaches the flat circle everywhere --- */

const summit = await page.evaluate(() => {
    const ring = terrainRangeRing(
        { position: { x: 51.67, y: 113.74 }, weapon: 'spg' },
        'bakurani'
    );

    const r = Array.from(ring.radii);

    return { min: Math.min(...r), max: Math.max(...r), cap: ring.maxRangeMeters };
});

check('summit ring clears the flat circle on every bearing', summit.min > summit.cap);
check('summit ring is not a circle', summit.max - summit.min > 300);

/* --- a valley gun falls short of it everywhere --- */

const valley = await page.evaluate(() => {
    const ring = terrainRangeRing(
        { position: { x: 29.83, y: 45.34 }, weapon: 'spg' },
        'bakurani'
    );

    const r = Array.from(ring.radii);

    return { min: Math.min(...r), max: Math.max(...r), cap: ring.maxRangeMeters };
});

check('valley ring never exceeds the flat circle', valley.max <= valley.cap + 1);
check('valley ring falls short somewhere', valley.cap - valley.min > 300);

/*
 * --- the safety property ---
 *
 * Level ground must return the declared max range on every bearing, or the
 * ring has stopped being a differential and the circle it replaced is gone.
 */

const level = await page.evaluate(() => {
    const f = cachedHeightfield('bakurani');
    const flatHeights = new Float32Array(f.heights.length).fill(-800);
    const saved = f.heights;

    f.heights = flatHeights;

    const ring = terrainRangeRing(
        { position: { x: 78.5, y: 74.5 }, weapon: 'spg' },
        'bakurani'
    );

    f.heights = saved;

    const r = Array.from(ring.radii);

    return {
        worst: Math.max(...r.map(v => Math.abs(v - ring.maxRangeMeters))),
        cap: ring.maxRangeMeters
    };
});

check('level ground reproduces the declared max range', level.worst < 1);
check('the declared max range is the weapon table value', Math.abs(level.cap - 2629) < 1);

/* --- an unsupported map falls back to the circle --- */

const custom = await page.evaluate(() =>
    terrainRangeRing({ position: { x: 5, y: 5 }, weapon: 'spg' }, 'custom')
);

check('an unsupported map has no terrain ring', custom === null);

check('no page errors', errors.length === 0, errors.join('; '));

console.log(`\n${state.pass} passed, ${state.fail} failed`);
await browser.close();
process.exit(state.fail ? 1 : 0);
```

- [ ] **Step 2: Run it**

In one shell: `PORT=8123 npm run dev`
In another: `node test/range-ring.mjs`

Expected: every check passes.

The level-ground check is the important one. If it fails, the ring is no longer a differential and flat maps have silently changed — stop and fix that before anything else.

- [ ] **Step 3: Document the asset in `docs/terrain.md`**

In the "Data layout" section, extend the directory listing:

```text
data/terrain/<map-id>/
├── manifest.json
├── contours.json
├── heightfield.json
├── heightfield.bin
└── chunks/
    ├── ...
    └── *.bin
```

Then add, after that listing:

```markdown
### The baked heightfield

`heightfield.json` + `heightfield.bin` are a 32 m grid over the map's playable
bounds, generated by `npm run build-heightfield` and committed. Bakurani is
234 KB, Ozeti smaller.

They exist because the range ring needs the whole map at once. The chunk
streamer above loads two chunks per firing solution; a 2.6 km ring sweeps
about 36 of them, roughly 19 MB. At 32 m the ring is reproduced to 0.7 m
median error against the full 2 m data.

Same datum caveat as everything else here: heights are offset by roughly
900 m and only differences are used.
```

- [ ] **Step 4: Document the behaviour in `docs/features.md`**

Add to whichever section covers the artillery overlay:

```markdown
### Terrain-aware max range

On maps with elevation data the max range ring is not a circle. Height
changes how far a shell carries — roughly a metre of range per metre of
height — so the ring is solved per bearing against the ground the shell
flies over.

Two outlines are drawn:

- **The solid ring** is the reachable area, never drawn past the weapon's
  table max range.
- **A faint dashed outline** appears outside it when terrain buys range the
  firing table does not cover. It is context, like the ΔZ readout — the app
  will not print a MIL for a target out there.

On maps without elevation data, and until the heightfield finishes loading,
the ring is the plain circle it has always been.
```

- [ ] **Step 5: Commit**

```bash
git add test/range-ring.mjs docs/terrain.md docs/features.md
git commit -m "Cover the terrain range ring and document it"
```

---

## Done when

- `npm run test:scripts` passes, including the two new suites.
- `node test/range-ring.mjs` passes every check, above all the level-ground identity.
- On a map with no terrain data the ring is pixel-identical to before this work.
- On Bakurani the ring deforms with the ground, smoothly, and a gun on high ground shows the advisory outline.
- `npm run build-contours` still produces byte-identical output (Task 3).
