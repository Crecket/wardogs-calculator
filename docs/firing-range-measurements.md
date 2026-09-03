# Firing range measurements — 2026-09-02

SPH-2 (`id: "spg"`) and mortar, 33 shots fired at the in-game firing range and read back off the map, plus what they say about the firing tables in `data/weapons.json` and the projectile model in `data/ballistics/`. This is the first time either has been checked against the game rather than against itself.

Elevations were added on 2026-09-03, after `apollyon-sys` pointed out in PR #15 that the range is part of Bakurani and therefore covered by terrain the repo already ships. They are integrated throughout rather than kept as a correction: where a conclusion depends on whether the ground was level, that is said in place.

## Summary

- **The SPH-2's shipped range table is wrong**, by up to 150 m on the low arc and 65 m on the high arc, in opposite directions — and once the shots are corrected back to level ground the low-arc error roughly doubles, to something near 288 m at 150 mil.
- **The mortar's shipped range table is correct**, every dial within +1.0 to +7.5 m, and the four near-level shots confirm it without needing any height correction. Its flight times are not — up to 4.8 s short. Its response to target height turns out to be *unmeasured*: correcting the three elevated shots with the only model available makes their agreement with the table worse, not better.
- **The weapon has essentially no dispersion.** Repeats with the barrel held still land within 7 m at 2.2 km. Spread comes from traversing the barrel.
- **The ground was not level.** Every low-arc SPH-2 shot landed 42–61 m below the gun. The replacement fit was built assuming it was, so its quoted 19.7 m accuracy does not survive contact with the real terrain — it is 56.7 m. A refit is the outstanding work.

## Conditions

### Where the range is

The firing range is not a separate map. It is part of Bakurani, centred near `98.49, 109.80`, inside the coverage of `data/terrain/bakurani/`. Every gun position below (97.7–99.5, 110.1–110.4) sits on ground the repo already ships terrain for.

### Coordinates and elevation

Coordinates are the game's own readout, at two decimal places — about one metre. They convert to metres with the same `coordinateMetersPerUnit` of 100 that both shipped maps use. **That scale is unverified for this map**; nothing in the session measured it directly, and every range in this document inherits the assumption.

Elevations are sampled from `data/terrain/bakurani/`'s raw 2 m Terrain3D collision chunks (`manifest.json`, `evidence: "VERIFIED"`) by `scripts/analyse-shots.mjs`, which takes a list of shots and resolves each one — gun height and slope, impact height and slope, ΔZ, range, bearing, model residual, flight-time error. It also makes the two judgements that decide whether a shot can be used at all: whether the gun stood on level ground, and whether the round reached its range or struck rising ground first. Heights are metres on the map's own offset datum, roughly −862 m here; only differences are meaningful. **ΔZ is impact height minus gun height**, so a negative ΔZ means the round landed below the gun.

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

**The errors above understate the low arc, because a firing table is a level-ground table and these shots were not level.** Every low-arc round fell 43–51 m and flew further for it, so the raw measured range flatters the table. Correcting each shot back to its flat-ground equivalent roughly doubles the low-arc error:

| Dial | Arc | ΔZ | What the drop is worth | Error above | Error, level-corrected |
| --- | --- | --- | --- | --- | --- |
| 150 | low | −44.6 m | +138 m | −150 m | **−288 m** |
| 200 | low | −50.5 m | +119 m | −135 m | **−253 m** |
| 300 | low | −43.6 m | +67 m | −81 m | −149 m |
| 450 | low | −43.3 m | +41 m | −40 m | −82 m |
| 600 | low | −49.6 m | +32 m | −10 m | −42 m |
| 800 | high | −4.8 m | +2 m | −2 m | −4 m |
| 910 | high | −28.6 m | +10 m | +26 m | +17 m |
| 1000 | high | −34.5 m | +10 m | +38 m | +29 m |
| 1030 | high | −32.2 m | +8 m | +32 m | +23 m |
| 1200 | high | −48.0 m | +8 m | +57 m | +49 m |
| 1300 | high | +4.7 m | −1 m | +59 m | +59 m |
| 1380 | high | +16.6 m | −1 m | +65 m | +66 m |

RMS against the table goes from 72 m to 126 m, and the worst case from 150 m to 288 m. The high arc barely moves, because at those descent angles height is worth almost nothing.

**Read the magnitudes with care.** The "what the drop is worth" column comes from the fitted model, and that model is itself biased by having been fitted to these same shots as though they were level — so the corrected figures are indicative, not settled. The *direction* is not in doubt: a round that falls 45 m always flies further than one that does not, so the true level-ground errors are larger than the raw column, not smaller. Pinning the magnitude is one of the things a refit, or shots at deliberately varied height, would deliver.

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

### Second session, 2026-09-03 — deliberately varied elevation

Fired specifically to break the arc/elevation confound described above, from two new positions, with impacts chosen at wildly different heights rather than on the one flat lane. **This section is still being collected.**

| Origin | Coordinate | Ground z | Note |
| --- | --- | --- | --- |
| D | `97.58, 109.63` | −862.03 m | Same level patch as the original range positions. |
| E | `89.68, 97.13` | −824.23 m | On a hill, 37.8 m above the range floor. Steep: the ground moves 4.1 m within 2 m of the gun, so gun height here carries a few metres of uncertainty — about ±3 m of range at these dials. |
| F | `97.95, 109.54` | −861.82 m | Level (0.6–3.4°), and a **different tank**. Fired as the control described below. |

| # | Origin | Dial | Impact | Impact z | ΔZ | Range | Bearing | Slope hit | TOF |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| N1 | D | 50 | 94.89, 111.72 | −815.83 | +46.19 m | 340.6 m | 307.8° | 26° | — |
| N2 | D | 300 | 82.71, 94.13 | −870.15 | −8.12 m | 2147.9 m | 223.8° | 21° | — |
| N3 | D | 300 | 83.25, 99.77 | −720.00 | +142.03 m | 1739.4 m | 235.5° | 26° | — |
| N4 | D | 300 | 83.20, 99.68 | −714.72 | +147.31 m | 1748.7 m | 235.3° | 26° | 10.001 s |
| N5 | D | 300 | 82.77, 94.17 | −871.14 | −9.11 m | 2140.9 m | 223.8° | 21° | — |
| E1 | E | 540 | 76.46, 74.31 | −941.41 | −117.17 m | 2637.3 m | 210.1° | 11° | 23.200 s |
| E2 | E | 440 | 75.64, 75.82 | −919.61 | −95.38 m | 2551.9 m | 213.4° | 6° | 20.200 s |
| E3 | E | 35 | 81.09, 84.36 | −926.19 | −101.95 m | 1539.0 m | 213.9° | 13° | 8.000 s |
| E4 | E | 100 | 80.16, 83.22 | −930.23 | −106.00 m | 1685.6 m | 214.4° | 11° | — |
| E5 | E | 100 | 80.28, 83.21 | −930.16 | −105.92 m | 1679.7 m | 214.0° | 16° | 9.300 s |
| E6 | E | 1380 | 85.45, 90.71 | −906.17 | −81.93 m | 768.8 m | 213.4° | 23° | 37.700 s |
| E7 | E | 1000 | 77.89, 79.58 | −950.72 | −126.49 m | 2114.3 m | 213.9° | 2° | 33.800 s |
| E8 | E | 1380 | 85.33, 91.06 | −908.71 | −84.48 m | 746.8 m | 213.0° | 15° | — |
| E9 | E | 1380 | 85.30, 90.91 | −908.08 | −83.85 m | 760.7 m | 213.2° | 17° | — |
| E10 | E | 800 | 75.83, 76.31 | −917.29 | −93.06 m | 2500.6 m | 213.6° | 8° | — |
| E11 | E | 850 | 72.03, 80.86 | −833.37 | −9.14 m | 2400.5 m | 231.4° | 17° | — |
| E12 | E | 1090 | 87.53, 78.60 | −851.44 | −27.21 m | 1865.4 m | 186.6° | 10° | — |
| E13 | E | 1000 | 70.31, 89.14 | −716.02 | +108.21 m | 2095.3 m | 247.6° | 26° | — |
| E14 | E | 1000 | 70.39, 89.29 | −707.95 | +116.28 m | 2082.2 m | 247.9° | 27° | — |
| E15 | E | 800 | 66.88, 87.80 | −759.23 | +65.00 m | 2463.5 m | 247.7° | 6° | — |
| E16 | E | 800 | 67.10, 87.67 | −761.44 | +62.79 m | 2448.2 m | 247.3° | 7° | — |
| F1 | F | 800 | 107.10, 131.74 | −642.02 | **+219.80 m** | 2401.2 m | 22.4° | 43° | — |
| F2 | F | 800 | 78.43, 94.07 | −747.93 | +113.90 m | 2490.7 m | 231.6° | 16° | — |

#### Most of these are terrain intercepts, not range measurements

The N-series all struck rising ground, so comparing their distance against the model's range — the distance at which the trajectory descends through the impact height on an open plane — measures the wrong thing. They are scored instead by asking where the model's trajectory first meets the sampled terrain along the same bearing:

| # | Dial | Actual impact | Model intercept | Model error |
| --- | --- | --- | --- | --- |
| N1 | 50 | 341 m | 260 m | **+81 m** (model short) |
| N2 | 300 | 2148 m | 2215 m | −67 m |
| N3 | 300 | 1739 m | 1800 m | −61 m |
| N4 | 300 | 1749 m | 1800 m | −51 m |
| N5 | 300 | 2141 m | 2215 m | −74 m |

E1 and E2 landed on gentle ground and need no such treatment: for both, the intercept and the plain range-at-ΔZ agree to within 2 m (2695 against 2694, and 2595 against 2593), which is what a clean range measurement looks like. E2 at 6° is the least ambiguous shot in this document.

| # | Dial | ΔZ | Measured | Model at real ΔZ | Residual |
| --- | --- | --- | --- | --- | --- |
| E3 | 35 | −101.95 m | 1539.0 m | 1386 m | **+153 m** |
| E4 | 100 | −106.00 m | 1685.6 m | 1691 m | **−6 m** |
| E5 | 100 | −105.92 m | 1679.7 m | 1691 m | **−11 m** |

High arc, same treatment. E7 landed on 2° ground, the flattest impact anywhere in this document:

| # | Dial | ΔZ | Measured | Model at real ΔZ | Residual |
| --- | --- | --- | --- | --- | --- |
| E10 | 800 | −93.06 m | 2500.6 m | 2577 m | −76 m |
| E11 | 850 | −9.14 m | 2400.5 m | 2477 m | −77 m |
| E7 | 1000 | −126.49 m | 2114.3 m | 2217 m | −103 m |
| E12 | 1090 | −27.21 m | 1865.4 m | 1950 m | −85 m |
| E6 | 1380 | −81.93 m | 768.8 m | 867 m | −98 m |
| E9 | 1380 | −83.85 m | 760.7 m | 868 m | −107 m |
| E8 | 1380 | −84.48 m | 746.8 m | 868 m | −121 m |
| E15 | 800 | +65.00 m | 2463.5 m | 2510 m | −47 m |
| E16 | 800 | +62.79 m | 2448.2 m | 2511 m | −63 m |
| E13 | 1000 | +108.21 m | 2095.3 m | 2152 m | −56 m |
| E14 | 1000 | +116.28 m | 2082.2 m | 2149 m | −67 m |
| E2 | 440 | −95.38 m | 2551.9 m | 2593 m | −41 m |
| E1 | 540 | −117.17 m | 2637.3 m | 2694 m | −57 m |

#### Elevation is not what the model gets wrong

At 300 mil the residual is −51 to −77 m whether the round landed 9 m below the gun or 147 m above it. Adding the first session's 300 mil shots at −44 m, the dial holds its error across a **264 m span of ΔZ**:

| ΔZ at 300 mil | −44 m | −9 m | −9 m | +142 m | +147 m |
| --- | --- | --- | --- | --- | --- |
| residual | −76 m | −67 m | −74 m | −61 m | −51 m |

**The model's response to target height is therefore approximately correct**, which is the first direct evidence either way and the thing the first session could not test at all.

#### The dial is what the model gets wrong, and its error changes sign

The residual instead tracks elevation on the dial, consistently across both sessions and three gun positions — and it does not merely shrink with elevation, it **crosses zero somewhere between 50 and 150 mil**:

| Dial | 35 | 50 | **100** | 150 | 200 | 300 | 440 | 450 | 540 | 600 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Residual | **+153 m** | **+81 m** | **−6, −11 m** | −100 m | −117 m | −51 to −77 m | −41 m | −61 m | −57 m | −49 m |

**The crossing is at 100 mil, and it is sharp.** Two shots there land within 11 m of the model and 6 m of each other, with flight time inside 0.07 s — the model's single most accurate dial. Fifty mil below it the shell outruns the model by 153 m; fifty mil above it the model outruns the shell by 100 m. The residual then bottoms out near −117 m at 200 mil before recovering to about −50 m across the rest of the dial.

The shape is therefore not a trend but a curve with a zero crossing and a minimum, spanning 270 m from best to worst.

This decides how the fit should be repaired. Height response is validated, so the structure cannot be blamed on unmodelled terrain; it is shape in the drag law that two parameters cannot express, exactly as "The derived model" above suspected when adding a linear drag term made the fit worse rather than better. **A refit that only retunes muzzle velocity and drag cannot fix an error that changes sign and then reverses again** — no choice of those two parameters produces a residual that crosses zero at 100 mil, troughs at 200, and recovers by 440. The model form has to change, or the tables have to be built from measurements rather than from a fit.

One caveat on the trough. The 150 and 200 mil residuals are the only figures in this curve that come solely from the first session, at a different gun position and a ΔZ near −45 m rather than −105 m. Every other dial has been shot from at least two positions. Re-shooting those two dials from origin E would confirm the deepest feature of the curve; until then it rests on one session.

#### The bottom of the dial is inverted, not merely imprecise

E3 at **35 mil — the dial floor** — is the strongest evidence in this document that the sub-150 extrapolation is wrong in kind rather than in degree. The round flew 1539 m where the model predicts 1386 m: **153 m further**, against every dial from 150 upward falling short. Its flight time is 8.000 s against a predicted 7.03 s, 0.97 s slow, which points the same way.

N1 at 50 mil said the same thing first (+81 m) but struck a 26° slope at only 341 m, where the intercept is very sensitive. E3 is the better measurement — 13° of slope at 1539 m — and it agrees, so two independent shots at two dials now put the low end on the opposite side of the model.

This also disposes of both extrapolations quoted under "Against the shipped firing table". Neither bracketed the truth: a line through the measured low-arc errors reached −185 m at the floor and the fitted model sat −434 m below the table there, while the measurement says the shell goes **further** than the model, not less far. Correcting E3 back to level ground puts the true 35 mil range near 975 m against the shipped table's 822 m — though that conversion leans on the same model the shot has just falsified, so treat the direction as established and the magnitude as not.

#### Resolved: the high arc is short because the gun was parked on a slope

The second session's high-arc shots do not agree with the first session's, and the disagreement is large, systematic, and currently unexplained.

| | Session 1 (origin C, level pad) | Session 2 (origin E, hillside) |
| --- | --- | --- |
| High-arc mean residual | **−1 m** | **−95 m** |
| Spread | −30 to +31 m | −121 to −76 m |
| Dials covered | 800, 910, 1000, 1030, 1200, 1300, 1380 | 800, 850, 1000, 1090, 1380 ×3 |

The first session's high arc straddles zero: on a level pad the model is good there. From origin E every high-arc shot falls 76–121 m short, at every dial, and the low arc from the same position over the same afternoon agrees with the first session perfectly well (440 and 540 mil give −41 and −57 m against −61 and −49 m at the neighbouring dials in session 1).

The sharpest single comparison needs no model at all:

> Session 1: **800 mil at ΔZ −4.8 m** landed 2511.0 m.
> Session 2: **850 mil at ΔZ −9.1 m** landed 2400.5 m.

Near-identical height, 50 mil apart on the dial, and the second lands 46 m shorter than the model's own difference between those dials accounts for.

**Three explanations were tested and none survives.**

*Target height.* Ruled out from inside session 2: 800 mil at ΔZ −93 m and 850 mil at ΔZ −9 m return the same −76 m residual. Eighty-four metres of height difference produce no difference in the error at all.

*A tilted vehicle.* Origin E sits on steep ground — the terrain moves 4.1 m within 2 m of the gun — so a nose-up vehicle firing at a higher true angle than commanded is the natural suspect, and it is exactly the effect `docs/todo.md` records as unmodelled. Fitting one barrel-pitch offset across every session-2 shot gives +20 mil, and it fails: it repairs the high arc (RMS 96 m to 27 m at +25 mil) while making the low arc worse (75 m to 85 m), because on the low arc extra elevation adds range where on the high arc it removes it. No single offset satisfies both, so if attitude is involved it is not the whole story.

*A displaced gun position.* Moving the gun far enough to add 95 m to the high-arc ranges would add the same to the low-arc ranges, which already agree. Ruled out on the same evidence.

**What the anomaly is not.** It is not arc-branch confusion in the analysis: both fitted arcs carry identical parameters, and the forward range from a dial is identical whichever is used. It is not scatter: three 1380 mil shots at the same ΔZ span 22 m, well inside the effect. It is not terrain sampling: E7, the shot with the largest residual, landed on 2° ground.

**The firing position is on a 35–50° slope, and the first session's was not.** Sampling the local gradient at each gun spot over several footprints:

| Position | 4 m | 8 m | 16 m | 32 m |
| --- | --- | --- | --- | --- |
| E, every session-2 shot | 34.5° | 46.8° | 50.7° | 36.9° |
| C, session 1 | 0.0° | 0.0° | 0.0° | 1.0° |
| D, the 300-series | 2.1° | 0.9° | 1.9° | 1.9° |

That is the cleanest correlate found: the position with a 95 m high-arc deficit is the only one on a slope, and the arc most sensitive to launch angle is the only arc affected. It also explains why one constant offset failed, because the pitch a slope imparts along the barrel depends on which way the hull faces. Downhill at origin E is bearing 281°, and the shots span 187° to 248°, so the effective pitch differs from shot to shot.

Firing the same dial at two bearings supports it:

| Dial | Bearing 214° (67° off downhill) | Bearing 248° (33° off downhill) |
| --- | --- | --- |
| 800 | −76 m | −47, −63 m |
| 1000 | −103 m | −56, −67 m |

Aiming nearer the downhill line shrinks the error at both dials, which is the direction a nose-down hull predicts on the high arc.

**It is not proven, and this position cannot prove it.** Every shot from origin E confounds the two candidate causes: the 248° shots all landed on high ground and the 214° shots all on low ground, so target height explains the same pattern equally well, at a consistent 0.13 to 0.17 m per metre across both dials. Nothing fired from here can separate bearing from height. A caution on magnitude, too: the sampled gradient would imply 15–33° of hull pitch, which is absurd, where the best-fitting single offset is 1.1°. The game plainly does not tilt a vehicle to the full terrain gradient, and 2 m terrain data overstates the slope under a hull that spans several metres. The direction of this evidence is strong; its size is not to be read literally.

**The control settles it.** Shot F1 fired 800 mil from origin F — level ground, 0.6° to 3.4°, and in a *different tank* — and returned a residual of **−35 m**, against −30 m for the same dial from origin C in the first session, and −47 to −76 m for the same dial from the slope.

| 800 mil fired from | Ground slope | Bearing | ΔZ | Residual |
| --- | --- | --- | --- | --- |
| C, first session | 0.0–1.0° | 220° | −4.8 m | −30 m |
| **F, control** | **0.6–3.4°** | 22° | +219.8 m | **−35 m** |
| **F, control** | **0.6–3.4°** | 232° | +113.9 m | **+3 m** |
| E, the hillside | 34–51° | 248° | +65, +63 m | −47, −63 m |
| E, the hillside | 34–51° | 214° | −93 m | −76 m |

Level ground reproduces the first session and at best is exact; the slope never is. Swapping the tank changed nothing, which rules out the vehicle itself. **Vehicle attitude is therefore a first-order term on the high arc, worth roughly 40 to 80 m at 800 mil and up to 95 m across the arc** — an order of magnitude larger than the 12 m that "Dispersion" above bounded it at from traverse alone, and far larger than the model's own residual.

**There is almost no truly level ground on this map, which is the practical point.** The two control shots came from the flattest spot available at 3.4°, and they still differ from one another by 38 m at the same dial while facing opposite ways — F2 fired 100° off the downhill line and landed within 3 m of the model, F1 fired 110° off it the other way and fell 35 m short. Even the first session's pad, the only ground found at 0.0°, produced −30 m. So attitude is not an edge case that applies on hillsides; it is a term present in nearly every shot, small when the ground is near level and dominant when it is not.

Two consequences follow.

The high-arc residuals from origin E must not be used to refit anything: they measure the hull's attitude, not the shell's flight. The refit inputs are the first session's high-arc shots and the second session's **low-arc** shots, which agree with each other across positions.

And the effect is not something the calculator can correct. It has no way to know the hull's pitch, so on sloped ground the high arc will read long by up to about 95 m no matter how good the ballistics become. **What it can do is say so**, which `heightfieldSlopeDegrees` in `js/map/heightfield.js` now does: the results note warns when the ground under the gun exceeds 8°. The shipped 32 m field reads the three level firing positions in this document at 0.2°, 1.3° and 2.4° and the hillside at 30.6°, so the two are far apart even after the coarse grid smooths the slope down from its true 47°.

**The warning deliberately quotes no figure**, and the reason is a limit worth stating plainly. What moves the shell is the pitch along the barrel, and the ground slope does not determine it. A hull parked across a slope is rolled rather than pitched and hardly loses range at all; the same hull facing up or down that identical ground is pitched hard. The turret then slews on top, changing the component again while the ground beneath is unchanged. None of hull heading, hull attitude or turret bearing is available to the app.

The measurements say the same thing. Fitting a single barrel-elevation offset across the sloped session gives implied values ranging from −124 to +62 mil precisely because those shots span 187° to 248° of bearing; no one number describes the position. So a slope reading is a usable trigger and a meaningless quantity, and the note tells a player that a shot may fall short or long without pretending to know by how much or in which direction. Given how little level ground the map offers, the honest framing for a user is that the high arc carries an attitude error of tens of metres unless the gun is parked deliberately flat — which is advice the app can give even though it cannot compute the correction.

One caveat on F1 itself: it struck 43° ground at ΔZ +219.8 m, the largest height difference in this document and 210 m outside the map's declared playable bounds, so its −35 m carries perhaps ±15 m. F2, on 16° ground, is the better of the two. The conclusion rests on the separation between the level and sloped groups, which is larger than either shot's uncertainty.


#### Flight time is in better shape than range

| Shot | Dial | ΔZ | Measured | Model | Error |
| --- | --- | --- | --- | --- | --- |
| shot 9 (session 1) | 300 | −47.2 m | 14.22 s | 14.97 s | +0.75 s |
| shot 4 (session 1) | 600 | −49.6 m | 23.43 s | 23.83 s | +0.40 s |
| shot 18 (session 1) | 1200 | −48.0 m | 35.40 s | 35.43 s | +0.03 s |
| N4 | 300 | +147.3 m | 10.001 s | 10.62 s | +0.62 s |
| E2 | 440 | −95.4 m | 20.200 s | 19.91 s | −0.29 s |
| E1 | 540 | −117.2 m | 23.200 s | 22.92 s | −0.28 s |
| E3 | 35 | −102.0 m | 8.000 s | 7.03 s | **−0.97 s** |
| E5 | 100 | −105.9 m | 9.300 s | 9.23 s | −0.07 s |
| E7 | 1000 | −126.5 m | 33.800 s | 33.14 s | −0.66 s |
| E6 | 1380 | −81.9 m | 37.700 s | 37.30 s | −0.40 s |

Every error from 300 mil upward is within 0.75 s, and the video timing is itself only good to ±0.4 s; the two downhill shots from origin E agree with each other to 0.01 s. **Over most of the dial, time of flight is close to the limit of what this method can measure, while range is out by 40–120 m** — the opposite of where the effort was expected to be needed.

The exception is E3 at the dial floor, 0.97 s fast, which is the largest timing error in the set and sits where the range error is also largest and inverted. Both readings are consistent with the shell simply travelling further and longer at 35 mil than the model allows.


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

## The refit, and why it is not shipped yet

Refitting muzzle velocity, drag and the angle offset against the thirteen level-ground shots with their real ΔZ — the first session's twelve dials plus F2 — improves enormously on the data it is given and cannot be validated on anything else.

| Fit | v | k | offset | Trusted set: range / time | Held-out set: range / time |
| --- | --- | --- | --- | --- | --- |
| Currently shipped | 262.4 | 3.90 × 10⁻⁴ | 2.254° | 54.4 m / 0.49 s | 84.2 m / 0.53 s |
| Range only | 249.6 | 3.671 × 10⁻⁴ | 1.833° | **11.4 m** / 0.40 s | 128.5 m / 0.95 s |
| Range and time | 257.2 | 3.882 × 10⁻⁴ | 1.594° | 13.8 m / **0.31 s** | 123.7 m / 0.95 s |

The trusted improvement is real and it comes from one change of method: the existing fit was computed against ground assumed level, and these are computed against the ground the shells actually hit. On the low arc the current fit's residuals of +100, +117 and +76 m at 150, 200 and 300 mil fall to −3, +19 and −10 m.

**The held-out column cannot referee between them**, because every shot in it was fired from origin E, the 35–50° hillside, where hull attitude is worth up to 95 m. It measures the tank's pitch, not the fit's quality. Under those conditions the currently shipped fit happens to score best, which is not evidence that it is better — it was itself fitted to flat-assumed data, and that bias partly cancels the tilt.

So the honest position is that a large improvement is available and unverifiable. Two further facts argue for waiting rather than shipping on faith:

- **Nothing below 150 mil has ever been fired from level ground.** Both fits extrapolate there and disagree: at the 35 mil floor the shipped model says 822 m and the refit says roughly 750 m, against a single sloped measurement that fits neither. The dial floor is where the largest errors in this document live, and it is the least constrained part of either fit.
- **The refits trade range accuracy against flight time.** The range-only fit halves its range residual and doubles its held-out timing error. Only a combined objective keeps both, and even then the low dials are unconstrained.

**What would settle it: 35, 100, 440 and 540 mil fired from level ground.** Those four dials are the whole held-out set, all currently contaminated by tilt. Re-shooting them on flat ground turns an unverifiable refit into a verified one, and it is the last measurement this model needs before Early Access on 2026-09-10 makes the question moot by restoring the pak files.

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
