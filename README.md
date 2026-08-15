# WARDOGS Artillery Calculator

A lightweight, framework-free artillery calculator for **WARDOGS**.

**Live Demo:** https://apollyon-sys.github.io/wardogs-calculator/

The calculator provides an interactive map where you can place an artillery position and target, then automatically calculate azimuth, distance, coordinate deltas, and weapon range status.

## Features

- Interactive tiled map and coordinate grid
- Bakurani map support with calibrated in-game coordinate bounds
- Automatic azimuth and distance calculation
- Distance in kilometers and meters
- ΔX / ΔY calculation
- Mortar and SPG range visualization
- Automatic recalculation when artillery or target positions change
- Drag-and-drop artillery and target markers
- Cursor coordinates
- Mouse-wheel zoom and dedicated zoom controls
- Right-click panning
- Custom map dimensions
- Preset maps loaded from JSON
- Map-specific coordinate bounds stored in map JSON
- Map-specific tile configuration stored in map JSON
- JSON-defined markers, circular zones, and complex polygons
- Saved target positions
- Optional artillery-position saving with targets
- Rename, restore, and delete saved targets
- Persistent settings and saved targets through `localStorage`
- Light and dark themes
- Multiple interface languages with automatic browser-language detection
- Responsive layout
- No framework, build system, backend, or database required

## Usage

1. Select a preset map or **Custom map**.
2. Select the weapon.
3. Select **Artillery** or **Target** mode.
4. Click the map to place the selected point, or enter its coordinates manually.
5. Move either point whenever necessary; the firing solution is recalculated automatically.
6. Drag existing markers to reposition them.
7. Use the mouse wheel to zoom and right mouse button to pan.

The result panel displays:

- Azimuth
- Distance
- Distance in meters
- ΔX / ΔY
- Maximum weapon range
- In-range / out-of-range status

## Saved Targets

Frequently used targets can be stored locally for quick reuse.

1. Position the target.
2. Optionally enable **Save artillery position**.
3. Click **Save**.
4. Click a saved target later to restore it.
5. Rename or delete saved targets using the controls beside each entry.

This is useful when the artillery position changes: saved targets can remain in place while you move the artillery marker or enter new artillery coordinates. The solution updates automatically.

Saved data includes the target name and coordinates and, optionally, the artillery coordinates.

## Map Controls

| Action | Control |
| --- | --- |
| Place point | Left mouse button |
| Move marker | Drag with left mouse button |
| Pan map | Drag with right mouse button |
| Zoom | Mouse wheel |
| Zoom in | `+` |
| Zoom out | `−` |
| Reset view | `Fit map` |

## Coordinate System

Application coordinates are stored internally in kilometers and displayed/entered in meters.

```text
1000  = 1 km
5000  = 5 km
10000 = 10 km
```

Azimuth follows the standard compass convention:

```text
0°   — North
90°  — East
180° — South
270° — West
```

Preset maps can define calibrated `bounds`. These describe which in-game coordinates correspond to the edges of the map image. Coordinate conversion is handled generically by the map-view code, so individual maps do not require hardcoded coordinate logic in JavaScript.

## Weapons

Currently supported weapons:

- **Mortar** — maximum range: 600 m
- **SPG** — maximum range: 2 km

The selected weapon's maximum range is drawn around the artillery position.

## Maps

Preset maps are registered in `maps/index.json` and stored as individual JSON files.

Bakurani is the default preset map. **Custom map** is available at the end of the map selector.

### Bakurani

Bakurani uses a multi-resolution tile pyramid:

```text
maps/tiles/bakurani/
├── zoom_0/
├── zoom_1/
├── zoom_2/
├── zoom_3/
├── zoom_4/
└── zoom_5/
```

Tiles are 256 × 256 WebP images. The tile renderer automatically chooses an appropriate tile zoom level based on the current canvas zoom and only requests the required tiles.

Bakurani's current calibrated coordinate bounds are stored in `maps/bakurani.json`:

```json
"bounds": {
  "minX": 3.445,
  "maxX": 12.34,
  "minY": 3.016,
  "maxY": 11.926
}
```

The calibration was checked against available in-game footage and may be refined as more reference data becomes available.

## Map JSON Format

Map-specific configuration belongs in the map JSON rather than in `map-view.js` or the tile renderer.

Example:

```json
{
  "id": "bakurani",
  "name": "Bakurani",
  "w": 16,
  "h": 16,

  "bounds": {
    "minX": 3.445,
    "maxX": 12.34,
    "minY": 3.016,
    "maxY": 11.926
  },

  "tiles": {
    "path": "maps/tiles/bakurani",
    "tileSize": 256,
    "minZoom": 0,
    "maxZoom": 5,
    "extension": "webp"
  },

  "markers": [],
  "zones": [],
  "polygons": []
}
```

### Map Properties

| Property | Description |
| --- | --- |
| `id` | Unique map identifier |
| `name` | Display name |
| `w` | Full coordinate-space width in kilometers |
| `h` | Full coordinate-space height in kilometers |
| `bounds` | Calibrated coordinate bounds of the map image |
| `tiles` | Optional tile-pyramid configuration |
| `markers` | Map markers |
| `zones` | Circular map zones |
| `polygons` | Arbitrary complex polygon overlays |

### Bounds

```json
"bounds": {
  "minX": 3.445,
  "maxX": 12.34,
  "minY": 3.016,
  "maxY": 11.926
}
```

`bounds` maps the edges of the rendered map image to the actual coordinate system. Different maps can therefore use different calibrated coordinate ranges without changing JavaScript.

If valid bounds are not provided, the application falls back to the full `0..w` / `0..h` coordinate space.

### Tiles

```json
"tiles": {
  "path": "maps/tiles/bakurani",
  "tileSize": 256,
  "minZoom": 0,
  "maxZoom": 5,
  "extension": "webp"
}
```

Tile files use the following layout:

```text
<path>/zoom_<zoom>/<x>_<y>.<extension>
```

For example:

```text
maps/tiles/bakurani/zoom_5/12_18.webp
```

Maps without a `tiles` configuration can still use the standard coordinate grid and overlays.

### Markers

Markers are defined in meters:

```json
{
  "emoji": "🏠",
  "x": 5000,
  "y": 7000,
  "label": "Main Base"
}
```

`emoji` and `label` are optional.

### Circular Zones

```json
{
  "color": "#d86666",
  "x": 5000,
  "y": 5000,
  "radius": 1500
}
```

`x`, `y`, and `radius` are specified in meters.

### Polygons

Maps can also contain arbitrary polygon overlays for irregular areas. Polygon data is stored in the map's `polygons` array and rendered above the map tiles.

This can be used for complex zones that cannot be represented accurately by a circle.

## Adding a New Map

1. Create a JSON file such as:

```text
maps/my-map.json
```

2. Add it to `maps/index.json`.
3. If the map uses image tiles, place them under `maps/tiles/<map-id>/` and define the `tiles` object in its JSON.
4. Define the map's calibrated `bounds` if the image does not correspond directly to `0..w` and `0..h`.

No map-specific changes to `map-view.js` or `renderer.js` should be necessary.

## Localization

Translations are stored in `locales/` and registered in `locales/index.json`.

Current localization files include:

```text
locales/
├── index.json
├── en.json
├── ru.json
├── uk.json
├── de.json
├── es.json
├── fr.json
├── pl.json
├── pt.json
└── cat.json
```

The application first checks the saved language preference, then the browser/system languages, and finally falls back to the default language configured in `locales/index.json`.

The selected language is persisted in `localStorage`.

## Themes

The calculator supports **Dark** and **Light** themes. The selected theme is persisted locally and restored automatically without requiring a page reload.

## Local Storage

The application currently uses:

```text
wardogs-language
wardogs-theme
wardogs-saved-targets
wardogs-save-artillery-position
```

Saved data remains local to the browser. Clearing site data removes these preferences and saved targets.

## Project Structure

```text
wardogs-calculator/
├── index.html
├── style.css
├── README.md
├── LICENSE
├── .gitignore
│
├── js/
│   ├── core/
│   │   ├── core.js
│   │   └── resources.js
│   │
│   ├── features/
│   │   ├── results.js
│   │   └── saved-targets.js
│   │
│   ├── map/
│   │   ├── grid.js
│   │   ├── map-view.js
│   │   ├── maps.js
│   │   ├── overlays.js
│   │   ├── renderer.js
│   │   └── tiles.js
│   │
│   ├── ui/
│   │   ├── cursor.js
│   │   ├── i18n.js
│   │   ├── inputs.js
│   │   └── theme.js
│   │
│   ├── events.js
│   └── main.js
│
├── maps/
│   ├── index.json
│   ├── bakurani.json
│   ├── example_map.json
│   └── tiles/
│       └── bakurani/
│           ├── zoom_0/
│           ├── zoom_1/
│           ├── zoom_2/
│           ├── zoom_3/
│           ├── zoom_4/
│           └── zoom_5/
│
└── locales/
    ├── index.json
    ├── en.json
    ├── ru.json
    ├── uk.json
    ├── de.json
    ├── es.json
    ├── fr.json
    ├── pl.json
    ├── pt.json
    └── cat.json
```

### JavaScript Responsibilities

- `core/core.js` — global state, constants, shared DOM references
- `core/resources.js` — resource URL and JSON loading
- `map/maps.js` — map loading and normalization
- `map/map-view.js` — generic world ↔ screen coordinate conversion
- `map/tiles.js` — tile selection, loading, caching, and rendering
- `map/grid.js` — coordinate grid and labels
- `map/overlays.js` — markers, zones, polygons, and map overlays
- `map/renderer.js` — canvas rendering pipeline and resizing
- `features/results.js` — firing solution calculations
- `features/saved-targets.js` — saved target persistence and UI
- `ui/i18n.js` — localization
- `ui/theme.js` — theme handling
- `ui/inputs.js` — coordinate/form synchronization
- `ui/cursor.js` — cursor coordinate display
- `events.js` — user interaction and event handlers
- `main.js` — application initialization

## Technologies

- HTML5
- CSS3
- Vanilla JavaScript
- HTML Canvas API
- JSON
- Fetch API
- Browser `localStorage`

The project intentionally uses no frontend framework or build system.

## Running Locally

Because maps and localization files are loaded with `fetch()`, serve the project through HTTP rather than opening `index.html` directly with `file://`.

For example:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Static Hosting

The application is fully static and can be deployed to GitHub Pages or another static hosting provider. The host only needs to serve the HTML, CSS, JavaScript, JSON, and map tile files.

## Browser Compatibility

A modern browser with support for the following is required:

- HTML5 Canvas
- ES6+ JavaScript
- Fetch API
- `localStorage`
- CSS custom properties
- Modern DOM APIs

## License

This project is licensed under the **MIT License**. See `LICENSE` for details.

## Disclaimer

This is a fan-made community tool for **WARDOGS**. It is not affiliated with or endorsed by the game's developers or publisher.
