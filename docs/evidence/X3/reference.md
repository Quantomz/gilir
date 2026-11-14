# X3 independent numerical reference

The expected values were calculated before executing E2. A separate reviewer recomputed the worksheet from FAO equations and agreed within 1e-12. Runtime checks use fixed literals. They do not contain another ET0 implementation or import E2 helpers.

## Published source and adaptation

[FAO-56 chapter 4, Example 18](https://www.fao.org/4/X0490E/x0490e08.htm) reports 3.88 mm/day, rounded to 3.9, at Uccle on 6 July. The calculation uses latitude 50.8 degrees, elevation 100 m, mean temperature 16.9 degrees C, minimum 12.3, maximum 21.5, pressure 100.1 kPa, wind at 2 m of 2.078 m/s, and solar radiation 22.07 MJ/m²/day.

The example uses humidity extrema of 84% and 63%. This audit instead supplies a synthetic effective humidity of 70.5%. Applying Equation 17 to the printed saturation-pressure extrema and dividing by their mean gives approximately 70.52%. Dividing the separately rounded printed ea and es would give 70.5558%. The extrema average is 73.5%. Neither 70.5% nor 70.52% is a measured daily mean supplied by FAO.

The adapted calculation checks arithmetic for the supplied input. Agreement with the published example does not validate the mean-humidity approximation against actual weather. Days after 6 July, rainfall sequences, crop profiles, and the full-year weather padding are synthetic. No crop suitability or production recommendation follows from these checks.

## Independent derivation

The worksheet applies [FAO-56 chapter 3](https://www.fao.org/4/X0490E/x0490e07.htm) equations 8, 11, 13, 21, 23, 24, 25, 37, 38, and 39. Historical dates are consecutive UTC days from 6 July 2001. Their day-of-year numbers are 187 through 195. Radiation temperatures use 273.16 kelvin offset. The aerodynamic denominator uses T + 273. Soil heat flux is zero.

The fixed intermediate values are es = 1.9974855625338357 kPa, ea = 1.408227321586354 kPa, delta = 0.12211265844598745, and gamma = 0.0665665. Net radiation is 0.77 times solar radiation minus longwave radiation.

```text
ET0 = [0.408 * delta * Rn + gamma * 900 / (T + 273) * u2 * (es - ea)]
      / [delta + gamma * (1 + 0.34 * u2)]
```

The worksheet produces the following daily values.

| Day | Ra, MJ/m²/day | Rn, MJ/m²/day | ET0, mm/day |
| --- | --- | --- | --- |
| 187 | 41.08837556354228 | 13.28164774797432 | 3.88089551597236 |
| 188 | 41.00283450217088 | 13.26949044549650 | 3.87832582691145 |
| 189 | 40.91223008554508 | 13.25655808582310 | 3.87559231400880 |
| 190 | 40.81659165770191 | 13.24284491208785 | 3.87269376043558 |
| 191 | 40.71594992466914 | 13.22834477066337 | 3.86962886549954 |
| 192 | 40.61033692416007 | 13.21305110271389 | 3.86639624285956 |
| 193 | 40.49978599567363 | 13.19695693535694 | 3.86299441865743 |
| 194 | 40.38433175121880 | 13.18005487244396 | 3.85942182956922 |
| 195 | 40.26401004687138 | 13.16233708496930 | 3.85567682077799 |

All crop stages have Kc = 1. Four-day demand is therefore 15.507507417328185 mm. Rainfall of 1 mm/day gives one shortened window under the default seven-day setting. Frequency is 1 and mean mismatch is 0.7420604167804314. Public mismatch M recovers cumulative demand as 4 / (1 - M).

A separate four-day occurrence uses mismatchWindowDays = 1 and rain `[1, 100, 100, 100]`. All four windows are valid, and only the first has a shortfall. Frequency is 0.25 and mean mismatch is 0.18558187821055977. The first day's ET0 is recovered through the public mismatch as 1 / (1 - 4M). This is an indirect ET0 check and depends on unrounded occurrence metrics.

The nine-day rainfall sequence is `[1, 1, 1, 1, 1, 1, 1, 15, 15]`. Section 5.2 of the specification gives three rolling windows.

| Window | Demand, mm | Rain, mm | Relative shortfall |
| --- | --- | --- | --- |
| Days 1 through 7 | 27.10652694434471 | 7 | 0.74175961330744 |
| Days 2 through 8 | 27.08505325794158 | 21 | 0.22466462221769 |
| Days 3 through 9 | 27.06240425180813 | 35 | 0 |

Frequency is 2/3. Mean shortfall is 0.32214141184171. The denominator is three windows, including the zero-shortfall window. Annual metrics take the maximum across occurrences. Adding four-day wet crops with 100 mm/day therefore leaves the annual values unchanged before and after a wet repeat.

Missing humidity or rainfall on day 5 removes required evidence from every rolling window. All-zero Kc excludes every window because demand is zero. Each case requires unavailable water evidence with reasons and an insufficient-data assessment.

## Tolerances and contract

The declared absolute tolerances are 0.02 mm/day against the published adapted example, 1e-9 mm/day for recovered synthetic daily demand, and 1e-10 for fractional metrics. These tolerances were selected before engine execution. The tight synthetic tolerances test arithmetic, not scientific uncertainty or precision supported by the printed example.

[The frozen contracts](../../contracts.md#e3-engine-ports) reserve ranking rounding for E3 and require raw assessment metrics to remain available for display and audit. The audit therefore compares mean_frequency and mean_mismatch separately at rankingDecimalPlaces 0 and 6. An observed discrepancy remains a failure. Expected values are never fitted to engine output.

The synthetic registry uses `synthetic:audit-dry` and `synthetic:audit-wet` as its source identity. Published FAO references justify the independent worksheet only. They are not represented as evidence for the invented crops.
