# Mobile build

The mobile interface is a separate map-first frontend that reuses the same calculator, map, weapon, localization, saved-target, and Map Tools code as the desktop site.

## Local development

```bash
npm run build:mobile
cd dist-mobile
python -m http.server 8001
```

Open `http://localhost:8001/`.

## Touch controls

- Tap the map to place the currently selected Artillery/Target point.
- Drag an existing Artillery/Target marker to reposition it.
- Drag an empty part of the map with one finger to pan.
- Pinch with two fingers to zoom and pan around the pinch midpoint.
- Ruler and Pencil use direct one-finger drawing while those tools are active.
- The bottom sheet can be opened from its handle or by tapping one of its tabs.

## m.wardogs-artillery.com

`npm run build:mobile` creates a standalone `dist-mobile/` directory and writes:

```text
CNAME -> m.wardogs-artillery.com
```

Deploy `dist-mobile/` as the document root of the mobile site. It is intentionally independent from the desktop `dist/` artifact so the desktop site can stay on `wardogs-artillery.com` while the mobile build is attached to `m.wardogs-artillery.com`.

A static host such as Cloudflare Pages can use:

```text
Build command: npm run build:mobile
Output directory: dist-mobile
Custom domain: m.wardogs-artillery.com
```

The same source data and JavaScript modules are used by both builds; only the page shell and mobile interaction layer are separate.
