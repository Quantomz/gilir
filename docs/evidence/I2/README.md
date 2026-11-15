# I2 evidence: released E1 registry on real NASA climate

This records I2's science cases against the released E1 registry `fao56-reviewed-2026-11-15` (rules `no-rules-2026-11-14`). The climate is real. The engine is the real `calculate` from `main` with E1, E2 and E3 merged.

This is direct-engine evidence. It does not exercise the job queue, PostgreSQL, the worker or HTTP. Those belong to I1.

## Inputs

Each case uses recorded NASA POWER daily snapshots (meteorology, solar, IMERG rainfall). They were fetched with B2 `scripts/fetch-climate.ts` at cutoff 2026-11-14 and live in `tests/integration/science/recorded/`. The lookups are the public illustrative points from `docs/evidence/E1/i2-handoff.md`. They are not farms. Settings are `defaultEngineSettings` (v2). History is skipped. Water is `rain_only`.

## How to rerun

```sh
npx vitest run tests/integration/science
npx tsx tests/integration/science/evidence.ts > docs/evidence/I2/released-run.json
```

## Observed results

Full output: `released-run.json`. Each case was calculated twice from a fresh frozen run. Both hashes matched for every case.

| Case | State | Profiles | Usable seasons | Result sha256 |
|---|---|---|---|---|
| Boise `[-116.2, 43.6]`, common-bean-dry, 2027-06-01 | `plan_with_warnings` | common-bean-dry-fao56-idaho-jun | 25 | `3b29b8c1e04183652b47a6325acbaf8433b7e43ca08679c73e9b41b2d715ad41` |
| Boise, maize-grain + common-bean-dry, 2027-04-01 | `plan_with_warnings` | maize-grain-fao56-idaho-apr, common-bean-dry-fao56-idaho-jun | 25 | `3db2c08aca865c7a9409197abd2ba2fe721bc5c0c0d29e7c22719def695ebbab` |
| Madrid `[-3.7, 40.4]`, wheat-grain + maize-grain, 2027-06-01 | `plan_with_warnings` | wheat-grain-fao56-lat35-45n-mar-apr, maize-grain-fao56-spain-california-apr | 25 | `28df2c771e8fdb2d83f230a793707b815e51bdeacd6860b4055090673e5dc2e4` |
| Boise, maize-grain + common-bean-dry + wheat-grain, 2027-04-01 | `no_calendar_fit` | the three Boise profiles | 25 | `f6dd615b0070ce3b43eb615c7b4095c67b6165fb37bebc809a97230728023f60` |
| Bangkok `[100.5, 13.75]`, common-bean-dry, 2027-06-01 | `insufficient_data` | none | 25 | `c1f4ebde1b9084706ee8ea0d162606145a95310a218fa307940f46c9bb0fda2a` |
| Ibadan `[3.9, 7.4]`, maize-grain, 2027-06-01 | `insufficient_data` | none (humid-Nigeria row withheld) | 25 | `21a9866cf14d0c5fd4a74e336806a886d20b6056ea012a051ed6d3d8f61542ba` |

Plans:

- Boise dry bean: planted 2027-11-09, last occupied 2028-02-16. Ranking tuple 0.21234 / 0.125911 / 266 / 161. Warning: rainfall mismatch.
- Boise maize and dry bean: bean 2027-04-01 to 2027-07-09, then maize 2027-09-02 to 2028-02-18. Ranking tuple 0.836596 / 0.637342 / 96 / 54. Warning: rainfall mismatch.
- Madrid wheat and maize: maize 2027-08-03 to 2027-12-30, then wheat 2028-01-07 to 2028-05-20. Ranking tuple 0.720039 / 0.550283 / 81 / 63. Warnings: rainfall mismatch and two profile limitations.
- Boise three crops: duration proof. 177 + 107 + 142 is 426 days, more than the 366-day horizon.
- Bangkok and Ibadan: one actual `crop_profile` gap from the resolver. No plan and no guessed profile.

The tests also check that every selected crop appears, that occurrences stay inside the half-open year, that nothing overlaps another occurrence or its turnaround, that occupancy equals the profile stage total, that every profile source ID is in the run's source list, that reporting backup water does not change the plan, and that no output text claims harvest probability, soil-test accuracy, pest counts or worldwide validation.

## Independent recompute

The test code has its own FAO-56 Penman-Monteith ET0 and Kc curve (`tests/integration/science/reference.ts`). It does not import engine metric code. It works from the raw recorded snapshot days.

Case: the Boise dry-bean occurrence in the first replay season starting 2001-06-01. The occurrence has 100 days and 94 rolling 7-day windows.

- Season mismatch: reference 0.08688804289145913, engine 0.08688804289145913.
- Season frequency: reference 0.1595744680851064 (15 of 94), engine 0.1595744680851064.
- Window count: 94 in both.

The tolerance is 5e-10 for mismatch and 5e-13 for frequency. The values matched exactly. The engine does not expose single-window values, so the comparison uses the per-occurrence, per-season metrics it does expose. `released-run.json` also lists the first window's daily demand and rain.

## Findings for other cards

These were not fixed here. They are outside I2's files.

1. Planting dates ignore the published planting months. The supported Boise dry-bean case plants on 9 November and runs into February, against a June row. The Boise maize row is April, and the plan plants maize on 2 September. Every released planting window has basis `recommendation`, and the engine enforces only `hard_constraint` windows. No cold rule exists for these crops, and no warning says the date is outside the published month. Winter has low water demand, so the rain-first ranking prefers it. These plans are valid under the current contract but are not agronomically credible. Owners: E1 (window basis) and E3 (out-of-window disclosure).
2. Every insufficient-data result lists two `crop_profile` gaps for the same crop. The resolver reports one. `src/engine/index.ts` adds a second ("A selected crop has no applicable released profile.") even when the resolver already reported it. Owner: E3.

## Card status

| Criterion | Result |
|---|---|
| Real-data generated or warning plan observed | PASSED with finding 1. The plans are real outputs, but their planting dates are outside the source months. |
| Source and profile audit, ranking, cohort count, rerun hash recorded | PASSED. See `released-run.json`. The fixed water-first ranking replaces the retired priority ranking. |
| True no-calendar-fit, insufficient-data and deterministic rerun cases | PASSED |
| One crop-demand or window example independently recomputed | PASSED |
| No harvest-probability, soil-test, pest-count or worldwide-validation claim | PASSED for the scanned patterns |
| Live worker and API path | NOT RUN here. Belongs to I1. |
| Peer review of the exact PR | NOT RUN |

## History

`stand-in-run.json` is the first run, made before E1 merged. It used a synthetic stand-in registry copied from the unmerged E1 branch. Merged E1 withheld the humid-Nigeria maize and Mediterranean winter-wheat rows that run depended on, so the stand-in and its cases were removed. That file is kept only as a record and is not evidence for the released catalogue.
