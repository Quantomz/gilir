# I2 evidence: stand-in registry on real NASA climate

This is component evidence. It is not the live I2 gate.

The crop profiles come from a synthetic stand-in registry. E1 is not merged on `main`, so no released crop registry exists yet. The stand-in copies stage days, Kc values, the 7-day turnaround, region boxes and temperature rules from the unmerged `feat/e1-registry` branch. It is labeled synthetic in every result (`provenance.kind = "synthetic"`). It is not published crop evidence.

The climate is real. Each case uses recorded NASA POWER daily snapshots (meteorology, solar, IMERG rainfall). They were fetched with B2 `scripts/fetch-climate.ts` at cutoff 2026-11-14. They live in `tests/integration/science/recorded/`. The engine is the real `calculate` from `main` (E2 metrics, E3 search and ranking).

## How to rerun

```sh
npx vitest run tests/integration/science
npx tsx tests/integration/science/evidence.ts stand-in > docs/evidence/I2/stand-in-run.json
npx tsx tests/integration/science/evidence.ts released
```

The `released` tests and command run the same cases against `readRegistryRelease()` and the real `resolveRegistry`. They are skipped while `readCatalogue()` is empty. The command then prints `NOT RUN` and exits with code 2.

## Observed results (stand-in registry)

Full output: `stand-in-run.json`. Settings: `defaultEngineSettings` (v2). History skipped. Water `rain_only`.

| Case | State | Profiles | Usable seasons | Result sha256 |
|---|---|---|---|---|
| Ibadan `[3.9, 7.4]`, maize-grain, 2027-06-01 | `plan_with_warnings` | maize-grain-fao56-nigeria-humid-jun v2 | 25 | `a36419fe9e10bc236592422b83335b0f7b31a8e72a696334a3b39b0acba207c8` |
| Madrid `[-3.7, 40.4]`, wheat-grain + maize-grain, 2027-06-01 | `no_calendar_fit` | wheat-grain-fao56-mediterranean-winter-nov v3, maize-grain-fao56-spain-california-apr v2 | 25 | `dae0ef52b2097572bde99e27da54a7aa956e99119105c22b64665561cdd4d3d5` |
| Ibadan `[3.9, 7.4]`, common-bean-dry, 2027-06-01 | `insufficient_data` | none | 25 | `9d6a3e785fc617bb9296f069976d119965bacaa60834bac4b36d742fea79ded5` |
| Boise `[-116.2, 43.6]`, maize-grain + common-bean-dry, 2027-04-01 | `plan_with_warnings` | maize-grain-fao56-idaho-apr v2, common-bean-dry-fao56-idaho-jun v2 | 25 | `ce0c9e62a54b20ed10fb9969a0e5db57febeef7e70211f2b240802ff4954082e` |

Each case was calculated twice from a fresh frozen run. Both hashes matched.

Plans:

- Ibadan: maize planted 2027-06-29, last occupied 2027-10-31, field available 2027-11-08. Ranking tuple: mean frequency 0.230588, mean mismatch 0.10869, 241 unplanted days, longest gap 213 days. Decided on mean frequency (0.230588 versus 0.231261). Warning: rainfall mismatch.
- Boise: dry bean 2027-04-01 to 2027-07-09, then maize 2027-09-02 to 2028-02-18, field available 2028-02-26. Ranking tuple: 0.836596, 0.637342, 96 days, 54 days. Decided on longest unplanted gap (54 versus 61 days). Warnings: rainfall mismatch for both crops, temperature exposure for dry bean.
- Madrid: duration proof. 247 (wheat 240 + 7) plus 157 (maize 150 + 7) is 404 days, more than the 366-day horizon.
- Ibadan dry bean: `crop_profile` gap. No plan and no guessed profile.

The tests also check that every selected crop appears, that occurrences stay inside the half-open year, that no occurrence overlaps another one or its turnaround, that occupancy equals the profile stage total, and that reporting backup water does not change the plan.

## Independent recompute

The test code has its own FAO-56 Penman-Monteith ET0 and Kc curve (`tests/integration/science/reference.ts`). It does not import engine metric code. It uses the raw recorded snapshot days.

Case: Ibadan maize occurrence, first replay season starting 2001-06-01. The occurrence maps to replay days 2001-06-29 onward (125 days, 119 rolling 7-day windows).

- First window (2001-06-29 to 2001-07-05): demand 6.4953 mm, rain 89.95 mm, shortfall 0.
- First window with a shortfall (2001-08-02 onward): demand 12.5862 mm, rain 3.75 mm, relative shortfall 0.70206.
- Season mismatch: reference 0.22581955061528683, engine 0.22581955061528683.
- Season frequency: reference 0.4369747899159664 (52 of 119), engine 0.4369747899159664.
- Window count: 119 in both.

The tolerance is 5e-10 for mismatch and 5e-13 for frequency. The engine does not expose single-window values, so the comparison is on the per-occurrence, per-season metrics it does expose.

## Findings for other cards

These were not fixed here. They are outside I2's files.

1. Idaho maize is planted in September and runs to February (Boise case). Every E1 planting window has basis `recommendation`, and the engine treats only `hard_constraint` windows as limits. Maize has no cold rule, so no temperature warning is raised. No warning says the planting date is outside the published April window. The plan is valid under the current contract, but it is not agronomically credible. Owners: E1 (window basis) and E3 (no out-of-window disclosure).
2. The insufficient-data result lists two `crop_profile` gaps for the same crop. One comes from the resolver. The engine adds a second one ("A selected crop has no applicable released profile.") even when the resolver already reported the gap. The second text also says "released" for a synthetic registry. Owner: E3 (`src/engine/index.ts`).

## What remains

- Rerun the same cases against the released E1 registry after E1 merges. The `released` tests then run without edits. Profile versions and the ranking result may differ from the stand-in.
- Run the live worker and API path (B3, I1). This evidence calls `calculate` directly with frozen recorded climate. It does not prove the job queue, PostgreSQL or HTTP.
- Get peer review of the exact PR.
