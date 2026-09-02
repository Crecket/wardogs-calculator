# Unified Reachability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One source of truth for every range / "can hit" / dead-ground verdict, applied to all twelve surfaces, closing every disagreement catalogued in `docs/height-audit.md`.

**Architecture:** Two new global-script layers — `js/ballistics/model.js` (the one copy of every vacuum-model primitive plus per-arc angle stops) and `js/ballistics/reachability.js` (`assessArc` pure verdicts, `assessShot` terrain-aware authority) — then each surface (results panel, terrain note, cross-section, rings, dead ground, reach badges, flight time, OBS) is rewired to render that one verdict. Gates are always anchored as `declared + (model(ΔZ) − model(0))`; elevation-envelope checks apply only to fit-derived mils, never to table rows.

**Tech Stack:** Vanilla JS globals (no modules — matches the codebase), `node:test` + `node:vm` for pure-function tests, playwright-core browser suites in `test/` for integration.

**Spec:** `docs/superpowers/specs/2026-09-01-unified-reachability-design.md` — read it first; every task argues from it.

## Global Constraints

- Branch: `feat/unified-reachability`, created from `main` (use superpowers:using-git-worktrees at execution start).
- All runtime JS stays global-script style: no `import`/`export`, no modules. New files are added as `<script>` tags.
- Script order on every page that loads `js/map/range-ring.js`: `js/ballistics/model.js`, then `js/ballistics/reachability.js`, then `js/map/range-ring.js`.
- Do not add code comments to new code (repo owner preference). When moving existing functions, move their existing comments with them unchanged.
- Prose in docs/commits is never hard-wrapped: each paragraph is one line.
- Commit messages: title line only, no body, no trailers.
- All new user-facing strings go in `locales/*.json` (every locale file except `index.json`), never hardcoded.
- The invariant from spec § 1: `data/weapons.json` is authoritative for the dialed MIL and the declared ranges; the model supplies only differences; `assessShot` is the only reachability verdict.
- `npm run test:scripts` must pass at the end of every task. Each new `*.test.mjs` is appended to the `test:scripts` command in `package.json` in the task that creates it.
- VM-test stubbing rule: if `loadRuntime` throws a `ReferenceError` while loading a runtime file in a test, the file has a load-time wiring reference (e.g. a render hook); stub that one name in the `globals` argument and move on — never edit the runtime file to make a test load.
- Reference fit values used throughout (from `data/ballistics/projectile-model.json`): mortar.single v=86.7 offset=52.5 perMil=0.0375 branch=high; spg.low v=160.1 offset=12.75 perMil=0.058 branch=low; spg.high v=160.4 offset=14.5 perMil=0.048 branch=high. Weapon envelopes: mortar 150–850 mil, ranges 0.132–0.684 km; spg 20–1390 mil, ranges 0.78–2.629 km. Verified level values: arcMaxRangeModel = 2612.8 (spg.low), 2622.6 (spg.high), 687.2 (mortar, clamped to 58.125°); arcMinRangeModel = 1219.3 (spg.low), 791.3 (spg.high), 149.5 (mortar).

---

### Task 1: Node VM loader for runtime globals

**Files:**
- Create: `scripts/lib/runtime-globals.mjs`
- Test: `scripts/lib/runtime-globals.test.mjs`
- Modify: `package.json` (append the test file to `test:scripts`)

**Interfaces:**
- Produces: `loadRuntime(files, globals) → vmContext` (evaluates repo-relative global-script files in one shared `node:vm` context), `setRuntimeGlobal(context, name, value)` (assigns into the context even for top-level `let` bindings), `callRuntime(context, expression) → any`.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

test('loads a runtime global script and calls its functions', () => {
    const ctx = loadRuntime(['js/map/heightfield.js']);

    setRuntimeGlobal(ctx, '__field', {
        heights: Float32Array.of(0, 10, 20, 30),
        width: 2,
        height: 2,
        originX: 0,
        originY: 0,
        stepGameUnits: 1,
        minZMeters: 0
    });

    assert.equal(callRuntime(ctx, 'heightfieldSample(__field, 0.5, 0.5)'), 15);
    assert.equal(callRuntime(ctx, 'heightfieldSample(__field, 5, 0)'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/runtime-globals.test.mjs`
Expected: FAIL with "Cannot find module .../runtime-globals.mjs"

- [ ] **Step 3: Write the loader**

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../..', import.meta.url));

export function loadRuntime(files, globals = {}) {
    const context = vm.createContext({ console, window: {}, ...globals });

    for (const file of files) {
        vm.runInContext(readFileSync(join(root, file), 'utf8'), context, { filename: file });
    }

    return context;
}

export function setRuntimeGlobal(context, name, value) {
    context.__runtimeValue = value;
    vm.runInContext(`${name} = __runtimeValue`, context);
    delete context.__runtimeValue;
}

export function callRuntime(context, expression) {
    return vm.runInContext(expression, context);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/runtime-globals.test.mjs`
Expected: PASS (2 assertions; the bilinear midpoint of 0/10/20/30 is 15, out-of-grid is null)

- [ ] **Step 5: Add to `test:scripts` in package.json** (append ` scripts/lib/runtime-globals.test.mjs` to the existing command), then run `npm run test:scripts` — expect the pre-existing `dev-env` local-tile failure only if `maps/tiles/` is absent in the checkout (environmental, not caused by this work; every other file must pass).

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/runtime-globals.mjs scripts/lib/runtime-globals.test.mjs package.json
git commit -m "Add a vm loader so runtime globals are testable in node"
```

---

### Task 2: `js/ballistics/model.js` — the one copy of the model

**Files:**
- Create: `js/ballistics/model.js`
- Modify: `js/map/range-ring.js` (remove the moved functions, keep a gravity alias)
- Modify: every page that includes `js/map/range-ring.js` (find with `grep -rln "js/map/range-ring.js" src/pages`) — add the two new script tags directly above it (reachability.js's tag is added here too, pointing at the file Task 3 creates; create an empty `js/ballistics/reachability.js` in this task so pages don't 404)
- Test: `scripts/lib/ballistics-model.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces (all global): `BALLISTICS_GRAVITY` (9.81), `PROJECTILE_MODEL` (let, null until loaded), `loadProjectileModel()`, `projectileModelArc(weaponId, arc) → fit|null`, `modelMaxRange(v, dz) → m|null`, `modelArcLaunchTan(fit, rangeMeters, dz) → tan|null`, `modelArcMil(fit, tan) → mil|null`, `modelArcTanForMil(fit, mil) → tan|null`, `modelArcElevationFits(weapon, mil) → boolean`, `modelOptimalTan(v, dz) → tan|null`, `modelRangeAtAngle(v, thetaRadians, dz) → m|null`, `modelShellHeight(tan, v, xMeters) → m`, `arcAngleStops(weapon, fit) → {minRadians, maxRadians}|null`, `arcMaxRangeModel(weapon, fit, dz) → m|null`, `arcMinRangeModel(weapon, fit, dz) → m|null`.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const spg = { id: 'spg', minElevationMil: 20, maxElevationMil: 1390 };
const mortar = { id: 'mortar', minElevationMil: 150, maxElevationMil: 850 };
const fits = {
    mortarSingle: { branch: 'high', muzzleVelocity: 86.7, angleOffsetDeg: 52.5, anglePerMilDeg: 0.0375 },
    spgLow: { branch: 'low', muzzleVelocity: 160.1, angleOffsetDeg: 12.75, anglePerMilDeg: 0.058 },
    spgHigh: { branch: 'high', muzzleVelocity: 160.4, angleOffsetDeg: 14.5, anglePerMilDeg: 0.048 }
};

function ctxWith() {
    const ctx = loadRuntime(['js/ballistics/model.js']);
    setRuntimeGlobal(ctx, '__spg', spg);
    setRuntimeGlobal(ctx, '__mortar', mortar);
    setRuntimeGlobal(ctx, '__fits', fits);
    return ctx;
}

test('arcAngleStops keeps the valid half of the envelope per branch', () => {
    const ctx = ctxWith();
    const low = callRuntime(ctx, 'arcAngleStops(__spg, __fits.spgLow)');
    assert.ok(Math.abs(low.minRadians * 180 / Math.PI - 13.91) < 0.01);
    assert.ok(Math.abs(low.maxRadians * 180 / Math.PI - 45) < 1e-9);
    const high = callRuntime(ctx, 'arcAngleStops(__spg, __fits.spgHigh)');
    assert.ok(Math.abs(high.minRadians * 180 / Math.PI - 45) < 1e-9);
    assert.ok(Math.abs(high.maxRadians * 180 / Math.PI - 81.22) < 0.01);
    const single = callRuntime(ctx, 'arcAngleStops(__mortar, __fits.mortarSingle)');
    assert.ok(Math.abs(single.minRadians * 180 / Math.PI - 58.125) < 1e-9);
    assert.ok(Math.abs(single.maxRadians * 180 / Math.PI - 84.375) < 1e-9);
});

test('arcMaxRangeModel clamps the optimal angle into the achievable stops', () => {
    const ctx = ctxWith();
    assert.ok(Math.abs(callRuntime(ctx, 'arcMaxRangeModel(__spg, __fits.spgHigh, 0)') - 2622.6) < 0.1);
    assert.ok(Math.abs(callRuntime(ctx, 'arcMaxRangeModel(__spg, __fits.spgLow, 0)') - 2612.8) < 0.1);
    assert.ok(Math.abs(callRuntime(ctx, 'arcMaxRangeModel(__mortar, __fits.mortarSingle, 0)') - 687.2) < 0.1);
    assert.ok(Math.abs(callRuntime(ctx, 'arcMaxRangeModel(__mortar, __fits.mortarSingle, -100)') - 744.4) < 1);
});

test('arcMinRangeModel evaluates the binding stop per branch', () => {
    const ctx = ctxWith();
    assert.ok(Math.abs(callRuntime(ctx, 'arcMinRangeModel(__spg, __fits.spgHigh, 0)') - 791.3) < 0.1);
    assert.ok(Math.abs(callRuntime(ctx, 'arcMinRangeModel(__spg, __fits.spgLow, 0)') - 1219.3) < 0.5);
    assert.ok(Math.abs(callRuntime(ctx, 'arcMinRangeModel(__mortar, __fits.mortarSingle, 0)') - 149.5) < 0.5);
    assert.ok(Math.abs(callRuntime(ctx, 'arcMinRangeModel(__spg, __fits.spgHigh, -200)') - 821.0) < 0.5);
});

test('modelArcTanForMil converts a mil through the fit and rejects out-of-quadrant angles', () => {
    const ctx = ctxWith();
    assert.ok(Math.abs(callRuntime(ctx, 'modelArcTanForMil(__fits.spgLow, 20)') - 0.2477) < 0.001);
    assert.equal(callRuntime(ctx, 'modelArcTanForMil(__fits.spgLow, 1390)'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/ballistics-model.test.mjs`
Expected: FAIL — `js/ballistics/model.js` does not exist.

- [ ] **Step 3: Create `js/ballistics/model.js`**

Move these functions out of `js/map/range-ring.js` verbatim, including their comment blocks, replacing every `RANGE_RING_GRAVITY` inside them with `BALLISTICS_GRAVITY`: `loadProjectileModel`, `projectileModelArc`, `modelMaxRange`, `modelArcLaunchTan`, `modelArcMil`, `modelArcElevationFits`, `modelRangeAtAngle`, plus the `let PROJECTILE_MODEL = null;` declaration. Do NOT move `weaponMuzzleVelocity`, `maxElevationArc`, `maxElevationAngle` (they die in Task 9). The file starts with the constant and ends with the new functions:

```js
const BALLISTICS_GRAVITY = 9.81;
```

Inside the moved `loadProjectileModel`, after the line that assigns `PROJECTILE_MODEL`, add:

```js
            if (
                PROJECTILE_MODEL &&
                Number.isFinite(Number(PROJECTILE_MODEL.gravity)) &&
                Number(PROJECTILE_MODEL.gravity) !== BALLISTICS_GRAVITY
            ) {
                console.warn(
                    '[ballistics] projectile-model.json gravity ' +
                    `${PROJECTILE_MODEL.gravity} differs from runtime ` +
                    `${BALLISTICS_GRAVITY}; the runtime constant is used.`
                );
            }
```

Then append the new functions:

```js
function modelArcTanForMil(fit, mil) {
    const offset = Number(fit?.angleOffsetDeg);
    const perMil = Number(fit?.anglePerMilDeg);

    if (
        !Number.isFinite(offset) ||
        !Number.isFinite(perMil) ||
        !Number.isFinite(mil)
    ) {
        return null;
    }

    const degrees = offset + perMil * mil;

    return degrees > 0 && degrees < 90
        ? Math.tan(degrees * Math.PI / 180)
        : null;
}

function modelOptimalTan(muzzleVelocity, deltaZMeters) {
    const inner =
        muzzleVelocity * muzzleVelocity -
        2 * BALLISTICS_GRAVITY * deltaZMeters;

    return inner <= 0 ? null : muzzleVelocity / Math.sqrt(inner);
}

function modelShellHeight(tan, muzzleVelocity, xMeters) {
    return (
        xMeters * tan -
        BALLISTICS_GRAVITY *
        xMeters *
        xMeters *
        (1 + tan * tan) /
        (2 * muzzleVelocity * muzzleVelocity)
    );
}

function arcAngleStops(weapon, fit) {
    const offset = Number(fit?.angleOffsetDeg);
    const perMil = Number(fit?.anglePerMilDeg);
    const minMil = Number(weapon?.minElevationMil);
    const maxMil = Number(weapon?.maxElevationMil);

    if (
        !Number.isFinite(offset) ||
        !Number.isFinite(perMil) ||
        !Number.isFinite(minMil) ||
        !Number.isFinite(maxMil) ||
        perMil <= 0
    ) {
        return null;
    }

    const shallow = offset + perMil * minMil;
    const steep = offset + perMil * maxMil;
    const low = fit.branch === 'low';

    const from = Math.max(low ? shallow : Math.max(shallow, 45), 1e-6);
    const to = low ? Math.min(steep, 45) : Math.min(steep, 90 - 1e-6);

    if (!(from < to)) {
        return null;
    }

    return {
        minRadians: from * Math.PI / 180,
        maxRadians: to * Math.PI / 180
    };
}

function arcMaxRangeModel(weapon, fit, deltaZMeters) {
    const v = Number(fit?.muzzleVelocity);
    const stops = arcAngleStops(weapon, fit);

    if (!Number.isFinite(v) || v <= 0 || !stops) {
        return null;
    }

    const optimal = modelOptimalTan(v, deltaZMeters);

    if (optimal === null) {
        return null;
    }

    const theta = Math.min(
        stops.maxRadians,
        Math.max(stops.minRadians, Math.atan(optimal))
    );

    return modelRangeAtAngle(v, theta, deltaZMeters);
}

function arcMinRangeModel(weapon, fit, deltaZMeters) {
    const v = Number(fit?.muzzleVelocity);
    const stops = arcAngleStops(weapon, fit);

    if (!Number.isFinite(v) || v <= 0 || !stops) {
        return null;
    }

    const theta = fit.branch === 'low'
        ? stops.minRadians
        : stops.maxRadians;

    return modelRangeAtAngle(v, theta, deltaZMeters);
}
```

- [ ] **Step 4: Trim `js/map/range-ring.js`**

Delete the moved functions and `let PROJECTILE_MODEL = null;` from it. Replace the `const RANGE_RING_GRAVITY = 9.81;` line with `const RANGE_RING_GRAVITY = BALLISTICS_GRAVITY;` (dead-ground still references the alias until Task 8; the alias itself dies in Task 9).

- [ ] **Step 5: Wire the pages**

Create `js/ballistics/reachability.js` containing only a newline (Task 3 fills it). In every page found by `grep -rln "js/map/range-ring.js" src/pages`, insert directly above the range-ring tag:

```html
<script src="js/ballistics/model.js"></script>
<script src="js/ballistics/reachability.js"></script>
```

- [ ] **Step 6: Run tests, then boot the app**

Run: `node --test scripts/lib/ballistics-model.test.mjs` — expect PASS. Run `npm run build` and verify `dist/js/ballistics/model.js` exists (the build copies `js/` wholesale; if it does not appear, find the copy list in `scripts/build-pages.mjs` and add the directory). Start `PORT=8123 npm run dev` and load the page; the console must show no `ReferenceError` (the moved globals resolve across files).

- [ ] **Step 7: Add the test file to `test:scripts`, run `npm run test:scripts`, commit**

```bash
git add js/ballistics/model.js js/ballistics/reachability.js js/map/range-ring.js src/pages scripts/lib/ballistics-model.test.mjs package.json
git commit -m "Extract the projectile model into js/ballistics/model.js with per-arc angle stops"
```

---

### Task 3: `assessArc` — the pure verdict

**Files:**
- Modify: `js/ballistics/reachability.js` (fill the empty file)
- Test: `scripts/lib/reachability.test.mjs`

**Interfaces:**
- Consumes: `projectileModelArc`, `modelArcLaunchTan`, `modelArcMil`, `modelArcElevationFits`, `arcMaxRangeModel`, `arcMinRangeModel` from Task 2.
- Produces (global): `REACH_ARCS` (`['single','low','high']`), `arcDeclaredRange(weapon, arc) → {minMeters, maxMeters}|null`, `assessArc(weapon, arc, distanceMeters, deltaZMeters) → {status, mil, tan, tableRow, ceilingCapped?}` with `status ∈ 'hit'|'tooFar'|'tooClose'|'belowMinElevation'|'aboveMaxElevation'|'noModel'`. `ceilingCapped: true` marks the ≤ 17 m sliver where the table covers a distance past the fit's absolute vacuum ceiling (spec § 4.2): the table stays authoritative, so the status is `hit`, `mil` is null, and `tan` is the longest-achievable stop tangent. Note: `weapon.ballistics[arc]` is the raw table — an array of `[distanceMeters, mil]` pairs (see `normalizeWeapon`/`groupBallisticTable` in `js/features/weapons.js`).

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const model = {
    schema: 'wardogs-projectile-model-v1',
    weapons: {
        mortar: { single: { branch: 'high', muzzleVelocity: 86.7, angleOffsetDeg: 52.5, anglePerMilDeg: 0.0375 } },
        spg: {
            low: { branch: 'low', muzzleVelocity: 160.1, angleOffsetDeg: 12.75, anglePerMilDeg: 0.058 },
            high: { branch: 'high', muzzleVelocity: 160.4, angleOffsetDeg: 14.5, anglePerMilDeg: 0.048 }
        }
    }
};

const spg = {
    id: 'spg', minRange: 0.78, maxRange: 2.629, minElevationMil: 20, maxElevationMil: 1390,
    ballistics: { low: [[1181, 20], [2629, 600]], high: [[735, 1400], [2629, 610]] }
};

const mortar = {
    id: 'mortar', minRange: 0.132, maxRange: 0.684, minElevationMil: 150, maxElevationMil: 850,
    ballistics: { single: [[80, 950], [697, 120]] }
};

function ctxWith() {
    const ctx = loadRuntime(['js/ballistics/model.js', 'js/ballistics/reachability.js']);
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', model);
    setRuntimeGlobal(ctx, '__spg', spg);
    setRuntimeGlobal(ctx, '__mortar', mortar);
    return ctx;
}

test('arcDeclaredRange intersects the weapon gates with the table coverage', () => {
    const ctx = ctxWith();
    assert.deepEqual(callRuntime(ctx, 'arcDeclaredRange(__spg, "low")'), { minMeters: 1181, maxMeters: 2629 });
    assert.deepEqual(callRuntime(ctx, 'arcDeclaredRange(__spg, "high")'), { minMeters: 780, maxMeters: 2629 });
    assert.deepEqual(callRuntime(ctx, 'arcDeclaredRange(__mortar, "single")'), { minMeters: 132, maxMeters: 684 });
});

test('the 917 m SPG shot: low arc is tooClose, high arc hits', () => {
    const ctx = ctxWith();
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "low", 917, 0).status'), 'tooClose');
    const high = callRuntime(ctx, 'assessArc(__spg, "high", 917, 0)');
    assert.equal(high.status, 'hit');
    assert.equal(high.tableRow, true);
});

test('anchored gates shift with deltaZ', () => {
    const ctx = ctxWith();
    assert.equal(callRuntime(ctx, 'assessArc(__mortar, "single", 690, 0).status'), 'tooFar');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "high", 800, -200).status'), 'tooClose');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "high", 800, 100).status'), 'hit');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "high", 2600, 200).status'), 'tooFar');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "low", 2600, 200).status'), 'tooFar');
});

test('the table edge stays a hit and the beyond-table window is modelled', () => {
    const ctx = ctxWith();
    const edge = callRuntime(ctx, 'assessArc(__spg, "low", 2620, 0)');
    assert.equal(edge.status, 'hit');
    assert.equal(edge.tableRow, true);
    assert.equal(edge.ceilingCapped, true);
    assert.ok(Number.isFinite(edge.tan));
    assert.equal(edge.mil, null);
    const beyond = callRuntime(ctx, 'assessArc(__spg, "high", 2650, -100)');
    assert.equal(beyond.status, 'hit');
    assert.equal(beyond.tableRow, false);
    assert.ok(Number.isFinite(beyond.mil));
});

test('a table-covered row is never envelope-refused despite fit noise', () => {
    const ctx = ctxWith();
    const row = callRuntime(ctx, 'assessArc(__spg, "low", 1181, 0)');
    assert.equal(row.status, 'hit');
    assert.equal(row.tableRow, true);
});

test('a modelled mil outside the envelope is refused', () => {
    const ctx = ctxWith();
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', {
        schema: 'wardogs-projectile-model-v1',
        weapons: { toy: { low: { branch: 'low', muzzleVelocity: 100, angleOffsetDeg: 0, anglePerMilDeg: 0.05 } } }
    });
    setRuntimeGlobal(ctx, '__toy', { id: 'toy', minRange: 0.1, maxRange: 10, minElevationMil: 200, maxElevationMil: 1600, ballistics: {} });
    assert.equal(callRuntime(ctx, 'assessArc(__toy, "low", 200, 0).status'), 'belowMinElevation');
    assert.equal(callRuntime(ctx, 'assessArc(__toy, "low", 900, 0).status'), 'hit');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/reachability.test.mjs`
Expected: FAIL with "arcDeclaredRange is not defined"

- [ ] **Step 3: Implement in `js/ballistics/reachability.js`**

```js
const REACH_ARCS = ['single', 'low', 'high'];

function arcDeclaredRange(weapon, arc) {
    const weaponMin = (weapon?.minRange ?? 0) * 1000;
    const weaponMax = (weapon?.maxRange ?? weapon?.range ?? 0) * 1000;

    if (!(weaponMax > 0)) {
        return null;
    }

    const rows = weapon?.ballistics?.[arc];

    if (!Array.isArray(rows) || !rows.length) {
        return { minMeters: weaponMin, maxMeters: weaponMax };
    }

    let first = Infinity;
    let last = -Infinity;

    for (const row of rows) {
        const d = Number(row?.[0]);

        if (Number.isFinite(d)) {
            first = Math.min(first, d);
            last = Math.max(last, d);
        }
    }

    if (!Number.isFinite(first) || !(last > 0)) {
        return { minMeters: weaponMin, maxMeters: weaponMax };
    }

    return {
        minMeters: Math.max(weaponMin, first),
        maxMeters: Math.min(weaponMax, last)
    };
}

function assessArc(weapon, arc, distanceMeters, deltaZMeters) {
    const fit = projectileModelArc(weapon?.id, arc);

    if (!fit) {
        return { status: 'noModel', mil: null, tan: null, tableRow: false };
    }

    const declared = arcDeclaredRange(weapon, arc);
    const dz = Number.isFinite(deltaZMeters) ? deltaZMeters : 0;

    const rows = weapon?.ballistics?.[arc];

    const tableRow = Boolean(
        declared &&
        Array.isArray(rows) &&
        rows.length &&
        distanceMeters + 1e-6 >= declared.minMeters &&
        distanceMeters <= declared.maxMeters + 1e-6
    );

    if (declared) {
        const levelMax = arcMaxRangeModel(weapon, fit, 0);
        const shiftedMax = arcMaxRangeModel(weapon, fit, dz);

        if (levelMax !== null) {
            if (shiftedMax === null) {
                return { status: 'tooFar', mil: null, tan: null, tableRow };
            }

            const anchoredMax = declared.maxMeters + (shiftedMax - levelMax);

            if (distanceMeters > anchoredMax + 1e-6) {
                return { status: 'tooFar', mil: null, tan: null, tableRow };
            }
        }

        const levelMin = arcMinRangeModel(weapon, fit, 0);
        const shiftedMin = arcMinRangeModel(weapon, fit, dz);

        if (levelMin !== null && shiftedMin !== null) {
            const anchoredMin = declared.minMeters + (shiftedMin - levelMin);

            if (distanceMeters + 1e-6 < anchoredMin) {
                return { status: 'tooClose', mil: null, tan: null, tableRow };
            }
        }
    }

    const tan = modelArcLaunchTan(fit, distanceMeters, dz);

    if (tan === null) {
        if (tableRow) {
            const stops = arcAngleStops(weapon, fit);

            const capped = stops === null
                ? null
                : Math.tan(
                    fit.branch === 'low'
                        ? stops.maxRadians
                        : stops.minRadians
                );

            return {
                status: 'hit',
                mil: null,
                tan: capped,
                tableRow,
                ceilingCapped: true
            };
        }

        return { status: 'tooFar', mil: null, tan: null, tableRow };
    }

    const mil = modelArcMil(fit, tan);

    if (!tableRow && mil !== null && !modelArcElevationFits(weapon, mil)) {
        const minMil = Number(weapon?.minElevationMil);

        return {
            status: Number.isFinite(minMil) && mil < minMil
                ? 'belowMinElevation'
                : 'aboveMaxElevation',
            mil,
            tan,
            tableRow
        };
    }

    return { status: 'hit', mil, tan, tableRow };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/reachability.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add to `test:scripts`, run `npm run test:scripts`, commit**

```bash
git add js/ballistics/reachability.js scripts/lib/reachability.test.mjs package.json
git commit -m "Add assessArc, the single per-arc reachability verdict"
```

---

### Task 4: `assessShot` — the terrain-aware authority

**Files:**
- Modify: `js/ballistics/reachability.js` (append)
- Test: `scripts/lib/reachability.test.mjs` (append)

**Interfaces:**
- Consumes: `assessArc` (Task 3), `modelShellHeight`, `projectileModelArc` (Task 2), and at runtime the globals `cachedHeightfield`, `ensureHeightfieldLoaded`, `heightfieldSample`, `mapHasHeightfield` (`js/map/heightfield.js`), `rangeRingSample` (`js/map/range-ring.js`), `getCoordinateMetersPerUnit` (`js/map/maps.js`). All are called inside functions, so script order does not matter beyond what Task 2 set.
- Produces (global): `assessShot(weapon, origin, target, mapId) → { state: 'ready'|'pending'|'offmap'|'nodata', distanceMeters, deltaZ, arcs: {single, low, high}, verdict: 'hit'|'masked'|'tooClose'|'tooFar'|'unreachable'|null }` where each arc entry is the Task 3 shape plus `masked: boolean`; also `reachabilityProfile`, `trajectoryClearsProfile`, `reachabilityVerdict` (used by later tasks and tests).

- [ ] **Step 1: Write the failing tests** (append to `scripts/lib/reachability.test.mjs`)

```js
const flatField = (width, height, ridge = null) => {
    const heights = new Float32Array(width * height);
    if (ridge) {
        for (let j = 0; j < height; j += 1) {
            heights[j * width + ridge.column] = ridge.height;
        }
    }
    return { heights, width, height, originX: 0, originY: 0, stepGameUnits: 1, minZMeters: 0 };
};

function shotCtx(field) {
    const ctx = loadRuntime(
        ['js/map/heightfield.js', 'js/ballistics/model.js', 'js/ballistics/reachability.js'],
        {
            mapHasHeightfield: () => true,
            ensureHeightfieldLoaded: () => {},
            getCoordinateMetersPerUnit: () => 100
        }
    );
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', model);
    setRuntimeGlobal(ctx, '__spg', spg);
    setRuntimeGlobal(ctx, '__mortar', mortar);
    setRuntimeGlobal(ctx, '__field', field);
    setRuntimeGlobal(ctx, 'cachedHeightfield', () => field);
    callRuntime(ctx, `rangeRingSample = (field, x, y) => heightfieldSample(
        field,
        Math.min(field.originX + (field.width - 1) * field.stepGameUnits, Math.max(field.originX, x)),
        Math.min(field.originY + (field.height - 1) * field.stepGameUnits, Math.max(field.originY, y))
    )`);
    return ctx;
}

test('assessShot on flat ground: SPG 900 m is a plain hit, 2700 m is tooFar', () => {
    const ctx = shotCtx(flatField(40, 3));
    const near = callRuntime(ctx, 'assessShot(__spg, {x: 1, y: 1}, {x: 10, y: 1}, "m")');
    assert.equal(near.state, 'ready');
    assert.equal(near.deltaZ, 0);
    assert.equal(near.verdict, 'hit');
    assert.equal(near.arcs.low.status, 'tooClose');
    assert.equal(near.arcs.high.masked, false);
    const far = callRuntime(ctx, 'assessShot(__spg, {x: 1, y: 1}, {x: 28, y: 1}, "m")');
    assert.equal(far.verdict, 'tooFar');
});

test('assessShot marks a ridge-blocked mortar shot masked', () => {
    const ctx = shotCtx(flatField(9, 3, { column: 5, height: 250 }));
    const shot = callRuntime(ctx, 'assessShot(__mortar, {x: 0, y: 1}, {x: 6.5, y: 1}, "m")');
    assert.equal(shot.state, 'ready');
    assert.equal(shot.arcs.single.status, 'hit');
    assert.equal(shot.arcs.single.masked, true);
    assert.equal(shot.verdict, 'masked');
});

test('assessShot reports pending and offmap honestly', () => {
    const ctx = shotCtx(flatField(9, 3));
    setRuntimeGlobal(ctx, 'cachedHeightfield', () => null);
    assert.equal(callRuntime(ctx, 'assessShot(__spg, {x: 1, y: 1}, {x: 5, y: 1}, "m").state'), 'pending');
    const ctx2 = shotCtx(flatField(9, 3));
    assert.equal(callRuntime(ctx2, 'assessShot(__spg, {x: 1, y: 1}, {x: 100, y: 1}, "m").state'), 'offmap');
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `node --test scripts/lib/reachability.test.mjs`
Expected: the three new tests FAIL with "assessShot is not defined"; the Task 3 tests still pass.

- [ ] **Step 3: Implement** (append to `js/ballistics/reachability.js`)

```js
const REACH_PROFILE_STEP_METRES = 25;

const REACH_VERDICT_PRIORITY = ['hit', 'masked', 'tooClose', 'tooFar', 'unreachable'];

function reachabilityProfile(field, origin, target, distanceMeters) {
    const samples = Math.max(
        2,
        Math.min(256, Math.ceil(distanceMeters / REACH_PROFILE_STEP_METRES) + 1)
    );

    const ground = new Float64Array(samples);

    for (let i = 0; i < samples; i += 1) {
        const t = i / (samples - 1);

        const z = rangeRingSample(
            field,
            origin.x + (target.x - origin.x) * t,
            origin.y + (target.y - origin.y) * t
        );

        if (z === null) {
            return null;
        }

        ground[i] = z;
    }

    return { ground, stepMeters: distanceMeters / (samples - 1) };
}

function trajectoryClearsProfile(fit, tan, profile) {
    const v = Number(fit.muzzleVelocity);
    const ground = profile.ground;
    const last = ground.length - 1;
    const zGun = ground[0];

    const firstIndex = Math.min(
        last,
        Math.max(1, Math.ceil(REACH_PROFILE_STEP_METRES / profile.stepMeters))
    );

    for (let i = firstIndex; i < last; i += 1) {
        if (zGun + modelShellHeight(tan, v, i * profile.stepMeters) < ground[i]) {
            return false;
        }
    }

    return true;
}

function reachabilityVerdict(arcs) {
    let best = null;
    let bestRank = Infinity;

    for (const arc of REACH_ARCS) {
        const assessed = arcs[arc];

        if (!assessed || assessed.status === 'noModel') {
            continue;
        }

        let label;

        if (assessed.status === 'hit') {
            label = assessed.masked ? 'masked' : 'hit';
        } else if (assessed.status === 'tooClose' || assessed.status === 'tooFar') {
            label = assessed.status;
        } else {
            label = 'unreachable';
        }

        const rank = REACH_VERDICT_PRIORITY.indexOf(label);

        if (rank < bestRank) {
            bestRank = rank;
            best = label;
        }
    }

    return best;
}

function assessShot(weapon, origin, target, mapId) {
    const result = {
        state: 'nodata',
        distanceMeters: null,
        deltaZ: null,
        arcs: { single: null, low: null, high: null },
        verdict: null
    };

    if (
        !weapon ||
        !origin ||
        !target ||
        !Number.isFinite(Number(origin.x)) ||
        !Number.isFinite(Number(origin.y)) ||
        !Number.isFinite(Number(target.x)) ||
        !Number.isFinite(Number(target.y))
    ) {
        return result;
    }

    result.distanceMeters =
        Math.hypot(target.x - origin.x, target.y - origin.y) *
        getCoordinateMetersPerUnit();

    if (typeof mapHasHeightfield !== 'function' || !mapHasHeightfield(mapId)) {
        return result;
    }

    ensureHeightfieldLoaded(mapId);

    const field = cachedHeightfield(mapId);

    if (!field) {
        result.state = 'pending';
        return result;
    }

    const zGun = heightfieldSample(field, origin.x, origin.y);
    const zTarget = heightfieldSample(field, target.x, target.y);

    if (zGun === null || zTarget === null) {
        result.state = 'offmap';
        return result;
    }

    result.state = 'ready';
    result.deltaZ = zTarget - zGun;

    let profile;

    for (const arc of REACH_ARCS) {
        const assessed = assessArc(weapon, arc, result.distanceMeters, result.deltaZ);

        assessed.masked = false;

        if (assessed.status === 'hit' && assessed.tan !== null && !assessed.ceilingCapped) {
            if (profile === undefined) {
                profile = reachabilityProfile(field, origin, target, result.distanceMeters);
            }

            if (profile) {
                assessed.masked = !trajectoryClearsProfile(
                    projectileModelArc(weapon.id, arc),
                    assessed.tan,
                    profile
                );
            }
        }

        result.arcs[arc] = assessed;
    }

    result.verdict = reachabilityVerdict(result.arcs);

    return result;
}
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `node --test scripts/lib/reachability.test.mjs`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add js/ballistics/reachability.js scripts/lib/reachability.test.mjs
git commit -m "Add assessShot, the terrain-aware reachability authority"
```

---

### Task 5: Results panel, flight time, and locales render the verdict

**Files:**
- Modify: `js/features/results.js`
- Modify: `js/map/range-ring.js` (delete `modelledElevationSolution` and `terrainDeltaZMeters` — their only caller was the old fallback)
- Modify: `locales/en.json`, `locales/ru.json`, `locales/uk.json`, `locales/de.json`, `locales/fr.json`, `locales/es.json`, `locales/pl.json`, `locales/pt.json`, `locales/ko.json`, `locales/zh-cn.json`, `locales/cat.json`
- Test: `scripts/lib/results-note.test.mjs`

**Interfaces:**
- Consumes: `assessShot` (Task 4), `tr` (i18n), existing `getWeaponElevationSolutions`, `resolveElevationSolutions`, `renderTerrainNote`, `flightTimeBadges`.
- Produces: `solveFiringElevation(...)` now returns `{ solutions, terrainMeta, shot, solved, modelled }` (the added `shot` is consumed by Tasks 10 and 13); `fillModelledSolutions(weapon, distanceMeters, solutions, shot)`; `terrainNoteText(shot, meta)`; `correctionNoteFragment(meta)`; `rangeStatusView(elevation) → {text, color}`. `renderFlightTime(weapon, solutions, shot)` changes its third parameter from `terrainMeta` to `shot`.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

function noteCtx() {
    const ctx = loadRuntime(['js/features/results.js'], {
        tr: key => key,
        $: () => null,
        setText: () => {},
        setStyle: () => {},
        S: { map: 'm' },
        WEAPONS: {}
    });
    return ctx;
}

const arcOk = { status: 'hit', masked: false };

test('terrainNoteText is empty for a clean hit and names arcs per verdict group', () => {
    const ctx = noteCtx();
    setRuntimeGlobal(ctx, '__shot', {
        state: 'ready', deltaZ: 12.34,
        arcs: { single: null, low: { status: 'tooClose', masked: false }, high: arcOk }
    });
    assert.equal(callRuntime(ctx, 'terrainNoteText({ state: "ready", deltaZ: 0, arcs: { single: null, low: null, high: { status: "hit", masked: false } } }, null)'), '');
    const text = callRuntime(ctx, 'terrainNoteText(__shot, null)');
    assert.ok(text.startsWith('noteDeltaZ'));
    assert.ok(text.includes('noteTooClose'));
    assert.ok(text.includes('lowArc'));
});

test('terrainNoteText covers pending, offmap and the all-arcs collapse', () => {
    const ctx = noteCtx();
    assert.equal(callRuntime(ctx, 'terrainNoteText({ state: "pending" }, null)'), 'crossSectionLoadingTerrain');
    assert.equal(callRuntime(ctx, 'terrainNoteText({ state: "offmap" }, null)'), 'noteOffMap');
    setRuntimeGlobal(ctx, '__shot', {
        state: 'ready', deltaZ: -5,
        arcs: { single: null, low: { status: 'tooFar', masked: false }, high: { status: 'tooFar', masked: false } }
    });
    const text = callRuntime(ctx, 'terrainNoteText(__shot, null)');
    assert.ok(text.includes('noteAllArcs'));
});

test('fillModelledSolutions fills only fireable table-less arcs and never invents deltaZ', () => {
    const ctx = noteCtx();
    setRuntimeGlobal(ctx, '__shot', {
        state: 'ready', deltaZ: -100,
        arcs: {
            single: null,
            low: { status: 'tooFar', masked: false, tableRow: false, mil: null, tan: null },
            high: { status: 'hit', masked: false, tableRow: false, mil: 640.5, tan: 1.2 }
        }
    });
    const filled = callRuntime(ctx, 'fillModelledSolutions({ id: "spg" }, 2650, { single: null, low: null, high: null }, __shot)');
    assert.equal(filled.low, null);
    assert.equal(filled.high.modelled, true);
    assert.ok(Math.abs(filled.high.mil - 640.5) < 1e-9);
    const pending = callRuntime(ctx, 'fillModelledSolutions({ id: "spg" }, 2650, { single: null, low: null, high: null }, { state: "pending" })');
    assert.equal(pending.high, null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/lib/results-note.test.mjs`
Expected: FAIL with "terrainNoteText is not defined"

- [ ] **Step 3: Replace the fallback pipeline in `js/features/results.js`**

Delete `extendModelledSolutions` entirely. In its place add:

```js
function fillModelledSolutions(weapon, distanceMeters, solutions, shot) {
    if (!shot || shot.state !== 'ready') {
        return solutions;
    }

    const filled = { ...solutions };
    let changed = false;

    for (const arc of ['single', 'low', 'high']) {
        const assessed = shot.arcs[arc];

        if (
            filled[arc] ||
            !assessed ||
            assessed.status !== 'hit' ||
            assessed.masked ||
            assessed.tableRow ||
            assessed.mil === null
        ) {
            continue;
        }

        filled[arc] = {
            mil: assessed.mil,
            minMil: assessed.mil,
            maxMil: assessed.mil,
            tan: assessed.tan,
            modelled: true
        };

        changed = true;
    }

    return changed ? filled : solutions;
}
```

Replace the body of `solveFiringElevation` so its tail computes the shot once and uses the new fill:

```js
function solveFiringElevation(weapon, distanceMeters, origin, target, prime) {
    const flatSolutions = getWeaponElevationSolutions(weapon, distanceMeters);

    const resolved = resolveElevationSolutions(
        weapon,
        distanceMeters,
        flatSolutions,
        origin,
        target,
        prime
    );

    const shot =
        typeof assessShot === 'function'
            ? assessShot(weapon, origin, target, S.map)
            : null;

    const solutions = fillModelledSolutions(
        weapon,
        distanceMeters,
        resolved.solutions,
        shot
    );

    return {
        solutions,
        terrainMeta: resolved.terrainMeta,
        shot,
        solved: Boolean(solutions.single || solutions.low || solutions.high),
        modelled: Boolean(
            solutions.single?.modelled ||
            solutions.low?.modelled ||
            solutions.high?.modelled
        )
    };
}
```

Delete `modelledElevationSolution` and `terrainDeltaZMeters` from `js/map/range-ring.js` (grep first: after this task their only references were the deleted fallback).

- [ ] **Step 4: Add the note builder and status view to `js/features/results.js`**

Delete `formatTerrainBallisticDetail` and add:

```js
function correctionNoteFragment(meta) {
    if (!meta || meta.pendingTerrain) {
        return '';
    }

    if (meta.envelopeClamped) {
        return tr('noteElevationLimit');
    }

    if (Array.isArray(meta.arcsWithheld) && meta.arcsWithheld.length) {
        return tr('noteUncorrected');
    }

    return '';
}

function terrainNoteText(shot, meta) {
    if (!shot || shot.state === 'nodata') {
        return '';
    }

    if (shot.state === 'pending') {
        return tr('crossSectionLoadingTerrain');
    }

    if (shot.state === 'offmap') {
        return tr('noteOffMap');
    }

    const names = {
        low: tr('lowArc'),
        high: tr('highArc'),
        single: tr('noteArc')
    };

    const groups = { masked: [], tooClose: [], tooFar: [] };
    let total = 0;

    for (const arc of ['single', 'low', 'high']) {
        const assessed = shot.arcs[arc];

        if (!assessed || assessed.status === 'noModel') {
            continue;
        }

        total += 1;

        if (assessed.status === 'hit' && assessed.masked) {
            groups.masked.push(names[arc]);
        } else if (assessed.status === 'tooClose') {
            groups.tooClose.push(names[arc]);
        } else if (
            assessed.status === 'tooFar' ||
            assessed.status === 'belowMinElevation' ||
            assessed.status === 'aboveMaxElevation'
        ) {
            groups.tooFar.push(names[arc]);
        }
    }

    const keys = { masked: 'noteMasked', tooClose: 'noteTooClose', tooFar: 'noteTooFar' };
    const clauses = [];

    for (const group of ['masked', 'tooClose', 'tooFar']) {
        if (!groups[group].length) {
            continue;
        }

        const arcs = groups[group].length >= total
            ? tr('noteAllArcs')
            : groups[group].join(' + ');

        clauses.push(tr(keys[group]).replace('{arcs}', arcs));
    }

    const correction = correctionNoteFragment(meta);

    if (correction) {
        clauses.push(correction);
    }

    if (!clauses.length) {
        return '';
    }

    const dz = `${shot.deltaZ >= 0 ? '+' : ''}${shot.deltaZ.toFixed(1)}`;

    return [tr('noteDeltaZ').replace('{dz}', dz), ...clauses].join(' · ');
}

function rangeStatusView(elevation) {
    if (elevation.shot?.state === 'pending') {
        return { text: tr('crossSectionLoadingTerrain'), color: '#9aa4ae' };
    }

    const verdict = elevation.shot?.state === 'ready'
        ? elevation.shot.verdict
        : null;

    if (verdict === 'masked') {
        return { text: tr('reachMasked'), color: '#f0b24a' };
    }

    if (verdict === 'tooClose') {
        return { text: tr('reachTooClose'), color: '#d86666' };
    }

    if (verdict === 'tooFar' || verdict === 'unreachable') {
        return { text: tr('outRange'), color: '#d86666' };
    }

    if (!elevation.solved) {
        return { text: tr('outRange'), color: '#d86666' };
    }

    return elevation.modelled
        ? { text: tr('inRangeModelled'), color: '#f0b24a' }
        : { text: tr('inRange'), color: '#82c596' };
}
```

- [ ] **Step 5: Rewire the render path**

In `renderElevationResult`: replace `const terrainDetail = formatTerrainBallisticDetail(resolved.terrainMeta);` with `const terrainDetail = terrainNoteText(resolved.shot, resolved.terrainMeta);`, change `renderTerrainNote(resolved.terrainMeta, terrainDetail)` to `renderTerrainNote(resolved.shot, resolved.terrainMeta, terrainDetail)`, change `renderFlightTime(weapon, solutions, resolved.terrainMeta)` to `renderFlightTime(weapon, solutions, resolved.shot)`, and make the function's return value `{ solved, modelled, shot: resolved.shot }`.

`renderTerrainNote` gains the shot parameter and its state logic becomes:

```js
function terrainNoteState(shot, meta) {
    if (shot?.state === 'pending') {
        return 'loading';
    }

    return meta?.applied ? 'mixed' : 'uncorrected';
}

function renderTerrainNote(shot, meta, text) {
    const note = $('terrainNote');

    if (!note) {
        return;
    }

    setText(note, text);

    if (note.hidden !== !text) {
        note.hidden = !text;
    }

    if (text) {
        note.dataset.state = terrainNoteState(shot, meta);
    }
}
```

In `renderFlightTime`, replace the `flightTimeBadges(weapon, solutions, Number(terrainMeta?.deltaZ) || 0)` call with:

```js
    const badges =
        typeof flightTimeBadges === 'function' &&
        shot?.state !== 'pending'
            ? flightTimeBadges(
                weapon,
                solutions,
                shot?.state === 'ready' && Number.isFinite(shot.deltaZ)
                    ? shot.deltaZ
                    : 0
            )
            : [];
```

(rename the parameter from `terrainMeta` to `shot`). In `result()`, replace the two `rangeStatus` writes (the `setText($('rangeStatus'), ...)` and `setStyle($('rangeStatus'), 'color', ...)` calls) with:

```js
    const statusView = rangeStatusView(elevation);

    setText($('rangeStatus'), statusView.text);
    setStyle($('rangeStatus'), 'color', statusView.color);
```

`js/features/mil-cursor.js` needs no edit: it calls `solveFiringElevation`, which now returns verdict-consistent solutions, and the always-resident heightfield means its modelled values are terrain-aware without chunk priming. The saved-target paths (`getSavedTargetElevationSummary`, `getSavedTargetFiringInfo`) also need no edit — they call `solveFiringElevation` and inherit the per-arc fill; their card badges get the verdict in Task 10.

- [ ] **Step 6: Add the locale keys**

Add to every locale file (values below are en; translate per file, matching each file's existing tone — ru/uk/de/fr/es already translate the equivalent phrases inside `UI_TEXT` in `js/features/terrain-ballistics.js`, reuse those words; `cat.json` is the joke locale, keep it playful):

```json
{
    "noteDeltaZ": "ΔZ {dz} m",
    "noteArc": "arc",
    "noteAllArcs": "all arcs",
    "noteMasked": "{arcs}: masked by terrain",
    "noteTooClose": "{arcs}: inside minimum range",
    "noteTooFar": "{arcs}: out of reach at this height",
    "noteUncorrected": "not corrected for height",
    "noteElevationLimit": "MIL clamped at the gun's elevation limit",
    "noteOffMap": "no terrain data here",
    "crossSectionBelowMin": "needs elevation below the gun's minimum — passes over",
    "crossSectionAboveMax": "needs elevation above the gun's maximum — falls short",
    "reachUnknown": "No terrain data"
}
```

- [ ] **Step 7: Run tests and boot**

Run: `node --test scripts/lib/results-note.test.mjs` — expect PASS. Add it to `test:scripts`; run `npm run test:scripts`. Boot `PORT=8123 npm run dev`, place an SPG on Bakurani, and confirm: a 917 m flat shot shows the high-arc MIL with a note naming the low arc too close; a 2600 m shot 200 m below a summit gun shows amber/red status instead of green; nothing throws.

- [ ] **Step 8: Commit**

```bash
git add js/features/results.js js/map/range-ring.js locales scripts/lib/results-note.test.mjs package.json
git commit -m "Render the unified reachability verdict in the results panel, note, and flight time"
```

---

### Task 6: Correction layer — clamp, don't classify reachability

**Files:**
- Modify: `js/features/terrain-ballistics.js`
- Create: `test/reachability.mjs` (browser suite, first checks)

**Interfaces:**
- Consumes: `context.weapon` already passed into `getTerrainBallisticSolutions`.
- Produces: `classifyArc(solution, grid, distanceMeters, deltaZMeters, weapon)` gains the weapon parameter; outcome `'unreachable'` is renamed `'offgrid'`; corrected solutions may carry `envelopeClamped: true` and the meta gains `envelopeClamped: boolean`; `meta.deltaZ` is renamed `meta.correctionDeltaZ`; `formatTerrainBallisticsStatus` and its `window` export are deleted; `meta.arcsUnreliable` is deleted.

- [ ] **Step 1: Apply the changes**

In `classifyArc`: change the signature to `(solution, grid, distanceMeters, deltaZMeters, weapon)` and update its one call site in `getTerrainBallisticSolutions` to pass `context.weapon`. At the top of the grid path add the distance clamp (the ≤ 20 m sliver between each grid axis end and the table's 2629 m — spec § 6):

```js
        const distances = Array.isArray(grid.distancesMeters)
            ? grid.distancesMeters.map(Number)
            : null;

        const last = distances?.length
            ? distances[distances.length - 1]
            : null;

        const lookupDistance =
            Number.isFinite(last) &&
            distanceMeters > last &&
            distanceMeters - last <= 20
                ? last
                : distanceMeters;
```

and use `lookupDistance` in both `interpolateHeightCorrection` calls. Change the `outcome: 'unreachable'` return to `outcome: 'offgrid'`. In the corrected branch, clamp into the envelope:

```js
        const minStop = Number(weapon?.minElevationMil);
        const maxStop = Number(weapon?.maxElevationMil);

        const clampMil = value => {
            let clamped = value;

            if (Number.isFinite(minStop) && clamped < minStop) {
                clamped = minStop;
            }

            if (Number.isFinite(maxStop) && clamped > maxStop) {
                clamped = maxStop;
            }

            return clamped;
        };

        const minMil = clampMil(solution.minMil + deltaMil);
        const maxMil = clampMil(solution.maxMil + deltaMil);

        const mil = Number.isFinite(solution.mil)
            ? clampMil(solution.mil + deltaMil)
            : solution.mil;

        const envelopeClamped =
            minMil !== solution.minMil + deltaMil ||
            maxMil !== solution.maxMil + deltaMil;

        return {
            solution: { ...solution, mil, minMil, maxMil, envelopeClamped },
            outcome: 'corrected',
            missMeters: miss
        };
```

In `getTerrainBallisticSolutions`: rename the meta field `deltaZ` to `correctionDeltaZ` (grep the repo — after Task 5 nothing reads `meta.deltaZ` anymore; the rename makes any missed reader fail loudly). Delete `arcsUnreliable` from the meta initialiser and from the fold (`'unreachable'`/`'nogrid'` arcs now just land in `arcsUncorrected`); after the fold add `meta.envelopeClamped = meta.arcsCorrected.some(arc => corrected[arc]?.envelopeClamped) === true;` (guard with `meta.arcsCorrected.length ? ... : false`). Delete the `formatTerrainBallisticsStatus` function, its `window.formatTerrainBallisticsStatus` export, and the now-unused `UI_TEXT` keys `terrainLoading`, `terrainStatus`, `terrainStatusUnreachable`, `terrainStatusUnreachableAll`, `arcNameLow`, `arcNameHigh`, `arcNameSingle` from every language block (keep `warningTitle`/`warningBody` — the SPH level warning still uses them).

- [ ] **Step 2: Write the browser checks**

Create `test/reachability.mjs` following the `test/range-ring.mjs` pattern (same helpers import, same dev-server preamble at `PORT=8123`):

```js
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

const edge = await page.evaluate(async () => {
    ensureHeightfieldLoaded('bakurani');

    for (let i = 0; i < 40 && !cachedHeightfield('bakurani'); i += 1) {
        await new Promise(r => setTimeout(r, 250));
    }

    const origin = { x: 30, y: 60 };
    const target = { x: 30 + 26.2, y: 60 };
    const weapon = WEAPONS.spg;

    getTerrainBallisticSolutions({
        weapon,
        distanceMeters: 2620,
        solutions: getWeaponElevationSolutions(weapon, 2620),
        mapId: 'bakurani',
        origin,
        target,
        prime: true
    });

    for (let i = 0; i < 40; i += 1) {
        const again = getTerrainBallisticSolutions({
            weapon,
            distanceMeters: 2620,
            solutions: getWeaponElevationSolutions(weapon, 2620),
            mapId: 'bakurani',
            origin,
            target,
            prime: false
        });

        if (again.meta && !again.meta.pendingTerrain) {
            return again.meta;
        }

        await new Promise(r => setTimeout(r, 250));
    }

    return null;
});

check('2620 m sits past the grid axis yet is corrected via the clamp', Boolean(edge) && edge.arcsCorrected.includes('low'), JSON.stringify(edge));
check('no page errors', errors.length === 0, errors.join('; '));

await browser.close();
process.exit(state.fail ? 1 : 0);
```

- [ ] **Step 3: Run it**

Start `PORT=8123 npm run dev` in the background, run `node test/reachability.mjs` (install chromium first if missing: `npm install --no-save playwright-core && npx playwright install chromium`). Expected: both checks pass. If the origin/target pair lands outside Bakurani's terrain coverage, pick any two points 26.2 game units apart that `test/range-ring.mjs` already uses successfully (e.g. around its summit gun at 51.67, 113.74) and keep the 2620 m `distanceMeters`.

- [ ] **Step 4: Grep for stragglers**

`grep -rn "formatTerrainBallisticsStatus\|arcsUnreliable\|meta.deltaZ\|terrainStatusUnreachable" js/ src/` must return nothing.

- [ ] **Step 5: Commit**

```bash
git add js/features/terrain-ballistics.js test/reachability.mjs
git commit -m "Correction layer stops classifying reachability and clamps into grid axis and envelope"
```

---

### Task 7: Cross-section draws the verdict

**Files:**
- Modify: `js/map/cross-section.js`
- Test: `scripts/lib/cross-section-shot.test.mjs`

**Interfaces:**
- Consumes: `assessArc`, `arcAngleStops`, `modelShellHeight`.
- Produces: `crossSectionShot(weapon, arc, profile)` now returns `{ arc, status, masked, heights, kind, crestIndex, endIndex, impactMeters, shortfallMeters, clearance }` — `clampedTo` and `reaches` are gone; `crossSectionStopTan(weapon, fit, status)` is new. `crossSectionElevationLimits`, `crossSectionMaxRangeTan`, `crossSectionShellHeight`, and `CROSS_SECTION_GRAVITY` are deleted.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const model = {
    schema: 'wardogs-projectile-model-v1',
    weapons: {
        spg: {
            low: { branch: 'low', muzzleVelocity: 160.1, angleOffsetDeg: 12.75, anglePerMilDeg: 0.058 },
            high: { branch: 'high', muzzleVelocity: 160.4, angleOffsetDeg: 14.5, anglePerMilDeg: 0.048 }
        }
    }
};

const spg = {
    id: 'spg', minRange: 0.78, maxRange: 2.629, minElevationMil: 20, maxElevationMil: 1390,
    ballistics: { low: [[1181, 20], [2629, 600]], high: [[735, 1400], [2629, 610]] }
};

function flatProfile(distanceMeters) {
    return {
        ground: new Float64Array(212),
        gunIndex: 10,
        targetIndex: 201,
        distanceMeters,
        stepMeters: distanceMeters / 191
    };
}

function sectionCtx() {
    const ctx = loadRuntime(
        [
            'js/ballistics/model.js',
            'js/ballistics/reachability.js',
            'js/map/cross-section.js'
        ],
        {
            tr: key => key,
            $: () => null,
            RANGE_RING_MARCH_METRES: 25,
            rangeRingSample: () => 0,
            isMapLayerVisible: () => false
        }
    );
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', model);
    setRuntimeGlobal(ctx, '__spg', spg);
    setRuntimeGlobal(ctx, '__profile', flatProfile(917));
    return ctx;
}

test('the 917 m SPG low arc is drawn as a tooClose overshoot, never a green hit', () => {
    const ctx = sectionCtx();
    const low = callRuntime(ctx, 'crossSectionShot(__spg, "low", __profile)');
    assert.equal(low.status, 'tooClose');
    assert.equal(low.kind, 'over');
    assert.equal(callRuntime(ctx, '__low = crossSectionShot(__spg, "low", __profile); crossSectionShotCaption(__low)'), 'crossSectionOver');
    const high = callRuntime(ctx, 'crossSectionShot(__spg, "high", __profile)');
    assert.equal(high.status, 'hit');
    assert.equal(high.kind, 'hit');
    assert.equal(callRuntime(ctx, '__high = crossSectionShot(__spg, "high", __profile); crossSectionShotCaption(__high)'), null);
});

test('beyond the anchored maximum the arc is tooFar and captioned short', () => {
    const ctx = sectionCtx();
    setRuntimeGlobal(ctx, '__far', flatProfile(2700));
    const far = callRuntime(ctx, 'crossSectionShot(__spg, "high", __far)');
    assert.equal(far.status, 'tooFar');
    assert.equal(far.kind, 'short');
    assert.ok(far.impactMeters < 2700);
});

test('the ceiling-capped table sliver draws honest model shortfall, not a mask', () => {
    const ctx = sectionCtx();
    setRuntimeGlobal(ctx, '__edge', flatProfile(2620));
    const low = callRuntime(ctx, 'crossSectionShot(__spg, "low", __edge)');
    assert.equal(low.status, 'hit');
    assert.equal(low.ceilingCapped, true);
    assert.equal(low.masked, false);
    assert.equal(low.kind, 'short');
    assert.ok(Math.abs(low.shortfallMeters - 7) < 8, String(low.shortfallMeters));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/lib/cross-section-shot.test.mjs`
Expected: FAIL — the current `crossSectionShot` returns no `status` field (and draws the 917 m low arc as `kind: 'hit'`).

- [ ] **Step 3: Rewrite the shot classification in `js/map/cross-section.js`**

Delete `crossSectionElevationLimits`, `crossSectionMaxRangeTan`, `crossSectionShellHeight`, and the `CROSS_SECTION_GRAVITY` constant. In `crossSectionMarch`, replace the `crossSectionShellHeight(...)` call with `modelShellHeight(tan, muzzleVelocity, (i - profile.gunIndex) * profile.stepMeters)`. Replace `crossSectionShot` and add `crossSectionStopTan`:

```js
function crossSectionStopTan(weapon, fit, status) {
    const stops = arcAngleStops(weapon, fit);

    if (!stops) {
        return null;
    }

    let radians;

    if (status === 'belowMinElevation') {
        radians = stops.minRadians;
    } else if (status === 'aboveMaxElevation') {
        radians = stops.maxRadians;
    } else if (status === 'tooClose') {
        radians = fit.branch === 'low' ? stops.minRadians : stops.maxRadians;
    } else {
        radians = fit.branch === 'low' ? stops.maxRadians : stops.minRadians;
    }

    return Math.tan(radians);
}

function crossSectionShot(weapon, arc, profile) {
    const fit = crossSectionFit(weapon.id, arc);
    const muzzleVelocity = Number(fit?.muzzleVelocity);

    if (!fit || !Number.isFinite(muzzleVelocity) || muzzleVelocity <= 0) {
        return null;
    }

    const deltaZ =
        profile.ground[profile.targetIndex] -
        profile.ground[profile.gunIndex];

    const assessed = assessArc(weapon, arc, profile.distanceMeters, deltaZ);

    if (assessed.status === 'noModel') {
        return null;
    }

    const firstIndex = crossSectionFirstIndex(profile);
    const crestIndex = crossSectionCrestIndex(profile, firstIndex);

    const tan = assessed.status === 'hit'
        ? assessed.tan
        : crossSectionStopTan(weapon, fit, assessed.status);

    if (tan === null) {
        return null;
    }

    const march = crossSectionMarch(profile, tan, muzzleVelocity, firstIndex);

    const capped = assessed.ceilingCapped === true;
    const masked = assessed.status === 'hit' && !capped && march.impactIndex >= 0;

    let kind = 'hit';
    let endIndex = profile.targetIndex;

    if (march.impactIndex >= 0) {
        kind = assessed.status === 'hit' && !capped ? 'blocked' : 'short';
        endIndex = march.impactIndex;
    } else if (assessed.status !== 'hit') {
        kind = 'over';

        endIndex = march.landingIndex >= 0
            ? march.landingIndex
            : CROSS_SECTION_TOTAL_SAMPLES - 1;
    }

    const impactMeters =
        (endIndex - profile.gunIndex) * profile.stepMeters;

    return {
        arc,
        status: assessed.status,
        masked,
        ceilingCapped: capped,
        heights: march.heights,
        kind,
        crestIndex,
        endIndex,
        impactMeters,
        shortfallMeters: profile.distanceMeters - impactMeters,
        clearance: march.heights[crestIndex] - profile.ground[crestIndex]
    };
}
```

Replace `crossSectionShotCaption`:

```js
function crossSectionShotCaption(shot) {
    if (shot.masked || shot.kind === 'blocked') {
        return tr('crossSectionBlocked')
            .replace('{metres}', Math.round(shot.impactMeters))
            .replace('{short}', Math.round(shot.shortfallMeters));
    }

    if (shot.status === 'hit') {
        return shot.ceilingCapped && shot.kind === 'short'
            ? tr('crossSectionShort')
                .replace('{metres}', Math.round(shot.impactMeters))
                .replace('{short}', Math.round(shot.shortfallMeters))
            : null;
    }

    if (shot.status === 'belowMinElevation') {
        return tr('crossSectionBelowMin');
    }

    if (shot.status === 'aboveMaxElevation') {
        return tr('crossSectionAboveMax');
    }

    if (shot.status === 'tooClose') {
        return tr('crossSectionOver');
    }

    return tr('crossSectionShort')
        .replace('{metres}', Math.round(shot.impactMeters))
        .replace('{short}', Math.round(shot.shortfallMeters));
}
```

Then `grep -n "clampedTo\|reaches\|crossSectionMaxRangeTan\|crossSectionShellHeight\|CROSS_SECTION_GRAVITY\|crossSectionElevationLimits" js/map/cross-section.js` and remove every remaining reference (the old refinement block that re-solved `crossSectionMaxRangeTan` at the landing height goes away with `reaches`; the drawing code keys off `kind`, which is unchanged).

- [ ] **Step 4: Run the test, then the whole suite**

Run: `node --test scripts/lib/cross-section-shot.test.mjs` — expect PASS. Add to `test:scripts`; run `npm run test:scripts`.

- [ ] **Step 5: Verify in the browser**

With the dev server up, SPG on Bakurani at ~917 m flat: the cross-section must show one green high arc and one red low arc captioned "overshoots, inside the minimum range" — never two green arcs. At ~2700 m: red "falls short" arcs.

- [ ] **Step 6: Commit**

```bash
git add js/map/cross-section.js scripts/lib/cross-section-shot.test.mjs package.json
git commit -m "Cross-section classifies arcs through assessArc and retires its private limits"
```

---

### Task 8: Dead ground from every fireable arc

**Files:**
- Modify: `js/map/dead-ground.js`
- Test: `scripts/lib/dead-ground-runtime.test.mjs`

**Interfaces:**
- Consumes: `assessArc`, `modelShellHeight`, `projectileModelArc`, `getCoordinateMetersPerUnit`, `WEAPONS`.
- Produces: `deadGroundArcs(weaponId) → [{name, fit}]|null` (all arcs, no branch filter — `reachGunSolved` in reach-badges keeps working through its truthiness); `deadGroundBearingIntervals(weapon, arcs, ranges, deltas, count, minRange)` gains the weapon parameter; `deadGroundLaunchTan`, `deadGroundGrazingTan`, and `DEAD_GROUND_CLEARANCE_METRES` are deleted.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const model = {
    schema: 'wardogs-projectile-model-v1',
    weapons: { mortar: { single: { branch: 'high', muzzleVelocity: 86.7, angleOffsetDeg: 52.5, anglePerMilDeg: 0.0375 } } }
};

const mortar = {
    id: 'mortar', minRange: 0.132, maxRange: 0.684, minElevationMil: 150, maxElevationMil: 850,
    ballistics: { single: [[80, 950], [697, 120]] }
};

test('a 250 m ridge at 500 m casts mortar dead ground from the ridge outward', () => {
    const ctx = loadRuntime(
        ['js/ballistics/model.js', 'js/ballistics/reachability.js', 'js/map/dead-ground.js'],
        { RANGE_RING_MARCH_METRES: 25, RANGE_RING_CACHE: new Map(), getCoordinateMetersPerUnit: () => 100 }
    );
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', model);
    setRuntimeGlobal(ctx, '__mortar', mortar);

    const count = 26;
    const ranges = Array.from({ length: count }, (v, i) => 25 * (i + 1));
    const deltas = ranges.map(r => (r === 500 ? 250 : 0));

    setRuntimeGlobal(ctx, '__ranges', Float64Array.from(ranges));
    setRuntimeGlobal(ctx, '__deltas', Float64Array.from(deltas));

    const arcs = callRuntime(ctx, 'deadGroundArcs("mortar")');
    assert.ok(Array.isArray(arcs) && arcs.length === 1);

    const intervals = callRuntime(
        ctx,
        `deadGroundBearingIntervals(__mortar, deadGroundArcs("mortar"), __ranges, __deltas, ${count}, 132)`
    );

    assert.equal(intervals.length, 2);
    assert.ok(intervals[0] > 450 && intervals[0] < 500, String(intervals[0]));
    assert.equal(intervals[1], 650);
});

test('flat ground casts no mortar dead ground', () => {
    const ctx = loadRuntime(
        ['js/ballistics/model.js', 'js/ballistics/reachability.js', 'js/map/dead-ground.js'],
        { RANGE_RING_MARCH_METRES: 25, RANGE_RING_CACHE: new Map(), getCoordinateMetersPerUnit: () => 100 }
    );
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', model);
    setRuntimeGlobal(ctx, '__mortar', mortar);

    const count = 26;
    setRuntimeGlobal(ctx, '__ranges', Float64Array.from({ length: count }, (v, i) => 25 * (i + 1)));
    setRuntimeGlobal(ctx, '__deltas', new Float64Array(count));

    const intervals = callRuntime(
        ctx,
        `deadGroundBearingIntervals(__mortar, deadGroundArcs("mortar"), __ranges, __deltas, ${count}, 132)`
    );

    assert.equal(intervals.length, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/lib/dead-ground-runtime.test.mjs`
Expected: FAIL — today `deadGroundArcs('mortar')` returns null (the `branch !== 'low'` filter), so the first assertion fails.

- [ ] **Step 3: Rewrite the solver core in `js/map/dead-ground.js`**

Delete `DEAD_GROUND_CLEARANCE_METRES`, `deadGroundLaunchTan`, `deadGroundGrazingTan`. Replace `deadGroundArcs`:

```js
function deadGroundArcs(weaponId) {
    const arcs = PROJECTILE_MODEL?.weapons?.[weaponId];

    if (!arcs) {
        return null;
    }

    const usable = [];

    for (const [name, arc] of Object.entries(arcs)) {
        const v = Number(arc?.muzzleVelocity);

        if (Number.isFinite(v) && v > 0) {
            usable.push({ name, fit: arc });
        }
    }

    return usable.length ? usable : null;
}
```

Replace `deadGroundBearingIntervals`'s signature with `(weapon, arcs, ranges, deltas, count, minRange)` and its per-sample loop body (keep `edgeBefore`/`edgeAfter` and the run bookkeeping exactly as they are):

```js
    let runStart = -1;

    for (let i = 0; i < count; i += 1) {
        let dead = ranges[i] >= minRange;

        for (let a = 0; dead && a < arcs.length; a += 1) {
            const assessed = assessArc(weapon, arcs[a].name, ranges[i], deltas[i]);

            if (assessed.status !== 'hit' || assessed.tan === null) {
                continue;
            }

            if (deadGroundTrajectoryClears(arcs[a].fit, assessed.tan, ranges, deltas, i)) {
                dead = false;
            }
        }
```

and add:

```js
function deadGroundTrajectoryClears(fit, tan, ranges, deltas, index) {
    const v = Number(fit.muzzleVelocity);

    for (let j = 0; j < index; j += 1) {
        if (modelShellHeight(tan, v, ranges[j]) < deltas[j]) {
            return false;
        }
    }

    return true;
}
```

Delete the `required` Float64Array and every reference to it. In `terrainDeadGround`, look up the weapon once (`const weapon = WEAPONS[gun.weapon];`, return null when absent) and pass it as the new first argument to `deadGroundBearingIntervals`; replace the two `METRES_PER_GAME_UNIT_RING` uses with a single `const metresPerUnit = getCoordinateMetersPerUnit();` hoisted above the bearing loop. The march is now O(samples²) per bearing (~1.2 M `modelShellHeight` calls worst case per gun, a few ms, memoised per 8 m of gun travel as before) — the grazing-tangent shortcut was only valid for shallow roots.

- [ ] **Step 4: Run the test, then the whole suite**

Run: `node --test scripts/lib/dead-ground-runtime.test.mjs` — expect PASS. Add to `test:scripts`; run `npm run test:scripts`.

- [ ] **Step 5: Verify in the browser**

Dev server up, Layers → dead ground on: a mortar behind a Bakurani ridge now draws wedges (previously never); an SPG gun's wedges shrink where the high arc clears ground the low arc grazed.

- [ ] **Step 6: Commit**

```bash
git add js/map/dead-ground.js scripts/lib/dead-ground-runtime.test.mjs package.json
git commit -m "Dead ground marches every fireable arc instead of low-branch fits only"
```

---

### Task 9: Rings from the anchored per-arc reach model

**Files:**
- Modify: `js/map/range-ring.js`
- Test: `scripts/lib/range-ring-runtime.test.mjs`

**Interfaces:**
- Consumes: `arcMaxRangeModel`, `arcMinRangeModel`, `projectileModelArc`, `getCoordinateMetersPerUnit`, `WEAPONS`.
- Produces: `weaponReachRange(weapon, dz) → m|null` (max over arcs of `arcMaxRangeModel`), `weaponMinReachRange(weapon, dz) → m|null` (min over arcs of `arcMinRangeModel`). Deleted: `weaponMuzzleVelocity`, `maxElevationArc`, `maxElevationAngle`, `modelMaxRange` usage inside the ring (the function itself stays in model.js), `RANGE_RING_GRAVITY` alias. `METRES_PER_GAME_UNIT_RING` stays until Task 10.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const model = {
    schema: 'wardogs-projectile-model-v1',
    weapons: {
        mortar: { single: { branch: 'high', muzzleVelocity: 86.7, angleOffsetDeg: 52.5, anglePerMilDeg: 0.0375 } },
        spg: {
            low: { branch: 'low', muzzleVelocity: 160.1, angleOffsetDeg: 12.75, anglePerMilDeg: 0.058 },
            high: { branch: 'high', muzzleVelocity: 160.4, angleOffsetDeg: 14.5, anglePerMilDeg: 0.048 }
        }
    }
};

const spg = { id: 'spg', minRange: 0.78, maxRange: 2.629, range: 2.629, minElevationMil: 20, maxElevationMil: 1390 };
const mortar = { id: 'mortar', minRange: 0.132, maxRange: 0.684, range: 0.684, minElevationMil: 150, maxElevationMil: 850 };

function ringCtx(field) {
    const ctx = loadRuntime(
        ['js/map/heightfield.js', 'js/ballistics/model.js', 'js/ballistics/reachability.js', 'js/map/range-ring.js'],
        { getCoordinateMetersPerUnit: () => 100 }
    );
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', model);
    setRuntimeGlobal(ctx, 'WEAPONS', { spg, mortar });
    setRuntimeGlobal(ctx, '__field', field);
    setRuntimeGlobal(ctx, 'cachedHeightfield', () => field);
    setRuntimeGlobal(ctx, 'ensureHeightfieldLoaded', () => {});
    return ctx;
}

test('weapon reach helpers take the best arc and honour the mortar clamp', () => {
    const ctx = ringCtx(null);
    assert.ok(Math.abs(callRuntime(ctx, 'weaponReachRange(WEAPONS.spg, 0)') - 2622.6) < 0.1);
    assert.ok(Math.abs(callRuntime(ctx, 'weaponReachRange(WEAPONS.mortar, 0)') - 687.2) < 0.1);
    assert.ok(Math.abs(callRuntime(ctx, 'weaponReachRange(WEAPONS.mortar, -100)') - 744.4) < 1);
    assert.ok(Math.abs(callRuntime(ctx, 'weaponMinReachRange(WEAPONS.spg, 0)') - 791.3) < 0.1);
});

test('a gun at the lowest map height still gets the full declared circle at deltaZ 0', () => {
    const width = 120;
    const height = 120;

    const field = {
        heights: new Float32Array(width * height),
        width,
        height,
        originX: -30,
        originY: -30,
        stepGameUnits: 0.5,
        minZMeters: 0
    };

    const ctx = ringCtx(field);

    const ring = callRuntime(ctx, 'terrainRangeRing({ position: { x: 0, y: 0 }, weapon: "spg" }, "m")');

    assert.ok(ring, 'ring solved');
    assert.ok(Math.abs(ring.radii[0] - 2629) < 1, String(ring.radii[0]));
    assert.ok(Math.abs(ring.radii[90] - 2629) < 1, String(ring.radii[90]));
    assert.ok(Math.abs((ring.minRadii?.[0] ?? 0) - 780) < 1, String(ring.minRadii?.[0]));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/lib/range-ring-runtime.test.mjs`
Expected: FAIL — `weaponReachRange` is not defined, and on the current code the flat-field ring caps at 2622.6 (the marchLimit anchor bug), not 2629.

- [ ] **Step 3: Implement in `js/map/range-ring.js`**

Add:

```js
function weaponReachRange(weapon, deltaZMeters) {
    let best = null;

    for (const arc of ['single', 'low', 'high']) {
        const fit = projectileModelArc(weapon?.id, arc);

        if (!fit) {
            continue;
        }

        const range = arcMaxRangeModel(weapon, fit, deltaZMeters);

        if (range !== null && (best === null || range > best)) {
            best = range;
        }
    }

    return best;
}

function weaponMinReachRange(weapon, deltaZMeters) {
    let best = null;

    for (const arc of ['single', 'low', 'high']) {
        const fit = projectileModelArc(weapon?.id, arc);

        if (!fit) {
            continue;
        }

        const range = arcMinRangeModel(weapon, fit, deltaZMeters);

        if (range !== null && (best === null || range < best)) {
            best = range;
        }
    }

    return best;
}
```

In `terrainRangeRing`: replace `const muzzleVelocity = weaponMuzzleVelocity(gun.weapon);` and its guard with `const levelMax = weaponReachRange(weapon, 0);` guarded by `if (!field || !levelMax) { return null; }` (drop the old `levelMax` computation below), replace `modelMaxRange(muzzleVelocity, z - zGun)` inside `reaches` with `weaponReachRange(weapon, z - zGun)`, and fix the march bound:

```js
    const marchLimit = Math.min(
        (weaponReachRange(weapon, field.minZMeters - zGun) ?? declaredMax) +
            Math.max(0, declaredMax - levelMax),
        declaredMax * 2
    );
```

In `minRangeRadii`: delete the `maxElevationArc`/`maxElevationAngle`/`muzzleVelocity` preamble; `levelMin` becomes `weaponMinReachRange(weapon, 0)`, `deepest` becomes `weaponMinReachRange(weapon, field.minZMeters - zGun)`, and the `modelled` line inside `short` becomes `const modelled = weaponMinReachRange(weapon, z - zGun);`. Guard: `if (!(declaredMin > 0) || levelMin === null) { return null; }`.

Delete `weaponMuzzleVelocity`, `maxElevationArc`, `maxElevationAngle`, and the `const RANGE_RING_GRAVITY = BALLISTICS_GRAVITY;` alias (grep `RANGE_RING_GRAVITY` repo-wide first — after Task 8 nothing uses it). Inside `rangeRingMemoKey`, `minRangeRadii`, and `terrainRangeRing`, replace `METRES_PER_GAME_UNIT_RING` with a hoisted `const metresPerUnit = getCoordinateMetersPerUnit();` per function (the constant itself is deleted in Task 10).

- [ ] **Step 4: Run the test, then the whole suite**

Run: `node --test scripts/lib/range-ring-runtime.test.mjs` — expect PASS. Add to `test:scripts`; run `npm run test:scripts`. Also run the existing browser suite `node test/range-ring.mjs` (dev server up): the summit/valley SPG checks must still pass; if the suite asserts mortar reach numbers, update them to the clamped model (level 687.2, dz −100 ≈ 744.4) per spec § 3.

- [ ] **Step 5: Commit**

```bash
git add js/map/range-ring.js scripts/lib/range-ring-runtime.test.mjs package.json
git commit -m "Rings solve against the anchored per-arc reach model and fix the march bound"
```

---

### Task 10: Reach badges classify through `assessShot`

**Files:**
- Modify: `js/features/reach-badges.js`
- Modify: `js/map/range-ring.js` (delete `METRES_PER_GAME_UNIT_RING`)
- Test: `scripts/lib/reach-classify.test.mjs`

**Interfaces:**
- Consumes: `assessShot`, `WEAPONS`, `S`.
- Produces: `reachClassify(solved, target) → 'pending'|'unknown'|'reachable'|'masked'|'close'|'out'|null` — no longer reads `solved.ring`/`solved.dead` (those stay only for the drawn layers); `reachBearingIndex` and `reachIntervalHit` are deleted; `REACH_STATE_LABEL` gains `unknown: 'reachUnknown'`.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const model = {
    schema: 'wardogs-projectile-model-v1',
    weapons: {
        spg: {
            low: { branch: 'low', muzzleVelocity: 160.1, angleOffsetDeg: 12.75, anglePerMilDeg: 0.058 },
            high: { branch: 'high', muzzleVelocity: 160.4, angleOffsetDeg: 14.5, anglePerMilDeg: 0.048 }
        }
    }
};

const spg = {
    id: 'spg', minRange: 0.78, maxRange: 2.629, minElevationMil: 20, maxElevationMil: 1390,
    ballistics: { low: [[1181, 20], [2629, 600]], high: [[735, 1400], [2629, 610]] }
};

function badgeCtx(field) {
    const ctx = loadRuntime(
        [
            'js/map/heightfield.js',
            'js/ballistics/model.js',
            'js/ballistics/reachability.js',
            'js/features/reach-badges.js'
        ],
        {
            tr: key => key,
            $: () => null,
            setText: () => {},
            S: { map: 'm', guns: [] },
            mapHasHeightfield: () => true,
            ensureHeightfieldLoaded: () => {},
            getCoordinateMetersPerUnit: () => 100,
            RANGE_RING_CACHE: new Map(),
            DEAD_GROUND_CACHE: new Map(),
            rangeRingMemoKey: () => 'k',
            deadGroundArcs: () => null,
            terrainDeadGround: () => null
        }
    );
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', model);
    setRuntimeGlobal(ctx, 'WEAPONS', { spg });
    setRuntimeGlobal(ctx, 'cachedHeightfield', () => field);
    callRuntime(ctx, `rangeRingSample = (field, x, y) => heightfieldSample(
        field,
        Math.min(field.originX + (field.width - 1) * field.stepGameUnits, Math.max(field.originX, x)),
        Math.min(field.originY + (field.height - 1) * field.stepGameUnits, Math.max(field.originY, y))
    )`);
    return ctx;
}

const flat = {
    heights: new Float32Array(40 * 3),
    width: 40, height: 3, originX: 0, originY: 0, stepGameUnits: 1, minZMeters: 0
};

test('reachClassify mirrors the assessShot verdict', () => {
    const ctx = badgeCtx(flat);
    setRuntimeGlobal(ctx, '__gun', { gun: { position: { x: 1, y: 1 }, weapon: 'spg' } });
    assert.equal(callRuntime(ctx, 'reachClassify(__gun, { x: 10, y: 1 })'), 'reachable');
    assert.equal(callRuntime(ctx, 'reachClassify(__gun, { x: 29, y: 1 })'), 'out');
    assert.equal(callRuntime(ctx, 'reachClassify(__gun, { x: 5, y: 1 })'), 'close');
    assert.equal(callRuntime(ctx, 'reachClassify(__gun, { x: 200, y: 1 })'), 'unknown');
});

test('reachClassify is pending while the heightfield loads', () => {
    const ctx = badgeCtx(null);
    setRuntimeGlobal(ctx, '__gun', { gun: { position: { x: 1, y: 1 }, weapon: 'spg' } });
    assert.equal(callRuntime(ctx, 'reachClassify(__gun, { x: 10, y: 1 })'), 'pending');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/lib/reach-classify.test.mjs`
Expected: FAIL — the current `reachClassify` needs `solved.ring` and returns 'pending' for everything here.

- [ ] **Step 3: Implement**

Replace `reachClassify` in `js/features/reach-badges.js` (and delete `reachBearingIndex` and `reachIntervalHit`):

```js
function reachClassify(solved, target) {
    const x = Number(target?.x);
    const y = Number(target?.y);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }

    const weapon = WEAPONS[solved.gun.weapon];

    if (!weapon) {
        return null;
    }

    const shot = assessShot(weapon, solved.gun.position, { x, y }, S.map);

    if (shot.state === 'pending') {
        return 'pending';
    }

    if (shot.state !== 'ready') {
        return 'unknown';
    }

    if (shot.verdict === 'hit') {
        return 'reachable';
    }

    if (shot.verdict === 'masked') {
        return 'masked';
    }

    if (shot.verdict === 'tooClose') {
        return 'close';
    }

    return 'out';
}
```

Add `unknown: 'reachUnknown'` to `REACH_STATE_LABEL`. In `reachSummarise`, handle the new state next to the pending branch — an unknown gun appears in the tooltip detail but joins neither `counted` nor `pending`:

```js
        if (state === 'pending') {
            pending += 1;
        } else if (state !== 'unknown') {
            counted += 1;

            if (state === 'reachable') {
                reachable += 1;
            }
        }
```

The solve queue (`reachSolveGun`, `reachScheduleSolve`, `REACH_UNAVAILABLE`) stays exactly as is — it now exists purely to precompute the drawn ring and wedge layers, and badges no longer wait for it. Finally delete `const METRES_PER_GAME_UNIT_RING = 100;` from `js/map/range-ring.js` and confirm `grep -rn "METRES_PER_GAME_UNIT_RING" js/` returns nothing.

- [ ] **Step 4: Run the test, then the whole suite**

Run: `node --test scripts/lib/reach-classify.test.mjs` — expect PASS. Add to `test:scripts`; run `npm run test:scripts`. Run `node test/reach-badges.mjs` with the dev server up; where it asserts the old low-arc-only `masked` behaviour or the mortar's wedge-less `reachable`, update the expectations to the spec (§ 5): a target the high arc clears is `reachable`, a mortar target behind a blocking crest is `masked`.

- [ ] **Step 5: Commit**

```bash
git add js/features/reach-badges.js js/map/range-ring.js scripts/lib/reach-classify.test.mjs package.json
git commit -m "Reach badges classify targets through assessShot"
```

---

### Task 11: OBS overlay mirrors the verdict

**Files:**
- Modify: `src/pages/obs/overlay.html`
- Modify: `js/features/obs.js`
- Modify: `obs.css`

**Interfaces:**
- Consumes: the main panel's `#terrainNote` element (text + `data-state`), `#rangeStatus` text, existing `obsSourceText`.
- Produces: `#obsTerrainNote` element in the overlay, mirrored by `obsRenderReadout`.

- [ ] **Step 1: Add the element**

In `src/pages/obs/overlay.html`, directly after the `obs-flight` div (`<div class="obs-flight" hidden id="obsFlight">…</div>`), insert:

```html
<div class="obs-terrain-note" hidden id="obsTerrainNote"></div>
```

- [ ] **Step 2: Mirror it in `obsRenderReadout`** (`js/features/obs.js`, after the flight block)

```js
    const note = $('obsTerrainNote');
    const source = $('terrainNote');
    const noteText = source && !source.hidden ? source.textContent.trim() : '';

    if (note) {
        setText(note, noteText);

        if (note.hidden !== !noteText) {
            note.hidden = !noteText;
        }

        if (noteText && source?.dataset.state) {
            note.dataset.state = source.dataset.state;
        }
    }
```

Also widen the `obsRangeStatus` in/out mapping so modelled and warned states are not painted as clean "in":

```js
        status.dataset.state = text === tr('inRange')
            ? 'in'
            : text === tr('inRangeModelled')
                ? 'warn'
                : 'out';
```

- [ ] **Step 3: Style it** (append to `obs.css`, matching the existing `.obs-*` palette in that file)

```css
.obs-terrain-note {
    font-size: 11px;
    opacity: .85;
    color: #f0b24a;
}

.obs-terrain-note[data-state="loading"] {
    color: #9aa4ae;
}
```

- [ ] **Step 4: Verify**

`npm run build`, then open the OBS overlay page with the app in a state showing a terrain warning (e.g. SPG at 2600 m with a +200 m target): the overlay shows the same warning line under the readout; with a clean shot the line is hidden. Confirm no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/obs/overlay.html js/features/obs.js obs.css
git commit -m "Mirror the terrain verdict into the OBS overlay"
```

---

### Task 12: Config assertions — lockstep, allowlists, scale

**Files:**
- Test: `scripts/lib/config.test.mjs` (new; it is the deliverable)

**Interfaces:**
- Consumes: `data/weapons.json`, `data/ballistics/terrain-context.json`, `maps/*.json`, `data/terrain/*/heightfield.json`, and the allowlist literals in `js/map/heightfield.js`, `js/map/contours.js`, `js/map/hillshade.js`.

- [ ] **Step 1: Write the assertions (they should PASS immediately — they guard invariants the spec relies on; a failure means shipped data already violates spec § 1 or § 8 and must be raised, not patched around)**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../..', import.meta.url));
const readJson = path => JSON.parse(readFileSync(join(root, path), 'utf8'));

function allowlist(file, name) {
    const source = readFileSync(join(root, file), 'utf8');
    const match = source.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`));
    assert.ok(match, `${name} found in ${file}`);
    return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]).sort();
}

test('every gated table row sits inside the elevation envelope', () => {
    const weapons = readJson('data/weapons.json').weapons;

    for (const weapon of weapons) {
        const minMeters = (weapon.minRangeKm ?? 0) * 1000;
        const maxMeters = (weapon.maxRangeKm ?? weapon.rangeKm) * 1000;

        for (const [arc, rows] of Object.entries(weapon.ballistics ?? {})) {
            for (const [distance, mil] of rows) {
                if (distance + 1e-6 < minMeters || distance > maxMeters + 1e-6) {
                    continue;
                }

                assert.ok(
                    mil + 1e-6 >= weapon.minElevationMil && mil <= weapon.maxElevationMil + 1e-6,
                    `${weapon.id}.${arc} row ${distance} m -> ${mil} mil escapes ${weapon.minElevationMil}..${weapon.maxElevationMil}`
                );
            }
        }
    }
});

test('the map allowlists match the terrain files on disk and each other', () => {
    const terrainDirs = readdirSync(join(root, 'data/terrain'), { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);

    const withFile = file => terrainDirs.filter(id => existsSync(join(root, 'data/terrain', id, file))).sort();

    assert.deepEqual(allowlist('js/map/heightfield.js', 'HEIGHTFIELD_MAP_IDS'), withFile('heightfield.json'));
    assert.deepEqual(allowlist('js/map/contours.js', 'CONTOUR_MAP_IDS'), withFile('contours.json'));
    assert.deepEqual(allowlist('js/map/hillshade.js', 'HILLSHADE_MAP_IDS'), withFile('hillshade.json'));

    const contextMaps = Object.keys(readJson('data/ballistics/terrain-context.json').terrainMaps).sort();
    assert.deepEqual(allowlist('js/map/heightfield.js', 'HEIGHTFIELD_MAP_IDS'), contextMaps);
});

test('heightfield scale agrees with each map\'s coordinateMetersPerUnit', () => {
    for (const id of allowlist('js/map/heightfield.js', 'HEIGHTFIELD_MAP_IDS')) {
        const field = readJson(`data/terrain/${id}/heightfield.json`);
        const map = readJson(`maps/${id}.json`);

        assert.equal(
            field.spacingMeters / field.stepGameUnits,
            map.coordinateMetersPerUnit,
            `${id} heightfield scale`
        );
    }
});
```

- [ ] **Step 2: Run it**

Run: `node --test scripts/lib/config.test.mjs`
Expected: PASS, 3 tests. (If the allowlist regex misses because a list is formatted differently, adjust the regex to the actual literal — do not weaken the assertion.)

- [ ] **Step 3: Add to `test:scripts`, run `npm run test:scripts`, commit**

```bash
git add scripts/lib/config.test.mjs package.json
git commit -m "Assert table-envelope lockstep, allowlist, and scale invariants at build time"
```

---

### Task 13: Browser integration suite for the audit scenarios

**Files:**
- Modify: `test/reachability.mjs` (extend the Task 6 file)
- Modify: `test/cross-section.mjs`, `test/flight-time.mjs`, `test/reach-badges.mjs`, `test/range-ring.mjs` (only where they assert the pre-unification behaviour)

- [ ] **Step 1: Extend `test/reachability.mjs`** with the end-to-end scenario checks, inserted before the `await browser.close()` line (same page, heightfield already resident from the Task 6 block):

```js
const scenarios = await page.evaluate(() => {
    const weapon = WEAPONS.spg;
    const gun = { x: 51.67, y: 113.74 };
    const at = metres => ({ x: gun.x + metres / getCoordinateMetersPerUnit(), y: gun.y });

    const near = assessShot(weapon, gun, at(917), 'bakurani');
    const far = assessShot(weapon, gun, at(2700), 'bakurani');
    const mortarShot = assessShot(WEAPONS.mortar, gun, at(690), 'bakurani');

    const mortarPure = mortarShot.state === 'ready'
        ? assessArc(WEAPONS.mortar, 'single', mortarShot.distanceMeters, mortarShot.deltaZ)
        : null;

    return {
        nearState: near.state,
        nearLow: near.arcs.low.status,
        nearHigh: near.arcs.high.status,
        farVerdict: far.verdict,
        mortarWired: mortarPure !== null && mortarShot.arcs.single.status === mortarPure.status,
        deltaZFinite: Number.isFinite(near.deltaZ)
    };
});

check('assessShot resolves on live Bakurani terrain', scenarios.nearState === 'ready' && scenarios.deltaZFinite, JSON.stringify(scenarios));
check('917 m: low arc refused, high arc live', scenarios.nearLow === 'tooClose' && ['hit'].includes(scenarios.nearHigh), JSON.stringify(scenarios));
check('assessShot wires the same verdict assessArc computes at the sampled deltaZ', scenarios.mortarWired === true, JSON.stringify(scenarios));
check('2700 m verdict is terrain-shifted, not flat', ['tooFar', 'hit', 'masked'].includes(scenarios.farVerdict), scenarios.farVerdict);

const panel = await page.evaluate(() => {
    S.weapon = 'spg';
    S.origin = { x: 51.67, y: 113.74 };
    S.target = { x: 51.67 + 9.17, y: 113.74 };
    result();

    return {
        status: document.getElementById('rangeStatus')?.textContent,
        note: document.getElementById('terrainNote')?.hidden === false
            ? document.getElementById('terrainNote').textContent
            : ''
    };
});

check('panel status and note come from the verdict', typeof panel.status === 'string' && panel.status.length > 0, JSON.stringify(panel));
```

The 2700 m check accepts `hit` because the summit gun's downhill surplus can legitimately cover 2700 m — the point being asserted is that `assessShot` answers at all and consistently, and the exact verdict at that spot is pinned by the pure tests of Task 3.

- [ ] **Step 2: Run every browser suite and reconcile**

With `PORT=8123 npm run dev` running: `node test/reachability.mjs && node test/range-ring.mjs && node test/cross-section.mjs && node test/flight-time.mjs && node test/reach-badges.mjs`. Expected failures to fix in the suites (not in the app), each traceable to the spec: cross-section assertions that expect the SPG low arc drawn as a hit below 1181 m (§ 5: now `tooClose`/`over`), captions asserting `clampedTo` (field removed), reach-badge assertions expecting mortar targets behind crests to be `reachable` (§ 5: now maskable) or `masked` states produced by low-arc-only wedges (now cleared by the high arc), flight-time assertions that fed `terrainMeta` (the third argument is now the shot). Anything else that fails is a regression — stop and fix the app, not the test.

- [ ] **Step 3: Commit**

```bash
git add test
git commit -m "Cover the audit scenarios end to end in the browser suite"
```

---

### Task 14: Documentation

**Files:**
- Modify: `docs/height-audit.md`
- Modify: `docs/todo.md`

- [ ] **Step 1: Add a resolution addendum to `docs/height-audit.md`** — a new section after "Disagreements" titled "Resolution (2026-09)", one line per finding, stating for each of A–L whether it is fixed by the unified-reachability change (A, B, C, D, E, F, G, I, J, K plus the marchLimit and mortar-clamp findings — cite `docs/superpowers/specs/2026-09-01-unified-reachability-design.md` § 9) or open by design (H — Ozeti stays uncorrected pending alignment validation; L — the experimental override still moves only the MIL). Do not rewrite the audit body; it stays a record of what was found.

- [ ] **Step 2: Update `docs/todo.md`** — mark "The SPG tables outrun their own fitted model" as handled at the gating level (the grid clamp and anchored gates; the fits themselves remain unvalidated), and add a line that flight time and the branch assumption remain unvalidated against the game (unchanged by this work).

- [ ] **Step 3: Run the full gate one last time**

`npm run test:scripts` green (minus the pre-existing environmental dev-env tile failure where `maps/tiles/` is absent), all five browser suites green, `npm run build` clean.

- [ ] **Step 4: Commit**

```bash
git add docs/height-audit.md docs/todo.md
git commit -m "Record which audit disagreements the unified reachability change closes"
```

When this branch is merged, update `extraction-plan.md` per the repo's standing convention.
