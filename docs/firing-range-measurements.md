# Firing range measurements — 2026-09-02

SPH-2 (`id: "spg"`) and mortar, 33 shots.

Raw in-game shot data gathered at the firing range, plus what it says about the shipped firing tables. This is the first time anything in `data/weapons.json` or `data/ballistics/` has been checked against the game rather than against itself.

## Conditions

The firing range is its own map. It is not Bakurani or Ozeti, so there is no entry in `maps/` and no heightfield in `data/terrain/` — target elevations are unknown for every shot below, and nothing here can validate the elevation correction.

Coordinates are the game's own readout. They are converted to metres with the same `coordinateMetersPerUnit` of 100 that both shipped maps use. **That scale is unverified for this map.** Nothing in the session measured it, and the only shot that might have been compared against a declared range is shot 1, which is rejected below. Every range in this document inherits the assumption.

Flight times come from video timestamps, muzzle flash to impact, and are good to roughly ±0.4 s.

Three gun origins appear in the data:

| Origin | Coordinate | Note |
| --- | --- | --- |
| A | `99.49, 110.33` | Given as "where I'm standing" — may not be the gun itself. See below. |
| B | `97.73, 110.10` | |
| C | `97.73, 110.11` | Same spot as B, re-read one unit finer. |

## Every shot

| # | Dial | Origin | Impact x | Impact y | Range | Bearing | TOF | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 35 | A | 101.34 | 118.06 | 794.8 m | 13.5° | — | suspect, see below |
| 2 | 150 | A | 100.46 | 124.23 | 1393.4 m | 4.0° | — | suspect, see below |
| 3 | 200 | A | 100.61 | 126.73 | 1643.8 m | 3.9° | — | suspect, see below |
| 4 | 600 | B | 81.95 | 89.20 | 2618.8 m | 217.1° | 23.43 s | |
| 5 | 300 | B | 84.38 | 92.43 | 2214.6 m | 217.1° | — | landed in a riverbank |
| 6 | 300 | C | 83.99 | 92.99 | 2195.2 m | 218.7° | — | road, flat |
| 7 | 300 | C | 84.08 | 93.01 | 2188.0 m | 218.6° | — | road, flat |
| 8 | 300 | C | 84.02 | 93.02 | 2191.0 m | 218.7° | — | road, flat |
| 9 | 300 | C | 84.13 | 92.91 | 2192.7 m | 218.3° | 14.22 s | road, flat |
| 10 | 150 | C | 87.50 | 97.26 | 1642.5 m | 218.5° | — | |
| 11 | 200 | C | 86.17 | 95.74 | 1844.3 m | 218.8° | — | |
| 12 | 450 | C | 82.25 | 90.51 | 2497.6 m | 218.3° | — | |
| 13 | 1380 | C | 92.58 | 103.33 | 851.4 m | 217.2° | — | landed slightly on a hill |
| 14 | 1380 | C | 91.66 | 103.68 | 884.2 m | 223.4° | — | barrel traversed |
| 15 | 1380 | C | 92.06 | 103.17 | 896.2 m | 219.2° | — | barrel traversed |
| 16 | 1000 | C | 83.67 | 93.38 | 2185.4 m | 220.0° | — | |
| 17 | 800 | C | 81.36 | 91.07 | 2511.0 m | 220.7° | — | |
| 18 | 1200 | C | 87.47 | 97.78 | 1604.0 m | 219.8° | 35.40 s | |
| 19 | 1300 | C | 89.93 | 100.65 | 1226.1 m | 219.5° | — | |
| 20 | 910 | C | 82.35 | 92.10 | 2368.3 m | 220.5° | — | |
| 21 | 1030 | C | 84.20 | 94.00 | 2103.8 m | 220.0° | — | |
| 22 | 1300 | C | 89.96 | 100.66 | 1223.4 m | 219.4° | — | barrel held still |
| 23 | 1300 | C | 89.99 | 100.69 | 1219.2 m | 219.4° | — | barrel held still |
| 24 | 1300 | C | 89.98 | 100.60 | 1226.8 m | 219.2° | — | barrel held still |
| 25 | 1380 | C | 92.23 | 103.12 | 889.4 m | 218.2° | — | on a hill |
| 26 | 1380 | C | 92.03 | 103.27 | 890.4 m | 219.8° | — | on a hill |

Raw video timestamps: shot 4 fired 1.25 s, landed 24.680 s. Shot 9 fired 1.28 s, landed 15.5 s. Shot 18 fired 1.2 s, landed 36.6 s.

### Shots 1–3 are not usable

They do not fit with shots 4–18 under any single trajectory, and shot 2 (150 mil) reads 1393 m where the identical dial from origin C reads 1642 m — 249 m apart. The likely cause is that origin A was the player's position rather than the gun's; shots 4 onward were reported explicitly as the artillery piece's coordinate. Shots 2 and 3 support that reading: a gun position about 550 m from origin A reconciles both with the fitted model to within a metre. Shot 1 does not join them. Forcing all three onto one origin leaves 73 m RMS with shot 1 alone off by about 105 m, so no single displaced origin explains the set. Shot 1 is a separate, unexplained anomaly, and neither it nor the displaced origin is adopted; both are too uncertain to build on.

150 and 200 mil were re-shot from origin C as shots 10 and 11, so only **35 and 100 mil remain unmeasured**. Both are blocked by a hill on the available firing line and would need a different position with a clear lane under 1400 m. They matter because the low end of the dial is where the shipped table is furthest off, but the fit is anchored from 150 mil upward and does not depend on them.

Shot 5 is excluded from the 300 mil mean because it landed in a riverbank; at that arc's 31° descent, terrain moves the impact roughly 1.9 m per metre of drop, and the shot reads 23 m long against the four flat repeats.

## Dispersion

**The weapon has essentially none. Range spread comes from moving the barrel, not from the gun.**

Held still, at either arc, repeats land on top of each other:

| Dial | Shots | Bearing spread | Range spread |
| --- | --- | --- | --- |
| 300 (low) | 6–9 | 0.4° | **7.2 m** at 2192 m |
| 1300 (high) | 19, 22–24 | 0.3° | **7.6 m** at 1224 m |
| 1380 (high) | 25–26 | 1.6° | **1.0 m** at 890 m |

Traversed between shots, the same dial scatters more. Shots 13–15 and 25–26 are all 1380 mil from the same position, sorted here by bearing:

| # | Bearing | Range | Note |
| --- | --- | --- | --- |
| 13 | 217.22° | 851.4 m | landed slightly on a hill |
| 25 | 218.20° | 889.4 m | on a hill |
| 15 | 219.25° | 896.2 m | |
| 26 | 219.81° | 890.4 m | on a hill |
| 14 | 223.35° | 884.2 m | |

The full spread is 44.8 m, but 32.8 m of it is shot 13 alone. Without it the other four cover 12.0 m across about 5° of traverse, and range does not track bearing smoothly even then: the 0.98° from shot 13 to shot 25 is worth +38 m, the next 1.6° from shot 25 to shot 26 is worth +1 m. Shot 13 is an outlier that nothing in the data explains.

Terrain is ruled out for all of it. At 1380 mil the round descends at 85° and range changes only 0.09 m per metre of target height, so even a 100 m hill moves the impact 9 m. That clears shots 25 and 26, both noted as landing on a hill, and it means shot 13's own hill cannot account for its 33 m either.

**This makes `docs/todo.md`'s "vehicle attitude is not modelled" a measured but bounded effect.** Setting shot 13 aside, traverse is worth roughly 12 m at this arc, which at 4.68 m per mil of elevation is about 2.6 mil of induced launch angle. That is real, and it is the high arc where it bites because that is where range is most sensitive to elevation and least sensitive to terrain, but it is smaller than the model's own residual and it is not the 45 m the raw spread suggests.

## Against the shipped firing tables

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
| 1380 | high | 889.9 m | 825 m | +65 m, see below |

The tables are accurate either side of 45° elevation and degrade monotonically with distance from it — long below, short above. Extrapolating the low-arc trend to the bottom of the dial puts the error near −320 m at minimum elevation, but shots 1–3 cannot confirm that and the low dials need re-shooting.

The 1380 row is the weakest in the table. Its 889.9 m is the mean of shots 25 and 26 only, and the five shots at that dial range over 45 m once traverse and the unexplained shot 13 are included, so the +65 m there is not separable from that scatter. The high table being short is carried by the 910 through 1300 rows, which the 1380 row is consistent with but does not independently confirm.

`minElevationMil` is `20` in `data/weapons.json`. The floor was reported as about **35**, with some hesitancy, and needs one more confirmation before the value is changed.

## Derived model

The dial is true NATO mils. Fitting degrees-per-mil freely gives 0.05615; forcing the exact 6400-mils-to-a-circle value of **0.05625** does not move the residuals. The gun therefore has a plain mil sight with a small fixed offset at zero elevation, and the "low" and "high" arcs are one continuous elevation scale through 45° rather than two separate regimes.

Best fit over all twelve dials plus three flight times, quadratic drag, `θ = 2.254° + 0.05625 × mil`:

- **muzzle velocity 262.4 m/s**
- **drag coefficient 3.90 × 10⁻⁴ /m**
- range RMS **19.7 m**, flight times within 0.35 s

For comparison, the shipped tables have an RMS of roughly 73 m against the same twelve measurements, and a worst case of 150 m.

`data/ballistics/projectile-model.json` currently ships 160.1 m/s with no drag at all, fitted to the tables rather than to the game. The velocity is 37% low because the vacuum fit had to absorb the drag.

A single quadratic drag coefficient still leaves structure behind — the worst residual is 150 mil at −36 m, the shallowest shot in the set — and adding a linear drag term makes the fit worse rather than better, so the real drag law has shape a two-parameter model does not capture. Pak extraction at Early Access remains the right answer; these numbers are a stopgap that is nonetheless far closer than what ships today.

## Mortar

Fired from `98.41, 110.39`, all shots. M3's dial is inferred rather than reported; see below.

| # | Dial | Impact x | Impact y | Range | Bearing | TOF | Table | Error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | 150 | 93.90 | 105.17 | 689.8 m | 220.8° | 16.50 s | 684 m | +5.8 m |
| M2 | 450 | 95.06 | 106.54 | 510.3 m | 221.0° | 18.30 s | 509 m | +1.3 m |
| M3 | 600 (inferred, reported 650) | 95.89 | 107.47 | 385.7 m | 220.8° | 20.00 s | 385 m | +0.7 m |
| M4 | 750 | 96.82 | 108.57 | 241.7 m | 221.1° | 20.75 s | 239 m | +2.7 m |
| M5 | 850 | 97.52 | 109.37 | 135.4 m | 221.1° | 22.40 s | 132 m | +3.4 m |
| M6 | 650 | 95.57 | 108.52 | 340.0 m | 236.6° | — | 339 m | +1.0 m |
| M7 | 600 | 95.10 | 108.28 | 392.5 m | 237.5° | — | 385 m | +7.5 m |

Raw video timestamps: M1 fired 2.3 s, landed 18.8 s. M2 fired 2.5 s, landed 20.8 s. M3 fired 2.2 s, landed 22.2 s. M4 fired 1.9 s, landed ~23 s, revised down by roughly 0.5 s on review; the 20.75 s in the table came from that review and is 0.15 s longer than the raw figures give, so M4 carries more uncertainty than the rest. M5 fired 2.3 s, landed 24.7 s.

M3 was reported as 650 mil but reads 46 m long of the table at that dial, against errors of 1–8 m everywhere else. M6 and M7 later fired both dials on a cleaner lane and returned 340.0 m and 392.5 m — matching the table at 650 and 600 respectively — so the inference is that the dial was misread and M3 was fired at **600 mil**. That is what the table above records, but it is an inference from the table itself, so M3 cannot then count as evidence for the table. Terrain cannot account for the alternative: at that arc the round descends near 79° and range moves only 0.2 m per metre of height, so a 240 m drop would be needed.

### The range table is correct

Six independent shots across six dials, every error between +1.0 m and +7.5 m, all the same sign; M3 agrees too but its dial was inferred from the table, so it is not counted. **`data/weapons.json`'s mortar table needs no change.** This is the opposite of the SPG, whose low table is out by up to 150 m over the same kind of span.

### The flight times are not

| Dial | Measured | App shows | Error |
| --- | --- | --- | --- |
| 150 | 16.50 s | 15.0 s | −1.5 s |
| 450 | 18.30 s | 16.5 s | −1.8 s |
| 600 | 20.00 s | 17.1 s | −2.9 s |
| 750 | 20.75 s | 17.4 s | −3.4 s |
| 850 | 22.40 s | 17.6 s | −4.8 s |

The error grows monotonically with elevation and reaches nearly five seconds at the top of the dial. `js/features/flight-time.js` derives these from the same vacuum fit as everything else, and `docs/todo.md` calls the readout "good enough to choose an arc; not good enough for the time-on-target staggering that a battery would want" — that is now measured rather than estimated.

The branch assumption is also settled. At 150 mil the high-angle prediction is 15.0 s and the low-angle alternative 9.3 s; the measurement is 16.5 s. At 750 mil the two predictions are 17.4 s and 2.9 s against a measured 20.75 s. **The mortar fires high-angle**, which is the convention the shipped elevation correction assumes throughout.

### No usable physical fit

Quadratic drag does not describe this weapon. The best fit over four range/time pairs leaves 14 m and 1.25 s of residual and wants a muzzle velocity of 208 m/s with a drag coefficient of 2.19 × 10⁻³ /m — five times the SPG's, for a slower and lighter projectile. The parameters are numerically convenient and physically implausible, so the model form is wrong rather than merely mistuned. Fitted degrees-per-mil also comes out near 0.052 where the SPG measured exactly 0.05625, suggesting the mortar's angle is either on a different scale or not linear in the dial at all.

**The practical consequence is that no fit is needed.** The range table is already accurate, so the only thing the app has to correct is flight time, and the five measurements above can be interpolated directly rather than derived from a model that cannot be justified.

## Still unmeasured

- **The bottom of the SPG low arc**, 35 and 100 mil — no clear firing lane at the range; everything below 150 mil is extrapolated.
- **The elevation correction**, which needs known target heights and so cannot be done at this range at all.
- **Vehicle attitude** as a correctable quantity. It is now bounded at roughly 12 m on the high arc for 5° of traverse once the outlying shot 13 is set aside, but the tilt itself was never read off the game, so there is nothing to correct *with*.
- **The coordinate scale** of the range map, assumed to be 100 m per unit like the shipped maps and never checked.
- **The declared minimum range.** `minRangeKm` of 0.78 is the shipped table's 1390 mil entry, and the nearest measurement, 1380 mil, reads 65 m longer than its row, so the value is unverified and if anything understated.
