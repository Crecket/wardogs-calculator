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

**Shipped on every arc, Bakurani only.** SPG-2 `low` was enabled on
2026-08-27; what is still switched off, and the fact that the projectile model
has never been checked against the game, are tracked in
[todo.md](../todo.md).

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

**Shipped.** Artillery is a list: `js/features/guns.js` holds the model,
`js/map/guns-overlay.js` draws each gun with its own range rings and target
line, and the room carries a `guns` table with `gun.add` / `gun.move` /
`gun.weapon` / `gun.remove` ops (`sync/src/room.js`, `sync/src/ops.js`), capped
at `LIMITS.guns` = 8. The migration is additive, so a client predating guns
still works against a room that has them — `sync/test/guns.mjs` asserts exactly
that, alongside `test/guns-*.mjs` for the client half.

**Still open from the original entry:** sheaf patterns, and time-on-target
staggered firing. TOT needs idea 8.

### 8. Time of flight

**Shipped for the SPH-2, derived rather than stored.** `js/features/flight-time.js`
computes it from the fitted vacuum model — `θ = angleOffsetDeg + anglePerMilDeg
× mil`, then `t = (v sinθ + √((v sinθ)² − 2g Δz)) / g` — using the MIL actually
on screen, so a terrain-corrected MIL gets the time that belongs to it and Δz
comes free from the same correction. `data/weapons.json` needed no third column
after all.

The readout is a badge row under the metric grid — one badge per arc, labelled
with that arc's own name where there is a choice to label. It started as a
third line inside the MIL card and moved out: at the card's 8 px sub-line the
seconds could not be read.

**Recommendation 5 said to suppress the mortar; we ship it anyway.** The
research is right that 14.9–17.5 s across the whole envelope carries almost no
information — but the mortar is the default weapon, so suppressing it meant the
feature was invisible until you switched weapons, and "roughly 17 seconds" is
still the answer to a question players ask. It shows as one unlabelled badge.

**What is still unmeasured:** everything. The seconds rest on the same
unvalidated fit and high-branch assumption as idea 1, carry roughly ±2–4 s, and
are printed with a `≈` for that reason. Four stopwatch readings settle it —
see [todo.md](../todo.md) and
[ideas-research/08-time-of-flight.md](08-time-of-flight.md) § 3.

**Not reachable yet:** time-on-target staggered firing needs sub-second
agreement between guns, which a ±2–4 s derivation cannot give. That waits on
real measurements, not on more code.

### 9. Named plans

**They do:** the Foxhole planner saves several named firing plans and reloads
them from a menu.

**We do:** saved targets, optionally with their artillery position.

**Cost:** moderate — saving a whole named scene (guns, targets, drawings,
layer state) is a superset of the saved-target storage we already have.

### 10. Terrain-aware max range ring

**Shipped, and no other tool in the survey does it.** Every gun's ring is now
solved against the terrain rather than stroked as a circle:
`js/map/range-ring.js` marches `RANGE_RING_BEARINGS` rays over the baked
heightfield and bisects each one for the bearing where
`R_max(z_gun − z(θ, r))` stops covering the distance travelled.

**The open decision went to option 1.** The filled ring is clamped to the
weapon's declared `maxRange`, and where the terrain gives more than that, the
surplus is drawn as a separate tinted band with its own outline
(`drawGunRangeRings` in `js/map/guns-overlay.js`). So an elevated gun sees the
reach it actually has, and nothing inside the filled ring claims a shot the
shipped table cannot produce a MIL for. `flatTableAuthoritative` in
`data/ballistics/terrain-context.json` is untouched.

**What the research predicted, for the record.** Against the shipped Bakurani
heightfield at 120 random gun positions, SPG-2:

| | p10 | p50 | p90 |
|---|---:|---:|---:|
| ring spread (max − min radius) | 420 m | 584 m | 784 m |
| worst-bearing shortfall vs 2629 m | 361 m | 471 m | 678 m |
| worst-bearing overshoot vs 2629 m | 38 m | 72 m | 188 m |

The circle we used to draw rarely understated reach, but on a typical position
it promised ~470 m that was not there on its worst bearing. The finding
survived the drag uncertainty that gates idea 1: sweeping the impact angle at
max range from 45° to 60° moved the median shortfall only from 432 m to 277 m.
The 32 m grid the ring reads is baked by `npm run build-heightfield` — 234 KB,
under half the size of the `contours.json` already shipped.

**Two caveats that still hold.** 6 % of positions have reachable pockets beyond
the first ring edge — a valley floor behind a high shoulder — so the ring is an
outer boundary, not the whole reachable set. And these are Bakurani numbers:
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
