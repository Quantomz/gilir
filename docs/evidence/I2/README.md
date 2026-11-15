# I2 evidence: released E1 registry on real NASA climate

This records I2's science cases against the released E1 registry `fao56-hard-windows-2026-11-15` (rules `no-rules-2026-11-14`, profile version `reviewed-2026-11-15.2`). The climate is real. The engine is the real `calculate` with E1, E2 and E3.

This is direct-engine evidence. It does not exercise the job queue, PostgreSQL, the worker or HTTP. The owner accepted I1's live-pipeline evidence (PR #36) for that path instead of a second live run here.

## Inputs

Each case uses recorded NASA POWER daily snapshots (meteorology, solar, IMERG rainfall). They were fetched with B2 `scripts/fetch-climate.ts` at cutoff 2026-11-14 and live in `tests/integration/science/recorded/`. The lookups are the public illustrative points from `docs/evidence/E1/i2-handoff.md` plus Madrid. They are not farms. Settings are `defaultEngineSettings` (v2). History is skipped. Water is `rain_only`.

## How to rerun

```sh
npx vitest run tests/integration/science
npx tsx tests/integration/science/evidence.ts > docs/evidence/I2/released-run.json
```

## Observed results

Full output: `released-run.json`. Each case was calculated twice from a fresh frozen run. Both hashes matched for every case. Every case had 25 usable seasons against a minimum of 15.

| Case | State | Profiles | Result sha256 |
|---|---|---|---|
| Boise `[-116.2, 43.6]`, common-bean-dry, 2027-06-01 | `plan_with_warnings` | common-bean-dry-fao56-idaho-jun | `cd4f53ddbfdd40920b1308a8e9f51c143dff0914dbe71c42dc5ea9384f922549` |
| Madrid `[-3.7, 40.4]`, radish + barley-grain, 2027-03-01 | `plan_with_warnings` | radish-fao56-mediterranean-europe-mar-apr, barley-grain-fao56-lat35-45n-mar-apr | `c8ec95f6cc7c4485a8a9e23f2b66d2fa5916cd33ddd44bc6d74af2683414ef26` |
| Madrid, wheat-grain + maize-grain, 2027-06-01 | `no_calendar_fit` | wheat-grain-fao56-lat35-45n-mar-apr, maize-grain-fao56-spain-california-apr | `19c986217f922d630b4e8a150bb663c017f03cc7d05762dad4eeab9f7a72e479` |
| Boise, maize-grain + common-bean-dry + wheat-grain, 2027-04-01 | `no_calendar_fit` | the three Boise profiles | `24e48c47bc01aaa89347626db693bba0f5b31cff0679ad55a921f5a9ca56cb0f` |
| Bangkok `[100.5, 13.75]`, common-bean-dry, 2027-06-01 | `insufficient_data` | none | `92129a429047948814718c9f1a1c84c01f4960ab5b6e5ada46932998f9026dc9` |
| Ibadan `[3.9, 7.4]`, maize-grain, 2027-06-01 | `insufficient_data` | none (humid-Nigeria row withheld) | `9487f696721ccdd88f53ffafcfbf86a1bb73bb2a4d13761b09e6680fbaee05d9` |

Plans:

- Boise dry bean: planted 2027-06-01, last occupied 2027-09-08, inside the June FAO-56 window. Ranking tuple 0.961702 / 0.87221 / 266 / 266. Warning: rainfall mismatch. Rainfall alone rarely meets an Idaho summer bean's demand, so this is a warning plan, as spec 1.1 requires for a known environmental mismatch.
- Madrid radish then barley: radish 2027-03-01 to 2027-04-04, barley 2027-04-12 to 2027-08-24. Both plantings are inside their March/April windows. Ranking tuple 0.898327 / 0.767329 / 196 / 189. Warnings: rainfall mismatch and two profile limitations.
- Madrid wheat and maize: the daily structural search exhausts every state (68 expanded). The durations alone (142 + 157 days) fit, but wheat must be planted in March or April and maize in April, so both cannot fit in one year.
- Boise three crops: duration proof. 177 + 107 + 142 is 426 days, more than the 366-day horizon.
- Bangkok and Ibadan: one actual `crop_profile` gap from the resolver. No plan and no guessed profile.

The tests also check that every selected crop appears, that occurrences stay inside the half-open year, that nothing overlaps another occurrence or its turnaround, that occupancy equals the profile stage total, that every planting falls inside its released hard planting window, that every profile source ID is in the run's source list, that reporting backup water does not change the plan, and that no output text claims harvest probability, soil-test accuracy, pest counts or worldwide validation.

## Independent recompute

The test code has its own FAO-56 Penman-Monteith ET0 and Kc curve (`tests/integration/science/reference.ts`). It does not import engine metric code. It works from the raw recorded snapshot days.

Case: the Boise dry-bean occurrence in the first replay season starting 2001-06-01. The occurrence has 100 days and 94 rolling 7-day windows.

- Season mismatch: reference 0.9215394159931691, engine 0.9215394159931691.
- Season frequency: reference 1 (94 of 94 windows short), engine 1.
- Window count: 94 in both.

The tolerance is 5e-10 for mismatch and 5e-13 for frequency. The values matched exactly. The engine does not expose single-window values, so the comparison uses the per-occurrence, per-season metrics it does expose. `released-run.json` also lists the first window's daily demand and rain.

## Decisions and findings

1. Planting months are hard limits. The first released catalogue `fao56-reviewed-2026-11-15` marked every FAO-56 planting window as a recommendation. The engine enforces only hard windows, so I2's first run planted Boise dry bean in November against a June row. The E1 owner decided that a Table 11 row only applies in its stated month (spec 1.1 section 6.1 item 5). E1 now publishes `fao56-hard-windows-2026-11-15` with hard windows. The previous release stays readable for frozen retries. See `docs/evidence/E1/hard-planting-windows.md`.
2. Every insufficient-data result lists two `crop_profile` gaps for the same crop. The resolver reports one. `src/engine/index.ts` adds a second ("A selected crop has no applicable released profile.") even when the resolver already reported it. Owner: E3. Not fixed here.
3. The I1 opt-in live test pins `fao56-reviewed-2026-11-15` and profile version `reviewed-2026-11-15.1` in `tests/integration/runtime/live-cases.ts`. It needs the new release identity once the E1 change merges. Owner: I1.

## Card status

The card's priority wording predates spec 1.1, which removed farmer-selected priority. This evidence follows spec 1.1. The "insufficient-priority-data case" is an `insufficient_data` case from a missing required crop profile. The "selected priority ranking" is the fixed water-first ranking tuple.

| Criterion | Result |
|---|---|
| Real-data generated or warning plan observed | PASSED. Two warning plans, both planted inside their FAO-56 windows. |
| Source and profile audit, ranking, cohort count, rerun hash recorded | PASSED. See `released-run.json`. |
| True no-calendar-fit, insufficient-data and deterministic rerun cases | PASSED. Both proof kinds are covered. |
| One crop-demand or window example independently recomputed | PASSED |
| Same crop and year constraints survive integration | PASSED |
| No harvest-probability, soil-test, pest-count or worldwide-validation claim | PASSED for the scanned patterns |
| Live worker and API path | Accepted from I1 (PR #36) by owner decision. Not rerun here. |
| pstack no-comments pass | PASSED. Comment Sicko (`pstack/agents/comment-sicko.md` from `cursor/plugins`) scanned the four science files and this README. It found no comments or suppressions, made 0 deletions and raised no `MUST KILL` flags. The plugin agent type was installed mid-session, so its definition ran in a general-purpose subagent. |
| pstack deslop pass | PASSED. `cursor-team-kit/skills/deslop` from `cursor/plugins`. It removed a leftover registry parameter from `frozenRun`, a duplicate `rankingDecision` evidence field, and duplicated mandatory-day arithmetic in the no-fit tests. All six result hashes were unchanged afterwards. `cursor-team-kit` is not listed in the marketplace manifest, so the skill was followed from the cloned source. |
| Peer review of the exact PR | NOT RUN |

## History

`stand-in-run.json` is the first run, made before E1 merged. It used a synthetic stand-in registry copied from the unmerged E1 branch. Merged E1 withheld rows that run depended on, so the stand-in was removed. That file is kept only as a record and is not evidence for any released catalogue.
