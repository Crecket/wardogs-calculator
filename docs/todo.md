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

## Time of flight has never been timed

**Current:** derived at runtime by `js/features/flight-time.js`, shown as a
badge row under the metric grid — `≈ 17 s` for the mortar, `≈ 12 s` / `≈ 30 s`
per arc for the SPH-2
**Renders as:** one badge per arc, from the MIL on screen
**Evidence:** none from the game. The seconds come from the same vacuum fit as
everything else in `data/ballistics/projectile-model.json`.

Two uncertainties sit under the number, and one stopwatch settles the larger:

- **The branch assumption.** `sin(2θ)` is symmetric about 45°, so a range table
  alone cannot say whether it is the shallow or the steep solution. It is
  resolved by convention, not measurement — and TOF is brutally sensitive to
  it: a mortar shot at 400 m is 16.9 s on the high branch and 4.8 s on the low
  one. **One mortar shot at short range settles it beyond any doubt**, and the
  same assumption underpins the shipped elevation correction, so that shot
  validates far more than this readout.
- **The fitted velocity.** ±5% moves the derived seconds by ±2–4 s. Good enough
  to choose an arc; not good enough for the time-on-target staggering that a
  battery would want.

Four stopwatch readings — mortar short range, SPG low, SPG high, one repeat —
close both. TOF is also the cheapest probe of the drag error that gates
everything else.

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

- **Projectile parameters from the paks.** `data/ballistics/projectile-model.json`
  is a least-squares vacuum fit to our own firing tables, RMS 8–14 m. The SPG's
  two arcs want different mil→degree slopes (`0.048` on `high`, `0.058` on
  `low`), which is the fit absorbing real drag. Early Access on 2026-09-10
  restores `Wardogs/Content/Paks/pakchunk0-WindowsClient.*`; read the
  projectile's muzzle velocity, gravity scale and drag term and rewrite the file
  with `source: "pak-extract"`.
- **No in-game validation has happened.** Four or five spotting shots on known
  ΔZ, comparing the corrected MIL against where the round actually lands.
  Nothing in this pipeline has been checked against the game — only against
  itself.
- **The SPG tables outrun their own fitted model — handled at the gating level.** The high table's last row is 2629 m against a fitted vacuum ceiling of 2622.6 m. The grid's distance axis is now clamped to that ceiling, so the corrected span reaches 2621 m instead of stopping at 2580; the last few metres of table range still get nothing. The unified-reachability change (2026-09) closed the gap between what each surface *said* about this mismatch — the grid clamp and `assessShot`'s anchored gates now agree with each other and with the firing table — but the fits themselves are unchanged and still stop short of 2629 m; only pak-extracted parameters make it disappear.
- **No automated coverage under `js/`.** `scripts/lib/ballistics.test.mjs` covers
  the solver and the fit; the runtime half — the gate, the map allowlist,
  `correctArc`, the per-arc caption selection — has none, because the repo has no
  browser test harness for it. Verified once against a throwaway VM harness.
- **Vehicle attitude is not modelled.** The SPH-2 level warning is still just a
  caption. Chassis tilt moves the impact independently of terrain ΔZ, so a
  corrected MIL fired from a tilted platform is still wrong.
- **Flight time and the branch assumption remain unvalidated against the game.** The unified-reachability change (2026-09) put every surface behind one verdict, but it did not touch what that verdict is built on: the vacuum fit, the branch convention, and the flight times derived from them are exactly as unverified as before this work.

**Regenerating the data.** In this order — the second reads the first's output:

    npm run fit-ballistics
    npm run build-height-correction

---

## Unified reachability (2026-09) — untested and inert

Two things this branch shipped without being able to fully check.

**The browser suites were never executed.** `test/reachability.mjs` and its four siblings (`test/cross-section.mjs`, `test/flight-time.mjs`, `test/range-ring.mjs`, `test/reach-badges.mjs`) are written and reasoned about against the shipped behaviour, but Chromium navigation to the dev server times out in this environment — for the pre-existing, unmodified suites just as much as the new ones — so none of the five has actually run against the app on this branch. The node suites (`npm run test:scripts`) do pass, at 105 passing with the one known-environmental `dev-env.test.mjs` tile failure (missing `maps/tiles/`) that predates this work. Someone with a working browser environment needs to run all five browser suites before trusting the integration claims.

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

- Weapon ranges and firing tables — `data/weapons.json`. The *generated*
  files in `data/ballistics/` are a different matter; see the elevation
  correction section above.
- Map bounds and `coordinateMetersPerUnit` — per-map in `maps/*.json`
- Preset marker positions other than Ozeti's `valkyra`
- Main zone centre and radius — Bakurani `7991, 7183` r500, Ozeti
  `10002, 6357` r550, from the game's own `controlZones` / `controlZoneRadius`
- `map.rings.fob.halfSide` semantics — the in-game quantity is centre-to-edge,
  which is what the field now says; only the number is unknown
- Marker plate treatment — genuine map textures carry no diamond plate, so the
  plate on the `737cd73d` POI icons is not a universal style to match
