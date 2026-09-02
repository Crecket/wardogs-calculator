## Maps

Maps are registered in:

```text
maps/index.json
```

Each map has its own JSON configuration and may define:

- Coordinate bounds
- Tile configuration
- Markers
- Zones
- Polygons
- Map-specific metadata

### Bakurani

Bakurani uses a multi-resolution WebP tile pyramid:

```text
maps/tiles/bakurani/
├── zoom_0/
├── zoom_1/
├── zoom_2/
├── zoom_3/
├── zoom_4/
├── zoom_5/
├── zoom_6/
└── zoom_7/
```

Map configuration can define coordinate bounds:

```json
{
    "id": "bakurani",
    "name": "Bakurani",
    "w": 16,
    "h": 16,

    "bounds": {
        "minX": 23.35,
        "maxX": 133.60,
        "minY": 19.34,
        "maxY": 129.65
    },

    "tileBounds": {
        "minX": 0.0,
        "maxX": 163.84,
        "minY": 0.0,
        "maxY": 163.84
    },

    "coordinateMetersPerUnit": 100,

    "tiles": {
        "path": "maps/tiles/bakurani",
        "tileSize": 256,
        "minZoom": 0,
        "maxZoom": 7,
        "extension": "webp"
    }
}
```

`bounds` defines the playable/searchable in-game coordinate extent. It is used for coordinate search, point clamping, the visible grid, and camera fit.

`tileBounds` is independent from `bounds` and defines the world-coordinate extent covered by the complete tile pyramid. This separation allows the source render to contain terrain outside the playable coordinate rectangle without shifting the in-game grid.

`coordinateMetersPerUnit` converts map-coordinate deltas into physical meters. For Bakurani, `100` means one coordinate unit equals 100 meters, so `0.01` coordinate equals 1 meter.

Map calibration is based on available in-game reference data and may be refined as more accurate information becomes available.

---

## Terrain elevation data

Map imagery and terrain elevation are separate data sources. Bakurani Terrain3D data is stored under:

```text
data/terrain/bakurani/
├── manifest.json
└── chunks/
    └── *.bin
```

The manifest describes how map coordinates resolve into terrain chunks and how stored height values are converted to elevation. The runtime loads only the chunks needed for the current Artillery and Target positions and caches them for later samples.

Terrain sampling is used to provide elevation context for SPH-2:

```text
artillery coordinate -> artillery elevation
 target coordinate    -> target elevation
                          ↓
              ΔZ = target - artillery
```

Terrain data is deliberately independent from the tile pyramid. Replacing or recalibrating map imagery does not change terrain samples unless the terrain coordinate mapping itself is changed.

In v1.6.0, Terrain3D does **not** automatically modify the firing-table MIL value. If a manifest, chunk, or terrain sample is unavailable, the calculator keeps the normal firing solution instead of treating terrain as a hard dependency.

See [Terrain Elevation & SPH-2 Setup](terrain.md) for runtime and validation details.

---

## Marker assets and user placement

Marker assets are defined in:

```text
maps/assets.json
```

Each marker asset supports a `placeable` flag:

```json
{
    "tower": {
        "path": "assets/map-markers/tower.webp",
        "width": 32,
        "height": 32,
        "anchorX": 0.5,
        "anchorY": 0.5,
        "placeable": true
    }
}
```

- `placeable: true` makes the asset available in the user **Markers** tool and allows it to be placed manually.
- `placeable: false` hides the asset from the picker and prevents user placement.
- Preset markers in map JSON can still use a non-placeable asset. The flag only controls user placement.
- If `placeable` is omitted, it defaults to `true` for backwards compatibility.

---

## Marker zoom visibility

Preset map markers support optional `minZoom` and `maxZoom` properties. These values use the **camera zoom multiplier** (`1` = Fit, `2` = 2× zoom, etc.). Both limits are inclusive.

```json
{
    "icon": "tower",
    "x": 8345,
    "y": 7294,
    "label": "Tower 4",
    "minZoom": 2,
    "maxZoom": 15
}
```

- `minZoom`: marker is hidden while camera zoom is below this value.
- `maxZoom`: marker is hidden while camera zoom is above this value.
- If either property is omitted, that side of the range is unrestricted.
- Hidden markers are also excluded from hover/click target detection.

---

## Adding a Map

1. Create a map configuration:

```text
maps/my-map.json
```

2. Register the map in:

```text
maps/index.json
```

3. Add map tiles if required:

```text
maps/tiles/my-map/
```

   `maps/tiles/` is gitignored in this fork — the pyramids are served from R2
   rather than committed. New tiles work locally straight away, but reaching a
   deployed site means uploading them: see
   [Uploading tiles](deployment.md#uploading-tiles).

4. Configure the coordinate bounds.

The map renderer is designed to be map-independent, so additional maps can be added without modifying the core rendering logic.

Terrain elevation is optional. A map without terrain data continues to use the normal coordinate, map, and firing-table behavior.

---
