# WARDOGS Artillery Calculator

A lightweight web-based artillery calculator for **[WARDOGS](https://store.steampowered.com/app/1867240/WARDOGS/?utm_source=chatgpt.com)**.

The calculator provides an interactive coordinate grid where you can place an artillery position and a target, then calculate the required azimuth and distance between them.

## Features

* Interactive coordinate grid
* Meter-level coordinate precision
* Artillery and target markers
* Automatic azimuth calculation
* Distance calculation in kilometers and meters
* ΔX / ΔY calculation
* Weapon maximum-range visualization
* Target range status
* Custom map dimensions
* Preset maps loaded from JSON files
* Automatic discovery of available maps
* Zoom in/out
* Right-click map panning
* Drag-and-drop markers
* Cursor coordinates
* Light and dark themes
* Automatic browser/system-language detection
* Multiple interface languages
* Languages loaded from JSON files
* Automatic language list generation
* Saved target positions
* Saved artillery positions
* Restore saved targets with a single click
* Rename saved targets
* Delete saved targets
* Persistent saved targets using `localStorage`
* Persistent language preference
* Persistent theme preference
* Persistent artillery-position saving preference
* Responsive layout
* No frameworks or build system
* No backend or database required

## Usage

1. Select a preset map or choose **Custom map**.
2. If using a custom map, specify its width and height.
3. Select the weapon.
4. Select **Artillery** or **Target** mode.
5. Click on the map to place the selected point.
6. Drag existing markers to move them.
7. The calculator automatically displays:
   * Azimuth
   * Distance
   * Distance in meters
   * ΔX / ΔY
   * Weapon range
   * Target range status

### Saving Targets

The calculator allows frequently used target positions to be saved locally.

1. Position the artillery and target.
2. Enable **Save artillery position** if the artillery position should also be stored.
3. Click **Save**.
4. A new saved target is added to the saved targets list.
5. Click a saved target to restore its position.
6. Use the edit button to rename a saved target.
7. Use the delete button to remove a saved target.

Saved targets are stored in the browser's `localStorage` and remain available after restarting or refreshing the application.

Saved target data includes:

* Target coordinates
* Optional artillery coordinates
* Target name
* Saved artillery-position preference

## Map Controls

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

Coordinates are stored internally in kilometers but are displayed and entered in meters.

For example:

```text
1000 = 1 kilometer
5000 = 5 kilometers
10000 = 10 kilometers
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

* **Mortar** — maximum range: 600 m
* **SPG** — maximum range: 2 km

Weapon definitions are currently stored in the main JavaScript application.

The selected weapon's maximum range is displayed as a circle around the artillery position.

## Maps

Maps are stored separately from the main application code as JSON files.

Available maps are loaded through `maps/index.json`, allowing new maps to be added without modifying `script.js`.

### Custom Map

Custom maps can be configured from **1 × 1 km** up to **100 × 100 km**.

When a preset map is selected, its dimensions are locked and the custom map size controls are hidden.

### Preset Maps

Preset maps are loaded from JSON files registered in `maps/index.json`.

Current map:

* Bakurani — 10 × 10 km

## Map JSON Format

Each map is represented by a separate JSON file.

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

### Map Properties

| Property  | Description                           |
| --------- | ------------------------------------- |
| `id`      | Unique map identifier                 |
| `name`    | Map name displayed in the application |
| `w`       | Map width in kilometers               |
| `h`       | Map height in kilometers              |
| `markers` | Array of map markers                  |
| `zones`   | Array of circular zones               |

### Markers

Markers can contain:

```json
{
  "emoji": "🏠",
  "x": 3000,
  "y": 7000,
  "label": "Main Base"
}
```

Coordinates are specified in meters.

The `emoji` and `label` properties are optional.

### Zones

Zones can contain:

```json
{
  "color": "#d86666",
  "x": 5000,
  "y": 5000,
  "radius": 1500
}
```

`x`, `y`, and `radius` are specified in meters.

The zone is rendered as a circular area on the map.

### Adding a New Map

Create a new `.json` file in the `maps` directory and register it in `maps/index.json`.

For example:

```text
maps/
├── index.json
├── bakurani.json
├── new-map.json
└── another-map.json
```

The application loads the registered maps and automatically adds valid maps to the map selector.

No changes to `script.js` or `index.html` are required.

## Localization

Interface translations are stored separately as JSON files in the `locales` directory.

Current languages:

```text
locales/
├── cat.json
├── de.json
├── en.json
├── es.json
├── fr.json
├── index.json
├── pl.json
├── pt.json
├── ru.json
└── uk.json
```

Currently available languages include:

* 🇬🇧 English
* 🇷🇺 Русский
* 🇺🇦 Українська
* 🇩🇪 Deutsch
* 🇪🇸 Español
* 🇫🇷 Français
* 🇵🇱 Polski
* 🇵🇹 Português
* 🐱 Cat

The Cat localization intentionally uses a humorous WARCATS / MEOWTILLERY theme.

### Language Index

`locales/index.json` contains the list of available translations.

The application uses this file to automatically populate the language selector.

Example:

```json
{
  "default": "en",
  "languages": [
    {
      "id": "en",
      "file": "en.json",
      "name": "English",
      "nativeName": "English",
      "flag": "🇬🇧"
    }
  ]
}
```

Adding a new language therefore does not require editing `index.html`.

Create a new translation file:

```text
locales/ja.json
```

and add the language to `locales/index.json`.

The application will then make it available in the language selector.

### Automatic Language Detection

When the application starts, it checks the user's saved language preference first.

If no saved preference exists, the application checks the user's browser/system languages.

If a matching translation is available, it is selected automatically.

If no matching translation exists, the application falls back to the default language defined in `locales/index.json`.

Users can manually change the language using the language selector.

The selected language is stored in `localStorage`.

## Themes

The calculator supports two visual themes:

* **Dark**
* **Light**

The selected theme is stored in `localStorage` and is restored automatically when the application starts.

Theme switching does not require a page reload.

## Local Storage

The application uses browser `localStorage` for client-side preferences and saved targets.

The following data is stored locally:

```text
wardogs-language
wardogs-theme
wardogs-saved-targets
wardogs-save-artillery-position
```

No account, server-side database, or backend is required.

Saved targets are local to the browser and are not synchronized between devices or browsers.

Clearing the browser's site data will also remove the saved targets and preferences.

## Project Structure

```text
wardogs-artillery-calculator/
├── index.html
├── style.css
├── script.js
├── README.md
├── LICENSE
├── .gitignore
│
├── maps/
│   ├── index.json
│   ├── bakurani.json
│   └── ...
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
    ├── cat.json
    └── ...
```

The main application logic is contained in `script.js`.

Visual styling is contained in `style.css`.

Maps and translations are deliberately kept outside the main JavaScript file so that content can be extended without modifying the application logic.

## Technologies

The project intentionally uses no frameworks or external dependencies.

* HTML5
* CSS3
* Vanilla JavaScript
* HTML Canvas API
* JSON
* Fetch API
* Browser `localStorage`

## Running Locally

No build process is required.

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/wardogs-artillery-calculator.git
```

Because the application loads maps and translations using `fetch()`, it should be served through a local HTTP server rather than opened directly with `file://`.

For example:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Static Hosting

The application is completely static and can be hosted on services such as GitHub Pages or other static web hosting providers.

No backend or database is required.

The server must serve the JSON files from the `maps/` and `locales/` directories.

## Adding Content

The project is designed so that most content can be added without modifying the application logic.

### Add a map

Create a map file:

```text
maps/my-map.json
```

Then register it in:

```text
maps/index.json
```

### Add a language

Create a translation file:

```text
locales/my-language.json
```

Then register it in:

```text
locales/index.json
```

This keeps map data and translations independent from the calculator itself.

## Browser Compatibility

The application requires a modern browser with support for:

* HTML5 Canvas
* ES6+ JavaScript
* `fetch()`
* `localStorage`
* CSS custom properties
* Modern DOM APIs

No browser extensions or additional software are required.

## License

This project is licensed under the **MIT License**.

See [LICENSE](LICENSE) for details.

## Disclaimer

This is a fan-made community tool for **[WARDOGS](https://store.steampowered.com/app/1867240/WARDOGS/?utm_source=chatgpt.com)**.

It is not affiliated with or endorsed by the game's developers or publisher.
