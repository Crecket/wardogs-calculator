# Rendering performance

What the map costs per frame, what was measured, what was changed, and the ranked list of what is left. Every number here comes from `npm run bench:render`; rerun it before trusting any of them on a different machine.

## The benchmark

`scripts/bench-render.mjs` (also `npm run bench:render`) launches Chrome through `playwright-core`, loads the dev server, sets up one scenario (SPH-2 at 92.53, 84.88 firing at 81.03, 71.36 on Bakurani, every map layer forced on, heightfield, contours and hillshade loaded) and then measures, on both the desktop page and `/mobile/`, at CPU throttling 1x, 4x and 6x:

- `still`, `pan`, `zoom`: 40 frames of `drawNow()` with the view mutated between frames, reported as median, p95, max and the count of frames over 16.7 ms, plus a per-function self-time table. The solvers and layer painters are wrapped in place (the app is classic scripts sharing one global scope, so every function is a writable global) with a call stack, so a parent's time excludes its children and the table adds up to the frame.
- `originDrag`, `targetDrag`: 40 frames with the gun or the target moved 3 m per frame with the solver caches cleared first, which is what a marker drag does.
- `fresh solves`: microbenchmarks of `terrainRangeRing`, `terrainDeadGround`, `assessShot`, `crossSectionModel`, a cold `trajectoryFamily` build and a contour raster rebuild. Each repetition shuffles the order and the medians are reported, because measuring layers in a fixed order lets the first one warm the caches for the rest.
- On desktop, a right-button pan driven by real mouse events, to confirm the synthetic pan matches what the event handlers produce.

Options: `--url` (default `http://127.0.0.1:8000/`), `--pages desktop,mobile`, `--throttle 1,4,6`, `--steps 40`, `--repetitions 5`, `--profile` (CDP CPU sampler over an origin drag, self time per function), `--counts` (call counts per frame for the hot tiny functions; off by default because wrapping a function called 700k times per frame distorts the timing), `--snapshot file` / `--compare file` (ring radii and dead-ground wedges for six gun positions, so a solver change can be proven exact), `--json file`.

It needs a browser, so it is not part of `npm run test:scripts`. Map tiles are not in the repo, so the tile layer draws nothing in this harness unless `npm run sync-tiles` has been run.

A note on the earlier profile that motivated this work: it dragged with the left mouse button from the canvas centre. On this app that is not a pan, it places and drags the active marker (`S.mode`), which is why ballistics functions appeared in a profile of what was believed to be a pan. Pan is the right button.

## Where the time goes

Desktop 1900x1000, every layer on, medians over 40 frames, before and after the commits on this branch:

| scenario | 1x before | 1x after | 4x before | 4x after | 6x before | 6x after |
| --- | --- | --- | --- | --- | --- | --- |
| still | 1.3 ms | 0.7 ms | 6.3 ms | 1.9 ms | 8.2 ms | 5.9 ms |
| pan | 1.3 ms | 0.6 ms | 6.7 ms | 2.2 ms | 8.5 ms | 3.1 ms |
| zoom | 1.4 ms | 0.7 ms | 5.6 ms | 2.4 ms | 8.7 ms | 2.9 ms |
| origin drag, median | 2.3 ms | 1.4 ms | 10.6 ms | 5.8 ms | 15.5 ms | 10.5 ms |
| origin drag, p95 | 152 ms | 86 ms | 692 ms | 373 ms | 1027 ms | 600 ms |
| target drag | 1.5 ms | 0.9 ms | 6.8 ms | 3.6 ms | 11.5 ms | 6.4 ms |
| real right-button pan | 1.8 ms | 1.1 ms | 8.4 ms | 4.3 ms | 12.0 ms | 6.7 ms |

Mobile page, 390x844 at device scale 3:

| scenario | 1x before | 1x after | 4x before | 4x after | 6x before | 6x after |
| --- | --- | --- | --- | --- | --- | --- |
| still | 1.5 ms | 0.7 ms | 6.0 ms | 2.3 ms | 8.6 ms | 3.7 ms |
| pan | 1.4 ms | 0.6 ms | 6.1 ms | 2.5 ms | 9.1 ms | 3.9 ms |
| zoom | 1.6 ms | 0.8 ms | 5.7 ms | 2.4 ms | 8.9 ms | 3.2 ms |
| origin drag, p95 | 173 ms | 95 ms | 700 ms | 370 ms | 1110 ms | 557 ms |

Fresh solves, desktop (mobile is within a few percent):

| solve | 1x before | 1x after | 4x after | 6x after |
| --- | --- | --- | --- | --- |
| `terrainRangeRing`, new gun position | 13.6 ms | 4.6 ms | 20 ms | 27 ms |
| `terrainDeadGround`, ring cached | 159 ms | 59 ms | 434 ms | 388 ms |
| `assessShot`, new target | 0.1 ms | 0.1 ms | | |
| `crossSectionModel` | 0.1 ms | 0.1 ms | | |
| `trajectoryFamily`, cold | 19 ms | 18 ms | 73 ms | 113 ms |
| contour raster rebuild | 35 ms | 35 ms | 146 ms | 248 ms |

Three facts fall out of this:

1. A pan or zoom does no ballistics. With the caches warm a frame calls `trajectoryFamily` 14 times and `weaponReachRange` twice, all memo hits. The frame is painting: the dead-ground wedges were the single largest item (0.75 ms at 1x, 3.3 ms at 4x, 4.6 ms at 6x) until they were cached as a `Path2D`; what remains is `result()` writing the sidebar, the gun rings, the preset markers and the grid, each around 0.1 ms at 1x.
2. Dragging the gun is where the stalls are, and they are solves, not painting. Every 8 m of travel mints a new range-ring memo key and, with the dead-ground layer on, a dead-ground solve. The ring was 13.6 ms and dead ground 159 ms at 1x; a budget phone at 4x to 6x throttling was seeing 60 ms and 700 ms to 1100 ms freezes per 8 m.
3. The contour raster rebuild is the one pan stall that is left. When a pan crosses the 320 px margin of the cached raster the layer is re-stroked synchronously: 35 ms at 1x, 146 ms at 4x, 248 ms at 6x. That is the 150 ms to 190 ms maximum in the throttled pan rows above. Contours are off by default.

## Can the ballistics move to a Web Worker?

No for the case the question was about, yes for one specific job, and not yet for that one either.

For pans and zooms there is nothing to offload: the memoised model contributes nothing measurable to a frame. A worker cannot make 0.6 ms faster, and the marshalling of a request and a reply per frame would cost more than the work it replaced.

For marker drags the cost is real but it is two discrete solves, not per-frame arithmetic, and each has to be judged on its own:

- The range ring is drawn synchronously from `drawGunRangeRings`. If it came back from a worker a frame or more late, the ring would trail the marker while dragging and snap into place afterwards, and the cross-section, reach badges and dead ground all read the same ring, so they would all be a step behind. That is acceptable for a 5 ms solve only if the alternative is worse, and it is not: after the march start fix the ring is 5.6 ms at 1x and 33 ms at 6x per 8 m of drag, and the remaining cost is the 14 bisections per bearing, which items 3 and 4 below can still cut without changing a result.
- Dead ground is the job a worker would genuinely suit: 110 ms at 1x and 672 ms at 6x, off by default, and it already tolerates staleness (the reach badges solve it lazily on idle in `js/features/reach-badges.js`). But `requestIdleCallback` does not help here, because an idle callback that takes 670 ms still blocks the thread for 670 ms; only chunking or a second thread does. Both are possible: the solver is pure (`model.js`, `assessArc` in `reachability.js`, `deadGroundBearingIntervals`, `heightfieldSample`), the field is a 479 KB `Float32Array` copied once per map, positions go in and 360 small arrays come out, and the 2.7 MB family never crosses the boundary because the worker builds it from the fit in 18 ms. `js/ballistics/model.js` and `js/ballistics/reachability.js` load in a worker as they are; `fetchJSON` is only called from `loadProjectileModel`, which the worker would not call. What it would cost: a `worker.js` that `importScripts` those files plus a message protocol, `drawDeadGround` drawing the last solved wedges while a solve is in flight, and `reachSolveGun` in `reach-badges.js` learning to wait for an answer instead of reading the cache synchronously. That last part is the risk, and it is the same work a chunked idle solver needs, so the choice between them is a question of whether a spare core is worth a second copy of the model state. On a phone with four slow cores it is.

The order that makes sense: exhaust the exact algorithmic wins in the list below first, because they shrink the job for either approach, then make the dead-ground solve asynchronous with a worker behind it, keeping the synchronous path as the fallback where `Worker` or `OffscreenCanvas` are missing. The contour raster is the other candidate for a worker, through `OffscreenCanvas`, and a better one than ballistics: it is a pure stroke of `Path2D`s in game coordinates into a bitmap, the old raster can stay on screen until the new one arrives, and the 250 ms it costs on a slow device is the largest stall a pan can hit.

## What changed on this branch

All four solver changes are exact. `--compare` against a snapshot taken before them reports zero difference in 2160 ring radii and every dead-ground wedge across six gun positions, and the 108 script tests pass.

- `js/map/range-ring.js`: the march used to start at 25 m on every bearing. The shell's reach at the highest ground on the map is a lower bound on its reach anywhere, so every distance below that bound is inside the ring without asking the terrain. The march now starts at the last 25 m step below that bound and visits exactly the steps the old loop would have, so the bisection sees the same bracket. `js/map/heightfield.js` exposes `maxZMeters` from the header for it. 13.6 ms to 5.6 ms.
- `js/map/dead-ground.js`: the clearance test walked every terrain sample between the gun and the impact and asked the model for the shell height at each one, which is quadratic in the samples per bearing (720k `modelShellHeight` calls per solve). A shell path is concave in x for this drag law, so it lies above the chord from the gun to its impact, and any sample under that chord cannot mask it. The chord is anchored on the model's own height at the impact range rather than the terrain height, because the family interpolates range and height separately and the two disagree by metres; anchoring on the terrain changed 130 bearings. 159 ms to 110 ms; what remains is one `familySolve` per sample.
- `js/ballistics/model.js`: `familyRange`, `familyTime` and `familyHeight` allocated a closure per call and the garbage collector was 8% of a ring solve; the sampler now takes its argument through `familyBlend`. `arcAngleStops` recomputed a constant per fit on every call and is memoised on the fit, validated against the weapon's elevation stops.
- `js/map/dead-ground.js`: the 360-wedge outline was traced onto the context on every frame. It is now built once per solved result as a `Path2D` in world units and placed with translate and scale, with the hatch pattern's transform inverted so the hatch stays at its device pixel size. The hatch now moves with the ground instead of staying anchored to the canvas while the map pans. 0.75 ms to under 0.05 ms per frame at 1x, 4.6 ms to 0.05 ms to 0.12 ms at 6x; the path is rebuilt only on the frame a new solve lands, which the origin-drag rows show as 1.8 ms to 2.5 ms of `drawDeadGround` self time on those frames.


## Suppressing the solve during a drag

The 20 fps a gun drag produced with every layer on was two solve sites, not one:

- `drawDeadGround` calls `terrainDeadGround` synchronously inside `drawNow`, and the memo key is quantised to 8 m of gun position, so every 8 m of travel paid a full solve inside the frame.
- `reachSignatureNow` in `js/features/reach-badges.js` includes every gun's memo key, so the same 8 m of travel also re-ran `reachScheduleSolve`, which solves dead ground for *every* gun in `S.guns`. It runs under `requestIdleCallback`, which does not help: a 59 ms idle callback blocks the thread for 59 ms like any other.

Both are now gated on `deadGroundSettled()` in `js/map/dead-ground.js`. It hashes every gun's memo key, and any change hides the layer on that same frame and restarts a 100 ms debounce; only when the debounce elapses does either site solve. The gate arms itself on call, so the draw loop drives it during a drag and the reach scheduler polls it otherwise.

On settle the layer fades back in over 140 ms (`deadGroundRevealAlpha`, ease-out quad) rather than popping. The fade is free: the wedges are already a cached `Path2D` filled twice, 0.05 ms per frame at 1x and 0.12 ms at 6x, and the fade only adds a `globalAlpha`. The fade clock starts *after* the solve returns, so the 59 ms solve does not eat the first frames of the animation.

What this does and does not fix: the drag itself no longer solves at all, on any device, which is the part that could not be fixed by arithmetic — 388 ms at 6x throttle was never going to fit a frame. The cost is now paid once, 100 ms after the marker stops. That single stall is still 59 ms at 1x and 388 ms at 6x, and it is what backlog item 3 (the angle sweep) and a worker would address.

The range ring is deliberately not gated: it must track the marker or the drag looks broken. It stays at 4.6 ms at 1x and 27 ms at 6x per 8 m of travel, which is the remaining drag cost.

Not yet measured with `npm run bench:render`; the reasoning above is from the code and the existing numbers in this document. The five new cases in `scripts/lib/dead-ground-runtime.test.mjs` cover the gate and the fade ramp.

## Backlog, ranked by expected gain against effort

Measured numbers are from the tables above; estimates are marked.

1. Contour raster rebuild off the frame. `js/map/contours.js`, `renderContourRaster` via `drawContours`. 35 ms at 1x, 146 ms at 4x, 248 ms at 6x, paid synchronously whenever a pan leaves the 320 px margin or a zoom settles. Fix: draw into a second canvas so the old raster stays on screen, and either stroke one level per frame across several frames or move the stroke into a worker with `OffscreenCanvas` and receive an `ImageBitmap` (the paths are game-coordinate `Path2D`s; a worker needs the decoded polylines once). A cheaper partial step is to start the rebuild when the view is within a third of the margin instead of at the edge, which hides it behind slow pans but not fast ones. Medium size, low risk for the double buffer, medium for the worker.
2. The dead-ground solve on settle. `js/map/dead-ground.js` `terrainDeadGround`, `js/features/reach-badges.js` `reachSolveGun`. The per-8 m cost during a drag is gone (see "Suppressing the solve during a drag" above); what is left is one 59 ms solve at 1x, 388 ms at 6x, 100 ms after the marker stops, multiplied by the number of guns the reach scheduler has to catch up on. A worker removes the block entirely and is designed in the section above; the reach badges reading the cache synchronously is still the risk. Item 3 shrinks the same job without a thread and should be tried first.
3. Dead ground solves in angle instead of range. `deadGroundBearingIntervals` calls `assessArc` once per 25 m sample, and each call is a 40-step `familySolve` plus four `arcMaxRangeModel`/`arcMinRangeModel` evaluations: about 72k solves per gun position, now the whole cost. Sweeping the 357 family angles along the bearing profile and marking which samples each path lands on is linear in samples per angle and needs no solve, but it discretises the launch angle at 0.25 degrees so the wedge edges would move by up to a sample; a test that pins current wedges would have to be re-baselined. Estimated 5x to 10x on the solve. Medium size, medium risk because it changes results.
4. Range-ring bisection count. `js/map/range-ring.js`, 14 bisections per bearing after the march, now about two thirds of the 5.6 ms. Each halves a 25 m bracket, so 14 gives 1.5 mm; 8 gives 10 cm, which is far below the 32 m grid the field is sampled on. Estimated 5.6 ms to about 3 ms. Trivial size, but it changes radii at the centimetre level, so it needs a re-baselined snapshot.
5. Level values in `assessArc`. `js/ballistics/reachability.js` `assessArc` calls `arcMaxRangeModel(weapon, fit, 0)` and `arcMinRangeModel(weapon, fit, 0)` on every call; both are constants per fit. Memoise them on the fit like `arcAngleStops`. Estimated 5% of a dead-ground solve. Trivial, exact.
6. Fewer arcs in `weaponReachRange`. `js/map/range-ring.js`, called 8k times per ring solve, loops `REACH_ARCS` and calls `projectileModelArc` for each; for the SPH-2 one of three has no fit. Resolve the fitted arcs once per weapon per solve and pass them in. Estimated 10% of a ring solve. Trivial, exact.
7. `result()` on every pan frame. `js/features/results.js`, called from `drawNow`. 0.1 ms at 1x, 0.6 ms to 0.9 ms at 4x and 6x, and none of it changes during a pan: the geometry, mil, flight time, terrain note and status line are all functions of gun, target, weapon and map. Key it on those and skip when unchanged; the cross-section already does this in `renderCrossSection`. Small, low risk.
8. Tile selection per frame. `drawTileMap` in `js/map/tiles.js` is 0.36 ms per zoom frame here with no tiles on disk; with tiles, `findCachedTileAncestor` climbs the pyramid for each tile that has not decoded yet, on every frame, until it arrives. Unmeasured because the harness has no tiles; run `npm run sync-tiles` and rerun the benchmark before deciding. Small.
9. The mobile page at device scale 3 paints a 1170x2532 backing store. `drawNow` clears the whole canvas, fills it with the map background and then fills the map rectangle again, and the hillshade `drawImage` scales with the same area. Estimated 1 ms to 2 ms at 6x. Fix: drop the `clearRect`, since the opaque background fill covers the canvas anyway. Trivial.
10. `getBoundingClientRect` once per mousemove in `js/events.js`. Already reduced to one call per event; it showed at 0.7% in the earlier profile because the cursor readout writes the DOM between events and the next read forces layout. Cache the rect on pointerdown and on resize/scroll instead of per move. Small, low risk. Estimated 0.5% of a drag.
11. `assessShot` memo key. `js/ballistics/reachability.js` builds `${mapId}|${weaponId}|${x},${y}|${x},${y}` from raw floats, so every mousemove during a target drag misses and re-solves. The solve is 0.1 ms, so this is not a frame problem, but the memo grows to its 50000 cap with entries no one will hit again. Quantise the key to the 8 m ring cell. Trivial.
12. The family build. `trajectoryFamily` is 18 ms at 1x and 113 ms at 6x, once per fit, currently paid on the first frame that needs it. Build the families for the active weapon in a `requestIdleCallback` after `loadProjectileModel` resolves so the cost never lands under a drag. Small, exact, but it only moves a one-time cost.
13. `deadGroundHatch` and the wedge path are keyed on `renderScale()` and the solved object; a device-pixel-ratio change (window moved between monitors) rebuilds both, which is fine. Nothing to do; listed so nobody re-derives it.

## Model note found on the way

The family interpolates between adjacent 0.25 degree paths separately for range (`familyRange` blends the two crossing distances) and for height (`familyHeight` blends the two heights at a fixed x). The blended height curve therefore does not pass through the blended range at the target height; for the SPH-2 low arc the mismatch is metres at the impact. Every consumer is consistent with itself, and the dead-ground pruning above anchors on the height blend for that reason, but anyone tightening the model should know the two are not one curve.

## Where the solve stands after the memoisation pass

Measured on this branch against the merge it came from, desktop, medians over three repetitions, proven exact by `--compare` (max ring radius difference 0.00 m, max wedge edge difference 0.00 m, zero bearings whose wedge count changed):

| solve | 1x before | 1x after | 6x before | 6x after |
| --- | --- | --- | --- | --- |
| `terrainDeadGround`, ring cached | 98 ms | 59 ms | 619 ms | 388 ms |
| `terrainRangeRing`, new gun position | 5.8 ms | 4.6 ms | 33 ms | 27 ms |

That is roughly 40 percent off the dead-ground solve for no change in output, from memoising the level arc ranges and the declared ranges on the weapon, resolving the ring's fitted arcs once per solve, evaluating each family node once per solve, and returning a position from `familyLocate` rather than an object allocated on every call.

**It is not close to the frame budget.** 388 ms at 6x is 23 frames at 60 fps. Arithmetic alone will not close that gap: the remaining work is the angle sweep, which replaces the per-sample solve entirely, and then suppressing the solve during a drag so the cost is paid once on settle rather than every 8 m of travel. Whether a worker is needed on top depends on what the angle sweep leaves; see `docs/webworker-perf.md`.
