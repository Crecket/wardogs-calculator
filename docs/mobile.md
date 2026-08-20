# Mobile Interface

The mobile interface is a separate map-first UI built from the same repository as the desktop application.

It is published inside the same GitHub Pages artifact:

```text
https://wardogs-artillery.com/mobile/
```

There is no separate `m.` subdomain, repository, tile set, locale set, or deployment.

## Architecture

Desktop and mobile use different page shells but share the same application code and data:

```text
Desktop UI                  Mobile UI
/                           /mobile/
        \                   /
         \                 /
          shared JS / data
          shared locales
          shared maps/tiles
          shared config
          shared localStorage
```

This means map calibration, weapon data, marker changes, translations, saved targets, drawings, theme, and other stored preferences do not need separate mobile copies.

## Routes

Desktop routes:

```text
/
/ru/
/uk/
/de/
/fr/
/es/
/pl/
/pt/
/cat/
```

Mobile routes:

```text
/mobile/
/mobile/ru/
/mobile/uk/
/mobile/de/
/mobile/fr/
/mobile/es/
/mobile/pl/
/mobile/pt/
/mobile/cat/
```

Mobile pages are marked `noindex` and use the corresponding desktop page as their canonical URL.

## Automatic Mobile Routing

Desktop entry pages load `js/core/mobile-redirect.js` before the main application.

A device is routed to `/mobile/` when either:

- `navigator.userAgentData.mobile` reports a mobile device, or
- the primary pointer is coarse and the viewport is at most 900 CSS pixels wide.

The current explicit language route is preserved. For example:

```text
/ru/  ->  /mobile/ru/
/de/  ->  /mobile/de/
```

Query parameters and the URL hash are also preserved.

### Requesting the desktop UI on a phone

The mobile interface contains a **Desktop version** link. It opens the matching desktop language route with:

```text
?desktop=1
```

The desktop routing script stores that override in `sessionStorage`, so automatic mobile routing stays disabled for the current browser tab/session rather than permanently changing the user's preference.

Opening the mobile route explicitly restores automatic routing for future desktop visits.

## Touch Controls

- **Tap** an empty map position to place the currently selected Artillery/Target point.
- **Drag** an existing Artillery/Target point to reposition it.
- **Drag with one finger** on empty map space to pan.
- **Pinch with two fingers** to zoom around the gesture midpoint and pan naturally with the gesture.
- **Ruler**, **Pencil**, and **Eraser** use direct one-finger interaction while active. Eraser can remove both pencil strokes and user-placed map markers.
- Preset map markers can be tapped and selected as the current target.
- **Layers** opens to the left of the vertical tool bar so the full list has enough usable height on phones. It includes a toggle for cursor-coordinate visibility and touch-accessible Undo / Redo controls.
- **Import / Export** is available as a touch-friendly Map Tool for backing up or sharing drawings, user markers, and layer settings.
- The fullscreen Map Tool is desktop-only and is intentionally hidden on mobile browsers.
- The calculator/settings area is a swipeable bottom sheet.

The map canvas uses Pointer Events and disables native touch gestures on the canvas so browser scrolling and page zoom do not interfere with map interaction.

## Local Development

Build the complete site once:

```bash
npm run build
```

Then serve the single output directory:

```bash
cd dist
python -m http.server 8000
```

Open:

```text
http://localhost:8000/mobile/
```

Useful test viewports include:

```text
360x640
390x844
430x932
844x390
932x430
768x1024
```

## Deployment

The mobile interface requires no separate hosting configuration.

GitHub Actions runs:

```bash
npm run build
```

and deploys the single `dist/` directory. The build produces both desktop and mobile entry pages while copying large shared resources such as map tiles only once.

The only Pages custom domain remains:

```text
wardogs-artillery.com
```

## Compact Map Tools menu

On mobile, Map Tools are collapsed behind a single floating button by default. Tapping it expands the vertical tool list; tapping it again collapses the list and closes any open Map Tool popover. This keeps the map clear on small phone screens while preserving the full touch toolset.
