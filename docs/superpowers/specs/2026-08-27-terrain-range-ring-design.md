# Design — terrain-aware max range ring (idea 10)

Backing research: [ranked-ideas.md](../../ideas-research/ranked-ideas.md) item 5.
Sibling design: [2026-08-26-elevation-correction-design.md](2026-08-26-elevation-correction-design.md),
whose § 4 model this reuses unchanged.

**Shape of the feature.** `drawGunRangeRings` strokes `weapon.maxRange` as a
circle. It does not move when the gun does, so a gun on a summit and a gun on a
valley floor are drawn with identical reach. Research § 10 measured what that
costs on Bakurani: on a typical position the circle promises about **470 m of
reach that is not there** on its worst bearing.

This design replaces that circle with a per-bearing outline derived from the
ground the shell actually flies over. It ships enabled, needs no in-game
measurement, and does not touch the firing solution or any MIL the app prints.

---

## 1. The safety property everything else hangs off

**The ring is a differential from the model, added to the declared max range.
`data/weapons.json` stays authoritative.**

```
r_ring(ΔZ) = weapon.maxRange + [ modelMax(ΔZ) − modelMax(0) ]
```

Not `modelMax(ΔZ)`. The bracketed term is exactly zero when `ΔZ = 0`, so on
flat ground every bearing returns `weapon.maxRange` and the drawn ring is
**pixel-identical to today's circle**. This is deliberately the same property
§ 1 of the elevation-correction design establishes for MIL, for the same
reason: the fitted `muzzleVelocity` values imply `v²/g` of 2613 m and 2624 m
for the two SPG-2 arcs against a declared `maxRangeKm` of 2.629, and the ring
must not inherit that 5–16 m disagreement.

A corollary that decides § 2: because the model only ever supplies a
*difference*, the ring is a refinement of the existing drawing and never a
replacement for it. If the heightfield is missing, still loading, or the gun
sits outside terrain coverage, the correct fallback is the circle we draw
today — not a blank space and not an error.

---

## 2. What is drawn

Two outlines per gun, both replacing the single dashed circle:

1. **The reachable ring** — filled and stroked as the current ring is, clamped
   so no radius exceeds `weapon.maxRange`.
2. **The advisory outline** — the unclamped ring, drawn only where it exceeds
   `weapon.maxRange`, as a faint dashed line with no fill.

The clamp exists because drawing past `maxRange` would claim range the shipped
table cannot produce a MIL for, against `releasePolicy.flatTableAuthoritative`
in `terrain-context.json`. The advisory outline exists because clamping alone
is not harmless: research § 10 found **100 % of bearings clamp at the map's
summit**, which would collapse the ring back to exactly today's circle for the
elevated gun that motivates the whole feature.

So the split is: the solid ring is a promise the tables can keep, and the
dashed outline is context, in the same register as the `ΔZ` readout — visible,
unlabelled, and never converted into a number the user might fire on.

The min-range ring is **not** height-corrected. See § 9.

### Interaction with gun visibility

The ring follows the existing rules in `guns-overlay.js` exactly: drawn per
gun, dimmed to `GUN_INACTIVE_ALPHA` for non-active guns, and suppressed for
hidden ones. Nothing about selection or the eye toggle changes.

---

## 3. The model

Unchanged from the elevation-correction design § 4 — a vacuum trajectory with
elevation affine in mil, parameters read from the committed
`data/ballistics/projectile-model.json`.

The max range falls straight out of the solver already in
`scripts/lib/ballistics.mjs`. `solveTan` returns `null` when

```
R² − 4k(ΔZ + k) < 0        k = gR² / 2v²
```

which is precisely "no launch angle reaches this point". The max-range locus is
where that discriminant reaches zero, and it has a closed form:

```
modelMax(ΔZ) = (v/g) · √(v² − 2g·ΔZ)
```

with `ΔZ = z_target − z_gun`, matching the sign convention used everywhere else
in the repo. Firing downhill (`ΔZ` negative) lengthens it; uphill shortens it.

**Sensitivity is about 1 m of range per 1 m of height**, damped to roughly 0.7
by drag the vacuum model does not carry. Research § 10 swept the impact angle
at max range from 45° to 60° and the median worst-bearing shortfall moved only
from 432 m to 277 m — the feature's value survives the drag uncertainty that
gates the low arc in the sibling design.

### Which arc supplies `v`

Max range is achieved at the arc crossover, where the low and high branches
meet, so either arc's fit is a valid source. The generator takes the **highest
`muzzleVelocity` across the weapon's arcs**, because that is the branch whose
own table extends furthest and is therefore the one whose fit is anchored by
the max-range end of the data. For SPG-2 this is `high` at 160.4 m/s; the
mortar has one arc.

A weapon with no entry in `projectile-model.json` gets no terrain ring and
falls back to its circle (§ 1).

---

## 4. The ring solve

The ring is **not** a scaled circle. How far a shell reaches on a bearing
depends on the height of the ground where it lands, which depends on how far it
reached — a fixed point:

```
r(θ) = r_ring( z(θ, r) − z_gun )
```

Solved per bearing by marching outward and bisecting the first crossing:

- **360 bearings**, one per degree. Research § 10 measured ~30 lobes over the
  full circle — one feature per ~12° — and 4–8 m of radius change between
  adjacent 1° steps, so a degree resolves the shape without chasing noise.
- **25 m march step**, then **14 bisection steps** on the bracketing interval.
- A bearing that leaves terrain coverage before crossing terminates at the last
  covered sample.
- The march is bounded by `modelMax(minZMeters − z_gun)` — the furthest this
  gun could reach if the whole map were at its lowest sample. It is an exact
  upper bound, not a magic constant, and it comes free from the § 5 header. A
  bearing that somehow reaches it returns it.

**Only the first crossing is used.** Terrain can make the reachable set along a
ray disconnected — a valley floor behind a high shoulder is in range while the
shoulder is not — and research § 10 found this in 6 % of positions. The ring is
therefore the outer boundary of the *connected* reachable region, which is what
a range ring has always meant. Rendering disconnected pockets is a non-goal
(§ 9).

---

## 5. The heightfield asset

The runtime terrain path streams the two chunks a firing solution touches. A
2.6 km ring sweeps roughly 36 of them, about **19 MB**, so the ring cannot read
the chunk data directly. Same problem the contour layer had, same answer: bake
it at build time.

Research § 10 measured the accuracy of a downsampled grid against the full 2 m
data. **32 m spacing reproduces the ring to 0.7 m median, 2.6 m p90, 22 m
worst** across 25 positions × 360 bearings, at 234 KB for Bakurani — under half
the size of the `contours.json` already shipped. That is the chosen spacing.

The layout mirrors `manifest.json` + `chunks/*.bin`, which the terrain loader
already knows how to fetch and decode.

### `data/terrain/<map>/heightfield.json` (new, generated, committed)

```json
{
  "format": "wardogs-heightfield-u16-v1",
  "mapId": "bakurani",
  "generatedFrom": "data/terrain/bakurani/manifest.json",
  "generatedAt": "2026-08-27",
  "spacingMeters": 32,
  "grid": { "width": 346, "height": 346, "originX": 23.35, "originY": 19.34, "stepGameUnits": 0.32 },
  "minZMeters": -1006.55,
  "maxZMeters": 74.85,
  "file": "heightfield.bin",
  "bytes": 239432,
  "sha256": "…"
}
```

### `data/terrain/<map>/heightfield.bin` (new, generated, committed)

Row-major `uint16` little-endian, `width × height` samples, rows running
**south to north** so `originY` is the minimum and the decode is a plain add —
deliberately unlike the contour grid, whose rows run north to south and whose
decoder subtracts. Value `v` decodes as

```
z = minZMeters + (v / 65535) * (maxZMeters − minZMeters)
```

At Bakurani's 1081 m relief that is 1.7 cm per step, far below anything the
ring resolves. Sample coordinates are game units; the grid covers the map's
playable `bounds` from `maps/<map>.json`, which is a subset of the chunk
coverage.

**The datum offset is irrelevant here and must stay that way.** Only
differences are ever taken (`z(θ,r) − z_gun`), so the ~900 m offset described in
`docs/terrain.md` cancels. No absolute height is read, stored, or displayed.

---

## 6. Runtime

### Loading

`js/map/heightfield.js` follows the `contours.js` lazy-load pattern — one
in-flight promise per map cached in a `Map`, a `format` check, and a `catch`
that caches `null` so a failure is not retried every frame. It differs in two
ways:

- **It fetches automatically**, not on a layer toggle. The ring is always
  drawn, and drawing it wrong by a median 470 m is the problem being fixed, so
  the 234 KB is not opt-in. It is fetched once per map and cached for the
  session.
- **It decodes into a `Float32Array` once**, at load, rather than per frame.
  346 × 346 floats is 479 KB resident and turns every later sample into two
  array reads.

Until it lands, `cachedHeightfield(mapId)` returns `null` and the ring falls
back to the circle (§ 1). When it lands it calls `draw()`, exactly as
`ensureContoursLoaded` does.

### Sampling

Bilinear, matching `terrainHeightAtPointSync` in behaviour: four corners, two
lerps, `null` outside the grid. A sample outside the grid ends that bearing's
march (§ 4).

### Caching

`drawGuns` runs on every frame, including every pointer move of a drag, and a
solve is ~1 ms per gun at these settings. Solving per frame is affordable but
wasteful, so each gun's ring is memoised on
`(mapId, weaponId, roundedX, roundedY)` with the position rounded to **8 m**.

8 m rather than the grid's own 32 m because `z_gun` enters every bearing: on
steep ground two points in the same 32 m cell can differ by ~20 m of height,
which is ~20 m of range — an error an order of magnitude above the 2.6 m p90
the grid spacing itself contributes (§ 5). Rounding finer than the data keeps
the memo from becoming the dominant error term.

The key includes `mapId`, so a stale entry can never be served to the wrong map
and no map-change hook is needed; `S.map` is assigned at three separate sites in
`events.js` and none of them is a natural place to hang invalidation. The cache
is bounded instead — oldest entry evicted past 256 — because a drag mints one
entry per 8 m of travel at ~2.9 KB each.

This bounds a drag to one solve per 8 m of travel, and makes the common case —
a stationary battery being panned and zoomed over — free.

---

## 7. Files

| File | Status | Responsibility |
|---|---|---|
| `scripts/lib/ballistics.mjs` | Modify | `maxRangeMeters(v, ΔZ)`, the § 3 closed form. Unit-tested. |
| `scripts/lib/ballistics.test.mjs` | Modify | Cover it, including agreement with `solveTan`'s discriminant. |
| `scripts/lib/heightfield.mjs` | Create | Grid geometry, quantise/dequantise, bilinear sample. Shared by the generator and its tests. |
| `scripts/lib/heightfield.test.mjs` | Create | Round-trip and sampling coverage. |
| `scripts/build-heightfield.mjs` | Create | Reads terrain chunks, writes the § 5 pair per map. |
| `package.json` | Modify | `build-heightfield` script; add the new test file to `test:scripts`. |
| `js/map/heightfield.js` | Create | Runtime load, decode, cache, bilinear sample. |
| `js/map/range-ring.js` | Create | The § 4 solve and the § 6 memo. |
| `js/map/guns-overlay.js` | Modify | `drawGunRangeRings` draws the ring when available, the circle otherwise. |
| 11 HTML shells | Modify | Two script tags. |
| `docs/terrain.md` | Modify | Document the new asset and that the ring reads it. |
| `docs/features.md` | Modify | Describe what the two outlines mean. |

`js/map/range-ring.js` and `js/map/heightfield.js` are new fork-only files for
the same reason `guns-overlay.js` and `contours.js` are: `renderer.js` keeps a
single guarded call and the merge surface against upstream stays one line.

---

## 8. Ozeti

The heightfield is generated for every map with a terrain manifest, so Ozeti
gets the asset. Its relief is 388 m against Bakurani's 1082 m, so expect
roughly a third of the effect.

Ozeti's coordinate alignment has never been visually validated — research § 3
of the sibling design, tracked in `docs/todo.md`. **The ring does not gate on
that**, and does not need to: an alignment error moves the ring's lobes to the
wrong bearings, which is a wrong *shape*, not a wrong number a user fires on.
The bounded worst case is the ring being as wrong as today's circle already is.
This is a materially weaker requirement than the MIL correction's, and the
reason this design can ship while the sibling waits on spotting shots.

---

## 9. Non-goals

- **Height-correcting the min-range ring.** At the SPG-2's 1390 mil ceiling the
  descent is near-vertical, so sensitivity is ~0.2 m per m — 100 m of relief
  moves min range by 20 m, well inside the ring's own line width. Not worth the
  second solve.
- **Disconnected reachable pockets** (§ 4). Real in 6 % of positions, but
  drawing them means drawing holes and islands, and a range ring that is not
  simply connected raises more questions than it answers.
- **Terrain obstruction / line of sight.** A ridge between gun and target
  blocks a shallow arc regardless of range. Dropped for the sibling design on
  2026-08-26 and dropped here for the same reason.
- **Extending the ring past `maxRange`** as a solid promise. That is
  `flatTableAuthoritative` going false, gated on the same in-game spotting
  shots as the sibling design § 8.
- **Changing any MIL, distance, or azimuth the app prints.** This design draws
  an overlay and nothing else.
- **Height-correcting the FOB build square** or any other `overlays.js` ring.

---

## 10. Evidence

Every figure above comes from a throwaway probe run on 2026-08-26 against the
shipped Bakurani heightfield — all 256 chunks decoded, rings solved at 360
bearings. Recorded in [ranked-ideas.md](../../ideas-research/ranked-ideas.md) item 5; the probe
itself was not kept.

| Claim | Measurement |
|---|---|
| Circle over-promises | worst-bearing shortfall p10/p50/p90 = 361 / 471 / 678 m, n = 120 positions |
| Circle rarely under-promises | worst-bearing overshoot p10/p50/p90 = 38 / 72 / 188 m |
| Ring is not a circle | spread p50 = 584 m |
| Shape, not noise | ~30 lobes / 360°, 4–8 m per 1° step |
| 32 m grid is enough | ring error vs 2 m data: 0.7 m median, 2.6 m p90, 22 m max |
| Solve is affordable | 2.25 ms/gun at 10 m march, 1.06 ms at 25 m, 0.58 ms at 50 m |
| Clamping is not free | bearings clamped: summit 100 %, flat inland 68 %, ridge 4 %, valley 0 % |
| Pockets are real but rare | 6 % of positions |
