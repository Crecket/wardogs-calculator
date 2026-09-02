# Changes in this fork

Everything below is on top of `upstream/main`, itemised so individual pieces can
be pulled out into their own PRs. Each entry says what it does, where it lives,
and what it needs to work — the last one is what decides whether it can be
extracted on its own.

Diff at a glance: 70 commits, ~20k lines added across `js/`, `scripts/`,
`sync/`, `styles/`, `test/` and `docs/` (plus the 43,700 tile files that were
*removed* from the tree — see 6.1).

Legend for **Needs:** — `none` means it can be cherry-picked as-is.

---

## 1. Shared sessions (collaborative rooms)

The largest single feature. Several people open the same room and see each
other's drawings, markers, saved targets, gun list, artillery/target positions
and weapon selection in real time. Zoom, pan and layer toggles stay local.

- **1.1 Room sync worker** — Cloudflare Worker + Durable Object, one object per
  room, holding the document and fanning out ops.
  *Files:* `sync/src/index.js`, `sync/src/room.js`, `sync/wrangler.jsonc`,
  `sync/package.json`, `sync/README.md` · *Needs:* none (deploys standalone)
- **1.2 Op validation and limits** — every op is validated and bounded server
  side (coordinate ranges, name lengths, per-room item caps).
  *Files:* `sync/src/ops.js` · *Needs:* 1.1
- **1.3 Client module** — connect/join/leave, op emit with undo inverses,
  applying remote ops, and the "bring my drawings and targets" push.
  *Files:* `js/features/collab.js` · *Needs:* 1.1
- **1.4 Hooks in the existing features** — map tools and saved targets call
  `collabOn*()` hooks that are no-ops when the feature is off.
  *Files:* `js/map/map-tools.js`, `js/features/saved-targets.js` · *Needs:* 1.3
- **1.5 Toolbar button, panel and strings** — the Shared Session tool, its
  popover, and translations for every locale.
  *Files:* `styles/desktop/map-tools.css`, `src/pages/*.html`, `locales/*.json`
  · *Needs:* 1.3
- **1.6 Self-disabling when unconfigured** — no button, no network calls, no
  behaviour change at all when `COLLAB_URL` is absent. This is what makes the
  whole feature safe to merge before anyone runs a server.
  *Files:* `js/features/collab.js`, `js/core/config.js` · *Needs:* 1.3
- **1.7 Fail fast on a refused join** — a room that rejects the join surfaces
  the reason instead of hanging.
  *Files:* `js/features/collab.js`, `sync/src/room.js` · *Needs:* 1.3
- **1.8 Heartbeats that do not wake the room** — answers pings without loading
  the Durable Object, and stops rewriting the idle deadline on every op.
  *Files:* `sync/src/room.js` · *Needs:* 1.1
- **1.9 Tests** — two-peer browser test, a disabled-mode regression test, a
  smoke test and a guns-specific test.
  *Files:* `sync/test/*.mjs` · *Needs:* 1.1–1.3
- **1.10 Docs** — `docs/collaboration.md`, `sync/README.md` · *Needs:* none

## 2. Multiple guns

- **2.1 Artillery becomes a list** — `S.origin` and `S.weapon` turn into
  accessors onto the selected gun, so every existing reader (events, results,
  inputs, point locks, mobile) is untouched and `js/core/core.js` never
  conflicts on an upstream merge. This is the keystone: 2.2–2.7 all sit on it.
  *Files:* `js/features/guns.js` · *Needs:* none
- **2.2 Gun list panel** — add, select, hide/show, remove, with a per-gun row.
  *Files:* `js/features/guns.js`, `styles/desktop/saved-targets.css`,
  `src/pages/*.html` · *Needs:* 2.1
- **2.3 Per-gun overlays** — every visible gun draws its own range rings and
  target line; the selected one draws on top, the rest dimmed.
  *Files:* `js/map/guns-overlay.js`, `js/map/renderer.js` · *Needs:* 2.1
- **2.4 Persistence and migration** — the list survives a reload, and a stored
  single origin from an older build is migrated into gun 1.
  *Files:* `js/features/saved-targets.js` · *Needs:* 2.1, 7.1
- **2.5 Guns as their own collab op family** — `gun.add` / `gun.remove`, with
  the client and worker in step.
  *Files:* `sync/src/ops.js`, `sync/src/room.js`, `js/features/collab.js`
  · *Needs:* 1.1, 2.1
- **2.6 Pick up the gun you click** — clicking any drawn gun selects and drags
  that one rather than teleporting the selected gun onto it. Shared rule for
  mouse and touch.
  *Files:* `js/map/guns-overlay.js`, `js/events.js`, `js/mobile/mobile.js`
  · *Needs:* 2.1
- **2.7 Weapon swap follows its gun** — fixes a swap landing on the wrong gun
  in a room.
  *Files:* `js/features/collab.js` · *Needs:* 2.5
- **2.8 Rename a gun** — ✎ on each row, prompt-based, matching saved targets.
  Persists and syncs. *(uncommitted)*
  *Files:* `js/features/guns.js`, `locales/*.json` · *Needs:* 2.2
- **2.9 Gun panel floats over the map** — moved out of the sidebar to the
  top-left of the map window, opposite the saved targets, reusing their panel
  chrome. *(uncommitted)*
  *Files:* `src/pages/*.html`, `styles/desktop/saved-targets.css` · *Needs:* 2.2
- **2.10 Tests** — model, persistence, picking, rendering, collab and UI.
  *Files:* `test/guns-*.mjs`, `test/helpers.mjs` · *Needs:* 2.1

## 3. Terrain

- **3.1 Contour layer** — baked contour lines per map, drawn under everything
  that sits on the ground, toggled from the layers menu.
  *Files:* `js/map/contours.js`, `scripts/build-contours.mjs`,
  `scripts/lib/contours.mjs`, `data/terrain/*/contours.json` · *Needs:* none
- **3.2 Shared terrain chunk reader** — one reader behind every generator that
  consumes raw terrain.
  *Files:* `scripts/lib/terrain-source.mjs` · *Needs:* none
- **3.3 Baked heightfield** — a coarse grid baked per map, plus its geometry and
  sampling helpers, loaded at runtime.
  *Files:* `scripts/build-heightfield.mjs`, `scripts/lib/heightfield.mjs`,
  `js/map/heightfield.js`, `data/terrain/*/heightfield.*` · *Needs:* 3.2
- **3.4 Vacuum trajectory solver** — the model the corrections are solved
  against, fitted from the shipped firing tables.
  *Files:* `scripts/lib/ballistics.mjs`, `scripts/fit-ballistics.mjs`,
  `data/ballistics/projectile-model.json` · *Needs:* none
- **3.5 Precomputed elevation correction grid** — the fit turned into a lookup
  the client can use without solving anything at runtime.
  *Files:* `scripts/build-height-correction.mjs`,
  `data/ballistics/height-correction.json` · *Needs:* 3.4
- **3.6 Height correction, gated** — applies to every arc where the inputs are
  trusted, captions corrected vs uncorrected arcs, and warns only when the MIL
  genuinely cannot be trusted.
  *Files:* `js/features/terrain-ballistics.js`, `js/ui/locale-overrides.js`,
  `data/ballistics/terrain-context.json` · *Needs:* 3.3, 3.5
- **3.7 Max range ring against the terrain** — the ring is solved against the
  heightfield instead of assuming flat ground, with the extra reach from
  shooting downhill drawn as its own band.
  *Files:* `js/map/range-ring.js`, `js/map/guns-overlay.js` · *Needs:* 3.3, 3.4
- **3.8 Tests** — `scripts/lib/*.test.mjs`, `test/range-ring.mjs` · *Needs:* per item

## 4. Firing solution

- **4.1 Time of flight** — how long the shell is in the air, per arc, for the
  SPH-2 and the mortar, in a badge next to the solution.
  *Files:* `js/features/flight-time.js`, `js/features/results.js`,
  `test/flight-time.mjs` · *Needs:* 3.4

## 5. Map content

- **5.1 Tactical markers and labels** — a marker palette, placement, and text
  labels, with new artwork (artillery, FOB, tank, spawn vehicle).
  *Files:* `js/map/map-tools.js`, `js/map/overlays.js`, `js/map/assets.js`,
  `assets/map-markers/*` · *Needs:* none
- **5.2 FOB build areas** — a square build area around every placed FOB, sized
  from `config/app.json` (`map.rings.fob.halfSide`), rotatable.
  *Files:* `js/map/overlays.js`, `js/map/map-tools.js`, `config/app.json`
  · *Needs:* 5.1
- **5.3 Main zone circle** — drawn from `map.rings.mainZone.radius`.
  *Files:* `js/map/overlays.js`, `config/app.json` · *Needs:* none
- **5.4 Drag placed markers** — dragging an existing marker moves it instead of
  stacking a new one on top.
  *Files:* `js/map/map-tools.js`, `js/map/overlays.js` · *Needs:* 5.1
- **5.5 Tower marker uses the game's drill glyph.**
  *Files:* `assets/map-markers/tower.webp` · *Needs:* none

## 6. Build, deployment and hosting

- **6.1 Tiles served from object storage** — `maps/tiles/` leaves the tree
  (43,700 files, 1.4 GB) and the site points at a bucket at build time via
  `TILE_BASE_URL`. Clone and Pages-build time drops accordingly.
  *Files:* `scripts/sync-tiles.mjs`, `scripts/lib/sigv4.mjs`,
  `scripts/lib/site-config.mjs`, `.gitignore` · *Needs:* none
  *Live example:* `https://wardogs-tiles.olm.pet/bakurani/zoom_7/64_70.webp`
- **6.2 Incremental tile upload** — lists what the bucket holds and uploads only
  what is missing or a different size; `--dry-run`, `--prune`, `--force`,
  `--untrack`. Re-running costs one listing pass, not 43,700 uploads.
  *Files:* `scripts/sync-tiles.mjs` · *Needs:* 6.1
- **6.3 `.env` for everything environment-specific** — `COLLAB_URL`,
  `TILE_BASE_URL`, `ANALYTICS_WEBSITE_ID`, read by both `npm run build` and
  `npm run dev`, injected into the built copy only so the tracked config keeps
  its nulls.
  *Files:* `scripts/lib/site-config.mjs`, `scripts/build-pages.mjs`,
  `scripts/dev-server.mjs`, `.env.example` · *Needs:* none
- **6.4 Analytics off unless configured** — the tracker tag ships in the page
  shells, so an unconfigured fork would otherwise report into upstream's
  dashboard.
  *Files:* `scripts/build-pages.mjs`, `scripts/lib/site-config.mjs`,
  `docs/analytics.md` · *Needs:* 6.3
- **6.5 Dev server parity** — reads the same `.env`, prints where tiles and
  rooms are pointed, and can disable production analytics for the session.
  *Files:* `scripts/dev-server.mjs`, `scripts/lib/dev-env.test.mjs` · *Needs:* 6.3
- **6.6 Fork deployment docs** — `docs/deployment.md` · *Needs:* none

## 7. Saved targets

- **7.1 Positions survive a reload** — artillery and target are stored per map
  and restored on load.
  *Files:* `js/features/saved-targets.js`, `js/ui/inputs.js`, `js/main.js`
  · *Needs:* none
- **7.2 Highlight derived from position** — which row is active is computed from
  where the target actually sits rather than tracked separately, so a peer
  moving the target updates it too.
  *Files:* `js/features/saved-targets.js` · *Needs:* none
- **7.3 Saved targets drawn on the map** — every saved target renders as a light
  orange marker with its list number above it; the one you are on is not drawn
  twice. *(uncommitted)*
  *Files:* `js/map/overlays.js`, `js/map/renderer.js` · *Needs:* none
- **7.4 Click a marker to activate it** — mouse and touch, sharing one hit-test
  rule, respecting point locks. *(uncommitted)*
  *Files:* `js/features/saved-targets.js`, `js/events.js`, `js/mobile/mobile.js`
  · *Needs:* 7.3
- **7.5 Numbered rows** — the row index and the map label come from the same
  order. *(uncommitted)*
  *Files:* `js/features/saved-targets.js`, `styles/desktop/saved-targets.css`
  · *Needs:* 7.3
- **7.6 Artillery position always stored, toggled per target** — a small
  artillery button on each row decides whether restoring that target also moves
  the guns. The `saveArtilleryPosition` checkbox now only sets the default for
  new targets. *(uncommitted)*
  *Files:* `js/features/saved-targets.js`, `sync/src/ops.js`, `locales/*.json`
  · *Needs:* none (worker change needed for room fidelity)
- **7.7 Sync a saved target to your current position** — one button per row that
  writes your current target (and gun, if the toggle is on) into that saved
  target. Hidden wherever it would create a duplicate. *(uncommitted)*
  *Files:* `js/features/saved-targets.js`, `js/features/collab.js` · *Needs:* 7.6
- **7.8 Full / partial / no match** — a target with the artillery toggle on
  describes two points, so the row distinguishes "fully restored" from "on the
  target, guns elsewhere" (dashed row, sync stays available to reconcile).
  *(uncommitted)*
  *Files:* `js/features/saved-targets.js`, `styles/desktop/saved-targets.css`
  · *Needs:* 7.6, 7.7

## 8. Docs and housekeeping

- **8.1 `docs/todo.md`** — every value the app draws that nobody has measured
  in-game, with what it currently is, where it lives and what evidence it rests
  on. Each entry is one edit away from being settled. *Needs:* none
- **8.2 `docs/ideas-research/ranked-ideas.md`** — every idea for the tool in one
  ranked list, with shipped items marked. *Needs:* none
- **8.3 Feature, terrain and map docs updated** — `docs/features.md`,
  `docs/terrain.md`, `docs/maps.md`, `docs/development.md`. *Needs:* none
- **8.4 FOB build area named a half-side, not a radius** — the config key said
  one thing and meant another. *Files:* `config/app.json`, `js/map/overlays.js`
  · *Needs:* 5.2

---

## Extraction notes

Cleanest standalone PRs, roughly in increasing order of size: 5.5, 8.4, 8.1,
5.3, 7.1, 7.2, 5.4, 3.1, 6.4, 6.3, 6.1+6.2, 4.1, 3.3+3.7, 2.1+2.2+2.3, 1.x.

Two things to know before splitting:

- **Everything in §7.3–7.8 stacks on itself** but not on the rest of the fork —
  it only touches saved targets, the two input paths and the overlay layer.
- **§2.1 is a prerequisite for the entire guns feature.** It is deliberately
  written so `js/core/core.js` stays untouched, which is what keeps the fork
  merging cleanly with upstream; a PR should keep that property.
