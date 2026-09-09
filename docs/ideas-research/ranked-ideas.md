# RANKED IDEAS — what would actually help people

Every idea for this tool in one place, ordered by how much good each one does. It covers both what other tools in the genre do and what they don't — collaboration, performance, workflow, infrastructure.

Nothing here is committed work except where an item is marked landed, and nothing here duplicates an entry already tracked in [todo.md](../todo.md). Where an idea leans on an unverified game value, it says so.

## The ranking axis

**Audience × frequency × pain removed.** The correction that reorders everything: most sessions are one person alone with the map. A collaboration feature only ever reaches the fraction of users who are in a room, so a mediocre solo quality-of-life fix routinely beats a good collab feature on raw usefulness. Presence features rank high anyway because a room without them barely functions — but they rank as *fixes to an existing feature*, not as new reach.

Performance sits at the top for the same reason: panning smoothness is felt by everyone, in every session, before any feature is noticed.

---

## The list

`[ ]` not started · `[~]` in progress on a branch. Landed items live in [Finished](#finished) below, under the same tiers, so this list is only what is left to do.

### Tier 1 — change the tool for most people

Nothing open. See [Finished](#finished).

### Tier 2 — high value, narrower audience or more work

1. [ ] **Impact rings at the target.** Dispersion and blast radius drawn at the impact point — anti-teamkill tooling first, damage optimisation second. Every tool in the space has it; we draw rings around the *gun* and nothing at all at the target. The overlay machinery already exists, but neither dispersion nor blast is known and dispersion's *model* is unknown too, so this is not a value someone can simply go measure.
2. [ ] **Gun ownership.** Guns are already a list capped at 8; let a peer claim gun 3, lock their calculator panel to it, and show which guns are unmanned. The single idea that most changes what the app *is*, held back only by needing three or more coordinated people to pay off.
3. [ ] **Range-ring solving into a Worker.** `js/map/range-ring.js` marches rays and bisects per bearing, per gun; with eight guns that is a frame-time spike on every move. Transferable `Float32Array`, result cached by quantised position and weapon.
4. [ ] **Peer identity that survives reconnect.** A peer id in `sessionStorage`. Today a reconnect wipes undo history *and* identity, so the roster grows ghosts.
5. [ ] **Simplify strokes before broadcast.** Ramer–Douglas–Peucker on pencil strokes before the pointerup op. With 10 000 points allowed per drawing this is a large bandwidth and snapshot-size win for no visible fidelity loss.
6. [ ] **Compress and chunk the join snapshot.** 2000 drawings is a big first message; `CompressionStream` in the Durable Object plus chunked delivery turns a stall into an instant join.
7. [ ] **Firing-position suggestions.** The firing-positions layer just became the default layer; the next step is answering "where do I put the gun" for a chosen target rather than leaving the reader to scan a heatmap. Rank the flat cells within reach of the target by flatness, reach margin and masking, using the three solvers that already exist, and draw the top handful as numbered pins. The reverse of "Per-target reachability badges": that one judges a target from a placed gun, this one judges gun sites from a placed target, before the gun exists.
8. [ ] **Error budget beside the MIL.** The model has a known accuracy now, 19.7 m RMS on the SPH-2 fit, and the terrain sensitivity is known per arc, roughly 1.9 m of range per metre of target height on the low arc against 0.09 m on the high arc. Print the two together as a single "±N m" next to the solution so the reader knows when to trust a corrected low-arc shot and when to walk it in. Cheap once the numbers live in `projectile-model.json` rather than in a document.
9. [ ] **Correction allowlist for Ozeti and Zestafona.** `releasePolicy.correctedMaps` still names only Bakurani, so two of the three shipped terrain sets drive nothing. Each needs the same visual-overlay alignment check Bakurani got after the Y-flip fix, then a one-line change. Tier 2 only because the check needs a person and a screenshot, not because the work is large.

### Tier 3 — real, but for enthusiasts or later

10. [ ] **Sheaf patterns.** Converged, parallel and open sheaves across the gun list — the half of "Multiple guns / battery" that never shipped. Pairs with linear and area targets.
11. [ ] **Named plans.** Save and reload a whole named scene: guns, targets, drawings, layer state. The Foxhole planner does this; we save targets, optionally with their artillery position, which is a subset of the same storage.
12. [ ] **Gun cards.** One target, N guns, one printable table of per-gun solutions — the battery view `js/features/results.js` cannot currently express.
13. [ ] **Polar and shift-from-known-point missions.** Real calls for fire are polar (bearing and distance from the observer) or a shift from a known point; we only accept a grid coordinate. Small math, matches how people talk on voice, but the audience that knows to want it is small.
14. [ ] **Protocol version handshake.** The Worker announces its version on connect and a stale page gets a reload banner. Needed the first time an op shape changes in the wild.
15. [ ] **Numbered tower markers instead of spelled-out labels.** The preset tower markers carry `"label": "Tower 4"` in `maps/bakurani.json` and `maps/ozeti.json`, and `js/map/overlays.js:247-288` strokes that string above the icon in 12px semibold with a black halo. Five towers per map means five two-word captions competing with the grid, the contours, the range rings and the gun-to-target line, and the word "Tower" is redundant the moment you can see the icon. Draw the number alone, high-contrast, centred on the icon rather than riding above it — the identity is the digit, and the glyph already says what kind of thing it is. Cheap, and it removes clutter that everybody sees in every session, which is a better ratio than most of Tier 3.

### Infrastructure, unranked against user value

- [ ] **Two-client convergence tests.** Drive two headless clients against a local Durable Object, fuzz op interleavings, assert both documents end identical. Collaborative editing bugs are exactly the kind that cannot be found by hand.
- [ ] **Canvas snapshot tests** at fixed camera positions — the regression class that keeps biting across upstream merges.
- [ ] **`tsc --checkJs` with JSDoc types.** No migration, no change to shipped output, real signal on a globals-heavy codebase during merges.
- [ ] **Split the merge-magnet files.** `js/map/map-tools.js` at 4804 lines, `js/features/collab.js` at 3295 and `js/features/experimental-terrain-correction.js` at 2164 are where the documented 34–36-conflict merges come from.
- [ ] **Structural merge-pain reduction.** Upstream squashes and copies rather than merging, so fork-only behaviour lives more safely in new files than in edits to shared ones. Worth an explicit per-file ownership map now that the extraction plan is gone.
- [ ] **Locale CI check.** Fail the build on keys present in `en.json` and missing elsewhere, and normalise the CRLF and `\r\r\n` lines in `ko.json` and `zh-cn.json` that re-conflict on every merge.
- [ ] **Pak extraction, the day Early Access ships (2026-09-10).** Every unverified value in [todo.md](../todo.md) is gated on the same thing: the projectile's muzzle velocity, gravity scale and drag term, the real FOB and tank marker art, the Ozeti Valkyra position, the FOB build-area size and the control-zone variant centres, including Zestafona's, all live in `Wardogs/Content/Paks/`. One sitting with FModel settles five todo entries and turns the elevation correction from "unvalidated" into "derived from the game". The Closed Beta paks were readable, which is where the Landscape collision heightfields and `DA_UI_Europe.uasset` in [terrain.md](../terrain.md) came from. The Early Access paks are not: FModel greys them out, so the build has gained an AES key the beta did not have, and the `.sig` files beside them are only tamper signatures and were never the obstacle. The key is not a secret anyone has to be given. The game must decrypt its own paks at runtime, so the key ships inside the shipping executable or gets assembled in memory when the game starts, and that is how MetaForge, wardogs.zone and the rest read the same files. In order of effort: check the FModel community key repository and the data-mining Discords first, since a key that never rotates gets posted within days of a release; run a static scan of the executable with AESDumpster, which works offline and finds nothing only if the key is obfuscated; run the game through UnrealKey, which catches the key as the pak index is decrypted; or dump the running process and search the dump. Do the static routes on a copy of the install directory, not the live game, because the hooking routes are the ones an anti-cheat notices. One more thing to check before spending time on a key at all: FModel also greys out paks when it lacks a usermap for the game's engine version, and an IoStore container can have an encrypted index with the asset bodies still in the clear, so confirm which of the three it is from FModel's log line rather than from the icon.
- [ ] **Minify the bundle.** The open half of the item above. esbuild is already a dependency; the 635 KB bundle roughly halves under brotli once minified. Keep the source layout exactly as it is.
- [ ] **Compress the terrain chunks.** Each chunk is 522 KB of raw uint16 samples, 511 by 511, and Cloudflare does not compress `application/octet-stream`, so the wire size equals the raw size. Three chunks land on every boot, 1.5 MB before a single ring is drawn, plus a 240 KB heightfield served the same way. GitHub Pages cannot serve pre-compressed bodies, so the encoding has to be one the browser undoes itself: `DecompressionStream('deflate-raw')` over a delta-encoded stream, or a 16-bit greyscale PNG decoded through `createImageBitmap`, which the tile path already uses. Terrain deltas compress several-fold either way.
- [ ] **Load one map's manifest, not three.** Three 58 KB manifests arrive on every visit for two maps the player did not open. Fetch the active map's on demand and the others on switch.
- [ ] **Immutable cache rule on the main origin.** Every versioned URL carries a hash but the Cloudflare rule in front of GitHub Pages sets a four-hour must-revalidate TTL. A cache rule matching `?v=` for a one-year immutable TTL, as the tiles origin already has, costs no code and turns a returning visit into zero requests for JS and CSS.
- [ ] **One pre-stitched overview image per map.** The initial view pulls 64 zoom-3 tiles, 2.4 MB in 64 requests, to paint the whole map. A single build-time stitched WebP at the same resolution is one request and one draw call, with the pyramid streaming behind it. Narrower than the declined velocity prefetch: it targets the first paint only.
- [ ] **Load budget check in CI.** Serve `dist` from a local static server, drive headless Chromium at it, and assert the request count and bytes before DOMContentLoaded stay under a threshold. Unlike frame timing, network counts are stable in headless, so this one can actually gate a merge.
- [ ] **Preload hints.** `rel=preload` for the ballistics and weapons JSON, `fetchpriority` on the first visible tile ring.
- [ ] **Aggregate room telemetry** to Workers Analytics Engine — op-type counters, peer counts, room lifetimes. No coordinates and no content, so it stays inside the privacy posture, and today there is no way to know whether collaboration is used at all.
- [ ] **Room-creation rate limiting** per IP, plus an audit that no room code can reach an analytics URL. Fragments do not travel, but the share-link copy path is worth checking.
- [ ] **Content-Security-Policy header** on the Pages deploy.
- [ ] **Client diagnostics buffer.** A ring buffer of recent errors and a "copy diagnostics" button — bug reports without a telemetry backend.
- [ ] **In-app measurement capture.** A panel where someone with the game open records a stopwatch time of flight or a spotting-round result and gets a JSON snippet to paste into an issue. [todo.md](../todo.md) is a list of things that need one person with the game open; this makes their contribution a 30-second copy-paste.
- [ ] **Accessibility pass.** The canvas has no keyboard path for placing points, and the camera animations should honour `prefers-reduced-motion`.

---

## Finished

Everything that has landed, in the tier it was ranked in. Kept so the ranking axis stays visible and so nothing gets proposed twice.

### Tier 1 — change the tool for most people

1. [x] **Main-zone variant picker.** A second select under the map picker lists each map's control-zone variants plus a hidden option, remembered per map beside the map and weapon selections. The chosen zone draws as a solid rim with a faint glow just inside it and nothing in the middle, labelled with the variant name. Bakurani carries Default, Farmland and Lumberyard and Ozeti carries Default, Farmland, Church and River, from the `controlZones` read during the Closed Beta; Zestafona has no variants yet and hides the select until the pak read supplies them. The circle had been removed in `267567a0f` as "randomised and tells a player nothing", which a single Default circle was; a picker is the version that tells the gunner where the fight is. Still open on the same pak read: the removed config's 500 m and 550 m radii against the community's "2 km circle", and the dev vlog's three variants per map against Ozeti's four. Local only for now; a room op needs the sync service to learn the type first.
2. [x] **rAF-coalesced rendering.** `draw()` has 63 synchronous call sites and `mousemove` calls it directly while panning, so a burst of input events can trigger several full redraws inside one frame. Replace them with a `requestDraw()` dirty flag. Lowest risk and highest yield of anything on this list.
3. [x] **Stop reading `getComputedStyle(document.documentElement)` per frame.** `draw()` in `js/map/renderer.js` reads the CSS custom properties on every frame. Cache them, invalidate on theme change.
4. [x] **Elevation-corrected firing solution.** The printed MIL accounts for the height difference between gun and target, on every arc, on Bakurani — behind `releasePolicy.automaticMilCorrection`, withheld and captioned as withheld elsewhere. Ignoring ΔZ costs the mortar 3–13 m but costs SPG-2 low-angle fire 200–400 m. SquadCalc does this from SDK heightmaps; we do it from the game's own terrain. The projectile model has never been checked against the game — see [terrain.md](../terrain.md) and [todo.md](../todo.md).
5. [x] **Contour / hypsometric terrain layer.** Vector contour paths from `data/terrain/`, the game's own Terrain3D data at 2 m spacing.
6. [x] **Terrain-aware max range ring.** Every gun's ring is solved against the terrain rather than stroked as a circle — `js/map/range-ring.js` marches rays over the baked heightfield and bisects for the bearing where reach runs out. The filled ring is clamped to the weapon's declared `maxRange` and terrain surplus draws as a separate tinted band. On a typical Bakurani position the old circle promised ~470 m that was not there on its worst bearing. No other tool in the survey does it. Caveats: 6 % of positions have reachable pockets beyond the first ring edge, and Ozeti's relief is a third of Bakurani's.
7. [x] **Multiple guns / battery.** Artillery is a list capped at 8, each gun with its own rings and target line, synced by `gun.add` / `gun.move` / `gun.weapon` / `gun.remove`. Sheaf patterns and time-on-target staggering are still open — see "Sheaf patterns" and "Time of flight".
8. [x] **Time of flight.** Derived from the fitted vacuum model using the MIL actually on screen, so a terrain-corrected MIL gets the time that belongs to it. One badge per arc under the metric grid. Carries roughly ±2–4 s and is printed with a `≈` for that reason; four stopwatch readings settle it. Too coarse for time-on-target staggering, which needs sub-second agreement between guns.
9. [x] **MIL under the cursor.** The active gun's firing solution follows the pointer anywhere on the map. Today the loop is click, read the panel, click again, read the panel; this collapses it to hovering. The solver is already cheap enough.
10. [x] **Trajectory cross-section.** A profile of the ground between gun and target with the modelled arc drawn over it. The terrain-solved ring and the dead-ground wedges currently answer "no" without saying why or by how much — this is the half that makes them legible, and no other tool in the survey draws it.
11. [x] **Live peer cursors.** Named and coloured, throttled, as an ephemeral op the Worker rebroadcasts but never writes into the snapshot. Without them a shared session is two people reading coordinates aloud, which is the problem the session was supposed to solve.
12. [x] ~~**Attention pings.** Alt-click drops a transient expanding ring that expires in about five seconds. Wholly ephemeral, never in the document. It replaces the current habit of placing a marker to point at something and then having to erase it.~~
13. [x] **Per-target reachability badges.** A small indicator per gun on each saved-target row: reachable, out of range, or masked. Uses the terrain ring and dead-ground work already shipped, and surfaces it at the moment of decision instead of as a layer to interpret. Prevents the most common wasted action there is — planning a target nothing can hit.
14. [x] **Shape tools: line, arrow, rectangle, circle.** The pencil is freehand only, so an arrow is drawn by hand and looks it. A dedicated shape tool beside the pencil in Map Tools, sharing its colour, its undo behaviour and its collab ops. Arrows in particular are how people express movement and intent on a map, and every whiteboard tool in existence has them.
15. [x] ~~**Plan export as an image.** Canvas to PNG with a legend of guns, targets and solutions, sized for a Discord post. People already do this badly with the print-screen key; the distribution channel for this whole genre is the screenshot.~~
16. [x] **Tile decode via `createImageBitmap`.** `js/map/tiles.js` uses `new Image()`, so decode lands on the main thread. Pair it with an explicit-`close()` LRU to bound bitmap retention.
17. [x] **Cap `devicePixelRatio` at 2.** `resize()` multiplies by the full ratio; on a DPR-3 phone that is 2.25× the pixels for no visible gain, on the device with the least headroom.

### Tier 2 — high value, narrower audience or more work

18. [x] **Dead ground behind the crests.** Dark radial wedges inside the ring where the flattest trajectory passes below the ground somewhere closer, off by default. Answers "my target is inside the ring, so why does nothing land on it" — a question nothing in the survey answers. Flattest arc only, so a wedge means the flat arc cannot get there, not that the weapon cannot. Less verified than "Terrain-aware max range ring": it is the first drawing that uses the ballistic fit absolutely rather than as a difference, and a 32 m grid rounds off exactly the crests the answer turns on. Nobody has checked a shaded patch in game.
19. [x] **Shaded relief under the contour layer.** Hillshade is most of what makes a topo layer read as terrain instead of a wiring diagram. wardogs.zone bakes hillshade and contours into one 2048² raster at 8 m/px; our chunks are 2 m Terrain3D data, so a hillshade built from `data/terrain/` beats their raster fourfold while our contours stay vector on top. New build script, no new data source; Z-exaggeration has to be per-map.
20. [x] **OBS / embed mode.** A stripped route with a transparent background suitable for a browser source, plus a streamer-mode toggle that keeps the room code off the screen. The camera auto-frames the active gun and the active target together with padding, so both stay in view as either one moves and the stream never shows a viewer hunting for the shot. Uniquely useful to the people most likely to spread the tool.
21. [x] **Second-monitor pop-out.** Open the results panel in its own window so the map keeps the main screen — a lot of this audience plays on two monitors, or on one with the game fullscreen. `window.open` cannot stay above a fullscreen game, but the Document Picture-in-Picture API opens a real always-on-top window holding live DOM, which is exactly this feature; it is Chromium-only, and a window that is not always on top is not worth shipping, so elsewhere the control is simply unavailable rather than silently worse. The work is not the window, it is that the panel node moves into another document.
22. [x] **Follow-me / spectate.** Click a peer and your camera tracks theirs, released on any manual pan. Enormous for one person briefing four others over voice, idle the rest of the time — it ranks here on audience size, not on quality.
23. [x] **Peer roster chip.** Who is in the room, their colour, their connection health. "Is anyone else here" currently has no answer at all.
24. [x] **Overwrite feedback.** `point.set` is last-write-wins, so a peer silently yanks your artillery position and you just see it move. A one-frame flash plus a name removes a whole class of confusion.
25. [x] **Quantise ring recompute.** Do not re-solve until the gun has moved more than about 10 m. The cheap version of "Range-ring solving into a Worker", and worth trying first.
26. [x] **Node reuse on the pointer-move path.** Done for the flight-time badges in `7e774d5ef` and for the reach badges alongside them; both reuse pills and write through `setText`. The remaining teardown is `renderSavedTargets`' `container.innerHTML = ''`, which is not on the pointer-move path.

### Infrastructure, unranked against user value

- [x] **Concatenate at build time.** `scripts/bundle-scripts.mjs` folds each page's 44 to 49 classic script tags into one deferred bundle between page generation and asset versioning. The HAR that motivated it showed the browser fetching the fifty tags strictly one at a time, each a 40 ms round trip, so the chain was two thirds of a 3.6 s load and every data fetch waited behind it.

---

## Won't do

Considered and declined. Not a backlog — nothing here is waiting for capacity, and an item only leaves this list if the reasoning that put it here turns out to be wrong.

- **Frame-budget smoke test in CI.** Fail if a synthetic pan frame exceeds a threshold; perf debt otherwise only surfaces as complaints. The shape that works is the one the two [Won't do](#wont-do) render items were measured with: a playwright page driving a synthetic pan, each layer function wrapped in a timer, and the presented frame interval read off `requestAnimationFrame` so raster and composite land inside the number rather than deferred past it. The one thing any CI use of it has to know: headless Chromium renders through SwiftShader, where the same scenes cost 22–26 ms a frame instead of 0.35–1.13 ms, because a full-canvas software blit is ~22 ms there and a fraction of a millisecond on hardware. A threshold set from a headless number would fail on the wrong things — and read as an argument *for* both declined items. Parked here rather than in the list above until a hardware runner exists; the harness itself is `npm run bench:render` and is worth running by hand before any render-path change.
- **Screen-capture overlay.** SquadMortarOverlay and Squad Mortar Helper are genuinely popular: a transparent window over the game that screenshots the in-game map and aligns the calculator to it, with computer vision reading the markers. It is a Windows desktop application — out of reach for a static site, and a completely different distribution and trust story from a web page.
- **Position heatmaps.** SquadCalc logs up to 15,000 weapon positions per map and per weapon to surface commonly used firing positions. It needs a backend collecting player positions, which cuts against the Umami-only privacy posture in [analytics.md](../analytics.md).
- **Ammo types, mils-unit conversion, faction and vehicle browsers.** Real features elsewhere — Reforger tools carry HE/smoke/illumination tables and a NATO ↔ Warsaw mils converter; SquadCalc browses factions, units and vehicle spawns. All of it presupposes game content that `data/weapons.json` gives no sign of yet. Revisit if Early Access adds shell types or a second angular unit.
- **Shareable URL state.** The whole scene encoded in the link.
- **PWA / offline install.**
- **A dedicated spotter role.** The observer half of the survey's spotter-and-corrections feature. The corrections half is declined just below, which leaves the role with nothing to do.

- **Adjust-fire loop.** The spotter clicks where the round actually landed; the app computes add/drop and left/right, offers to shift the aim point, and records the observed error. It reads well on paper and it is how real gunnery works, but it does not survive contact with how this game is actually played: nobody stops mid-fight to click an impact point on a second screen and read a correction back. The shot gets walked in by eye and over voice in the time it takes to alt-tab, and a correction that arrives a salvo late is worse than no correction at all. Its one genuine attraction was crowd-sourcing validation for the unverified ballistics model — **In-app measurement capture** in the infrastructure list collects exactly that, deliberately and out of combat, without dressing it up as a fire-control loop.
- **Per-layer offscreen caching.** Cache the tiles, contours, grid and static overlays to an `OffscreenCanvas` keyed by zoom and layer version instead of re-stroking them every frame. It ranked second in the performance tier on the assumption that re-stroking is where a pan frame goes; a synthetic pan instrumented layer by layer measures that it is not. On real hardware a pan frame costs 0.35 ms with the default layers, 0.60 ms with contours and hillshade on, and 1.13 ms with eight guns — and the static layers a cache could stand in for are 0.19–0.40 ms of that, against a 16.7 ms budget the renderer already makes. The frame is dominated by `drawGuns` at 0.72 ms with eight guns, which is dynamic and no cache can touch. Half of it is also already built: `js/map/contours.js` keeps the contour layer in an offscreen raster with a margin, keyed by scale and stretched rather than rebuilt during a zoom, which is why the heaviest static layer benchmarks at 0.008–0.043 ms. Revisit only if a future layer puts real stroking back into the frame.
- **Blit-and-patch panning.** Translate the previous frame and redraw only the newly exposed strip. Declined for a harder reason than the item above: it is a net loss, not merely a small win. A canvas cannot copy onto itself in place without tearing, so the trick costs two full-canvas copies — out to a scratch surface and back at the offset — which measures at 2.78 ms per frame, more than double the entire frame it was meant to save. The clipped strip redraw it pairs with is genuinely cheap (32 of them per frame still fit inside the budget), but the blit that makes the strip possible is the expensive half.
- **Shared splash countdown.** Anyone presses SHOT and everyone sees a synchronised countdown from the computed time of flight ending in SPLASH. This captures most of time-on-target's practical value while sidestepping the accuracy problem in [todo.md](../todo.md) entirely, because it is a shared UI clock rather than a firing correction.
- **Range card with hotkey recall.** Pre-registered numbered targets sorted by azimuth, recalled with keys 1–9. Saved targets are already most of it, and it is standard artillery practice.
- **Read-only spectator code.** A second code per room granting a connection that cannot push. Fixes the documented caveat that the room code is the only credential and everyone can edit everything. People discover they wanted it immediately after someone wipes the map.
- **Night-op theme.** Low-luminance red on black. Small, and disproportionately loved by the players who are actually awake at 2am.
- **Snap to markers and grid** while placing points. Unglamorous, constantly appreciated.
- **Multi-segment ruler.** Total path length plus per-leg azimuth.
- **Command palette.** Ctrl+K for jump-to-coordinate, place gun, switch weapon, join room. Fits a keyboard-driven tool that has grown a lot of surface.
- **QR code for the share link.** The spotter's phone joins the desktop's room in one scan. Trivial, and the desktop/mobile split makes it land.
- **Fire mission queue.** Spotter creates a mission, it lands in a shared list, a gun claims it, states move Requested → Assigned → Firing → Splash → Adjust → Complete. Maps almost one to one onto ops that already exist.
- **Auto gun assignment.** Which gun should take this, decided by reach, masking and time of flight. All three inputs exist; only the ranking is missing.
- **Linear and area targets.** Draw a line or box, get evenly spaced aim points across it. Pairs with "Sheaf patterns".
- **Call-for-fire text generator.** One button producing the formatted block to paste into Discord.
- **Crest clearance readout.** "Clears by 34 m at 1420 m", from the same march `js/map/dead-ground.js` already performs.
- **Solution field layer.** Colour the map by required MIL or time of flight from the active gun. Spectacular screenshot, thin daily utility once the novelty passes.
- **Queue-and-replay on reconnect.** Work done while disconnected is currently discarded. Adds are ID-keyed and idempotent, so the local buffer could be replayed against the fresh snapshot instead.
- **Counter-battery solver.** Given an observed impact and an incoming bearing, draw the arc of possible enemy firing positions — the existing math run backwards. The most fun idea here and close to the least useful.
- **Session replay, vanity room codes, room title banner, canned broadcast messages.** Collaboration polish stacked on a collaboration feature that does not yet have presence. All of it should wait until "Live peer cursors", "Attention pings", "Follow-me / spectate" and "Peer roster chip" land.
- **Author attribution on content, soft object locks.** They solve problems that only appear in rooms busier than 16 peers ever get.
- **Laser pointer.** Over-rated on first pass: pings cover the same need with less machinery, and a laser only wins during a long spoken briefing.
- **Ping wheel with intent categories.** Ship plain pings and find out whether anyone wants the categories.
- **Velocity-directed tile prefetch.** Real, but well behind the render-path items above it.
- **Undo for a deleted saved target.** A trash with restore. Deletion is currently final and the list is one misclick wide.
- **Keyboard nudge.** Arrow keys move the selected point by 1 m, shift for 10 m. Fine positioning by mouse at low zoom is fiddly.
- **Per-gun colours.** With up to eight guns and their rings overlapping, the overlay is hard to read; colour is the obvious separator — but this only makes sense as part of gun ownership ("Gun ownership"), never before it.
- **Camera bookmarks.** Save and recall named views per map — the objective, the ridge, the home position.
- **Shared timers.** A countdown any peer can start, visible to the room: respawn, resupply, objective. Foxhole planners have this and it is used constantly.
- **Copy solution to clipboard** as a one-line string for voice or chat, distinct from the fuller call-for-fire block.
- **Minimap or overview inset** showing the viewport against the whole map.
- **Measure area** with a polygon, alongside the existing ruler.
- **Recent-coordinate history** in the search box.
- **Numeric input scrubbing** — drag on a coordinate field to change it.
- **Layer opacity sliders and per-layer locking.**
- **Duplicate a gun** with the same weapon and a small offset.
- **Persistent saved measurements** — pin a ruler line to the map instead of losing it on the next measurement.
- **Hold-to-preview the alternate arc** on the SPH-2 without switching selection.
- **Compass rose, and a north-up lock** if map rotation is ever added.
- **Hotkey cheat sheet** on `?`.
- **Print stylesheet** for the plan and the range card.
- **Weapon comparison view** — both weapons' envelopes against the same target.
- **Auto-detect the map** from a pasted coordinate pair that only falls inside one map's bounds.
- **A text annotation tool.** Markers are icons only; there is no way to write a word on the map. "Sniper", "mines", "rally here", "2nd wave" — every whiteboard tool in existence has this and its absence is the most surprising gap in Map Tools.
- **Saved-target search, tags and folders.** The list is flat and unfiltered; once someone has 40 targets it stops being usable.

---

## Sources

The genre survey behind the entries above: mature artillery and map tools in adjacent games.

- SquadCalc — https://github.com/sh4rkman/SquadCalc, https://squadcalc.app/
- SquadMC — https://squadmc.ende.pro/
- SquadMortarOverlay — https://github.com/Devil4ngle/SquadMortarOverlay
- Squad Mortar Helper — https://github.com/WilliamVenner/squad-mortar-helper
- Foxhole Artillery Planner — https://github.com/chimbosonic/foxhole-artillery-planner
- FoxholeHQ — https://foxholehq.com/map
- hll-arty-map-calculator — https://github.com/l1tku/hll-arty-map-calculator
- EasyArty — https://www.easyarty.com/
- Reforger Fire Mission Calculator — https://armareforgercalculator.com/
- armamortars.org — https://armamortars.org/
