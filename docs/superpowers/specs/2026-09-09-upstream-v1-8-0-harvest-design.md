# Harvesting upstream v1.8.0 onto the fork's own socket layer

Design doc. Companion to `extraction-plan.md`, which tracks what leaves the fork; this one says what comes *in* from upstream now that both sides have shipped a collaboration feature.

Measured against merge base `353f14cef`, upstream `35c520a88`, merge tree `183b369c1`.

## The decision

**The fork keeps its own `sync/` and `js/features/collab.js`.** Upstream's lobby is not adopted. What comes across is his security work, three protocol corrections, and his non-collaboration feature work.

This reverses the "his trunk, our layer" posture recorded in `extraction-plan.md` under *Merging onto v1.8.0*. That section was written believing the fork's worker had "an origin check and nothing else". It does not. `sync/src/room.js` already carries the thing his server most conspicuously lacks — three independent rate-limit buckets for ops, cursors and views (`:44`–`:48`) — plus a viewer role (`:577`), per-collection caps, and idle-based expiry with a touch-granularity optimisation. `sync/src/index.js:20` mints 59-bit codes with rejection sampling over a voice-safe alphabet.

The features that make the fork's rooms worth using — live cursors, a shared firing solution, follow-camera, the OBS viewer — are the fork's socket layer working as designed. Rebuilding them on his protocol would mean re-deriving the channel split he does not have, and waiting on him to merge it.

### What this costs, stated plainly

His lobby is better in four places the fork does not intend to fix by adopting it: signed admission before a Durable Object is instantiated, Turnstile-gated creation, a server-authoritative revision with conflict detection, and undo that only stacks acknowledged edits. Buckets A and B below close the first, second and fourth of those inside the fork's own design. The third is closed partially — see *Open question 2*.

## Non-goals

- Adopting `js/collab/protocol.mjs`, `replica.mjs` or `lobby.js`.
- Matching his document model. The fork's shared firing solution (`point.set`) and gun list stay shared; his per-player presence model is a different product and is not being merged into this one.
- His `coalesceOperations`. It exists to survive `maxChangeBatchesPerRoom` of 1000, a cap the fork does not have.
- Umami analytics (`56bb4fd41`, `a95090f06`) and donation links (`a91e48726`). The fork's item 9 is analytics off by default.
- Reporting his rate-limiter defect upstream. Tracked separately as PR A in `extraction-plan.md`; it does not block anything here.

## Bucket A — security, ported into `sync/`

Two of his modules have no coupling to his document model or protocol. They read `env` and return booleans, and drop into the fork's worker unchanged.

| Source | Lines | What it provides |
| --- | ---: | --- |
| `sync/src/tokens.mjs` | 50 | HMAC-SHA256 signed invites and IP-bound admission tokens. `mintInvite`/`verifyInvite`/`mintAdmission`/`verifyAdmission`, base64url, expiry packed base36. No imports beyond WebCrypto. |
| `sync/src/admission.mjs` | 43 | Turnstile siteverify, pinning both hostname and action, with a 5s `AbortSignal.timeout` and correct separation of 403 challenge-failed from 503 challenge-unavailable. |
| `index.mjs:34` `limitedBody()` | ~12 | Streaming request-body cap that aborts mid-read. The fork's `/room` POST currently buffers the whole body. |
| `index.mjs:31` `allowedBy()` | ~10 | Cloudflare rate-limit bindings keyed on `CF-Connecting-IP`, applied before any Durable Object is reached. |

### A1. Signed invites, so scanning cannot instantiate a Durable Object

The change that matters most, and the one that is not a file copy.

The fork's `/room/{code}` GET validates `CODE_PATTERN` and then opens the room's Durable Object. A well-formed 12-character code therefore costs a DO instantiation per guess. At 59 bits nobody is *finding* a room this way, so this is not a confidentiality bug — it is unmetered CPU on the fork's account, reachable by anyone who can construct a string.

Upstream verifies an HMAC signature before `env.ROOM.get()` is called. Porting that means the room code alone stops being sufficient to open a socket: a join link carries `#room=<code>&i=<invite>`, and the invite is minted by the creating client and re-minted server-side on each successful join so links stay shareable.

**This changes the sharing story and needs care.** The fork's room code is deliberately the only credential *because* people read codes aloud over voice chat. An invite token cannot be read aloud. The design keeps both paths:

- A share **link** carries a signed invite and skips straight through.
- A **typed code** with no invite falls back to a challenge: `POST /admission` with a Turnstile token, which mints an admission bound to the caller's IP, which then permits the join. This is the path Turnstile actually protects.

Non-browser callers (the test suite, `curl`) keep working through the same switch upstream uses: `validateTurnstile` returns `{ok: true}` immediately when `config.turnstileRequired` is false, and the admission is minted unconditionally. Note the exact condition — an unset `TURNSTILE_SECRET` while `turnstileRequired` is *true* yields `turnstile-not-configured` and a 503, not an open door. The fork's config must derive `turnstileRequired` from whether a secret is configured, or local development breaks closed.

### A2. Rate-limit bindings ahead of the Durable Object

Four bindings in `wrangler.jsonc` — `ENTRY_RATE`, `ADMISSION_RATE`, `CREATE_RATE`, `JOIN_RATE` — checked in `index.js` on `CF-Connecting-IP` before routing. The fork's existing in-DO buckets stay; these sit in front of them and protect the DO-instantiation path that in-DO limiting cannot, by definition, reach.

`allowedBy` returns true when the binding is absent, so local development and the test suite are unaffected.

### A3. Repository security infrastructure

Absent from the fork entirely, present upstream, no conflict on any of them: `SECURITY.md`, `.github/dependabot.yml`, `.github/workflows/security.yml`, `docs/security.md`. Plus his `sharp` CVE override (`3bf0fa9d0`) and the esbuild bump (`ea4b7a9ed`).

## Bucket B — protocol corrections, implemented in the fork's own `ops.js`

These are ideas, not file copies. The fork's semantic op vocabulary (`gun.move`, `point.set`, `target.rename`, 13 in total at `ops.js:323`–`:443`) is kept. The fork's `collabOn*` hook API is kept — it is what makes the feature code readable, and no call site changes.

### B1. A revision counter and a `before` check

`js/features/collab.js:21` states the current model outright: *"adds and removes merge with no conflict logic at all."* The room replies `{type: 'ack', seq}` at `room.js:862` but compares nothing. Two peers dragging the same gun produce a silent last-write-wins.

Add a monotonic `revision` to the room record, returned on every ack and every broadcast. Ops that carry a `before` value — `gun.move`, `gun.weapon`, `point.set`, `weapon.set`, `target.rename`, the mutating ops — are rejected with `conflict` when it does not match. Ops that are pure inserts or deletes keep merging without a check, which is correct for them and is the property the current design got right.

On `conflict` the client refetches the snapshot rather than reconciling. This is what upstream does and it is the right trade for a room of sixteen people editing a map.

### B2. Undo gated on acknowledgement

`collabUndo` (`collab.js:1201`) pops from `COLLAB.ownOps` and sends the inverse immediately. If the original op was rejected, the undo desyncs the client from the room.

Entries move onto the undo stack only when their ack arrives. A rejected op never becomes undoable. Unlike upstream's `Replica.reject()`, a conflict does **not** clear the whole stack — that behaviour is a defect in his client, not a property to copy; the fork drops only the affected entry.

### B3. `invertOperations` as one function

The fork builds an `inverse` by hand at each of roughly twenty-five `collabOn*` emit sites. A single inverter over the op shape replaces all of them and removes a class of bug where a new op family ships without an inverse.

This is the largest single reduction available in `js/features/collab.js` and it changes no public function signature.

### B4. `ops.js` imported by the client as well as the Worker

`ops.js:1` calls itself "op validation shared by the Worker and the Durable Object" — both server-side. The browser has no access to it, so the client can construct ops the server will reject, and the rules are stated twice in two places that can drift.

Make it importable from both, the way `protocol.mjs` is. This is a build-configuration change, not a rewrite.

### B5. Not taken: per-map bounds validation

Upstream's `catalog.mjs` imports the real map definitions into the Worker and validates coordinates against actual map extents and markers against the placeable icon set.

The fork made the opposite choice deliberately, and documented it at `ops.js:9`: *"Deliberately absent: knowledge of which marker icons or map IDs exist... That keeps `maps/assets.json` a client-only concern."* The fork already rejects non-finite and out-of-range coordinates against a global `COORDINATE_BOUND` (`ops.js:72`), so the exposure is a peer placing a drawing outside the current map's extents, which the client tolerates.

Keeping the fork's decoupling. Recorded here so the trade-off is not rediscovered.

## Bucket C — non-socket upstream work

| Take | Replaces / adds | Conflict |
| --- | --- | --- |
| Point locks (`f8f4a399c`) | Retires item 19 and PR #3, which he closed unmerged | `events.js`, 2 hunks — same hit-test block as the fork's gun pickup (§2.6) |
| Persist selections (`core.js` `APP_SELECTIONS_KEY`) | New | 1 hunk, 208 lines; the fork's side is empty, take his whole |
| Zone + polygon tools (`736813877`) | Overlaps item 30 | 7 `map-tools.js` hunks; `'g'` keybinding clash with the fork's `shapes` |
| R2 tiles and terrain (`96ae6cda8`, `6989c96b1`) | Item 13 | `tiles.js`, 47 lines — see *Open question 1* |
| Zestafona map, markers, SEO | New content | none |
| Indexable landing pages (`35c520a88`, `e5b801ee1`) | New | page shells, CRLF-heavy |
| `camera-keys.js` improvements | New | 452 changed lines, almost all CRLF |

### C1. Item 30 reconciled against zone and polygon

His `zone` and `polygon` are synced collections; the fork's `shapes` (line, arrow, rectangle, circle) are not. They overlap without matching.

Resolution: adopt his `zone` and `polygon` as-is, drop the fork's rectangle and circle in their favour, and keep `line` and `arrow` as fork op families in `ops.js`. The fork's `shapes` shortcut moves off `'g'`, which is his `polygon`.

### C2. The CRLF flip is the merge, not the features

`a91e48726` ("feat: add donation links to desktop and mobile", 2026-09-07) rewrote 25 files with Windows line endings. Neither repository has a `.gitattributes`.

Measured on the merge tree: 24,982 conflicted lines across 57 files, of which **18,331 are line endings alone**. `js/ui/layout.js` conflicts as one 3,916-line hunk; `js/mobile/mobile.js` as 1,777 lines in two hunks with no semantic conflict at all.

Land `.gitattributes` with `* text=auto` on the fork first, and merge with `-X renormalize`. This removes roughly three quarters of the conflict surface before any feature work starts.

It also corrects the extraction plan's central claim. `js/map/map-tools.js` — named there as a gate that "no merge survives" — has 12 hunks and 161 conflicted lines, and five of those hunks are collab call sites that resolve by keeping the fork's side.

## Fork strategy

**A hard fork point, then cherry-picks.** Merge `upstream/main` once, at `35c520a88`, deleting `js/collab/` and his `sync/` in the merge itself. Afterwards, take his work by cherry-picking named commits rather than merging `main`.

The alternative — continuing to merge `main` — means deleting his entire lobby subsystem on every merge, forever, and re-resolving `js/main.js`, `js/map/renderer.js` and eleven locale files each time. A recurring whole-subsystem deletion is the most error-prone conflict there is, and it gets more expensive as his lobby grows.

Cost of the cherry-pick posture: his map, SEO and tooling work arrives as deliberate individual acts rather than automatically, and a commit touching both lobby and non-lobby code has to be split by hand. Both are acceptable against re-deleting a subsystem indefinitely.

## Open questions

1. **Does his R2 bucket send `Access-Control-Allow-Origin`?** He sets `image.crossOrigin = 'anonymous'` at `tiles.js:168`. The extraction plan concluded that approach could not work because the bucket sends no CORS header — that finding predates his R2 migration. If the bucket now sends one, his one-liner replaces the fork's entire `js/map/image-decode.js` same-origin/cross-origin split. Verify against the live bucket before resolving `tiles.js`.

2. **Does B1 need to extend to cursors and views?** The revision check is designed for durable ops. Cursor and view frames are ephemeral and already on their own buckets, so they should stay unversioned — but the fork's `push` op (`ops.js:443`) bulk-inserts a whole local map and needs a decision on whether it takes a revision or forces a snapshot refetch on every peer.

3. **Is the typed-code fallback in A1 worth its complexity?** It exists to preserve reading a code aloud over voice chat. If in practice every join arrives through a shared link, the challenge path could be dropped and codes could simply stop being sufficient on their own.

## Testing

`sync/test/` covers the fork's worker today. New coverage required:

- **A1** — join with a valid invite, an expired invite, a forged signature, and no invite; assert a Durable Object is never instantiated on the last three. Assert the typed-code path still succeeds with `TURNSTILE_SECRET` unset.
- **A2** — assert `allowedBy` returns true when a binding is absent, so the suite and local dev are unaffected.
- **B1** — two clients, one stale `before`, assert `conflict` and assert the loser refetches.
- **B2** — an op rejected by the server never becomes undoable; a conflict drops one entry and leaves the rest of the stack intact.
- **B3** — every op family has an inverse, asserted by enumerating the vocabulary rather than by listing cases.

The fork's suites (`npm run test`, `npm run test:scripts`, `sync/test/`) must be green before and after the fork-point merge. `test/reach-badges.mjs` and `test/cross-section.mjs` are already failing for reasons recorded in `extraction-plan.md`; they are pre-existing and out of scope, but must not get worse.

## Sequencing

1. `.gitattributes` (`* text=auto`) on the fork, renormalise, commit.
2. Fork-point merge of `35c520a88` with `-X renormalize`, deleting `js/collab/` and his `sync/` in the merge. Suites green.
3. Bucket C conflicts: `core.js` (take his), `events.js` hit-test, `tiles.js`, `map-tools.js` zone/polygon vs shapes, locales.
4. Bucket A3 (repository security infrastructure — no code risk, lands independently).
5. Bucket A1 and A2 with their tests.
6. Bucket B4, then B3, then B1, then B2. B4 first because B3 and B1 both want the shared module.
7. Update `extraction-plan.md`: the *Merging onto v1.8.0* section is superseded by this document, and the measured conflict figures replace the inferred ones.
