# Height and elevation audit

This document maps every place the calculator reads terrain height, derives something from it, or shows the user an answer that depends on it. It is a map for a reviewer hunting inconsistencies, not a bug report and not a proposal — nothing here is fixed, and where two surfaces disagree the disagreement is described rather than resolved.

The short version: there are **two independent terrain datasets**, **three independent ballistic engines**, and **four independent definitions of "can this gun reach that target"**, and they are wired together in a way that lets a single screen show two different answers about the same shot at the same time. The "Disagreements" section is the payload; everything before it exists so that section can be read without opening the code.

---

## 1. The two height datasets

Both are baked from the same source and both live under `data/terrain/<map-id>/`, but nothing at runtime cross-checks them and they are sampled by different code with different out-of-bounds behaviour.

| | Terrain3D chunks | Baked heightfield |
|---|---|---|
| Files | `data/terrain/<map>/manifest.json` + `chunks/*.bin` | `data/terrain/<map>/heightfield.json` + `heightfield.bin` |
| Resolution | 2 m (`vertexSpacingMeters: 2`, 511 vertices per 510-quad chunk) | 32 m (`spacingMeters: 32`, `stepGameUnits: 0.32`) |
| Size | ~129 MB per map; two chunks streamed per firing solution | 234 KB (Bakurani, 346 × 346), 131 KB (Ozeti, 269 × 244) |
| Loader | `js/features/terrain-ballistics.js:826` `loadChunk`, primed by `primeTerrainForPoints` (`:898`) | `js/map/heightfield.js` `loadHeightfield` / `ensureHeightfieldLoaded` |
| Sampler | `terrainHeightAtPointSync` (`js/features/terrain-ballistics.js:954`), bilinear over one chunk | `heightfieldSample` (`js/map/heightfield.js`), bilinear over the whole-map grid |
| Out of bounds | `locateTerrainPoint` (`:760`) returns `null` outside `manifest.coverage`; the caller falls back to the flat table entirely | `heightfieldSample` returns `null`, but every ballistic caller goes through `rangeRingSample` (`js/map/range-ring.js:128`), which **clamps to the nearest edge sample** and therefore never returns `null` for a finite point |
| Decode | `worldZOffsetMeters + localZ * worldZScaleMetersPerLocalUnit`, per-chunk `minLocalZ`/`maxLocalZ` | `minZMeters + (raw / 65535) * (maxZMeters - minZMeters)`, whole-map range |
| Consumed by | the MIL correction, the ΔZ caption, the flight-time ΔZ | the range rings, dead ground, reach badges, the cross-section, and the "modelled" out-of-table MIL |

A third baked file, `data/terrain/<map>/contours.json`, is a *rendering* product only (`js/map/contours.js`): 20 m contour polylines sampled from the chunks on a 4 m grid at build time. It feeds no calculation, carries no altitude labels, and colours lines by height *relative to the map's own lowest sample* (`decodeContours` computes `relief` and calls `contourRampColor`). It is the only height surface in the app with no ballistic consumer at all.

Both maps that ship terrain — `bakurani` and `ozeti` — are listed twice, independently, in `HEIGHTFIELD_MAP_IDS` (`js/map/heightfield.js`) and `CONTOUR_MAP_IDS` (`js/map/contours.js`), and a third time in `data/ballistics/terrain-context.json` under `terrainMaps`. A fourth list, `releasePolicy.correctedMaps`, contains only `bakurani`. Nothing keeps the four in step.

### The datum caveat

Terrain Z is not altitude. `docs/terrain.md` records the measured ranges: Bakurani runs about −1007 m to +75 m, Ozeti about −1008 m to −620 m, so the field sits roughly 900 m below anything a player would recognise as a height. The offset is not recorded anywhere in the repository and `worldZOffsetMeters` (0.5 on Bakurani, 0.04 on Ozeti) does not encode it. Only differences are meaningful.

Every surface below was checked for absolute-height display. The current state is clean but fragile:

- The ΔZ caption prints a difference only (`formatTerrainBallisticsStatus`, `js/features/terrain-ballistics.js:383`), even though `meta.originZ` and `meta.targetZ` are both carried on the meta object and are absolute, datum-offset numbers that any future caller could print by accident.
- The cross-section's vertical scale labels (`drawCrossSectionScale`, `js/map/cross-section.js:652`) print `+N m` and `0 m` **relative to the gun**, computed as `model.range.top - zGun` — a difference, so correct.
- Contour lines are drawn unlabelled for exactly this reason (see the comment at the head of `js/map/contours.js`).
- `field.minZMeters` is used as a *bound* in `terrainRangeRing` (`js/map/range-ring.js:445`) and `minRangeRadii` (`:333`) — always as `field.minZMeters - zGun`, a difference, so correct.

The risk is not present-tense; it is that four files now hold absolute heights one `setText` away from the screen.

---

## 2. The three ballistic engines

Every MIL, ring radius, wedge and trajectory in the app comes from one of these three. They do not agree with each other, and which one answers depends on the surface, not on the shot.

**Engine A — the flat lookup table.** `data/weapons.json`, `ballistics.single` / `.low` / `.high`, read by `interpolateBallisticTable` and `getWeaponElevationSolutions` (`js/features/weapons.js:203`). Distance in, MIL out, no height term at all. Gated by `minRange`/`maxRange` from the same file. This is the authoritative source for the MIL the user is told to dial.

**Engine B — the fitted vacuum model.** `data/ballistics/projectile-model.json`, a least-squares vacuum fit to Engine A's own tables. Read exclusively through `projectileModelArc` (`js/map/range-ring.js:66`), which is deliberately the single copy — `js/features/flight-time.js` and `js/map/cross-section.js` both go through it. Its parameters:

| Weapon | Arc | `branch` | `muzzleVelocity` | `angleOffsetDeg` | `anglePerMilDeg` | `rmsMeters` |
|---|---|---|---|---|---|---|
| `mortar` | `single` | high | 86.7 | 52.5 | 0.0375 | 8.11 |
| `spg` | `low` | low | 160.1 | 12.75 | 0.058 | 14.11 |
| `spg` | `high` | high | 160.4 | 14.5 | 0.048 | 8.11 |

Launch angle is `angleOffsetDeg + anglePerMilDeg × mil`; the inverse is `modelArcMil` (`js/map/range-ring.js:177`). The trajectory solver is `modelArcLaunchTan` (`:142`), which picks the shallow or steep root of the vacuum quadratic according to `fit.branch`. Level max range is `modelMaxRange` (`:103`), giving 2612.8 m for `spg.low`, 2622.6 m for `spg.high` and 766.2 m for `mortar.single`.

**Engine C — the precomputed correction grid.** `data/ballistics/height-correction.json`, generated *from* Engine B (`generatedFrom: data/ballistics/projectile-model.json`). Per weapon and arc it holds a 40 × 33 grid over distance × ΔZ, with two payloads: `milCorrections` (the MIL to add to Engine A's answer) and `missMeters` (how far the uncorrected shot would miss). Bilinearly interpolated by `interpolateHeightCorrection` (`js/features/terrain-ballistics.js:1094`). Its axes:

| Weapon | Arc | Distance axis | ΔZ axis |
|---|---|---|---|
| `mortar` | `single` | 80 → 697 m | −800 → +800 m |
| `spg` | `low` | 1181 → 2611.5 m | −800 → +800 m |
| `spg` | `high` | 735 → 2621.3 m | −800 → +800 m |

`bracket` (`:1056`) returns `null` outside an axis, so anything off the grid is classified `unreachable` — which is what the "cannot reach this target" caption reports, whether the real cause is unreachability, a distance past the grid's end, or a ΔZ past ±800 m.

### Duplicated physical constants

Gravity is 9.81 m/s² everywhere, defined six times under five names:

| Location | Name |
|---|---|
| `js/map/range-ring.js:23` | `RANGE_RING_GRAVITY` |
| `js/map/cross-section.js:7` | `CROSS_SECTION_GRAVITY` |
| `js/features/flight-time.js:35` | `FLIGHT_TIME_GRAVITY` |
| `js/map/dead-ground.js:37,39,49` | *(reuses `RANGE_RING_GRAVITY` — the one file that does not redefine it)* |
| `scripts/lib/ballistics.mjs:15` | `GRAVITY` (build-time; the fit and the correction grid are generated with this one) |
| `data/ballistics/projectile-model.json:6` | `"gravity": 9.81` — shipped as data and **never read by any runtime code** |

The JSON field is the trap: it looks like the authority, it is regenerated with the model, and changing it changes nothing at runtime.

Metres per game unit is defined twice with different semantics:

- `METRES_PER_GAME_UNIT_RING = 100`, hardcoded in `js/map/range-ring.js:24` and used there, in `js/map/dead-ground.js:194,197` and in `js/features/reach-badges.js:75`.
- `getCoordinateMetersPerUnit()` (`js/map/maps.js:12`), which reads per-map `coordinateMetersPerUnit` and **defaults to 1000** when absent. `worldDistanceToMeters` / `metersToWorldDistance` are built on it, and those are what the results panel, the mil-cursor and the saved-target cards use for distance.

Both shipping maps set `coordinateMetersPerUnit: 100` (`maps/bakurani.json:240`, `maps/ozeti.json:232`), so the two agree today — and the heightfield's own `spacingMeters: 32` against `stepGameUnits: 0.32` confirms 100 as well. On any map without the field the two differ by a factor of ten. The hardcoded users are all gated behind `mapHasHeightfield`, which limits but does not eliminate the exposure: `drawDeadGround` and the reach badges would silently mis-scale on a terrain-bearing map that forgot the field.

Other constants worth knowing when reading the rest: `RANGE_RING_BEARINGS = 360`, `RANGE_RING_MARCH_METRES = 25`, `RANGE_RING_BISECTIONS = 14`, `RANGE_RING_MEMO_METRES = 8` (`js/map/range-ring.js:20-33`); `CROSS_SECTION_SAMPLES = 192` plus `CROSS_SECTION_MARGIN_SAMPLES = 10` at each end (`js/map/cross-section.js:1-5`); `DEAD_GROUND_CLEARANCE_METRES = 0` (`js/map/dead-ground.js:1`); `releasePolicy.suppressionMissMeters = 10` in `data/ballistics/terrain-context.json`.

### The weapon envelope

`data/weapons.json` carries four gating numbers per weapon, and different surfaces respect different subsets of them.

| Weapon | `minRangeKm` | `maxRangeKm` | `minElevationMil` | `maxElevationMil` | table coverage |
|---|---|---|---|---|---|
| `mortar` | 0.132 | 0.684 | 150 | 850 | `single` 80–697 m, 950 → 120 mil |
| `spg` | 0.78 | 2.629 | 20 | 1390 | `low` 1181–2629 m (20 → 600 mil), `high` 735–2629 m (1400 → 610 mil) |

Two data facts matter downstream. The **SPG low table starts at 1181 m**, four hundred metres inside the declared 780 m minimum range, so between 780 m and 1181 m the weapon is "in range" with no low-arc row. And **both SPG tables end at 2629 m**, past both fitted vacuum ceilings (2612.8 m low, 2622.6 m high) and past both correction-grid distance axes.

---

## 3. The surfaces

Twenty surfaces consume or display height. Each entry answers the same six questions: what it shows, which height source it reads, which ballistic engine it uses, which constants, how it decides "reachable", and what it does before terrain has loaded.

### 3.1 Results panel — distance, bearing, ΔX/ΔY

`firingGeometry` (`js/features/results.js:127`) and the `dist`/`distm`/`dx`/`dy`/`angle` writes at `:440-545`.

Plan-view geometry only: `Math.hypot` on the game-coordinate delta, then `worldDistanceToMeters`. **No height source, no ballistic engine.** The distance the whole panel is built on is a horizontal distance; slant range is never computed anywhere in the app. On a 900 m shot with 200 m of ΔZ the true slant range is 22 m longer than the number displayed, and every engine below takes the horizontal figure as its `rangeMeters`. Consistent, but consistently the wrong quantity if anyone ever wants a slant range. Nothing changes when terrain is missing.

### 3.2 Results panel — the MIL card

`renderElevationResult` (`js/features/results.js:355`) → `solveFiringElevation` (`:170`), which is a three-stage pipeline.

1. **Engine A** — `getWeaponElevationSolutions(weapon, distanceMeters)`. Gates on `minRange`/`maxRange` and returns `null` for any arc whose table does not cover the distance.
2. **Engine C** — `resolveElevationSolutions` (`js/features/results.js:71`) calls `getTerrainBallisticSolutions`, which samples the **2 m Terrain3D chunks**, computes ΔZ, and adds the interpolated MIL correction per arc (see 3.7).
3. **Engine B** — `extendModelledSolutions` (`:20`), but **only when all three arcs came back null**. It samples ΔZ from the **32 m heightfield** via `terrainDeltaZMeters` (`js/map/range-ring.js:239`), solves `modelledElevationSolution` (`:206`) per arc, and marks the result `modelled: true` so the panel prefixes it with `≈` and appends `milModelled` ("modelled, beyond the firing table").

Reachability: stage 1 is a pure flat-range gate on `minRange`/`maxRange` — no terrain, no elevation limits. Stage 3 is the **only place in the entire app that checks `minElevationMil` and `maxElevationMil`**, via `modelArcElevationFits` (`js/map/range-ring.js:195`); a modelled solution outside the envelope is dropped and the arc stays null. Because stage 3 only fires when stage 1 produced nothing, the elevation envelope is enforced exclusively *outside* the firing table and never inside it.

Terrain not loaded: stage 2 returns the uncorrected solutions with `pendingTerrain: true`; stage 3's `terrainDeltaZMeters` returns `null` and `deltaZ` silently becomes `0` (`:41`), so a modelled MIL computed before the heightfield lands is a flat-ground answer that changes on a later frame with no visible cue. Note that nothing in this path calls `ensureHeightfieldLoaded` — the load is triggered as a side effect of drawing a gun's range ring or opening the cross-section.

### 3.3 Results panel — the range readout and `rangeStatus`

`result()` (`js/features/results.js:560-600`). The `range` field prints `minRange`–`maxRange` straight from `data/weapons.json`. `rangeStatus` prints `inRange` (green), `inRangeModelled` (amber) or `outRange` (red) purely from whether `solveFiringElevation` produced any arc.

**No height source, no terrain.** This is the flat-range verdict, and it is the one mirrored into OBS. Its `outRange` and the reach badge's `out` are computed from entirely different predicates (3.13).

### 3.4 Results panel — the terrain note

`renderTerrainNote` (`js/features/results.js:246`) rendering `formatTerrainBallisticsStatus` (`js/features/terrain-ballistics.js:383`).

Reads the **2 m chunks** through the meta object. Prints ΔZ to one decimal and one of three warnings: `terrainLoading`, `terrainStatusUnreachable` ("ΔZ x m · {arcs} cannot reach this target"), `terrainStatusUnreachableAll`, or `terrainStatus` ("not corrected for height"). When nothing is wrong it returns an empty string and the note is hidden.

Its notion of "cannot reach" is **Engine C's grid bracket**, not a trajectory test: `classifyArc` (`js/features/terrain-ballistics.js:1190`) labels an arc `unreachable` whenever `interpolateHeightCorrection` returns null, which happens for a target above the arc's apex, a distance off the grid's axis, a ΔZ beyond ±800 m, or a `null` cell. All four print the same sentence.

Before the chunks land it prints `terrainLoading`. Its UI strings are hardcoded in `UI_TEXT` inside `js/features/terrain-ballistics.js:48` rather than in `locales/*.json`, so this is the one user-facing caption in the height stack that does not live with the other translations.

### 3.5 Results panel — the flight-time badges

`renderFlightTime` (`js/features/results.js:298`) → `flightTimeBadges` (`js/features/flight-time.js`).

**Engine B**, from the MIL currently on screen rather than from the distance: `theta = angleOffsetDeg + anglePerMilDeg × mil`, then `t = (v sin θ + sqrt((v sin θ)² − 2 g dz)) / g` with `FLIGHT_TIME_GRAVITY = 9.81`. ΔZ comes from `Number(terrainMeta?.deltaZ) || 0` (`js/features/results.js:311`) — the **2 m chunks**, or zero when the meta is absent.

Reachability: none of its own. It renders a badge for every arc the panel is showing, and returns an empty list (hiding the whole row) if any arc's computation fails. It respects no elevation or range limit, but since it is driven by the panel's own solutions it inherits whatever gating those had.

Terrain not loaded: ΔZ falls to 0 and the seconds are the flat-ground figure, with no marker distinguishing it from a terrain-aware one. The `≈` prefix is unconditional.

### 3.6 Saved-target cards

`getSavedTargetFiringInfo` (`js/features/results.js:785`) / `getSavedTargetElevationSummary` (`:655`).

A near-duplicate of 3.2: Engine A, then Engine C via `getTerrainBallisticSolutions`, then Engine B via `extendModelledSolutions`. Two deliberate differences: it uses each target's own saved artillery position when one exists (`getSavedTargetEffectiveOrigin`, `:629`), and it renders no terrain note, so an arc the main panel would caption as unreachable prints a bare MIL on the card. `out-of-range` styling comes from the same flat `solved` boolean as `rangeStatus`.

### 3.7 `getTerrainBallisticSolutions` — the ΔZ correction

`js/features/terrain-ballistics.js:1237`.

Samples the **2 m chunks** at origin and target with `terrainHeightAtPointSync`, both located through `locateTerrainPoint` (`:760`) using `globalQuadOffsetX/Y`, `gameUnitsToLandscapeQuadsX/Y` (50 and **−50** — the Y axis is mirrored) and `chunkQuads: 510`. ΔZ is `targetZ − originZ`.

For each of `single`, `low`, `high` it calls `classifyArc` (`:1190`), which asks Engine C for both `missMeters` and `milCorrections` at (distance, ΔZ) and returns one of four outcomes: `corrected`, `negligible` (|miss| < `suppressionMissMeters` = 10 m), `unreachable` (either grid lookup returned null), or `nogrid`. The correction is applied only if the outcome is `corrected` **and** `allowed` (`:1308`) — that is, `releasePolicy.automaticMilCorrection` is true **and** the map is in `correctedMaps`. Today that means **Bakurani only**; Ozeti ships terrain, samples ΔZ, prints the caption and applies nothing.

Chunk loading is fire-and-forget: `primeTerrainForPoints` (`:898`) requests the two chunks the shot touches and schedules a re-render on arrival. Until both are cached, `terrainHeightAtPointSync` returns null and the function returns the uncorrected solutions with `pendingTerrain: true` and no `deltaZ` field at all — which is why flight time falls back to ΔZ 0 during that window. Outside `manifest.coverage` it returns the plain fallback with **no meta at all**, so no caption appears and the user cannot tell "off the terrain dataset" from "on flat ground".

### 3.8 `js/features/experimental-terrain-correction.js`

An opt-in monkey-patch, off by default (`experimentalCorrection.defaultEnabled: false`, persisted under `localStorage` key `wardogs-experimental-terrain-correction`).

`wrapResolver` (`:2253`) replaces `window.getTerrainBallisticSolutions` with a wrapper that calls the original, then — for the SPG only (`state.config.weaponId`, default `'spg'`) and only when the base meta carried a finite ΔZ — looks up three separately certified payloads (`low-main.json` for distances ≤ 2439 m, `low-tail-apex.json` beyond it, `high-v2.json` for the high arc) keyed on distance, the **flat-table MIL**, and the base ΔZ. `applySafeCandidates` (`:2056`) overwrites `mil`, `minMil` and `maxMil` with the candidate's `commandMrad` for any arc whose status is `SAFE_CONSENSUS`; anything else falls back to the table.

It therefore **overrides Engine C's output**, reads no terrain of its own (it consumes the base resolver's ΔZ, so the 2 m chunks), and consumes no `minElevationMil`/`maxElevationMil`. `installFormatter` (`:2381`) also wraps the caption formatter. When the payloads have not loaded it returns the base result with `ready: false` and an `experimentalTerrainCorrection` meta block. Every downstream surface — the ring, the wedges, the badges, the cross-section — is blind to it: turning the toggle on changes the MIL and nothing else on the screen.

### 3.9 Range ring — the max-range outline

`terrainRangeRing` (`js/map/range-ring.js:445`), drawn by `drawGunRangeRings` (`js/map/guns-overlay.js:119`).

Reads the **32 m heightfield** through `rangeRingSample`. Uses **Engine B**, but only `modelMaxRange` — the optimal-angle vacuum ceiling — with `weaponMuzzleVelocity` (`:78`), which takes the **largest** muzzle velocity across the weapon's arcs (160.4 for the SPG, i.e. the high arc's fit).

Each of 360 bearings is a fixed-point solve: march outward in 25 m steps while `metres <= declaredMax + (modelMaxRange(v, z − zGun) − levelMax)` (`:528`), then 14 bisections. The result is always the **declared** max range plus a terrain *difference*, so at ΔZ 0 the ring is exactly the flat circle. `marchLimit` is bounded by the map's own `minZMeters`.

Reachability predicate: max range only. It respects **neither** `minElevationMil` nor `maxElevationMil` — the ceiling it uses is the 45°-ish optimal launch angle, achievable for both weapons but never checked. It has no line-of-sight term, no arc selection, and does not know the firing table exists.

Not loaded: `cachedHeightfield` returns null, `terrainRangeRing` returns null, and `drawGunRangeRings` falls back to `ctx.arc` at the declared radius. Results are memoised per 8 m of gun travel (`RANGE_RING_MEMO_METRES`), capped at 256 entries.

The drawn ring is **clamped** to `ring.maxRangeMeters` (the declared max) in the solid outline; the true terrain reach beyond it is drawn only as a faint tinted band (`js/map/guns-overlay.js:165-183`), explicitly "context, never a number to fire on".

### 3.10 Range ring — the minimum-range outline

`minRangeRadii` (`js/map/range-ring.js:333`).

Same heightfield, same march. Engine B via `modelRangeAtAngle` (`js/map/range-ring.js:311`) at the steepest **achievable** elevation: `maxElevationArc` (`js/map/range-ring.js:280`) picks `high ?? single ?? low` and `maxElevationAngle` (`:290`) converts `maxElevationMil` through that arc's `angleOffsetDeg`/`anglePerMilDeg`, rejecting anything not strictly between 0° and 90°.

This is the **only ring-side use of an elevation limit**, and it uses only the maximum. For the SPG it evaluates the high fit at 1390 mil = 81.22°, giving a level minimum of 791.3 m against the declared 780 m; as with the max ring the radius drawn is `declaredMin + (modelled − levelMin)`, so ΔZ 0 lands exactly on 780 m. Downhill ground pushes the minimum outward (795 m at ΔZ −100, 810 m at ΔZ −200), uphill pulls it in (764 m at ΔZ +100).

If the arc's steep angle does not land in (0°, 90°) the whole minimum ring is abandoned (`return null`) and callers fall back to `ring.minRangeMeters`. For the SPG's **low** arc that angle would be 93.37° — the same arithmetic that breaks the cross-section in Disagreement A — but `maxElevationArc` prefers `high`, so the ring is saved by arc-selection order rather than by a check.

### 3.11 `modelledElevationSolution` — the out-of-table MIL

`js/map/range-ring.js:206`, called only from `extendModelledSolutions`.

**32 m heightfield** ΔZ via `terrainDeltaZMeters` (`:239`), Engine B via `modelArcLaunchTan` → `modelArcMil` → `modelArcElevationFits`. It is the one code path that enforces both elevation limits, and it produces the `≈` MIL and the amber `In range (modelled)` status. Because it uses the heightfield rather than the chunks, the ΔZ behind a modelled MIL is a *different number* from the ΔZ printed in the caption directly above it.

### 3.12 Dead ground

`terrainDeadGround` (`js/map/dead-ground.js:144`), drawn by `drawDeadGround` from `js/map/renderer.js:199`. The layer defaults to **off** (`js/map/map-tools.js:80`).

Reads the **32 m heightfield** along each of the ring's 360 bearings in 25 m steps out to that bearing's ring radius, recording (range, ΔZ) pairs. `deadGroundBearingIntervals` (`:60`) walks outward maintaining, per arc, the steepest grazing tangent required so far (`deadGroundGrazingTan` with `DEAD_GROUND_CLEARANCE_METRES = 0`), and marks a sample dead when no arc's `deadGroundLaunchTan` still clears it.

Engine B, but through a **local copy of the solver**: `deadGroundLaunchTan` (`js/map/dead-ground.js:28`) reimplements the low root of `modelArcLaunchTan` rather than calling it, sharing only `RANGE_RING_GRAVITY`. Two divergences follow from `deadGroundArcs` (`:6`), which keeps only arcs with `branch === 'low'`:

- For the **SPG**, only `spg.low` is considered — the flattest trajectory, so wedges are drawn for ground the high arc could clear.
- For the **mortar**, whose only arc has `branch: "high"`, `deadGroundArcs` returns `null` and **no dead ground is ever computed or drawn**. The layer is silently empty for that weapon.

Reachability: the inner edge is `ring.minRadii[b]` (or `minRangeMeters`), the outer edge is `ring.radii[b]`. No elevation limits, no firing-table check. Not loaded: returns null (no wedges) and the layer draws nothing.

### 3.13 Reach badges

`reachClassify` (`js/features/reach-badges.js:57`), one badge per saved target summarising every placed gun.

Reads no terrain directly; it consumes the **ring** and the **dead-ground wedges**, both heightfield-derived, through `RANGE_RING_CACHE` and `DEAD_GROUND_CACHE`. Its predicate, in order:

1. no ring yet → `pending`
2. `metres > ring.radii[bearing]` → `out`
3. `metres < ring.minRadii[bearing] ?? ring.minRangeMeters` → `close`
4. no dead-ground solution → `reachable`
5. inside a wedge interval → `masked`, else `reachable`

Bearing is quantised to one of 360 buckets by `reachBearingIndex` (`js/features/reach-badges.js:36`) and distance is `Math.hypot(dx, dy) * METRES_PER_GAME_UNIT_RING` — the hardcoded 100, not `worldDistanceToMeters`. No elevation limits, no firing table, no arc. Because step 5 uses the low-arc-only wedges, a target the SPG could hit with its high arc can be badged `masked`, and for the mortar step 4 always short-circuits so `masked` is unreachable.

Not loaded: `reachSolvedGuns` (`:376`) returns an empty list on a map without a heightfield and no badge is rendered at all; while solving, guns appear as `pending` and the summary shows `·`. `reachSolveGun` (`js/features/reach-badges.js:126`) permanently adds a gun's key to `REACH_UNAVAILABLE` if the heightfield and the model are both present but the ring still did not solve, dropping that gun from every future summary.

### 3.14 Cross-section panel

`js/map/cross-section.js`, rendered from `renderElevationResult` (`js/features/results.js:425`). Layer defaults to **on**; the panel exists only on the desktop page (`src/pages/index.html:336`) — the mobile page has no `crossSection` element, so `renderCrossSection` returns immediately there.

Reads the **32 m heightfield** through `rangeRingSample`, sampling 192 points gun→target plus 10 margin samples at each end (`crossSectionProfile`, `js/map/cross-section.js:30`). ΔZ is the profile's own endpoints, `ground[targetIndex] − ground[gunIndex]`.

Engine B for the launch angle (`modelArcLaunchTan`), then its **own** trajectory integrator: `crossSectionShellHeight` (`:106`) marches the vacuum parabola with `CROSS_SECTION_GRAVITY` and flags the first sample where the shell drops below the ground. It runs **every** arc the model has — `low`, `high`, `single` — regardless of what the firing table covers.

Reachability, `crossSectionShot` (`:186`): `reaches` starts as "the model found a launch tangent". If it did not, the tangent falls back to the 45°-equivalent `crossSectionMaxRangeTan` (`js/map/cross-section.js:94`). Then `crossSectionElevationLimits` (`:66`) clamps the tangent to the elevation envelope — **when it produces a limits object at all**; see Disagreement A. Outcome is one of `hit` (green), `blocked`, `short`, or `over`, each with its own caption (`:346`).

It consults **neither `minRange` nor `maxRange`**. It has no knowledge of the flat table, so it draws arcs the results panel refuses to print and vice versa.

Not loaded: `crossSectionModel` (`:286`) calls `ensureHeightfieldLoaded` itself and returns `reason: 'loading'` → "Loading terrain…" while the fetch is in flight, or `'terrain'` → "No terrain profile for this map" on an unsupported map. The cache key (`crossSectionKey`, `:781`) includes whether the heightfield is resident, so the panel redraws when it arrives.

### 3.15 Time of flight

`js/features/flight-time.js`. Covered at 3.5 from the panel's side. Worth recording separately: `flightTimeSeconds` (`js/features/flight-time.js:109`) exists as a checkable entry point that takes the MIL from **Engine A** for a distance, while the panel uses `flightTimeSecondsForMil` on whatever MIL is displayed — so the tested path and the rendered path can diverge once a correction has moved the MIL. The whole file is `≈`-prefixed and `docs/todo.md` records that no flight time has ever been timed in game.

### 3.16 Mil-cursor hover readout

`js/features/mil-cursor.js`, layer default **off** (`js/map/map-tools.js:83`).

Calls the same `solveFiringElevation` as the results panel (`:277`) with `prime = false`, so it reuses whatever chunks are already cached and **never triggers a chunk fetch** — the point under the cursor gets a corrected MIL only if the two chunks it needs happen to be resident from a previous solve. It also calls `firingGeometry` for the range and bearing, and reuses `formatMilValue`, so a modelled hover value carries the same `≈`.

It renders `noFiringSolution` when nothing solved, and shows no terrain note, no ΔZ, and no "cannot reach" caption. During a fast drag across the map it is therefore the surface most likely to be showing uncorrected values without saying so.

### 3.17 `js/map/heightfield.js`

The 32 m loader itself. `ensureHeightfieldLoaded` is fire-and-forget and calls `draw()` on arrival; `cachedHeightfield` returns null for both "not started" and "in flight", which is how every consumer above spells "not ready". A fetch failure caches `null` permanently, so the app degrades to flat circles for the session with a single console warning. `HEIGHTFIELD_MAP_IDS` is a hardcoded allowlist.

### 3.18 `js/map/contours.js`

Display only. Opt-in layer, per-map `contours.json`, rasterised offscreen and redrawn on zoom/pan. Colour is hypsometric over the map's own relief; no labels, by design, because of the datum. It reads no ballistics and nothing reads it.

### 3.19 The gun-overlay ring rendering

`drawGunRangeRings` (`js/map/guns-overlay.js:119`) is a distinct surface from 3.9 because it decides what the user *sees* of the ring: the solid outline is clamped to the declared max range, the terrain surplus is a faint band, and the minimum ring is drawn from `ring.minRadii` when present and a plain circle otherwise. A user reading the solid ring is reading `data/weapons.json`; a user reading the faint band is reading the heightfield and Engine B.

### 3.20 OBS overlay

`obsRenderReadout` (`js/features/obs.js:264`) mirrors the DOM: `mil`, `milAlt`, `angle`, `distm`, `rangeStatus`, and the flight-time badges. `src/pages/obs/overlay.html` has **no terrain note element**, so the "not corrected for height" and "cannot reach this target" captions never reach a stream. The overlay shows the corrected MIL with none of the warnings attached to it.


---

## 4. Disagreements

Each entry names the surfaces that differ, the mechanism with file and line, a concrete input, and what each surface reports for that input. The first two were flagged before this audit and are verified here; the rest follow the same format.

### A. `crossSectionElevationLimits` discards valid limits for the SPG low arc — confirmed

**Surfaces:** the cross-section caption against every other statement about the SPG's low arc, and against the mortar, for which the same code path works.

**Mechanism.** `crossSectionElevationLimits` (`js/map/cross-section.js:66`) converts both elevation stops through the arc's own fit and then rejects the whole object if either end is unusable:

```js
const shallow = offset + perMil * minMil;
const steep   = offset + perMil * maxMil;

if (!(shallow > 0) || !(steep < 90) || shallow >= steep) {
    return null;                                   // :84-86
}
```

For `spg.low` the arithmetic is `steep = 12.75 + 0.058 × 1390 = 93.37°`, so the guard fires and `null` is returned — **including the perfectly valid `shallow` of 13.91°**, whose tangent 0.2477 is the low arc's real minimum-elevation stop. The 93.37° is itself an artefact: the fit's `anglePerMilDeg` is a straight line extrapolated to an elevation the gun reaches only on the high arc, so the low arc's *nominal* maximum is nonsense while its minimum is sound. The guard cannot tell them apart and throws both away.

The consequences cascade through `crossSectionShot`:

- With `limits === null`, both clamp branches at `js/map/cross-section.js:218-226` are dead code for that arc. `clampedTo` can never become `'min'` or `'max'`.
- The refinement clamp at `:237-242` is likewise skipped.
- `crossSectionShotCaption` (`:346`) reaches `shot.clampedTo === 'min'` at `:360` only when the clamp fired, so the string `crossSectionOver` — "overshoots, inside the minimum range" (`locales/en.json:148`) — is **unreachable for the SPG low arc**; the reader gets `crossSectionPasses` ("passes over the target and lands beyond it", `:149`) instead.

**Concrete input.** SPG, any distance, any ΔZ: the limits object is null unconditionally, so this is not a corner case but the arc's permanent state. Contrast the mortar, whose stops are 58.125° and 84.375° — both pass the guard, both clamps are live, and `crossSectionOver` does render for that weapon (a mortar shot at 690 m needs tan 1.593 against a `minTan` of 1.608, so it clamps to `'min'`).

**What each surface reports.** Only the cross-section is affected, which is precisely why it matters: it is the surface that draws the answer rather than printing it, and it draws the SPG low arc with no elevation envelope at all.

**Secondary finding in the same caption.** When the mortar *does* clamp to `'min'`, the string it selects is wrong in the other direction. At 690 m the mortar is past its declared 684 m maximum, and the clamp is to the shallowest permitted elevation, so the shell overshoots because the gun cannot fire *flat enough* — a max-range overshoot. The caption says "inside the minimum range". The clamp condition (`tan < minTan`) and the caption text encode opposite physical situations.

### B. The cross-section draws confident hits for shots below the gun's minimum elevation — confirmed

**Surfaces:** the cross-section against the results-panel MIL, the mil-cursor, the flight-time row, the range ring, the reach badges and dead ground.

**Mechanism.** Following from A, `crossSectionShot` (`js/map/cross-section.js:186`) sets `reaches = reachTan !== null` at `:207` — the only question it asks is whether the vacuum quadratic has a root. It never converts that tangent back to mil, never calls `modelArcMil`, and (for the SPG low arc) has no limits object to clamp against. If the march then finds no ground intersection before the target, `kind` stays `'hit'` and `drawCrossSectionShots` (`:569`) strokes it in `rgba(130,197,150,.95)` — the same green as a legitimate hit — with no caption at all, because `crossSectionShotCaption` returns `null` for `hit`.

**Concrete input.** SPG-2 on Bakurani, horizontal range **917 m**, ΔZ 0.

Running the fit (v = 160.1 m/s, offset 12.75°, 0.058 °/mil, g = 9.81) the low arc needs a launch tangent of 0.1812, i.e. 10.27°, i.e. **−42.7 mil** against a `minElevationMil` of 20. Across the ΔZ values a real 917 m shot might see:

| ΔZ | required launch angle | implied mil |
|---|---|---|
| −30 m | 8.4° | −76.1 |
| −20 m | 9.0° | −65.0 |
| −10 m | 9.6° | −53.8 |
| 0 m | 10.27° | −42.7 |
| +50 m | 13.50° | +13.0 |
| +100 m | 16.72° | +68.4 |

The low arc does not clear 20 mil on level ground until roughly **1220 m** (15.9 mil at 1200 m, 26.6 mil at 1250 m). Below ΔZ ≈ −130 m the quadratic's discriminant finally goes negative and `reachTan` becomes null, at which point the surface switches to `crossSectionMaxRangeTan` and reports `short` — so the *more* impossible the shot, the more honest the panel gets.

**What each surface reports for SPG @ 917 m, ΔZ 0:**

| Surface | Report |
|---|---|
| Cross-section | **Two green arcs.** The low arc is drawn as a clean hit at 10.27° with no caption; the high arc is drawn as a clean hit at 79.77°. |
| Results MIL card | **`1359`, labelled "High arc".** `getWeaponElevationSolutions` finds no low-arc row — the SPG low table starts at 1181 m — so `solutions.low` is null. `extendModelledSolutions` does not fire, because it only runs when *all three* arcs are null (`js/features/results.js:27-33`), and the high arc is populated. The low arc is simply absent. |
| Mil-cursor | Identical to the MIL card — same `solveFiringElevation` call — so one row, "Low arc" never appears. |
| Terrain note | **Hidden.** At ΔZ 0 the high arc's grid miss is ~0, so `classifyArc` returns `negligible`; the low arc is null and `classifyArc` returns `null` for it before the grid is consulted. No warning is produced about the arc the cross-section just drew. |
| Flight time | **One badge, `≈ 32 s`** (high arc, θ = 79.74°). The low arc's ≈ 6 s never appears, because the badge list is built from the panel's solutions, not the model's. |
| Range ring | **In range.** 917 m sits between the terrain-solved minimum (780 m at ΔZ 0) and maximum (2629 m). The ring knows nothing about arcs. |
| Reach badge | **`Reachable`** — `metres` is inside both radii and the low-arc dead-ground wedges do not cover level ground at that distance. |
| Dead ground | **No wedge.** The layer evaluates only `spg.low` (`js/map/dead-ground.js:18`) and finds its launch tangent clears the flat profile — the same sub-minimum-elevation trajectory the cross-section drew, used here as evidence that the ground is *not* dead. |
| `rangeStatus` | **"In range"**, green, from the flat 780–2629 m gate. |

So five surfaces agree the shot is fine, one surface draws a trajectory the gun physically cannot fire, and one surface (the MIL card) quietly declines to offer that arc without saying why. Nothing on the screen tells the user that the green low arc has no MIL.

### C. Two different ΔZ values feed the same panel

**Surfaces:** the terrain note and the flight-time badges (2 m chunks) against the cross-section, the modelled MIL, the rings, the wedges and the badges (32 m heightfield).

**Mechanism.** `getTerrainBallisticSolutions` samples `terrainHeightAtPointSync` on the streamed 2 m chunks (`js/features/terrain-ballistics.js:1281-1286`) and puts the result on `meta.deltaZ`, which `renderFlightTime` reads at `js/features/results.js:311` and the caption prints at `js/features/terrain-ballistics.js:398`. Meanwhile `terrainDeltaZMeters` (`js/map/range-ring.js:239`) and `crossSectionProfile` (`js/map/cross-section.js:30`) both sample the 32 m grid through `rangeRingSample`, and everything ring-shaped does the same.

**Concrete input.** Any gun or target on steep ground. `docs/terrain.md` records the 32 m grid as reproducing the ring to 0.7 m median error, but the comment at `js/map/range-ring.js:26-33` records the other tail: on steep ground two points inside one 32 m cell differ by about 20 m of height. The bilinear read of a 32 m cell and the bilinear read of a 2 m cell at the same coordinate are simply different numbers on a ridge or a cliff edge.

**What each reports.** The caption might read "ΔZ +18.4 m" (chunks) while the cross-section immediately below it draws a profile whose endpoints differ by, say, 26 m (grid), and solves its arcs against that second figure. Both are labelled as the same shot. No surface displays the grid ΔZ numerically, which is what makes the divergence invisible rather than merely confusing.

### D. The flat range gate and the terrain-solved rings disagree about the same target

**Surfaces:** `rangeStatus` and the MIL card (`data/weapons.json` `minRange`/`maxRange`) against the range ring, the reach badges and dead ground (terrain-solved radii).

**Mechanism.** `getWeaponElevationSolutions` (`js/features/weapons.js:203`) gates on the declared kilometre figures with no height term. `terrainRangeRing` (`js/map/range-ring.js:445`) solves `declaredMax + (modelMaxRange(v, z − zGun) − levelMax)` per bearing, and `minRangeRadii` (`:333`) solves the equivalent for the minimum. The two only coincide at ΔZ 0.

**Concrete inputs and reports (SPG, `levelMax` = 2622.6 m, `levelMin` = 791.3 m):**

| Case | Ring / badges say | Results panel and OBS say |
|---|---|---|
| Target 2700 m away, 100 m below the gun (ΔZ −100) | Ring radius on that bearing ≈ 2727 m, so **inside**; badge `Reachable` | `2700 > 2629` → no table row → `extendModelledSolutions` fires, Engine B finds a solution at ΔZ −100, and the panel prints `≈` MIL with **"In range (modelled)"** in amber. These two happen to agree — but only because stage 3 exists. |
| Target 2600 m away, 200 m above the gun (ΔZ +200) | Ring radius ≈ 2421 m, so **outside**; badge `Out of range` | Table covers 2600 m → a MIL is printed, `rangeStatus` reads **"In range"** in green. The correction grid adds its ΔZ term, so the MIL even looks terrain-aware. |
| Target 800 m away, 200 m below the gun (ΔZ −200) | `minRadii` ≈ 810 m, so 800 m is **inside the minimum**; badge `Too close — inside minimum range` | `800 > 780` → in range; the high table covers it; a MIL is printed and `rangeStatus` reads **"In range"**. |
| Target 800 m away, 100 m above the gun (ΔZ +100) | `minRadii` ≈ 764 m, so **outside the minimum**; badge `Reachable` | Same as above — "In range". Agreement by coincidence. |

The second row is the dangerous direction: the panel hands the user a MIL for a shot the app's own ring has already drawn as unreachable, and the OBS overlay mirrors the MIL without the ring.

### E. The firing tables outrun both the fitted model and the correction grid

**Surfaces:** the MIL card and `rangeStatus` against the terrain note and the cross-section.

**Mechanism.** Three ceilings, all different: the table ends at 2629 m for both SPG arcs; Engine B's vacuum ceiling is 2612.8 m (low) and 2622.6 m (high); Engine C's distance axes end at 2611.5 m (low) and 2621.3 m (high). `bracket` (`js/features/terrain-ballistics.js:1056`) returns null past its axis, `classifyArc` turns that into `unreachable`, and `modelArcLaunchTan` returns null past the vacuum ceiling.

**Concrete input.** SPG at **2620 m**, ΔZ 0, on Bakurani.

| Surface | Report |
|---|---|
| MIL card | Both arcs printed from the table — the low arc claims a solution 7 m past its own model's ceiling. |
| Terrain note | **"ΔZ +0.0 m · low arc cannot reach this target"** — the low arc is off the correction grid's axis (which ends at 2611.5 m), so it is classified `unreachable`, on level ground, at a range the table covers. |
| Cross-section | Low arc: `modelArcLaunchTan` returns null, `reaches` is false, the fallback 45° tangent lands around 2613 m, so it draws **`falls short at 2613 m, 7 m short`** in red. High arc: solves normally, green hit. |
| Range ring | In range — the ring's own ceiling is the declared 2629 m at ΔZ 0. |
| Reach badge | `Reachable`. |

At **2626 m** the high arc joins it: past 2622.6 m `modelArcLaunchTan` fails for both arcs, so the cross-section draws two red short arcs while the panel prints two MILs and the ring calls it in range. `docs/todo.md` already records this as "The SPG tables outrun their own fitted model"; what the audit adds is that four surfaces narrate it four different ways.

### F. Dead ground is computed from an arc the weapon may not be able to fire, and not at all for the mortar

**Surfaces:** the dead-ground layer and the reach badges' `masked` state against the MIL card.

**Mechanism.** `deadGroundArcs` (`js/map/dead-ground.js:6`) keeps only fits with `branch === 'low'`:

```js
if (!Number.isFinite(v) || v <= 0 || arc.branch !== 'low') {
    continue;                                      // :18
}
```

For the SPG that leaves `spg.low` alone, so masking is judged by the flattest trajectory available. For the mortar, whose single arc is `branch: "high"`, the function returns `null`, `terrainDeadGround` bails at `:154`, and the layer draws nothing — silently, with the toggle still available in the Layers popover.

**Concrete inputs.**

- *SPG, target at 1500 m behind a ridge that the low arc grazes but the high arc clears by 200 m.* Dead ground: **wedge drawn**, target inside it. Reach badge: **`Masked by terrain`**. MIL card: prints both arcs, no warning; the high arc it recommends flies straight over the ridge. The badge tells the user no gun can hit a target that both of the gun's arcs can reach.
- *SPG, target at 900 m in a hollow.* Dead ground evaluates `spg.low` at a range where the low arc needs negative elevation (Disagreement B), so its verdict is computed from an unfireable trajectory in either direction.
- *Mortar, target behind any crest.* Dead ground: **nothing drawn, ever**. Reach badge: `Reachable` at step 4 of `reachClassify`, because `solved.dead` is null. The layer looks like it is working and reporting "no dead ground here".

### G. `masked` and `Out of range` are unreachable or wrong for weapons with the "wrong" arc shape

A generalisation of F worth stating on its own, because it is a property of the badge vocabulary rather than of one weapon. `reachClassify` (`js/features/reach-badges.js:57`) has five states, and which of them a weapon can produce depends on data in `projectile-model.json` that has nothing to do with reachability:

- `masked` requires `deadGroundArcs` to return a non-null list, i.e. at least one `branch: "low"` fit. Mortar: never.
- `close` requires `minRadii`, which requires `maxElevationArc`'s steep angle to land in (0°, 90°). It does for both shipping weapons, but for a hypothetical weapon whose only arc is the SPG-low-shaped one it would not, and the minimum ring would silently revert to the declared circle.
- `out` and `close` both use radii solved from `weaponMuzzleVelocity`, the **largest** muzzle velocity across arcs (`js/map/range-ring.js:78`). For the SPG that is the high arc's 160.4 m/s, so the ring describes the high arc while the wedges inside it describe the low arc.

### H. The correction is applied on one map and only described on the other

**Surfaces:** the MIL card on Ozeti against the same card on Bakurani, and against the ΔZ caption on both.

**Mechanism.** `allowed` (`js/features/terrain-ballistics.js:1308`) requires `state.correctionEnabled && state.correctedMaps.has(terrain.mapId)`, and `releasePolicy.correctedMaps` lists `bakurani` only. Everything else — chunk streaming, ΔZ, arc classification, the caption — runs identically on both maps, as do the heightfield-driven ring, wedges, badges and cross-section, because those consult no allowlist beyond `HEIGHTFIELD_MAP_IDS`.

**Concrete input.** The same 2000 m shot with ΔZ +80, once on each map. On Bakurani the MIL is corrected and the caption is silent (the arc is `corrected`, not withheld). On Ozeti the MIL is the raw table value and the caption reads **"ΔZ +80.0 m · not corrected for height"** — while the cross-section beside it draws a fully terrain-solved trajectory for the same shot, and the range ring is terrain-solved too. The one number the user actually dials is the only one on the map that ignores the terrain.

### I. Loading windows produce transient disagreements with no visual cue

**Surfaces:** all of them, briefly, and the mil-cursor permanently.

**Mechanisms, in the order they resolve:**

- Before `projectile-model.json` lands, `PROJECTILE_MODEL` is null: rings are circles, wedges absent, cross-section says "No ballistics model for this weapon", flight-time row hidden. The MIL card is unaffected — Engine A needs none of it.
- Before `heightfield.bin` lands, `cachedHeightfield` returns null: rings are circles, `terrainDeltaZMeters` returns null and `extendModelledSolutions` **silently substitutes ΔZ 0** (`js/features/results.js:41`), so a modelled `≈` MIL printed in that window is a flat-ground answer that will change without warning. The cross-section is the only surface that says "Loading terrain…".
- Before the two Terrain3D chunks land, the caption says "terrain loading" and the MIL is uncorrected — but the cross-section, which uses the other dataset, may already be drawing terrain-aware arcs.
- The mil-cursor calls `solveFiringElevation` with `prime = false` (`js/features/mil-cursor.js:214`), so it **never requests a chunk**. Hovering over a part of the map whose chunks are not cached gives an uncorrected MIL indefinitely, with no caption, and the same hover after the main panel has solved a shot there gives a different number.

### J. Out-of-bounds behaviour differs between the two datasets

**Surfaces:** the ring, wedges and cross-section against the MIL card and caption, for anything near or past the map edge.

**Mechanism.** `rangeRingSample` (`js/map/range-ring.js:128`) deliberately clamps the sample point into the grid, treating terrain as continuing outward at the edge height, so the outline does not get chopped square along the map boundary. `locateTerrainPoint` (`js/features/terrain-ballistics.js:760`) returns null outside `manifest.coverage`, and `getTerrainBallisticSolutions` then returns the plain fallback with **no meta object at all**.

**Concrete input.** A target 200 m outside the playable bounds. Cross-section: draws a profile, with the last stretch flat at the edge height, and reports a hit or a block against ground that does not exist. Range ring: extends outward on that bearing using the same fictional ground. MIL card: raw flat-table value. Terrain note: **absent**, indistinguishable from "flat ground, nothing to warn about". Reach badge: computed from the fictional ground, so `Reachable` or `Out of range` on a bearing where no data exists.

### K. Distance scale is hardcoded in three files and configurable in a fourth

**Surfaces:** the reach badges and everything ring-shaped against the results panel, the mil-cursor and the saved-target cards.

**Mechanism.** `METRES_PER_GAME_UNIT_RING = 100` (`js/map/range-ring.js:24`), used verbatim in `js/map/dead-ground.js:194,197` and `js/features/reach-badges.js:75`, against `getCoordinateMetersPerUnit()` (`js/map/maps.js:12`), which reads per-map `coordinateMetersPerUnit` and **defaults to 1000**.

**Concrete input.** A terrain-bearing map whose `maps/<id>.json` omits `coordinateMetersPerUnit`. The results panel would report a 917 m shot as 9170 m and call it out of range, while the reach badge — computing 917 m — would call it reachable. Both shipping maps set the field, so this is latent rather than live; it is listed because the two definitions are 40 lines apart in files that call each other and only one of them is data-driven.

### L. The experimental correction moves the MIL and nothing else

**Surfaces:** the MIL card (and OBS, and the flight-time badges through it) against every geometric surface.

**Mechanism.** `applySafeCandidates` (`js/features/experimental-terrain-correction.js:2056`) rewrites `mil`, `minMil` and `maxMil` on the solutions object. The rings, wedges, badges and cross-section never see the solutions object; they re-derive everything from Engine B.

**Concrete input.** SPG on Bakurani with the toggle on, at a distance and ΔZ where a `SAFE_CONSENSUS` candidate differs from the table by, say, 40 mil. The MIL card shows the corrected value; the flight-time badge changes with it, because it is driven by the displayed MIL; the cross-section draws the *uncorrected* Engine B trajectory; the ring, wedges and badges are unchanged. Two trajectories for one shot, on one screen, one of them drawn.

---

## 5. What is a code bug and what is modelling uncertainty

`docs/todo.md` and `docs/terrain.md` already track which numbers have never been checked against the game. This section summarises which parts of the height and range stack rest on those unverified fits, so a reviewer can tell a wiring fault from an input the repository already flags as provisional.

**Never validated against the game — treat any numeric disagreement here as expected, not as a bug.**

- `data/ballistics/projectile-model.json` is a least-squares vacuum fit to the app's own firing tables, RMS 8.11–14.11 m, `source: "vacuum-fit"`. It has never been compared to a shot fired in game. Every ring radius, wedge, badge, trajectory and flight time in the app descends from it.
- The **branch assumption** — that the mortar and `spg.high` are the steep root and `spg.low` the shallow one — is a convention, not a measurement. `docs/todo.md` records that it swings the mortar's flight time from 4.8 s to 16.9 s at 400 m. It also decides which root `modelArcLaunchTan` takes, so it sets every launch angle the cross-section draws and every wedge dead-ground computes.
- The **fitted muzzle velocities** (86.7 / 160.1 / 160.4 m/s) carry a ±5% uncertainty that moves flight times by 2–4 s and moves the ring's terrain surplus proportionally.
- The **two different `anglePerMilDeg` slopes** for one weapon (0.048 high, 0.058 low) are, per `docs/todo.md`, the fit absorbing real drag. The 93.37° that breaks Disagreement A is a direct consequence: extrapolating the low arc's slope to 1390 mil is meaningless. **The guard reacting to it is a code bug; the 93.37° itself is a modelling artefact.**
- `data/ballistics/height-correction.json` is generated from the model, so it inherits all of the above and adds its own axis truncation (Disagreement E).
- **Time of flight has never been timed.** The whole badge row is derived, and printed with `≈`.
- **Vehicle attitude is not modelled at all.** Chassis tilt moves the impact independently of terrain ΔZ; the SPH-2 level warning is a caption, not a correction.

**Verified or grounded — a disagreement here is a wiring fault.**

- `data/weapons.json` ranges and firing tables (`docs/todo.md`, "Not on this list").
- Map bounds and `coordinateMetersPerUnit` per map.
- The terrain manifests carry `evidence: "VERIFIED"`, chunk seams agree to 0.21 m, and Bakurani's coordinate alignment was validated by visual overlay after the Y-flip fix in `5c462a173`. **Ozeti's alignment has never been validated**, which is the entire reason for `correctedMaps` and Disagreement H.
- The 32 m heightfield reproduces the ring to 0.7 m median error against the full 2 m data — so Disagreement C is a real but small numeric divergence in the median case, and a large one only on steep ground.

**Neither — code with no automated coverage.** `scripts/lib/ballistics.test.mjs` covers the solver and the fit at build time. `docs/todo.md` records that the runtime half has none: no browser test harness exists for `js/`, so `classifyArc`, the map allowlist, the caption selection, `crossSectionShot`, `reachClassify` and `deadGroundBearingIntervals` are all unexercised. Every disagreement in section 4 lives in that untested half.

---

## 6. Quick reference

Which height source and which engine each surface uses, and whether it honours the elevation envelope.

| # | Surface | Height source | Ballistic engine | Honours `min`/`maxElevationMil` |
|---|---|---|---|---|
| 3.1 | Distance / bearing | none | none | n/a |
| 3.2 | MIL card | 2 m chunks (correction) + 32 m grid (modelled) | A, then C, then B | only in the modelled fallback |
| 3.3 | `rangeStatus` / range readout | none | A | no |
| 3.4 | Terrain note | 2 m chunks | C | no |
| 3.5 | Flight-time badges | 2 m chunks | B | no |
| 3.6 | Saved-target cards | as 3.2 | A, C, B | only in the modelled fallback |
| 3.7 | ΔZ correction | 2 m chunks | C | no |
| 3.8 | Experimental correction | inherits 3.7's ΔZ | its own certified payloads | no |
| 3.9 | Max range ring | 32 m grid | B (`modelMaxRange`) | no |
| 3.10 | Min range ring | 32 m grid | B (`modelRangeAtAngle`) | max only |
| 3.11 | Modelled out-of-table MIL | 32 m grid | B | **yes, both** |
| 3.12 | Dead ground | 32 m grid | B (local copy of the solver) | no |
| 3.13 | Reach badges | via 3.9 / 3.12 | none of its own | no |
| 3.14 | Cross-section | 32 m grid | B + its own integrator | high arc and mortar only |
| 3.15 | Time of flight | caller's ΔZ | B | no |
| 3.16 | Mil-cursor | as 3.2, without chunk priming | A, C, B | only in the modelled fallback |
| 3.17 | `heightfield.js` | 32 m grid | none | n/a |
| 3.18 | `contours.js` | baked contours | none | n/a |
| 3.19 | Ring rendering | via 3.9 / 3.10 | none | no |
| 3.20 | OBS overlay | mirrors 3.2 | none | inherits |
