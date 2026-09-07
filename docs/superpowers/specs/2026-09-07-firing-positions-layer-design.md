# Firing positions and flatness layers

Two baked map layers that answer where an SPG can be parked: one that shows how steep the ground is everywhere, and one that shows the subset of it which can also put a shell into every tower.

Design artifact: https://claude.ai/code/artifact/5af14eef-968b-4394-b377-5a744f11a65f

## Why

The calculator already warns when a gun sits on ground steeper than 8 degrees, because hull tilt moves the impact further than any error in the ballistics — up to 95 m on the high arc, measured 2026-09-03. It has never been able to say where the flat ground is. A player reads the warning after choosing a position, which is the wrong order.

## Two layers, two jobs

**Flatness** shows hull tilt everywhere on a green-to-red ramp. Raw terrain truth, no opinion, useful anywhere on the map including outside the tower ring.

**Firing positions** shows the ground which is both flat enough and able to range every tower. This is the opinionated answer.

Both are static per map, so both bake at build time into single-channel PNGs beside the existing `hillshade.png`. Drawing costs one `drawImage` per frame. No solver, no worker, no settle delay — the invariant is that neither layer computes anything at runtime.

## Visual encoding

The two layers must be legible together, so they carry different kinds of mark rather than the same ramp.

**Flatness** is a translucent fill on a five-band ramp, drawn just above the hillshade.

| Band | Tilt | Bakurani | Ozeti |
| --- | --- | --- | --- |
| 0 | 0–2° | 3.6% | 12.4% |
| 1 | 2–4° | 5.4% | 11.8% |
| 2 | 4–6° | 6.6% | 13.8% |
| 3 | 6–8° | 7.0% | 14.0% |
| 4 | 8°+ | 77.4% | 48.0% |

These are measured from a 5×5 stencil of 2 m samples at 8 m spacing over the playable bounds, which is the method below. The design artifact's figures came from an earlier stencil and differ by up to two points in the middle bands; they agree to within 0.1% on the only band with a consequence, the 8°+ share, and on the total flat share — 22.6% of Bakurani and 52.0% of Ozeti.

The ramp is anchored absolutely on the 8 degree threshold the app already warns at, so the same colour means the same tilt on every map. Percentages are share of total map area. Bakurani reading mostly red is the correct answer, not a calibration failure. A per-map relative ramp was rejected: it would make green mean 4 degrees on Bakurani and 1.6 degrees on Ozeti, and a legend that changes meaning between maps is worse than no legend.

**Firing positions** is a full-strength boundary with a faint interior wash, drawn above flatness. It is deliberately not a ramp: every cell in the layer has already passed the 8 degree filter, so colouring it by tilt would spend the whole scale on a distinction the layer itself guarantees is irrelevant. The boundary is computed at bake time — a boundary cell is a viable cell whose four-neighbourhood is not entirely viable — so the layer stays one image and one `drawImage`.

With both layers on, the ramp shows the terrain and the outline encloses the part of it that can range every tower. The gap between "green" and "inside the outline" is exactly the shot-clearance filter doing its work, which is otherwise invisible.

Draw order: tiles, hillshade, flatness, firing positions, contours, everything else.

## The filter pipeline

Three filters, ordered cheapest first, because the expensive one is a terrain march per aim point and only a few percent of the map reaches it. The first two run on the main thread; the third is spread across every core, since it is roughly 180 million terrain samples and everything else is noise beside it. Each worker calls the same `assessShot`, so parallelism costs nothing in agreement. Survivor figures are Bakurani at 8 m under the low-arc rule.

1. **In range of every aim point.** Nine points per tower — the centre plus eight on a 300 m ring — so 45 on Bakurani and 36 on Ozeti. All must fall inside the arc's declared envelope. Survivors 6.82 km².
2. **Hull tilt at most 8 degrees.** Least-squares plane through a 5×5 stencil of 2 m samples spanning the 8 m hull footprint. Survivors 2.57 km².
3. **Shell clears the terrain to every aim point.** Marched against the 32 m heightfield, the same source every other reachability verdict uses. Survivors 0.35 km².

A fourth step runs after those three, on the mask rather than on cells: **any viable region smaller than 16 cells is cleared.** 16 cells of 8 m is 1024 m², exactly one cell of the 32 m heightfield the clearance filter marches against, so an island smaller than that is smaller than the grid square that decided it was viable — it claims a resolution the evidence does not have, and it is not somewhere a player could reliably park in any case. Across both maps and both arcs this removes about 87% of the regions for about 3% of the area, which is what a threshold set at the noise floor should look like. Regions are four-connected: a diagonal touch is not ground you can drive along.

The artifact carried a fourth filter between 1 and 2, trimming ground more than 1 km north of the northernmost tower as too far to drive. It is cut. It removed 0.01 km² of 6.82 — 0.15% — and "north of the northernmost tower" is not a general rule: north is not special, and a third map would need a hand-tuned constant for the filter to mean anything. The playable bounds already do the real trimming.

### Two terrain sources, split by role

Tilt reads the 2 m chunks through `createTerrainSampler`; clearance reads the 32 m heightfield. The coarse field cannot answer a footprint question — at a 3 degree threshold it calls 7.2% of Bakurani flat, of which 23% is actually steeper than 5 degrees. But clearance is a verdict, and verdicts must agree with the dead-ground layer and `assessShot`, which both read the 32 m field. A firing position the layer marks viable and `assessShot` then refuses would be worse than no layer.

### Aim points

Towers are the `icon: "tower"` entries in `maps/<id>.json`. Marker coordinates are stored in metres; game units are metres divided by `coordinateMetersPerUnit`, matching `storedMetersToWorldCoordinate`. Each tower contributes its centre plus eight points on a 300 m ring at 45 degree intervals. Bakurani has five towers and Ozeti four, so the aim-point sets are 45 and 36 points; the tower count is read from the map, never assumed.

The buffer exists because towers move between matches. Changing it moves every number in this document.

## The arc toggle

The layer bakes twice and the player switches between them.

**Force low arc** matches the existing dead-ground layer, which is already labelled "Dead ground (low arc)", and is the flatter, more accurate shot. **Any mil** counts a position if either arc reaches, which is more truthful about the gun but far more permissive: the high arc reaches 1390 mil and clears almost anything.

The minimum range is enforced in both. The SPG's 780 m floor is its low-arc limit at maximum elevation, so ignoring it would mark ground the gun cannot physically reach.

The toggle is not cosmetic — it decides which team is disadvantaged, and it does so differently on each map.

| Map | Rule | Viable | Best spawn | Worst spawn |
| --- | --- | --- | --- | --- |
| Bakurani | low arc | 0.35 km² | LONESTAR 58% | MANTICORE 2% |
| Bakurani | any mil | 2.13 km² | LONESTAR 45% | VALKYRA 34% |
| Ozeti | low arc | 0.28 km² | MANTICORE 54% | VALKYRA 16% |
| Ozeti | any mil | 2.13 km² | VALKYRA 44% | MANTICORE 17% |

On Bakurani, MANTICORE holds 2% of the viable set under low arc and nothing within 2 km; allow the high arc and it holds 21%. Its problem is not distance, it is that everything in reach must be lobbed. On Ozeti the toggle flips the other way: MANTICORE leads at 54% under low arc and falls to 17% under any mil, while VALKYRA climbs from 16% to 44%. Neither map has a team that is simply worse — the ranking is a property of the arc rule, which is the argument for shipping the toggle rather than picking one.

## Layer grouping

The Layers popover currently has three groups, and `deadGround` and `crossSection` sit under **Markers**, which they are not. The two new layers split one to each of two new groups, which is what makes the reorganisation worth doing now rather than as unattached tidying.

| Group | Contents |
| --- | --- |
| Map | tiles, grid |
| Terrain | contours, shaded relief, **flatness** |
| Firing | dead ground, trajectory cross-section, **firing positions** |
| Markers | zones, polygons, preset markers, FOB areas, artillery, saved targets |
| Map tools | drawings, user markers, cursor coordinates, mil cursor |

**Terrain** is exactly the set baked from the height data and downloaded on demand — the three layers that cost a fetch and describe the ground itself. **Firing** is exactly the set derived from the ballistics model, the ones that answer whether a shell can be put somewhere. **Markers** stops containing anything that is not a marker, so its existing `mapToolMarkers` title becomes literally true.

The group-level "select all" checkboxes change what they select, which is the point: "turn on every terrain layer" is a thing someone wants, and "turn on every marker and also dead ground" is not.

## What ships

| File | Contents |
| --- | --- |
| `scripts/lib/flatness.mjs` | `planeTiltDegrees`, `tiltBand`. Pure, no terrain or ballistics dependency. |
| `scripts/lib/firing-positions.mjs` | `aimPoints`, `dropSmallRegions`, `outlineMask`. Pure geometry; no tilt. |
| `scripts/build-flatness.mjs` | CLI wrapper, `npm run build-flatness`. |
| `scripts/build-firing-positions.mjs` | CLI wrapper, `npm run build-firing-positions`. Bakes both arcs. Reports surviving area per map. |
| `scripts/lib/firing-positions-worker.mjs` | One worker's share of the clearance filter, striding through the candidate cells. |
| `js/map/flatness.js` | Same five functions as `hillshade.js`. Colourises band indices once at load. |
| `js/map/firing-positions.js` | As above, cache keyed on map and arc. |
| `data/terrain/<map>/flatness.{png,json}` | One byte per 8 m cell, band index 0–4. |
| `data/terrain/<map>/firing-positions-{low,any}.{png,json}` | One byte per 8 m cell: 0 not viable, 1 interior, 2 boundary. |

The aim-point split is deliberate: aim points are a ballistics concept with nothing to do with tilt, so the flatness build does not drag tower geometry into itself and each library is testable without the other.

### Grid geometry

Identical to the hillshade: playable bounds only, 8 m spacing, rows north to south so the raster's y axis already matches the canvas's. Bakurani is 1379 × 1379 samples, Ozeti 1069 × 972. The sidecar JSON carries the same `grid` block (`originX`, `originY`, `stepX`, `stepY`, `width`, `height`) so placement is never duplicated from the builder by hand.

### Wiring

Follows the hillshade precedent exactly: `MAP_TOOL_STATE.layers` entries defaulting off, load hooks in both `setMapLayerVisible` and `setMapLayerGroupVisible`, entries in `buildMapLayers` gated on `mapHasFlatness` / `mapHasFiringPositions`, an icon each, script tags in 11 page templates, and one call each in `renderer.js`.

Locale keys go in `en.json` only. `mapLayerHillshade` and `mapLayerCrossSection`, the two most recently added layer labels, exist in no other locale file and fall back to English at runtime; translating these two while those stay untranslated would leave a popover half in each language.

Two additions beyond that precedent. `MAP_TOOL_STATE.arcs.firingPositions` holds `'low'` or `'any'`, defaults to `'low'`, and persists with the rest of the tool state. And `buildMapLayers` renders a two-button segmented control indented beneath the firing-positions row, disabled while the layer is off, which writes that key and triggers the load for the newly selected arc. Only the selected arc's PNG is ever fetched.

New keys in `locales/en.json`: `mapLayerGroupTerrain`, `mapLayerGroupFiring`, `mapLayerFlatness`, `mapLayerFiringPositions`, `mapLayerArcLow`, `mapLayerArcAny`.

## Testing

`scripts/lib/flatness.test.mjs` checks `planeTiltDegrees` against analytic planes — a known 10 degree ramp reads 10 degrees regardless of the bearing it faces, level ground reads zero — and checks `tiltBand` at every band edge including exactly 8 degrees.

`scripts/lib/firing-positions.test.mjs` checks `aimPoints` geometry (count, ring radius, that the centre is included) and `outlineMask` against hand-built masks: a single isolated cell is all boundary, a solid block has an interior, a mask with a hole outlines the hole, and cells on the raster edge are boundary.

A runtime test in the existing `loadRuntime` style covers the two `js/map/*.js` modules: cache keyed by map and arc, a failed load cached as null so it does not re-request every redraw, and the grid-to-canvas placement matching the hillshade's half-cell convention.

Both builders print surviving area per map, and that number is part of review. It should land near 0.35 km² and 2.13 km² on Bakurani, 0.28 km² and 2.13 km² on Ozeti. A large divergence means a filter changed meaning.

## What the layers do not know

- **No water data exists in the repository.** Lake and river surfaces are perfectly flat and will read green. Both maps have both.
- **Terrain only.** Buildings and props are not in the height field, so flat ground can still be occupied.
- **SPG only.** The mortar's envelope is 132–684 m and it cannot reach the towers from outside.
- **Tilt is not attitude.** The layer says how steep the ground is, never how the hull will sit on it: heading and turret bearing decide whether that slope becomes pitch or roll, and neither is knowable.
- **Towers move between matches.** That is what the 300 m buffer absorbs.
