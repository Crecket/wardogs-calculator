## Project Structure

```text
wardogs-calculator/
├── .github/workflows/pages.yml
├── assets/
│   ├── flags/
│   ├── map-markers/
│   ├── favicon.png
│   └── preview.png
├── config/
├── data/
│   ├── ballistics/
│   └── terrain/
├── js/
│   ├── core/
│   ├── features/
│   ├── map/
│   ├── mobile/
│   └── ui/
│       └── locale-overrides.js
├── locales/
│   ├── index.json
│   └── zh-cn.json
├── maps/
├── scripts/
│   ├── build-pages.mjs
│   ├── build-contours.mjs
│   ├── sync-locales.mjs
│   ├── zh-cn-seo.mjs
│   ├── version-assets.mjs
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
├── styles/
│
├── sync/                     # Shared-session server (deployed separately)
│   ├── src/
│   │   ├── index.js          # Worker: room creation + WebSocket routing
│   │   ├── room.js           # Durable Object: one per room
│   │   └── ops.js            # Op validation
│   ├── test/
│   └── wrangler.jsonc
│
├── package.json
├── style.css
├── mobile.css
├── robots.txt
├── CNAME
├── LICENSE
└── README.md
```

`dist/` is generated during the build process and is not committed to the repository.

`sync/` is a self-contained Cloudflare Worker with its own `package.json` and
deployment. It is not part of the site build and is never copied into `dist/`.
The site only contacts it when `collab.url` is set in `config/app.json`; see
[Shared Sessions](collaboration.md).

CSS source is split into focused modules under `styles/desktop/` and `styles/mobile/`.
The root `style.css` and `mobile.css` files are development entry points that import
those modules; production receives bundled `dist/style.css` and `dist/mobile.css`.

The application intentionally uses no frontend framework. Runtime code is HTML5, modular CSS, Vanilla JavaScript, Canvas, Pointer Events, Fetch API, JSON and browser storage. Node.js is used only for build/development scripts.

## Running Locally

The project must be served over HTTP because maps, configuration, locales, Terrain3D and other resources are loaded with `fetch()`.

### Development server

```bash
npm run dev
```

Production analytics are disabled by default in the development server. Set `WARDOGS_DISABLE_ANALYTICS=false` only when explicitly testing the Umami integration.

To test on another device:

```bash
npm run dev -- --host 0.0.0.0
```

The source dev server continues to serve the legacy static desktop locale shells. **Generated production locales such as Simplified Chinese should be validated from a production build**, because their desktop route and SEO metadata are intentionally created by the locale synchronization step.

### Production build

Before committing or deploying, run:

```bash
npm run build
```

The build pipeline is:

```text
scripts/build-pages.mjs
        ↓
scripts/sync-locales.mjs
        ↓
scripts/version-assets.mjs
```

Responsibilities:

1. `build-pages.mjs`
   - clears `dist/`;
   - copies shared assets, JS, locales, maps, config and data;
   - bundles desktop/mobile CSS;
   - creates the normal desktop routes;
   - creates mobile locale routes from `locales/index.json`.
2. `sync-locales.mjs`
   - generates the official `/zh-cn/` desktop route from the canonical desktop shell;
   - synchronizes canonical, `hreflang`, Open Graph locale metadata and sitemap data from the locale registry;
   - applies Chinese product-intent SEO content and FAQ structured data;
   - localizes `/mobile/zh-cn/` metadata;
   - injects the shared locale runtime override before the app initializes.
3. `version-assets.mjs`
   - fingerprints the final JS/CSS assets and updates every generated HTML route.

The final artifact includes:

```text
dist/
├── index.html
├── ru/
├── de/
├── zh-cn/
│   └── index.html
├── mobile/
│   ├── index.html
│   └── zh-cn/
│       └── index.html
├── assets/
├── js/
├── locales/
├── maps/
├── config/
├── data/
└── sitemap.xml
```

Large resources such as map tiles and Terrain3D chunks exist only once and are shared by desktop/mobile locale routes.

### Simplified Chinese validation

After `npm run build`, serve `dist/` and verify:

```text
http://localhost:8000/zh-cn/
http://localhost:8000/mobile/zh-cn/
```

Check the UI, language selector, China flag, Mortar/SPH-2 naming, mobile menu, footer/legal copy, Terrain3D status and SPH-2 warning. Inspect generated HTML to confirm:

```text
lang="zh-CN"
canonical -> https://wardogs-artillery.com/zh-cn/
hreflang="zh-CN"
og:locale = zh_CN
FAQPage JSON-LD
```

Also confirm `dist/sitemap.xml` contains `/zh-cn/` and that every indexable desktop locale advertises the Chinese alternate.

## Terrain3D verification

Terrain3D remains a release resource and should be verified independently of localization work. The public safety contract remains:

```text
Terrain3D available   -> show elevation / ΔZ context
Terrain3D unavailable -> keep normal firing solution
MIL                   -> existing firing tables remain authoritative
```

Simplified Chinese localization must not change the terrain calibration, firing tables, release safety flags, or automatic-correction behavior.

## Development Workflow

```text
npm run dev
    ↓
Edit shared source / locale JSON
    ↓
Browser reloads automatically for normal source routes
    ↓
npm run build
    ↓
Validate generated locale routes + SEO
    ↓
verify Terrain3D if terrain/release data changed
    ↓
Deploy
```

## Deployment

Production:

```text
https://wardogs-artillery.com/
https://wardogs-artillery.com/mobile/
https://wardogs-artillery.com/zh-cn/
https://wardogs-artillery.com/mobile/zh-cn/
```

GitHub Actions runs `npm run build`, uploads the single `dist/` artifact and deploys it to GitHub Pages. The only custom domain remains `wardogs-artillery.com`.

Do not manually edit files inside `dist/`; they are regenerated on every build.
