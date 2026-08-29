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
| 1 | 5.5 | Tower icon | [`pr` #9](https://github.com/apollyon-sys/wardogs-calculator/pull/9) | `upstream-pr/map-visuals` |
| 2 | 5.3 | Main zone circle | [`pr` #9](https://github.com/apollyon-sys/wardogs-calculator/pull/9) | `upstream-pr/map-visuals` |
| 3 | 7.1 | Positions survive a reload | [`pr` #8](https://github.com/apollyon-sys/wardogs-calculator/pull/8) | `upstream-pr/remember-positions` |
| 4 | 3.1 | Contour layer | [`pr` #10](https://github.com/apollyon-sys/wardogs-calculator/pull/10) | `upstream-pr/contour-layer` |
| 5 | 3.2–3.4, 3.7 | Heightfield + terrain range ring | [`pr` #11](https://github.com/apollyon-sys/wardogs-calculator/pull/11) | `upstream-pr/terrain-range-ring` |
| 6 | 7.2 | Saved-target highlight derived from position | [`pr` #13](https://github.com/apollyon-sys/wardogs-calculator/pull/13) | `upstream-pr/derived-highlight` |
| 7 | — | Marker tool does not turn off on a second click | [`pr` #12](https://github.com/apollyon-sys/wardogs-calculator/pull/12) | `upstream-pr/marker-tool-toggle` |
| 8 | 5.1 | Tactical marker icons and picker labels | [`pr` #14](https://github.com/apollyon-sys/wardogs-calculator/pull/14) | `upstream-pr/tactical-markers` |
| 9 | 6.3 + 6.4 | `.env` config, analytics off by default | `parked` | — |
| 10 | 8.1–8.3 | Docs (`todo.md`, `ideas-research/`) | `parked` | — |
| 11 | 4.1 | Time of flight | [`pr` #15](https://github.com/apollyon-sys/wardogs-calculator/pull/15) | `upstream-pr/flight-time` (stacks on #11) |
| 12 | 5.2/5.4 + 8.4 | FOB build areas, drag placed markers | [`pr` #16](https://github.com/apollyon-sys/wardogs-calculator/pull/16) | `upstream-pr/fob-build-areas` (stacks on #9) |
| 13 | 6.1 + 6.2 | Tiles from object storage | `todo` | — |
| 14 | 2.1–2.4, 2.6, 2.8, 2.9 | Multiple guns | [`pr` #17](https://github.com/apollyon-sys/wardogs-calculator/pull/17) | `upstream-pr/multiple-guns` (on `integration/all-prs`) |
| 15 | 7.3–7.8 | Saved-target markers and sync | `wip` | `upstream-pr/saved-target-markers` (on `upstream-pr/multiple-guns`) |
| 16 | 1.x | Shared sessions | `todo` | — |

Item 7 is not an extraction at all: it is a bug that exists in `upstream/main` unchanged, found while working here. Fixed on `feat/collab-rooms` in `caa9d9a2b`; the same 12 lines apply upstream as a standalone PR. `upstream/main`'s `markerButton` handler never calls `setMapTool()`, so a second click only closes the picker and leaves the tool armed. The `pencilButton` handler has the same shape and is not yet fixed.

Most branches are cut from `upstream/main` and carry only their own feature. Two are **stacked** and cannot merge before their base:

- `upstream-pr/flight-time` (item 11) branches from `upstream-pr/terrain-range-ring`, because `loadProjectileModel()` and `PROJECTILE_MODEL` live in `js/map/range-ring.js`, which exists only there. It also re-adds `projectileModelArc()`, which #11 dropped as dead code with flight time as its only consumer.
- `upstream-pr/fob-build-areas` (item 12) branches from `upstream-pr/map-visuals`, because FOB areas need a `fob` kind in `RING_SIZE_KEYS` / `getRingConfig`, and that plumbing shipped in #9 as `mainZone`-only. **The markers branch turned out to be a sequencing dependency, not a code one:** `drawFobBuildAreas` filters markers for `icon === 'fob'` and draws nothing when none exist, and `markerSupportsRotation` returns false for every icon that exists today, so the wheel keeps zooming. The feature is therefore inert, not broken, until the markers PR lands the icon. That is why the branch has a single parent.

Because GitHub cannot take a cross-fork PR whose base is a branch in the fork, both stacked PRs target `main` and their diffs currently include their base's commits. Each body opens by saying so.

Item 8.4 evaporated on contact: since the `fob` ring config has never shipped upstream, there is no rename to perform. The key ships as `halfSide` from the start and `radius` never exists for it.

Everything is pushed to `origin` (the fork). Ready-to-use PR bodies are at the bottom of this file.

---

## Migration phases

Items 1 through 12 were extracted opportunistically, smallest and cleanest first. What remains is ordered by dependency instead, because each phase is what the next one is built on.

**Phase 1 — let #8 through #16 land.** Nothing new stacked on them while they are in review. Nine open PRs is already a lot in front of one maintainer, and #15 and #16 cannot collapse to their real diffs until #11 and #9 merge.

**Phase 2 — multiple guns (§2.1, then §2.2/2.3).** Before collaboration, not after. Collab's op families include `gun.add` / `gun.remove` and its client syncs the gun list, so landing guns first means collab ships once, complete. The other way round means shipping collab without gun sync and then reopening the worker's validation and op dispatch to add it, touching the riskiest file twice. §2.1 is the keystone: it makes `S.origin` and `S.weapon` accessors onto the selected gun so every existing reader is untouched and `js/core/core.js` never conflicts on an upstream merge. That property is the thing to protect.

**Phase 3 — saved-target map markers (§7.3–7.8).** Stacks on Phase 2. It collides with guns in three places, which is why it cannot run in parallel: 7.4 (click a marker to activate it) lives in the same `js/events.js` / `js/mobile/mobile.js` hit-test block as 2.6 (pick up the gun you click); 7.6's per-target artillery toggle decides whether restoring a target also moves the **guns**, plural, so it has to be written against the real gun list or written twice; and `c3edba645` carries 7.3–7.8 and 2.8/2.9 in one commit.

**Phase 4 — collaboration, as two PRs, in this order.** The collab files alone are **6,346 lines** before the hooks, the toolbar UI, the popover CSS and twelve locales.

1. **`sync/` alone** — the worker, the op validation, its ~1,160 lines of tests, `sync/README.md`. About 2,500 lines. It deploys standalone and changes nothing about the site (`changes.md` records 1.1 as *Needs: none*).
2. **Everything client-side** — `js/features/collab.js`, the `collab.url` config gate, `getCollabServiceUrl()`, the self-disabling behaviour, the `collabOn*` hooks in `map-tools.js` and `saved-targets.js`, the toolbar button, the popover, the CSS and the strings. About 3,800 lines, and a working feature the moment it lands.

**Why this split and not the earlier three-way one.** Separating the client module from its hooks and UI would have produced a middle PR consisting entirely of dead code: nothing could exercise it, the real review would happen at the next PR anyway, and if that next PR were rejected upstream would be left carrying a dead 1,946-line module. Client, hooks and UI are one testable unit and ship together.

The worker stays separate for a different reason: it is testable in isolation, runs under a different runtime, and reviewing a Durable Object is a different skill from reviewing the canvas client.

**Worker first is an operational requirement, not just review order.** The maintainer intends to host the service on Cloudflare themselves. The client reads `collab.url` from config and self-disables when it is absent, so the Worker has to be merged and deployed, and its `wss://` endpoint known, before the client PR has anything real to point at.

Still worth opening an issue before building either, to agree the shape and confirm the endpoint arrangement.

**`integration/all-prs`** is a branch merging all nine open PR branches, used as the base for Phase 2 so guns can be built against "everything landed". It is a working aid, not a thing to propose upstream.

### What the integration merge found

Seven of the nine merged cleanly. Two conflicted, and both predict a conflict the maintainer will hit.

- **#13 derived-highlight vs #8 remember-positions, in `js/ui/inputs.js`.** Both append a hook to the same spot at the end of `inputs()`, each with its own comment. Genuine collision, both wanted. Resolved as a union with `persistMapPoints()` first so it captures the write, then `refreshSavedTargetHighlight()`. **Whichever of #8 or #13 lands second will hit this**, so it is worth warning about on the PRs.
- **#11 terrain-range-ring vs #10 contour-layer, 13 files.** All mechanical add-adjacent collisions. `scripts/lib/terrain-source.mjs` was the predicted one-line header comment (kept #10's wording, a strict superset); `package.json` needed both script sets and a unioned `test:scripts`; `docs/terrain.md` needed both lines in the same tree block; and all ten page shells insert `contours.js` and `heightfield.js` at the same line between `tiles.js` and `overlays.js`.

`js/map/renderer.js` did **not** conflict despite four branches adding draw hunks, and the layer numbering stayed coherent: 1 tiles, 2 contours, 3 grid, 4 zones, 5 polygons + mainZone + fobAreas + drawings, 6-8 artillery, 9 preset markers. `npm run build` passes on the integration base.

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
2. **8.1 / 8.2 / 8.3 Docs.** *Parked: fork-only working notes, not going upstream.* `docs/todo.md`, `docs/ideas-research/`, and the features/terrain/maps updates.

   *8.4 (`halfSide` not `radius`) is not a standalone PR: it renames a config key upstream does not have yet. Fold it into #5 so the key ships named correctly the first time.*

### Tier 2 — small and self-contained

3. **5.3 Main zone circle.** *Best first real PR.* `getMainZone`, `drawMainZone`, `drawRadiusRing`, `hexToRgba` appended to `overlays.js`; one `renderer.js` hunk; `mainZone` blocks in `config/app.json` and both `maps/*.json`; the `mapLayerMainZone` key; two lines in the `map-tools.js` layer registry. ~250 lines, no collab contact anywhere.
4. **7.1 Positions survive a reload.** `persistMapPoints` / `loadMapPoints` / `writeMapPoints` / `readStoredPoint` are contiguous at `js/features/saved-targets.js:334-519`, plus `MAP_POINTS_KEY` in `core.js`, one `main.js` call and one `inputs.js` hook. ~200 lines. Drop the `collabSyncShared` hook from the `inputs.js` hunk.
4b. **7.2 Saved-target highlight derived from position.** `caabf2de1` computes which row is active from where the target actually sits instead of tracking `selectedSavedTargetId`. It **deletes** state: one line from `core.js`, three from `events.js`, one each from `coordinates.js` and `mobile.js`. Fixes the highlight going stale when the target moves by any path that forgot to clear the tracked id. Port the original commit, not the fork tip, which has grown the partial/sync states from 7.6–7.8.
5. **6.3 + 6.4 `.env` config and analytics off by default.** *Parked: fork-only infrastructure, not going upstream.* New `scripts/lib/site-config.mjs`, the `build-pages.mjs` / `dev-server.mjs` wiring, `.env.example`, `docs/analytics.md`. Drop `collabUrl()` and leave `TILE_BASE_URL` for #9. Build-system only, no runtime risk, and it fixes a real problem: an unconfigured fork currently reports into upstream's analytics dashboard.

### Tier 3 — medium, still reviewable

6. **5.1 Tactical marker icons and picker labels.** **Twice-corrected estimate, now measured against the branch that shipped it.** This is not the big `map-tools.js` PR, and it is far smaller than even the second estimate: the branch is +178/-2, of which `map-tools.js` is **7 lines** and `js/map/assets.js` is 51. The rest is artwork, `maps/assets.json` and locale keys.

   Two things `changes.md` and my earlier readings got wrong about it. First, `js/map/overlays.js` contributes **nothing** — the +394 in `3eb0425ff` is entirely `drawRadiusRing`, `drawRadiusSquare`, `getMainZone`, `drawMainZone` and the `drawPresetZones` refactor, i.e. §5.3 (shipped in #9) and §5.2. Markers have no drawing code of their own; upstream's `drawMapToolMarker` already handles them and is byte-identical on the fork tip. Second, **"marker labels" are picker tooltips, not map labels.** Nothing in the fork draws text next to a placed marker. The commit title means `button.title` / `aria-label`, which upstream fills with the raw asset id (`spawn_vehicle`).
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

---

## §7.2 — `upstream-pr/derived-highlight`

https://github.com/apollyon-sys/wardogs-calculator/pull/13

````markdown
## Derive the saved-target highlight from the target position

Which saved-target row is highlighted was tracked in a separate `selectedSavedTargetId` variable, which every writer of `S.target` had to remember to clear. Several did not, so the highlight could point at a row the target had long since moved away from.

This computes it instead: a row is active when its coordinates match where the target actually sits. The variable is gone, along with the seven sites that maintained it.

Coordinates are compared with an epsilon rather than `===`, because `clamp()` rounds through a float division and a saved target's stored numbers were themselves clamped before being written.

`refreshSavedTargetHighlight()` is separate from `renderSavedTargets()` on purpose: `inputs()` runs on every frame of a map drag, so it toggles the class on rows already in the DOM instead of rebuilding the list. A full render still runs when the targets themselves change.

Note that dragging the target onto a saved target's exact coordinates now highlights that row. That is the intended meaning of the highlight under this change: the target is at this saved position.
````

---

## Marker tool toggle — `upstream-pr/marker-tool-toggle`

https://github.com/apollyon-sys/wardogs-calculator/pull/12

Not an extraction. An upstream bug found while working on the fork. One file, +12/-0.

````markdown
Clicking the marker tool button a second time only closed the marker picker, leaving the tool armed.

The handler never called setMapTool(), which is what performs the toggle back to null, so the ruler and eraser buttons toggled off correctly but the marker button did not.

Added an early return that closes the picker and calls setMapTool('marker') when the tool is already active and the picker is open. The picker-open check keeps the case where the picker was dismissed by clicking the map: the next click reopens it instead of deselecting the tool.
````

---

## §5.1 — `upstream-pr/tactical-markers`

https://github.com/apollyon-sys/wardogs-calculator/pull/14

Decide first: the `ko` and `zh-cn` labels in the second commit are machine-written and unreviewed. Drop that commit to fall back to English, or get them checked. Also confirm dropping the dead `vendor` entry was right (upstream ships `vendor.webp` but no map references it and the fork marked it `placeable: false`).

````markdown
## Placeable tactical markers with named picker labels

Adds four placeable marker icons to the map tool palette: FOB, tank, artillery and vehicle spawn. WebP for the app, SVG sources alongside them.

Marker assets can now carry a labelKey naming a locale string, used for the picker button's tooltip and aria-label. Without one the asset id is title-cased instead ("spawn_board" becomes "Spawn board"), so a new icon is usable before anyone translates it. Previously the picker showed the raw id.

The four labels are translated in nine locales. The last commit adds ko and zh-cn, and those two are machine-written rather than checked by a speaker, so drop that commit if you would rather they fell back to English through tr().

No drawing code changes and no config changes. Nothing renders differently on the map itself.
````

---

## §4.1 — `upstream-pr/flight-time` — [PR #15](https://github.com/apollyon-sys/wardogs-calculator/pull/15)

Stacked on `upstream-pr/terrain-range-ring` (#11). 668 insertions, 0 deletions against that base: nothing #11 introduced was modified, only appended to. `deltaZ` is live on the base rather than always zero, so the `-2 g dz` term does real work. Arithmetic hand-checked against the closed form (SPG low MIL 400 dz 0 gives 19.162 s; mortar MIL 800 dz -150 gives 19.124 s, confirming downhill lengthens the flight).

````markdown
This stacks on #11 and cannot merge before it. It needs loadProjectileModel and PROJECTILE_MODEL from js/map/range-ring.js, which only exist on that branch. Until #11 lands, the diff here also shows #11's commits.

#11 dropped projectileModelArc() as dead code. This adds it back, because the flight time is its consumer. Nothing else in that file changes.

The seconds come from the same vacuum fit the range ring reads, so no new data file. The angle is taken from the MIL actually on screen rather than from the distance, so the printed time belongs to the number above it. A distance that lands on a table row with a MIL band uses the band's midpoint. Target height minus gun height comes from the terrain meta #11 already computes.

These are derived seconds, never measured in game, which is what the badge's approximately-equals prefix says. Both SPG-2 arcs and the mortar are covered.

The last two commits are droppable: a machine-written Korean string for the new label, and a Playwright test that was not run.
````

---

## §5.2 + §5.4 + §8.4 — `upstream-pr/fob-build-areas` — [PR #16](https://github.com/apollyon-sys/wardogs-calculator/pull/16)

Stacked on `upstream-pr/map-visuals` (#9). Nothing about it has been exercised, and **nothing can be** until the markers PR lands the `fob` icon: rotation, the corner grip, shift-snapping, double-click-to-straighten and marker dragging are all unreachable by construction on this branch. Needs a real pass over a live map once both parents merge.

`drawRadiusSquare` deliberately ships without the `label` parameter the source added: `ab2892ab3` changed its only caller to pass `null` and deleted `formatRingRadius`, which does not exist on the base at all, so carrying it would have shipped ~40 dead lines.

````markdown
Stacks on #9 (map visuals), which has to merge first. Until it does, the diff here also shows #9's commits. It also needs the tactical markers branch, not yet opened, before any of this is reachable in the UI: the build area is drawn around a placed marker whose icon id is "fob", and that icon does not exist until that branch lands. Until then the code is inert rather than broken, drawing nothing and leaving the wheel to zoom as it always has.

Adds a "fob" ring kind measured by halfSide, the distance from the FOB to an edge, so the buildable side is twice it. A square, not a circle, so it gets its own drawing primitive rather than reusing the ring.

The square turns with the wheel while the marker tool is active and the cursor is over a FOB, or by dragging the grip on the icon's top-left corner. Shift snaps to 15 degrees, double-clicking the grip straightens it. Rotation lives on the marker, so undo, export and persistence come for free.

Pressing a marker that is already placed now picks it up and moves it instead of stacking a second one on top.

Only en has the new mapLayerFobAreas string. The other eleven locales are also still missing mapLayerMainZone from #9; both are worth one follow-up pass together.
````

---

## Known follow-up: the layer-toggle locale gap

`mapLayerMainZone` (#9) and `mapLayerFobAreas` (#16) exist in `en.json` only. The other eleven locales — `cat`, `de`, `es`, `fr`, `ko`, `pl`, `pt`, `ru`, `uk`, `zh-cn` — carry every other `mapLayer*` key but not these two. `tr()` falls back to English so nothing breaks, but the layer list reads half-translated. Worth one follow-up PR filling both keys in all eleven at once. Note `cat.json` is a deliberate joke locale ("Pawcil", "Pawkers") and must be written by hand, not machine-translated.

---

## §2.1–2.4, 2.6, 2.8, 2.9 — `upstream-pr/multiple-guns` — [PR #17](https://github.com/apollyon-sys/wardogs-calculator/pull/17)

Branched from `integration/all-prs`, so it assumes #8–#16 are all merged. 37 files, +1778/-140.

Decision recorded: the Playwright browser tests stay, on this branch and on #11 and #15. They remain in their own final commits, so the testing-convention question can still be settled on whichever lands first.

The 2.1 property held exactly: **`js/core/core.js` diff is empty.** `installGunAccessors()` runs at load, seeds gun 1 from the literals core.js already holds, then replaces `S.origin` and `S.weapon` with `Object.defineProperty` accessors onto `activeGun()`. Every existing reader is untouched.

2.3 was re-pointed at #11's ring rather than reintroducing the fork's copy. The fork's `guns-overlay.js` carried its own `traceRangeRing` and two-outline draw; all of it was deleted, and `drawGunRangeRings` now calls `drawMaxRangeRing(at, rangePx, v.scale, gun)`. The only change to `range-ring.js` is a fourth optional `gun` parameter defaulting to the old behaviour, because #11 had already given `terrainRangeRing(gun, mapId)` a `{weapon, position}` shape that a real gun satisfies verbatim. The memo key already includes the weapon and quantised position, so per-gun caching works unchanged.

2.9 turned out **not** to depend on §7.3–7.8: it is a markup move plus one CSS rule, and the `.saved-targets` chrome it borrows is upstream code.

Migration on first load: a stored single origin from #8 becomes gun 1 with the position intact. `loadMapPoints()` assigns `S.target` first, deliberately, so nothing touches `S.origin` while `S.guns` is mid-replacement. Writes still emit a singular `origin` alongside `guns`, so downgrading to an older cached build does not lose the position. `S.guns.length >= 1` is never violated.

Two things to look at first when screenshotting, both flagged as unexercised: `ctx.globalAlpha` interacting with the terrain ring's `fill('evenodd')` on dimmed guns, and whether the floating gun panel at `left: 14px` collides with the map-tools toolbar.

````markdown
Assumes all of #8 through #16 are merged; it is built on a local integration branch that merges all nine.

Artillery becomes a list. S.origin and S.weapon become accessors onto the selected gun, so every existing reader keeps working and js/core/core.js is not touched at all. A panel over the top-left of the map adds, selects, renames, hides and removes guns, and every visible gun draws its own range rings and target line with the selected one on top. Clicking a gun picks that gun up instead of moving the selected one onto it, on mouse and touch alike. The list persists, and a single origin stored by #8 migrates into gun 1.

Per-gun rings call drawMaxRangeRing from #11 with the gun passed through, so there is one terrain-aware ring implementation, not two.

The last two commits are droppable: unreviewed machine-written Korean strings, and browser tests that need playwright.
````
