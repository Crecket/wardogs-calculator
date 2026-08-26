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
(218 m apart) — one FOB would cover the ground between two objectives.

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

- Weapon ranges and ballistics — `data/weapons.json`, `data/ballistics/`
- Map bounds and `coordinateMetersPerUnit` — per-map in `maps/*.json`
- Preset marker positions other than Ozeti's `valkyra`
- Main zone centre and radius — Bakurani `7991, 7183` r500, Ozeti
  `10002, 6357` r550, from the game's own `controlZones` / `controlZoneRadius`
- `map.rings.fob.radius` semantics — the in-game quantity is a radius, so
  centre-to-edge is the correct reading; only the number is unknown
- Marker plate treatment — genuine map textures carry no diamond plate, so the
  plate on the `737cd73d` POI icons is not a universal style to match
