# Apply the firing-range measurements

**Source of truth:** `docs/firing-range-measurements.md`. Read it first and in full. It holds 33 in-game shots taken on 2026-09-02 — every coordinate, bearing, computed range, video-derived flight time, and the reasoning behind which shots are usable. Everything below is a summary of what those measurements mean; where this brief and the measurements doc disagree, the measurements doc wins.

**This brief deliberately does not tell you how to implement anything.** No file list, no task breakdown, no code. Work out the approach yourself from the codebase — the point of the handoff is the data and the conclusions, not a script to follow.

## Why this exists

Nothing in this project's ballistics had ever been checked against the game. `data/ballistics/projectile-model.json` is a least-squares vacuum fit to our own firing tables, and those tables were themselves unverified — so the pipeline had only ever been validated against itself. It now has real data.

The weapon is **SPH-2** (`id: "spg"`), confirmed. The mortar is the mortar.

## What is wrong

**The SPH-2 low firing table is long, badly, and the error grows as the dial drops.** Measured against `data/weapons.json`: −9 m at 600 mil, −41 m at 450, −81 m at 300, −135 m at 200, −150 m at 150. How much worse it gets below 150 mil is genuinely unknown: extending the measured trend reaches about −185 m at the 35 mil floor, the fitted model implies −434 m there, and nothing was shot between. The shipped table claims an RMS of 14 m; it is out by ten times that through the middle of its range.

**The SPH-2 high table is short above 800 mil.** It is exact at 800 (−2 m) and drifts steadily: +26 m at 910, +38 m at 1000, +32 m at 1030, +57 m at 1200, +59 m at 1300. The +65 m at 1380 is consistent with that but is the mean of two shots in a dial whose five repeats range over 45 m, so it does not stand on its own.

The pattern across both is one thing, not two: **the tables are accurate near 45° elevation and degrade the further the dial moves from it** — long below, short above.

**`projectile-model.json` is wrong about the SPH-2 in three ways.** Muzzle velocity is 160.1 m/s where measurement gives **262.4 m/s** — 37% low, because a vacuum fit had to absorb the drag it has no term for. It models no drag at all; the measured value is a quadratic coefficient of **3.90 × 10⁻⁴ /m**. And it splits the weapon into two independent per-arc fits with different mil-to-degree slopes (0.058 low, 0.048 high), when the measurements show a single continuous elevation scale: **θ = 2.254° + 0.05625° × mil**, one line straight through 45°, low and high arcs being the same gun either side of it.

That 0.05625 is exactly 6400 mils to a circle. It was fitted freely first (0.05615), then forced to the exact NATO value with no movement in the residuals. The dial is a plain mil sight with a small fixed offset — a structural fact, not a curve fit.

**The mortar's flight times are wrong and get worse with elevation:** −1.5 s at 150 mil, −1.8 s at 450, −2.9 s at 600, −3.4 s at 750, **−4.8 s at 850**. `docs/todo.md` describes the readout as "good enough to choose an arc; not good enough for the time-on-target staggering that a battery would want" — that is now measured, and five seconds is well past usable for a battery.

**`minElevationMil` is `20` for the SPH-2; the gun will not depress below 35.** The game will not let the barrel go lower, so 35 is a hard floor rather than the lowest angle that happened to be shot. Set it to 35.

## What is right — do not touch

**The mortar's range table is correct.** Six independent shots across six dials, every error between +1.0 m and +7.5 m, all the same sign; a seventh agrees but its dial was inferred from the table and does not count. It needs no change. Only its flight times are wrong.

**The declared maximum range is correct.** The SPH-2's `maxRangeKm` of 2.629 checks out against measurement (2620 m at 600 mil). The `minRangeKm` of 0.78 is **unverified**: it is the shipped high table's 1390 mil entry, the dial's top was not shot, and the only low-dial shot was fired from a rejected origin. The nearest measurement, 1380 mil at 890 m, reads 65 m longer than its table row, so if the value is wrong it is more likely understated than overstated. The 100 m per unit coordinate scale the ranges rest on is likewise assumed from the shipped maps, not measured.

**The high-angle branch convention is correct.** This was the largest single unknown in `docs/todo.md`, because `sin(2θ)` is symmetric about 45° and a range table alone cannot say which solution it describes. Timed shots settle it: the mortar at 150 mil flew 16.5 s where the high-angle prediction was 15.0 s and the low-angle alternative 9.3 s; at 750 mil it flew 20.75 s against predictions of 17.4 s and 2.9 s. The convention the shipped elevation correction assumes throughout is the right one.

**The weapon has essentially no dispersion.** With the barrel held still, repeats spread 7.2 m at 2192 m on the low arc, 7.6 m at 1224 m on the high arc, and 1.0 m at 890 m. Any error the app shows is model error, not scatter — worth knowing before anyone attributes a discrepancy to randomness.

## Cautions

**A single quadratic drag coefficient does not fit the whole SPH-2 envelope.** The best fit over twelve dials and three flight times reaches **19.7 m RMS**, against roughly 73 m for the shipped tables — four times better, and a large improvement — but structure remains. The worst residual is −36 m at 150 mil, the shallowest shot in the set. Adding a linear drag term makes the fit worse rather than better, so the real drag law has shape that two parameters cannot capture. Do not present the fitted numbers as exact.

**No physical model for the mortar is available, and none is needed.** Attempts to fit one left 14 m and 1.25 s of residual and wanted 208 m/s with a drag coefficient five times the SPH-2's — for a slower, lighter projectile. Physically implausible, so the model form is wrong rather than mistuned. Since the mortar's range table is already accurate, the only thing needing correction is flight time, and five measured timings across the dial can serve that directly without a model behind them.

**The SPH-2 low arc below 150 mil is unmeasured.** A hill blocked the firing lane at the range and 35 and 100 mil could not be shot. Anything the app says below 150 mil is extrapolation, and that is precisely where the shipped table is furthest off. Whatever you build should not imply confidence there that the data does not support.

**Vehicle attitude is a real but bounded error source, and there is nothing to correct it with.** Across four of the five 1380 mil shots, about 5° of traverse moved the impact 12.0 m — roughly 2.6 mil of induced launch angle — while holding the barrel still gave metre-level repeatability. The fifth landed 33 m shorter than any of them and is an outlier that neither terrain (the round descends at 85° there and range moves 0.09 m per metre of target height) nor traverse explains; the raw 45 m spread including it should not be read as the attitude effect. `docs/todo.md` lists vehicle attitude as unmodelled; at 12 m it sits below the 19.7 m model RMS, so it is not the largest remaining error source once the tables are fixed. And only its *effect* was measured — the chassis tilt itself was never read from the game, so there is no input to correct from.

**Terrain sensitivity varies enormously by arc, and the app currently treats every arc the same.** Range moves roughly 1.9 m per metre of target height on the SPH-2 low arc, 0.09 m per metre on its high arc, and about 0.5 m per metre for the mortar. `releasePolicy.automaticMilCorrection` in `data/ballistics/terrain-context.json` applies uniformly. Worth considering; not something the measurements settle.

**The firing range is not a shipped map.** It has no entry in `maps/` and no heightfield in `data/terrain/`, so target elevations were unknown for every shot. **Nothing here validates the elevation correction**, which remains as unverified as it was before this session.

## Definition of done

The app's dialled MIL for the SPH-2 matches the game to within the measured model's accuracy rather than being 150 m out through the middle of its range; the mortar's flight times match measurement; the mortar's range table is untouched; `docs/todo.md` reflects what is now settled and what is not; and nothing claims more confidence than the measurements support, particularly below 150 mil on the SPH-2 low arc.
