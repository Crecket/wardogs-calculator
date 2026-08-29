# Extraction plan

Companion to `changes.md`. That file says *what* is in the fork; this one says *in what order it can leave*, and what each piece costs to review.

**This is a living document.** Update the status board as branches are cut, PRs open and things land. Keep the analysis below it — the structural facts about why cherry-picking fails do not go stale as items ship.

Assessed against `upstream/main` at `29fd2bafd` ("feat: keyboard map camera controls"), which `fd16a725c` already merged in. **This was assessed offline — `git fetch upstream` before acting on any of it.**

Branch state at first assessment: 70 commits ahead, 21,306 insertions / 448 deletions across 128 files, excluding the 43,700 removed tiles.

---

## Status board

Statuses: `todo` · `wip` (being cut) · `branch` (branch cut, not yet proposed) · `pr` (open upstream) · `merged` · `parked`.

| # | Item(s) | What | Status | Branch |
| --- | --- | --- | --- | --- |
| 1 | 5.5 | Tower icon | `branch` | `upstream-pr/map-visuals` |
| 2 | 5.3 | Main zone circle | `branch` | `upstream-pr/map-visuals` |
| 3 | 7.1 | Positions survive a reload | [`pr` #8](https://github.com/apollyon-sys/wardogs-calculator/pull/8) | `upstream-pr/remember-positions` |
| 4 | 3.1 | Contour layer | `branch` | `upstream-pr/contour-layer` |
| 5 | 3.2–3.4, 3.7 | Heightfield + terrain range ring | `branch` | `upstream-pr/terrain-range-ring` |
| 6 | 7.2 | Saved-target highlight derived from position | `wip` | `upstream-pr/derived-highlight` |
| 7 | — | Marker tool does not turn off on a second click | `todo` | — |
| 8 | 5.1 | Tactical markers and labels | `todo` | — |
| 9 | 6.3 + 6.4 | `.env` config, analytics off by default | `todo` | — |
| 10 | 8.1–8.3 | Docs (`todo.md`, `ideas-research/`) | `todo` | — |
| 11 | 4.1 | Time of flight | `todo` | — |
| 12 | 5.2/5.4 + 8.4 | FOB build areas, drag placed markers | `todo` | — |
| 13 | 6.1 + 6.2 | Tiles from object storage | `todo` | — |
| 14 | 2.1–2.3 | Multiple guns | `todo` | — |
| 15 | 7.3–7.8 | Saved-target markers and sync | `todo` | — |
| 16 | 1.x | Shared sessions | `todo` | — |

Item 7 is not an extraction at all: it is a bug that exists in `upstream/main` unchanged, found while working here. Fixed on `feat/collab-rooms` in `caa9d9a2b`; the same 12 lines apply upstream as a standalone PR. `upstream/main`'s `markerButton` handler never calls `setMapTool()`, so a second click only closes the picker and leaves the tool armed. The `pencilButton` handler has the same shape and is not yet fixed.

Every branch is cut from `upstream/main` and carries only its own feature, and is pushed to `origin` (the fork). None have been proposed upstream. Ready-to-use PR bodies are at the bottom of this file.

Fixed along the way, on `feat/collab-rooms` rather than in any extraction branch:

- `24cd010d3` — the origin drag died without `guns.js`. See *Blocker* below.

---

## Two structural facts that shape everything below

### Cherry-picking the original commits does not work

Tested on a throwaway worktree off `upstream/main`:

| Commit | Item | Result |
| --- | --- | --- |
| `dfe9ace3e` + `fc8ff00de` | 5.5 tower icon | clean |
| `c695d217e` | 7.1 point persistence | conflict — `js/ui/inputs.js` |
| `caabf2de1` | 7.2 highlight | conflict — `js/features/collab.js`, `js/ui/inputs.js` |
| `9be00a54f` | 3.1 contours | conflict — `js/map/map-tools.js`, `package.json` |
| `3eb0425ff` | 5.1 markers | conflict — `config/app.json`, `js/core/config.js` |

Collab landed *first* in this history, so almost everything after it was written on top of collab hunks. Extraction is therefore **path-scoped diffs from the current tree** —

```
git diff upstream/main...HEAD -- <paths>
```

— with the collab hooks stripped by hand, not `git cherry-pick`. The stripping is mechanical: every hook is a `typeof collabX === 'function'` guard around one call.

### The global-script style makes this cheaper than the line count suggests

`js/map/overlays.js` gains six functions appended at the end (`drawSavedTargets`, `drawRadiusRing`, `drawRadiusSquare`, `getMainZone`, `drawMainZone`, `hexToRgba`) and rewrites nothing upstream owns. `renderer.js` is a handful of hunks, one per feature. `index.html` is `<script>` tag insertions. Locale keys group cleanly per feature. So the typical PR is *new file + one script tag + one `draw()` hunk + a few locale keys*.

Two files are the exception and gate the rest:

- `js/map/map-tools.js` — +1,006 lines, heavily collab-laced (~45 collab call sites).
- `js/features/saved-targets.js` — +900 lines, where all of §7 stacks on itself.

---

## The order

The tiers are the reasoning; the status board at the top is the live state.

### Tier 1 — trivial, land today

1. **5.5 Tower icon.** `assets/map-markers/tower.webp`. Binary swap, the one thing that cherry-picks clean (`dfe9ace3e`, `fc8ff00de`).
2. **8.1 / 8.2 / 8.3 Docs.** `docs/todo.md`, `docs/ideas-research/`, and the features/terrain/maps updates. Pure prose, zero risk. `todo.md` — every value the app draws that nobody has measured in-game — is the one with real value to the maintainer. Strip the collab and deployment references on the way out.

   *8.4 (`halfSide` not `radius`) is not a standalone PR: it renames a config key upstream does not have yet. Fold it into #5 so the key ships named correctly the first time.*

### Tier 2 — small and self-contained

3. **5.3 Main zone circle.** *Best first real PR.* `getMainZone`, `drawMainZone`, `drawRadiusRing`, `hexToRgba` appended to `overlays.js`; one `renderer.js` hunk; `mainZone` blocks in `config/app.json` and both `maps/*.json`; the `mapLayerMainZone` key; two lines in the `map-tools.js` layer registry. ~250 lines, no collab contact anywhere.
4. **7.1 Positions survive a reload.** `persistMapPoints` / `loadMapPoints` / `writeMapPoints` / `readStoredPoint` are contiguous at `js/features/saved-targets.js:334-519`, plus `MAP_POINTS_KEY` in `core.js`, one `main.js` call and one `inputs.js` hook. ~200 lines. Drop the `collabSyncShared` hook from the `inputs.js` hunk.
4b. **7.2 Saved-target highlight derived from position.** `caabf2de1` computes which row is active from where the target actually sits instead of tracking `selectedSavedTargetId`. It **deletes** state: one line from `core.js`, three from `events.js`, one each from `coordinates.js` and `mobile.js`. Fixes the highlight going stale when the target moves by any path that forgot to clear the tracked id. Port the original commit, not the fork tip, which has grown the partial/sync states from 7.6–7.8.
5. **6.3 + 6.4 `.env` config and analytics off by default.** New `scripts/lib/site-config.mjs`, the `build-pages.mjs` / `dev-server.mjs` wiring, `.env.example`, `docs/analytics.md`. Drop `collabUrl()` and leave `TILE_BASE_URL` for #9. Build-system only, no runtime risk, and it fixes a real problem: an unconfigured fork currently reports into upstream's analytics dashboard.

### Tier 3 — medium, still reviewable

6. **5.1 Tactical markers and labels.** The marker palette, the four new icons, marker labels. **Correction to an earlier estimate here:** this is not the big `map-tools.js` PR. `3eb0425ff` touches `map-tools.js` by **+77 lines**; the bulk of that file's +1,006 is collab plus the later marker work — FOB rotation is +578 (`e07538bf5`) and marker drag is +153 (`ab2892ab3`). So 5.1 stands alone at a comfortable size, and 5.2/5.4 follow separately.
7. **3.1 Contour layer.** `js/map/contours.js` (424 lines, collab-free), `scripts/build-contours.mjs`, `scripts/lib/contours.mjs` and its test, one `renderer.js` hunk, the layer toggle. **Caveat:** +715 KB of generated `contours.json` enters the tree (bakurani 547 KB, ozeti 168 KB). Name the regeneration command in the PR so the maintainer knows it is derived.
8. **4.1 Time of flight.** See *Corrections to `changes.md`* below — the stated dependency is wrong, and the `results.js` hunk needs unpicking first.

### Tier 4 — big, after the above

9. **6.1 + 6.2 Tiles from object storage.** Mechanically fine and a large win — 1.4 GB and 43,700 files out of the tree — but it is an infrastructure decision for the maintainer, not just a code review. Needs #5 landed first.
10. **3.3 + 3.7 Heightfield and terrain range ring.** 370 KB of binary heightfields plus a real ballistics model. Genuinely novel behaviour, wants its own discussion.
11. **2.1 → 2.3 Multiple guns.** `changes.md` is right that 2.1 is the keystone and that keeping `js/core/core.js` untouched is the property to preserve.
12. **7.3 – 7.8 Saved-target map markers and sync.** Stacks on itself; the hardest slice in the fork.
13. **1.x Shared sessions.** Last, as planned.

---

## Blocker (FIXED in `24cd010d3`): the origin drag died without `guns.js`

`js/events.js:530` and `js/mobile/mobile.js:50` compute the origin hit-test as:

```js
const d1 = hitGun ? Math.hypot(...) : Infinity;
```

The `typeof gunAtPoint === 'function'` guard above it *looks* like graceful degradation, but it is not. With `guns.js` absent, `hitGun` is `null`, `d1` is `Infinity`, and **the artillery marker becomes undraggable on both mouse and touch**. `mobile.js` has the same shape — no crash there, just a silently dead drag.

Consequence: **7.4 (click a saved-target marker to activate it) cannot ship before the guns work** unless that branch restores the plain `S.origin` fallback.

`24cd010d3` fixes it at the source by distinguishing *"gun picking unavailable"* from *"no gun under the cursor"* — with `guns.js` loaded nothing changes, because a miss still yields `Infinity` and that is correct (`S.origin` *is* a gun, so `gunAtPoint` would have found it); without it, `S.origin` is grabbable exactly as it was before guns became a list. The two now-reachable `hitGun.id` dereferences are guarded too. Not verified at runtime: `playwright-core` is not installed and network is blocked here, so `test/guns-pick.mjs` could not be run.

---

## Corrections to `changes.md`

- **The *(uncommitted)* markers are stale.** Items 2.8, 2.9 and 7.3 – 7.8 are all committed in `c3edba645` ("Saved targets UI improvemnts, moved gun section to card"); the working tree is clean.
- **4.1's dependency is misstated.** It says *Needs: 3.4* — the build-time ballistics lib. The actual runtime dependency is `loadProjectileModel()`, which lives in `js/map/range-ring.js:40`, a §3.7 file. Shipping 4.1 alone means extracting that loader or dragging the range ring along.
- **4.1 is entangled with 3.6 in `results.js`.** The diff interleaves the flight-time badge with the terrain-note redesign (`terrainNoteState`, `renderTerrainNote`). Those hunks need separating before either ships.
- **The extraction-notes ordering assumes cherry-picks.** 7.1, 7.2, 3.1 and 5.4 are listed as clean standalone PRs; none of them cherry-pick.

---

## Testing convention is its own conversation

Upstream has **no `test/` directory and no test script** — its `package.json` carries only `build` and `dev`. This branch adds 13 test files and a `test:scripts` script. Whichever PR goes first with tests is also proposing a testing convention for the project, so it is worth raising with the maintainer explicitly rather than smuggling in under a feature. Tier 2 #5 is the natural place: `scripts/lib/dev-env.test.mjs` is self-contained.

Note that `npm run test:scripts` currently reports 45/46 locally — *"without .env the dev server serves the originals"* fails with `expected a local tile, got 404`. That is an artefact of this tree having no `maps/tiles/` (§6.1 removed them); the test assumes tiles are present, so it passes upstream but is fragile once 6.1 lands.

---
---

# PR bodies

Copy-paste ready, one per branch. Add a new one as each branch is cut.

None of these have been verified at runtime. All are based on `29fd2bafd`.

---

## §5.5 + §5.3 — `upstream-pr/map-visuals`

https://github.com/apollyon-sys/wardogs-calculator/pull/9

Decide first: whether `drawRadiusRing`'s unused `fill`/`dash` options stay, and whether the map-centre fallback is worth carrying.

````markdown
## Main zone circle and tower marker icon

Two unrelated map visual changes. Both are additive.

### Main zone circle

Draws the scoring area: one circle per map.

A map opts in with a `mainZone` block in `maps/<map>.json`, in stored metres like the other coordinates in those files:

```json
"mainZone": {
  "x": 7991,
  "y": 7183,
  "radius": 500
}
```

Bakurani gets 500 m, Ozeti 550 m. Both radii are eyeballed, not measured in-game. They live in the map data so correcting them is a data edit.

Renders as a solid outlined circle, label on the top edge. No fill, because the zone covers a large part of the map. Not dashed, because there are already several dashed circles on screen.

New layer-menu entry `mapLayerMainZone`, on by default, drawn between the preset polygons and the pencil drawings.

`config/app.json` gains `map.rings.mainZone` for the fallback radius and the colour. `js/core/config.js` gains `getRingConfig(kind)`, which validates the radius is a positive finite number and the colour is `#rrggbb`, falling back to the built-in defaults.

If a map has no `mainZone` block, the circle falls back to the centre of the map bounds at the default radius. That is a guess, not a measured position. Neither shipped map reaches it. Can be dropped in favour of drawing nothing.

### Tower marker icon

`assets/map-markers/tower.webp` now uses the game's drill glyph instead of the placeholder.

### Review notes

- `mapLayerMainZone` is added to `locales/en.json` only. Other locales fall back to English via `tr()`. Can add it everywhere if you prefer.
- `drawRadiusRing` has `fill` and `dash` options that `drawMainZone` does not use. They are there for future ring overlays. Can be inlined out.
- `js/map/renderer.js` gains four lines. Layer ordering and numbering are unchanged.
````

---

## §7.1 — `upstream-pr/remember-positions`

https://github.com/apollyon-sys/wardogs-calculator/pull/8

Nothing outstanding.

````markdown
## Remember the artillery and target positions across a reload

Both points currently have to be placed again on every visit.

One `localStorage` key, `wardogs-map-points`:

```json
{
  "map": "bakurani",
  "origin": { "x": 5.0, "y": 5.0 },
  "target": { "x": 5.5, "y": 5.5 }
}
```

The map id is stored because the coordinates mean nothing on another map. A mismatch on load drops the stored points instead of placing the gun somewhere arbitrary.

`S.origin` and `S.target` are written from six places (map drags, coordinate inputs, saved-target restore, undo, coordinate search), but all of them end in `inputs()`, so the write hooks there once rather than at each site. `inputs()` runs on every frame of a drag, so the write is throttled by 300 ms.

`loadMapPoints()` runs in `init()` just before the existing bounds clamp, so restored points are clamped like any other. Reads are validated and both read and write are wrapped in try/catch.

+138 lines, no deletions:

```
js/core/core.js              |   3 ++
js/features/saved-targets.js | 116 +++
js/main.js                   |   6 +++
js/ui/inputs.js              |  13 +++
```
````

---

## §3.1 — `upstream-pr/contour-layer`

https://github.com/apollyon-sys/wardogs-calculator/pull/10

Decide first: the Korean string `"mapLayerContours": "등고선"` was written by an AI agent, not taken from the fork. The fork never added contour support to Korean at all, so that page would have failed to load the layer. Confirm or replace it. Also decide whether to keep the final test commit.

````markdown
## Terrain contour layer

Baked contour lines per map, toggled from the layers menu.

- `scripts/lib/contours.mjs` + `scripts/build-contours.mjs`: marching-squares tracing over the terrain heightfield already in the repo.
- `scripts/lib/terrain-source.mjs`: shared reader for the raw terrain chunks.
- `data/terrain/{bakurani,ozeti}/contours.json`: the baked output, 54 levels for Bakurani and 20 for Ozeti.
- `js/map/contours.js`: the runtime layer.
- Layer toggle, `mapLayerContours` in all 11 locales, script tag on all 11 page shells.

### Generated data

This adds ~715 KB of generated JSON (Bakurani 547 KB, Ozeti 168 KB).

`npm run build-contours` regenerates it offline from the `data/terrain/*/chunks/` already tracked here. Verified from a clean checkout of this branch: identical md5s, about 30 seconds, no network. If you would rather not track the output, the generator stands alone and this can become a build step.

### Rendering

Contours draw as Layer 2, above the tiles and below everything else, so grid, zones, polygons, drawings and markers stay legible over them. Upstream's layer comments renumber 2-8 to 3-9. No other renderer behaviour changes.

The layer round-trips through the existing layer-state persistence and the map-tools import/export without extra work.

### Review notes

- The lines are unlabelled. `docs/terrain.md` explains why: the terrain datum offset makes the absolute heights untrustworthy, while the shape they describe is fine.
- The last commit adds a unit test for the tracer and a `test:scripts` entry. The project has no test setup today, so that commit is last and separable. Drop it if you would rather decide on testing separately.
````

---

## §3.2 – §3.4 + §3.7 — `upstream-pr/terrain-range-ring`

https://github.com/apollyon-sys/wardogs-calculator/pull/11

Decide first: this one deletes and replaces upstream code in `draw()`, unlike the others. Nobody has seen it render. If any branch is worth loading locally before proposing, it is this one.

Two loose ends: `projectile-model.json`'s `sourceNote` and the matching string in `fit-ballistics.mjs` cite a design doc that is not in the branch. Rewriting them would break byte-reproducibility of the committed data, so they were left. Also, `scripts/lib/terrain-source.mjs` is shared with `upstream-pr/contour-layer` and its header comment differs by one line between the two branches.

````markdown
## Solve the max range ring against the terrain

The max range ring currently assumes flat ground. Shooting downhill reaches further than the circle shows, uphill less. This solves the ring against a baked heightfield instead.

### What is in here

- `scripts/lib/ballistics.mjs` + `scripts/fit-ballistics.mjs`: a vacuum trajectory model fitted from the shipped firing tables, giving max range as a function of height difference.
- `data/ballistics/projectile-model.json`: the fitted model.
- `scripts/lib/heightfield.mjs` + `scripts/build-heightfield.mjs`: bakes a coarse height grid per map.
- `data/terrain/{bakurani,ozeti}/heightfield.{bin,json}`: 370 KB total.
- `scripts/lib/terrain-source.mjs`: shared reader for the raw terrain chunks.
- `js/map/heightfield.js`: runtime loader and sampling.
- `js/map/range-ring.js`: the solve and the drawing.

Both generators reproduce the committed artifacts byte-identically (except a `generatedAt` timestamp) from data already tracked here.

### Rendering change

This is the one part that modifies existing code. `draw()` in `js/map/renderer.js` had the max-range circle inline under `/* Layer 5: artillery range. */`. That block is replaced with a call to `drawMaxRangeRing(a, rangePx, v.scale)`; `a`, `rangePx` and `v.scale` were already computed on the line above.

The ring is drawn as two outlines: the flat-ground range, and the extra reach where the terrain gives it. When there is no heightfield, no fitted model, or the map is unsupported, `drawMaxRangeRing` draws exactly the circle it draws today, with the same canvas calls.

The **min** range circle is untouched and stays inline. It is deliberately not height-corrected.

### Safety property

With the heightfield forced flat, every bearing returns the declared max range to within 9e-5 m, so the terrain solve cannot quietly shrink the ring relative to what the tables say.

### Review notes

- No new user-facing strings. The gain band is unlabelled.
- No CSS. Canvas only.
- `loadProjectileModel()` and `PROJECTILE_MODEL` are exported from `range-ring.js` and load in `init()`.
- The last commit adds unit tests and a browser test plus a `test:scripts` entry. The project has no test setup today, so that commit is last and separable.
````
