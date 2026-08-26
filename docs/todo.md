# TODO — unverified game values

Things the calculator draws that nobody has measured in-game yet. Every value
here renders today, so the app works; each is an inference or a placeholder
that someone with the game open can settle in one edit.

Each entry says what the current value is, where it lives, and what evidence
(if any) it rests on. Replace the value and delete the entry.

---

## FOB build area size

**Current:** `150` in `config/app.json` → `map.rings.fob.radius`
**Renders as:** a 300 × 300 m square around every placed `fob` marker
**Evidence:** none — this number was invented to make the shape visible.

Known to be too big. For scale, a 300 m square is 30% of the main zone's full
width, and spans 135% of the gap between the two closest towers on Bakurani
(223 m apart) — one FOB would cover the ground between two objectives.

Nothing in the repo constrains this the way tower positions constrain the main
zone, so it cannot be narrowed by inference. It needs an in-game measurement.

**Also confirm the units.** `radius` currently means *centre to edge*, so 150
draws a 300 m square. If the in-game figure is quoted as a full side length
instead, either halve it when entering it or change the meaning in
`getRingConfig` / `drawRadiusSquare` and update the comment in
`js/core/config.js`.

## Main zone centre and radius

**Current:** `mainZone: { x, y, radius: 500 }` in `maps/bakurani.json` and
`maps/ozeti.json`
**Renders as:** a 1 km green circle
**Evidence:** inferred from tower positions — reasonable, but not measured.

| Map | Centre | Basis |
|---|---|---|
| Bakurani | `8015, 7091` | centroid of its 5 towers |
| Ozeti | `10032, 6335` | centroid of its 4 towers |

The radius clears the tower spread on both maps (399 m on Bakurani, 455 m on
Ozeti), so every tower falls inside the circle with margin.

Two things support the centre being roughly right: the tower centroid sits
within 400 m of each map's geometric middle, and the three faction bases are
near-equidistant from it (3860 / 4060 / 3910 m on Bakurani), which is what a
deliberately symmetric contested area looks like.

That is circumstantial. If the real scoring area sits somewhere else, or is not
circular, it is two numbers per map to correct. A map with no `mainZone` block
falls back to the middle of its bounds at the `config/app.json` radius.

## Ozeti Valkyra marker is in the wrong place

**Current:** `valkyra` at `11875, 7093` in `maps/ozeti.json`
**Problem:** that is byte-identical to Bakurani's `valkyra` coordinate — it
looks copy-pasted and never moved.

Two independent checks agree it is wrong:

- Its own vendor cluster on Ozeti sits at ~`13803, 6733`, about **1960 m
  away**. On Bakurani the same marker sits **49 m** from its vendors.
- Faction bases sit 3.6–4.0 km from the map centre on both maps (Ozeti's
  vendor clusters measure 3792 / 4032 / 3641 m). The shipped `valkyra` marker
  measures **1993 m** — the only outlier on either map.

This is a live bug in the map data regardless of any circle drawn on it: the
Valkyra label currently renders ~2 km from the Valkyra base.

The fix needs the true position. Placing it next to its vendor cluster (as on
Bakurani, where marker and vendors are ~49 m apart) would be consistent with
the other bases, but the exact coordinate should be read off the game rather
than interpolated.

## Marker icons are drawn approximations, not game art

**Current:** `fob`, `tank`, `artillery`, `spawn_vehicle` in `assets/map-markers/`
(editable sources in `assets/map-markers/src/*.svg`)
**Renders as:** flat white 32 × 32 glyphs in the marker picker and on the map
**Evidence:** none — these were drawn by hand, not traced from the game.

They could not be sourced when they were made. The Closed Beta ended on
2026-08-24 and Steam stripped the playtest depot to a 5-byte stub two days
later; all art lives inside signed IoStore paks
(`Wardogs/Content/Paks/pakchunk0-WindowsClient.*`) that are no longer on disk.
Early Access on 2026-09-10 restores them.

**The style is also unsettled.** The icons the maps actually use — the ones
added in `737cd73d` — share a plate treatment: a full-bleed 32 × 32 diamond,
`#000000` at alpha 202/255, roughly 2 px rounded corners, with a pure white
opaque glyph in a centred ~15 × 10 box. The four drawn icons instead use the
plain white-glyph style of the class icons (`assault`, `medic`, …), which are
menu art and appear on no map. Whether tactical markers wear the plate in-game
is unknown. Two consequences if they should: they would match the real POIs,
and the plate would carry its own background, which fixes white-on-transparent
glyphs washing out on the light theme.

Replacing an icon is a file swap — `maps/assets.json` already registers all
four and `labelKey` already supplies the picker label, so no code changes.

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

---

## Not on this list

Values that are already grounded and need no verification:

- Weapon ranges and ballistics — `data/weapons.json`, `data/ballistics/`
- Map bounds and `coordinateMetersPerUnit` — per-map in `maps/*.json`
- Preset marker positions other than Ozeti's `valkyra`
