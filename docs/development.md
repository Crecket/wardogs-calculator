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
├── js/
│   ├── core/
│   │   └── mobile-redirect.js
│   ├── features/
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
│   └── build-pages.mjs
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

This generates one production artifact:

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

Large shared resources such as the Bakurani tile pyramid exist only once under `dist/maps/` and are reused by both interfaces.

### 2. Start a local server

Using Python:

```bash
cd dist
python -m http.server 8000
```

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

### Development Workflow

```text
Edit source
    ↓
npm run build
    ↓
Refresh browser
```

You can keep the HTTP server running while rebuilding the project from another terminal.

---

## Unified Build

`scripts/build-pages.mjs` now creates both interfaces in a single pass:

1. Clears `dist/`
2. Copies shared assets, JavaScript, locales, map data, map tiles, and config
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
