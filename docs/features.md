## Features

### Artillery Calculator

- Automatic azimuth calculation
- Distance in meters and kilometers
- ΔX / ΔY calculation
- Weapon minimum/maximum-range visualization
- In-range / out-of-range status
- Interactive artillery and target positioning
- Automatic recalculation when positions change
- Saved target positions
- Per-gun reachability badges on saved-target rows where terrain data is available
- Optional artillery-position saving with targets
- Export/import individual saved targets or the complete saved-target list as JSON
- JSON-based weapon definitions
- Bakurani Terrain3D elevation lookup for SPH-2 result context
- ΔZ display between the artillery position and target when terrain data is available
- Prominent SPH-2 leveling guidance under the firing solution

### Tactical Map

- Interactive tiled map
- Calibrated in-game coordinate system
- Cursor coordinates with a Layers toggle
- Coordinate search
- Mouse-wheel zoom on desktop
- Touch pinch zoom on mobile
- Mouse/touch map panning
- Fullscreen mode on desktop
- Preset and custom maps
- JSON-defined markers, zones, and polygons
- Configurable map layers
- Per-marker minimum and maximum camera zoom visibility

### Map Tools

The floating Map Tools toolbar provides:

- **Ruler** — measure distance and azimuth
- **Pencil** — draw directly on the map
- **Eraser** — remove pencil strokes and user-placed map markers
- **Markers** — place tactical markers
- **Coordinate Search** — jump to specific coordinates
- **Layers** — toggle map tiles, overlays, drawings, markers, and cursor coordinates
- **Import / Export** — back up or share drawings, user markers, and layer visibility settings as JSON
- **Shared Session** — real-time collaborative planning over a shared link; hidden unless a sync service is configured
- **Undo / Redo** — drawings, erased strokes, user markers, and Artillery/Target position changes

Shared Sessions let several people edit one map together over a link. The feature is disabled unless `collab.url` is set in `config/app.json`, since it requires a service deployed separately from GitHub Pages. See [Shared Sessions](collaboration.md).

Drawings and user markers are stored locally per map and are shared between desktop and mobile because both interfaces use the same site origin. The Import / Export Map Tool exports the complete persistent Map Tools state across maps (drawings, user markers, and layer visibility settings). Imports are merged with existing user content and imported drawing/marker IDs are regenerated to avoid collisions.

### Mobile Interface

The dedicated `/mobile/` UI is designed around touch input rather than being a scaled-down desktop layout.

- One-finger map panning
- Two-finger pinch zoom around the gesture midpoint
- Tap-to-place Artillery/Target
- Drag-to-move Artillery/Target
- Touch Map Tools, including Pencil, Eraser, Markers, Layers, and Import / Export; the mobile toolbar is collapsed behind a single button by default
- Touch-accessible Undo / Redo buttons inside Layers
- Tap preset marker to select it as Target
- Swipeable bottom sheet for calculator, map settings, and saved targets
- Automatic routing from narrow coarse-pointer devices
- Desktop-version escape link

See [Mobile Interface](mobile.md) for routing and deployment details.

### Default Shortcuts

Desktop Map Tool shortcuts:

| Shortcut | Action |
|---|---|
| `R` | Ruler |
| `P` | Pencil |
| `E` | Eraser |
| `M` | Markers |
| `F` | Coordinate Search |
| `L` | Layers |
| `Esc` | Leave active tool |
| `Ctrl + Z` | Undo |
| `Ctrl + Y` | Redo |
| `Ctrl + Shift + Z` | Redo |

Desktop camera controls:

| Shortcut | Action |
|---|---|
| `W` `A` `S` `D` | Pan the map |
| Arrow keys | Pan the map |
| `Shift` + pan | Pan faster |
| `+` | Zoom in |
| `-` | Zoom out |
| Right-click drag | Pan the map |
| Mouse wheel | Zoom at the cursor |

Map Tool shortcuts and the keyboard pan speed can be configured in:

```text
config/app.json
```

---

## Supported Weapons

Weapon definitions are stored separately from the application logic:

```text
data/weapons.json
```

This allows weapons and their properties to be updated without modifying the core JavaScript.

Current weapon support includes:

| Weapon | Range |
|---|---:|
| Mortar | 132–684 m |
| SPH-2 | 780–2629 m |

---

## Coordinate System

Physical distance conversion is map-specific and is configured by `coordinateMetersPerUnit`.

For the calibrated Bakurani map:

```text
1.00 coordinate = 100 m
0.10 coordinate = 10 m
0.01 coordinate = 1 m
```

For example, the distance between:

```text
X105.00 Y115.10
X105.10 Y115.10
```

is 10 meters.

Azimuth follows standard compass bearings:

```text
0°   = North
90°  = East
180° = South
270° = West
```


## MIL firing solutions

The result panel calculates elevation in MIL from the configured ballistic tables. Mortar uses a single firing solution. SPH-2 exposes low-angle and high-angle solutions when both trajectories are available for the current distance. Weapon range limits remain separate from ballistic-table coverage, so samples outside the configured playable range are not treated as valid shots.


## Time of flight

A **TIME OF FLIGHT** row sits under the metric grid with one badge per arc,
carrying how long the shell is in the air. The badges wrap rather than
truncate, so a locale whose arc names run long stacks them instead of cutting
either one.

The mortar has a single arc, so it shows one unlabelled badge: about 17 s
anywhere in its 132–684 m envelope. That near-constancy is the weapon, not a
stuck readout — a shorter shot is a steeper one, and the extra climb cancels
the shorter reach.

The SPH-2 shows one badge per arc, each labelled with that arc's name. At
1800 m the low arc is roughly 12 s and the high arc roughly 30 s, which is the
trade-off the arc choice actually turns on: the low arc puts rounds on target
in a third of the time, the high arc clears terrain the low arc would hit.

Every value is prefixed `≈`. Nothing is measured: the seconds are derived from
the fitted vacuum model in `data/ballistics/projectile-model.json`, using the
MIL actually on screen, so a corrected MIL gets the time that belongs to it.
The derivation carries roughly ±2–4 s, which is fine for choosing an arc and
not fine for time-on-target staggering. See
[ideas-research/08-time-of-flight.md](ideas-research/08-time-of-flight.md) and
the verification entry in [todo.md](todo.md).


## Terrain elevation and SPH-2 setup

Bakurani can provide terrain height at the Artillery and Target coordinates. When both samples are available, the SPH-2 result context shows:

```text
ΔZ = target elevation - artillery elevation
```

A positive value means the target is above the artillery position. A negative value means the target is below it.

Terrain elevation now **corrects the printed MIL** on every arc, on the maps
listed in `releasePolicy.correctedMaps` (Bakurani today), and says so in a
caption when it is withheld. Vehicle attitude is still not modelled. See
[Terrain Elevation & SPH-2 Setup](terrain.md) for the release gates.

SPH-2 accuracy is also affected by vehicle attitude. A visible warning is shown under the result when SPH-2 is selected. In the gunner HUD, the two small side markers around the vehicle silhouette below `STABILIZED / ASL` indicate lateral tilt. For best accuracy, reposition the vehicle until those markers are as centered and aligned as possible and avoid parking on an obvious uphill/downhill slope.

See [Terrain Elevation & SPH-2 Setup](terrain.md) for data layout, runtime behavior, fallback rules, and validation details.

### Terrain-aware max range

On maps with elevation data the max range ring is not a circle. Height
changes how far a shell carries — roughly a metre of range per metre of
height — so the ring is solved per bearing against the ground the shell
flies over.

Two outlines are drawn:

- **The solid ring** is the reachable area, never drawn past the weapon's
  table max range.
- **A tinted band with a dashed outline** appears outside it when terrain
  buys range the firing table does not cover. It is context, like the ΔZ
  readout — the app will not print a MIL for a target out there.

A bearing that outreaches the edge of the elevation data samples the nearest
point on the boundary rather than stopping there, so the outline is never cut
off square along the map edge.

On maps without elevation data, and until the heightfield finishes loading,
the ring is the plain circle it has always been.

### Per-target reachability badges

Every saved-target row carries a small badge per gun, under the coordinates, answering the one question the range ring and the dead-ground shading already answer on the map but only for whoever reads the layers:

- **Round green ✓ — reachable.** Inside the terrain-solved ring and clear of dead ground.
- **Dashed amber ▲ — masked.** In range, but the ground between gun and target blocks every arc. Usually a gun that moves a couple of hundred metres can hit it.
- **Square red ✕ — out of range.** Past the terrain-solved max range on that bearing; a dotted variant means the target is inside the minimum-range ring instead.

Masked and out of range are deliberately never collapsed together: they call for different actions. Each state differs in shape, border style and colour, so the badges survive being read at 14 px and by a colour-blind eye, and each carries a `title` and `aria-label` naming the gun and the state. With more than one gun the badge is numbered with the gun's position in the gun list, and the active gun's badge is highlighted.

The badges are read-only local context. They are never persisted and never sent to a shared session, so two people in one room can see different badges on the same target — which is correct, because their guns are in different places.

Nothing is computed twice: the badge asks the ring solver and the dead-ground solver for the answers they already cached for the map layers, and a target is then a constant-time lookup of one bearing. Solving happens off the render path, one gun at a time in idle time, so a row shows no badge for a moment rather than blocking the list.

**Terrain-data caveat.** A badge appears only where the terrain solve is real: the map must ship a heightfield, the heightfield must have finished loading, and the projectile model must be available. On any other map, and on a custom map, no badge is drawn at all rather than a guess. Only **Bakurani** is height-corrected and alignment-validated (see [terrain.md](terrain.md)); on Ozeti the badge is only as good as the unvalidated alignment underneath it, and everywhere the whole answer inherits the accuracy of the projectile fit and the 32 m heightfield.


## Coordinate copy / paste

Artillery and Target positions can be copied in the shareable `x100.05, y109.14` format and pasted back with one action. The parser accepts labeled X/Y values, plain two-number input, decimal points, and decimal commas. Clipboard APIs are used when available, with a manual prompt fallback when browser permissions prevent direct clipboard access.


## Position locks

Artillery and Target can be locked independently against direct map interaction. A locked point cannot be moved by map clicks, marker dragging, touch dragging, or preset-marker target selection. Manual coordinate input and the coordinate Paste action remain available while a point is locked, so the lock acts as protection against accidental map edits rather than disabling intentional coordinate entry. Explicit actions such as Swap, Reset, and restoring a saved target are also left available.


## Firing-solution result hierarchy

Distance, MIL, and azimuth are treated as the three primary firing-solution values and are shown together in a high-contrast metric grid. Distance keeps meters as the primary value and kilometers as secondary context; MIL shows trajectory labels only as secondary information; ΔX and ΔY are visually de-emphasized below the main solution.


## Second-monitor pop-out

The firing solution can be popped out of the sidebar into a small floating window that stays above every other window, including a fullscreen game. The **Pop out** control sits in the top-right corner of the Result section.

It is built on Document Picture-in-Picture, the only web API that gives a genuinely always-on-top window holding live, interactive DOM. That makes it **Chromium-only** — Chrome and Edge 116+. Firefox and Safari have no equivalent, and a plain `window.open` popup drops behind a fullscreen game the moment it loses focus, so on browsers without Document PiP the control is not rendered at all rather than opening a window that only looks like the feature.

The panel node itself is moved into the second document rather than copied, so there is one firing solution, not two: `result()` keeps writing into the same elements, and the SPH-2 leveling warning and the experimental terrain-correction panel travel with it. The window is sized for a solution readout, remembers the size you left it at in `wardogs-solution-popout-size`, and scales its type with the window so the numbers stay readable when it is shrunk into a corner.

**Getting the panel back:** close the pop-out window, or press **Return to page** — either the button on the placeholder card left in the sidebar, or the one in the pop-out itself. The panel also returns automatically when the main page is closed or reloaded. It always lands back in its original slot in the sidebar.
