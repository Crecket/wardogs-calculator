# WARDOGS Artillery Calculator

[![Live App](https://img.shields.io/badge/Live-wardogs--artillery.com-d7a452?style=flat-square)](https://wardogs-artillery.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Vanilla JS](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=flat-square&logo=javascript&logoColor=000)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![GitHub Pages](https://img.shields.io/badge/Hosted_on-GitHub_Pages-222?style=flat-square&logo=github)](https://pages.github.com/)

A lightweight, open-source artillery calculator and tactical map tool for **WARDOGS**.

**Live app:** https://wardogs-artillery.com/

The calculator provides an interactive tactical map for placing artillery and target positions and automatically calculates azimuth, distance, coordinate deltas, and weapon range status.

No framework, build system, backend, or database required.

---

## Features

### Artillery Calculator

- Automatic azimuth calculation
- Distance in meters and kilometers
- ΔX / ΔY calculation
- Weapon maximum-range visualization
- In-range / out-of-range status
- Drag-and-drop artillery and target positions
- Automatic recalculation when positions change
- Saved target positions
- Optional artillery-position saving with targets

### Tactical Map

- Interactive tiled map
- Calibrated in-game coordinate system
- Cursor coordinates
- Coordinate search
- Mouse-wheel zoom
- Right-click panning
- Preset and custom maps
- JSON-defined markers, zones and polygons
- Configurable map layers

### Map Tools

The floating Map Tools toolbar provides:

- **Ruler** — measure distance and azimuth
- **Pencil** — draw directly on the map
- **Markers** — place custom tactical markers
- **Coordinate Search** — jump to specific X/Y coordinates
- **Legend** — independently toggle map layers
- **Undo / Redo**

Drawings and user markers are stored locally per map.

### Default Shortcuts

| Key | Action |
|---|---|
| `R` | Ruler |
| `P` | Pencil |
| `M` | Markers |
| `F` | Coordinate Search |
| `L` | Legend |
| `Esc` | Leave active tool |
| `Ctrl + Z` | Undo |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Redo |

Map Tool shortcuts can be changed in `config/app.json`.

---

## Supported Weapons

Weapon definitions are stored in:

```text
data/weapons.json
````

Current weapons include:

| Weapon | Maximum Range |
| ------ | ------------: |
| Mortar |         600 m |
| SPG    |          2 km |

Additional weapons and range changes can be added without modifying JavaScript.

---

## Maps

Preset maps are registered in:

```text
maps/index.json
```

Each map has its own JSON configuration.

Currently included:

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

Map-specific configuration can contain:

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

`bounds` maps the edges of the rendered map to the in-game coordinate system.

Map calibration is based on available in-game reference footage and may be refined as more accurate reference data becomes available.

---

## Adding a Map

1. Create a map configuration:

```text
maps/my-map.json
```

2. Register it in:

```text
maps/index.json
```

3. Add tiles if required:

```text
maps/tiles/my-map/
```

4. Configure its coordinate `bounds`.

The renderer is map-independent, so adding a map should not require changes to the core JavaScript.

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

* English
* Russian
* Ukrainian
* German
* French
* Spanish
* Polish
* Portuguese
* Cat 🐈

Translations are stored under:

```text
locales/
```

The application automatically detects the browser language and remembers the selected language.

Dedicated indexable URLs are available for real languages:

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

The `/cat/` localization is intentionally excluded from search indexing.

---

## Message of the Day

Announcements can be published through:

```text
data/motd.json
```

MOTD supports:

* Multiple languages
* Scheduled start time
* Scheduled end time
* Per-message IDs
* “Don't show again”
* Local dismissal persistence

No application code needs to be modified to publish a new announcement.

---

## Project Structure

```text
wardogs-calculator/
├── assets/
├── config/
├── data/
├── locales/
├── maps/
│   └── tiles/
├── js/
│   ├── core/
│   ├── features/
│   ├── map/
│   └── ui/
│
├── index.html
├── style.css
├── robots.txt
├── sitemap.xml
├── CNAME
├── LICENSE
└── README.md
```

---

## Technologies

* HTML5
* CSS3
* Vanilla JavaScript
* HTML Canvas API
* Fetch API
* JSON
* Browser `localStorage`

The project intentionally uses **no frontend framework or build system**.

---

## Running Locally

Because maps, configuration and localization files are loaded using `fetch()`, serve the project over HTTP instead of opening `index.html` directly.

For example:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

---

## Hosting

The production version is available at:

**[https://wardogs-artillery.com/](https://wardogs-artillery.com/)**

The application is completely static and is currently hosted using GitHub Pages.

---

## Contributing

Contributions, corrections and improvements are welcome.

Useful contributions include:

* Map coordinate calibration
* POI and marker corrections
* New map data
* Weapon range corrections
* Localization improvements
* Bug fixes
* UI / QoL improvements

Feel free to open an issue or submit a pull request.

---

## License

Licensed under the [MIT License](LICENSE).

---

## Disclaimer

**WARDOGS Artillery Calculator is an unofficial, fan-made community project.**

It is not affiliated with, endorsed by, or officially associated with **BULKHEAD** or the **WARDOGS development team**.

WARDOGS and related names, trademarks and assets belong to their respective owners.
