# E1 to I2 hand-off: documented test cases

This note tells the I2 card which inputs the `fao56-2026-11-14` release supports. The app never reads it. Each case is also asserted at the registry level in `tests/engine/registry/resolve.test.ts` ("I2 hand-off cases").

These are test inputs, not real farms or validated recommendations. Whether a plan comes out also depends on B2 (complete NASA climate cohort), E2 (metrics) and E3 (search).

## 1. Supported case: expect `plan` or `plan_with_warnings`

| Field | Value |
|---|---|
| Location | Near Ibadan, Nigeria. Lookup point `[3.9, 7.4]` (lon, lat); any small field polygon around it. |
| Crops | `maize-grain` |
| Water answer | any (it must not change the result) |
| Planning start | `2027-06-01` (FAO-56 row plant month is June) |
| History | skipped |
| Expected profile | `maize-grain-fao56-nigeria-humid-jun` v1: stages 20/35/40/30 = 125 days, Kc 0.3 / 1.20 / 0.35, turnaround 7 days (scheduling assumption) |
| Why it applies | The lookup point is inside the Nigeria region rectangle. It is the only maize profile covering that point. |
| Evidence gaps | None for crop profiles. Temperature rules are unassessed (none published), which does not block a plan under spec 1.1. |
| Before running | Ask kyusuku (B2) to confirm at least 15 complete replay seasons at this POWER cell. If the cohort fails, the honest result is `insufficient_data`, which does not satisfy I2's live-plan gate. |

## 2. No-calendar-fit case: expect `no_calendar_fit`

| Field | Value |
|---|---|
| Location | Near Madrid, Spain. Lookup `[-3.7, 40.4]` |
| Crops | `wheat-grain`, `maize-grain` |
| Expected profiles | `wheat-grain-fao56-mediterranean-winter-nov` (240 days) and `maize-grain-fao56-spain-california-apr` (150 days) |
| Why it cannot fit | 240 + 7 + 150 + 7 = 404 days > one calendar year, so the summed-duration lower bound proves impossibility. |

## 3. Insufficient-data case: expect `insufficient_data`

| Field | Value |
|---|---|
| Location | Near Ibadan, Nigeria. Lookup `[3.9, 7.4]` |
| Crops | `common-bean-dry` |
| Expected | `resolveRegistry` returns a `crop_profile` gap: "No released common-bean-dry profile applies at this location." There is no plan and no guessed cultivar. |

## Other supported points (for extra runs)

| Point | Crops resolved |
|---|---|
| Boise, Idaho `[-116.2, 43.6]` | maize (Idaho, 170 d), dry bean (Idaho, 100 d), wheat (35-45°N spring, 135 d). maize + bean = 170 + 7 + 100 + 7 = 284 days, which fits one year. |
| Nakuru, Kenya `[36.1, -0.3]` | maize (East Africa highland, 180 d), wheat (East Africa, 150 d) |
| Bhopal, India `[77.4, 23.3]` | maize (India dry/cool, 125 d), wheat (Central India, 120 d) |
| Fresno, California `[-119.8, 36.7]` | maize (Spain/California, 150 d), dry bean (Pakistan/California, 95 d), winter wheat (California, 180 d) |
