# Upstream v1.8.0 Fork-Point Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `upstream/main` at `35c520a88` into `feat/collab-rooms` once, deleting upstream's lobby subsystem in the merge, so the fork sits on his v1.8.0 trunk while keeping its own socket layer.

**Architecture:** One hard fork-point merge, not a recurring one. Line endings are normalised on both sides first so that 18,331 of the 24,982 conflicted lines disappear before any semantic work starts. Upstream's `js/collab/` and his rewritten `sync/` are deleted as part of the merge rather than reconciled; the fork's `sync/` and `js/features/collab.js` survive intact. After this lands, upstream work arrives by cherry-pick, never by merging `main` again.

**Tech Stack:** Vanilla ES modules, no bundler for app code. Cloudflare Workers + Durable Objects (`sync/`). Node's built-in test runner for `scripts/lib/*.test.mjs`. Playwright-driven headless Chromium for `test/*.mjs` and `sync/test/*.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-09-upstream-v1-8-0-harvest-design.md`

## Global Constraints

- **Never merge `upstream/main` again after Task 2.** Later upstream work arrives by `git cherry-pick` of named commits. This is the whole point of the fork point.
- **The fork's `sync/` and `js/features/collab.js` are authoritative.** Any conflict hunk that is a collab call site resolves by keeping the fork's side (`HEAD`). There are 5 such hunks in `js/map/map-tools.js` and 5 in `js/features/saved-targets.js`.
- **Do not add code comments** beyond what the resolution requires; where a conflict deletes one side's comment, keep the surviving side's comment as it stands.
- **No machine-translated locale strings.** New keys land in `locales/en.json` only, plus `locales/cat.json` by hand if it fits its register. Every other locale falls back to English through `tr()`, which resolves `language?.[key] ?? fallback?.[key] ?? key` with `DEFAULT_LANG` of `en`. This is the objection the maintainer raised on PR #14 and it applies to the fork too.
- **Test commands** (there is no aggregate `npm test`):
  - `npm run build`
  - `npm run test:scripts`
  - `node test/<name>.mjs` — one file at a time
  - `npm --prefix sync run test:smoke` (and `test:browser`, `test:disabled`, `test:guns`, `test:cursors`, `test:obs`)
- **Known-failing before this plan starts, and out of scope:** `test/reach-badges.mjs` (crashes building fixtures since `635953aae` restricted dead ground to the low arc) and `test/cross-section.mjs` (one stale assertion, `box.header <= 20`, against a deliberate 24px toggle). They must not get *worse*; they are not required to pass.

---

## File Structure

| File | Responsibility after this plan |
| --- | --- |
| `.gitattributes` | New. `* text=auto` so line endings stop being a merge surface. |
| `js/core/core.js` | Gains upstream's `APP_SELECTIONS_KEY` / `persistAppSelections` / `getNearestUnlockedMapPoint`. Fork's gun accessors untouched. |
| `js/events.js` | Upstream's unlocked-point hit-test, with the fork's gun selection layered back on. |
| `js/core/config.js` | Upstream's `zone`/`polygon` shortcuts; fork's `shapes` moves off `'g'`. |
| `js/main.js` | Fork's `initGunsUI`/`initCollab`/`initObs`. Upstream's lazy `lobby.js` loader deleted. |
| `js/map/map-tools.js` | Both tool sets: fork's `shapes`/`targeting` and upstream's `zone`/`polygon`. |
| `js/map/renderer.js` | Fork's per-gun layer loop. Upstream's lobby participant layer deleted. |
| `js/map/tiles.js` | One tile-decode strategy, chosen in Task 5. |
| `js/features/saved-targets.js` | Fork's collab persistence suppression, on upstream's per-map keying. |
| `SECURITY.md`, `.github/dependabot.yml`, `.github/workflows/security.yml`, `docs/security.md` | New, copied from upstream. |
| **Deleted:** `js/collab/lobby.js`, `js/collab/protocol.mjs`, `js/collab/replica.mjs`, upstream's `sync/src/*.mjs`, `sync/test/*.test.mjs`, `docs/lobbies.md`, `docs/lobbies.ru.md` | Upstream's lobby, removed in the merge commit. |

---

### Task 1: Normalise line endings

`a91e48726` ("feat: add donation links to desktop and mobile", 2026-09-07) rewrote 25 files with CRLF. Neither repo has a `.gitattributes`. This task removes three quarters of the merge surface before the merge exists.

**Files:**
- Create: `.gitattributes`
- Modify: every file git renormalises (expected: none on the fork, which is already all-LF)

**Interfaces:**
- Consumes: nothing.
- Produces: a fork tree that `git merge -X renormalize` can align with upstream's CRLF files.

- [ ] **Step 1: Confirm the fork is currently all-LF**

```bash
git ls-files -z | xargs -0 grep -lI $'\r$' 2>/dev/null | head
```

Expected: no output. If any file lists, note it — it means the fork also has mixed endings and Step 3 will rewrite it.

- [ ] **Step 2: Create `.gitattributes`**

```gitattributes
* text=auto

*.png binary
*.webp binary
*.jpg binary
*.jpeg binary
*.ico binary
*.woff binary
*.woff2 binary
*.ttf binary
*.bin binary
```

`data/terrain/*/heightfield.bin` is a packed Float32 array — the `*.bin binary` line is what stops git from corrupting it.

- [ ] **Step 3: Renormalise the index**

```bash
git add --renormalize .
git status --short
```

Expected: empty or near-empty, since the fork is already LF. Anything listed here is a file whose stored bytes changed.

- [ ] **Step 4: Verify the heightfields are byte-identical**

```bash
for f in data/terrain/*/heightfield.bin; do
  git show HEAD:"$f" | cmp -s - "$f" && echo "OK $f" || echo "CHANGED $f"
done
```

Expected: `OK` for every file. A `CHANGED` here means the binary rule did not take and must be fixed before committing.

- [ ] **Step 5: Run the script suite**

Run: `npm run test:scripts`
Expected: PASS, same count as before this task (112/112).

- [ ] **Step 6: Commit**

```bash
git add .gitattributes
git commit -m "Line endings become a repository rule, since a merge should not have to argue about them"
```

---

### Task 2: The fork-point merge

**Files:**
- Modify: 57 conflicted paths (the merge produces them)
- Delete: `js/collab/lobby.js`, `js/collab/protocol.mjs`, `js/collab/replica.mjs`, `docs/lobbies.md`, `docs/lobbies.ru.md`, and upstream's `sync/src/{index,rooms,admission,tokens,catalog,config}.mjs` plus `sync/test/{client,protocol,runtime,security}.test.mjs`

**Interfaces:**
- Consumes: `.gitattributes` from Task 1.
- Produces: a conflicted working tree on `feat/collab-rooms` with upstream's lobby already removed. Tasks 3–7 resolve the remainder.

- [ ] **Step 1: Branch, so the merge is abandonable**

```bash
git checkout feat/collab-rooms
git checkout -b merge/upstream-v1.8.0
```

- [ ] **Step 2: Start the merge with renormalisation**

```bash
git merge -X renormalize --no-commit upstream/main
```

Expected: `Automatic merge failed; fix conflicts and then commit the result.`

- [ ] **Step 3: Confirm the CRLF noise is gone**

```bash
git diff --name-only --diff-filter=U | wc -l
```

Expected: substantially fewer than 57. `js/ui/layout.js`, `js/mobile/mobile.js`, `styles/desktop/map-tools.css`, `data/weapons.json` and the `src/pages/locales/*.html` shells should **not** appear — they conflicted only on line endings.

If they still appear, stop: `-X renormalize` did not take, and resolving them by hand would discard real upstream work.

- [ ] **Step 4: Delete upstream's lobby**

```bash
git rm -r --ignore-unmatch js/collab
git rm --ignore-unmatch docs/lobbies.md docs/lobbies.ru.md
git rm --ignore-unmatch sync/src/index.mjs sync/src/rooms.mjs sync/src/admission.mjs \
  sync/src/tokens.mjs sync/src/catalog.mjs sync/src/config.mjs
git rm --ignore-unmatch sync/test/client.test.mjs sync/test/protocol.test.mjs \
  sync/test/runtime.test.mjs sync/test/security.test.mjs
```

`sync/src/tokens.mjs` and `sync/src/admission.mjs` are deleted here on purpose. They come back deliberately in the *security* plan, ported onto the fork's worker rather than inherited from a merge that also drags his protocol in.

- [ ] **Step 5: Keep the fork's `sync/` config files**

```bash
git checkout --ours sync/wrangler.jsonc sync/package.json sync/package-lock.json sync/README.md
git add sync/wrangler.jsonc sync/package.json sync/package-lock.json sync/README.md
```

The fork's worker is `main: src/index.js` with a `Room` class; upstream's is `main: src/index.mjs` with `LobbyRoom` and `LobbyBudget`. Taking his `wrangler.jsonc` would point at deleted files.

- [ ] **Step 6: Record what is left**

```bash
git diff --name-only --diff-filter=U
```

Expected, and each is a later task: `js/core/core.js`, `js/core/config.js`, `js/events.js`, `js/main.js`, `js/map/map-tools.js`, `js/map/renderer.js`, `js/map/tiles.js`, `js/features/saved-targets.js`, `js/features/terrain-ballistics.js`, `js/ui/inputs.js`, `locales/*.json`, `package.json`, `.gitignore`, `README.md`, `config/app.json`, `docs/*.md`, `scripts/*.mjs`, `style.css`.

**Do not commit.** The merge stays open across Tasks 3–7 so its conflict state is available. Task 8 commits it.

---

### Task 3: Mechanical resolutions

Four files where one side is a strict winner and no judgement is involved.

**Files:**
- Modify: `js/core/core.js`, `js/main.js`, `js/features/terrain-ballistics.js`, `js/ui/inputs.js`, `.gitignore`, `package.json`, `config/app.json`

**Interfaces:**
- Consumes: the open merge from Task 2.
- Produces: `persistAppSelections()`, `loadAppSelections()`, `getSavedCustomMapSize()` and `getNearestUnlockedMapPoint(originDistance, targetDistance, hitThreshold)` available from `js/core/core.js`. Task 4 consumes the last of these.

- [ ] **Step 1: `js/core/core.js` — take upstream whole for the one conflicted hunk**

The single conflict has an empty `HEAD` side: upstream added `APP_SELECTIONS_KEY`, `loadAppSelections`, `persistAppSelections`, `getSavedCustomMapSize` and `getNearestUnlockedMapPoint` where the fork added nothing. Delete the `<<<<<<< HEAD` and `=======` lines and the `>>>>>>> upstream/main` line, keeping upstream's block.

Verify the fork's gun accessors survived — they are outside the conflict and must still be present:

```bash
grep -n "get origin()\|get weapon()\|activeGunId" js/core/core.js | head
```

Expected: the accessor definitions still there. §2.1's property — that `S.origin` and `S.weapon` resolve through the selected gun so every existing reader is untouched — is the thing this whole branch protects.

- [ ] **Step 2: `js/main.js` — keep the fork's init, drop upstream's lobby loader**

Keep the `HEAD` side (`initGunsUI()`, `initCollab()`, `initObs()`). Delete upstream's side entirely — it lazy-loads `js/collab/lobby.js`, which Task 2 removed:

```js
                    selector: 'script[data-lobby-runtime]',
                    dataAttribute: 'lobbyRuntime',
                    url: new URL('js/collab/lobby.js', BASE_PATH).href,
                    ready: () => typeof initLobby === 'function'
```

Then confirm nothing else references the deleted module:

```bash
grep -rn "js/collab\|initLobby\|lobbyRuntime" --include=*.js --include=*.html --include=*.mjs . | grep -v node_modules
```

Expected: no output. Any hit is a dangling reference that will 404 at runtime.

- [ ] **Step 3: `js/features/terrain-ballistics.js` — take upstream's zh-CN strings**

The conflict is the SPH-2 levelling warning in Chinese. Upstream's are hand-written by a maintainer who reviews Chinese; the fork's are the machine-written ones flagged in `extraction-plan.md`. Take upstream's side, and also take his two additional keys (`terrainLoading`, `terrainStatus`).

- [ ] **Step 4: `.gitignore`, `package.json`, `config/app.json`, `js/ui/inputs.js` — union both sides**

Each has one or two small conflicts where both sides added distinct entries. Keep both sides' additions, in upstream-then-fork order, removing the markers. For `package.json`, keep the fork's scripts block entire and take upstream's dependency bumps (`esbuild`, the `sharp` override).

For `config/app.json`, keep the fork's `collab` block (it configures the fork's worker) and take upstream's `mapTools.shortcuts`, `site` and `map` blocks. The `shortcuts` clash is resolved in Task 6, not here — leave upstream's values in place for now.

- [ ] **Step 5: Verify the app still parses**

Run: `node --check js/core/core.js && node --check js/main.js && node --check js/events.js`
Expected: no output, exit 0.

Run: `node -e "JSON.parse(require('fs').readFileSync('config/app.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 6: Stage**

```bash
git add js/core/core.js js/main.js js/features/terrain-ballistics.js js/ui/inputs.js \
  .gitignore package.json config/app.json
```

No commit — the merge is still open.

---

### Task 4: The hit-test — upstream's lock model, the fork's gun selection

Both sides implement point locks, and upstream's is better in a way his own comment names. The fork aborts the drag when the *nearest* point is locked, so a locked gun swallows clicks aimed past it. Upstream skips locked points and finds the nearest *unlocked* one.

Upstream has no multiple guns, so his side lacks the `selectGun` step. The resolution is his lock model with the fork's gun selection layered on.

**Files:**
- Modify: `js/events.js` (2 conflicts, around lines 124 and 582 of the merged file)
- Test: `test/guns-pick.mjs`

**Interfaces:**
- Consumes: `getNearestUnlockedMapPoint(originDistance, targetDistance, hitThreshold)` from Task 3, returning `'origin'`, `'target'` or `null`.
- Produces: hit-test behaviour that Task 6's tool changes do not touch.

- [ ] **Step 1: Resolve the first conflict — keep both sides**

The fork redraws the gun list when the selected gun's weapon changes; upstream persists app selections. These are unrelated and both belong:

```js
            /*
             * The row for the selected gun names its weapon, so the list
             * has to redraw with it.
             */
            if (typeof renderGuns === 'function') {
                renderGuns();
            }

            if (typeof collabSyncShared === 'function') {
                collabSyncShared();
            }

            persistAppSelections();
```

- [ ] **Step 2: Resolve the second conflict**

Delete the fork's `isForcePlacementEnabled()` guard — item 19 is retired, upstream's locks replace it. Delete upstream's duplicate `const pointHitThreshold` declaration; the fork already declares it earlier in the same scope. Keep upstream's `getNearestUnlockedMapPoint` call and re-add the fork's gun selection inside it:

```js
            /*
             * Locked points are not hit-test targets. A click beside a
             * locked gun/target must remain available for placing the active
             * unlocked point instead of being swallowed by the nearer lock.
             */
            const nearestUnlockedPoint = getNearestUnlockedMapPoint(
                d1,
                d2,
                pointHitThreshold
            );

            if (nearestUnlockedPoint) {
                /*
                 * Select before the write below: S.origin resolves through
                 * the active gun, so the selection has to move first or
                 * the drag would edit the gun you just clicked away from.
                 */
                if (
                    nearestUnlockedPoint === 'origin' &&
                    hitGun &&
                    hitGun.id !== S.activeGunId
                ) {
                    selectGun(hitGun.id);
                }

                drag = nearestUnlockedPoint;
```

- [ ] **Step 3: Remove the fork's now-dead force-placement references**

```bash
grep -n "isForcePlacementEnabled\|isPointMapLocked" js/events.js
```

Two further `isPointMapLocked` sites remain outside the conflict (the fork's own lock predicate). Check each against upstream's `js/core/core.js` lock helpers and replace with his equivalents where they express the same thing. If the fork's predicate has no upstream equivalent, keep it.

- [ ] **Step 4: Verify syntax**

Run: `node --check js/events.js`
Expected: no output, exit 0.

- [ ] **Step 5: Run the gun-picking test**

Run: `node test/guns-pick.mjs`
Expected: PASS. This test covers §2.6 — clicking a gun picks it up — which is precisely what Step 2 re-layered onto upstream's hit-test. A failure here means the `selectGun` call landed in the wrong branch.

- [ ] **Step 6: Stage**

```bash
git add js/events.js
```

---

### Task 5: Tile decode — resolve the open CORS question first

The fork routes tiles through `createImageBitmap` and falls back to `new Image()` for cross-origin ones, because object storage sent no `Access-Control-Allow-Origin`. Upstream now sets `image.crossOrigin = 'anonymous'` at `tiles.js:168` and serves tiles from R2.

If his R2 bucket sends CORS headers, his one line replaces the fork's whole same-origin/cross-origin split and `js/map/image-decode.js` can go. If it does not, his line is inert and the fork's split stays. This must be measured, not assumed — the fork's original finding predates his R2 migration.

**Files:**
- Modify: `js/map/tiles.js`
- Possibly delete: `js/map/image-decode.js`

**Interfaces:**
- Consumes: the open merge.
- Produces: one tile-decode path. No later task depends on which.

- [ ] **Step 1: Read the tile base URL upstream now uses**

```bash
git show upstream/main:maps/bakurani.json | grep -i "tile\|url\|base" | head
git show upstream/main:config/app.json | grep -i "tile\|asset\|r2\|cdn" | head
```

- [ ] **Step 2: Ask the bucket directly**

Substitute the host from Step 1 and one real tile path:

```bash
curl -sI -H "Origin: https://wardogs-artillery.com" "<TILE_URL>" | grep -i "access-control-allow-origin\|^HTTP"
```

Expected either an `access-control-allow-origin` line (his approach works) or its absence (it does not).

If the URL cannot be reached from this environment, stop and report. Do not guess — picking wrong here either breaks tile rendering for fork deployments or keeps ~200 lines of dead fallback.

- [ ] **Step 3a: If the bucket DOES send CORS — take upstream's side**

Resolve the conflict to upstream's block, keeping `image.crossOrigin = 'anonymous'`. Then remove the fork's decode module:

```bash
git rm js/map/image-decode.js
grep -rn "image-decode\|decodeTileImage\|createImageBitmap" --include=*.js --include=*.html . | grep -v node_modules
```

Expected after removal: no output. Delete any leftover `<script>` tag that referenced it in `src/pages/index.html`.

- [ ] **Step 3b: If the bucket does NOT send CORS — keep the fork's side**

Resolve to the fork's block. Add upstream's `image.crossOrigin = 'anonymous'` only on the `new Image()` fallback path, where it is harmless and correct if the bucket ever gains headers.

- [ ] **Step 4: Verify the ancestor-tile fallback survived either way**

```bash
grep -n "ancestor" js/map/tiles.js | head
```

Expected: hits around the draw path. This is the fork's own item 17, which upstream absorbed verbatim — it exists identically on both sides and must not be lost to a conflict resolution.

- [ ] **Step 5: Verify syntax and stage**

Run: `node --check js/map/tiles.js`
Expected: no output, exit 0.

```bash
git add js/map/tiles.js
```

---

### Task 6: Both tool sets

The fork has `shapes` (line, arrow, rect, circle) and `targeting`. Upstream has `zone` and `polygon`, already synced through his collections. They overlap without matching, and both bind `'g'`.

Per the spec: adopt his `zone` and `polygon`, drop the fork's rectangle and circle in their favour, keep `line` and `arrow` as fork op families, and move the fork's `shapes` shortcut off `'g'`.

**Files:**
- Modify: `js/map/map-tools.js` (12 conflicts), `js/core/config.js` (1), `config/app.json`
- Test: `test/map-tool-toggle.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `MAP_TOOL_STATE.tool` accepting the full set — `'ruler' | 'pencil' | 'shapes' | 'eraser' | 'marker' | 'targeting' | 'zone' | 'polygon' | 'coordinateSearch' | 'layers' | 'dataTransfer' | 'collab'`. Note that the `.includes()` check resolved in Step 2 is the *drawing-tool subset* only (the first eight), not this whole list — the panel tools are handled elsewhere in the file.

- [ ] **Step 1: Resolve the five collab hunks by keeping `HEAD`**

Conflicts at roughly lines 261, 298, 332, 372 and 422 of the merged file are all fork collab call sites — `collabHandlesHistory`, `collabUndo`, the persistence suppression comment, and the `layers`/`arcs` state fields. Upstream's side of each is his lobby's equivalent, which no longer exists.

Take `HEAD` for all five. For the hunk at ~422, the fork's side is:

```js
                ...stored,
                layers: MAP_TOOL_STATE.layers,
                arcs: MAP_TOOL_STATE.arcs
```

and upstream's `drawings: MAP_TOOL_STATE.drawings` is already covered by the fork's `...stored` spread.

- [ ] **Step 2: Resolve the seven tool hunks by keeping both**

At ~1156, the tool list. Union both sides:

```js
            [
                'ruler',
                'pencil',
                'shapes',
                'eraser',
                'marker',
                'targeting',
                'zone',
                'polygon'
            ].includes(MAP_TOOL_STATE.tool)
```

At ~2160, the shortcut map:

```js
        shapes: getMapToolShortcut('shapes'),
        zone: getMapToolShortcut('zone'),
        polygon: getMapToolShortcut('polygon'),
```

At ~2655, ~2685 and ~2736, the button lookups and labels. Keep both sides in each:

```js
    const shapesButton = $('mapToolShapes');
    const zoneButton = $('mapToolZone');
    const polygonButton = $('mapToolPolygon');
```

```js
    setToolButtonLabel(shapesButton, 'mapToolShapes', 'shapes');
    setToolButtonLabel(zoneButton, 'mapLayerZones', 'zone');
    setToolButtonLabel(polygonButton, 'mapLayerPolygons', 'polygon');
```

At ~2188 and ~2786, the pencil-palette close checks are the same logic on both sides. Keep `HEAD`.

- [ ] **Step 3: Move the fork's `shapes` shortcut off `'g'`**

In `js/core/config.js`, keep upstream's `zone: 'z'` and `polygon: 'g'`, and change the fork's `shapes` to `'s'`:

```js
            shapes: 's',
            zone: 'z',
            polygon: 'g',
```

Mirror the same three values into `config/app.json` under `mapTools.shortcuts`.

Then confirm `'s'` is not already taken:

```bash
grep -n "'s'" js/core/config.js | head
node -e "const c=require('./config/app.json').mapTools.shortcuts; const v=Object.values(c); console.log(v.length===new Set(v).size ? 'unique' : 'DUPLICATE')"
```

Expected: `unique`. If `'s'` collides, pick another unused single letter and use it in both files.

- [ ] **Step 4: Drop the fork's rectangle and circle**

```bash
grep -n "'rect'\|'circle'\|rectangle" js/map/map-shapes.js js/map/map-tools.js sync/src/ops.js | head -20
```

Remove the `rect` and `circle` branches from the shapes tool and from `sync/src/ops.js`'s drawing `type` validator, keeping `line` and `arrow`. Leave any already-stored drawing of those types renderable — deleting the *tool* must not break a saved map that contains one.

- [ ] **Step 5: Verify syntax**

Run: `node --check js/map/map-tools.js && node --check js/core/config.js && node --check sync/src/ops.js`
Expected: no output, exit 0.

- [ ] **Step 6: Run the tool-toggle test**

Run: `node test/map-tool-toggle.mjs`
Expected: PASS, 57 assertions. This test pins that a second press of any tool button *or hotkey* disarms it. Two new tools arrived in Step 2; if they are not wired through the same guard, this test is where it shows.

If it fails on `zone` or `polygon`, add them to the guard in `handleMapToolShortcut` and to the button handler, matching the shape the other six already use.

- [ ] **Step 7: Stage**

```bash
git add js/map/map-tools.js js/core/config.js config/app.json js/map/map-shapes.js sync/src/ops.js
```

---

### Task 7: Renderer layers, saved targets, and locales

**Files:**
- Modify: `js/map/renderer.js` (1 conflict), `js/features/saved-targets.js` (5), `locales/*.json` (11 files), `README.md`, `docs/*.md`, `scripts/*.mjs`, `style.css`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a tree with no remaining conflict markers.

- [ ] **Step 1: `js/map/renderer.js` — keep the fork's layers, drop his lobby layer**

Keep `HEAD`: the fork's layers 6–8 (per-gun range rings and target lines, then markers, with the per-gun loop in `js/map/guns-overlay.js`) and layer 12. Delete upstream's block — it draws lobby participants' personal origin and target markers, which belongs to the deleted lobby.

Renumber the fork's layer comments so they run consecutively if his deletion leaves a gap.

- [ ] **Step 2: `js/features/saved-targets.js` — keep `HEAD` in all five**

Every conflict here is the fork's `collabSuppressesLocalPersistence()` guard against upstream's unguarded write. Upstream's per-map keying (PR #8, the fork's own contribution) is already present on both sides outside the conflicts.

Keep the fork's comment explaining why a room suppresses the local write. Verify afterwards:

```bash
grep -n "collabSuppressesLocalPersistence" js/features/saved-targets.js
```

Expected: at least two hits.

- [ ] **Step 3: Resolve the locale conflicts**

For each of the 11 files, take the union: upstream's new lobby and zone/polygon keys, plus the fork's existing keys. Then delete upstream's lobby-only keys, which now describe nothing:

```bash
node -e "
const fs=require('fs');
for (const f of fs.readdirSync('locales')) {
  const j=JSON.parse(fs.readFileSync('locales/'+f,'utf8'));
  const dead=Object.keys(j).filter(k=>/^lobby/i.test(k));
  if (dead.length) console.log(f, dead.length, dead.slice(0,5).join(', '));
}"
```

Remove every key the fork's UI does not reference. Confirm each file still parses:

```bash
node -e "
const fs=require('fs');
for (const f of fs.readdirSync('locales')) { JSON.parse(fs.readFileSync('locales/'+f,'utf8')); }
console.log('all locales parse');"
```

Expected: `all locales parse`.

- [ ] **Step 4: Resolve the documentation and script conflicts**

`README.md`, `docs/development.md`, `docs/features.md`, `docs/maps.md`, `docs/mobile.md`, `docs/terrain.md`, `docs/analytics.md`, `scripts/build-pages.mjs`, `scripts/dev-server.mjs`, `scripts/seo-content.mjs`, `scripts/version-assets.mjs`, `scripts/zh-cn-seo.mjs`, `src/pages/index.html`, `style.css`.

Take upstream's side for SEO copy, the Zestafona map, and his page-shell structure. Keep the fork's side wherever it documents a fork-only feature (terrain, collaboration, OBS, the pop-out panel). Delete any prose describing his lobby.

- [ ] **Step 5: Confirm no markers survive anywhere**

```bash
git diff --check
grep -rn '^<<<<<<< \|^>>>>>>> ' --include='*.js' --include='*.mjs' --include='*.json' \
  --include='*.md' --include='*.css' --include='*.html' . | grep -v node_modules
```

Expected: no output from either.

- [ ] **Step 6: Stage everything remaining**

```bash
git add -A
git diff --name-only --diff-filter=U
```

Expected: empty.

---

### Task 8: Green suites, then commit the merge

**Files:**
- Modify: whatever the suites turn up

**Interfaces:**
- Consumes: the fully resolved tree from Tasks 3–7.
- Produces: the fork-point merge commit.

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: exit 0. This regenerates the ten page shells from `src/pages/index.html`; if Task 7 left that file inconsistent, it fails here.

- [ ] **Step 2: Script suite**

Run: `npm run test:scripts`
Expected: PASS. Compare the count against Task 1 Step 5 — it must not drop.

- [ ] **Step 3: Browser suites, one at a time**

```bash
for t in guns-model guns-persistence guns-pick guns-render guns-ui guns-collab \
         range-ring reachability flight-time map-tool-toggle panel-popout; do
  echo "=== $t"; node test/$t.mjs || echo "FAILED: $t";
done
```

Expected: all PASS. `reach-badges` and `cross-section` are excluded — they are the known failures named in Global Constraints.

- [ ] **Step 4: Worker suites**

```bash
npm --prefix sync run test:smoke
npm --prefix sync run test:disabled
npm --prefix sync run test:guns
npm --prefix sync run test:cursors
npm --prefix sync run test:obs
npm --prefix sync run test:browser
```

Expected: all PASS. These exercise the fork's own worker, which this merge should not have touched — a failure here means Task 2 Step 5 took the wrong `wrangler.jsonc` or Task 6 Step 4 broke the ops validator.

- [ ] **Step 5: Confirm the known failures are unchanged, not worsened**

```bash
node test/reach-badges.mjs 2>&1 | tail -5
node test/cross-section.mjs 2>&1 | tail -5
```

Expected: `reach-badges` still crashes building fixtures; `cross-section` still fails exactly one assertion, `box.header <= 20`. Any *new* failure mode in either is in scope and must be fixed.

- [ ] **Step 6: Commit the merge**

```bash
git commit -F- <<'EOF'
Upstream v1.8.0 arrives as a fork point, since his lobby and ours cannot both be the collaboration layer

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013soTBfL98g6BSiXRBzkiyz
EOF
```

---

### Task 9: Repository security infrastructure

Spec bucket A3. No code risk, no conflicts — these files do not exist on the fork.

**Files:**
- Create: `SECURITY.md`, `.github/dependabot.yml`, `.github/workflows/security.yml`, `docs/security.md`

**Interfaces:**
- Consumes: the merged tree.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Copy the four files from upstream**

```bash
for f in SECURITY.md .github/dependabot.yml .github/workflows/security.yml docs/security.md; do
  mkdir -p "$(dirname "$f")"
  git show upstream/main:"$f" > "$f"
done
```

- [ ] **Step 2: Retarget them at the fork**

Each references upstream's repository, contact address and deployed hostnames. Edit every occurrence to the fork's:

```bash
grep -rn "wardogs-artillery.com\|apollyon-sys\|onurvassiljev" SECURITY.md docs/security.md \
  .github/dependabot.yml .github/workflows/security.yml
```

Replace hostnames with the fork's (`wardogs-map.olm.pet`, `wardogs-map-sync.olm.pet` per `sync/wrangler.jsonc`) and the repository path with the fork's. Leave a security contact that actually reaches you — a `SECURITY.md` pointing at someone else's inbox is worse than none.

- [ ] **Step 3: Strip lobby-specific content from `docs/security.md`**

It documents his admission flow, Turnstile setup and `LOBBIES_DISABLED` kill switch — none of which exist on the fork yet. Delete those sections. They come back, rewritten for the fork's worker, in the security plan.

- [ ] **Step 4: Check the workflow references real paths**

```bash
grep -n "path\|working-directory\|npm\|run:" .github/workflows/security.yml
```

Upstream's worker is at `sync/` with `package.json`, same as the fork, so paths should carry over. Fix any that name `src/index.mjs` or his test files.

- [ ] **Step 5: Commit**

```bash
git add SECURITY.md docs/security.md .github/dependabot.yml .github/workflows/security.yml
git commit -m "The fork gains a security policy and dependency scanning, since inheriting his trunk should mean inheriting his hygiene too"
```

---

### Task 10: Record the outcome

`extraction-plan.md` is the living document for this work and currently says the opposite of what this branch did.

**Files:**
- Modify: `extraction-plan.md`

- [ ] **Step 1: Replace the superseded analysis**

The section *Merging onto v1.8.0, and what goes back upstream* argues for adopting his protocol. Replace its body with a pointer to `docs/superpowers/specs/2026-09-09-upstream-v1-8-0-harvest-design.md` and a one-paragraph statement of the decision: the fork keeps its own socket layer, because the channel split his server lacks is what the fork's cursors, follow-camera and OBS viewer are built on.

- [ ] **Step 2: Replace inferred conflict figures with measured ones**

The plan states conflict counts inferred from per-commit file statistics. Replace with what Task 2 actually produced: 57 conflicted files and 24,982 conflicted lines before renormalisation, of which 18,331 were line endings from `a91e48726`; `js/map/map-tools.js` at 12 hunks and 161 lines, not the un-mergeable gate it was described as.

- [ ] **Step 3: Update the status board**

- Item 19 — `absorbed`, upstream's locks replace the fork's force-placement mode, landed in this merge.
- Item 30 — note the reconciliation: his `zone` and `polygon` adopted, the fork's `rect` and `circle` dropped, `line` and `arrow` kept, shortcut moved to `'s'`.
- Items 21, 24, 26, 29, 31 — still `branch`, still on the fork's own socket layer, no longer described as blocked on upstream server extensions.
- Item 13 — R2, landed in this merge.
- Item 20 — record which tile-decode path Task 5 chose and why.

- [ ] **Step 4: Commit**

```bash
git add extraction-plan.md
git commit -m "The extraction plan records the fork point, since the merge it was predicting has now actually happened"
```

---

## What this plan does not cover

Two follow-on plans, both gated on this one:

1. **Security port** — spec buckets A1 and A2. `tokens.mjs` and `admission.mjs` ported onto the fork's worker, signed invites so scanning cannot instantiate a Durable Object, the typed-code plus Turnstile fallback, `limitedBody`, and the four IP rate-limit bindings. Deliberately not part of the merge: these are a feature with their own tests, not a conflict resolution.

2. **Protocol corrections** — spec bucket B. `ops.js` importable from the browser (B4) first, then a single `invertOperations` (B3), then the revision and `before` check (B1), then ack-gated undo (B2). B4 leads because B3 and B1 both need the shared module.
