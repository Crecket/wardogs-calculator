# Should any of this run in a Web Worker?

The verdict from the performance investigation, separated from `docs/performance.md` so the reasoning survives even after the numbers in that document are superseded. Every measurement quoted here comes from `npm run bench:render`; the throttled figures are CPU throttling at 4x and 6x through the Chrome DevTools Protocol, standing in for a low-end phone against a target of 60 fps (16.7 ms per frame) with every layer enabled.

## The short answer

A worker buys nothing on the render path, and is a real but second-choice tool for two specific long-running solves.

| Job | Worker? | Why |
| --- | --- | --- |
| Pan, zoom, the frame itself | **No** | The frame does no ballistics at all. There is nothing to move. |
| Dead-ground solve | **Yes, but** | Genuinely portable, but chunking solves the same problem with less risk, and the algorithmic fix may remove the need. |
| Contour raster rebuild | **Yes, best candidate** | 248 ms at 6x, synchronous, the only pan stall left. `OffscreenCanvas` fits it. |
| Range-ring solve | Probably not | Already cut to 5.6 ms at 1x; algorithmic headroom remains before threading is worth it. |

## Why not the render path

This was the original hypothesis and it is wrong. With the caches warm, a pan frame calls `trajectoryFamily` 14 times and `weaponReachRange` twice, and every one is a memo hit. The frame is painting, not computing. A per-frame request and reply across the worker boundary would cost more than the 0.6 ms frame it replaced.

The reason dragging *felt* like a per-frame arithmetic problem is that it is not one: it is two discrete solves that fire every 8 m of gun travel, each of which blocks for far longer than a frame. Fixing the frame was never the lever.

A second and more embarrassing reason the original profile pointed the wrong way: it dragged with the left mouse button from the canvas centre, which on this app places and drags the active marker rather than panning. Pan is the right button. Ballistics functions appeared in what was believed to be a pan profile because it was actually a marker drag.

## Dead ground: portable, but not the first move

The solver is pure and would load in a worker as-is. `fetchJSON` is only called from `loadProjectileModel`, so the module has no DOM dependency in the solving path; the 2.7 MB trajectory family is built inside the worker from the fit in about 18 ms and never crosses the boundary; roughly 10 KB comes back per solve.

The cost is not the transfer, it is the two synchronous readers:

- `drawDeadGround` must paint the previous wedges while a solve is in flight.
- `reachSolveGun` in `js/features/reach-badges.js` reads the cache synchronously and must learn to wait.

That is the same work that chunking the solve across frames requires, and chunking carries less risk because it keeps everything on one thread and one code path. **`requestIdleCallback` is not an option**: a 670 ms idle callback still blocks for 670 ms. Only chunking or a second thread actually yield.

Before either, the algorithmic fix should be tried. `deadGroundBearingIntervals` calls `assessArc` once per 25 m sample — a 40-step solve plus four max/min range evaluations, roughly 72k solves per gun position. Sweeping the 357 family angles along the bearing profile and marking which samples each path lands on is linear in samples per angle and needs no solve at all, estimated at 5x to 10x. If that lands, the solve may fall far enough that neither chunking nor a worker is needed. It does discretise the launch angle at 0.25 degrees, so wedge edges can move by up to one sample, which is a deliberate behaviour change and needs a re-baselined snapshot rather than being waved through.

## The contour raster is the better candidate

`renderContourRaster`, reached through `drawContours` in `js/map/contours.js`, re-strokes synchronously whenever a pan leaves the 320 px margin of the cached raster: 35 ms at 1x, 146 ms at 4x, **248 ms at 6x**. It is the largest stall a slow phone can hit during an ordinary pan, and unlike the ballistics work it is pure drawing, which `OffscreenCanvas` is built for. A worker would receive the decoded polylines once and hand back an `ImageBitmap`.

Two cheaper steps come first and may be enough on their own: draw into a second canvas so the old raster stays on screen instead of blocking, and start the rebuild when the view is within a third of the margin rather than at the edge, which hides the cost behind slow pans though not fast ones.

## What actually fixed the lag

Not threading. The measured wins so far were all single-threaded:

- Memoising the trajectory family on the fit object, removing a string key allocated on every sample.
- Starting the range-ring march at the last step below the shell's reach against the map's highest ground, rather than at 25 m.
- Testing dead-ground clearance only against terrain rising above the chord to the impact.
- Tracing the dead-ground wedges once per solve into a world-space `Path2D` placed by the canvas transform, instead of retracing 360 wedges every frame.

Pan and zoom now hold 60 fps at 6x throttling on both the desktop and mobile pages. The gun-drag stall with dead ground enabled was halved and is the remaining problem.

## What is still unmeasured

The tile layer. `maps/tiles/` is empty locally, so `drawTileMap` draws nothing in the harness and `findCachedTileAncestor` — which climbs the tile pyramid for every tile that has not decoded yet, on every frame, until it arrives — has never been profiled with real tiles present. `npm run sync-tiles` does not help: it uploads to R2 and needs credentials. Any claim about the tile layer's cost is currently a guess.
