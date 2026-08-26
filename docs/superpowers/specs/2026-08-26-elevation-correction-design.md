# Design — automatic elevation correction (idea 1)

Backing research: [ideas-research/01-terrain-heightmap.md](../../ideas-research/01-terrain-heightmap.md).
Entry: [ideas.md](../../ideas-research/ideas.md) § 1.

**Shape of the feature.** When the target sits above or below the gun, the MIL
the app prints already accounts for it. Today it does not: we sample terrain at
both points, display `ΔZ +140 m`, and print the flat-ground table value beside
it — which a user may reasonably read as already corrected.

The correction ships on the **high-angle tables only** (mortar `single`, SPG-2
`high`). SPG-2 `low` stays on the flat table behind an explicit caption. That
split is § 5 of the research doc, not a hedge invented here.

---

## 1. The safety property everything else hangs off

**The correction is a differential from a model, added to the table. The table
stays authoritative.**

```
mil_shown(R, ΔZ) = table(R) + [ model(R, ΔZ) − model(R, 0) ]
```

Not `model(R, ΔZ)`. The bracketed term is exactly zero when `ΔZ = 0`, so on
flat ground the output is bit-identical to today's. The model never replaces
the game's own measured range/mil pairs; it only supplies the *difference*
between two of its own points, which cancels most of its absolute error.

This matters because the model is currently a vacuum fit to our own tables
(§ 4), and will be replaced wholesale on 2026-09-10 (§ 8). A design where a
wrong model silently degrades flat-ground fire would be unacceptable. This one
cannot: flat ground is untouched by construction.

There is no projectile logic in the app today to break. The entire runtime
ballistics path is `interpolateBallisticTable` in `js/features/weapons.js:134`,
a linear interpolation between adjacent rows of the shipped table. This design
does not modify that function, and `getWeaponElevationSolutions` keeps its
current signature and behaviour.

---

## 2. Arc policy

| Weapon | Arc | Corrected? | Why |
|---|---|---|---|
| Mortar | `single` | **yes** | § 5 break-even margin 4–15° |
| SPG-2 | `high` | **yes** | § 5 break-even margin 5–15° |
| SPG-2 | `low` | **no** | § 5: vacuum says 13° impact, break-even is 25°, drag could land either side |

An uncorrected arc is not silently uncorrected. When the solution panel shows a
low-arc value with a non-trivial ΔZ, it carries a caption saying elevation is
not compensated on this arc. Per § 5 of the research, shipping a coin-flip
correction with no caption is the one outcome worse than the status quo,
because it removes the user's reason to distrust the number.

In the correction grid file, an uncorrected arc is `null` — deliberately
absent, distinguishable from missing data.

---

## 3. Unreachable targets

A shallow arc has a low apex. The SPG-2 low arc at 1181 m peaks 71 m above the
muzzle, so a target 100 m higher is not reachable on that arc at that range at
all — the shell is already descending when it passes the target's altitude.

The solver returns `null` for these, the grid stores `null`, and the runtime
treats a `null` corner exactly as it treats missing data: no correction, flat
table, caption. `interpolateHeightCorrection`
(`js/features/terrain-ballistics.js:865`) already returns `null` unless all four
bilinear corners are finite, so this needs no new runtime branch.

Distinguishing "unreachable" from "out of coverage" in the UI is a non-goal for
this change.

---

## 4. The model

A vacuum trajectory, with elevation angle affine in mil:

```
θ(mil) = a + b · mil          (degrees)
R(θ)   = v² · sin(2θ) / g
```

`a`, `b`, `v` are fitted per weapon and arc by least squares against
`data/weapons.json`. Current values, RMS against the shipped tables:

| Weapon | Arc | a (deg) | b (deg/mil) | v (m/s) | RMS |
|---|---|---:|---:|---:|---:|
| mortar | single | 52.50 | 0.03750 | 86.7 | 8.1 m |
| spg | high | 14.50 | 0.04800 | 160.4 | 8.1 m |
| spg | low | 12.75 | 0.05800 | 160.1 | 14.1 m |

**These parameters are known to be an approximation, and the repo should say
so.** Fitting both SPG arcs jointly gives RMS 35 m against 8–14 m fitted
separately, and the two arcs want different mil→degree slopes (17.2 vs 20.8
mil/deg). One physical gun cannot have two conversions; that spread is the
vacuum fit absorbing drag differently on each branch. Drag is real and
material. This is why the low arc is not corrected, and why § 8 exists.

### The solve

For a target at horizontal range `R` and height `ΔZ`, find the launch angle
whose trajectory passes through `(R, ΔZ)`. With `t = tan θ` and
`k = gR² / 2v²`:

```
k·t² − R·t + (ΔZ + k) = 0
t = [ R ± √(R² − 4k(ΔZ + k)) ] / 2k
```

Take `+` for a high-branch arc (mortar `single`, SPG `high`), `−` for a
low-branch arc. A negative discriminant means unreachable (§ 3).

This is an exact solve within the model, not the `ΔZ / tan θ` approximation the
research doc used for its estimates. It agrees with the doc where the
approximation is good — SPG-2 high at 1800 m with ΔZ +100 m gives a 41 m miss
against the doc's 40 m — and is more accurate where it is not.

### The miss figure

Separately from the correction, the generator computes how far the *uncorrected*
shot lands from the target: the horizontal distance at which the flat-aimed
trajectory descends through altitude `ΔZ`, subtracted from `R`. This is what the
suppression threshold gates on, because metres of miss is the quantity a player
can act on, and mil-per-metre differs per weapon and range.

---

## 5. Suppression threshold

Below **10 metres** of computed miss, no correction is applied and the display
is unchanged. Per § 4 of the research, the mortar's short-range band is 3–13 m,
inside the shell's own dispersion, and correcting it shows churn the player
cannot act on.

The threshold is applied at **runtime**, not baked into the grid, so it stays a
single tunable number and so bilinear interpolation never straddles a baked
discontinuity. It lives in `data/ballistics/terrain-context.json` as
`releasePolicy.suppressionMissMeters`.

---

## 6. The gate

Three flags in `data/ballistics/terrain-context.json` describe the current
release policy — `releasePolicy.automaticMilCorrection`,
`releasePolicy.flatTableAuthoritative`, and `calibration.ready`. **Only
`calibration.ready` is read today, and it only emits a console warning
(`terrain-ballistics.js:462`); it gates nothing.** The actual gate is a
hardcoded return at `terrain-ballistics.js:980` with a
`RELEASE SAFETY INVARIANT` comment.

This design makes `releasePolicy.automaticMilCorrection` a real gate and
removes the hardcoded invariant. **It ships set to `false`.** Every task in the
plan is inert scaffolding until that one value flips, which happens in § 8.

Gate off ⇒ `getTerrainBallisticSolutions` returns `context.solutions` by
reference, unchanged, exactly as today.

---

## 7. File formats

### `data/ballistics/projectile-model.json` (new, generated, committed)

```json
{
  "schema": "wardogs-projectile-model-v1",
  "source": "vacuum-fit",
  "sourceNote": "Least-squares vacuum fit to data/weapons.json. Superseded by pak extraction; see docs/superpowers/specs/2026-08-26-elevation-correction-design.md § 8.",
  "generatedAt": "2026-08-26",
  "gravity": 9.81,
  "weapons": {
    "mortar": {
      "single": { "branch": "high", "muzzleVelocity": 86.7, "angleOffsetDeg": 52.50, "anglePerMilDeg": 0.03750, "rmsMeters": 8.11 }
    },
    "spg": {
      "high": { "branch": "high", "muzzleVelocity": 160.4, "angleOffsetDeg": 14.50, "anglePerMilDeg": 0.04800, "rmsMeters": 8.11 },
      "low":  { "branch": "low",  "muzzleVelocity": 160.1, "angleOffsetDeg": 12.75, "anglePerMilDeg": 0.05800, "rmsMeters": 14.11 }
    }
  }
}
```

`spg.low` is present here — the model knows the arc — but absent from the
correction grid, which is where policy lives.

### `data/ballistics/height-correction.json` (new, generated, committed)

```json
{
  "schema": "wardogs-height-correction-v1",
  "generatedFrom": "data/ballistics/projectile-model.json",
  "modelSource": "vacuum-fit",
  "generatedAt": "2026-08-26",
  "weapons": {
    "mortar": {
      "single": {
        "distancesMeters": [132, ...],
        "deltaZMeters": [-800, -750, ...],
        "milCorrections":    [[...], ...],
        "missMeters":        [[...], ...]
      }
    },
    "spg": {
      "high": { "distancesMeters": [...], "deltaZMeters": [...], "milCorrections": [[...]], "missMeters": [[...]] },
      "low": null
    }
  }
}
```

- Both matrices are indexed `[deltaZ index][distance index]`, matching the
  layout `interpolateHeightCorrection` already expects.
- `null` entries mark unreachable (§ 3).
- `low: null` marks a deliberately uncorrected arc (§ 2).
- 40 distance samples spanning each arc's own min/max range; 33 ΔZ samples from
  −800 m to +800 m in 50 m steps. Research § 2 measures p99 ΔZ at 642 m over
  2629 m of separation, so ±800 m covers observed terrain. The correction is
  near-linear in ΔZ, so 50 m steps are comfortably inside bilinear error.

### `data/ballistics/terrain-context.json` (modified)

```json
"releasePolicy": {
  "automaticMilCorrection": false,
  "flatTableAuthoritative": true,
  "suppressionMissMeters": 10,
  "heightCorrection": "data/ballistics/height-correction.json",
  "reason": "..."
}
```

---

## 8. The 2026-09-10 swap

`docs/todo.md:56-58` records that the game's paks
(`Wardogs/Content/Paks/pakchunk0-WindowsClient.*`, signed IoStore) are not on
disk, and that Early Access restores them on **2026-09-10**.

At that point the projectile's real parameters — muzzle velocity, gravity
scale, and any drag term — are a single asset read, and impact angle becomes
exact rather than fitted. The swap is deliberately scoped to one file:

1. Rewrite `data/ballistics/projectile-model.json` with `source: "pak-extract"`
   and the real values. If the projectile carries drag, the model gains a drag
   term and the solver gains a numerical integration path; the *interfaces* in
   § 4 do not change.
2. Re-run the grid generator.
3. Re-evaluate SPG-2 `low` against § 5's break-even. With an exact impact angle
   the coin flip resolves; if it clears, drop the `null` and the caption.
4. Flip `releasePolicy.automaticMilCorrection` to `true`.
5. Take four or five in-game spotting shots as **validation of the extracted
   model**, not as the primary source.

Everything in the implementation plan is built before that date and none of it
is thrown away by it. Only the two generated JSON files are regenerated.

Holding the flip until then avoids changing the MIL people aim with twice
inside two weeks. If Early Access slips, the flag can be flipped on the
vacuum-fit grid for the high-angle arcs at any time, which is the § 5
recommendation and a strictly better position than today.

---

## 9. Ozeti

Research § 3 notes Bakurani's coordinate alignment was validated by a visual
overlay after the Y-flip fix in `5c462a173`, and Ozeti's never was. Alignment
is per-map and independent of everything above.

This design does **not** gate the correction per map. The alignment check is
tracked separately in `docs/todo.md`, and must be resolved before § 8 step 4.
If it is unresolved on 2026-09-10, gate to Bakurani at the per-config check in
`terrain-ballistics.js` rather than delaying the flip.

---

## 10. Non-goals

- **Terrain obstruction.** Dropped 2026-08-26; see research § 0.
- **Ground slope at the target.** Not modelled and not needed — the angle that
  matters is the shell's descent angle, not the terrain's.
- **Buildings and mesh geometry.** The heightfield is Landscape-only (research
  § 3). A rooftop target gets the ground's ΔZ. Bounded error, not a blocker.
- **Vehicle tilt.** Already covered by the existing SPH-2 levelling warning.
- **Changing `interpolateBallisticTable` or the shipped tables.**
- **Time of flight** (idea 8), even though § 8's asset read would supply it.
