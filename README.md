# WARDOGS Artillery Calculator

A lightweight web-based artillery calculator for **WARDOGS**.

The calculator provides an interactive coordinate grid where you can place an artillery position and a target, then calculate the required azimuth and distance between them.

## Features

- Interactive coordinate grid
- Meter-level coordinate precision
- Artillery and target markers
- Automatic azimuth calculation
- Distance calculation in kilometers and meters
- Weapon maximum-range visualization
- Target range status
- Custom map dimensions
- Preset maps
- Zoom in/out
- Right-click map panning
- Drag-and-drop markers
- Cursor coordinates
- English and Russian localization
- Responsive layout

## Usage

1. Select a map or create a custom map.
2. Select the weapon.
3. Place the artillery position on the map.
4. Place the target.
5. The calculator automatically displays:
   - Azimuth
   - Distance
   - ΔX / ΔY
   - Whether the target is within weapon range

### Map controls

| Action | Control |
|---|---|
| Place point | Left mouse button |
| Move marker | Drag with left mouse button |
| Pan map | Drag with right mouse button |
| Zoom | Mouse wheel |
| Zoom in | `+` |
| Zoom out | `−` |
| Reset view | `Fit map` |

## Coordinate System

The map uses kilometers as its base coordinate system.

Each kilometer is divided into **10 × 10 cells**, with each small cell representing **100 meters**.

Coordinates are displayed with meter-level precision.

For example:

```text
1.00 = 100 meters
10.00 = 1 kilometer
````

The azimuth uses the following convention:

```text
0°   — North
90°  — East
180° — South
270° — West
```

## Weapons

Currently supported weapons:

* Mortar — maximum range: 600 m
* SPG — maximum range: 2 km

The weapon range is displayed directly on the map as a circle around the artillery position.

## Maps

### Custom Map

You can configure the map width and height from **1 × 1 km** up to **100 × 100 km**.

### Preset Maps

Currently available:

* Bakurani — 10 × 10 km

More maps can be added in the future.

## Technologies

The project intentionally uses no frameworks or external dependencies.

* HTML5
* CSS3
* Vanilla JavaScript
* HTML Canvas API

## Running Locally

No build process is required.

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/wardogs-artillery-calculator.git
```

Open `index.html` in a browser.

Alternatively, serve the project with any static web server.

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
├── README.md
├── LICENSE
└── .gitignore
```

## License

This project is licensed under the **MIT License**.

See [LICENSE](LICENSE) for details.

## Disclaimer

This is a fan-made community tool for **WARDOGS**.

It is not affiliated with or endorsed by the game's developers or publisher.

