# E2 climate assessment evidence

E2 implements deterministic FAO-56 reference evaporation, released Kc stages and crop demand, historical replay, rain-demand mismatch, temperature warnings, schedule indicators, quantiles, and climate insights. The original implementation belongs to @yslee1106. The project owner authorized scoped completion fixes and the merge of PR #28; the card owner and three-hour estimate remain unchanged.

## Corrections before merge

- Compose B2's separate meteorology, solar, and rainfall snapshots by declared field ownership and exact UTC date. Missing or conflicting owners remain unavailable; no observation fallback or gap filling is used.
- Return elevation evidence from the meteorology `meanC` owner, including unavailable branches, with an explicit synthetic-fixture exception.
- Select the newest complete replay intervals before the frozen run cutoff, including backdated planning starts.
- Select generated or historical stage allocations according to calendar origin, and preserve raw assessment means independently of ranking precision.
- Keep rainfall and temperature insights available when unrelated weather fields are missing. Monthly samples join adjacent replay boundaries, use independent field completeness, and report actual sample counts and periods. Dry-spell indicators require complete precipitation for the replay interval.
- Version the methods and disclose the configured mismatch window, humidity approximation, radiation assumptions, and stage-selection policy.

The separate E3 compatibility fix in [PR #32](https://github.com/Quantomz/nefalos_nasa_hackathon/pull/32) preserves distinct historical/generated assessments with identical dates. It is merged and included in this verification. X3 expected values were not changed.

## Verified identity and workflow

- Original E2 head: `1563e0ab1f756194ebd1bbaca16f971b3c735365`.
- Regression commit: `815982e`; the new tests failed before source changes.
- Corrected E2 source: `d8d6f5900cefcebae7ae73316bcc9165aaba27b2`.
- Integrated source checked below: `5ff0606312bbcdf8fc803f76401d877e276bb548`, including main `56667ddafbed85cdf5efc90acb305f3a8c7e1930`.
- Node 24 and disposable PostgreSQL 18 were used. Test database variables enabled database and local HTTP checks.
- pstack: `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md`, Bug fix, Opening a PR, and Shipping. Investigation, two architecture alternatives, one implementation owner, deslop, and fresh independent review were used. This host supports local GPT reviewers, not Cursor cloud verification, specialized Comment Sicko, or a cross-family judge. The independent exact-head verdict is recorded on the PR.

## Executed verification

| Command or public behavior | Observed result |
| --- | --- |
| `npx vitest run tests/engine/metrics` before the source correction | 24 failed, 128 passed. |
| `npx vitest run tests/engine/metrics` after correction | 154 passed across 12 files, including two captured-provider checks. |
| `node --import tsx tests/overflow/metric-audit/run.ts` | Before: 25 passed, 4 failed, 0 skipped. After: 29 passed, 0 failed, 0 skipped. |
| `npm run check` with all three test database variables | 457 passed, 1 skipped; typecheck and module boundaries passed. |
| `npm run build` | Passed. |
| Public `calculate` with actual E2 cohort and assessment | Both origins assessed; the better same-date generated model wins and is reported as changed. |

The one skipped test is the opt-in I1 live pipeline. These results do not close I1. The current command transcripts replace the original pre-correction logs: [metric suite](vitest-metrics.txt), [full checks](npm-check.txt), [build](npm-build.txt), and [X3 audit](x3-audit.txt).

## Acceptance coverage

| E2 criterion | Evidence |
| --- | --- |
| FAO conversions and ET0, Kc interpolation, ETc | `fao56.test.ts`, `crop-demand.test.ts`, and independent X3 references. FAO's rounded examples use their printed precision; the Brussels ET0 example allows 0.05 mm/day. |
| UTC replay, 25-season target/15-season minimum, leap/cross-year days, lookback and missing data | `cohort.test.ts` and `composition.test.ts`. |
| Rolling windows, short crops, zero-demand exclusion, worst-crop aggregation | `water.test.ts` and `assessment.test.ts`; a wet repeat cannot dilute another crop's mismatch. |
| Stage-sensitive temperature, nearest-rank quantiles, occupancy and gaps | `temperature.test.ts`, `quantile.test.ts`, and `schedule.test.ts`. |
| Fixed ranking components and explicit unavailable evidence | `assessment.test.ts` and the unchanged X3 public audit. Temperature rules and adverse-season indicators remain outside ranking. |
| Rain-only behavior and pure deterministic execution | Parsed backup-water inputs pass through frozen-run cohort and assessment ports without changing supply or metrics; `purity.test.ts` and module-boundary checks pass. |
| Independent monthly rain/temperature and dry-spell evidence | `composition.test.ts` and `insights.test.ts`, including missing solar, asymmetric variable gaps, actual denominators, and July-15 starts. |

## Captured provider and integration evidence

`npx vitest run tests/engine/metrics/captured-climate.test.ts` replays the existing B2 Bangkok and Pretoria captures through public `buildClimateCohort`. Each location has three product snapshots with 9,497 daily rows each. Both produce 25 usable seasons. Selected meteorology elevations are 4.48 m and 1198.61 m respectively. Reordered snapshots produce identical results and the frozen inputs are unchanged. These are saved real NASA observations, not a fresh provider request or worldwide agronomic validation.

The [combined E2/E3 probe output](e2-e3-integration.json) uses a validated synthetic profile with generated stages `[5,1,1,1]`, historical stages `[1,1,5,1]`, and 4 mm/day of rain. Actual E2 computes historical mismatch `0.48890175468270414` and generated mismatch `0`. Actual E3 considers both, selects the unflagged generated result, retains the baseline as runner-up, and leaves the inputs unchanged. The registry resolver is injected; the cohort and assessor are the real implementations. An independent reviewer repeated this check in a separate checkout.

Real released crop data and the assembled database/HTTP/NASA/worker I1 pipeline remain unverified here. No deployment or live farm recommendation is claimed.
