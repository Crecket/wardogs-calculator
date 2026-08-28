# Research — idea 8, time of flight

**TL;DR** — TOF is not a data gap. It is **derivable from the tables we already
ship**, to within a few seconds, with no in-game measurement at all. What is
worth measuring is **one shot per weapon per arc — four stopwatch readings, not
a 223-row column** — because that single check either validates or destroys the
ballistic model that idea 1's entire miss table also rests on. Since idea 1 § 5
was added, one of those four readings — **SPG-2 low arc** — has a second job:
it is the cheapest available bound on the drag error that decides whether the
elevation correction can ship on that arc at all. Build the
readout for the **SPG-2**, where TOF swings 7.6 s → 32 s and the arc choice is
a real decision; skip it for the mortar, where it is 15–17.5 s at every range
and tells the player nothing.

**Status: recommendation 5 is shipped, with one deviation.** The readout is
live (`js/features/flight-time.js`, covered by `test/flight-time.mjs`), derived
exactly as § 1 describes. It is **not** suppressed for the mortar as § 2
argues: the mortar is the default weapon, so hiding it there hid the feature
from anyone who never changed weapons, and a near-constant number still beats
no number. § 2's reasoning stands — the mortar badge simply earns less than the
SPH-2's.
Recommendations 1 through 4 — the four stopwatch readings — are still open, and
are tracked in [todo.md](../todo.md). Nothing below has been revised by
shipping; the numbers in § 2 are what the app now computes.

Backing notes for [ideas.md](ideas.md) § 8. Nothing here is committed work.
The entry currently calls TOF "a third column in the tables, stopwatch-
measurable in-game, so a `todo.md`-shaped data gap rather than a research
problem." That framing is wrong in a useful direction: the column is mostly
free, and the measurement is worth far more than the column.

---

## 1. TOF falls out of the tables

`data/weapons.json` stores `[distance, mil]` pairs and no time dimension. But
fitting a vacuum model `R = v²·sin(2θ)/g` to those pairs recovers both the
muzzle velocity and the launch angle (this is the same fit described in
[01-terrain-heightmap.md](01-terrain-heightmap.md) § 2, done there to get impact
angles):

| Weapon | Arc | Fitted muzzle velocity | RMS error vs. table |
|---|---|---:|---:|
| Mortar | single | 86.4 m/s | 8.1 m |
| SPG-2 | low | 160.0 m/s | 13.8 m |
| SPG-2 | high | 160.2 m/s | 7.4 m |

Once `v` and `θ` are known, `TOF = 2·v·sin(θ)/g` — no new data required.

---

## 2. Derived time of flight

| Weapon | Arc | Range | Launch angle | **TOF** | Apex |
|---|---|---:|---:|---:|---:|
| Mortar | — | 132 m | 85° | 17.5 s | 378 m |
| Mortar | — | 200 m | 82° | 17.5 s | 374 m |
| Mortar | — | 400 m | 74° | 16.9 s | 352 m |
| Mortar | — | 600 m | 64° | 15.8 s | 307 m |
| Mortar | — | 684 m | 58° | 14.9 s | 274 m |
| SPG-2 | low | 1181 m | 13° | 7.6 s | 71 m |
| SPG-2 | low | 1600 m | 19° | 10.6 s | 137 m |
| SPG-2 | low | 2000 m | 25° | 13.8 s | 233 m |
| SPG-2 | low | 2400 m | 33° | 18.0 s | 396 m |
| SPG-2 | low | 2600 m | 43° | 22.1 s | 597 m |
| SPG-2 | high | 780 m | 81° | 32.2 s | 1275 m |
| SPG-2 | high | 1200 m | 76° | 31.7 s | 1232 m |
| SPG-2 | high | 1800 m | 68° | 30.3 s | 1125 m |
| SPG-2 | high | 2400 m | 57° | 27.2 s | 909 m |
| SPG-2 | high | 2600 m | 47° | 24.0 s | 708 m |

### What the numbers say

**The mortar's TOF is nearly a constant.** 14.9 s to 17.5 s across its entire
132–684 m envelope — a 2.6 s spread. A live TOF readout for the mortar would
sit near "about 17 s" no matter where the player clicks. That is not
information, and it is a good reason not to build the feature for both weapons
just because the other tools do.

The reason is the high branch: shorter range means a *steeper* shot, and the
extra climb almost exactly cancels the shorter flight. TOF is not monotonic in
range the way players expect, which is itself worth a note in the UI if it ever
ships.

**The SPG-2's arc choice is the real finding.** At the same range the two arcs
differ by a factor of two to three:

| Range | Low arc | High arc | Difference |
|---:|---:|---:|---:|
| 1800 m | 12.1 s | 30.3 s | 18.2 s |
| 2400 m | 18.0 s | 27.2 s | 9.2 s |

That is a genuine tactical trade-off the tool could surface and currently does
not: the low arc puts rounds on target in a third of the time, the high arc
clears terrain the low arc would hit.

Idea 1 § 5 adds a second term to that same trade-off. If its recommendation is
followed — elevation correction on the high tables, flat table plus a caption on
SPG-2 `low` — then the two arcs differ in **accuracy guarantee** as well as in
time: the high arc arrives three times slower but compensated,
the low arc fast but uncorrected. That is the strongest argument yet for
surfacing the two arcs side by side rather than as a toggle, since the choice is
now two-dimensional and no single number orders it.

Note also that below 1181 m the low table has no coverage at all (`low` spans
1181–2629 m, `high` spans 735–2629 m) while the weapon's stated minimum is
780 m. Inside 780–1181 m the high arc is the only option, so the trade-off
simply does not exist there.

**Apex heights are large.** The SPG-2 high arc peaks above 1200 m. If a
projectile-path visualisation is ever built, it needs to be scaled for that.

---

## 3. What one stopwatch reading is actually worth

Two independent uncertainties sit under every number above. A measurement
resolves them in very different amounts.

### The branch assumption — settled by a single shot

`sin(2θ)` is symmetric about 45°, so range alone cannot say whether a table is
the shallow or the steep solution. Section 1 resolves it by convention (the
SPG's `high` table carries uniformly higher mil values, so higher mil means
higher angle, and the mortar's single table reads as the high branch on the
same convention). That is an inference, not a measurement — and TOF is
extraordinarily sensitive to it:

| Range | If high branch | If low branch |
|---:|---:|---:|
| 200 m | 17.5 s | 2.3 s |
| 400 m | 16.9 s | 4.8 s |
| 684 m | 14.9 s | 9.3 s |

There is no ambiguity in a stopwatch here. **One mortar shot at short range
distinguishes 17.5 s from 2.3 s beyond any doubt.** And because idea 1's entire
miss table is computed from the same branch assumption, that one shot validates
or destroys those numbers too. It is the single highest-value measurement
available anywhere in this document.

### The velocity fit — narrows, does not settle

Assuming the branch is right, a ±5% error in the fitted muzzle velocity moves
the derived TOF by:

| Case | −5% | fitted | +5% | spread |
|---|---:|---:|---:|---:|
| Mortar 400 m | 15.9 s | 16.9 s | 17.9 s | 2.0 s |
| Mortar 684 m | 12.4 s | 14.9 s | 16.4 s | 4.1 s |
| SPG low 1800 m | 13.1 s | 12.1 s | 11.4 s | 1.7 s |
| SPG high 1800 m | 28.1 s | 30.3 s | 32.3 s | 4.2 s |

So derived TOF carries an error bar of roughly ±2–4 s. That is:

- **good enough to display** — "≈ 30 s" versus "≈ 12 s" is the decision the
  player is making, and a 3 s error does not change it;
- **not good enough for time-on-target staggering** ([idea 7](ideas.md#7-multiple-guns--battery)),
  which needs sub-second agreement between guns to be worth doing at all.

A handful of real measurements would tighten `v` and close that gap. But TOT
depends on multi-gun support that does not exist yet, so this is not urgent.

### Drag

The whole model is vacuum. The fitted velocities are vacuum-equivalent values
tuned to reproduce our range tables, so derived TOF is self-consistent with
those tables by construction, but real drag will pull the true figures off in a
way this method cannot predict. This is the residual that only measurement
closes, and another reason to treat the derived column as a display value
rather than a precision instrument.

**Since idea 1 § 5, this residual has a price tag.** That section shows the
elevation correction improves the average shot only while `k` — estimated
correction ÷ true correction — stays under 2, and that `k` is driven entirely by
how far drag steepens the real impact angle away from the vacuum `θ`. Drag is no
longer just a caveat on the TOF column; it is the quantity that decides whether
idea 1 ships on the SPG-2 low arc.

TOF is a useful probe of it because **it is an observable the fit never used**.
Range is reproduced by construction — that is what `v` was fitted to — so range
agreement tells us nothing. Time is free information. If measured TOF lands
inside the ±2–4 s bar above, the real trajectory is close to the vacuum one and
`θ_impact` cannot have moved far, which puts `k` near 1 and clears the low arc.

Be honest about the asymmetry, though: this is a **sharp instrument for the
branch question and a blunt one for drag**. The branch test in § 3 discriminates
17.5 s from 2.3 s and cannot be misread. The drag test discriminates 7.6 s from
perhaps 9 s on the SPG low arc, which is inside stopwatch-plus-reaction-time
error on a single reading. So a *match* is decent evidence for small `k` and a
*mismatch* flags a problem without quantifying it. Pinning `k` properly still
needs idea 1 § 5's fall-of-shot measurement on known-ΔZ pairs. The TOF reading
is worth taking first because it is nearly free and shares a trip to the game,
not because it substitutes for that.

---

## 4. Recommendation

1. **Take four stopwatch readings** — mortar, SPG low, SPG high, plus one
   repeat — the next time anyone has the game open. Not a table, four numbers.
   Compare against § 2. This is a `todo.md` entry, and its real payload is
   validating idea 1. Take the **mortar short-range** reading first (it settles
   the branch, on which everything else rests) and the **SPG low** reading with
   the most care, since it is the one carrying the drag question.
2. **If they match, derive the column.** No further measurement needed; TOF
   becomes a computed field, not stored data, and `data/weapons.json` needs no
   third column at all.
3. **If they do not match**, the branch or the velocity is wrong, and
   [01-terrain-heightmap.md](01-terrain-heightmap.md) §§ 2 and 5 must both be
   recomputed before any of their conclusions are acted on — including § 5's
   clearance for the high-angle tables, which assumes the same fitted `θ`.
4. **While the game is open, add the fall-of-shot readings** from
   [01-terrain-heightmap.md](01-terrain-heightmap.md) § 5 — a handful of
   Bakurani gun/target pairs with large ΔZ. Different measurement, same trip,
   and it is the one that actually bounds `k`. Neither idea needs its own
   session.
5. **Ship the readout for the SPG-2 only.** Show TOF per arc, side by side, so
   the arc selector shows what the choice costs — and, if idea 1 § 5 ships,
   alongside the correction status per arc (§ 2). Suppress it for the mortar, or
   show it as a static "≈ 17 s" — a live readout there implies a precision the
   number does not have and a variability the weapon does not have.

---

## Reproducing this

Throwaway scripts, not committed. `TOF = 2·v·sin(θ)/g` with `θ` from
`sin(2θ) = R·g/v²`, taking the branch per § 3, and `v` from the fit described
in [01-terrain-heightmap.md](01-terrain-heightmap.md) § 2 over the tables in
`data/weapons.json`.
