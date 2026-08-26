# Research — idea 2, impact rings at the target

**TL;DR** — We can't draw impact rings today. Dispersion and blast are both
unknown, and dispersion's *shape* is unknown too, so neither is a number
someone can just go measure. Do two cheap checks first: (1) can whoever read
the game's `controlZones` also read a weapon config — that would settle
dispersion for free; (2) does the gun accept odd elevations or snap to 10-mil
detents — a one-minute in-game look that decides whether we have a ~50 m
precision floor we're currently hiding. Move idea 2 out of "the data is
already in the repo".

Backing notes for [ideas.md](ideas.md) § 2. Nothing here is committed work.
The question asked was blunt: *can we even know the impact rings?* The short
answer is no, not today, and the entry in `ideas.md` overstates how close we
are.

---

## The entry conflates three different quantities

"Impact rings" is not one ring. The tools we surveyed draw two, and there is a
third we invented while looking into this. They have nothing in common except
where they are centred.

| Ring | What it is | Depends on | Known? |
|---|---|---|---|
| Dispersion | shot-to-shot scatter around the aim point | the game's firing model | no — shape unknown |
| Blast | how far from the crater the shell hurts | the shell + what it hits | no |
| Table resolution | how finely we can *aim* at all | our own tables + the gun UI | partly — see below |

Only the third is reachable from data in the repo, and it is the least useful
of the three.

---

## Dispersion — unknown, and the unknown is structural

There is no dispersion figure anywhere in the repo. `data/weapons.json` and
`data/ballistics/` carry `[distance, mil]` pairs and nothing else; no time
dimension, no scatter term, no per-shot variance.

The problem is not that we lack a number. It is that we do not know **which
model to measure**, and the three candidates draw three different rings:

1. **No randomness.** Rounds land where the solution says. All observed
   scatter comes from the player's aim and from table resolution below.
2. **Fixed cone.** A constant angular error applied per shot, so the ring grows
   linearly with range.
3. **Range-dependent.** Scatter that grows with time of flight or charge, which
   is neither constant nor linear in range.

Measuring this means firing many rounds at one *fixed, untouched* solution and
plotting where they land. It is the most expensive measurement anyone has
proposed for this project, and it is easy to do badly — any aim adjustment
between shots contaminates the sample, so the gun has to be laid once and left
alone, with impacts recorded from a spotter position.

**Check the cheap path first.** The main-zone values in `todo.md` came from the
game's own `controlZones` / `controlZoneRadius`. Whoever had access to read
that may be able to read a weapon config too, which would settle the model and
the number without firing anything. That check costs minutes; the firing range
costs a session. Do them in that order.

---

## Blast — also unknown, and it is not a single number

`grep -riE "blast|splash|damage|lethal"` across `data`, `config`, `maps`, and
`js` returns nothing. We have never had this value.

It is tempting to call this the easy one — walk away from a crater until the
damage stops. It is not. Blast is a falloff curve, not a radius, and it differs
by target:

- infantry standing vs prone vs in cover
- vehicles vs infantry
- structures and deployables

So before measuring, someone has to decide **which radius the ring means**.
The candidates are the instant-kill radius, the any-damage radius, and the
"do not stand here when friendly rounds are inbound" radius, and they are not
the same circle. SquadCalc frames its ring as anti-teamkill tooling, which
argues for the outermost — but a ring drawn to the outermost radius is
useless for the damage-optimisation half of the feature.

The measurement itself needs a second cooperative player standing at marked
distances taking repeated hits. That is a two-person scheduled test, closer in
cost to the dispersion work than to tape-measuring the FOB square.

---

## Table resolution — computable now, but gated on a UI question

This one is not about the game's firing model at all. It is about how finely
the gun can be laid, which sets a floor on precision that no amount of good
aim gets under.

Every table in `data/weapons.json` is sampled at exactly 10-mil intervals —
the only mil step present in any of the three tables is 10. Converted to
metres of range per 10-mil step:

| Weapon / arc | Range band | Metres per 10-mil step |
|---|---|---|
| Mortar (single) | 80–203 m | 3–12 (avg 7.5) |
| | 203–326 m | 9–11 (avg 10.1) |
| | 326–450 m | 8–10 (avg 8.9) |
| | 450–573 m | 6–8 (avg 7.3) |
| | 573–697 m | 4–7 (avg 5.2) |
| SPG low arc | 1181–1470 m | 49–51 (avg 50.2) |
| | 1470–1760 m | 41–47 (avg 44.3) |
| | 1760–2049 m | 32–40 (avg 35.9) |
| | 2049–2339 m | 22–31 (avg 26.2) |
| | 2339–2629 m | 1–21 (avg 10.7) |
| SPG high arc | 735–1113 m | 42–45 (avg 43.5) |
| | 1113–1492 m | 37–41 (avg 39.2) |
| | 1492–1871 m | 31–37 (avg 33.5) |
| | 1871–2250 m | 22–31 (avg 26.3) |
| | 2250–2629 m | 2–22 (avg 11.8) |

Both weapons are least precise at their near end and tighten as they approach
maximum range, which is the expected shape — the trajectory flattens, so a mil
buys less ground.

### The gate

`interpolateBallisticTable` in `js/features/weapons.js:135` interpolates
linearly between table entries and `js/features/results.js:17` rounds the
result to a whole mil. So the app already tells the player to dial, say, 437
mil — a value the table never sampled.

Whether that instruction is followable is unverified. Two cases:

- **The gun accepts continuous (or 1-mil) elevation.** Then the only error is
  our linear interpolation across a 10-mil chord. Measured from the tables by
  interpolating each entry from its two neighbours, the worst midpoint error
  across a *20*-mil chord is 1.5 m (mortar at 140 m; SPG low at 2014 m), median
  0.5 m. The error is second-order, so over the 10-mil chord we actually
  interpolate it is roughly a quarter of that — well under a metre. There is no
  ring worth drawing.
- **The gun snaps to 10-mil detents.** Then the full step above applies, the
  app's 437-mil instruction is unfollowable, and the SPG carries a ~50 m
  precision floor at close range that we currently hide from the player.

These two cases differ by a factor of a hundred. **Which one is true is a
one-minute in-game observation** — open the gun, try to set an odd elevation,
see whether it takes — and it is the single cheapest unknown in this document.
It is worth answering even if impact rings are never built, because the second
case means the rounded MIL in the result panel is lying.

### Shape, if it is ever drawn

This ring is not a circle. Range error dominates by an order of magnitude:
azimuth is displayed to 0.1° (`js/features/results.js`), which at the SPG's
2629 m maximum is 4.6 m of lateral error and at the mortar's 684 m is 1.2 m.
Against a 50 m range step that is an ellipse elongated along the line of fire,
and drawing it as a circle would misrepresent it in both axes. (The in-game
traverse resolution is itself unverified, so 0.1° is our display precision, not
a measured game value.)

---

## Side observation, unrelated to rings

The mortar's declared elevation limits and its table disagree.
`data/weapons.json` gives `minElevationMil: 150` / `maxElevationMil: 850`, but
the `single` table runs from 950 mil (at 80 m) down to 120 mil (at 697 m) —
past both ends. Similarly `minRangeKm: 0.132` / `maxRangeKm: 0.684` against a
table spanning 80–697 m. `js/features/weapons.js` treats range limits and table
coverage as separate concerns deliberately (documented in
[features.md](../features.md) § MIL firing solutions), so this may be intended
headroom rather than a bug — but nothing states which limit the game actually
enforces.

---

## Where this leaves idea 2

The entry sits under *"Worth doing — the data is already in the repo"*. That
heading is wrong for two of its three rings, and misleading for the third.
Suggested split:

- **Dispersion** — its own `todo.md` entry, stating the model question, not
  just the number. Gated on the config-read check first.
- **Blast** — a `todo.md` entry that names which radius we mean before anyone
  schedules the test.
- **Table resolution** — blocked on the one-minute detent observation, and
  worth doing for the MIL display's sake regardless.

Nothing about impact rings can be labelled "where the round will land" until
dispersion is settled. Until then the only honest ring is a precision floor,
which is not what the other tools are drawing.
