# Design — unified reachability: one source of truth for range, "can hit", and dead ground

Backing analysis: [../../height-audit.md](../../height-audit.md), whose Disagreements section (A–L) this design exists to close. Sibling designs: [2026-08-26-elevation-correction-design.md](2026-08-26-elevation-correction-design.md) (the MIL correction, which this design leaves authoritative for the dialed number) and [2026-08-27-terrain-range-ring-design.md](2026-08-27-terrain-range-ring-design.md) (whose difference-anchoring property this design generalises to every gate).

**Shape of the change.** Today four independent predicates answer "can this gun hit that target": the flat `minRange`/`maxRange` gate behind `rangeStatus`, the correction grid's bracket behind the terrain note, the ring radii plus dead-ground wedges behind the reach badges, and the cross-section's own trajectory march. They disagree on the same shot on the same screen, and the audit documents twelve concrete disagreements. This design introduces a single reachability authority — a pure per-arc verdict function plus one terrain-aware shot assessor — and rewires every surface to render that one verdict. The rings, wedges, and cross-section stop being engines and become drawings of the same functions.

---

## 1. The authority principle

Three authorities, strictly layered, none overlapping:

1. **`data/weapons.json` is authoritative for the number.** The firing table's MIL is what the user dials; the declared `minRange`/`maxRange` anchor every gate. This is the existing `flatTableAuthoritative` policy, unchanged.
2. **The fitted vacuum model supplies only differences.** Every terrain effect enters as `declared + (model(ΔZ) − model(0))`, per arc, so at ΔZ 0 every gate collapses exactly onto the declared envelope and the model's own absolute disagreements with the table (the "three ceilings" of audit Disagreement E) can never gate a shot.
3. **`assessShot` is the only reachability verdict in the app.** Every caption, colour, badge, and drawn arc that says "reachable", "out of range", "too close", or "masked" derives from it. No surface computes its own verdict anymore.

A corollary that resolves audit E and the boundary noise around every table edge: **elevation-envelope checks apply only to fit-derived (modelled) mils, never to table rows.** The table is envelope-consistent by construction — its gated window's ends land exactly on the elevation stops (mortar 132 m ↔ 850 mil, 684 m ↔ 150 mil; SPG 780 m ↔ 1390 mil) — and a build-time assertion (§ 8) guards that invariant so the runtime never has to re-check it against the fit's ±8–14 m RMS noise. Checking table mils against fit-converted stops would refuse table-covered shots for no physical reason (the fit puts 1181 m at ~14 mil where the table says 20).

## 2. One terrain source for verdicts

The 32 m baked heightfield becomes the single terrain source for every verdict, every displayed ΔZ, and every profile. It is whole-map, synchronous once loaded, validated to 0.7 m median against the 2 m chunks (`docs/terrain.md`), and it is the only dataset that can answer ring- and profile-shaped questions at all. The 2 m Terrain3D chunks remain the input to exactly one thing: the MIL correction's grid lookup (Engine C), whose certified pipeline is untouched. The caption's displayed ΔZ switches from the chunk sample to the grid sample so that the number printed, the profile drawn below it, and the verdict all share one source — this closes audit Disagreement C by construction rather than by reconciliation. The residual (the correction internally interpolates on a chunk-sampled ΔZ that can differ from the displayed grid ΔZ by ~20 m on the steep tail) is documented and bounded; both samplings come from the same bake.

Out-of-bounds behaviour is split by role, closing audit J: **verdicts refuse to invent terrain** — `assessShot` samples the grid unclamped and returns an `offmap` verdict when either endpoint falls outside it, which every caption renders as "no terrain data" — while **drawings keep the clamped edge-continuation** (`rangeRingSample`) so the ring outline is not chopped square at the map boundary. The clamp is thereby demoted to a rendering convenience and can no longer produce a confident verdict about ground that does not exist.

## 3. Layer 1 — `js/ballistics/model.js`

A new file holding the one copy of every vacuum-model primitive, moved out of `js/map/range-ring.js` (which keeps only ring solving and its cache). Loaded before `js/map/range-ring.js` on every page that loads that file. All functions are pure except the loader.

```
BALLISTICS_GRAVITY = 9.81            the only runtime definition of g
loadProjectileModel()                moved; also warns if model.gravity ≠ BALLISTICS_GRAVITY
projectileModelArc(weaponId, arc)    moved unchanged
modelArcLaunchTan(fit, range, dz)    moved unchanged (branch-root selection, tan > 0 guard)
modelArcMil(fit, tan)                moved unchanged
modelArcTanForMil(fit, mil)          new: tan(offset + perMil·mil), null outside (0°, 90°)
modelArcElevationFits(weapon, mil)   moved unchanged
modelOptimalTan(v, dz)               new name for the cross-section's crossSectionMaxRangeTan: v / √(v² − 2 g dz)
modelRangeAtAngle(v, theta, dz)      moved unchanged
modelShellHeight(tan, v, x)          new name for crossSectionShellHeight, moved
arcAngleStops(weapon, fit)           new: the arc's achievable launch-angle interval in radians —
                                     low branch: [angle(minElevationMil), min(angle(maxElevationMil), 45°)]
                                     high branch: [max(angle(minElevationMil), 45°), angle(maxElevationMil)]
                                     each end clamped into (0°, 90°); null if empty
arcMaxRangeModel(weapon, fit, dz)    new: modelRangeAtAngle at clamp(atan(modelOptimalTan(v, dz)), arcAngleStops)
arcMinRangeModel(weapon, fit, dz)    new: modelRangeAtAngle at the binding stop — the steep stop for a
                                     high-branch fit, the shallow stop for a low-branch fit
```

`arcAngleStops` is what replaces the cross-section's broken `crossSectionElevationLimits`: instead of rejecting the whole envelope because the low fit extrapolates 1390 mil to 93.37° (audit A), each branch keeps only the half of the weapon envelope that is meaningful on its root, with 45° as the crossover. `arcMaxRangeModel`'s clamp also fixes the mortar's max ring: its optimal angle is unreachable (45° < the 58.125° minimum-elevation stop), so its true model ceiling is 687.2 m at the clamped stop, not the unclamped 766.2 m — today's ring overdraws downhill reach by ~40 m per 100 m of drop because of this.

Verified reference values (v, offset, perMil from `data/ballistics/projectile-model.json`): level `arcMaxRangeModel` = 2612.8 m (spg.low, at 45°), 2622.6 m (spg.high, at 45°), 687.2 m (mortar, clamped to 58.125°); level `arcMinRangeModel` = 791.3 m (spg.high at 81.22°), 1219.3 m (spg.low at 13.91°), 149.5 m (mortar at 84.375°); spg.low's 45° crossover sits at mil 556.0.

## 4. Layer 2 — `js/ballistics/reachability.js`

### 4.1 Per-arc declared range

```
arcDeclaredRange(weapon, arc) → { minMeters, maxMeters } | null
```

The intersection of the weapon's declared `minRange`/`maxRange` with the arc's own table coverage (first and last table distance). Data today: `spg.low` [1181, 2629], `spg.high` [780, 2629], `mortar.single` [132, 684]. This is what makes gates per-arc: the SPG's 780–1181 m band is "too close" *for the low arc* specifically, which is the fact the MIL card silently encoded by omitting the arc (audit B's "quietly declines" row). For a weapon with no table (none ship), fall back to the weapon envelope alone.

### 4.2 `assessArc` — the pure verdict

```
assessArc(weapon, arc, distanceMeters, deltaZMeters) → {
    status: 'hit' | 'tooFar' | 'tooClose' | 'belowMinElevation' | 'aboveMaxElevation' | 'noModel',
    mil: number | null,        the fit-derived mil for this shot (display/debug; the table mil stays authoritative)
    tan: number | null,        the fit-derived launch tangent (what the drawings fly)
    tableRow: boolean          whether the flat table covers this distance on this arc
}
```

Checks, in order, each anchored as `declared + (model(ΔZ) − model(0))`:

1. no fit for the arc → `noModel`.
2. `distance > declaredMax + (arcMaxRangeModel(dz) − arcMaxRangeModel(0))` → `tooFar`.
3. `distance < declaredMin + (arcMinRangeModel(dz) − arcMinRangeModel(0))` → `tooClose`.
4. solve `modelArcLaunchTan`; a null tangent inside the anchored gates (the ≤ 17 m sliver where the anchored gate is wider than the model's absolute ceiling) → `tooFar` when the table does not cover the distance, but `hit` with `ceilingCapped: true` when it does — the table is authoritative for reachability of its own rows (§ 1), so the fit's absolute ceiling must never gate a table-covered shot. A ceiling-capped arc carries the longest-achievable stop tangent instead of a solved one and a null `mil`; masking is skipped for it (there is no real trajectory to march), and the cross-section may still draw its model shortfall honestly (§ 5).
5. only when `tableRow` is false: `modelArcElevationFits` on the fit mil → `belowMinElevation` / `aboveMaxElevation`.
6. otherwise `hit`.

Worked verdicts (all verified numerically): SPG @ 917 m ΔZ 0 → low `tooClose` (917 < 1181), high `hit` — the arc the cross-section today draws green at −42.7 implied mil is now refused by the same predicate everywhere. Mortar @ 690 m ΔZ 0 → `tooFar` (690 > 684). SPG @ 2620 m ΔZ 0 → both arcs `hit` (2620 ≤ 2629 + 0; the low arc is `ceilingCapped` since its vacuum ceiling is 2612.8); the correction grid's truncated axis no longer converts this into "cannot reach" (audit E). SPG @ 800 m ΔZ −200 → high `tooClose` (anchored min 780 + (821.0 − 791.3) ≈ 810); ΔZ +100 → `hit` (anchored min ≈ 764). SPG @ 2600 m ΔZ +200 → both `tooFar` (anchored max 2629 − 208 ≈ 2421) — audit D's dangerous row, where today the panel prints a green MIL for a shot its own ring draws as unreachable.

### 4.3 `assessShot` — the terrain-aware authority

```
assessShot(weapon, origin, target, mapId) → {
    state: 'ready' | 'pending' | 'offmap' | 'nodata',
    distanceMeters, deltaZ,                       grid-sampled; deltaZ null unless ready
    arcs: { single, low, high },                  per-arc assessArc result + masked: boolean
    verdict: 'hit' | 'masked' | 'tooClose' | 'tooFar' | 'unreachable' | null
}
```

- Calls `ensureHeightfieldLoaded(mapId)` itself, closing the audit's "nothing in the results path triggers the load" gap. Not yet resident on a supported map → `pending`. Unsupported map → `nodata` (surfaces then fall back to today's flat behaviour with no terrain claims). Either endpoint outside the unclamped grid → `offmap`.
- `deltaZ` is the grid sample difference — the one ΔZ every caption, badge, and flight-time badge now displays and consumes.
- **Masking**: for each arc whose status is `hit`, build the gun→target grid profile (25 m steps, clamped interior samples) and march the arc's actual trajectory (`modelShellHeight` at `tan`) over it; ground strictly above the shell before the target → `masked: true`. This is the cross-section's own test, extracted and shared, so the drawn profile and the badge can no longer disagree.
- `verdict` aggregates arcs by priority `hit` (not masked) > `masked` > `tooClose` > `tooFar` > `unreachable` (only elevation-envelope refusals remain) — the single value `rangeStatus`, saved-target styling, and badges render.

### 4.4 Modelled fill becomes per-arc

`extendModelledSolutions` today fires only when all three arcs are table-null and silently substitutes ΔZ 0 while terrain loads (audit 3.2, I). It is replaced by a per-arc rule inside the solve pipeline: for each arc with no table row whose `assessArc` status is `hit` and not masked, attach the modelled solution (fit mil, `modelled: true`, `≈` prefix, both envelope stops enforced — this is where step 5 of § 4.2 bites). If the heightfield is still `pending`, no modelled solution is produced and the panel says "terrain loading" instead of printing a flat-ground `≈` mil that will change on a later frame.

### 4.5 The MIL stays printed; the verdict wears the warning

When a table row exists but the verdict is `tooClose`/`tooFar`/`masked` (SPG @ 800 m ΔZ −200: the high table covers it, the anchored gate refuses it), the MIL card still prints the table value — the gun can physically dial it, and the table is authoritative for the number — but `rangeStatus` and the terrain note render the verdict, in the same red/amber vocabulary as the badges. This is the deliberate resolution of audit D: one number, one verdict, both visible, never a green light on a shot the model says lands elsewhere.

## 5. Surfaces, rewired

| Surface | Before | After |
|---|---|---|
| `rangeStatus` (results.js) | flat gate via `solved` | `assessShot.verdict`: hit→green `inRange` (amber `inRangeModelled` if any shown arc is modelled), masked→amber `reachMasked`, tooClose→red `reachTooClose`, tooFar→red `outRange`, unreachable→red `outRange`, pending→dimmed `reachPending`, nodata/offmap→flat-gate fallback text |
| Terrain note | Engine C bracket ("cannot reach") | verdict caption built in results.js from `tr()` keys (§ 7) + correction status fragments; ΔZ printed from `assessShot.deltaZ` |
| Cross-section | own `reaches`/limits/captions | draws `assessArc.tan` per arc; hit→green, masked→blocked red with existing caption, tooClose→clamped-at-binding-stop trajectory + `crossSectionOver`, tooFar→clamped trajectory + `crossSectionShort`, envelope refusals→clamped trajectory + new keys, ceiling-capped table sliver→drawn from the stop tangent and captioned `crossSectionShort` when the model lands short (the one place the model's own reach stays visible); `crossSectionElevationLimits` deleted |
| Max/min rings | own Engine B calls, max-v, unclamped 45° | same fixed-point march, but the reach function is `max over arcs of anchored arcMaxRangeModel` and the min function `min over arcs of anchored arcMinRangeModel`; mortar clamp and the marchLimit anchor bug (`+ max(0, declaredMax − levelMax)`) fixed |
| Dead ground | `spg.low` only, local solver copy, grazing-tan trick | all arcs with envelope-valid solutions, shared `modelArcLaunchTan`/`modelShellHeight`, exact per-sample prefix march (the grazing-tangent monotonicity argument is invalid for steep roots); dead ⇔ no arc clears; mortar wedges exist for the first time |
| Reach badges | ring cache + wedge cache + hardcoded scale | `reachClassify` calls `assessShot` per gun (exact bearing/distance, `getCoordinateMetersPerUnit`); ring/wedge caches remain drawing-only |
| Flight time | chunk `meta.deltaZ` or silent 0 | `assessShot.deltaZ`; row hidden while `pending` |
| Mil-cursor | uncorrected forever off-cache | unchanged chunk policy (`prime: false`), but ΔZ/verdict now come from the always-resident grid, so hover shows terrain-aware modelled values and verdicts; only the correction refinement still waits for cached chunks |
| Saved-target cards | flat `solved` styling | verdict reaches the card through its reach badge (3.13, rewired below); the card's own MIL styling stays flat-`solved` |
| OBS overlay | mirrors MIL with no warnings | new `obsTerrainNote` element mirroring the panel's note text and `rangeStatus` verdict colour |
| Correction (terrain-ballistics.js) | bracket-null ⇒ "unreachable" | § 6 |

## 6. Correction-layer changes (`js/features/terrain-ballistics.js`)

- The `unreachable` outcome is retired. `classifyArc` keeps `corrected` / `negligible` / `uncorrected` / `nogrid`; reachability language comes only from `assessShot`. A bracket miss is a correction-coverage fact, not a reachability fact.
- **Distance-axis clamp**: when the unified verdict for the arc is `hit`/`masked` but the distance falls past the grid's truncated axis end (the ≤ 18 m sliver between 2611.5/2621.3 and 2629), the lookup clamps distance to the axis end. The correction gradient along distance is smooth there and the alternative was refusing a table-covered shot. The ΔZ axis is never clamped: |ΔZ| > 800 m stays `uncorrected` with the existing "not corrected for height" warning.
- **Envelope clamp on corrected mils**: after adding `deltaMil`, clamp `minMil`/`maxMil`/`mil` into `[minElevationMil, maxElevationMil]` and set `envelopeClamped: true` on the solution when the clamp moved anything; the caption appends the new `noteElevationLimit` string. Today a +correction at 780 m pushes past the 1390 stop with no warning.
- `meta.deltaZ` (chunk-sampled) is renamed `meta.correctionDeltaZ` and becomes internal; nothing displays it.

## 7. Caption vocabulary and localisation

Caption assembly moves to results.js, which already uses the standard `tr()` system — the new strings live in `locales/*.json` (all twelve files), ending the terrain stack's split localisation for everything except the untouched SPH level warning. New keys: `noteDeltaZ` ("ΔZ {dz} m", printed once as the note's prefix), `noteArc` ("arc", the single-arc name), `noteAllArcs` (substituted for `{arcs}` when every arc shares one verdict), `noteTooFar` ("{arcs}: out of reach at this height"), `noteTooClose` ("{arcs}: inside minimum range"), `noteMasked` ("{arcs}: masked by terrain"), `noteUncorrected` ("not corrected for height"), `noteElevationLimit` ("MIL clamped at the gun's elevation limit"), `noteOffMap` ("no terrain data here"), `crossSectionBelowMin` ("needs elevation below the gun's minimum — passes over"), `crossSectionAboveMax` ("needs elevation above the gun's maximum — falls short"), `reachUnknown` ("No terrain data"). The pending state reuses `crossSectionLoadingTerrain`. Existing keys are reused wherever the meaning matches (`reachMasked`, `reachTooClose`, `reachPending`, `crossSectionShort`, `crossSectionOver`, `terrainLoading` semantics via `crossSectionLoadingTerrain`). The old `terrainStatusUnreachable`/`terrainStatusUnreachableAll` strings in `UI_TEXT` become dead and are removed.

The caption-inversion bug (audit A's secondary finding) dissolves rather than being patched: captions are keyed off the *verdict* (`tooClose` ⇒ overshoot text, `tooFar` ⇒ falls-short text), never off which clamp side fired, so the branch-dependent meaning of a clamp side stops mattering.

## 8. Constants and build-time assertions

- `BALLISTICS_GRAVITY` in model.js is the only runtime g; `RANGE_RING_GRAVITY`, `CROSS_SECTION_GRAVITY`, and `FLIGHT_TIME_GRAVITY` are deleted and their uses repointed. `scripts/lib/ballistics.mjs` keeps its own `GRAVITY` (build side), and `loadProjectileModel` warns if the shipped `model.gravity` disagrees with the runtime constant, defusing the never-read JSON field.
- `METRES_PER_GAME_UNIT_RING` is deleted; ring, dead ground, and badges call `getCoordinateMetersPerUnit()` once per solve. The latent 100-vs-1000 split (audit K) collapses to one data-driven value.
- New `scripts/lib/config.test.mjs` assertions: (a) every table row inside a weapon's gated `[minRange, maxRange]` window has its mil inside `[minElevationMil, maxElevationMil]` — the lockstep invariant § 1 relies on; (b) each map allowlist literal in `js/map/heightfield.js`, `js/map/contours.js`, and `js/map/hillshade.js` matches the terrain files actually on disk, and `HEIGHTFIELD_MAP_IDS` equals the `terrainMaps` keys in `data/ballistics/terrain-context.json`; (c) for every map with a heightfield, `heightfield.json`'s `spacingMeters / stepGameUnits` equals the map's `coordinateMetersPerUnit`.

## 9. What each audit finding maps to

A → § 3 `arcAngleStops` (limits per branch; guard deleted). B → § 4.2 anchored `tooClose` + § 5 cross-section drawing rules. Secondary caption inversion → § 7. C → § 2 (one grid ΔZ displayed and consumed). D → § 4.2 anchored gates + § 4.5. E → § 1 corollary + the `ceilingCapped` rule of § 4.2 + § 6 axis clamp. F/G → § 5 dead-ground and badge rows. H → untouched by design: Ozeti's correction stays policy-gated pending alignment validation; the note keeps saying so via `noteUncorrected`. I → § 4.3 `pending` state, § 4.4 no silent ΔZ 0, § 5 mil-cursor row. J → § 2 out-of-bounds split. K → § 8. L → non-goal (below). Additional findings: marchLimit anchor bug → § 5 ring row; dead-ground solver divergence → § 5; mortar ring overdraw → § 3; corrected-mil envelope overflow → § 6; dead table rows → § 8(a).

## 10. Non-goals

Slant range (the app consistently uses horizontal range; changing that is a game-measurement question). Regenerating `data/ballistics/height-correction.json` or the certified experimental payloads. The experimental terrain correction wrapper (opt-in, SPG-only; it continues to override the dialed mil after verdicts are computed — verdicts do not see it, exactly as today, and audit L stays open by choice). Validating the fits against the game (branch assumption, muzzle velocities, flight times — tracked in `docs/todo.md`). Enabling Ozeti correction. Moving the SPH warning or existing `UI_TEXT` fragments that remain in use. Contours and hillshade.

## 11. Testing strategy

Pure layers (model.js, reachability.js) get node `node:test` suites run via a small `vm`-based loader (`scripts/lib/runtime-globals.mjs`) that evaluates the global-style runtime files with stubbed browser globals — fast, no browser, wired into `npm run test:scripts`. Integration is verified by extending the existing playwright suites in `test/` (they drive the real app against the dev server) with the audit's worked scenarios: SPG @ 917 m, SPG @ 2620 m, SPG @ 800 m ΔZ −200, mortar dead ground existing, Ozeti caption unchanged. The build-time assertions of § 8 run in the same `npm run test:scripts` pass.
