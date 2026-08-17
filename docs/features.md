## Features

### Artillery Calculator

- Automatic azimuth calculation
- Distance in meters and kilometers
- ΔX / ΔY calculation
- Weapon maximum-range visualization
- In-range / out-of-range status
- Interactive artillery and target positioning
- Automatic recalculation when positions change
- Saved target positions
- Optional artillery-position saving with targets
- JSON-based weapon definitions

### Tactical Map

- Interactive tiled map
- Calibrated in-game coordinate system
- Cursor coordinates
- Coordinate search
- Mouse-wheel zoom
- Map panning
- Fullscreen mode
- Preset and custom maps
- JSON-defined markers, zones, and polygons
- Configurable map layers

### Map Tools

The floating Map Tools toolbar provides:

- **Ruler** — measure distance and azimuth
- **Pencil** — draw directly on the map
- **Markers** — place tactical markers
- **Coordinate Search** — jump to specific coordinates
- **Legend** — toggle map layers
- **Undo / Redo**

Drawings and user markers are stored locally per map.

### Default Shortcuts

| Shortcut | Action |
|---|---|
| `R` | Ruler |
| `P` | Pencil |
| `M` | Markers |
| `F` | Coordinate Search |
| `L` | Legend |
| `Esc` | Leave active tool |
| `Ctrl + Z` | Undo |
| `Ctrl + Y` | Redo |
| `Ctrl + Shift + Z` | Redo |

Map Tool shortcuts can be configured in:

```text
config/app.json
```

---

---

## Supported Weapons

Weapon definitions are stored separately from the application logic:

```text
data/weapons.json
```

This allows weapons and their properties to be updated without modifying the core JavaScript.

Current weapon support includes:

| Weapon | Maximum Range |
|---|---:|
| Mortar | 600 m |
| SPG | 2 km |

---

---

## Coordinate System

Application coordinates are stored internally in kilometers and displayed in meters.

```text
1000  = 1 km
5000  = 5 km
10000 = 10 km
```

Azimuth follows standard compass bearings:

```text
0°   = North
90°  = East
180° = South
270° = West
```

---
