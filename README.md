# WARDOGS Artillery Calculator

[![Live App](https://img.shields.io/badge/Live-wardogs--artillery.com-d7a452?style=flat-square)](https://wardogs-artillery.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Vanilla JS](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=flat-square&logo=javascript&logoColor=000)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![GitHub Pages](https://img.shields.io/badge/Hosted_on-GitHub_Pages-222?style=flat-square&logo=github)](https://pages.github.com/)

A lightweight, open-source artillery calculator and tactical map tool for **WARDOGS**.

**Live app:** https://wardogs-artillery.com/

![WARDOGS Artillery Calculator](assets/preview.png)

---

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
└── zoom_5/
```

Map configuration can define coordinate bounds:

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
    }
}
```

`bounds` maps the rendered map image to the in-game coordinate system.

Map calibration is based on available in-game reference data and may be refined as more accurate information becomes available.

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

4. Configure the coordinate bounds.

The map renderer is designed to be map-independent, so additional maps can be added without modifying the core rendering logic.

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

## Localization

The application currently supports:

- English
- Russian
- Ukrainian
- German
- French
- Spanish
- Polish
- Portuguese
- Cat 🐈

Translation data is stored under:

```text
locales/
```

The application automatically selects a language based on the user's browser/system locale.

If the user manually selects another language, that preference is stored locally and takes priority on future visits.

### Localized URLs

Search-indexable localized pages are available at:

```text
/
├── ru/
├── uk/
├── de/
├── fr/
├── es/
├── pl/
└── pt/
```

For example:

```text
https://wardogs-artillery.com/ru/
https://wardogs-artillery.com/de/
```

The Cat localization is intentionally excluded from search indexing.

---

## Localized Page Sources

Localized HTML entry pages are kept outside the repository root:

```text
src/
└── pages/
    ├── index.html
    └── locales/
        ├── ru.html
        ├── uk.html
        ├── de.html
        ├── fr.html
        ├── es.html
        ├── pl.html
        ├── pt.html
        └── cat.html
```

These files are transformed into the public directory structure during the build process.

For example:

```text
src/pages/locales/ru.html
        ↓
dist/ru/index.html
        ↓
https://wardogs-artillery.com/ru/
```

This keeps the repository root clean without changing any public URLs.

---

## Message of the Day

Announcements can be published through:

```text
data/motd.json
```

MOTD supports:

- Multiple languages
- Scheduled start time
- Scheduled end time
- Per-message IDs
- "Don't show again"
- Local dismissal persistence

A new announcement can therefore be published without modifying the application logic.

---

## Project Structure

```text
wardogs-calculator/
├── .github/
│   └── workflows/
│       └── pages.yml
│
├── assets/
│   ├── flags/
│   ├── favicon.png
│   └── preview.png
│
├── config/
├── data/
├── js/
│   ├── core/
│   ├── features/
│   ├── map/
│   └── ui/
│
├── locales/
├── maps/
│   └── tiles/
│
├── scripts/
│   └── build-pages.mjs
│
├── src/
│   └── pages/
│       ├── index.html
│       └── locales/
│
├── package.json
├── style.css
├── robots.txt
├── sitemap.xml
├── CNAME
├── LICENSE
└── README.md
```

`dist/` is generated during the build process and is not committed to the repository.

---

## Technologies

- HTML5
- CSS3
- Vanilla JavaScript
- HTML Canvas API
- Fetch API
- JSON
- Browser `localStorage`
- Node.js build script
- GitHub Actions
- GitHub Pages

The application itself intentionally uses **no frontend framework**.

Node.js is only used for the build/deployment process.

---

## Running Locally

The project should be served over HTTP because maps, configuration files, localization files, and other resources are loaded using `fetch()`.

### Requirements

Install a recent version of Node.js.

Python can optionally be used to run a simple local HTTP server.

### 1. Build the site

From the project root:

```bash
npm run build
```

This generates:

```text
dist/
```

with the same directory structure that is deployed to production.

### 2. Start a local server

Using Python:

```bash
cd dist
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

Localized pages can be tested using the same URL structure as production:

```text
http://localhost:8000/ru/
http://localhost:8000/uk/
http://localhost:8000/de/
```

### Development Workflow

When modifying the project:

```text
Edit source
    ↓
npm run build
    ↓
Refresh browser
```

You can keep the HTTP server running while rebuilding the project from another terminal.

---

## Deployment

Production is available at:

**https://wardogs-artillery.com/**

Deployment is handled automatically by GitHub Actions.

The workflow is located at:

```text
.github/workflows/pages.yml
```

On a push to `main`, GitHub Actions:

1. Checks out the repository
2. Sets up Node.js
3. Runs:

```bash
npm run build
```

4. Generates the production site in:

```text
dist/
```

5. Uploads the generated site as a GitHub Pages artifact
6. Deploys it to GitHub Pages

GitHub Pages should therefore be configured to use:

```text
Settings
→ Pages
→ Build and deployment
→ Source
→ GitHub Actions
```

Do not manually edit files inside `dist/`, as they will be regenerated during the next build.

---

## Contributing

Contributions, corrections, and improvements are welcome.

Useful contributions include:

- Map coordinate calibration
- POI and marker corrections
- New map data
- Weapon range corrections
- Localization improvements
- Bug fixes
- UI / QoL improvements

Feel free to open an issue or submit a pull request.

When changing localized entry pages, modify the files under:

```text
src/pages/
```

rather than generated files in `dist/`.

---

## License

The original source code of this project is licensed under the [MIT License](LICENSE).

You are free to use, modify, and distribute the source code in accordance with the terms of the MIT License.

### Third-Party Assets

The MIT License applies only to original source code and other original material created for this project.

WARDOGS game assets, map imagery, icons, textures, logos, trademarks, names, and other third-party materials included in or referenced by this project are **not covered by the MIT License**.

All such materials remain the property of their respective copyright holders.

No ownership of WARDOGS or other third-party intellectual property is claimed by this project.

---

## Disclaimer

**WARDOGS Artillery Calculator is an unofficial, fan-made community project.**

It is not affiliated with, endorsed by, or officially associated with **BULKHEAD** or the **WARDOGS development team**.

WARDOGS and related names, trademarks, and assets belong to their respective owners.