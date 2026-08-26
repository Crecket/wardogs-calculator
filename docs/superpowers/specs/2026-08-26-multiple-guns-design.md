# Design — multiple guns (idea 7)

Backing research: [ideas-research/07-multiple-guns.md](../../ideas-research/07-multiple-guns.md).
Entry: [ideas.md](../../ideas-research/ideas.md) § 7.

**Shape of the feature.** Artillery becomes a list of guns, presented like Saved
targets: click a gun to select it, and the selected gun is what the left sidebar
edits, what the solution panel solves, and what moves when you click the map.
Each row carries an eye toggle that shows or hides that gun's marker, range
rings, and line to the target.

One target. N guns firing at it.

---

## Why this is cheaper than the research concluded

The research doc costed a per-gun solution panel duplicated across 11 HTML
shells, and called that the dominant expense. This design does not have one:
**exactly one solution panel exists, and it follows the selection.** The
11-shell edit shrinks to adding a list container and a script tag — the same
shape as the contour layer's change, which merged from upstream cleanly.

The second saving is `S.origin`. Rather than replacing it, it becomes an
accessor onto the active gun.

---

## 1. Data model

```js
S.guns = [
    {
        id,          // slug, matches the sync ID_PATTERN
        name,        // display name, e.g. "Gun 1"
        position,    // { x, y }
        weapon,      // weapon id; per gun, not global
        visible      // local view state, never synced
    }
];

S.activeGunId;
```

### The accessors

`js/features/guns.js` converts two existing data properties on `S` into
accessors at load time:

```js
Object.defineProperty(S, 'origin', {
    get() { return activeGun().position; },
    set(value) {
        const gun = activeGun();
        gun.position.x = value.x;
        gun.position.y = value.y;
    }
});
```

and the same pair for `S.weapon`, reading and writing the active gun's `weapon`.

The setter assigns `x`/`y` onto the existing object rather than replacing it, so
a gun's `id`, `name` and `weapon` survive every existing whole-object write.

**This is the load-bearing decision.** There are 7 whole-object assignments to
`S.origin` and 6 to `S.weapon` in the codebase; every other one of the ~40
references is a read like `S.origin.x`, `clamp(S.origin)` or
`structuredClone(S.origin)`, and all of those keep working unedited. It is what
keeps `results.js`, `inputs.js`, `point-locks.js`, `terrain-ballistics.js` and
`mobile.js` out of the diff entirely.

Verified safe: nothing in the codebase does `structuredClone(S)`, `{...S}`, or
`JSON.stringify(S)`, so converting properties on `S` to accessors has no other
reader to break.

### The one aliasing hazard

Because the getter returns the gun's **live** `position` object rather than a
copy, any code that captures `S.origin` into a variable and later assigns that
variable elsewhere is aliasing the gun. Exactly one site does this — the Swap
button at `js/events.js:361`:

```js
const oldOrigin = S.origin;   // reference to the gun's position
S.origin = S.target;          // setter overwrites that same object
S.target = oldOrigin;         // S.target now IS the gun's position object
```

Both points would end up at the target, and `S.target` would then alias the
active gun, so dragging the gun would drag the target with it. The fix is to
copy at capture:

```js
const oldOrigin = { x: S.origin.x, y: S.origin.y };
```

The getter must **not** return a copy instead: `clamp(S.origin)` and the drag
path mutate the returned object in place and depend on it being live.

Every other reference is a field read (`S.origin.x`), an in-place mutate
(`clamp(S.origin)`), or a defensive `structuredClone(S.origin)` — all safe. This
one line is the sole edit `js/events.js` needs.

`js/core/core.js` keeps its `origin` and `weapon` literals and is **not edited**.
`guns.js` replaces them at load. Object-literal properties are configurable, so
`defineProperty` may convert them.

### Initialisation and ordering

`guns.js` loads immediately after `js/core/core.js` in the script list — after
`core.js` defines `S`, and before anything that reads `S.origin` or `S.weapon`.

At load it seeds `S.guns` with exactly one gun, taking its position from
`core.js`'s existing `S.origin` literal (or from restored storage) and its weapon
from `S.weapon`, then installs the accessors. `activeGun()` therefore always
returns a gun, and `S.guns.length >= 1` is an invariant the rest of the code may
rely on. `js/features/weapons.js:289`'s `S.weapon = DEFAULT_WEAPON` at startup
lands on that first gun.

---

## 2. UI

A **Guns** panel in the left sidebar, above Saved targets, reusing the
`saved-target*` markup and CSS classes so it needs no new styling vocabulary:

- Row: name, coordinates, weapon name. Active row carries `.active`.
- Click a row to select it.
- Eye button toggles that gun's `visible`.
- Remove button. Removing the active gun selects the nearest remaining one.
- Add button below the list. Disabled at `LIMITS.guns`.
- The list never empties: the last gun cannot be removed.

Selecting a gun changes what `ox`/`oy` edit, what the weapon dropdown sets, what
the solution panel solves, and what map clicks move in Artillery mode. All of
that follows from the accessors without further wiring.

### Rendering

`renderer.js` gains one guarded call in the artillery block. For each **visible**
gun it draws that gun's marker, its max/min range rings computed from **its own**
weapon, and its own dashed line to the shared target. The active gun is drawn
emphasised; the others are drawn at reduced alpha so the selected solution stays
readable.

**The active gun always draws, whatever its eye state.** The eye governs the
other guns only. Otherwise selecting a hidden gun would leave the sidebar
solving for something invisible, which reads as a bug — and the alternative
rule, forcing `visible` true on selection, would silently discard a setting the
user had chosen.

Per-gun weapons are why the rings must be per gun: a ring drawn at the wrong
weapon's radius is worse than no ring.

---

## 3. Sync

### Compatibility: one deploy, no protocol version

The research doc expected this to need a tolerant-unknown-kind change landed and
deployed ahead of the feature. It does not, because two properties already hold:

- `js/features/collab.js:520` ends its op switch with `default: break` — **an old
  client silently ignores ops it does not know.**
- An op that fails validation returns `{type: 'error'}` to its sender only
  (`room.js:542`); it does not close the socket or affect other peers.

So guns get their **own op family** rather than extending `point.set`'s kinds:

| Op | Payload | Notes |
|---|---|---|
| `gun.add` | `{gun}` | Upsert. Covers add, rename, and weapon change. |
| `gun.move` | `{id, x, y}` | The hot path, sent from the drag throttle. |
| `gun.remove` | `{id}` | |

Extending `point.set` instead would have been rejected outright by the deployed
Worker (`ops.js:259`); a new op family is simply ignored by old clients. That is
the whole reason for the split.

An old client in a room with new clients therefore sees no gun traffic and no
errors, and ignores the extra `guns` field on the snapshot.

### The legacy origin mirror

**Gun 1's position keeps being mirrored to the existing `point.set origin` op**,
and an incoming legacy `point.set origin` is applied to gun 1.

Gun 1 specifically, not the active gun: a stale peer watching the shared origin
teleport every time someone changes their selection is worse than one that
simply never sees guns 2+. Consistent degradation beats complete degradation.

### Server changes

`sync/src/room.js`:

- Migration **version 2** creates `guns (id TEXT PRIMARY KEY, json TEXT NOT NULL)`.
- `create()` writes no gun; a room starts empty and the first joiner pushes.
- `snapshot()` gains `guns: this.rows('guns')`.
- `apply()` gains the three ops, using the existing `insert` / `remove` helpers.
- `alarm()` adds `DELETE FROM guns`.
- `clear` scope `all` clears guns.

`sync/src/ops.js`:

- `LIMITS.guns = 8`.
- `validateGun()` — id against `ID_PATTERN`, name against `NAME_LENGTH`, weapon
  against `SLUG_PATTERN`, coordinates against `COORDINATE_BOUND`. Rejects
  `visible`: it is not part of the wire format.
- `push` gains a `guns` array, capped at `LIMITS.guns`.

### What is deliberately not synced

`visible` and `activeGunId` are **local**. Which guns you have hidden and which
one you have selected is how *you* are looking at the map, not room content —
the same distinction that governs map layer visibility. Hiding a gun on your
screen must not hide it on a teammate's.

This also keeps `visible` out of the validated wire format entirely.

---

## 4. Migration of existing user data

**`wardogs-map-points`** (reload persistence). A stored `{origin, target}` with
no `guns` becomes a single gun at that position with the current global weapon.
The writer emits `guns` *and* keeps writing `origin` as gun 1 for one release,
so a user who lands back on an older cached build does not lose their position.

**Saved targets** keep their existing optional single `origin: {x, y}` field, so
the JSON export format is unchanged in both directions and old exports import
unchanged.

Saving captures the **active** gun's position; restoring applies it to the
**active** gun. Symmetric, and consistent with the premise that the selected gun
is the one you are working with. (The research doc suggested gun 1 for both;
active/active is the same amount of code and does not surprise someone who has
gun 3 selected while saving.)

---

## 5. Fork merge cost

This fork tracks `upstream/main` and merges from it regularly, so the shared-file
footprint is a design constraint, not an afterthought.

**The whole server half is free.** `sync/` and `js/features/collab.js` do not
exist upstream. `ops.js`, `room.js` and the collab client changes carry zero
merge risk.

Upstream churn over its last 60 commits, on files this feature touches:

| File | Upstream commits | This feature's edit |
|---|---|---|
| `locales/*.json` | 16 | one added key per file |
| `js/events.js` | 12 | one line (the swap alias fix) |
| `src/pages/*.html` ×11 | 12 | one container + one script tag |
| `js/features/results.js` | 7 | **none** |
| `js/core/core.js` | 5 | **none** |
| `js/map/renderer.js` | 5 | one guarded call |
| `js/features/saved-targets.js` | 5 | migration + active-gun save/restore |
| `js/ui/inputs.js` | 3 | **none** |

The three highest-churn code files take no edit at all, which is a direct
consequence of the accessor design and of defining the accessors from `guns.js`
rather than editing the `S` literal. The remaining shared-file edits are
additive insertions of the same shape as the contour layer's, which merged
cleanly.

`js/features/saved-targets.js` is the one genuine shared-file edit. It is
confined to the `MAP_POINTS_KEY` read/write path and the save/restore functions.

---

## 6. Testing

**Server** — `sync/test/` already holds `smoke.mjs`, `browser.mjs` and
`disabled.mjs` run against `wrangler dev`. Add coverage for: the three gun ops
round-tripping, `LIMITS.guns` enforcement, `validateGun` rejecting a bad weapon
slug and a stray `visible`, migration v2 applying to a room created at v1, and
`clear all` removing guns.

**Compatibility** — the case that must be proven, not assumed: a client that
does not know `gun.*` ops sits in a room with one that does, receives the
traffic, and neither errors nor loses its own origin. Testable against
`wrangler dev` by sending `gun.add` on one socket and asserting a second socket
that ignores it still applies `point.set origin` correctly.

**Client** — no unit harness exists for the browser JS, so verification is
driving the running app, as the contour layer was: add guns, select between
them, toggle visibility, confirm the sidebar and solution panel follow the
selection, reload and confirm restoration, and drive two browser contexts
through a shared session.

---

## 7. Explicitly out of scope

- **Sheaf patterns** (parallel / converged / open). Pure geometry once guns are a
  list, but a separate feature with its own UI.
- **Time-on-target.** Needs idea 8 first — `data/ballistics/` carries no time
  dimension — and a per-gun TOF difference to be meaningful.
- **Per-gun targets.** One shared target is what makes this a battery.
