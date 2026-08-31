# RANKED IDEAS — what would actually help people

Companion to [ideas.md](ideas.md). That file surveys what other tools in the genre do and what it would cost us to match them. This one is a wider net — collaboration, performance, workflow, infrastructure — ordered by how much good each item does.

Nothing here is committed work, and nothing here duplicates an entry already tracked in [ideas.md](ideas.md) or [todo.md](../todo.md). Where an idea leans on an unverified game value, it says so.

## The ranking axis

**Audience × frequency × pain removed.** The correction that reorders everything: most sessions are one person alone with the map. A collaboration feature only ever reaches the fraction of users who are in a room, so a mediocre solo quality-of-life fix routinely beats a good collab feature on raw usefulness. Presence features rank high anyway because a room without them barely functions — but they rank as *fixes to an existing feature*, not as new reach.

Performance sits at the top for the same reason: panning smoothness is felt by everyone, in every session, before any feature is noticed.

---

## The list

### Tier 1 — change the tool for most people

1. [x] **rAF-coalesced rendering.** `draw()` has 63 synchronous call sites and `mousemove` calls it directly while panning, so a burst of input events can trigger several full redraws inside one frame. Replace them with a `requestDraw()` dirty flag. Lowest risk and highest yield of anything on this list.
2. [x] **Stop reading `getComputedStyle(document.documentElement)` per frame.** `draw()` in `js/map/renderer.js` reads the CSS custom properties on every frame. Cache them, invalidate on theme change.
3. [ ] **MIL under the cursor.** The active gun's firing solution follows the pointer anywhere on the map. Today the loop is click, read the panel, click again, read the panel; this collapses it to hovering. The solver is already cheap enough.
4. [ ] **Trajectory cross-section.** A profile of the ground between gun and target with the modelled arc drawn over it. The terrain-solved ring and the dead-ground wedges currently answer "no" without saying why or by how much — this is the half that makes them legible, and no other tool in the survey draws it.
5. [x] **Live peer cursors.** Named and coloured, throttled, as an ephemeral op the Worker rebroadcasts but never writes into the snapshot. Without them a shared session is two people reading coordinates aloud, which is the problem the session was supposed to solve.
6. [x] ~~**Attention pings.** Alt-click drops a transient expanding ring that expires in about five seconds. Wholly ephemeral, never in the document. It replaces the current habit of placing a marker to point at something and then having to erase it.~~
7. [ ] **Per-target reachability badges.** A small indicator per gun on each saved-target row: reachable, out of range, or masked. Uses the terrain ring and dead-ground work already shipped, and surfaces it at the moment of decision instead of as a layer to interpret. Prevents the most common wasted action there is — planning a target nothing can hit.
8. [ ] **Shape tools: line, arrow, rectangle, circle.** The pencil is freehand only, so an arrow is drawn by hand and looks it. A dedicated shape tool beside the pencil in Map Tools, sharing its colour, its undo behaviour and its collab ops. Arrows in particular are how people express movement and intent on a map, and every whiteboard tool in existence has them.
9. [x] ~~**Plan export as an image.** Canvas to PNG with a legend of guns, targets and solutions, sized for a Discord post. People already do this badly with the print-screen key; the distribution channel for this whole genre is the screenshot.~~
10. [x] **Tile decode via `createImageBitmap`.** `js/map/tiles.js` uses `new Image()`, so decode lands on the main thread. Pair it with an explicit-`close()` LRU to bound bitmap retention.
11. [x] **Cap `devicePixelRatio` at 2.** `resize()` multiplies by the full ratio; on a DPR-3 phone that is 2.25× the pixels for no visible gain, on the device with the least headroom.

### Tier 1 on a separate axis — infrastructure

12. [ ] **A browser test harness.** Helps no player directly and is probably the highest-leverage item in the repo. [todo.md](../todo.md) names its absence as the reason the correction gate, the map allowlist and `correctArc` have no coverage, and `sync/test/browser.mjs` suggests the groundwork exists. It also gates confident work on everything in the collaboration section below.

### Tier 2 — high value, narrower audience or more work

13. [ ] **Adjust-fire loop.** The spotter clicks where the round actually landed; the app computes add/drop and left/right, offers to shift the aim point, and records the observed error. Beautiful because it crowd-sources validation for the unverified ballistics model, but only a handful of people will use it deliberately. Keep it local plus a "copy JSON for an issue" button to stay inside the Umami-only privacy posture.
14. [ ] **OBS / embed mode.** A stripped route with a transparent background suitable for a browser source, plus a streamer-mode toggle that keeps the room code off the screen. The camera auto-frames the active gun and the active target together with padding, so both stay in view as either one moves and the stream never shows a viewer hunting for the shot. Uniquely useful to the people most likely to spread the tool.
15. [ ] **Follow-me / spectate.** Click a peer and your camera tracks theirs, released on any manual pan. Enormous for one person briefing four others over voice, idle the rest of the time — it ranks here on audience size, not on quality.
16. [ ] **Gun ownership.** Guns are already a list capped at 8; let a peer claim gun 3, lock their calculator panel to it, and show which guns are unmanned. The single idea that most changes what the app *is*, held back only by needing three or more coordinated people to pay off.
17. [ ] **Peer roster chip.** Who is in the room, their colour, their connection health. "Is anyone else here" currently has no answer at all.
18. [ ] **Overwrite feedback.** `point.set` is last-write-wins, so a peer silently yanks your artillery position and you just see it move. A one-frame flash plus a name removes a whole class of confusion.
19. [ ] **Per-layer offscreen caching.** Tiles, contours, grid and static overlays are re-stroked every frame during a pan. Cache each to an `OffscreenCanvas` keyed by zoom and layer version. A bigger win than item 1 and a meaningfully bigger regression risk — do item 1 first, measure, then decide whether this is still needed.
20. [ ] **Blit-and-patch panning.** Translate the previous frame and redraw only the newly exposed strip. The classic map-renderer trick; makes drag panning nearly free.
21. [ ] **Range-ring solving into a Worker.** `js/map/range-ring.js` marches rays and bisects per bearing, per gun; with eight guns that is a frame-time spike on every move. Transferable `Float32Array`, result cached by quantised position and weapon.
22. [x] **Quantise ring recompute.** Do not re-solve until the gun has moved more than about 10 m. The cheap version of item 21, and worth trying first.
23. [ ] **Node reuse on the pointer-move path.** The flight-time badges rebuild DOM on every `result()`, already flagged in [extraction-plan.md](../../extraction-plan.md). Worth generalising into a rule rather than fixing the one site.
24. [ ] **Peer identity that survives reconnect.** A peer id in `sessionStorage`. Today a reconnect wipes undo history *and* identity, so the roster grows ghosts.
25. [ ] **Simplify strokes before broadcast.** Ramer–Douglas–Peucker on pencil strokes before the pointerup op. With 10 000 points allowed per drawing this is a large bandwidth and snapshot-size win for no visible fidelity loss.
26. [ ] **Compress and chunk the join snapshot.** 2000 drawings is a big first message; `CompressionStream` in the Durable Object plus chunked delivery turns a stall into an instant join.

### Tier 3 — real, but for enthusiasts or later

27. [ ] **Gun cards.** One target, N guns, one printable table of per-gun solutions — the battery view `js/features/results.js` cannot currently express.
28. [ ] **Polar and shift-from-known-point missions.** Real calls for fire are polar (bearing and distance from the observer) or a shift from a known point; we only accept a grid coordinate. Small math, matches how people talk on voice, but the audience that knows to want it is small.
29. [ ] **Protocol version handshake.** The Worker announces its version on connect and a stale page gets a reload banner. Needed the first time an op shape changes in the wild.

### Infrastructure, unranked against user value

- [ ] **Two-client convergence tests.** Drive two headless clients against a local Durable Object, fuzz op interleavings, assert both documents end identical. Collaborative editing bugs are exactly the kind that cannot be found by hand.
- [ ] **Canvas snapshot tests** at fixed camera positions — the regression class that keeps biting across upstream merges.
- [ ] **`tsc --checkJs` with JSDoc types.** No migration, no change to shipped output, real signal on a globals-heavy codebase during merges.
- [ ] **Split the merge-magnet files.** `js/map/map-tools.js` at 4186 lines and `js/features/experimental-terrain-correction.js` at 3145 are where the documented 34–36-conflict merges come from.
- [ ] **Structural merge-pain reduction.** Upstream squashes and copies rather than merging, so fork-only behaviour lives more safely in new files than in edits to shared ones. Worth an explicit per-file ownership map in [extraction-plan.md](../../extraction-plan.md).
- [ ] **Locale CI check.** Fail the build on keys present in `en.json` and missing elsewhere, and normalise the CRLF and `\r\r\n` lines in `ko.json` and `zh-cn.json` that re-conflict on every merge.
- [ ] **Concatenate and minify at build time.** 39 classic script tags and roughly 30k lines shipped unminified is a real first-paint cost on mobile. Keep the source layout exactly as it is and do the concat in `scripts/build-pages.mjs`; `scripts/version-assets.mjs` already handles hashing.
- [ ] **Preload hints.** `rel=preload` for the ballistics and weapons JSON, `fetchpriority` on the first visible tile ring.
- [ ] **Aggregate room telemetry** to Workers Analytics Engine — op-type counters, peer counts, room lifetimes. No coordinates and no content, so it stays inside the privacy posture, and today there is no way to know whether collaboration is used at all.
- [ ] **Room-creation rate limiting** per IP, plus an audit that no room code can reach an analytics URL. Fragments do not travel, but the share-link copy path is worth checking.
- [ ] **Content-Security-Policy header** on the Pages deploy.
- [ ] **Client diagnostics buffer.** A ring buffer of recent errors and a "copy diagnostics" button — bug reports without a telemetry backend.
- [ ] **Frame-budget smoke test in CI.** Fail if a synthetic pan frame exceeds a threshold; perf debt otherwise only surfaces as complaints.
- [ ] **In-app measurement capture.** A panel where someone with the game open records a stopwatch time of flight or a spotting-round result and gets a JSON snippet to paste into an issue. [todo.md](../todo.md) is a list of things that need one person with the game open; this makes their contribution a 30-second copy-paste.
- [ ] **Accessibility pass.** The canvas has no keyboard path for placing points, and the camera animations should honour `prefers-reduced-motion`.

---

## Added later — ideas that arrived after the first ranking

These were not in the original survey. Where one would displace something above, it says so.

**Would rank in Tier 1 if the list were rebuilt:**

- [ ] **A text annotation tool.** Markers are icons only; there is no way to write a word on the map. "Sniper", "mines", "rally here", "2nd wave" — every whiteboard tool in existence has this and its absence is the most surprising gap in Map Tools. Would sit around item 6.

**Would rank in Tier 2:**

- [ ] **Second-monitor pop-out.** Open the results panel in its own window so the map keeps the main screen. Cheap, and a lot of this audience plays on two monitors.
- [ ] **Saved-target search, tags and folders.** The list is flat and unfiltered; once someone has 40 targets it stops being usable.
---

## Won't do

Considered and declined. Not a backlog — nothing here is waiting for capacity, and an item only leaves this list if the reasoning that put it here turns out to be wrong.

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
- **Linear and area targets.** Draw a line or box, get evenly spaced aim points across it. Pairs with the sheaf work noted as open under idea 7 in [ideas.md](ideas.md).
- **Call-for-fire text generator.** One button producing the formatted block to paste into Discord.
- **Crest clearance readout.** "Clears by 34 m at 1420 m", from the same march `js/map/dead-ground.js` already performs.
- **Solution field layer.** Colour the map by required MIL or time of flight from the active gun. Spectacular screenshot, thin daily utility once the novelty passes.
- **Queue-and-replay on reconnect.** Work done while disconnected is currently discarded. Adds are ID-keyed and idempotent, so the local buffer could be replayed against the fresh snapshot instead.
- **Counter-battery solver.** Given an observed impact and an incoming bearing, draw the arc of possible enemy firing positions — the existing math run backwards. The most fun idea here and close to the least useful.
- **Session replay, vanity room codes, room title banner, canned broadcast messages.** Collaboration polish stacked on a collaboration feature that does not yet have presence. All of it should wait until items 5, 6, 15 and 17 land.
- **Author attribution on content, soft object locks.** They solve problems that only appear in rooms busier than 16 peers ever get.
- **Laser pointer.** Over-rated on first pass: pings cover the same need with less machinery, and a laser only wins during a long spoken briefing.
- **Ping wheel with intent categories.** Ship plain pings and find out whether anyone wants the categories.
- **Velocity-directed tile prefetch.** Real, but well behind the render-path items above it.
- **Undo for a deleted saved target.** A trash with restore. Deletion is currently final and the list is one misclick wide.
- **Keyboard nudge.** Arrow keys move the selected point by 1 m, shift for 10 m. Fine positioning by mouse at low zoom is fiddly.
- **Per-gun colours.** With up to eight guns and their rings overlapping, the overlay is hard to read; colour is the obvious separator — but this only makes sense as part of gun ownership (item 16), never before it.
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
