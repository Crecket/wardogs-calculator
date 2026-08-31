# Extraction plan

Companion to `changes.md`. That file says *what* is in the fork; this one says *in what order it can leave*, and what each piece costs to review.

**This is a living document.** Update the status board as branches are cut, PRs open and things land. Keep the analysis below it — the structural facts about why cherry-picking fails do not go stale as items ship.

Assessed against `upstream/main` at `29fd2bafd` ("feat: keyboard map camera controls"), which `fd16a725c` already merged in. **This was assessed offline — `git fetch upstream` before acting on any of it.**

Branch state at first assessment: 70 commits ahead, 21,306 insertions / 448 deletions across 128 files, excluding the 43,700 removed tiles.

---

## Upstream v1.7.0 absorbed five PRs without merging them

On 2026-08-30 the maintainer closed #10, #12, #13, #14 and #18 between 17:19 and 17:21, and at 19:54 committed `5acbf5982` "feat: release v1.7.0" — a single squashed commit under his own authorship, with no merge commits and no co-author trailers. That commit contains those five PRs' work. This was verified by reverse-applying each branch's patch onto `upstream/main`: #12, #13 and #18 reverse-apply whole, and the contour layer's files — `js/map/contours.js`, `scripts/build-contours.mjs`, `scripts/lib/contours.mjs`, `scripts/lib/contours.test.mjs`, `scripts/lib/terrain-source.mjs` and both `data/terrain/*/contours.json` — are **byte-identical** to the branch tip, carrying the `db9a45377`–`4e4eac156` render-cost rebuild and the `docs/terrain.md` datum-offset section verbatim. #14 is in as its four SVG sources plus the `js/map/assets.js` and `js/map/map-tools.js` hunks; the webp binaries were re-encoded and the KO/ZH strings he asked to have dropped were reinstated in his own wording.

The five local branches were deleted, their content having shipped. Nothing about the remaining PRs' review state changed.

The release also added an **opt-in experimental Terrain3D correction** — `js/features/experimental-terrain-correction.js` and `data/ballistics/terrain-correction/{low-main,low-tail-apex,high-v2}.json`, sha256-pinned from a new `experimentalCorrection` block in `terrain-context.json`, default off, applied only on `SAFE_CONSENSUS` with flat-table fallback. This is the superseding ballistics model the #11 and #15 holds were waiting on. It bears on the two holds unevenly: the payloads carry reachable ΔZ per command mrad with explicit `minDeltaZMetersByBoundary`/`maxDeltaZMetersByBoundary`, which is what **#11's** range ring and dead-ground solver need in place of the vacuum fit — but they carry **no time-of-flight, apex-time or muzzle-velocity field anywhere**, so **#15 gains nothing** and still rests on a self-derived model. The module is also an IIFE that monkey-patches its own `baseResolver`/`baseFormatter` and exports nothing, so consuming it from a map layer needs an API extracted first.

Note for the fork: `terrain-context.json` now carries both correction regimes. The fork's `releasePolicy.automaticMilCorrection` is `true` while upstream's `experimentalCorrection` is opt-in and off, and the two are read by different consumers over disjoint fields — but a user who opts in gets both layers applied.

---

## Every live branch now carries v1.7.0

All seven open PRs and both fork branches were merged onto `upstream/main` at `353f14cef` on 2026-08-30 and pushed. Merge, not rebase, so nothing was rewritten and each merge commit records when his version was taken.

| Branch | PR | Merge | Conflicts | Verification |
| --- | --- | --- | --- | --- |
| `feat/collab-rooms` | — | `44cac7ac8` | 36 | build green; 45/46 script tests (the failure is the known `dev-env` case) |
| `feat/force-placement-mode` | #3 | `79d153208` | 0 textual, 3 semantic gaps | build green; 13/13 |
| `upstream-pr/remember-positions` | #8 | `9fe109f50` | 1 | build green; 13/13 |
| `upstream-pr/map-visuals` | #9 | `e29af08ac` | 1 | build green; 13/13 |
| `upstream-pr/terrain-range-ring` | #11 | `81961b849` | 17 | build green; 49/49 |
| `upstream-pr/flight-time` | #15 | `bba2bba64` | 1 | build green; 49/49 node, 34/34 browser |
| `upstream-pr/fob-build-areas` | #16 | `3dc7e4545` | 1 | build green; 13/13 |
| `upstream-pr/multiple-guns` | #17 | `19356071d` | 34 | build green; 38/38 node, 106/106 browser |

`upstream-pr/saved-target-markers` and `integration/all-prs` were left alone — neither is an open PR.

**How much of that was the copying's fault.** Measurable, and only partly. Building a counterfactual commit with the same v1.7.0 tree but the five branch tips as real parents, and merging each into the pre-merge fork, gives 21 conflicting files against the 36 that actually occurred. The 15 that exist *only* because he copied rather than merged: `.gitignore`, `package.json`, `docs/terrain.md`, `js/features/results.js`, `js/map/renderer.js` and all ten page shells — git could not see that his content and the fork's were the same commits, so the fork's own contour layer and `setText` guards came back as "both sides added this independently". The other 21 are genuine new work of his landing on top: the `buildMapLayers()` restructure from a flat array into `base`/`tactical`/`personal` groups (which hit four branches), the saved-target firing-info panel, the rewritten SEO copy, the new marker set.

`buildMapLayers()` was resolved the same way everywhere: adopt his grouped structure, re-insert the branch's own layers into `tactical`, and add matching `icons` entries so they do not render as empty SVGs.

**Two things found while merging, both left alone as out of scope.**

- `js/features/saved-targets.js` on `feat/collab-rooms` has regressed on both halves of #13. `savedTargetMatchState()` uses `savedTargets.find()`, so duplicate coordinates highlight only the first row — the exact bug the maintainer asked about — and there is no `String(target.id)` coercion anywhere in the file, so a numeric id from the import path silently fails `item.dataset.targetId === state.id`. The fork's version is an evolution of the *pre*-#13 code (it adds `full`/`partial` levels and the sync button, which upstream has no equivalent of), so keeping it through the merge was right; it needs the `Set` and the `String()` ported back into it.
- The flight-time badges still do `host.textContent = ''` plus `createElement` on every `result()`, on the same pointer-move path the `setText` guards protect. Needs node reuse rather than a guard.

**One thing found and fixed.** The #3 merge added machine-written `forcePlacementHint` / `forcePlacementHintActive` strings to `ko.json` and `zh-cn.json` — the same objection the maintainer raised on #14. Both were removed before the branch was pushed; `tr()` resolves `language?.[key] ?? fallback?.[key] ?? key` with `DEFAULT_LANG` of `en`, and both keys exist in `en.json`, so they fall back to English. Note also that upstream ships `ko.json` and `zh-cn.json` with CRLF endings while the rest of the repo is LF, and one line in `ko.json` is `\r\r\n`; leave those alone or every future merge re-conflicts on them.

---

## The v1.7.0 ballistics do not lift the #11 and #15 holds

Checked against `upstream/main` at `353f14cef` on 2026-08-30 — still the v1.7.0 tip, nothing newer has landed. The full schema of all three correction payloads was dumped and measured, and neither held PR can be rebuilt on them.

**#15 flight time gets nothing.** The payloads publish only terminal Δz-versus-command boundaries. There is no time-of-flight, apex height, muzzle velocity, drag coefficient or per-x profile in any of the three files, nor anywhere else in the tree. `low-main.json` records `source.integrationDtSeconds: 0.02` and `high-v2.json` records `generation.integrationDtSeconds: 0.02`, so trajectories *were* integrated to produce this data — but only the endpoints were published. (`regions.apex` in `low-tail-apex.json` is a distance band, 2606–2629 m, not an apex height.) #15 still rests on a self-derived model, and no amount of wiring changes that.

**#11's range ring is served for under half the shots that matter.** `modelMaxRange(v, Δz)` is used as a differential — `reaches()` tests `metres <= declaredMax + (modelled - levelMax)` — and the surfaces do supply that shift more honestly than the vacuum fit, from integrated drag trajectories. But their Δz domain is ±40 m (low) and ±80 m (high), while the ring sweeps real relief. Sampling the baked heightfields at 400 gun positions × 60 bearings inside a 2.5 km radius:

| | median \|Δz\| | p90 | p99 | max | within ±40 m | within ±80 m |
| --- | --- | --- | --- | --- | --- | --- |
| Bakurani | 106.7 m | 320.5 m | 551.8 m | 817.3 m | 22.9% | 40.5% |
| Ozeti | 43.2 m | 117.0 m | 198.6 m | 330.2 m | 47.0% | 75.5% |

On Bakurani — the only map with validated coordinate alignment, and the only height-corrected one — the median shot is already outside the HIGH domain. The vacuum fit would still have to answer 59% of the ring, and it would answer precisely the steep-relief bearings where the ring departs from a plain circle, which is the entire point of the feature.

Three further blockers even where the domain does cover: both files are `spg` / `155MM HE SHELL` only, so `mortar` stays on `projectile-model.json` and the branch would ship two models; both are stamped `DISABLED_..._HELD_OUT_REQUIRED` with `experimentalCorrection.defaultEnabled: false`, so a default-on always-visible ring would put held-out research data on the always-visible path; and `js/features/experimental-terrain-correction.js` is an IIFE that monkey-patches its own `baseResolver`/`baseFormatter` and exports nothing, so a consumable API has to be extracted first.

**The dead-ground solver is not served at all**, on any map. `js/map/dead-ground.js` needs in-flight height `z(x)` at every intermediate x plus a grazing-tangent solve against the terrain profile; nothing in these files carries intermediate geometry.

Both holds therefore stand where they were. Lifting them needs the maintainer to publish trajectory profiles — or at minimum apex and descent-branch parameters and a wider Δz domain — not just the command surfaces.


---

## Render path measured on `upstream-pr/render-perf`

Four items from [ranked-ideas.md](docs/ideas-research/ranked-ideas.md) — rAF coalescing, a CSS custom-property cache, `createImageBitmap` tile decode with a `close()`-ing LRU, and a `devicePixelRatio` clamp of 2 — cut as one branch from `upstream/main` at `353f14cef` and merged into `feat/collab-rooms` at `a85a9fccc`.

Measured with a Playwright harness against both worktrees, real Bakurani webp tiles served from loopback, median of 5 alternating trials per checkout, headless Chromium, 1440x900:

| Scenario | Metric | Baseline | Branch | Change |
| --- | --- | --- | --- | --- |
| Pan, 600 moves at 5 per frame | painter calls | 600 | 120 | 5x fewer |
| | ms in painter | 154.1 | 62.1 | −59.7% |
| | `getComputedStyle` calls | 1200 | 0 | −100% |
| Wheel, 300 events | painter calls | 419 | 60 | 7x fewer |
| | ms in painter | 126.8 | 47.5 | −62.5% |
| Cold tile pan, zoom 6 | ms in painter | 141.4 | 51.8 | −63.4% |
| | long tasks | 0 | 0 | no signal |
| Pan at DPR 3 | backing-store pixels | 7,539,840 | 3,351,040 | −55.6% |
| | ms in painter | 176.1 | 68.1 | −61.3% |

**The coalescing owns the win.** The style cache is total as a call count but its share of the milliseconds cannot be separated from the coalescing with a main-thread harness. **The tile-decode change is unproven, not disproven**: long tasks were zero on both sides even against 262 KB incompressible noise tiles at 8x the decode bytes, because both `new Image()` and `createImageBitmap()` decode off the main thread and this harness measures the main thread. The DPR clamp does exactly what it claims on pixel count, but baseline painter time rises only 14% for a 9x backing store — the painter is dominated by per-primitive JS, not fill rate, and headless never rasterises those pixels anyway.

Per-call painter time rises 80–170% on the branch in every scenario. That is one coalesced paint absorbing five to seven baseline paints, not a regression, but quoting that row alone inverts the result.

**One bug the fork found and upstream could not.** `createImageBitmap` was reached through `fetch`, which is subject to CORS where an `<img>` load is not. Upstream's `maps/bakurani.json` points at a relative `maps/tiles/` path, so upstream tiles are same-origin and it never fires; the fork's `TILE_BASE_URL` object storage sends no `Access-Control-Allow-Origin`, so every tile paid a CORS-blocked fetch before falling back to the image path — tiles still rendered, and `sync/test/browser.mjs` went 44/1 on console errors. `createImageBitmap` is now used only for same-origin tiles; cross-origin ones take `new Image()` plus `img.decode()`, which is off-thread everywhere and CORS-free. Setting `crossOrigin='anonymous'` would not have helped (the bucket sends no header) and neither would `createImageBitmap(imageElement)` (it rejects on a non-origin-clean image).

---

## Dead ground and the minimum range ring reworked on `feat/collab-rooms`

Two commits on the fork branch, on top of #11's terrain solver: `c46944ab7` solves the minimum range ring against the terrain instead of drawing the declared flat circle, and `ebd28c291` stops the dead-ground shading from being computed off a single arc.

The minimum range ring now marches each bearing the way the max ring does, testing `declaredMin + (modelRangeAtAngle(v, theta, z - zGun) - levelMin)` at the tube's maximum elevation, so ground that drops away in front of the gun pushes the inner edge out and ground that rises pulls it in. The dead-ground wedges are clipped to that per-bearing inner edge rather than to a scalar, and the fill became a red diagonal hatch over a dark wash so it reads as a hazard rather than as a shadow.

**The shading was answering the wrong question.** `deadGroundMuzzleVelocity` picked one arc and preferred `branch === 'low'`, so ground was shaded whenever the flat arc was masked by an intervening crest — but the SPG carries both a `low` and a `high` fit and the mortar is `high` only, and the high arc leaves the tube steeply enough to clear nearly every crest the low arc dies on. A point is dead only when **every** arc is blocked, so each arc now carries its own running required-tangent accumulator and its own muzzle velocity, and the launch solve takes the plus root for a high-branch arc where it took only the minus root before. The grazing accumulation stays on the minus root for both arcs: that is the shallowest launch that clears a crest, and for a fixed launch angle the shell's height at any x rises with launch tangent, so it is the correct threshold for the steep arc too.

**A sentinel was leaking into the accumulator.** `deadGroundGrazingTan` returned `Infinity` when the discriminant went negative — when the arc simply cannot reach that crest — and `required` only ever ratchets upward, so the first out-of-reach sample on a bearing made every sample beyond it unconditionally dead. Standing at the foot of a large hill shaded the whole hill including its near face, which is in direct view with nothing in between. An arc failing to reach range x is a range fact, not a masking fact, and the march is already bounded by `ring.radii[b]`, so an unreachable crest no longer raises that arc's `required`. An unreachable *target* is now counted as blocked for that arc, which under the all-arcs rule only shades the point when no arc can deliver there.

Measured with a Playwright script against the Bakurani heightfield, an SPG, the old single-arc algorithm re-run in the same page for the comparison:

| Gun position | | wedges | angular metres | bearings shaded |
| --- | --- | --- | --- | --- |
| Map centre | before | 259 | 25,197 | 201 of 360 |
| | after | 70 | 875 | 70 of 360 |
| Foot of a 588 m rise | before | 406 | 351,023 | 300 of 360 |
| | after | 107 | 1,363 | 107 of 360 |

Across the twenty-one bearings running up that slope, none is shaded anywhere inside the crest after the change. The elevation-limit refinement — discarding an arc whose demanded launch angle falls outside `minElevationMil`/`maxElevationMil` — was deliberately left out: it needs a second angle helper threaded across `range-ring.js` and a per-arc tangent window through the sample loop, and the arc rule already carries the correction that mattered.

---

## The all-arcs rule reverted to low arc only

The all-arcs rule above is correct about what a gun *can* reach and useless as an overlay. Because the high arc leaves the tube steeply enough to clear nearly every crest, requiring every arc to be masked left the shading appearing only out near the max-range edge, where the launch angle is squeezed toward 45° and the two roots converge. The overlay was answering a question nobody asks: almost nothing is unreachable by *some* arc, and the player already knows that.

The question players actually have is where the flat arc — the fast one, the one preferred whenever it is available because the shell arrives sooner — is blocked. So `deadGroundArcs` now keeps `branch === 'low'` fits only, and `deadGroundLaunchTan` lost its `high` parameter along with the plus root; there is only ever the minus root now. Everything downstream is untouched: the per-arc `required` accumulator, the interval runs, the wedge tracing. This puts the browser copy back in agreement with `scripts/lib/dead-ground.mjs`, which never stopped solving `'low'` and whose tests therefore already covered the behaviour being restored.

The sentinel fix from `ebd28c291` is not reverted — an unreachable crest still leaves that arc's `required` alone, so a hill's near face stays unshaded.

**The wedge outlines are gone with it.** `c46944ab7` stroked every interval edge twice, a dark 3.5 px backing under a 1.5 px `rgba(236,104,104,.95)` red. Under the all-arcs rule those edges only ever appeared hugging the max-range ring, where they read as a second, redder range limit sitting on top of the real one and meaning something else. `traceDeadGroundEdge` and both stroke passes are deleted; the dark wash and the red diagonal hatch carry the layer on their own, which is what the wedges are actually made of.

**The mortar shades nothing.** Its fit is `single`, `branch: high`, so `deadGroundArcs` returns `null` and the layer draws nothing when the mortar is selected. That is the honest reading — a mortar genuinely drops behind almost any crest that matters — but it does mean the toggle is visibly inert for one of the two weapons, which is the thing to watch for in review.

`mapLayerDeadGround` was renamed in all eleven locale files to carry the qualifier: "Dead ground (low arc)" in English, translated rather than pasted elsewhere, `cat.json` by hand in its own register.

---

## Status board

Statuses: `todo` · `wip` (being cut) · `branch` (branch cut, not yet proposed) · `pr` (open upstream) · `held` (reviewed, blocked on something upstream wants first) · `merged` · `absorbed` (closed unmerged, content shipped in v1.7.0) · `parked`.

| # | Item(s) | What | Status | Branch |
| --- | --- | --- | --- | --- |
| 1 | 5.5 | Tower icon | [`pr` #9](https://github.com/apollyon-sys/wardogs-calculator/pull/9) | `upstream-pr/map-visuals`, carries v1.7.0 |
| 2 | 5.3 | Main zone circle | [`pr` #9](https://github.com/apollyon-sys/wardogs-calculator/pull/9) | `upstream-pr/map-visuals`, carries v1.7.0 |
| 3 | 7.1 | Positions survive a reload | [`pr` #8](https://github.com/apollyon-sys/wardogs-calculator/pull/8) | `upstream-pr/remember-positions`, carries v1.7.0 |
| 4 | 3.1 | Contour layer | [`absorbed` #10](https://github.com/apollyon-sys/wardogs-calculator/pull/10) | branch deleted |
| 5 | 3.2–3.4, 3.7 | Heightfield + terrain range ring + dead ground | [`pr` #11](https://github.com/apollyon-sys/wardogs-calculator/pull/11) | `upstream-pr/terrain-range-ring`, carries v1.7.0 |
| 6 | 7.2 | Saved-target highlight derived from position | [`absorbed` #13](https://github.com/apollyon-sys/wardogs-calculator/pull/13) | branch deleted |
| 7 | — | Marker tool does not turn off on a second click | [`absorbed` #12](https://github.com/apollyon-sys/wardogs-calculator/pull/12) | branch deleted |
| 8 | 5.1 | Tactical marker icons and picker labels | [`absorbed` #14](https://github.com/apollyon-sys/wardogs-calculator/pull/14) | branch deleted |
| 9 | 6.3 + 6.4 | `.env` config, analytics off by default | `parked` | — |
| 10 | 8.1–8.3 | Docs (`todo.md`, `ideas-research/`) | `parked` | — |
| 11 | 4.1 | Time of flight | [`pr` #15](https://github.com/apollyon-sys/wardogs-calculator/pull/15) | `upstream-pr/flight-time` (stacks on #11), carries v1.7.0 |
| 12 | 5.2/5.4 + 8.4 | FOB build areas, drag placed markers | [`pr` #16](https://github.com/apollyon-sys/wardogs-calculator/pull/16) | `upstream-pr/fob-build-areas` (stacks on #9), carries v1.7.0 |
| 13 | 6.1 + 6.2 | Tiles from object storage | `parked` | — |
| 14 | 2.1–2.4, 2.6, 2.8, 2.9 | Multiple guns | [`pr` #17](https://github.com/apollyon-sys/wardogs-calculator/pull/17) | `upstream-pr/multiple-guns` (on `integration/all-prs`), carries v1.7.0 |
| 15 | 7.3–7.8 | Saved-target markers and sync | `branch` | `upstream-pr/saved-target-markers` (on `upstream-pr/multiple-guns`) |
| 16 | 1.x | Shared sessions | `todo` | — (fork carries it on `feat/collab-rooms`; presence work tracked as item 21) |
| 19 | — | Force placement mode on the per-point lock icons | [`pr` #3](https://github.com/apollyon-sys/wardogs-calculator/pull/3) | `feat/force-placement-mode`, carries v1.7.0 |
| 17 | — | Parent tile drawn while the child loads | [`absorbed` #18](https://github.com/apollyon-sys/wardogs-calculator/pull/18) | branch deleted |
| 18 | — | Forced layout and no-op DOM writes on every pointer move | [`absorbed`](https://github.com/apollyon-sys/wardogs-calculator/pull/10) via #10 | branch deleted |
| 20 | — | rAF-coalesced redraws, cached CSS custom properties, `createImageBitmap` tile decode with a bounded LRU, `devicePixelRatio` clamped to 2 | `branch` | `upstream-pr/render-perf`, cut from v1.7.0 |
| 21 | 1.x | Live peer cursors, named and coloured | `branch` | `feat/collab-rooms` (fork only, extends item 16) |
| 22 | 3.7 | Terrain-solved minimum range ring, dead ground shaded where the low arc is masked | `branch` | `feat/collab-rooms` (fork only, extends item 5) |
| 23 | 1.x | Peer roster in the session panel, from a server-side roster | `branch` | `feat/ux-peer-roster` (fork only, extends items 16 and 21) |
| 24 | 3.7 + 7.x | Per-target reachability badges on the saved-target rows | `branch` | `feat/ux-reach-badges` (fork only, extends items 5 and 15) |

The contour half of #10 was measured the same way, layer on, Bakurani, same zoom, 300 wheel events, `20808c8ac` against `b7296af39`:

| | before | after | change |
| --- | --- | --- | --- |
| Zoom phase, total ms | 18,612 | 1,197 | 15.6x |
| Inside `drawContours` | 18,203 | 1,017 | 17.9x |
| — rasterising | 594 | 45 | 13x |
| — realloc + blit | 17,609 | 972 | 18.1x |
| Raster rebuilds | 300 | 102 | 2.9x |
| Per zoom step | 62.0 ms | 4.0 ms | 15.6x |

**The result did not come from where the effort went.** Cached paths, culling and LOD bought 4.4x per rebuild. The 18x came from not reallocating a 26 MP canvas on every rebuild and not rebuilding at all mid-zoom. Rasterising was never more than 3% of the cost — which is why the earlier `renderContourRaster` instrumentation read a healthy 0.84 ms and missed the problem entirely.

All of the render work is merged into `feat/collab-rooms` (`03fa7f345`) so the fork carries it too. The merge conflicted in 15 files, all mechanical: `js/map/contours.js` was byte-identical to the PR base on both sides so the improved version was taken whole; `js/map/renderer.js`, `package.json` and `docs/terrain.md` kept the fork's side as strict supersets; `.gitignore` and the ten page shells were unioned. `1ea08d400` then guards `renderTerrainNote()`, which exists only on the fork and writes on every `result()`.

Two things the merge surfaced and did not fix: `dev-env.test.mjs`'s "without .env the dev server serves the originals" already fails on `feat/collab-rooms` (confirmed at `782680aea` in a clean worktree), and the flight-time badges rebuild their DOM nodes with `host.textContent = ''` plus `createElement` on every `result()` — the same hot path the guards exist for, but needing reuse rather than a guard.

Item 18 is not an extraction either. It came out of profiling #10: the contour layer was blamed for zoom stutter, but a Chrome trace showed `set textContent` as the largest JS self-time **with contours off**, and a counting harness put `upstream/main` at 676 forced layout reads per wheel event and 20 readout writes per pointer move. `view()` is called from inside per-tile and per-marker loops and reads `clientWidth` every time, and `result()` rewrites all ten readouts unconditionally. Measured on the same map and zoom, 300 synthetic events each:

| | `upstream/main` | branch | change |
| --- | --- | --- | --- |
| Zoom, layout reads | 202,680 | 2,844 | 71x |
| Zoom, text writes | 3,000 | 0 | gone |
| Zoom, ms | 169.6 | 48.5 | 3.5x |
| Readout, layout reads | 183,000 | 1,200 | 152x |
| Readout, text writes | 6,000 | 782 | 7.7x |
| Pointer move, layout reads | 8,100 | 600 | 13.5x |

Cut from `upstream/main` so it stands alone, then **folded into #10 as a deliberate choice** rather than proposed separately: it reframes that PR from "the contour layer was slow" to "here is what was actually slow". The cost is that #10 now mixes a feature with an app-wide fix, so a hold on either half stalls both.

Item 17, like item 7, is not an extraction: `drawTileMap` paints a flat `#151a1d` rectangle for every tile that has not decoded yet, so each zoom step flashes black even off a warm cache, and `upstream/main` has the same code. It now draws the cached ancestor tile upscaled into the gap instead. Cut from `main`, proposed upstream as #18, and merged into `feat/collab-rooms` so the fork has it too.

Item 7 is not an extraction at all: it is a bug that exists in `upstream/main` unchanged, found while working here. Fixed on `feat/collab-rooms` in `caa9d9a2b`; the same 12 lines apply upstream as a standalone PR. `upstream/main`'s `markerButton` handler never calls `setMapTool()`, so a second click only closes the picker and leaves the tool armed. The `pencilButton` handler has the same shape and is not yet fixed.

## Review outcomes

All eleven open PRs were reviewed by the maintainer on 2026-08-30. Not one drew an implementation objection; the holds are about data he does not want to publish yet, and one about rendering cost.

| PR | Item | State | Why |
| --- | --- | --- | --- |
| [#12](https://github.com/apollyon-sys/wardogs-calculator/pull/12) | Marker tool toggle | `approved` | "No issues with this one" — awaiting merge |
| [#18](https://github.com/apollyon-sys/wardogs-calculator/pull/18) | Parent-tile fallback | `approved` | "I don't see any blockers" — awaiting merge |
| [#8](https://github.com/apollyon-sys/wardogs-calculator/pull/8) | Remember positions | `modified` | Keyed by map id in `463d30088`; awaiting re-review |
| [#13](https://github.com/apollyon-sys/wardogs-calculator/pull/13) | Derived highlight | `modified` | Highlights every coordinate match in `380f8882f`; awaiting re-review |
| [#14](https://github.com/apollyon-sys/wardogs-calculator/pull/14) | Tactical markers | `modified` | KO/ZH machine strings dropped in `0387012cd`; awaiting re-review |
| [#9](https://github.com/apollyon-sys/wardogs-calculator/pull/9) | Main zone circle | `blocked` | Needs confirmed main-zone radii/positions from game data |
| [#16](https://github.com/apollyon-sys/wardogs-calculator/pull/16) | FOB build areas | `blocked` | Needs confirmed FOB dimensions; also carries #9's commits |
| [#11](https://github.com/apollyon-sys/wardogs-calculator/pull/11) | Terrain range ring | `blocked` | Built on the superseded vacuum-fit projectile model |
| [#15](https://github.com/apollyon-sys/wardogs-calculator/pull/15) | Flight time | `blocked` | Same projectile model as #11; stacks on it |
| [#10](https://github.com/apollyon-sys/wardogs-calculator/pull/10) | Contour layer + render cost | `modified` | Rebuilt for cost in `db9a45377`–`4e4eac156`; awaiting re-review |
| [#17](https://github.com/apollyon-sys/wardogs-calculator/pull/17) | Multiple guns | `blocked` | Wants a rebase onto a base without the held PRs |

**Approved, awaiting merge.** #12 (marker tool toggle) and #18 (parent-tile fallback) — "no blockers" on both.

**Feedback addressed and pushed, awaiting re-review.**

- **#8** — `wardogs-map-points` stored one map at a time, so switching maps overwrote the previous map's positions. Now keyed by map id (`463d30088`). The legacy single-map value migrates into its own key rather than being discarded, and `js/events.js` calls `loadMapPoints()` on map switch before the `clamp()` calls, so restoring works on switch and not only on reload. The 300ms write throttle means a drag in the last 300ms before a switch is lost; it cannot write coordinates under the wrong map id, so it is not a return of the reported bug, and it was left alone.
- **#13** — `activeSavedTargetId()` used `find()`, so duplicate coordinates highlighted the first entry whichever was restored. Now `activeSavedTargetIds()` returning a `Set` (`380f8882f`). Highlighting every match is the honest fix rather than merely the smaller one: `restoreTarget()` writes only `S.target.x/y`, so no identity from the saved entry survives into app state, and preserving identity would reintroduce exactly the state this PR removes. The same change fixes a second latent bug — `dataset.targetId` is always a string, so the old `===` silently failed to match numeric ids arriving via the import path.
- **#14** — the machine-written KO/ZH marker labels are dropped (`0387012cd`), four keys each from `locales/ko.json` and `locales/zh-cn.json`, no other locale touched. English fallback verified in both layers: `tr()` resolves `language?.[key] ?? fallback?.[key] ?? key` with `DEFAULT_LANG` of `en`, and `getMarkerAssetLabel` additionally guards against rendering a bare key. **The same objection applies to `bf79c953b` on `feat/collab-rooms`,** which added unreviewed machine-written height-correction strings for every remaining locale.

**Held on confirmed game data.** He will not merge eyeballed values as authoritative measurements.

- **#9** main zone circle — radii and positions must come from game files or another reliable source. He also wants maps with no known data to draw nothing rather than fall back to a guessed centre circle; that half is a small code change, but pointless before the data question is settled. #9 is the base of #16.
- **#16** FOB build areas — the 60 m half-side is eyeballed from footage. The interaction work (move, rotate, snap, undo) was praised specifically. Needs a rebase once #9 resolves.

**Held on ballistics.** #11 and #15 both derive from the vacuum-fit projectile model, which he says his private research has superseded, and automatic terrain ballistics is deliberately disabled pending held-out validation. Nothing to fix in either; they wait on the new model. #15 stacks on #11 regardless.

**Held on performance.** #10 contour layer — he tested it and found the cost too high while zooming, diagnosing the rebuild/rasterise of contour paths on every zoom-scale change. His suggestions: cache the paths, defer the raster rebuild until zooming stops, add LOD for minor contours. This is real, self-contained work, not a data blocker, and it is the one hold that can be cleared without him.

**Rebase requested.** #17 multiple guns — the feature is wanted ("absolutely something I want"), but the PR carries #8–#16 with it, including changes he will not merge. He asked for a rebase onto a cleaned-up base once the others resolve.

**Verification limitation.** Branches cut from `upstream/main` have no test suite at all — `test/` and `test:scripts` exist only on the later branches. `npm run build` passes on all three fixes but exercises none of the changed logic; each was checked instead in a throwaway harness, which is not committed. Any of these three that the maintainer merges will be merged without a regression test.

Most branches are cut from `upstream/main` and carry only their own feature. Two are **stacked** and cannot merge before their base:

- `upstream-pr/flight-time` (item 11) branches from `upstream-pr/terrain-range-ring`, because `loadProjectileModel()` and `PROJECTILE_MODEL` live in `js/map/range-ring.js`, which exists only there. It also re-adds `projectileModelArc()`, which #11 dropped as dead code with flight time as its only consumer.
- `upstream-pr/fob-build-areas` (item 12) branches from `upstream-pr/map-visuals`, because FOB areas need a `fob` kind in `RING_SIZE_KEYS` / `getRingConfig`, and that plumbing shipped in #9 as `mainZone`-only. **The markers branch turned out to be a sequencing dependency, not a code one:** `drawFobBuildAreas` filters markers for `icon === 'fob'` and draws nothing when none exist, and `markerSupportsRotation` returns false for every icon that exists today, so the wheel keeps zooming. The feature is therefore inert, not broken, until the markers PR lands the icon. That is why the branch has a single parent.

Because GitHub cannot take a cross-fork PR whose base is a branch in the fork, both stacked PRs target `main` and their diffs currently include their base's commits. Each body opens by saying so.

Item 8.4 evaporated on contact: since the `fob` ring config has never shipped upstream, there is no rename to perform. The key ships as `halfSide` from the start and `radius` never exists for it.

Everything is pushed to `origin` (the fork). Ready-to-use PR bodies are at the bottom of this file.

---

## Migration phases

Items 1 through 12 were extracted opportunistically, smallest and cleanest first. What remains is ordered by dependency instead, because each phase is what the next one is built on.

**Phase 1 — land what can land.** After review this is a much smaller set than "#8 through #16": #12 and #18 are approved, and #8, #13 and #14 are waiting on re-review. #9, #10, #11, #15 and #16 are all held on things outside the diffs, so the phase now ends with five PRs merged and five parked indefinitely. Nothing new stacks on any of them meanwhile.

**Phase 2 — multiple guns (§2.1, then §2.2/2.3).** Before collaboration, not after. Collab's op families include `gun.add` / `gun.remove` and its client syncs the gun list, so landing guns first means collab ships once, complete. The other way round means shipping collab without gun sync and then reopening the worker's validation and op dispatch to add it, touching the riskiest file twice. §2.1 is the keystone: it makes `S.origin` and `S.weapon` accessors onto the selected gun so every existing reader is untouched and `js/core/core.js` never conflicts on an upstream merge. That property is the thing to protect.

**Phase 3 — saved-target map markers (§7.3–7.8).** Stacks on Phase 2. It collides with guns in three places, which is why it cannot run in parallel: 7.4 (click a marker to activate it) lives in the same `js/events.js` / `js/mobile/mobile.js` hit-test block as 2.6 (pick up the gun you click); 7.6's per-target artillery toggle decides whether restoring a target also moves the **guns**, plural, so it has to be written against the real gun list or written twice; and `c3edba645` carries 7.3–7.8 and 2.8/2.9 in one commit.

**Phase 4 — collaboration, as two PRs, in this order.** The collab files alone are **6,346 lines** before the hooks, the toolbar UI, the popover CSS and twelve locales.

1. **`sync/` alone** — the worker, the op validation, its ~1,160 lines of tests, `sync/README.md`. About 2,500 lines. It deploys standalone and changes nothing about the site (`changes.md` records 1.1 as *Needs: none*).
2. **Everything client-side** — `js/features/collab.js`, the `collab.url` config gate, `getCollabServiceUrl()`, the self-disabling behaviour, the `collabOn*` hooks in `map-tools.js` and `saved-targets.js`, the toolbar button, the popover, the CSS and the strings. About 3,800 lines, and a working feature the moment it lands.

**Why this split and not the earlier three-way one.** Separating the client module from its hooks and UI would have produced a middle PR consisting entirely of dead code: nothing could exercise it, the real review would happen at the next PR anyway, and if that next PR were rejected upstream would be left carrying a dead 1,946-line module. Client, hooks and UI are one testable unit and ship together.

The worker stays separate for a different reason: it is testable in isolation, runs under a different runtime, and reviewing a Durable Object is a different skill from reviewing the canvas client.

**Worker first is an operational requirement, not just review order.** The maintainer intends to host the service on Cloudflare themselves. The client reads `collab.url` from config and self-disables when it is absent, so the Worker has to be merged and deployed, and its `wss://` endpoint known, before the client PR has anything real to point at.

Still worth opening an issue before building either, to agree the shape and confirm the endpoint arrangement.

**`integration/all-prs`** is a branch merging all nine open PR branches, used as the base for Phase 2 so guns can be built against "everything landed". **The review invalidated it as the base for #17's rebase:** it contains #9, #10, #11, #15 and #16, all now held. The real base is `upstream/main` plus #8, #12, #13, #14 and #18 once those merge. It is a working aid, not a thing to propose upstream.

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

- No new user-facing strings for the ring; the gain band is unlabelled. The dead-ground layer below adds one, `mapLayerDeadGround`.
- No CSS. Canvas only.
- `loadProjectileModel()` and `PROJECTILE_MODEL` are exported from `range-ring.js` and load in `init()`.
- The last commit adds unit tests and a browser test plus a `test:scripts` entry. The project has no test setup today, so that commit is last and separable.

## Shade the dead ground behind the crests

A second, optional layer over the same heightfield. The ring says how far the gun reaches on each bearing; this says where inside that reach a crest is in the way.

Each bearing is marched outward at the same 25 m step the ring already uses. A point is dead ground when the flattest trajectory that would land on it passes below the ground somewhere closer. Runs of dead samples merge into intervals and draw as dark radial wedges under the artillery overlays.

Only the flattest arc a weapon has is shaded — SPG-2 `low`, mortar `single` — because the steeper arc reaches much of what the flat one cannot.

The layer is off by default and solved only while it is on. Unlike the ring, it reads the fitted vacuum model *absolutely* rather than as a difference from it, so nothing here inherits the ring's flat-ground-is-exactly-zero property. It is guidance about where to expect trouble, not a statement that a shell cannot land there, and `docs/terrain.md` says so in those words.

With no heightfield, no fitted model, an unsupported map or a gun off the grid, it draws nothing and logs nothing. The ring is untouched either way.
````

### Dead-ground shading, added after the PR was opened

Five further commits (`8539f139a` … `cf2a30814`) landed on the branch after #11 was proposed. They are additive: nothing the PR already carried was changed, apart from the layer list, the layer defaults, one block in `draw()`, and the `test:scripts` line. The PR body above carries its own `## Shade the dead ground behind the crests` section for it.

The ring answers *how far*. This answers *where inside that reach a crest is in the way*. Per bearing, the terrain is marched outward in the same 25 m steps the ring already uses; a sample at range `R` is dead when the low-root trajectory that lands on it passes below the ground somewhere closer. Adjacent dead samples merge into intervals and draw as dark radial wedges.

Three things worth reviewing rather than trusting:

- **It is the same unvalidated fit.** `projectile-model.json` is `source: "vacuum-fit"`, never checked against the game, and this layer is the first drawing that uses it *absolutely* rather than as a difference. The ring's honesty property — zero correction on flat ground — does not transfer. That is the reason the layer ships default-off and the docs say so out loud.
- **Flattest arc only.** SPG-2 `low`, mortar `single`. A weapon with a steeper arc will reach much of what is shaded, so a wedge means "the flat arc cannot", not "the weapon cannot".
- **The O(N²) inner loop is not needed.** For fixed `x` the trajectory height is monotone in `tan θ` over the whole domain the low root occupies (`t ≤ v²/gx`), so "is any closer sample above the arc" collapses to one running maximum of the grazing tangent. Measured against the shipped Bakurani heightfield, 30 random SPG-2 positions, 360 bearings: **35 ms median** (31–45 ms) per solve, against 100 ms for the literal double loop and 33 ms for the ring itself — most of what is left is the terrain sampling, not the ballistics. Solved lazily, only while the layer is on, and memoised beside the ring under the same 8 m key and 256-entry bound.

`scripts/lib/dead-ground.mjs` holds the solver the way `ballistics.mjs` holds the ring's; `js/map/dead-ground.js` mirrors it for the browser, and a test asserts the fast form and the direct predicate agree on 60 random profiles. On those 30 Bakurani positions, 97 % of bearings carry some dead ground — which is either the terrain being genuinely rough for a 160 m/s flat arc at 2.6 km, or the first thing a screenshot should question.

**This one does not widen the locale gap below.** `mapLayerDeadGround` was written into all twelve locale files, `cat.json` by hand.

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

---

## §7.3–7.8 — `upstream-pr/saved-target-markers` — no PR yet

Stacked on `upstream-pr/multiple-guns` (#17), which is itself on `integration/all-prs`. 28 files, +796/-145. Six commits, no droppable test commit: the fork has no Playwright tests for saved targets.

7.8 **evolved** #13's code rather than duplicating it. The epsilon comparison was factored into `savedTargetPointMatches(point, x, y)`, `savedTargetMatchState()` became the single source of truth returning `{ id, level }`, and `activeSavedTargetId()` is now `return savedTargetMatchState().id`. #13's performance split survives: `refreshSavedTargetHighlight()` still walks rows already in the DOM, and both it and the full render call the same `applySavedTargetRowState` so they cannot drift.

7.4 sits at the top of the `else` in the guns hit-test block, so it fires only when neither a gun nor the live target was grabbed, and returns without setting `drag`. Same 300 m threshold as the gun test. `savedTargetNearest` skips `activeSavedTargetId()`, so the marker you are standing on is never a click candidate, which matches 7.3 not drawing it.

7.6 against the gun list means: restoring moves the **active** gun and leaves the others alone, because `S.origin` is the accessor onto `activeGun().position`. Saved targets persist under their own key, so the always-present `origin` and the per-target `saveArtillery` flag ride along automatically without touching 7.1's payload.

Two seams the agent flagged rather than papered over. With no weapon selected, `drawGuns()` bails but `drawSavedTargets()` still skips the matched target, so nothing is drawn at that spot — the fork behaves the same way. And `styles/mobile/sheet.css` never got the new index badge, artillery toggle and sync button styling, so those render with default button chrome on mobile — also a pre-existing fork gap.

It also updated the `saveArtilleryPosition` wording in all eleven static locale shells; the fork had only done three, leaving eight showing the old pre-hydration text.

````markdown
Stacks on the guns PR (#17) and assumes #8 through #16 are merged.

Saved targets are drawn on the map as light orange numbered markers, and clicking or tapping one activates it. The row number and the map label come from the same list order. Every saved target now stores an artillery position, and a small button on each row decides whether restoring it also moves the gun; the existing checkbox becomes the default for new targets only. A sync button on each row updates a saved target to your current position, hidden wherever it would just duplicate what is already there.

A target that carries an artillery position describes two points, so the row tells a full restore apart from being on the target with the gun elsewhere. The partial case is drawn with a dashed border and keeps its sync button so you can reconcile it. This grows the derived highlight from #13 rather than replacing it: activeSavedTargetId still exists and still derives from where the target actually sits.
````

---

## Per-target reachability badges — `feat/ux-reach-badges`

Item 24. One new file, `js/features/reach-badges.js`, plus a locale block, a CSS block, a script tag in both page shells and a browser test. `js/features/saved-targets.js` is not touched at all: the file wraps `renderSavedTargets` and `refreshSavedTargetHighlight` the way `js/features/results.js` already wraps them for the firing-info panel, so the two extensions stack instead of conflicting.

The badge is a query, not a model. `terrainRangeRing()` gives the terrain-solved max radius and, from item 22, the minimum-range radius per bearing; `terrainDeadGround()` gives the masked intervals per bearing. A target is then one `atan2` into the bearing bucket and a comparison — no ray marching, no bisection, no second heightfield sampler. Ring and dead ground are already memoised under `rangeRingMemoKey()`, so the per-gun cost is paid once per 8 m of gun travel and shared with the map layers.

Nothing solves on the render path. `RANGE_RING_CACHE.has()` and `DEAD_GROUND_CACHE.has()` decide whether a gun is answerable *now*; an unsolved gun is skipped and one gun per idle callback is solved in the background, then the badges are refreshed. Rows are diffed by a signature over map, language, active gun and every gun's memo key, so a pointer move that changes nothing costs one string compare. Badge nodes are reused and every write goes through a guard or `setText` — the row rebuild the plan complains about above is not repeated here.

Measured in Chromium against the shipped Bakurani heightfield, 8 SPG-2 guns and 500 saved targets: 24.1 ms to solve all eight rings and dead-ground passes cold (idle-sliced in practice, one gun per callback), 15.3 ms for the first badge pass that creates 4,000 nodes, 4.2 ms to reclassify and update all 4,000 in place, and 0.000 ms for a pass where the signature is unchanged.

With no heightfield, an unsupported or custom map, no projectile model, or a gun off the grid, no badge is drawn — never a guess. Badges are local: nothing is persisted and no collab op exists for them, so two peers in one room correctly see different badges on the same target.
