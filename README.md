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
- Map marker image assets with emoji fallback
- Map Tools: ruler, freehand drawing, and user-placed markers
- Ruler distance and azimuth measurement
- Persistent per-map drawings and user markers
- Localized Map Tools interface
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

## Map Tools

A floating tool menu in the bottom-right corner provides additional map utilities.

### Ruler

Select the **Ruler** tool and drag with the left mouse button between two points.

The ruler displays:

- Distance in meters / kilometers
- Azimuth in degrees
- `0°` North, `90°` East, `180°` South, `270°` West

The measurement is temporary and disappears when the left mouse button is released.

### Pencil

The **Pencil** tool allows freehand drawing directly on the map.

Drawing colors use the project's map palette:

- Red — `#d86666`
- Orange — `#d98b5f`
- Gold — `#d7a452`
- Green — `#82c596`
- Blue — `#5fa8d3`
- Cyan — `#67b7b0`
- Purple — `#a889c9`
- Light Gray — `#aeb8bf`
- Dark Gray — `#59636b`

Drawings are stored per map in `localStorage`. Hover a user-created line and use the delete control to remove it.

### User Markers

The **Markers** tool opens a grid populated from `markerIcons` in `maps/assets.json`.

Select an icon and click the map to place it. User-created markers are stored per map in `localStorage`. Hover a user-created marker to reveal its delete control.

Static markers defined by a map JSON are separate and are not removed by the Map Tools delete controls.

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


### Marker image assets

Map markers can use either Unicode emoji or image assets. Image assets are registered once in `maps/assets.json` and referenced by ID from any map JSON.

Example `maps/assets.json`:

```json
{
  "markerIcons": {
    "tower": {
      "path": "assets/map-markers/tower.webp",
      "width": 32,
      "height": 32,
      "anchorX": 0.5,
      "anchorY": 0.5
    }
  }
}
```

Then use the asset from a map marker:

```json
{
  "icon": "tower",
  "x": 5000,
  "y": 7000,
  "label": "Tower 1"
}
```

Emoji markers remain supported:

```json
{
  "emoji": "🏠",
  "x": 4500,
  "y": 6200,
  "label": "Main Base"
}
```

A marker may contain both `icon` and `emoji`. The image is preferred; the emoji is used as a fallback while the image is loading or if the referenced asset cannot be loaded. Marker-level `width`, `height`, `scale`, `anchorX`, and `anchorY` can override the defaults from `maps/assets.json`.

Image files can be placed anywhere under the project root; the included convention is:

```text
assets/map-markers/
```

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
Map Tools drawings and user markers (per-map storage)
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
├── assets/
│   └── map-markers/
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
│   │   ├── map-tools.js
│   │   ├── assets.js
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
│   ├── assets.json
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
- `map/assets.js` — marker asset registry loading and image caching
- `map/map-tools.js` — ruler, drawing tools, user markers, persistence, and Map Tools UI
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

## Multilingual SEO

The production build exposes dedicated crawlable URLs for each real UI language:

```text
/          English
/ru/       Russian
/uk/       Ukrainian
/de/       German
/fr/       French
/es/       Spanish
/pl/       Polish
/pt/       Portuguese
```

Each page includes a localized title and meta description, a self-referencing canonical URL, reciprocal `hreflang` links (plus `x-default`), Open Graph/Twitter metadata, and Schema.org `WebApplication` structured data. `sitemap.xml` contains every indexable language URL and its language alternates.

The novelty `cat` locale remains available at `/cat/`, but is intentionally marked `noindex` and excluded from `hreflang` and the sitemap because it is not a real Catalan translation.

Language switching navigates between the dedicated language URLs while all pages continue to share the same CSS, JavaScript, maps, tiles, and locale JSON files.

> Note: on a GitHub Pages **project site**, `robots.txt` is served below the project path rather than at the origin root, so crawlers do not treat it as the origin-level robots file. The sitemap and page-level robots metadata remain valid. If the project moves to a custom domain (or an origin where this repository controls `/robots.txt`), the included `robots.txt` can be used directly.


## License

This project is licensed under the **MIT License**. See `LICENSE` for details.

## Disclaimer

This is a fan-made community tool for **WARDOGS**. It is not affiliated with or endorsed by the game's developers or publisher.


## Configurable Map Tool Shortcuts

Keyboard shortcuts are configured in `config/app.json`. The default bindings are `R` ruler, `P` pencil, `M` markers, `F` coordinate search, `L` legend, and `Esc` to leave the active tool.

## Weapon Data

Weapon definitions are stored in `data/weapons.json`, so ranges and additional weapons can be updated without editing JavaScript. `rangeKm` is expressed in kilometers.

## Coordinate Search and Layer Legend

The Map Tools toolbar includes coordinate search (X/Y in meters) and a legend/layer menu. The legend can independently show or hide map tiles, grid, zones, polygons, preset markers, drawings, user markers, and artillery overlays. Layer visibility is persisted locally.
