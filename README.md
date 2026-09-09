# WARDOGS Artillery Calculator

[![Live App](https://img.shields.io/badge/Live-wardogs--map.olm.pet-d7a452?style=flat-square)](https://wardogs-map.olm.pet/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Vanilla JS](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=flat-square&logo=javascript&logoColor=000)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![GitHub Pages](https://img.shields.io/badge/Hosted_on-GitHub_Pages-222?style=flat-square&logo=github)](https://pages.github.com/)

Point at where the gun is, point at where the shell should land, and the page tells you the azimuth and the elevation in mils for both arcs. It is a map of **WARDOGS** with the ballistics of the **L81 Mortar** and the **SPH-2** wrapped around it, plus the terrain data to say whether the shot actually gets there — over the ridge in the way, and with the height difference between gun and target corrected for.

**Live app:** https://wardogs-map.olm.pet/  
**Mobile UI:** https://wardogs-map.olm.pet/mobile/

## This is a fork

A personal fork of [apollyon-sys/wardogs-calculator](https://github.com/apollyon-sys/wardogs-calculator), kept deliberately smaller than upstream. Everything here is what I actually use in game, which means a good deal of upstream has been deleted rather than disabled:

- **English only** — the other eleven locales are gone, along with the language switcher and the localized routes.
- **Dark only** — no theme toggle and no light palette.
- **No import/export** — neither for saved targets nor for map drawings.
- **No top bar, no site footer, no on-page SEO copy** — the map gets the window.
- **Terrain correction is always on**, rather than an experimental option.

Upstream is the place to go for the full-featured, many-language, actively maintained version. Fixes worth having flow back there; the deletions do not.

## What it does

- **Firing solution** — distance, azimuth, and a MIL card per arc. An arc turns red when the shot cannot be made: too close, out of reach, past an elevation stop, or masked by ground in the way.
- **Terrain** — a 3D height model per map drives the MIL correction for the height difference, the dead-ground shading, the trajectory cross-section, and a flat-ground layer for parking the SPH-2 somewhere it will not tilt.
- **Map layers** — tiles, contours, shaded relief, flat ground, viable firing positions, dead ground, grid, zones, markers, drawings, range rings.
- **Panels** — a target-area minimap and the trajectory cross-section, both foldable, over the bottom-left of the map.
- **Multiple guns** — several guns at once, each with its own rings and solution, with the active one driving the readout.
- **Saved targets** — named targets with their own firing solution and a reach badge, optionally carrying the artillery position with them.
- **Map tools** — ruler, pencil, shapes, zones, markers, eraser, targeting mode, coordinate search, and a layers popover.
- **Shared sessions** — an optional live lobby where everyone with the link edits the same map. Off unless a sync Worker is configured.
- **OBS overlay** — `/obs/`, a chrome-free route to composite over gameplay footage.
- **Pop-out solution** — the firing solution in a floating always-on-top window, on Chrome and Edge.

Maps: **Bakurani**, **Ozeti** and **Zestafona**.

## Interfaces

Two interfaces ship from the same repository and the same GitHub Pages deployment:

- **Desktop** — `/`
- **Mobile** — `/mobile/`

Phones are routed automatically from the desktop entry to the mobile route. The mobile UI is a separate map-first interface with touch panning, pinch zoom, touch-friendly point placement, map tools, and a bottom-sheet calculator. Both share the calculator logic, maps, tile pyramid, configuration, saved targets, drawings, browser storage, and lobbies.

## Quick start

```bash
npm install
npm run dev          # dev server on :8000, with live reload
```

Or build the production artifact and serve it:

```bash
npm run build
cd dist
python -m http.server 8000
```

```text
Desktop:   http://localhost:8000/
Mobile:    http://localhost:8000/mobile/
OBS:       http://localhost:8000/obs/
```

Tests:

```bash
npm run test:scripts     # build plumbing, ballistics, runtime units
npm run test:build       # checks the production artifact
```

Map tiles are not in this repository — `maps/tiles/` is gitignored, and the pyramid is ~43,700 files. A clone with no `.env` builds and runs, but the map draws empty until `TILE_BASE_URL` (and optionally `TILE_FALLBACK_BASE_URL`) point at a host that has them. See [Fork deployment](docs/deployment.md).

## Documentation

- [Features & weapons](docs/features.md) — calculator features, map tools, weapons, touch controls, coordinate system, OBS overlay
- [Maps](docs/maps.md) — map configuration, tile structure, bounds, marker zoom visibility, adding maps
- [Terrain](docs/terrain.md) — the height model, chunk format, and how the MIL correction uses it
- [Mobile interface](docs/mobile.md) — mobile routes, automatic routing, touch controls
- [Shared sessions](docs/collaboration.md) — the live lobby and the sync Worker it needs
- [Fork deployment](docs/deployment.md) — `.env` settings, tiles on R2 with a fallback host, deploying the site and the Worker
- [Development](docs/development.md) — project structure, local development, build process, deployment
- [Performance](docs/performance.md) — render budget and the measurements behind it
- [Analytics](docs/analytics.md) — opt-in Umami events and privacy
- [Message of the Day](docs/motd.md) — MOTD configuration and behavior
- [Security hardening](docs/security.md) — threat model, headers, secrets, CI
- [Contributing](docs/contributing.md) — contribution guidelines
- [License & Disclaimer](docs/legal.md) — MIT scope, third-party assets, disclaimer

Most of `docs/` came from upstream and describes the full project. Where a document disagrees with the list above, this README is the one that matches the code.

## License

Original project source code is licensed under the [MIT License](LICENSE).

WARDOGS assets and other third-party materials are not covered by the MIT License. See [License & Disclaimer](docs/legal.md) for details.
