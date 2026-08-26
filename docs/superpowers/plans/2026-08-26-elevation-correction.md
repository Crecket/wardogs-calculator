# Automatic Elevation Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the printed MIL account for the height difference between gun and target on the high-angle tables, behind a release gate that ships off.

**Architecture:** A build-time generator fits a vacuum trajectory to the shipped firing tables, then precomputes a `(distance × ΔZ) → Δmil` grid per weapon and arc. At runtime the existing (currently dead) bilinear interpolator looks the correction up and **adds** it to the flat-table value. The correction is a differential from the model, so it is exactly zero on flat ground and the shipped tables stay authoritative.

**Tech Stack:** Vanilla ES modules for build scripts (`node --test`), browser globals + IIFE for runtime (`js/features/`), JSON data in `data/ballistics/`.

**Spec:** [docs/superpowers/specs/2026-08-26-elevation-correction-design.md](../specs/2026-08-26-elevation-correction-design.md)

## Global Constraints

- **The gate ships off.** `releasePolicy.automaticMilCorrection` stays `false` through every task in this plan. Flipping it is § 8 of the spec, dated 2026-09-10.
- **Never modify** `interpolateBallisticTable` or `getWeaponElevationSolutions` in `js/features/weapons.js`, or any row in `data/weapons.json`.
- **Gate off ⇒ byte-identical output.** With the gate `false`, `getTerrainBallisticSolutions` must return `context.solutions` by reference.
- **Corrected arcs:** mortar `single`, spg `high`. **Uncorrected:** spg `low` (stored as `null`).
- Gravity is `9.81` everywhere.
- Grid axes: 40 distance samples across each arc's own min/max range; ΔZ from `-800` to `+800` in 50 m steps (33 values).
- Suppression threshold: 10 m of miss, applied at runtime, from `releasePolicy.suppressionMissMeters`.
- Build scripts use 4-space indent and ES module `import`, matching `scripts/build-contours.mjs`.
- Runtime code uses 4-space indent inside the existing IIFE, matching `js/features/terrain-ballistics.js`.
- Commit messages are a **title line only** — no body, no trailers.

---

### Task 1: Trajectory solver library

**Files:**
- Create: `scripts/lib/ballistics.mjs`
- Test: `scripts/lib/ballistics.test.mjs`
- Modify: `package.json:10` (add the new test file to `test:scripts`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `GRAVITY` → `9.81`
  - `rangeForTan(muzzleVelocity, tanTheta)` → `number` (flat-ground range, metres)
  - `solveTan(muzzleVelocity, rangeMeters, deltaZMeters, branch)` → `number | null`; `branch` is `'high' | 'low'`; `null` means unreachable
  - `milFromTan(arcModel, tanTheta)` → `number`
  - `milCorrection(arcModel, rangeMeters, deltaZMeters)` → `number | null`
  - `missMeters(arcModel, rangeMeters, deltaZMeters)` → `number | null`
  - `arcModel` shape: `{ branch, muzzleVelocity, angleOffsetDeg, anglePerMilDeg }`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/ballistics.test.mjs`:

```js
/*
 * Exercises the vacuum trajectory solver on values checked by hand, so a
 * regression here can be told apart from a regression in the fit that
 * supplies its parameters.
 *
 * Run with: npm run test:scripts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    GRAVITY,
    milCorrection,
    milFromTan,
    missMeters,
    rangeForTan,
    solveTan
} from './ballistics.mjs';

/* Fitted from data/weapons.json; see the design doc section 4. */
const SPG_HIGH = {
    branch: 'high',
    muzzleVelocity: 160.4,
    angleOffsetDeg: 14.5,
    anglePerMilDeg: 0.048
};

const MORTAR = {
    branch: 'high',
    muzzleVelocity: 86.7,
    angleOffsetDeg: 52.5,
    anglePerMilDeg: 0.0375
};

const SPG_LOW = {
    branch: 'low',
    muzzleVelocity: 160.1,
    angleOffsetDeg: 12.75,
    anglePerMilDeg: 0.058
};

const close = (actual, expected, tolerance = 1e-6) =>
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `${actual} is not within ${tolerance} of ${expected}`
    );

test('gravity is 9.81', () => {
    assert.equal(GRAVITY, 9.81);
});

test('45 degrees gives the vacuum maximum range', () => {
    close(rangeForTan(100, 1), 10000 / 9.81, 1e-9);
});

test('both branches converge at the 45 degree apex', () => {
    const apex = rangeForTan(100, 1);

    close(solveTan(100, apex, 0, 'high'), 1, 1e-9);
    close(solveTan(100, apex, 0, 'low'), 1, 1e-9);
});

test('solveTan round-trips through rangeForTan', () => {
    const t = solveTan(160.4, 1800, 0, 'high');

    close(rangeForTan(160.4, t), 1800, 1e-6);
});

test('a target above the trajectory ceiling is unreachable', () => {
    assert.equal(solveTan(100, rangeForTan(100, 1), 5000, 'high'), null);
});

test('milFromTan inverts the affine mil mapping', () => {
    const t = Math.tan((14.5 + 0.048 * 700) * Math.PI / 180);

    close(milFromTan(SPG_HIGH, t), 700, 1e-6);
});

test('flat ground needs exactly zero correction', () => {
    assert.equal(milCorrection(SPG_HIGH, 1800, 0), 0);
    assert.equal(milCorrection(MORTAR, 400, 0), 0);
});

test('uphill lowers mil on a high-branch arc', () => {
    close(milCorrection(SPG_HIGH, 1800, 100), -13.277571, 1e-5);
    close(milCorrection(MORTAR, 400, 100), -39.962229, 1e-5);
});

test('downhill raises mil on a high-branch arc', () => {
    close(milCorrection(SPG_HIGH, 1800, -100), 11.717212, 1e-5);
});

/*
 * These two reproduce the research doc's miss table, which was computed
 * independently with the dZ/tan(theta) approximation.
 */
test('miss distance matches the researched figures', () => {
    close(missMeters(SPG_HIGH, 1800, 100), 40.652596, 1e-5);
    close(missMeters(MORTAR, 400, 100), 30.498268, 1e-5);
});

test('short-range mortar miss falls under the suppression threshold', () => {
    assert.ok(missMeters(MORTAR, 200, 25) < 10);
});

/*
 * The low arc at 1181 m peaks 71 m above the muzzle, so a target 100 m
 * higher is not on the trajectory at any range.
 */
test('a low arc cannot reach above its own apex', () => {
    assert.equal(missMeters(SPG_LOW, 1181, 100), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/ballistics.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/lib/ballistics.mjs'`

- [ ] **Step 3: Write minimal implementation**

Create `scripts/lib/ballistics.mjs`:

```js
/*
 * A vacuum trajectory model for the shipped firing tables.
 *
 * The elevation angle is affine in mil, theta = a + b * mil, and range
 * follows R = v^2 sin(2 theta) / g. Both are approximations: fitting the
 * SPG's two arcs jointly is four times worse than fitting them apart, which
 * is the vacuum model absorbing real drag differently on each branch. See
 * the design doc section 4.
 *
 * Nothing here is used to produce a MIL directly. Callers take the
 * DIFFERENCE between two points on the same model curve, so most of that
 * absolute error cancels and flat ground is corrected by exactly zero.
 */

export const GRAVITY = 9.81;

const DEG = 180 / Math.PI;

export function rangeForTan(muzzleVelocity, tanTheta) {
    const sin2Theta = 2 * tanTheta / (1 + tanTheta * tanTheta);

    return muzzleVelocity * muzzleVelocity * sin2Theta / GRAVITY;
}

/*
 * Launch angle whose trajectory passes through (rangeMeters, deltaZMeters).
 *
 * With t = tan(theta) and k = g R^2 / 2 v^2 the trajectory equation becomes
 * k t^2 - R t + (dZ + k) = 0. The high branch takes the larger root.
 */
export function solveTan(
    muzzleVelocity,
    rangeMeters,
    deltaZMeters,
    branch
) {
    if (
        !Number.isFinite(muzzleVelocity) ||
        !Number.isFinite(rangeMeters) ||
        !Number.isFinite(deltaZMeters) ||
        rangeMeters <= 0
    ) {
        return null;
    }

    const k =
        GRAVITY * rangeMeters * rangeMeters /
        (2 * muzzleVelocity * muzzleVelocity);

    const discriminant =
        rangeMeters * rangeMeters -
        4 * k * (deltaZMeters + k);

    if (discriminant < 0) {
        return null;
    }

    const root = Math.sqrt(discriminant);

    return branch === 'high'
        ? (rangeMeters + root) / (2 * k)
        : (rangeMeters - root) / (2 * k);
}

export function milFromTan(arcModel, tanTheta) {
    return (
        Math.atan(tanTheta) * DEG - arcModel.angleOffsetDeg
    ) / arcModel.anglePerMilDeg;
}

/*
 * Mil to ADD to the flat-table value. Zero on flat ground by construction.
 */
export function milCorrection(arcModel, rangeMeters, deltaZMeters) {
    const aimed = solveTan(
        arcModel.muzzleVelocity,
        rangeMeters,
        deltaZMeters,
        arcModel.branch
    );

    const flat = solveTan(
        arcModel.muzzleVelocity,
        rangeMeters,
        0,
        arcModel.branch
    );

    if (aimed === null || flat === null) {
        return null;
    }

    return milFromTan(arcModel, aimed) - milFromTan(arcModel, flat);
}

/*
 * How far short (positive) or long (negative) the UNCORRECTED shot lands:
 * where the flat-aimed trajectory descends through altitude deltaZMeters.
 * This is what the suppression threshold gates on, because metres of miss
 * is the quantity a player can act on and mil-per-metre is not.
 */
export function missMeters(arcModel, rangeMeters, deltaZMeters) {
    const tanTheta = solveTan(
        arcModel.muzzleVelocity,
        rangeMeters,
        0,
        arcModel.branch
    );

    if (tanTheta === null) {
        return null;
    }

    const v = arcModel.muzzleVelocity;
    const cosSquared = 1 / (1 + tanTheta * tanTheta);
    const a = GRAVITY / (2 * v * v * cosSquared);
    const discriminant = tanTheta * tanTheta - 4 * a * deltaZMeters;

    if (discriminant < 0) {
        return null;
    }

    const root = Math.sqrt(discriminant);
    const crossings = [
        (tanTheta - root) / (2 * a),
        (tanTheta + root) / (2 * a)
    ].filter(x => x > 0);

    if (!crossings.length) {
        return null;
    }

    /* The descending crossing is the far one. */
    return rangeMeters - Math.max(...crossings);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/ballistics.test.mjs`
Expected: PASS, 12 tests

- [ ] **Step 5: Register the test file**

In `package.json`, change the `test:scripts` script to append `scripts/lib/ballistics.test.mjs`:

```json
"test:scripts": "node --test scripts/lib/sigv4.test.mjs scripts/lib/dev-env.test.mjs scripts/lib/contours.test.mjs scripts/lib/ballistics.test.mjs"
```

- [ ] **Step 6: Run the whole suite**

Run: `npm run test:scripts`
Expected: PASS, all four files

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/ballistics.mjs scripts/lib/ballistics.test.mjs package.json
git commit -m "feat: vacuum trajectory solver for elevation correction"
```

---

### Task 2: Fit the model to the shipped tables

**Files:**
- Modify: `scripts/lib/ballistics.mjs` (append `fitArc`)
- Modify: `scripts/lib/ballistics.test.mjs` (append fit tests)
- Create: `scripts/fit-ballistics.mjs`
- Create (generated, committed): `data/ballistics/projectile-model.json`
- Modify: `package.json` (add a `fit-ballistics` script)

**Interfaces:**
- Consumes: `rangeForTan` from Task 1.
- Produces:
  - `fitArc(rows, branch)` → `{ branch, muzzleVelocity, angleOffsetDeg, anglePerMilDeg, rmsMeters }`; `rows` is `[[distanceMeters, mil], ...]` straight from `data/weapons.json`
  - `data/ballistics/projectile-model.json` in the shape given in the design doc § 7

- [ ] **Step 1: Write the failing test**

Append to `scripts/lib/ballistics.test.mjs`:

```js
import { fitArc } from './ballistics.mjs';

/*
 * A table generated FROM the model must fit back to the model's own
 * parameters. This is the only test of fitArc that does not depend on the
 * shipped tables, so it isolates the search from the data.
 */
test('fitArc recovers parameters from a synthetic table', () => {
    const truth = {
        muzzleVelocity: 160,
        angleOffsetDeg: 14.5,
        anglePerMilDeg: 0.048
    };

    const rows = [];

    for (let mil = 700; mil <= 1300; mil += 10) {
        const deg = truth.angleOffsetDeg + truth.anglePerMilDeg * mil;
        const t = Math.tan(deg * Math.PI / 180);

        rows.push([Math.round(rangeForTan(truth.muzzleVelocity, t)), mil]);
    }

    const fit = fitArc(rows, 'high');

    assert.ok(fit.rmsMeters < 1, `RMS ${fit.rmsMeters} should be under 1 m`);
    close(fit.angleOffsetDeg, truth.angleOffsetDeg, 0.3);
    close(fit.anglePerMilDeg, truth.anglePerMilDeg, 0.001);
    close(fit.muzzleVelocity, truth.muzzleVelocity, 1);
});

test('fitArc reports the branch it was given', () => {
    const rows = [[1181, 20], [1232, 30], [1283, 40]];

    assert.equal(fitArc(rows, 'low').branch, 'low');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/ballistics.test.mjs`
Expected: FAIL — `fitArc is not a function` (or an import error)

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/lib/ballistics.mjs`:

```js
/*
 * Least squares over the affine mil mapping. The two angle parameters are
 * searched on a grid; muzzle velocity is solved in closed form for each
 * candidate, because for fixed angles R = (v^2/g) sin(2 theta) is linear in
 * v^2/g and the optimum is a ratio of sums.
 */
const ANGLE_OFFSET_MIN_DEG = -90;
const ANGLE_OFFSET_MAX_DEG = 90;
const ANGLE_OFFSET_STEP_DEG = 0.25;
const ANGLE_PER_MIL_MIN_DEG = 0.0005;
const ANGLE_PER_MIL_MAX_DEG = 0.2;
const ANGLE_PER_MIL_STEP_DEG = 0.0005;

export function fitArc(rows, branch) {
    const samples = rows
        .map(([distance, mil]) => [Number(distance), Number(mil)])
        .filter(pair => pair.every(Number.isFinite));

    if (samples.length < 3) {
        throw new Error('fitArc needs at least three table rows');
    }

    let best = null;

    for (
        let offset = ANGLE_OFFSET_MIN_DEG;
        offset <= ANGLE_OFFSET_MAX_DEG;
        offset += ANGLE_OFFSET_STEP_DEG
    ) {
        for (
            let perMil = ANGLE_PER_MIL_MIN_DEG;
            perMil <= ANGLE_PER_MIL_MAX_DEG;
            perMil += ANGLE_PER_MIL_STEP_DEG
        ) {
            let numerator = 0;
            let denominator = 0;
            let usable = true;

            for (const [distance, mil] of samples) {
                const theta = (offset + perMil * mil) * Math.PI / 180;
                const sin2Theta = Math.sin(2 * theta);

                if (sin2Theta <= 1e-6) {
                    usable = false;
                    break;
                }

                numerator += distance * sin2Theta;
                denominator += sin2Theta * sin2Theta;
            }

            if (!usable || denominator <= 0) {
                continue;
            }

            /* k = v^2 / g */
            const k = numerator / denominator;

            let squared = 0;

            for (const [distance, mil] of samples) {
                const theta = (offset + perMil * mil) * Math.PI / 180;
                const predicted = k * Math.sin(2 * theta);

                squared += (distance - predicted) ** 2;
            }

            const rms = Math.sqrt(squared / samples.length);

            if (!best || rms < best.rmsMeters) {
                best = {
                    branch,
                    muzzleVelocity: Math.sqrt(k * GRAVITY),
                    angleOffsetDeg: offset,
                    anglePerMilDeg: perMil,
                    rmsMeters: rms
                };
            }
        }
    }

    if (!best) {
        throw new Error('fitArc found no usable parameters');
    }

    return best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/ballistics.test.mjs`
Expected: PASS, 14 tests

- [ ] **Step 5: Write the generator script**

Create `scripts/fit-ballistics.mjs`:

```js
/*
 * Fits a vacuum trajectory to every arc in data/weapons.json and writes
 * data/ballistics/projectile-model.json, which is committed.
 *
 *     node scripts/fit-ballistics.mjs
 *
 * This exists because data/weapons.json stores [distance, mil] and nothing
 * else -- no impact angle, no muzzle velocity, no drag term. The fit
 * recovers them approximately.
 *
 * It is meant to be REPLACED, not refined. The game's paks return on
 * 2026-09-10 (docs/todo.md), at which point the projectile's real
 * parameters are a single asset read and this file should be rewritten by
 * hand with source: "pak-extract". See the design doc section 8.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fitArc, GRAVITY } from './lib/ballistics.mjs';

const root = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..'
);

const MODEL_SCHEMA = 'wardogs-projectile-model-v1';

/*
 * Which vacuum branch each table sits on. sin(2 theta) is symmetric about
 * 45 degrees, so range alone cannot say; this is read off the tables' own
 * naming, where the SPG "high" table carries uniformly higher mil than
 * "low", and the mortar's single table follows the same convention.
 */
const BRANCHES = {
    mortar: { single: 'high' },
    spg: { low: 'low', high: 'high' }
};

const round = (value, places) =>
    Number(value.toFixed(places));

async function main() {
    const weapons = JSON.parse(
        await readFile(join(root, 'data/weapons.json'), 'utf8')
    );

    const output = {
        schema: MODEL_SCHEMA,
        source: 'vacuum-fit',
        sourceNote:
            'Least-squares vacuum fit to data/weapons.json. Superseded by pak extraction; see docs/superpowers/specs/2026-08-26-elevation-correction-design.md section 8.',
        generatedAt: new Date().toISOString().slice(0, 10),
        gravity: GRAVITY,
        weapons: {}
    };

    for (const weapon of weapons.weapons) {
        const branches = BRANCHES[weapon.id];

        if (!branches) {
            console.warn(`skipping ${weapon.id}: no branch mapping`);
            continue;
        }

        output.weapons[weapon.id] = {};

        for (const [arc, branch] of Object.entries(branches)) {
            const rows = weapon.ballistics?.[arc];

            if (!Array.isArray(rows) || !rows.length) {
                console.warn(`skipping ${weapon.id}.${arc}: no table`);
                continue;
            }

            const fit = fitArc(rows, branch);

            output.weapons[weapon.id][arc] = {
                branch: fit.branch,
                muzzleVelocity: round(fit.muzzleVelocity, 1),
                angleOffsetDeg: round(fit.angleOffsetDeg, 2),
                anglePerMilDeg: round(fit.anglePerMilDeg, 5),
                rmsMeters: round(fit.rmsMeters, 2)
            };

            console.log(
                `${weapon.id}.${arc}: v=${round(fit.muzzleVelocity, 1)} m/s ` +
                `theta=${round(fit.angleOffsetDeg, 2)}+` +
                `${round(fit.anglePerMilDeg, 5)}*mil deg ` +
                `RMS=${round(fit.rmsMeters, 2)} m`
            );
        }
    }

    await writeFile(
        join(root, 'data/ballistics/projectile-model.json'),
        `${JSON.stringify(output, null, 4)}\n`
    );
}

await main();
```

- [ ] **Step 6: Run the generator and check the numbers**

Run: `node scripts/fit-ballistics.mjs`

Expected output — these are the values the design doc § 4 table records, and
a deviation means the fit or the tables changed:

```
mortar.single: v=86.7 m/s theta=52.5+0.0375*mil deg RMS=8.11 m
spg.low: v=160.1 m/s theta=12.75+0.058*mil deg RMS=14.11 m
spg.high: v=160.4 m/s theta=14.5+0.048*mil deg RMS=8.11 m
```

- [ ] **Step 7: Register the script**

In `package.json`, add to `scripts`:

```json
"fit-ballistics": "node scripts/fit-ballistics.mjs"
```

- [ ] **Step 8: Verify nothing else broke**

Run: `npm run test:scripts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/ballistics.mjs scripts/lib/ballistics.test.mjs scripts/fit-ballistics.mjs data/ballistics/projectile-model.json package.json
git commit -m "feat: fit projectile model from shipped firing tables"
```

---

### Task 3: Precompute the correction grid

**Files:**
- Create: `scripts/build-height-correction.mjs`
- Create (generated, committed): `data/ballistics/height-correction.json`
- Modify: `package.json` (add a `build-height-correction` script)

**Interfaces:**
- Consumes: `milCorrection`, `missMeters` from Task 1; `data/ballistics/projectile-model.json` from Task 2.
- Produces: `data/ballistics/height-correction.json` in the shape given in the design doc § 7 — `weapons[weaponId][arc]` is either `{ distancesMeters, deltaZMeters, milCorrections, missMeters }` or `null`. Both matrices are indexed `[deltaZ index][distance index]`.

Note the per-arc distance span comes from the arc's **own table rows**, not from
the weapon's `minRangeKm` / `maxRangeKm`. The SPG's arcs do not share a span:
`low` covers 1181–2629 m and `high` covers 735–2629 m.

- [ ] **Step 1: Write the generator**

Create `scripts/build-height-correction.mjs`:

```js
/*
 * Precomputes the elevation correction grid from the fitted projectile
 * model, and writes data/ballistics/height-correction.json, which is
 * committed.
 *
 *     node scripts/build-height-correction.mjs
 *
 * The runtime reads this with a bilinear lookup and ADDS the result to the
 * flat-table mil. Every value here is a DIFFERENCE between two points on
 * the same model curve, so the deltaZ = 0 column is exactly zero and flat
 * ground is untouched. See the design doc section 1.
 *
 * spg.low is deliberately written as null: research section 5 puts its
 * break-even impact angle at 25 degrees where the vacuum fit says 13, so a
 * correction there is a coin flip. null means "policy says do not correct",
 * as distinct from a missing arc.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { milCorrection, missMeters } from './lib/ballistics.mjs';

const root = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..'
);

const CORRECTION_SCHEMA = 'wardogs-height-correction-v1';

/* Arcs the correction ships on. Anything absent is written as null. */
const CORRECTED_ARCS = {
    mortar: ['single'],
    spg: ['high']
};

const DISTANCE_SAMPLES = 40;
const DELTA_Z_MIN_METERS = -800;
const DELTA_Z_MAX_METERS = 800;
const DELTA_Z_STEP_METERS = 50;

const round = (value, places) =>
    value === null ? null : Number(value.toFixed(places));

function distanceAxis(rows) {
    const distances = rows
        .map(row => Number(row[0]))
        .filter(Number.isFinite);

    const min = Math.min(...distances);
    const max = Math.max(...distances);
    const step = (max - min) / (DISTANCE_SAMPLES - 1);

    return Array.from(
        { length: DISTANCE_SAMPLES },
        (unused, i) => Number((min + step * i).toFixed(1))
    );
}

function deltaZAxis() {
    const axis = [];

    for (
        let dz = DELTA_Z_MIN_METERS;
        dz <= DELTA_Z_MAX_METERS;
        dz += DELTA_Z_STEP_METERS
    ) {
        axis.push(dz);
    }

    return axis;
}

function buildGrid(arcModel, rows) {
    const distancesMeters = distanceAxis(rows);
    const deltaZMeters = deltaZAxis();

    const milCorrections = deltaZMeters.map(
        dz => distancesMeters.map(
            distance => round(milCorrection(arcModel, distance, dz), 3)
        )
    );

    const missMatrix = deltaZMeters.map(
        dz => distancesMeters.map(
            distance => round(missMeters(arcModel, distance, dz), 2)
        )
    );

    return {
        distancesMeters,
        deltaZMeters,
        milCorrections,
        missMeters: missMatrix
    };
}

async function main() {
    const weapons = JSON.parse(
        await readFile(join(root, 'data/weapons.json'), 'utf8')
    );

    const model = JSON.parse(
        await readFile(
            join(root, 'data/ballistics/projectile-model.json'),
            'utf8'
        )
    );

    const output = {
        schema: CORRECTION_SCHEMA,
        generatedFrom: 'data/ballistics/projectile-model.json',
        modelSource: model.source,
        generatedAt: new Date().toISOString().slice(0, 10),
        weapons: {}
    };

    for (const weapon of weapons.weapons) {
        const arcs = weapon.ballistics;

        if (!arcs) {
            continue;
        }

        output.weapons[weapon.id] = {};

        const corrected = CORRECTED_ARCS[weapon.id] ?? [];

        for (const arc of Object.keys(arcs)) {
            if (!corrected.includes(arc)) {
                output.weapons[weapon.id][arc] = null;
                console.log(`${weapon.id}.${arc}: null (uncorrected by policy)`);
                continue;
            }

            const arcModel = model.weapons?.[weapon.id]?.[arc];

            if (!arcModel) {
                throw new Error(
                    `No fitted model for ${weapon.id}.${arc}`
                );
            }

            const grid = buildGrid(arcModel, arcs[arc]);

            output.weapons[weapon.id][arc] = grid;

            const unreachable = grid.milCorrections
                .flat()
                .filter(value => value === null)
                .length;

            const total =
                grid.milCorrections.length *
                grid.distancesMeters.length;

            console.log(
                `${weapon.id}.${arc}: ` +
                `${grid.distancesMeters.length} x ${grid.deltaZMeters.length} ` +
                `(${grid.distancesMeters[0]}-` +
                `${grid.distancesMeters.at(-1)} m), ` +
                `${unreachable}/${total} unreachable`
            );
        }
    }

    await writeFile(
        join(root, 'data/ballistics/height-correction.json'),
        `${JSON.stringify(output)}\n`
    );
}

await main();
```

- [ ] **Step 2: Run the generator**

Run: `node scripts/build-height-correction.mjs`

Expected: three lines, `mortar.single` and `spg.high` with grid dimensions,
`spg.low` reported as null. Some unreachable cells are expected and correct —
a mortar at 684 m cannot reach a target 100 m above it.

- [ ] **Step 3: Verify the flat-ground column is exactly zero**

This is the safety property from the design doc § 1. Run:

```bash
node -e '
const g = require("./data/ballistics/height-correction.json");
for (const [w, arcs] of Object.entries(g.weapons)) {
    for (const [arc, grid] of Object.entries(arcs)) {
        if (!grid) { console.log(w + "." + arc + ": null"); continue; }
        const i = grid.deltaZMeters.indexOf(0);
        if (i < 0) throw new Error(w + "." + arc + ": no deltaZ=0 row");
        const bad = grid.milCorrections[i].filter(v => v !== 0);
        console.log(w + "." + arc + ": deltaZ=0 row has " + bad.length + " non-zero cells");
        if (bad.length) process.exit(1);
    }
}
'
```

Expected: every corrected arc reports `0 non-zero cells`, `spg.low: null`.

- [ ] **Step 4: Verify the correction signs**

Uphill must always mean "shoot further". On these three high-branch arcs the
tables run mil-down-for-range, so uphill correction must be negative. Run:

```bash
node -e '
const g = require("./data/ballistics/height-correction.json");
const grid = g.weapons.spg.high;
const up = grid.deltaZMeters.indexOf(200);
const down = grid.deltaZMeters.indexOf(-200);
const mid = Math.floor(grid.distancesMeters.length / 2);
console.log("range", grid.distancesMeters[mid]);
console.log("uphill  +200 m ->", grid.milCorrections[up][mid], "mil");
console.log("downhill -200 m ->", grid.milCorrections[down][mid], "mil");
'
```

Expected: uphill negative, downhill positive, and roughly equal in magnitude.

- [ ] **Step 5: Check the file size**

Run: `ls -la data/ballistics/height-correction.json`
Expected: well under 200 KB. If it is larger, the axis constants were changed.

- [ ] **Step 6: Register the script**

In `package.json`, add to `scripts`:

```json
"build-height-correction": "node scripts/build-height-correction.mjs"
```

- [ ] **Step 7: Commit**

```bash
git add scripts/build-height-correction.mjs data/ballistics/height-correction.json package.json
git commit -m "feat: precompute elevation correction grid"
```

---

### Task 4: Make the release gate real

Today three flags in `terrain-context.json` describe the release policy and
**none of them gates anything**. `calibration.ready` is read at
`terrain-ballistics.js:462` only to emit a console warning; the actual gate is a
hardcoded return with a `RELEASE SAFETY INVARIANT` comment at
`terrain-ballistics.js:980`. This task turns `automaticMilCorrection` into the
real gate. It ships `false`, so behaviour must not change at all.

**Files:**
- Modify: `data/ballistics/terrain-context.json`
- Modify: `js/features/terrain-ballistics.js` (`initTerrainBallistics`, `getTerrainBallisticSolutions`, `getTerrainBallisticsState`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `state.correctionEnabled` → `boolean`, read from `config.releasePolicy.automaticMilCorrection`
  - `state.suppressionMissMeters` → `number`, from `config.releasePolicy.suppressionMissMeters`, default `10`
  - `getTerrainBallisticsState().autoCorrectionEnabled` now reflects `state.correctionEnabled` instead of the literal `false`

- [ ] **Step 1: Record the current output as a baseline**

There is no test harness under `js/`, so the check is a manual before/after.
Start the dev server and capture today's behaviour.

Run: `npm run dev`

In the browser, place artillery and a target on Bakurani with a visible ΔZ,
then in the devtools console:

```js
copy(JSON.stringify({
    state: getTerrainBallisticsState(),
    mil: document.getElementById('mil').textContent,
    detail: document.getElementById('milAlt').textContent
}, null, 2))
```

Paste that into `/tmp/baseline.json`. Note the map, both coordinates, and the
selected weapon and ammo so the same shot can be reproduced in Step 5.

- [ ] **Step 2: Add the policy fields**

In `data/ballistics/terrain-context.json`, replace the `releasePolicy` object
with:

```json
  "releasePolicy": {
    "automaticMilCorrection": false,
    "flatTableAuthoritative": true,
    "suppressionMissMeters": 10,
    "heightCorrection": "data/ballistics/height-correction.json",
    "reason": "Terrain3D elevation is verified for supported maps, but the projectile model is a vacuum fit to our own tables rather than extracted game data. Flip automaticMilCorrection only after the model is rebuilt from the paks; see docs/superpowers/specs/2026-08-26-elevation-correction-design.md section 8."
  },
```

- [ ] **Step 3: Read the flags at init**

In `js/features/terrain-ballistics.js`, inside `initTerrainBallistics`, replace
this block:

```js
            if (!config.calibration?.ready) {
                terrainWarn(
                    'Runtime hook is installed but calibration.ready=false; flat-table fallback remains authoritative.'
                );
            }
```

with:

```js
            const policy = config.releasePolicy ?? {};

            state.correctionEnabled = Boolean(
                policy.automaticMilCorrection
            );

            const suppression = Number(policy.suppressionMissMeters);

            state.suppressionMissMeters =
                Number.isFinite(suppression) && suppression >= 0
                    ? suppression
                    : DEFAULT_SUPPRESSION_MISS_METERS;

            if (!state.correctionEnabled) {
                terrainWarn(
                    'Runtime hook is installed but releasePolicy.automaticMilCorrection=false; the flat table remains authoritative.'
                );
            }
```

- [ ] **Step 4: Add the constant and the state fields**

Near the top of the IIFE, beside the other module constants, add:

```js
    const DEFAULT_SUPPRESSION_MISS_METERS = 10;
```

Add `correctionEnabled: false` and
`suppressionMissMeters: DEFAULT_SUPPRESSION_MISS_METERS` to the `state` object
literal, alongside the existing fields.

Then in `getTerrainBallisticsState`, replace the two hardcoded lines:

```js
            calibrated: false,
            autoCorrectionEnabled: false,
            mode: 'terrain-information-only',
```

with:

```js
            calibrated: Boolean(state.config?.calibration?.ready),
            autoCorrectionEnabled: state.correctionEnabled,
            mode: state.correctionEnabled
                ? 'terrain-corrected'
                : 'terrain-information-only',
```

- [ ] **Step 5: Verify nothing changed**

Reload the dev server, reproduce the exact shot from Step 1, and re-run the
same console snippet.

Expected: `mil` and `detail` identical to `/tmp/baseline.json`.
`state.autoCorrectionEnabled` is still `false` and `state.mode` is still
`terrain-information-only`, now because the flag says so rather than because
the value was hardcoded.

- [ ] **Step 6: Verify the gate actually gates**

Temporarily set `automaticMilCorrection` to `true` in
`data/ballistics/terrain-context.json`, hard-reload, and re-run the snippet.

Expected: `state.autoCorrectionEnabled` is now `true` and `state.mode` is
`terrain-corrected`, while `mil` is still unchanged — nothing consumes the flag
yet. **Set it back to `false` before committing.**

- [ ] **Step 7: Commit**

```bash
git add data/ballistics/terrain-context.json js/features/terrain-ballistics.js
git commit -m "refactor: make automaticMilCorrection a real release gate"
```

---

### Task 5: Apply the correction behind the gate

**Files:**
- Modify: `js/features/terrain-ballistics.js` (`initTerrainBallistics`, `getTerrainBallisticSolutions`)

**Interfaces:**
- Consumes: `state.correctionEnabled` and `state.suppressionMissMeters` from Task 4; `data/ballistics/height-correction.json` from Task 3; the existing `interpolateHeightCorrection(grid, distanceMeters, deltaZMeters)` at `terrain-ballistics.js:865`, which is currently written but never called.
- Produces: `meta` gains `applied` (boolean), `arcsCorrected` (array of arc names), `arcsUncorrected` (array of arc names), and `missMeters` (number or null). Task 6 renders these.

The correction is **added** to each arc's mil. `cloneSolutions` already exists at
`terrain-ballistics.js:907` for exactly this — mutating `context.solutions`
would corrupt the caller's flat-table object.

- [ ] **Step 1: Load the grid at init**

In `initTerrainBallistics`, immediately after the `state.config = config;` line,
add:

```js
            state.correction = null;

            const correctionUrl = config.releasePolicy?.heightCorrection;

            if (correctionUrl) {
                try {
                    const correction = await fetchJson(correctionUrl);

                    if (
                        correction?.schema !== 'wardogs-height-correction-v1'
                    ) {
                        throw new Error(
                            `Unsupported height correction schema: ${correction?.schema}`
                        );
                    }

                    state.correction = correction;

                    terrainLog(
                        'height correction loaded',
                        `source=${correction.modelSource}`
                    );
                } catch (error) {
                    terrainWarn(
                        'Could not load the height correction grid; the flat table remains authoritative.',
                        error
                    );
                }
            }
```

Add `correction: null` to the `state` object literal.

- [ ] **Step 2: Add the per-arc correction helper**

Add this above `getTerrainBallisticSolutions`:

```js
    const ARCS = ['single', 'low', 'high'];

    /*
     * Adds the interpolated correction to one arc, or returns the arc
     * untouched. Returns null when the arc is absent from the solution.
     *
     * A null from interpolateHeightCorrection means one of three things,
     * all handled identically: the arc is uncorrected by policy (the grid
     * entry is null), the target is off the grid, or the target is
     * unreachable on this arc because it sits above the trajectory's apex.
     */
    function correctArc(solution, grid, distanceMeters, deltaZMeters) {
        if (!solution || !grid) {
            return { solution, corrected: false, missMeters: null };
        }

        const miss = interpolateHeightCorrection(
            {
                distancesMeters: grid.distancesMeters,
                deltaZMeters: grid.deltaZMeters,
                milCorrections: grid.missMeters
            },
            distanceMeters,
            deltaZMeters
        );

        if (
            !Number.isFinite(miss) ||
            Math.abs(miss) < state.suppressionMissMeters
        ) {
            return { solution, corrected: false, missMeters: miss ?? null };
        }

        const deltaMil = interpolateHeightCorrection(
            grid,
            distanceMeters,
            deltaZMeters
        );

        if (!Number.isFinite(deltaMil)) {
            return { solution, corrected: false, missMeters: miss };
        }

        return {
            solution: {
                ...solution,
                mil: Number.isFinite(solution.mil)
                    ? solution.mil + deltaMil
                    : solution.mil,
                minMil: solution.minMil + deltaMil,
                maxMil: solution.maxMil + deltaMil
            },
            corrected: true,
            missMeters: miss
        };
    }
```

- [ ] **Step 3: Replace the release invariant**

In `getTerrainBallisticSolutions`, replace the final `return` block — the one
carrying the `RELEASE SAFETY INVARIANT` comment — with:

```js
        const deltaZ = targetZ - originZ;

        const grids =
            state.correction?.weapons?.[context.weapon?.id] ?? null;

        const meta = {
            available: true,
            pendingTerrain: false,
            applied: false,
            reason: 'information-only',
            mapId: terrain.mapId,
            originZ,
            targetZ,
            deltaZ,
            arcsCorrected: [],
            arcsUncorrected: [],
            missMeters: null
        };

        if (!state.correctionEnabled || !grids) {
            return { solutions: context.solutions, meta };
        }

        const corrected = cloneSolutions(context.solutions);
        let worstMiss = null;

        for (const arc of ARCS) {
            if (!corrected[arc]) {
                continue;
            }

            const result = correctArc(
                corrected[arc],
                grids[arc] ?? null,
                context.distanceMeters,
                deltaZ
            );

            corrected[arc] = result.solution;

            if (result.corrected) {
                meta.arcsCorrected.push(arc);
            } else {
                meta.arcsUncorrected.push(arc);
            }

            if (
                Number.isFinite(result.missMeters) &&
                (worstMiss === null ||
                    Math.abs(result.missMeters) > Math.abs(worstMiss))
            ) {
                worstMiss = result.missMeters;
            }
        }

        meta.missMeters = worstMiss;
        meta.applied = meta.arcsCorrected.length > 0;
        meta.reason = meta.applied
            ? 'terrain-corrected'
            : 'information-only';

        return {
            solutions: meta.applied ? corrected : context.solutions,
            meta
        };
```

- [ ] **Step 4: Verify the gate-off path is unchanged**

Reload the dev server with `automaticMilCorrection` still `false`. Reproduce the
Step 1 shot from Task 4.

Expected: `mil` and `detail` identical to `/tmp/baseline.json`. The grid fetch
appears in the network tab and `[terrain-ballistics] height correction loaded`
appears in the console, but nothing else changes.

- [ ] **Step 5: Verify the correction with the gate on**

Temporarily set `automaticMilCorrection` to `true`, hard-reload, and pick a
Bakurani mortar shot with a clearly uphill target.

Expected:
- The mortar MIL drops relative to the baseline (uphill needs more range, and
  the mortar table runs mil-down-for-range).
- On an SPG shot, the `high` value moves and the `low` value does **not**.
- Moving the target to a point with near-zero ΔZ returns the value to the
  flat-table number exactly.
- `getTerrainBallisticsState().mode` is `terrain-corrected`.

**Set the flag back to `false` before committing.**

- [ ] **Step 6: Commit**

```bash
git add js/features/terrain-ballistics.js
git commit -m "feat: apply terrain elevation correction behind the release gate"
```

---

### Task 6: Caption the corrected and uncorrected arcs

Research § 5 is explicit that silently shipping an uncorrected low arc beside a
corrected high arc is the one outcome worse than the status quo, because it
removes the user's reason to distrust the number. The caption is the feature,
not decoration.

Strings live in the `UI_TEXT` map inside `js/features/terrain-ballistics.js:42`,
**not** in `locales/*.json`. That map currently carries nine languages —
`en, ru, uk, de, fr, es, pl, pt, cat` — while `locales/` ships eleven.
`zh-cn` is missing and silently falls back to English.

**Files:**
- Modify: `js/features/terrain-ballistics.js` (`UI_TEXT`, `formatTerrainBallisticsStatus`)

**Interfaces:**
- Consumes: `meta.applied`, `meta.arcsCorrected`, `meta.arcsUncorrected`, `meta.deltaZ` from Task 5.
- Produces: no new exports. `formatTerrainBallisticsStatus` keeps its signature and its consumer at `js/features/results.js:70`.

- [ ] **Step 1: Add the two new keys to every existing language**

Add `terrainStatusCorrected` and `terrainStatusUncorrectedArc` beside the
existing `terrainStatus` in each of the nine blocks:

```js
        en: {
            terrainStatusCorrected: 'ΔZ {dz} m · MIL corrected',
            terrainStatusUncorrectedArc: 'ΔZ {dz} m · low arc NOT corrected',
        ru: {
            terrainStatusCorrected: 'ΔZ {dz} м · MIL скорректирован',
            terrainStatusUncorrectedArc: 'ΔZ {dz} м · настильная траектория БЕЗ коррекции',
        uk: {
            terrainStatusCorrected: 'ΔZ {dz} м · MIL скориговано',
            terrainStatusUncorrectedArc: 'ΔZ {dz} м · настильна траєкторія БЕЗ корекції',
        de: {
            terrainStatusCorrected: 'ΔZ {dz} m · MIL korrigiert',
            terrainStatusUncorrectedArc: 'ΔZ {dz} m · flache Bahn NICHT korrigiert',
        fr: {
            terrainStatusCorrected: 'ΔZ {dz} m · MIL corrigé',
            terrainStatusUncorrectedArc: 'ΔZ {dz} m · tir tendu NON corrigé',
        es: {
            terrainStatusCorrected: 'ΔZ {dz} m · MIL corregido',
            terrainStatusUncorrectedArc: 'ΔZ {dz} m · trayectoria baja SIN corregir',
        pl: {
            terrainStatusCorrected: 'ΔZ {dz} m · MIL skorygowany',
            terrainStatusUncorrectedArc: 'ΔZ {dz} m · tor płaski BEZ korekty',
        pt: {
            terrainStatusCorrected: 'ΔZ {dz} m · MIL corrigido',
            terrainStatusUncorrectedArc: 'ΔZ {dz} m · trajetória baixa NÃO corrigida',
        cat: {
            terrainStatusCorrected: 'ΔZ {dz} m · MIL MEOWGIC APPLIED',
            terrainStatusUncorrectedArc: 'ΔZ {dz} m · FLAT SHOT HAS NO MEOWGIC',
```

- [ ] **Step 2: Add the missing zh-cn block**

Add after the `pt` block and before `cat`:

```js
        'zh-cn': {
            terrainLoading: '正在加载高程',
            terrainStatus: 'ΔZ {dz} 米 · MIL 未自动修正',
            terrainStatusCorrected: 'ΔZ {dz} 米 · MIL 已按高差修正',
            terrainStatusUncorrectedArc: 'ΔZ {dz} 米 · 低伸弹道未修正',
            warningTitle: '射击前请将 SPH-2 停放水平',
            warningBody: '车体倾斜会改变实际射程。请将 SPH-2 停在尽可能平坦的地面上。在炮手 HUD 中，找到 STABILIZED / ASL 下方的车辆轮廓图：两侧的小标记显示横向倾斜。调整车辆位置，直到两个标记尽可能居中且对齐。前后坡度同样影响射程，请避免停在上坡或下坡上。'
        },
```

- [ ] **Step 3: Select the caption**

Replace the tail of `formatTerrainBallisticsStatus` — everything from the
`const dz =` assignment to the end of the function — with:

```js
        const dz =
            `${meta.deltaZ >= 0 ? '+' : ''}${meta.deltaZ.toFixed(1)}`;

        /*
         * An uncorrected arc beside a corrected one is the case the caption
         * exists for. Naming it beats a generic "corrected" that leaves the
         * user unable to tell which number to trust.
         */
        if (meta.applied && meta.arcsUncorrected?.length) {
            return text.terrainStatusUncorrectedArc.replace('{dz}', dz);
        }

        if (meta.applied) {
            return text.terrainStatusCorrected.replace('{dz}', dz);
        }

        return text.terrainStatus.replace('{dz}', dz);
```

- [ ] **Step 4: Verify every language has every key**

Run:

```bash
node -e '
const src = require("fs").readFileSync("js/features/terrain-ballistics.js", "utf8");
const body = src.slice(src.indexOf("const UI_TEXT"), src.indexOf("function installWarningStyle"));
const keys = ["terrainLoading", "terrainStatus", "terrainStatusCorrected", "terrainStatusUncorrectedArc", "warningTitle", "warningBody"];
const langs = [...body.matchAll(/^\s{8}'?([a-z-]+)'?:\s*\{/gm)].map(m => m[1]);
console.log("languages:", langs.join(", "));
for (const lang of langs) {
    const start = body.indexOf(lang + ":");
    const block = body.slice(start, body.indexOf("},", start));
    const missing = keys.filter(k => !block.includes(k + ":"));
    console.log(lang, missing.length ? "MISSING " + missing.join(",") : "ok");
}
'
```

Expected: ten languages listed, every one `ok`.

- [ ] **Step 5: Verify the captions render**

Reload the dev server. With the gate `false`, the caption must still read
`MIL not auto-corrected`. Then set `automaticMilCorrection` to `true` and check
an SPG shot with a large ΔZ.

Expected: the caption reads `low arc NOT corrected`. Switching to the mortar,
which has no low arc, gives `MIL corrected`. Switching the language selector to
中文 shows the Chinese strings rather than English.

**Set the flag back to `false` before committing.**

- [ ] **Step 6: Commit**

```bash
git add js/features/terrain-ballistics.js
git commit -m "feat: caption corrected and uncorrected arcs, add zh-cn terrain strings"
```

---

### Task 7: Update the docs to match

Three documents currently assert that elevation is informational only. That is
still true — the gate ships off — but they must describe the mechanism that is
now present and the single flag that turns it on, or the next person will
rebuild it.

**Files:**
- Modify: `docs/terrain.md`
- Modify: `docs/todo.md`
- Modify: `docs/ideas-research/ideas.md` (§ 1)

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update `docs/terrain.md`**

Two places need editing.

First, `docs/terrain.md:36` reads "Terrain3D is informational only." Replace
that line with:

```markdown
Terrain3D drives an elevation correction that is built but gated off; until
`releasePolicy.automaticMilCorrection` flips, it is informational only.
```

Second, replace the whole `## Release boundary` section (`docs/terrain.md:314`
through the end of that section, four paragraphs beginning "Terrain3D
extraction and display are separate from ballistic compensation") with:

```markdown
## Ballistic compensation

Terrain3D supplies ΔZ to an elevation correction that is **built but gated
off**. `data/ballistics/terrain-context.json` carries
`releasePolicy.automaticMilCorrection`, and while it is `false` the printed MIL
is the flat-table value, unchanged.

When it is `true`, the correction is looked up from
`data/ballistics/height-correction.json` and **added** to the flat-table mil. It
is a differential from a model, so it is exactly zero at ΔZ = 0 and the shipped
tables stay authoritative on flat ground.

The correction applies to the mortar `single` and SPG-2 `high` tables. SPG-2
`low` is deliberately `null` in the grid and carries a caption saying so.

The model in `data/ballistics/projectile-model.json` is currently a vacuum fit
to our own firing tables, marked `source: "vacuum-fit"`. It is meant to be
replaced by pak extraction, not refined. See
[the design doc](superpowers/specs/2026-08-26-elevation-correction-design.md).

Regenerate both files with:

    npm run fit-ballistics
    npm run build-height-correction
```

- [ ] **Step 2: Add the two blockers to `docs/todo.md`**

Add under the existing unverified-values list:

```markdown
## Elevation correction — before flipping the gate

`releasePolicy.automaticMilCorrection` in `data/ballistics/terrain-context.json`
is `false` and must stay so until both of these are cleared:

- **Projectile parameters from the paks.** The model is a vacuum fit to our own
  tables; the SPG's two arcs want different mil→degree slopes, which is the fit
  absorbing real drag. Early Access on 2026-09-10 restores
  `Wardogs/Content/Paks/pakchunk0-WindowsClient.*`; read the projectile's
  muzzle velocity, gravity scale and drag term and rewrite
  `data/ballistics/projectile-model.json` with `source: "pak-extract"`.
- **Ozeti's coordinate alignment.** Bakurani was validated by a visual overlay
  after the Y-flip fix in `5c462a173`; Ozeti never was. Alignment is per-map and
  a numeric correction tolerates a misalignment far worse than a caption does.
  Resolve it, or gate the correction to Bakurani.

Then re-evaluate SPG-2 `low` against the break-even in
[ideas-research/01-terrain-heightmap.md](ideas-research/01-terrain-heightmap.md)
§ 5, and validate with four or five in-game spotting shots.
```

- [ ] **Step 3: Update the ideas entry**

In `docs/ideas-research/ideas.md` § 1, replace the `**Cost:**` paragraph with:

```markdown
**Built, gated off.** The correction ships behind
`releasePolicy.automaticMilCorrection` in `data/ballistics/terrain-context.json`,
applied to the mortar `single` and SPG-2 `high` tables. See
[the design doc](../superpowers/specs/2026-08-26-elevation-correction-design.md)
and [the plan](../superpowers/plans/2026-08-26-elevation-correction.md). Two
blockers remain before the flag flips, both tracked in [todo.md](../todo.md).
```

- [ ] **Step 4: Check the cross-links resolve**

Run:

```bash
node -e '
const fs = require("fs");
const path = require("path");
for (const file of ["docs/terrain.md", "docs/todo.md", "docs/ideas-research/ideas.md"]) {
    const body = fs.readFileSync(file, "utf8");
    for (const m of body.matchAll(/\]\(([^)#]+\.md)[^)]*\)/g)) {
        const target = path.resolve(path.dirname(file), m[1]);
        if (!fs.existsSync(target)) console.log("BROKEN", file, "->", m[1]);
    }
}
console.log("link check done");
'
```

Expected: `link check done` with no `BROKEN` lines.

Note `docs/ideas.md` moved to `docs/ideas-research/ideas.md` on 2026-08-26; if
this reports broken links unrelated to this change, fix them here rather than
leaving them.

- [ ] **Step 5: Commit**

```bash
git add docs/terrain.md docs/todo.md docs/ideas-research/ideas.md
git commit -m "docs: describe the gated elevation correction"
```

---

## Self-review notes

- **Gate discipline.** Tasks 4, 5 and 6 each temporarily flip
  `automaticMilCorrection` to verify behaviour and each explicitly set it back.
  The final state of the branch must be `false`. Confirm with
  `git diff main -- data/ballistics/terrain-context.json` before merging.
- **No test harness under `js/`.** Tasks 4–6 are verified manually against a
  baseline captured in Task 4 Step 1. That baseline is the only regression
  guard for the runtime half; capture it before touching anything.
- **`interpolateHeightCorrection` is reused for both matrices.** Task 5 Step 2
  passes `missMeters` in under the `milCorrections` key. That is deliberate —
  the function is a generic bilinear lookup over a `[deltaZ][distance]` matrix
  and the key name is the only thing tying it to mil.
- **Regenerating data.** `npm run fit-ballistics` then
  `npm run build-height-correction`, in that order — the second reads the
  first's output.
- **Suppressed-but-enabled reads as disabled.** When the gate is on and every
  arc falls under the 10 m threshold, `meta.applied` is `false` and the caption
  falls back to "MIL not auto-corrected". That is honest — nothing was
  corrected — but it means the caption cannot distinguish "gate off" from
  "gate on, correction too small to matter". Accepted deliberately: splitting
  them would need a third string for a state the player cannot act on either
  way.
