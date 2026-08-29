# Extraction plan

Companion to `changes.md`. That file says *what* is in the fork; this one says
*in what order it can leave*, and what each piece costs to review.

**This is a living document.** Update the status board as branches are cut,
PRs open and things land. Keep the analysis below it — the structural facts
about why cherry-picking fails do not go stale as items ship.

Assessed against `upstream/main` at `29fd2bafd` ("feat: keyboard map camera
controls"), which `fd16a725c` already merged in. **This was assessed offline —
`git fetch upstream` before acting on any of it.**

Branch state at first assessment: 70 commits ahead, 21,306 insertions / 448
deletions across 128 files, excluding the 43,700 removed tiles.

---

## Status board

Statuses: `todo` · `branch` (branch cut, not yet proposed) · `pr` (open
upstream) · `merged` · `parked`.

| # | Item(s) | What | Status | Branch |
| --- | --- | --- | --- | --- |
| 1 | 5.5 | Tower icon | `branch` | `upstream-pr/map-visuals` |
| 2 | 5.3 | Main zone circle | `branch` | `upstream-pr/map-visuals` |
| 3 | 7.1 | Positions survive a reload | `branch` | `upstream-pr/remember-positions` |
| 4 | 3.1 | Contour layer | `branch` | `upstream-pr/contour-layer` |
| 5 | 3.2–3.4, 3.7 | Heightfield + terrain range ring | `branch` | `upstream-pr/terrain-range-ring` |
| 6 | 8.1–8.3 | Docs (`todo.md`, `ideas-research/`) | `todo` | — |
| 7 | 6.3 + 6.4 | `.env` config, analytics off by default | `todo` | — |
| 8 | 5.1/5.2/5.4 + 8.4 | Tactical markers, FOB areas, drag to move | `todo` | — |
| 9 | 4.1 | Time of flight | `todo` | — |
| 10 | 6.1 + 6.2 | Tiles from object storage | `todo` | — |
| 11 | 2.1–2.3 | Multiple guns | `todo` | — |
| 12 | 7.3–7.8 | Saved-target markers and sync | `todo` | — |
| 13 | 1.x | Shared sessions | `todo` | — |

Every branch is cut from `upstream/main` and carries only its own feature. None
have been pushed or proposed.

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

Collab landed *first* in this history, so almost everything after it was written
on top of collab hunks. Extraction is therefore **path-scoped diffs from the
current tree** —

```
git diff upstream/main...HEAD -- <paths>
```

— with the collab hooks stripped by hand, not `git cherry-pick`. The stripping is
mechanical: every hook is a `typeof collabX === 'function'` guard around one call.

### The global-script style makes this cheaper than the line count suggests

`js/map/overlays.js` gains six functions appended at the end
(`drawSavedTargets`, `drawRadiusRing`, `drawRadiusSquare`, `getMainZone`,
`drawMainZone`, `hexToRgba`) and rewrites nothing upstream owns. `renderer.js` is
a handful of hunks, one per feature. `index.html` is `<script>` tag insertions.
Locale keys group cleanly per feature. So the typical PR is *new file + one
script tag + one `draw()` hunk + a few locale keys*.

Two files are the exception and gate the rest:

- `js/map/map-tools.js` — +1,006 lines, heavily collab-laced (~45 collab call
  sites).
- `js/features/saved-targets.js` — +900 lines, where all of §7 stacks on itself.

---

## The order

The tiers are the reasoning; the status board at the top is the live state.

### Tier 1 — trivial, land today

1. **5.5 Tower icon.** `assets/map-markers/tower.webp`. Binary swap, the one
   thing that cherry-picks clean (`dfe9ace3e`, `fc8ff00de`).
2. **8.1 / 8.2 / 8.3 Docs.** `docs/todo.md`, `docs/ideas-research/`, and the
   features/terrain/maps updates. Pure prose, zero risk. `todo.md` — every value
   the app draws that nobody has measured in-game — is the one with real value to
   the maintainer. Strip the collab and deployment references on the way out.

   *8.4 (`halfSide` not `radius`) is not a standalone PR: it renames a config key
   upstream does not have yet. Fold it into #5 so the key ships named correctly
   the first time.*

### Tier 2 — small and self-contained

3. **5.3 Main zone circle.** *Best first real PR.* `getMainZone`, `drawMainZone`,
   `drawRadiusRing`, `hexToRgba` appended to `overlays.js`; one `renderer.js`
   hunk; `mainZone` blocks in `config/app.json` and both `maps/*.json`; the
   `mapLayerMainZone` key; two lines in the `map-tools.js` layer registry.
   ~250 lines, no collab contact anywhere.
4. **7.1 Positions survive a reload.** `persistMapPoints` / `loadMapPoints` /
   `writeMapPoints` / `readStoredPoint` are contiguous at
   `js/features/saved-targets.js:334-519`, plus `MAP_POINTS_KEY` in `core.js`,
   one `main.js` call and one `inputs.js` hook. ~200 lines. Drop the
   `collabSyncShared` hook from the `inputs.js` hunk.
5. **6.3 + 6.4 `.env` config and analytics off by default.** New
   `scripts/lib/site-config.mjs`, the `build-pages.mjs` / `dev-server.mjs`
   wiring, `.env.example`, `docs/analytics.md`. Drop `collabUrl()` and leave
   `TILE_BASE_URL` for #9. Build-system only, no runtime risk, and it fixes a
   real problem: an unconfigured fork currently reports into upstream's analytics
   dashboard.

### Tier 3 — medium, still reviewable

6. **5.1 + 5.2 + 5.4 (+ 8.4) Tactical markers, FOB build areas, drag to move.**
   The marker palette and artwork, `drawRadiusSquare`, rotation on the wheel.
   This is the big `map-tools.js` PR — roughly 600 of its 1,006 added lines — and
   needs careful collab-hook stripping. High player-visible value.
7. **3.1 Contour layer.** `js/map/contours.js` (424 lines, collab-free),
   `scripts/build-contours.mjs`, `scripts/lib/contours.mjs` and its test, one
   `renderer.js` hunk, the layer toggle. **Caveat:** +715 KB of generated
   `contours.json` enters the tree (bakurani 547 KB, ozeti 168 KB). Name the
   regeneration command in the PR so the maintainer knows it is derived.
8. **4.1 Time of flight.** See *Corrections to `changes.md`* below — the stated
   dependency is wrong, and the `results.js` hunk needs unpicking first.

### Tier 4 — big, after the above

9. **6.1 + 6.2 Tiles from object storage.** Mechanically fine and a large win —
   1.4 GB and 43,700 files out of the tree — but it is an infrastructure decision
   for the maintainer, not just a code review. Needs #5 landed first.
10. **3.3 + 3.7 Heightfield and terrain range ring.** 370 KB of binary
    heightfields plus a real ballistics model. Genuinely novel behaviour, wants
    its own discussion.
11. **2.1 → 2.3 Multiple guns.** `changes.md` is right that 2.1 is the keystone
    and that keeping `js/core/core.js` untouched is the property to preserve.
12. **7.3 – 7.8 Saved-target map markers and sync.** Stacks on itself; the
    hardest slice in the fork.
13. **1.x Shared sessions.** Last, as planned.

---

## Blocker (FIXED in `24cd010d3`): the origin drag died without `guns.js`

`js/events.js:530` and `js/mobile/mobile.js:50` compute the origin hit-test as:

```js
const d1 = hitGun ? Math.hypot(...) : Infinity;
```

The `typeof gunAtPoint === 'function'` guard above it *looks* like graceful
degradation, but it is not. With `guns.js` absent, `hitGun` is `null`, `d1` is
`Infinity`, and **the artillery marker becomes undraggable on both mouse and
touch**. `mobile.js` has the same shape — no crash there, just a silently dead
drag.

Consequence: **7.4 (click a saved-target marker to activate it) cannot ship
before the guns work** unless that branch restores the plain `S.origin` fallback.

`24cd010d3` fixes it at the source by distinguishing *"gun picking unavailable"*
from *"no gun under the cursor"* — with `guns.js` loaded nothing changes, because
a miss still yields `Infinity` and that is correct (`S.origin` *is* a gun, so
`gunAtPoint` would have found it); without it, `S.origin` is grabbable exactly as
it was before guns became a list. The two now-reachable `hitGun.id` dereferences
are guarded too. Not verified at runtime: `playwright-core` is not installed and
network is blocked here, so `test/guns-pick.mjs` could not be run.

---

## Corrections to `changes.md`

- **The *(uncommitted)* markers are stale.** Items 2.8, 2.9 and 7.3 – 7.8 are all
  committed in `c3edba645` ("Saved targets UI improvemnts, moved gun section to
  card"); the working tree is clean.
- **4.1's dependency is misstated.** It says *Needs: 3.4* — the build-time
  ballistics lib. The actual runtime dependency is `loadProjectileModel()`, which
  lives in `js/map/range-ring.js:40`, a §3.7 file. Shipping 4.1 alone means
  extracting that loader or dragging the range ring along.
- **4.1 is entangled with 3.6 in `results.js`.** The diff interleaves the
  flight-time badge with the terrain-note redesign (`terrainNoteState`,
  `renderTerrainNote`). Those hunks need separating before either ships.
- **The extraction-notes ordering assumes cherry-picks.** 7.1, 7.2, 3.1 and 5.4
  are listed as clean standalone PRs; none of them cherry-pick.

---

## Testing convention is its own conversation

Upstream has **no `test/` directory and no test script** — its `package.json`
carries only `build` and `dev`. This branch adds 13 test files and a
`test:scripts` script. Whichever PR goes first with tests is also proposing a
testing convention for the project, so it is worth raising with the maintainer
explicitly rather than smuggling in under a feature. Tier 2 #5 is the natural
place: `scripts/lib/dev-env.test.mjs` is self-contained.

Note that `npm run test:scripts` currently reports 45/46 locally — *"without .env
the dev server serves the originals"* fails with `expected a local tile, got 404`.
That is an artefact of this tree having no `maps/tiles/` (§6.1 removed them); the
test assumes tiles are present, so it passes upstream but is fragile once 6.1
lands.
