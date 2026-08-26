# IDEAS — features other tools have that we don't

Gathered by surveying the mature artillery/map tools in adjacent games:
**SquadCalc** and **SquadMC** (Squad), **SquadMortarOverlay** and **Squad
Mortar Helper** (Squad, screen-capture), the **Foxhole Artillery Planner** and
**FoxholeHQ**, **EasyArty** and **hll-arty-map-calculator** (Hell Let Loose),
and the Arma Reforger fire-mission calculators.

Nothing here is committed work. Each entry says what the other tools do, what
we do today, and what it would cost us. Ordered by value for effort.

Unverified game values belong in [todo.md](../todo.md), not here. Where an idea
needs a measurement we don't have, it says so.

---

## Worth doing — the data is already in the repo

### 1. Correct the firing solution for elevation

 Partially done, missing data to complete low arc predictions with height corrections:

**They do:** SquadCalc extracts SDK heightmaps and auto-corrects elevation for
the height difference between weapon and target, so the MIL it prints already
accounts for ΔZ.

**We do it too, on Bakurani.** The printed MIL is corrected for ΔZ on every
arc — see [terrain.md](../terrain.md).

**Shipped.** The correction is live behind
`releasePolicy.automaticMilCorrection` in `data/ballistics/terrain-context.json`,
applied to every arc — mortar `single`, SPG-2 `low` and `high` — on Bakurani.
It is withheld, and captioned as withheld, for maps outside
`releasePolicy.correctedMaps` and for misses under 10 m. See
[the design doc](../superpowers/specs/2026-08-26-elevation-correction-design.md)
and [the plan](../superpowers/plans/2026-08-26-elevation-correction.md). What is
still switched off, and the fact that the projectile model has never been
checked against the game, are tracked in [todo.md](../todo.md).

**Researched — split the answer by arc, not by map.** Ignoring ΔZ costs the
mortar 3–13 m at short range but costs SPG-2 low-angle fire 200–400 m; the
heightmap is genuine game data, but its coordinate alignment is our inference
and shipped wrong once. The correction survives being badly wrong about drag on
the high-angle tables, so those can ship now; SPG-2 `low` is a coin flip until
someone takes four or five spotting shots. See
[ideas-research/01-terrain-heightmap.md](01-terrain-heightmap.md)
for the per-weapon miss table, how the impact angles were recovered from our
own tables, the provenance check, and the break-even analysis.

### 2. Impact rings at the target

**They do:** every tool in this space draws dispersion/spread radius and blast
radius around the impact point. SquadCalc frames it primarily as anti-teamkill
tooling, secondarily as damage optimisation.

**We do:** range rings around the *artillery* position and the FOB build
square, and nothing at all at the target.

**Cost:** the same overlay machinery as the existing rings
(`getRingConfig` / `drawRadiusSquare` in `js/map/overlays.js`). Blocked on
measured spread and blast values per weapon — that's a `todo.md` entry
whenever someone has the game open.

**Researched — this entry is on the wrong side of the heading.** Neither
dispersion nor blast is known, and dispersion's model is unknown as well, so
neither is a value someone can simply go measure. See
[ideas-research/02-impact-rings.md](02-impact-rings.md) for the
three rings this conflates, the per-weapon table-resolution figures, and the
two cheap checks to run before anyone schedules a firing range.

### 3. Contour / hypsometric terrain layer

Done

### 4. Shareable URL state

Wont do

### 5. PWA / offline

Wont do

---

## Workflow gaps — features, not data fixes

### 6. Spotter and corrections

Wont do

### 7. Multiple guns / battery

**They do:** HLL tools place up to 3 guns per team; the Foxhole planner is
multi-gun; Reforger calculators support multi-section batteries with **sheaf
patterns** and **time-on-target staggered firing**, where each gun fires at a
different moment so every round lands together.

**We do:** one Artillery position.

**Cost:** a data-model change — Artillery becomes a list, and the result panel
becomes per-gun. Sheaf and TOT are only reachable after that, and TOT also
needs idea 8.

**Researched — it is a server change too.** `sync/src/ops.js` validates
`point` against exactly `origin | target` and `sync/src/room.js` stores each as
a named meta column, so guns must become a collection and the Worker must be
redeployed — into shared rooms, with no protocol version to negotiate. Client
side it is ~110 `origin` references across 16 files plus a solution panel
duplicated in 11 HTML shells. See
[ideas-research/07-multiple-guns.md](07-multiple-guns.md).

### 8. Time of flight

**They do:** Reforger calculators return TOF alongside elevation and azimuth
so you can time your splash. It's also the precondition for time-on-target
firing and for an audible impact countdown.

**We do:** ballistic tables in `data/ballistics/` are `[distance, mil]` pairs.
No time dimension anywhere.

**Cost:** a third column in the tables. Stopwatch-measurable in-game, so it's
a `todo.md`-shaped data gap rather than a research problem.

**Researched — there is almost no data gap here.** TOF is derivable from the
tables we already ship, to within a few seconds. What's worth measuring is four
stopwatch readings, not a column, because that check also validates idea 1's
numbers. Build the readout for the SPG-2 (7.6 s → 32 s, and the arc choice is a
real trade-off); skip it for the mortar (15–17.5 s at every range). See
[ideas-research/08-time-of-flight.md](08-time-of-flight.md).

### 9. Named plans

**They do:** the Foxhole planner saves several named firing plans and reloads
them from a menu.

**We do:** saved targets, optionally with their artillery position.

**Cost:** moderate — saving a whole named scene (guns, targets, drawings,
layer state) is a superset of the saved-target storage we already have.

### 10. Terrain-aware max range ring

**They do:** nothing. No tool in the survey varies its range ring with the
gun's own elevation — every one of them draws a fixed circle. This entry comes
from a player asking why the ring does not change when the gun is on a hill.

**We do:** `drawGunRangeRings` in `js/map/guns-overlay.js` strokes
`weapon.maxRange` as a circle, per gun, with no terrain input at all.

**Cost:** no new physics — the ring *is* the vacuum model idea 1 already needs.
A shot is unreachable exactly when the § 4 discriminant `R² − 4k(ΔZ + k)` goes
negative, so the max-range locus is where it reaches zero. In closed form,
launching from height `h` above the impact point:

```
R_max(h) = (v/g) · sqrt(v² + 2gh)
```

Anchored on `v = sqrt(maxRange · g)`, `h = 0` reproduces today's circle exactly,
so the ring is a refinement of the current drawing rather than a replacement
for it. Sensitivity is about **1 m of range per 1 m of height**, damped to
roughly 0.7 by drag.

**Researched — the fixed circle over-promises by a median 471 m, and the fix is
a 234 KB file.** The ring is not a scaled circle: it is a fixed point per
bearing, `r = R_max(z_gun − z(θ, r))`, because how far you reach in a direction
depends on the ground you reach it over. Solved against the shipped Bakurani
heightfield at 120 random gun positions inside coverage, SPG-2:

| | p10 | p50 | p90 |
|---|---:|---:|---:|
| ring spread (max − min radius) | 420 m | 584 m | 784 m |
| worst-bearing shortfall vs 2629 m | 361 m | 471 m | 678 m |
| worst-bearing overshoot vs 2629 m | 38 m | 72 m | 188 m |

The error is strongly asymmetric. The circle we draw today rarely understates
reach, but on a typical Bakurani position it promises ~470 m of reach that is
not there on its worst bearing — the same optimistic failure direction as idea
1, on the same map, for the same reason. The finding survives the drag
uncertainty that gates idea 1: sweeping the impact angle at max range from 45°
to 60° moves the median shortfall only from 432 m to 277 m.

**It reads as a shape, not as noise.** About 30 lobes over 360°, one feature
per ~12°, and the radius moves 4–8 m between adjacent 1° bearings.

**The data cost is the part that looked fatal and is not.**
`js/features/terrain-ballistics.js` streams the two chunks a solution touches;
a 2.6 km ring sweeps roughly 36 of them, about 19 MB. Baking a coarse
heightfield the way `contours.json` is baked removes the problem:

| grid | uint16 size | ring error vs the 2 m data (med / p90 / max) |
|---|---:|---|
| 32 m | 234 KB | 0.7 / 2.6 / 22 m |
| 64 m | 59 KB | 1.8 / 6.1 / 38 m |

32 m is under half the size of the `contours.json` we already ship. Solving 360
bearings costs 2.25 ms per gun on that grid, or 0.58 ms at a 50 m march step —
affordable per gun on the idea 7 gun list.

**The open decision is clamping, and it is not free.** Drawing past `maxRange`
claims range the shipped table cannot produce a MIL for, against
`flatTableAuthoritative` in `terrain-context.json`. But clamping is not
harmless: on the map's summit **100 %** of bearings clamp and the ring collapses
back to exactly today's circle, discarding a ~690 m median gain — which is the
elevated-gun case that prompted the idea. Bearings clamped by position: summit
100 %, flat inland 68 %, mid-map ridge 4 %, valley floor 0 %. Three options, and
only the third needs a policy change:

1. Clamp the filled ring to `maxRange`, and draw the unclamped terrain reach as
   a faint advisory outline. Says "there is more range here" without printing a
   MIL for it.
2. Clamp only. Fully policy-safe; elevated positions see no change.
3. Extend past `maxRange` from the fitted model. A real
   `flatTableAuthoritative` change, gated on the same spotting shots as idea 1
   § 5.

**Two caveats.** 6 % of positions have disconnected reachable pockets beyond
the first ring edge — a valley floor behind a high shoulder — so the ring is an
outer boundary, not the whole reachable set. And these are Bakurani numbers;
Ozeti's relief is 388 m against Bakurani's 1082 m, so expect roughly a third of
the payoff there, on top of the alignment check Ozeti has not had.

---

## Probably not

**Screen-capture overlay.** SquadMortarOverlay and Squad Mortar Helper are
genuinely popular: a transparent window over the game that screenshots the
in-game map and aligns the calculator to it, with computer vision reading the
markers. It's a Windows desktop application. Out of reach for a GitHub Pages
static site, and a completely different distribution and trust story from a
web page.

**Position heatmaps.** SquadCalc logs up to 15,000 weapon positions per map
and per weapon to surface commonly used firing positions. It needs a backend
collecting player positions, which cuts against the Umami-only privacy posture
described in [analytics.md](../analytics.md).

**Ammo types, mils-unit conversion, faction/vehicle browsers.** Real features
elsewhere — Reforger tools carry HE/smoke/illumination tables and a NATO ↔
Warsaw mils converter; SquadCalc browses factions, units, and vehicle spawns.
All of it presupposes game content that `data/weapons.json` gives no sign of
yet. Revisit if Early Access adds shell types or a second angular unit.

---

## Related work already tracked elsewhere

The moving main zone is already in [todo.md](../todo.md): on Ozeti the Farmland
variant sits 531 m from Default, so on that rotation the circle we draw barely
overlaps the real one. None of the surveyed tools has this problem, but
SquadCalc's handling is the pattern to copy — capzones belong to the selected
layer, not to the map. Whatever variant picker that needs is the same picker.

---

## Sources

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
