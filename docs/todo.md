# TODO — unverified game values

Things the calculator draws that nobody has measured in-game yet. Every value
here renders today, so the app works; each is an inference or a placeholder
that someone with the game open can settle in one edit.

Each entry says what the current value is, where it lives, and what evidence
(if any) it rests on. Replace the value and delete the entry.

---

## FOB build area size

**Current:** `60` in `config/app.json` → `map.rings.fob.halfSide`
**Renders as:** a 120 × 120 m square around every placed `fob` marker
**Evidence:** the build area is a square roughly 120 m on a side, per someone
who has played it. Not tape-measured in-game, but no longer invented.

For scale, a 120 m square is 12% of the main zone's full width and spans 55% of
the gap between the two closest towers on Bakurani (218 m apart).

Nothing in the repo constrains this the way tower positions constrain the main
zone, so it cannot be narrowed by inference, and no third-party map publishes
it either — MetaForge has no FOB layer on any Wardogs map. It needs an in-game
measurement.

## Ozeti Valkyra marker is in the wrong place

**Current:** `valkyra` at `11875, 7093` in `maps/ozeti.json`
**Problem:** byte-identical to Bakurani's `valkyra` coordinate — copy-pasted
and never moved. Confirmed: that coordinate is Bakurani's real Valkyra spawn
(18 m from the position MetaForge publishes), so it is the Ozeti copy that is
wrong. The label currently renders ~2 km from the Ozeti Valkyra base.

The fix needs the true position, and it has to come from the game — MetaForge
publishes no facilities for Ozeti at all (`facilities: []`, `towers: []`), only
zone polygons. Its own vendor cluster sits at ~`13803, 6733`; on Bakurani the
marker sits ~49 m from its vendors, so somewhere near that cluster is the
expectation, but interpolating it is not good enough.

## `fob` and `tank` marker icons are drawn approximations

**Current:** `fob`, `tank` in `assets/map-markers/` (editable sources in
`assets/map-markers/src/*.svg`)
**Renders as:** flat white 32 × 32 glyphs in the marker picker and on the map
**Evidence:** none — these were drawn by hand, not traced from the game.

They could not be sourced when they were made. The Closed Beta ended on
2026-08-24 and Steam stripped the playtest depot to a 5-byte stub two days
later; all art lives inside signed IoStore paks
(`Wardogs/Content/Paks/pakchunk0-WindowsClient.*`) that are no longer on disk.
Early Access on 2026-09-10 restores them.

Neither has a map glyph anywhere reachable today. The only art under those
names (`t_ui_icon_utility_fob_textured_512x512_temp`,
`t_ui_icon_vehicle_hvy_tank_textured`) is 512 × 512 rendered inventory art, not
a marker. Both stay hand-drawn until Early Access.

Replacing an icon is a file swap — `maps/assets.json` already registers them
and `labelKey` already supplies the picker label, so no code changes.

## `spawn_deploy` has no artwork of its own

**Current:** `assets/map-markers/spawn_deploy.webp`, deliberately absent from
`maps/assets.json`
**Renders as:** nothing
**Evidence:** it is byte-identical to `spawn_board.webp` — both md5
`d6673a0b57d9e75ee8b602e58d83f245`.

It arrived in `737cd73d` alongside the genuine POI icons, so a distinct
deploy-point icon was presumably intended and the file that shipped is a copy.
It is left on disk unregistered rather than deleted so real art can drop
straight in.

Settle in-game whether the deploy point has an icon distinct from the spawn
board. If it does, replace the file and re-add its `maps/assets.json` entry
(`placeable: false`, matching the other preset POIs) with a
`markerLabelSpawnDeploy` key across `locales/*.json`. If it does not, delete
the file.

## Time of flight — measured for the mortar, modelled for the SPH-2

**Current:** `js/features/flight-time.js`, shown as a badge row under the metric grid — one badge per arc, from the MIL on screen
**Evidence:** the 2026-09-02 firing-range session, `docs/firing-range-measurements.md`.

The mortar's seconds are interpolated straight from five video-timed shots (150–850 mil, 16.5–22.4 s, ±0.4 s) stored as `measuredFlightTimes` in `data/ballistics/projectile-model.json`. The vacuum fit they replaced ran 1.5 s short at 150 mil and 4.8 s short at 850, so the old "good enough to choose an arc" caveat was measured and found wanting; the readout now carries the measurement's own ±0.4 s instead. Those timings were taken without a known height difference, so the mortar badge does not move with ΔZ — a target 100 m below the gun adds on the order of a second that the badge does not show.

The SPH-2's seconds come from the drag fit (below), which reproduces its three timed shots — 14.22 s at 300 mil, 23.43 s at 600, 35.40 s at 1200 — within 0.35 s. No shot below 300 mil or above 1200 was timed.

**The branch assumption is settled.** At 150 mil the mortar flew 16.5 s where the high-angle prediction was 15.0 s and the low-angle alternative 9.3 s; at 750 mil it flew 20.75 s against 17.4 s and 2.9 s. The mortar fires high-angle, which is the convention the elevation correction assumes throughout.

## SPH-2 low arc below 150 mil is extrapolated

**Current:** rows 35–140 mil of `ballistics.low` in `data/weapons.json`, 822–1551 m, generated from the fitted model; `extrapolatedBelowMil.low: 150` marks them and the MIL card prints them with a `≈`
**Evidence:** none. A hill blocked the firing lane at the range and the 35 and 100 mil dials could not be shot.

This is precisely where the shipped table was furthest off — −150 m at 150 mil and growing as the dial dropped — and the two available extrapolations disagree by 250 m at the 35 mil floor: extending the measured error trend puts the old table about 185 m long there, the fitted model puts it 434 m long. The regenerated rows follow the model because it is the only thing anchored to measurements at all, but nothing between 150 mil and the floor has been checked. Two shots at 35 and 100 mil from a position with a clear lane under 1400 m settle it; the fit does not depend on them.

The 35 mil floor itself is a hard game limit, confirmed directly: the gun will not depress further. `minElevationMil` was 20 and is now 35.

## Elevation correction — what is still switched off

The height correction is **on for every arc**
(`releasePolicy.automaticMilCorrection` in
`data/ballistics/terrain-context.json`). SPG-2 `low` was enabled on 2026-08-27:
sweeping 1,652 (arc, range, ΔZ) cells found no case where correcting is worse
than ignoring, and on the low arc it is the difference between roughly 600 m of
miss and 25 m against a model perturbed 2% in muzzle velocity.

Two things still hold it back, both captioned in the panel rather than silent:

- **Ozeti, and every map except Bakurani.** `releasePolicy.correctedMaps` lists
  only `bakurani`, whose alignment was validated by visual overlay after the
  Y-flip fix in `5c462a173`. Ozeti's never was. Validate it the same way, then
  add it to the list. An empty list corrects nothing, by design.
- **Misses under 10 m.** `releasePolicy.suppressionMissMeters`. Not a defect —
  below this the correction is smaller than the model's own error.

**The model itself is still unverified.** This is the one that should worry you.

- **The SPH-2 model is a two-parameter stopgap, fitted to twelve dials.** `data/ballistics/projectile-model.json` now carries `source: "firing-range-fit"` for both SPH-2 arcs: 262.4 m/s, quadratic drag 3.90 × 10⁻⁴ /m, one elevation scale `2.254° + 0.05625°/mil` straight through the maximum-range angle. It reproduces the 2026-09-02 measurements to 19.7 m RMS with a worst residual of about −37 m at 150 mil, against roughly 73 m RMS and 150 m worst for the tables it replaced, and the regenerated `data/weapons.json` tables inherit that accuracy. But a single drag coefficient leaves structure behind — adding a linear term made the fit worse — so the real drag law has a shape two parameters do not capture. Early Access on 2026-09-10 restores `Wardogs/Content/Paks/pakchunk0-WindowsClient.*`; read the projectile's muzzle velocity, gravity scale and drag term and rewrite the file with `source: "pak-extract"`. The mortar's arc is still a vacuum fit to its own table (`source: "vacuum-fit"`); the table is measured correct to within +1.0 to +7.5 m, so the fit is a fine range model, but its flight times were 1.5–4.8 s short and no physical model that was tried fits the mortar at all.
- **The elevation correction itself is still entirely unvalidated.** The firing range is not a shipped map and has no heightfield, so every shot there was at an unknown ΔZ. Four or five spotting shots on known ΔZ, comparing the corrected MIL against where the round actually lands, are still needed. The range tables have now been checked against the game; the correction built on top of them has not.
- **Terrain sensitivity varies enormously by arc, and the correction treats every arc the same.** Range moves roughly 1.9 m per metre of target height on the SPH-2 low arc, 0.09 m per metre on its high arc, and about 0.5 m per metre for the mortar. `releasePolicy.automaticMilCorrection` applies uniformly. Not something the measurements settle, but worth considering.
- **No automated coverage under `js/`.** `scripts/lib/ballistics.test.mjs` covers
  the solver and the fit; the runtime half — the gate, the map allowlist,
  `correctArc`, the per-arc caption selection — has none, because the repo has no
  browser test harness for it. Verified once against a throwaway VM harness.
- **Vehicle attitude is real, bounded, and has no input to correct from.** Across four of five 1380 mil shots, about 5° of traverse moved the impact 12 m — roughly 2.6 mil of induced launch angle — while a held barrel repeated to 1–8 m. That is below the model's own 19.7 m RMS, so it is not the largest remaining error once the tables are fixed. A fifth shot landed 33 m short of the others and is an outlier nothing explains. The chassis tilt itself was never read off the game, so the SPH-2 level warning stays a caption.

**Regenerating the data.** In this order — the second reads the first's output. `fit-ballistics` refits only `vacuum-fit` arcs and carries the measured SPH-2 fit over untouched:

    npm run fit-ballistics
    npm run build-height-correction

---

## Unified reachability (2026-09) — untested and inert

Two things this branch shipped without being able to fully check.

**The browser suites were never executed.** `test/reachability.mjs` and its four siblings (`test/cross-section.mjs`, `test/flight-time.mjs`, `test/range-ring.mjs`, `test/reach-badges.mjs`) are written and reasoned about against the shipped behaviour, but Chromium navigation to the dev server times out in this environment — for the pre-existing, unmodified suites just as much as the new ones — so none of the five has actually run against the app on this branch. The node suites (`npm run test:scripts`) do pass, at 109 passing with the one known-environmental `dev-env.test.mjs` tile failure (missing `maps/tiles/`) that predates this work. Someone with a working browser environment needs to run all five browser suites before trusting the integration claims.

**Three defects in the design document itself, found by the final whole-branch review.** These are defects in `docs/superpowers/specs/2026-09-01-unified-reachability-design.md`, not in the code that ships — the implementation has been fixed, but the next revision of the spec should close them so the next reader is not led back into the same holes.

1. § 4.2 steps 2 and 3 are undefined when the model term is null. `arcMaxRangeModel`/`arcMinRangeModel` return null whenever the binding stop cannot achieve the ΔZ at all — the SPG low arc's 13.91° shallow stop cannot reach a target more than about 75 m above the gun — and the spec never says what the gate does then. § 1's "the declared `minRange`/`maxRange` anchor every gate" implies the declared bound is the floor, but § 4.2 never states it, and the implementation read the silence as "skip the check", which deleted the minimum-range gate on every uphill SPG low-arc shot. The step should read: `declared + (model(ΔZ) − model(0))` when both model terms exist, and the declared bound otherwise.

2. § 4.2 step 5 specifies `modelArcElevationFits` — the raw weapon mil envelope — even though § 3 introduces `arcAngleStops` precisely because that envelope is meaningless per branch: the SPG low fit extrapolates 1390 mil to 93.4°, so a low-branch solution at 74° passes the check unchallenged. A modelled (non-table) solution must be tested against the arc's own stops, not only against the weapon's mil range.

3. § 4.3's masking test is described as "the cross-section's own test, extracted and shared", but § 5's surfaces table only tells the cross-section to draw `assessArc.tan` and leaves it computing its own impact march. Nothing in the spec obliges any surface to consume the shared result, so "shared" was never actually required of anyone, and the test was duplicated at two different resolutions instead. The surfaces table has to name the shared predicate as the classification source, with the local march reduced to drawing.

**The experimental terrain-correction panel's status display is now inert.** Removing the last caller of `formatTerrainBallisticsStatus` also removed the only writer of the state that panel's arc list renders from, so the panel now permanently renders its empty branch. This does not affect the dialed-mil override itself — the experimental correction still overrides the MIL exactly as before (see "Elevation correction" above and audit finding L) — it is only that panel's own status text that no longer updates. Rewiring it was left out of scope as a non-goal of the unified-reachability change.

---

## Known, not yet modelled

Not unverified — measured and understood, but the app does not represent it.

**The main zone moves between matches.** Each map ships several named control
zones and the match picks one; we draw the Default variant and nothing else.

| Map | Variant | Centre | Offset from Default |
|---|---|---|---|
| Bakurani | Default | `7991, 7183` | — |
| Bakurani | Farmland | `8137, 6938` | 285 m |
| Bakurani | Lumberyard | `8249, 7182` | 258 m |
| Ozeti | Default | `10002, 6357` | — |
| Ozeti | Farmland | `9471, 6359` | 531 m |
| Ozeti | Church | `10163, 6326` | 164 m |
| Ozeti | River | `9774, 6244` | 254 m |

On Ozeti the Farmland zone sits 531 m from Default — about one full radius — so
on that rotation the circle we draw barely overlaps the real one. Supporting
all variants means a per-map list plus a picker: a feature, not a data fix.

**Real map art is available for two markers we draw by hand.** The game's own
marker textures are mirrored at
`https://static.metaforge.app/wardogs/icons/<textureName>.webp`:
`t_ui_maptracker_spawnvehicle` fits our `spawn_vehicle`, `t_ui_mortar_map_icon`
fits our `artillery`. Pending a downscale and file swap. (`t_ui_talon_map_icon`
and `t_ui_phalanx_map_icon` exist too, for markers we do not have yet.)

---

## Not on this list

Values that are already grounded and need no verification:

- Weapon ranges and firing tables — `data/weapons.json`. Measured at the
  firing range on 2026-09-02: the mortar table is right to within +1.0 to
  +7.5 m across six dials, and the SPH-2 tables were regenerated from a fit
  that reproduces twelve dials to 19.7 m RMS — except below 150 mil, which is
  its own entry above. `maxRangeKm` 2.629 checks out; `minRangeKm` 0.78 is
  the shipped high table's 1390 mil entry and, if wrong, is understated.
- SPH-2 dispersion — essentially none. Held still, repeats land within
  7.2 m at 2192 m and 7.6 m at 1224 m, so a discrepancy in the app is model
  error, not scatter.
- Map bounds and `coordinateMetersPerUnit` — per-map in `maps/*.json`
- Preset marker positions other than Ozeti's `valkyra`
- Main zone centre and radius — Bakurani `7991, 7183` r500, Ozeti
  `10002, 6357` r550, from the game's own `controlZones` / `controlZoneRadius`
- `map.rings.fob.halfSide` semantics — the in-game quantity is centre-to-edge,
  which is what the field now says; only the number is unknown
- Marker plate treatment — genuine map textures carry no diamond plate, so the
  plate on the `737cd73d` POI icons is not a universal style to match
