# Firing range measurements — 2026-09-02

SPH-2 (`id: "spg"`) and mortar, 33 shots fired at the in-game firing range and read back off the map, plus what they say about the firing tables in `data/weapons.json` and the projectile model in `data/ballistics/`. This is the first time either has been checked against the game rather than against itself.

Elevations were added on 2026-09-03, after `apollyon-sys` pointed out in PR #15 that the range is part of Bakurani and therefore covered by terrain the repo already ships. They are integrated throughout rather than kept as a correction: where a conclusion depends on whether the ground was level, that is said in place.

## Summary

- **The SPH-2's shipped range table is wrong**, by up to 150 m on the low arc and 65 m on the high arc, in opposite directions.
- **The mortar's shipped range table is correct**, every dial within +1.0 to +7.5 m, and the four near-level shots confirm it without needing any height correction. Its flight times are not — up to 4.8 s short. Its response to target height turns out to be *unmeasured*: correcting the three elevated shots with the only model available makes their agreement with the table worse, not better.
- **The weapon has essentially no dispersion.** Repeats with the barrel held still land within 7 m at 2.2 km. Spread comes from traversing the barrel.
- **The ground was not level.** Every low-arc SPH-2 shot landed 42–61 m below the gun. The replacement fit was built assuming it was, so its quoted 19.7 m accuracy does not survive contact with the real terrain — it is 56.7 m. A refit is the outstanding work.

## Conditions

### Where the range is

The firing range is not a separate map. It is part of Bakurani, centred near `98.49, 109.80`, inside the coverage of `data/terrain/bakurani/`. Every gun position below (97.7–99.5, 110.1–110.4) sits on ground the repo already ships terrain for.

### Coordinates and elevation

Coordinates are the game's own readout, at two decimal places — about one metre. They convert to metres with the same `coordinateMetersPerUnit` of 100 that both shipped maps use. **That scale is unverified for this map**; nothing in the session measured it directly, and every range in this document inherits the assumption.

Elevations are sampled from `data/terrain/bakurani/`'s raw 2 m Terrain3D collision chunks (`manifest.json`, `evidence: "VERIFIED"`). Heights are metres on the map's own offset datum, roughly −862 m here; only differences are meaningful. **ΔZ is impact height minus gun height**, so a negative ΔZ means the round landed below the gun.

Two independent checks say the coordinate mapping is right, which matters because the manifest records a past Y-sign error:

- **Bearings reproduce.** Recomputing the bearing from the gun to shot 9's impact from its coordinates alone gives 218.3°, exactly the figure read off the game. Bearings play no part in the elevation sampling, so this is a free check on the axis convention.
- **The mirrored alternative is absurd.** Under a flipped Y sign, shot 2 becomes a 1.4 km shot climbing 285 m, and the gun pad drops 42 m.

The 2 m chunks were also checked against the shipped 32 m `heightfield.bin`, which is what the app samples at runtime: 13 points, worst difference 4.1 m, most under 2 m — consistent with downsampling, not with a mapping error.

### How precise these numbers are

**The gun pad is not level.** A 100 m by 100 m box around the gun spans 9.2 m, from −870.71 m to −861.51 m. With position known to about a metre, gun height is therefore known to a few metres. That is immaterial against a 40–60 m ΔZ, but it is the floor on any accuracy a refit can honestly claim: a fit quoted to better than a few metres RMS would be quoting past its own inputs. It is also why origins B, C and M all read −862.03 m although M sits 68 m away — they share a level patch, rather than being one sample.

**Slant range can be ignored.** Across all 33 shots the slant range exceeds the flat range by at most 1.51 m, and by under 0.5 m for most. The tables below give flat range only; slant is `hypot(range, ΔZ)` where anyone needs it.

### The gun positions

| Origin | Coordinate | Ground z | Used by | Note |
| --- | --- | --- | --- | --- |
| A | `99.49, 110.33` | −863.57 m | SPH-2 shots 1–3 | Given as "where I'm standing" — may not be the gun itself; those three shots are rejected below. |
| B | `97.73, 110.10` | −862.03 m | SPH-2 shots 4–5 | |
| C | `97.73, 110.11` | −862.03 m | SPH-2 shots 6–26 | Same spot as B, re-read one decimal finer. |
| M | `98.41, 110.39` | −862.03 m | every mortar shot | |

### Flight timing

Flight times are taken from video, muzzle flash to impact, and are good to roughly ±0.4 s.

Raw timestamps, SPH-2: shot 4 fired 1.25 s, landed 24.680 s. Shot 9 fired 1.28 s, landed 15.5 s. Shot 18 fired 1.2 s, landed 36.6 s.

Raw timestamps, mortar: M1 fired 2.3 s, landed 18.8 s. M2 fired 2.5 s, landed 20.8 s. M3 fired 2.2 s, landed 22.2 s. M5 fired 2.3 s, landed 24.7 s. M4 fired 1.9 s and landed at about 23 s, revised down by roughly 0.5 s on review; the 20.75 s recorded below came from that review and is 0.15 s longer than the raw figures give, so **M4 carries more uncertainty than the rest**.

## SPH-2

### Every shot

| # | Dial | Origin | Impact | Impact z | Range | ΔZ | Bearing | TOF | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 35 | A | 101.34, 118.06 | −865.40 | 794.8 m | −1.83 m | 13.5° | — | rejected |
| 2 | 150 | A | 100.46, 124.23 | −815.02 | 1393.4 m | +48.55 m | 4.0° | — | rejected |
| 3 | 200 | A | 100.61, 126.73 | −807.06 | 1643.8 m | +56.51 m | 3.9° | — | rejected |
| 4 | 600 | B | 81.95, 89.20 | −911.60 | 2618.8 m | −49.57 m | 217.1° | 23.43 s | |
| 5 | 300 | B | 84.38, 92.43 | −922.78 | 2214.6 m | −60.75 m | 217.1° | — | riverbank; excluded from the 300 mil mean |
| 6 | 300 | C | 83.99, 92.99 | −904.57 | 2195.2 m | −42.54 m | 218.7° | — | road |
| 7 | 300 | C | 84.08, 93.01 | −904.35 | 2188.0 m | −42.33 m | 218.6° | — | road |
| 8 | 300 | C | 84.02, 93.02 | −904.43 | 2191.0 m | −42.40 m | 218.7° | — | road |
| 9 | 300 | C | 84.13, 92.91 | −909.22 | 2192.7 m | −47.20 m | 218.3° | 14.22 s | road |
| 10 | 150 | C | 87.50, 97.26 | −906.67 | 1642.5 m | −44.65 m | 218.5° | — | |
| 11 | 200 | C | 86.17, 95.74 | −912.58 | 1844.3 m | −50.55 m | 218.8° | — | |
| 12 | 450 | C | 82.25, 90.51 | −905.34 | 2497.6 m | −43.31 m | 218.3° | — | |
| 13 | 1380 | C | 92.58, 103.33 | −844.17 | 851.4 m | +17.86 m | 217.2° | — | outlier, see Dispersion |
| 14 | 1380 | C | 91.66, 103.68 | −867.65 | 884.2 m | −5.63 m | 223.4° | — | barrel traversed |
| 15 | 1380 | C | 92.06, 103.17 | −845.99 | 896.2 m | +16.03 m | 219.2° | — | barrel traversed |
| 16 | 1000 | C | 83.67, 93.38 | −896.55 | 2185.4 m | −34.52 m | 220.0° | — | |
| 17 | 800 | C | 81.36, 91.07 | −866.81 | 2511.0 m | −4.78 m | 220.7° | — | |
| 18 | 1200 | C | 87.47, 97.78 | −910.05 | 1604.0 m | −48.02 m | 219.8° | 35.40 s | |
| 19 | 1300 | C | 89.93, 100.65 | −858.69 | 1226.1 m | +3.34 m | 219.5° | — | |
| 20 | 910 | C | 82.35, 92.10 | −890.57 | 2368.3 m | −28.55 m | 220.5° | — | |
| 21 | 1030 | C | 84.20, 94.00 | −894.23 | 2103.8 m | −32.20 m | 220.0° | — | |
| 22 | 1300 | C | 89.96, 100.66 | −857.60 | 1223.4 m | +4.43 m | 219.4° | — | barrel held still |
| 23 | 1300 | C | 89.99, 100.69 | −856.47 | 1219.2 m | +5.56 m | 219.4° | — | barrel held still |
| 24 | 1300 | C | 89.98, 100.60 | −856.61 | 1226.8 m | +5.41 m | 219.2° | — | barrel held still |
| 25 | 1380 | C | 92.23, 103.12 | −841.07 | 889.4 m | +20.95 m | 218.2° | — | on a hill |
| 26 | 1380 | C | 92.03, 103.27 | −849.81 | 890.4 m | +12.22 m | 219.8° | — | on a hill |

**The elevation is arc-correlated, not random.** Every low-arc dial from 150 to 600 mil landed 42–61 m below the gun. The high arc is near level at 800 mil and *rises* 3–21 m at 1300 and 1380. A model fitted to these shots as though they were level has to absorb that pattern into its parameters, which is exactly what happened; see "What the real elevations do to that model" below.

Shot 5's riverbank is now quantified: it dropped 15–18 m further than its four 300 mil siblings (−60.75 m against −42.3 to −47.2 m). At that arc's 31° descent, terrain moves the impact roughly 1.9 m per metre of drop, which is why it reads 23 m long against them. It is excluded from the 300 mil mean on that basis.

### Shots 1–3 are not usable

They do not fit shots 4–18 under any single trajectory. Shot 2 at 150 mil reads 1393 m where the identical dial from origin C reads 1642 m — 249 m apart. The likely cause is that origin A was the player's position rather than the gun's; shots 4 onward were reported explicitly as the artillery piece's coordinate. Shots 2 and 3 support that: a gun position about 550 m from origin A reconciles both with the fitted model to within a metre. Shot 1 does not join them — forcing all three onto one displaced origin leaves 73 m RMS with shot 1 alone off by about 105 m. Neither the displaced origin nor shot 1's anomaly is adopted; both are too uncertain to build on.

150 and 200 mil were re-shot from origin C as shots 10 and 11, so only **35 and 100 mil remain unmeasured**.

### Dispersion

**The weapon has essentially none. Range spread comes from moving the barrel, not from the gun.**

Held still, at either arc, repeats land on top of each other:

| Dial | Shots | Bearing spread | Range spread |
| --- | --- | --- | --- |
| 300 (low) | 6–9 | 0.4° | **7.2 m** at 2192 m |
| 1300 (high) | 19, 22–24 | 0.3° | **7.6 m** at 1224 m |
| 1380 (high) | 25–26 | 1.6° | **1.0 m** at 890 m |

Traversed between shots, the same dial scatters more. Shots 13–15 and 25–26 are all 1380 mil from origin C, sorted by bearing:

| # | Bearing | Range | Note |
| --- | --- | --- | --- |
| 13 | 217.22° | 851.4 m | landed slightly on a hill |
| 25 | 218.20° | 889.4 m | on a hill |
| 15 | 219.25° | 896.2 m | |
| 26 | 219.81° | 890.4 m | on a hill |
| 14 | 223.35° | 884.2 m | |

The full spread is 44.8 m, but 32.8 m of it is shot 13 alone. Without it the other four cover 12.0 m across about 5° of traverse, and range still does not track bearing smoothly: the 0.98° from shot 13 to shot 25 is worth +38 m, the next 1.6° from 25 to 26 is worth +1 m. Shot 13 is an outlier nothing in the data explains.

Terrain is ruled out for all of it. At 1380 mil the round descends at 85° and range changes only 0.09 m per metre of target height, so even a 100 m hill moves the impact 9 m. That covers shots 25 and 26, both noted as landing on a hill, and it means shot 13's own hill cannot account for its 33 m either.

**This makes `docs/todo.md`'s "vehicle attitude is not modelled" a measured but bounded effect.** Setting shot 13 aside, traverse is worth roughly 12 m at this arc, which at 4.68 m per mil of elevation is about 2.6 mil of induced launch angle. It bites on the high arc, where range is most sensitive to elevation and least sensitive to terrain, but it is smaller than the model's own residual and it is not the 45 m the raw spread suggests.

### Against the shipped firing table

| Dial | Arc | Measured | `data/weapons.json` | Error |
| --- | --- | --- | --- | --- |
| 150 | low | 1642.5 m | 1792 m | −150 m |
| 200 | low | 1844.3 m | 1979 m | −135 m |
| 300 | low | 2191.7 m | 2273 m | −81 m |
| 450 | low | 2497.6 m | 2538 m | −41 m |
| 600 | low | 2618.8 m | 2629 m | −9 m |
| 800 | high | 2511.0 m | 2513 m | −2 m |
| 910 | high | 2368.3 m | 2342 m | +26 m |
| 1000 | high | 2185.4 m | 2147 m | +38 m |
| 1030 | high | 2103.8 m | 2072 m | +32 m |
| 1200 | high | 1604.0 m | 1547 m | +57 m |
| 1300 | high | 1223.9 m | 1165 m | +59 m |
| 1380 | high | 889.9 m | 825 m | +65 m |

The table is accurate either side of 45° elevation and degrades monotonically with distance from it — long below, short above. How far the low arc degrades below 150 mil is unknown: a straight line through the five measured low-arc errors reaches only about −185 m at the 35 mil floor, while the fitted model sits −434 m below the table there. The two disagree by 250 m and nothing measured lies between them, so no figure should be quoted for that end until it is re-shot.

The 1380 row is the weakest. Its 889.9 m is the mean of shots 25 and 26 only, and that dial's five shots span 45 m once traverse and shot 13 are included, so its +65 m is not separable from the scatter. The high table being short is carried by the 910 through 1300 rows, which 1380 is consistent with but does not independently confirm.

**`minElevationMil` is `20` in `data/weapons.json` and should be `35`.** The gun will not depress below 35 — a hard limit the game enforces, not a reading taken off a shot.

### The derived model

The dial is true NATO mils. Fitting degrees-per-mil freely gives 0.05615; forcing the exact 6400-mils-to-a-circle value of **0.05625** does not move the residuals. The gun has a plain mil sight with a small fixed offset at zero elevation, and "low" and "high" are one continuous elevation scale through 45° rather than two regimes.

Best fit over all twelve dials plus three flight times, quadratic drag, `θ = 2.254° + 0.05625 × mil`:

- **muzzle velocity 262.4 m/s**
- **drag coefficient 3.90 × 10⁻⁴ /m**
- range RMS **19.7 m**, flight times within 0.35 s

Against the same twelve measurements the shipped tables have an RMS of roughly 73 m and a worst case of 150 m. The model this replaced, still the `vacuum-fit` in the file's history, ran 160.1 m/s with no drag at all — fitted to the tables rather than to the game, with the velocity 37% low because a vacuum fit has to absorb the drag.

**This fit was computed against flat ground, before the terrain was available.** The next section is what that costs.

### What the real elevations do to that model

Feeding each shot's real ΔZ into the shipped fit, instead of the zero it was built on:

```
RMS   assuming flat : 19.7 m   ← the figure quoted above
      using real ΔZ : 56.7 m
```

The low-arc residuals turn systematically negative — about −100 m at 150 mil, −117 m at 200, −77 m at 300, −61 m at 450, −49 m at 600. The model over-predicts range once correctly credited with the drop, because the fit had already leaned its velocity and drag to reproduce shots that were falling 45 m without being told so.

**So the 19.7 m RMS is not an accuracy figure against real terrain.** It is the residual of a fit whose elevation was assumed away. The app applies a ΔZ correction on real maps, so the model is being asked to do something this fit never validated.

The three flight times move the same way: against real ΔZ the model errs **+0.75 s at 300 mil** and **+0.40 s at 600 mil**, where the flat comparison showed +0.02 s and −0.11 s. The high-arc shot at 1200 mil improves, from −0.34 s to +0.03 s.

This also offers an explanation for the residual structure noted above — the worst residual being 150 mil, the shallowest shot in the set. The shallowest shot is the one most sensitive to an unmodelled ΔZ, so the leftover shape may be terrain rather than a drag law a two-parameter model cannot capture. A refit against the real geometry would settle it. That refit has not been done; whether it should happen before Early Access on 2026-09-10 restores the pak files and settles the parameters outright is an open question, not decided here.

### The firing lane crosses a ridge

The ground between the gun and the impacts does not fall away smoothly. Sampled from origin C toward shot 9:

| Along the lane | ΔZ |
| --- | --- |
| 0 m | 0.0 m |
| 274 m | +16.0 m |
| 548 m | +4.5 m |
| 822 m | +8.9 m |
| 1096 m | +35.0 m |
| 1370 m | −17.9 m |
| 1645 m | −44.1 m |
| 1919 m | −44.1 m |
| 2193 m | −47.2 m |

This corroborates the account that 35 and 100 mil could not be shot: the hill is measurably there, and a shallow dial would have to clear +35 m at 1100 m to reach the ground beyond. It does not affect any impact ΔZ above — those are sampled at the impact point — but it does mean the lane is not the uniform down-slope a single ΔZ per shot implies, which matters to anyone modelling the flight rather than just its endpoints.

## Mortar

Fired from origin M, `98.41, 110.39`, for every shot.

### Every shot

| # | Dial | Impact | Impact z | Range | ΔZ | Bearing | TOF | Table | Error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | 150 | 93.90, 105.17 | −852.36 | 689.8 m | +9.67 m | 220.8° | 16.50 s | 684 m | +5.8 m |
| M2 | 450 | 95.06, 106.54 | −823.92 | 510.3 m | +38.11 m | 221.0° | 18.30 s | 509 m | +1.3 m |
| M3 | 600 | 95.89, 107.47 | −827.84 | 385.7 m | +34.19 m | 220.8° | 20.00 s | 385 m | +0.7 m |
| M4 | 750 | 96.82, 108.57 | −862.87 | 241.7 m | −0.84 m | 221.1° | 20.75 s | 239 m | +2.7 m |
| M5 | 850 | 97.52, 109.37 | −861.39 | 135.4 m | +0.63 m | 221.1° | 22.40 s | 132 m | +3.4 m |
| M6 | 650 | 95.57, 108.52 | −861.99 | 340.0 m | +0.04 m | 236.6° | — | 339 m | +1.0 m |
| M7 | 600 | 95.10, 108.28 | −862.24 | 392.5 m | −0.21 m | 237.5° | — | 385 m | +7.5 m |

**M3's dial is inferred, not reported.** It was called as 650 mil but reads 46 m long of the table at that dial, against errors of 1–8 m everywhere else. M6 and M7 later fired both dials on a cleaner lane and returned 340.0 m and 392.5 m, matching the table at 650 and 600 respectively, so the inference is that the dial was misread and M3 was fired at 600. That is what the row records — but it is an inference from the table, so **M3 cannot then count as evidence for the table**. Terrain cannot account for the alternative: at that arc range moves about 0.27 m per metre of height, so explaining 46 m would need a drop of roughly 170 m, and M3's impact is 34 m *above* the gun.

### The range table is correct

Six independent shots across six dials, every error between +1.0 m and +7.5 m, all the same sign. **`data/weapons.json`'s mortar table needs no change.** This is the opposite of the SPH-2, whose low table is out by up to 150 m over a comparable span.

**The elevations sharpen this rather than disturbing it, but not in the way one would expect.** Four of the seven shots — M4, M6 and M7 within a metre of level, M5 within a metre — are a clean test of the table with no height correction required at all, and they give +1.0, +2.6, +3.5 and +7.4 m. That alone settles the table.

The other three landed 10–38 m above the gun, and correcting them is where it gets interesting. The only height model available for the mortar is the vacuum fit, and it says those rises cost 6.1 m, 14.8 m and 9.4 m of range respectively — so M2's ΔZ alone is worth more than the entire error budget of the table. Applying that correction moves the three shots *away* from the table, not toward it:

| # | Dial | ΔZ | Error, height ignored | Error, corrected by the vacuum model |
| --- | --- | --- | --- | --- |
| M1 | 150 | +9.67 m | +5.8 m | +11.9 m |
| M2 | 450 | +38.11 m | +1.3 m | +16.1 m |
| M3 | 600 | +34.19 m | +0.7 m | +10.1 m |
| M4 | 750 | −0.84 m | +2.7 m | +2.6 m |
| M5 | 850 | +0.63 m | +3.4 m | +3.5 m |
| M6 | 650 | +0.04 m | +1.0 m | +1.0 m |
| M7 | 600 | −0.21 m | +7.5 m | +7.4 m |

RMS against the table goes from 4.0 m to 9.1 m, and the damage falls entirely on the three elevated shots.

The natural reading is not that the table is wrong. **It is that the mortar's real response to target height is weaker than the vacuum model predicts.** M6 and M7 re-fired M3's exact dials (650 and 600) on a level lane and matched the table to +1.0 m and +7.5 m; if the table were out by the 10–16 m the correction implies, those two shots would have shown it. This is one more symptom of the model form being wrong for this weapon rather than merely mistuned — see "No usable physical fit" below — and it means the mortar's height response is itself unmeasured, not merely unmodelled.

### The flight times are not

| Dial | Measured | App shows | Error |
| --- | --- | --- | --- |
| 150 | 16.50 s | 15.0 s | −1.5 s |
| 450 | 18.30 s | 16.5 s | −1.8 s |
| 600 | 20.00 s | 17.1 s | −2.9 s |
| 750 | 20.75 s | 17.4 s | −3.4 s |
| 850 | 22.40 s | 17.6 s | −4.8 s |

The error grows monotonically with elevation and reaches nearly five seconds at the top of the dial. Those figures are what the vacuum fit produced; `js/features/flight-time.js` now interpolates these five measurements directly instead.

**The branch assumption is settled: the mortar fires high-angle.** At 150 mil the high-angle prediction is 15.0 s against a low-angle alternative of 9.3 s, and the measurement is 16.5 s. At 750 mil the two predictions are 17.4 s and 2.9 s against a measured 20.75 s. High-angle is the convention the shipped elevation correction assumes throughout.

These five timings were taken at known elevation after all — +0.6 to +38 m — but the readout still does not respond to target height, because there is no model to put a height term into. See below.

### No usable physical fit

Quadratic drag does not describe this weapon. The best fit over four range/time pairs leaves 14 m and 1.25 s of residual and wants a muzzle velocity of 208 m/s with a drag coefficient of 2.19 × 10⁻³ /m — five times the SPH-2's, for a slower and lighter projectile. Those parameters are numerically convenient and physically implausible, so the model *form* is wrong rather than merely mistuned. Fitted degrees-per-mil also comes out near 0.052 where the SPH-2 measured exactly 0.05625, suggesting the mortar's angle is on a different scale, or not linear in the dial at all.

**The practical consequence is that no fit is needed.** The range table is already accurate, so the only thing the app has to correct is flight time, and the five measurements above can be interpolated directly rather than derived from a model that cannot be justified.

## What to measure next

Now that elevations resolve, the most valuable shots are no longer more dials on flat ground — they are the same dials at very different heights. Two reasons.

**The current data cannot separate drag from height response.** Every low-arc shot landed at ΔZ ≈ −45 m and every high-arc shot between 0 and +21 m, so arc and elevation are almost perfectly correlated across the set. No fit can tell whether the low-arc bias is a wrong drag coefficient or a wrong response to height, because in this data the two are the same variable. Firing one dial at several heights separates them.

**The elevation signal is currently the same size as the model's error.** At 300 mil the measured ΔZ of −44 m is worth 68 m of range; the fit's own residual against real terrain is 56.7 m. A −250 m valley shot at the same dial is worth 320 m, and a +250 m shot is worth −834 m. That is five to twelve times the leverage per shot.

### Predicted values, to be falsified

From the shipped fit (262.4 m/s, 3.90 × 10⁻⁴ /m). Any shot that lands far off these is the informative one.

| Dial | Arc | ΔZ −300 | ΔZ −200 | ΔZ −100 | ΔZ 0 | ΔZ +100 | ΔZ +200 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 150 | low | 2228 m | 2074 m | 1880 m | 1604 m | no solution | no solution |
| 300 | low | 2570 m | 2467 m | 2346 m | 2201 m | 2012 m | 1721 m |
| 600 | low | 2808 m | 2756 m | 2699 m | 2636 m | 2566 m | 2487 m |
| 1200 | high | 1635 m | 1619 m | 1603 m | 1586 m | 1569 m | 1550 m |

Flight time at 300 mil over the same span runs 18.2 s at ΔZ −300 down to 10.0 s at +200 — an eight-second swing that video timing resolves easily, against three timings today that all sit at ΔZ ≈ −48 m.

**Shallow dials cannot shoot far uphill.** The maximum ΔZ that still has a solution is about +90 m at 150 mil, +250 m at 300 mil, and beyond +600 m from 600 mil upward. Uphill tests below 300 mil are therefore limited by the weapon, not by the terrain.

### Priority order

1. **One dial, three heights.** 300 mil into a deep valley (≈ −200 m), onto level ground, and onto high ground (≈ +200 m). Three shots, and they break the arc/elevation confound on their own. Highest value in the list.
2. **Shallow dials downhill.** 150 and 200 mil into the deepest valley available. Sensitivity is 3.51 m of range per metre of ΔZ at 150 mil against 0.09 at 1380 — a fortyfold spread, so the shallow end carries almost all the information.
3. **Anything uphill.** Every shot in this document is downhill. The uphill response is untested and is the larger effect: +250 m costs 834 m of range at 300 mil where −250 m gains 320 m.
4. **Flight times at large ΔZ.** Time whatever gets fired under 1–3. The height response of flight time is currently unconstrained by any measurement.
5. **Mortar into a valley, timed.** This is worth more than it first looks. The three elevated mortar shots suggest the weapon's real height response is *weaker* than the vacuum model predicts (see "The range table is correct"), but three shots at +10 to +38 m cannot settle it. At ΔZ −200 m on 450 mil the model expects roughly +67 m of range — far outside the table's +1 to +7.5 m accuracy — so a valley shot separates the two readings immediately, and it measures the height response of flight time at the same time, which is the reason the mortar badge is height-blind today.
6. **35 and 100 mil, anywhere with a clear lane.** Still the only wholly unmeasured part of the dial, and the two available extrapolations disagree by 250 m at the floor.

### How to shoot them

- **Aim at flat ground at altitude** — a plateau, a shelf, a valley floor — not a steep mountain face. On a slope the impact point itself becomes unstable (at 31° descent the impact moves 1.9 m per metre of drop), and the metre the coordinate readout is good to turns into a metre or more of height error on a 45° face, on top of the few metres already inherent in the sampling.
- **Record only what was recorded before**: dial, gun coordinate, impact coordinate, and video timestamps where a shot is timed. Elevations do not need reading in game; they are sampled from the terrain afterwards.
- **Hold the barrel still between repeats.** Traverse is worth roughly 12 m of spread on the high arc and is the single largest nuisance term in the existing data.
- **Note the ground the round landed on**, as before. "Road, flat" and "riverbank" both earned their place in the analysis above.


## Open questions

- **A refit of the SPH-2 against real terrain.** The blocker is gone — target heights are known — so what remains is refitting muzzle velocity and drag against the real ΔZ per shot and re-checking the three flight times. Bounded in usefulness by the few-metre gun-height uncertainty noted under Conditions.
- **The bottom of the SPH-2 low arc**, 35 and 100 mil. No clear firing lane at the range; everything below 150 mil is extrapolated, and the two available extrapolations disagree by 250 m at the floor.
- **Vehicle attitude** as a correctable quantity. Bounded at roughly 12 m on the high arc for 5° of traverse once shot 13 is set aside, but the tilt itself was never read off the game, so there is nothing to correct *with*.
- **The coordinate scale**, assumed to be 100 m per unit like the shipped maps. The 2 m chunks agreeing with the 32 m heightfield to within 4.1 m shows the game-unit-to-metre mapping is *consistent*, which is not proof of the 100 figure itself.
- **The declared minimum range.** `minRangeKm` of 0.78 is the shipped table's 1390 mil entry, and the nearest measurement, 1380 mil, reads 65 m longer than its row, so the value is unverified and if anything understated.
- **A mortar flight-time model.** Interpolation covers the five measured dials; nothing covers the gaps between them or the response to target height.
- **The mortar's response to target height at all.** The three elevated shots hint that it is weaker than the vacuum model predicts, but they span only +10 to +38 m and the correction that fits them worst is the one the model supplies. Until this is measured, neither the mortar's range nor its flight time should be corrected for height.
