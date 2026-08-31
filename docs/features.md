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


## Coordinate copy / paste

Artillery and Target positions can be copied in the shareable `x100.05, y109.14` format and pasted back with one action. The parser accepts labeled X/Y values, plain two-number input, decimal points, and decimal commas. Clipboard APIs are used when available, with a manual prompt fallback when browser permissions prevent direct clipboard access.


## Position locks

Artillery and Target can be locked independently against direct map interaction. A locked point cannot be moved by map clicks, marker dragging, touch dragging, or preset-marker target selection. Manual coordinate input and the coordinate Paste action remain available while a point is locked, so the lock acts as protection against accidental map edits rather than disabling intentional coordinate entry. Explicit actions such as Swap, Reset, and restoring a saved target are also left available.


## Firing-solution result hierarchy

Distance, MIL, and azimuth are treated as the three primary firing-solution values and are shown together in a high-contrast metric grid. Distance keeps meters as the primary value and kilometers as secondary context; MIL shows trajectory labels only as secondary information; ΔX and ΔY are visually de-emphasized below the main solution.


## OBS overlay

`/obs/` is a stripped route meant to be loaded as an **OBS browser source** and composited over gameplay footage. It renders the map, the active gun, the active target, the range rings and the dead-ground shading with no application chrome at all — no toolbar, no panels, no scrollbars, no MOTD — and a compact solution readout sized to survive a 1080p downscale.

The camera frames the active gun and the active target together with padding and animates between framings rather than cutting, so a viewer can follow the shot without motion sickness. A viewer who has asked their system for reduced motion gets an instant cut instead.

The overlay never sends anything to a shared session, and **the room code is never rendered anywhere on this route, in any state.** It is the only credential a room has; on stream it would be an invitation to wipe the map mid-broadcast.

### Setting it up in OBS

1. Add a **Browser** source.
2. Set the URL to `https://wardogs-artillery.com/obs/` — plus a room fragment and any options below.
3. Set **Width** to `1920` and **Height** to `1080`. The page is laid out for exactly that; a browser source cannot be resized from inside the page.
4. Leave **Shutdown source when not visible** off if you want the overlay to keep following the mission while hidden.
5. Everything is configured through the URL, because editing settings inside a browser source is miserable. Set the URL once in the source properties.

### Query API

| Parameter | Values | Default | What it does |
|---|---|---|---|
| `#room=` / `?room=` | a room code | none | Follow a shared session read-only. The fragment form matches the share links the session panel copies. Ignored when the site has no sync service configured. |
| `bg` | `transparent`, `opaque` | `transparent` | Page background. Transparent composites over gameplay; the map's own tiles stay opaque where they cover. |
| `panel` | `full`, `compact`, `none` | `full` | `full` is MIL, azimuth, distance, arc, range state and time of flight. `compact` is MIL and azimuth only. `none` hides the readout and leaves the map. |
| `corner` | `tl`, `tr`, `bl`, `br` | `bl` | Which corner the readout sits in. |
| `scale` | `0.5`–`3` | `1` | Size multiplier for the readout. Raise it when the stream is downscaled hard. |
| `pad` | `0`–`600` | `160` | Padding in pixels kept around the gun/target pair when framing. |
| `maxzoom` | `1`–`24` | `12` | How far the auto-frame may zoom in. Lower it to keep more map context, raise it for short missions. |
| `cursors` | `on`, `off` | `on` | Peer cursors and names from the shared session. |
| `frame` | `pair`, `map` | `pair` | `pair` auto-frames gun and target; `map` holds a fixed fit of the whole map. |

Example:

```text
https://wardogs-artillery.com/obs/?bg=transparent&panel=compact&corner=tr&scale=1.25#room=abcdefghjkmn
```

### Theming it

OBS can inject custom CSS per browser source. The overlay elements carry stable class names for exactly that:

| Class | Element |
|---|---|
| `.obs-overlay` | The root, carrying `data-panel` and `data-corner` |
| `.obs-readout` | The readout box |
| `.obs-gun` | The gun / weapon / index line |
| `.obs-metric`, `.obs-metric-mil`, `.obs-metric-azimuth`, `.obs-metric-range` | One metric each |
| `.obs-metric-label`, `.obs-metric-value`, `.obs-metric-sub` | Label, big number, and the sub-line (arc, range state) |
| `.obs-flight`, `.obs-flight-label`, `.obs-flight-values` | Time of flight |
| `.obs-status` | The connection line, shown only while a session is connecting or reconnecting |

`--obs-scale` on `body` is the size multiplier `?scale=` sets, and the readout is built from it, so overriding that one variable rescales the whole panel.

### Without a room

The route needs no shared session. With no room code it renders **this browser profile's own stored map** — the same guns, target and drawings the normal route would restore — which is enough for a solo streamer running the overlay in a second window on the same machine. It re-reads that state when the other window saves it, so the overlay follows along a moment behind. It never writes any of it back: the overlay is read-only against local storage as well as against a room. Switching maps in the other window is not followed, since stored points are only restored for the map they were saved on.
