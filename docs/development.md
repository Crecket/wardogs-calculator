## Project Structure

```text
wardogs-calculator/
├── .github/
│   └── workflows/
│       └── pages.yml
│
├── assets/
│   ├── flags/
│   ├── map-markers/
│   ├── favicon.png
│   └── preview.png
│
├── config/
├── data/
│   ├── ballistics/
│   └── terrain/
│       └── bakurani/
│           ├── manifest.json
│           └── chunks/
├── js/
│   ├── core/
│   │   └── mobile-redirect.js
│   ├── features/
│   │   └── terrain-ballistics.js
│   ├── map/
│   ├── mobile/
│   │   └── mobile.js
│   └── ui/
│
├── locales/
├── maps/
│   └── tiles/
│
├── styles/
│   ├── desktop/
│   │   ├── base.css
│   │   ├── layout.css
│   │   ├── controls.css
│   │   ├── map.css
│   │   ├── saved-targets.css
│   │   ├── chrome.css
│   │   ├── map-tools.css
│   │   └── motd.css
│   └── mobile/
│       ├── shell.css
│       ├── map.css
│       ├── tools.css
│       ├── sheet.css
│       └── responsive.css
│
├── scripts/
│   ├── build-pages.mjs
│   ├── dev-server.mjs
│   ├── install-terrain-release.ps1
│   └── verify-terrain-release.ps1
│
├── src/
│   └── pages/
│       ├── index.html
│       ├── locales/
│       └── mobile/
│           └── index.html
│
├── package.json
├── style.css
├── mobile.css
├── robots.txt
├── sitemap.xml
├── CNAME
├── LICENSE
└── README.md
```

`dist/` is generated during the build process and is not committed to the repository.

CSS source is split into focused modules under `styles/desktop/` and `styles/mobile/`.
The root `style.css` and `mobile.css` files are lightweight development entry points that import those modules.

During `npm run build`, the modules are concatenated in a fixed order into:

```text
dist/style.css
dist/mobile.css
```

This keeps the source maintainable while production still loads only one desktop stylesheet and one mobile override stylesheet.

The old standalone `dist-mobile/` output is no longer used. Desktop and mobile are built into one artifact.

---

## Technologies

- HTML5
- CSS3
- Vanilla JavaScript
- HTML Canvas API
- Pointer Events
- Fetch API
- JSON
- Browser `localStorage` / `sessionStorage`
- Node.js build and development scripts
- GitHub Actions
- GitHub Pages

The application itself intentionally uses **no frontend framework**.

Node.js is only used for the build/deployment process.

---

## Running Locally

The project should be served over HTTP because maps, configuration files, localization files, terrain data, and other resources are loaded using `fetch()`.

### Requirements

Install a recent version of Node.js.

### Development server

From the project root:

```bash
npm run dev
```

The development server serves source files directly, so it does **not** generate or copy `dist/` on every change.

Desktop:

```text
http://localhost:8000/
http://localhost:8000/ru/
```

Mobile:

```text
http://localhost:8000/mobile/
http://localhost:8000/mobile/ru/
```

The dev server includes live reload for JavaScript, modular CSS, page sources, locales, config, data, assets, and top-level map configuration files.

The Bakurani tile pyramid is intentionally not watched because of its size. Tiles are served directly from disk, so after replacing a tile a manual browser refresh is enough to see the new file.

Production Umami analytics are disabled by default on the development server so local testing does not pollute analytics data. The behavior is controlled by the `WARDOGS_DISABLE_ANALYTICS` environment variable.

To explicitly keep analytics disabled:

```bash
WARDOGS_DISABLE_ANALYTICS=true npm run dev
```

On PowerShell:

```powershell
$env:WARDOGS_DISABLE_ANALYTICS = "true"
npm run dev
```

To test the production Umami integration locally, explicitly enable it for that dev session:

```bash
WARDOGS_DISABLE_ANALYTICS=false npm run dev
```

On PowerShell:

```powershell
$env:WARDOGS_DISABLE_ANALYTICS = "false"
npm run dev
```

Accepted boolean values are `1` / `0`, `true` / `false`, `yes` / `no`, and `on` / `off`. When analytics are disabled, the dev server removes the Umami loader and injects a runtime flag so the application analytics wrapper does not queue custom events either. This setting affects only `npm run dev`; production builds are unchanged.

Browser caching is also disabled for local responses.

### Testing on another device

To expose the development server on the local network:

```bash
npm run dev -- --host 0.0.0.0
```

You can also change the port:

```bash
npm run dev -- --port 8080
```

Environment variables are supported as well:

```bash
HOST=0.0.0.0 PORT=8080 npm run dev
```

On PowerShell:

```powershell
$env:HOST = "0.0.0.0"
$env:PORT = "8080"
npm run dev
```

### Production build

Before committing or deploying, run:

```bash
npm run build
```

This generates the production artifact:

```text
dist/
├── index.html
├── ru/
├── de/
├── ...
├── mobile/
│   ├── index.html
│   ├── ru/
│   ├── de/
│   └── ...
├── assets/
├── js/
├── locales/
├── maps/
├── config/
└── data/
```

Large shared resources such as the Bakurani tile pyramid and Terrain3D data exist only once in the unified `dist/` artifact and are reused by both interfaces.

### Terrain3D verification

Bakurani terrain data is a release resource and should be verified before deployment:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-terrain-release.ps1
```

The verifier checks that the terrain manifest exists, all expected terrain chunks are present, recorded SHA-256 values match, release metadata is correct, and automatic MIL correction remains disabled.

The runtime terrain feature is implemented in:

```text
js/features/terrain-ballistics.js
```

Its v1.6.0 release contract is intentionally conservative:

```text
Terrain3D available  -> show ΔZ context
Terrain3D unavailable -> keep normal firing solution
MIL                   -> always comes from existing firing tables
```

See [Terrain Elevation & SPH-2 Setup](terrain.md) for the public behavior and data layout.

### Development Workflow

```text
npm run dev
    ↓
Edit source
    ↓
Browser reloads automatically
    ↓
verify Terrain3D when terrain/release data changes
    ↓
npm run build before deploy
```

---

### Map Tools state and history

Map Tool drawings, user markers, and layer preferences are stored in `localStorage` under `wardogs-map-tools`.

Undo/redo history itself is session-only and is not persisted. `Ctrl + Z`, `Ctrl + Y`, and `Ctrl + Shift + Z` cover map-content edits such as pencil/eraser changes, user marker changes, and Artillery/Target position changes. History is reset when switching maps so coordinates from one map cannot be restored into another map.

The mobile UI exposes Undo / Redo buttons inside **Layers** because hardware keyboard shortcuts are not assumed on touch devices.

---

## Unified Build

`scripts/build-pages.mjs` now creates both interfaces in a single pass:

1. Clears `dist/`
2. Copies shared assets, JavaScript, locales, map data, map tiles, config, and data resources including Terrain3D
3. Bundles modular desktop/mobile CSS into `dist/style.css` and `dist/mobile.css`
4. Generates desktop language pages
5. Generates `/mobile/` and its language routes from the mobile template
6. Copies the root `CNAME` and sitemap

There is no separate mobile CNAME or mobile deployment artifact.

---

## Deployment

Production is available at:

**https://wardogs-artillery.com/**

Mobile is part of the same deployment:

**https://wardogs-artillery.com/mobile/**

Deployment is handled automatically by GitHub Actions through:

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

4. Generates the complete production site in `dist/`
5. Uploads `dist/` as one GitHub Pages artifact
6. Deploys it to GitHub Pages

GitHub Pages should be configured to use:

```text
Settings
→ Pages
→ Build and deployment
→ Source
→ GitHub Actions
```

The only custom domain required is:

```text
wardogs-artillery.com
```

No `m.wardogs-artillery.com` DNS record or second repository is required.

Do not manually edit files inside `dist/`, as they will be regenerated during the next build.
