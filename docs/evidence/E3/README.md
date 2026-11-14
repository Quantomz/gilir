# E3 component acceptance

E3 implements deterministic calendar search, fixed ranking, historical comparison, and explanations through `calculate`, `findCalendar`, `rankCandidates`, and `explainResult`. E1 supplies released profiles and rules; E2 supplies climate cohorts and assessments. These checks use explicitly synthetic dependencies and do not establish scientific or live application acceptance.

## Verified source

Independent review approved source commit `09c42a11058f0acf4d9d9aa01ea445c5fcafbf1d` with no unresolved actionable findings. Final evidence and card updates do not change the reviewed source or tests.

| Check | Observed result |
| --- | --- |
| `npx vitest run tests/engine/search` | 147 tests passed across seven files. |
| Independent public-API acceptance | 35 tests passed, including an exhaustive oracle over 240 small calendar domains. These tests were written before either implementation was inspected. |
| `npm run check` with all three local PostgreSQL test variables | 291 passed, one intentional opt-in live-climate skip. Typecheck and module boundaries passed. [Log](check.log). |
| `npm run build` | Production build passed. [Log](build.log). |
| Independent review and comments scan | All reproduced defects closed; no added code comments or suppressions. |

Verification used Node24 and a disposable PostgreSQL18 database. `TEST_DATABASE_URL`, `B3_TEST_DATABASE_URL`, and `I1_TEST_DATABASE_URL` pointed to that database. Live external climate acceptance was disabled. No production database or provider request was needed for these checks.

## Behavior covered

| Area | Executable evidence |
| --- | --- |
| Calendar constraints and proof | `calendar.test.ts` and `independent.test.ts`: mandatory purposes, necessary repeats, inclusive occupancy, final turnaround, leap and wrapped windows, predecessor continuity, daily witnesses, duration proof, exhaustive proof, exact structural limits. |
| Ranking | `ranking.test.ts` and `independent.test.ts`: every fixed metric position, comparison precision, raw evidence preservation, environmental pools, baseline/count/canonical ties, runner-up decisions, invalid or missing evidence. |
| Baseline | `baseline.test.ts` and `acceptance-fixes.test.ts`: whole-sequence year shifts, supported historical allocations, leap effects, known fallow versus unknown coverage, contextual histories, optional lookup failures, more than twelve historical purposes, eligible baseline evidence requirements. |
| Composition and limits | `calculate.test.ts` and `acceptance-fixes.test.ts`: all six result states, independent seed assessment, exact grid/score limits, common window-edge dates, interrupted counters, required versus optional gaps, cohort-selected elevation, immutable repeated runs. |
| Dependency integrity | `calculate.test.ts` and `acceptance-fixes.test.ts`: frozen profile/rule identity, exact assessor calendar identity, equivalent cohort intervals, valid season membership, duplicate season rejection, missing released sources. |
| Explanation and provenance | `explain.test.ts` and `acceptance-fixes.test.ts`: actual deciding comparisons, raw deltas, repeated-crop transitions, source-backed preparation, approximate history, precise predecessor disclosure, frozen climate metadata and visible synthetic labels. |

Daily feasibility merges only available day, predecessor and included-crop state in a compact bitset. Ranking retains the current prefix, baseline, two seed identities, winner and runner-up. Unique crop/date edges make generated prefixes unique; the engine does not retain every complete assessment or calendar key.

Search limits count operations. The separate prefix limit is an engineering safety bound whose default has not been benchmarked on representative scientific workloads. A completed grid does not establish daily optimality.

## Integration handoff

Shared ports landed in [PR27](https://github.com/Quantomz/nefalos_nasa_hackathon/pull/27) and [PR29](https://github.com/Quantomz/nefalos_nasa_hackathon/pull/29). E2 returns annual applicability and selected elevation evidence; E3 forwards them unchanged. An evidence or processing failure after ranking starts is `interrupted`, not an operation-limit claim.

[E2 PR28](https://github.com/Quantomz/nefalos_nasa_hackathon/pull/28), inspected at `1563e0ab1f756194ebd1bbaca16f971b3c735365`, needs the new cohort elevation field when rebased. Two further code-inspection items remain for its owner: preserve raw means in assessment evidence, and distinguish historical stage allocations from generated allocations when their total durations match. The current [assessment implementation](https://github.com/Quantomz/nefalos_nasa_hackathon/blob/1563e0ab1f756194ebd1bbaca16f971b3c735365/src/engine/metrics/assess.ts) rounds returned means and searches generated stages first. E3 does not rewrite E2's scientific parameters.

Released E1 data, real E2 integration, live NASA replay, I1/I2/I3 acceptance, and browser/PDF behavior remain separate checks. E1/E2 ownership stays with yslee1106. The implementation comparison and independent reviews used GPT-family models; no cross-family judge was configured. The dedicated Comment Sicko tool was unavailable, so an independent read-only comments review was performed.
