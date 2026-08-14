# WARDOGS Artillery Calculator

A lightweight web-based artillery calculator for [**WARDOGS**](https://store.steampowered.com/app/1867240/WARDOGS/).

The calculator provides an interactive coordinate grid where you can place an artillery position and a target, then calculate the required azimuth and distance between them.

## Features

* Interactive coordinate grid
* Meter-level coordinate precision
* Artillery and target markers
* Automatic azimuth calculation
* Distance calculation in kilometers and meters
* Weapon maximum-range visualization
* Target range status
* Custom map dimensions
* JSON-based preset maps
* Automatic preset map discovery
* Zoom in/out
* Right-click map panning
* Drag-and-drop markers
* Cursor coordinates
* English and Russian localization
* Responsive layout
* No frameworks or external dependencies

## Usage

1. Select a map or create a custom map.
2. Select the weapon.
3. Place the artillery position on the map.
4. Place the target.
5. The calculator automatically displays:

   * Azimuth
   * Distance
   * ΔX / ΔY
   * Whether the target is within weapon range

### Map Controls

| Action      | Control                      |
| ----------- | ---------------------------- |
| Place point | Left mouse button            |
| Move marker | Drag with left mouse button  |
| Pan map     | Drag with right mouse button |
| Zoom        | Mouse wheel                  |
| Zoom in     | `+`                          |
| Zoom out    | `−`                          |
| Reset view  | `Fit map`                    |

## Coordinate System

The map uses kilometers as its base coordinate system.

Each kilometer is divided into **10 × 10 cells**, with each small cell representing **100 meters**.

Coordinates are displayed with meter-level precision.

For example:

```text
1.00 = 1 kilometer
0.100 = 100 meters
```

The azimuth uses the following convention:

```text
0°   — North
90°  — East
180° — South
270° — West
```

## Weapons

Currently supported weapons:

* **Mortar** — maximum range: 600 m
* **SPG** — maximum range: 2 km

The weapon range is displayed directly on the map as a circle around the artillery position.

## Maps

The calculator supports two types of maps:

* **Custom maps** — dimensions can be configured directly in the application.
* **Preset maps** — stored as individual JSON files and loaded automatically by the application.

### Custom Maps

Custom maps can be configured from **1 × 1 km** up to **100 × 100 km**.

### Preset Maps

Preset maps are stored separately from the main application code as JSON files.

Each map file contains the map dimensions, display name, markers and zones.

Example:

```json
{
  "id": "bakurani",
  "name": "Bakurani",
  "w": 10,
  "h": 10,

  "markers": [
    {
      "emoji": "🏠",
      "x": 3000,
      "y": 7000,
      "label": "Main Base"
    },
    {
      "emoji": "⚠️",
      "x": 7000,
      "y": 4000,
      "label": "Danger Zone"
    }
  ],

  "zones": [
    {
      "color": "#d86666",
      "x": 5000,
      "y": 5000,
      "radius": 1500
    },
    {
      "color": "#5fa8d3",
      "x": 8000,
      "y": 8000,
      "radius": 1000
    }
  ]
}
```

### Adding a New Map

To add a new preset, create a new `.json` file in the maps directory.

For example:

```text
maps/
├── bakurani.json
├── new-map.json
└── another-map.json
```

The application scans the available map files and loads them automatically, so adding a new map does not require modifying the main JavaScript code.

A map must contain:

| Property  | Description                   |
| --------- | ----------------------------- |
| `id`      | Unique map identifier         |
| `name`    | Map name displayed in the UI  |
| `w`       | Map width in kilometers       |
| `h`       | Map height in kilometers      |
| `markers` | Optional array of map markers |
| `zones`   | Optional array of map zones   |

### Markers

Markers can be used to display important locations on a map.

```json
{
  "emoji": "🏠",
  "x": 3000,
  "y": 7000,
  "label": "Main Base"
}
```

Coordinates are specified in meters.

### Zones

Zones can be used to highlight areas on the map.

```json
{
  "color": "#d86666",
  "x": 5000,
  "y": 5000,
  "radius": 1500
}
```

The `x` and `y` coordinates represent the center of the zone in meters, while `radius` is specified in meters.

## Technologies

The project intentionally uses no frameworks or external dependencies.

* HTML5
* CSS3
* Vanilla JavaScript
* HTML Canvas API
* JSON

## Running Locally

No build process is required.

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/wardogs-artillery-calculator.git
```

Because preset maps are loaded from JSON files, the application should be run through a local static web server rather than opened directly with `file://`.

For example:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Project Structure

```text
wardogs-artillery-calculator/
├── index.html
├── style.css
├── script.js
├── maps/
│   ├── bakurani.json
│   └── ...
├── README.md
├── LICENSE
└── .gitignore
```

The main application logic is kept separate from map data. Map-specific information is stored in individual JSON files, making it possible to add or modify maps without changing `script.js`.

## License

This project is licensed under the **MIT License**.

See [LICENSE](LICENSE) for details.

## Disclaimer

This is a fan-made community tool for [**WARDOGS**](https://store.steampowered.com/app/1867240/WARDOGS/).

It is not affiliated with or endorsed by the game's developers or publisher.
