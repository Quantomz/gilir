# E3 deterministic search component evidence

This candidate implements `calculate`, `findCalendar`, `rankCandidates`, and `explainResult` against the committed E3 ports from `87f9b38`. E1 and E2 remain owned by yslee1106. The tests inject explicitly synthetic registry, cohort, and assessment ports. They establish E3 component behavior, not scientific validation or a real E1/E2 integration.

## Workflow and scope

The installed pstack skill is `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md`. The Feature playbook applies. The parent completed the how and architecture stages and supplied `.audit/gilir/e3-design.md` plus `e3-design-astra.md`. This isolated implementation runner owns only the E3 files. The parent owns the blind acceptance check, no-comments review, exact-commit review, GitHub, and any merge.

The Feature steps are tracked here with their assigned owner.

1. `how` over the affected subsystem. Completed by the parent before this implementation.
2. `architect` for parallel design exploration. Completed by the parent. The agreed design is binding.
3. Write the throughput checkpoint as four todo items. Recorded below.
4. Delegate code-writing to a subagent using your configured feature model. This arena runner owns its diff directly under the playbook's no-nested-agent exception.
5. Verify on the matching surface. Targeted behavior tests, strict result parsing, typecheck, PostgreSQL-backed full checks, and the production build ran locally.
6. Rebase into small, ordered commits. Search and ranking precede composition, explanations, and evidence. Root applies the selected candidate to the merged contract baseline.
7. If the design is contested, `interrogate` before shipping. No contested design was assigned. Independent review remains with root.
8. Run **Opening a PR**. Root owns this step. This runner does not operate GitHub.

The throughput checkpoint is complete.

- Blocking first steps. Read the instructions, contracts, agreed design, and E3 card. Install cached dependencies with Node 24 before coding.
- Independent workstreams. This runner owns one whole candidate. The competing candidate and blind verifier use separate worktrees and do not share source writes.
- Shared mutable state. Each worktree has its own dependencies and `.next` output. Root allocates the shared disposable PostgreSQL slot because backend tests truncate a shared cache.
- Smallest safe decomposition. One runner owns calendar invariants, both traversals, ranking, and composition. A single calendar validator prevents seeds and generated calendars from silently applying different rules.

Model the Domain puts complete structural state in a compact visited bitset. Boundary Discipline checks injected profiles and assessments before accepting them. Type System Discipline uses the existing contracts and schema-derived validators. The deslop pass checked the diff for redundant wrappers, narration comments, unsafe casts, and scope spill. No E1/E2 algorithm, shared contract, dependency, backend, or ownership file changed.

## Observable acceptance

| Requirement | Evidence |
| --- | --- |
| Mandatory crops, no substitutions, occupancy, turnaround, and horizon | `calendar.test.ts` checks all selected purposes, final release, exact duration proof, anniversary dates, and hard windows. |
| Repeats | `calendar.test.ts` enumerates a complete prefix and its legal repeat. `calculate.test.ts` lets a repeated crop win an explicit schedule-metric fixture. |
| Daily witness and complete proof | `calendar.test.ts` checks a nonweekly planting date and compares feasibility with a separate exhaustive oracle across 96 small state spaces. |
| Known predecessors | `calendar.test.ts` verifies prohibitions survive waiting and recorded fallow. Unknown history does not invent a predecessor. |
| Structural budget boundaries | `calendar.test.ts` checks zero, interrupted, exact exhaustion, witness-at-limit, and a supported baseline before a generated-duration proof. |
| Independent ranking counters | `calendar.test.ts` counts dead prefixes. `calculate.test.ts` checks independent zero budgets, exact score/prefix exhaustion, and incomplete ranking with a valid seed. |
| Seed assessment deduplication | `calculate.test.ts` checks baseline/witness identity once, including unavailable evidence. Seeds consume no additional assessment budget. |
| Fixed ranking | `ranking.test.ts` has a distinct winner for each tuple position, the environmental pool, all-warning candidates, baseline preference, fewer occurrences, and canonical ties. |
| Frozen precision | `ranking.test.ts` checks `Number(value.toFixed(precision))`, raw metric preservation, and invalid precision. |
| Final deciding comparison | `ranking.test.ts` checks the final runner-up after a later displacement. `explain.test.ts` checks the actual metric and values or the actual tie rule. |
| Required evidence versus contradictory output | `ranking.test.ts` rejects missing, duplicate, unavailable, wrong-unit, nonfinite, and out-of-range evidence. `calculate.test.ts` checks insufficient-data versus processing-error classification. |
| Optional temperature evidence | `calculate.test.ts` forwards annual applicability unchanged, accepts broad profiles despite unavailable annual summaries, and preserves optional temperature gaps. |
| Assessor calendar integrity | `calculate.test.ts` rejects removed, added, reordered, or altered crop, profile, version, planting, occupancy, and release records. |
| All six result states | `calculate.test.ts` exercises every state and parses the results with the strict public result schema. No-plan states have no timeline. |
| Historical support and coverage | `baseline.test.ts` checks skipped history, unsupported crops and durations, ambiguous allocations, unknown coverage, explicit fallow, approximate dates, unselected contextual crops, and optional comparison gaps. |
| Whole-sequence translation | `baseline.test.ts` checks a December-crossing sequence, leap-changed duration, and clipping explicit fallow outside the horizon without dropping a crop. |
| Baseline eligibility and recommendation | `baseline.test.ts` checks hard-window context, short supported historical duration before a generated proof, and kept history with zero budgets. `explain.test.ts` checks changed history. |
| Determinism and immutable inputs | `calculate.test.ts` deep-freezes inputs and registry data, compares repeated results, and verifies the original serialization remains unchanged. |
| Water answer invariance | `calculate.test.ts` changes only backup-water context and verifies equal plans and ranking. |
| Source-backed explanations | `explain.test.ts` preserves preparation source IDs, frozen manifest and climate metadata, separate synthetic labels, and raw new-minus-baseline deltas. Missing released source references produce a processing error. |
| Repeated-crop transitions | `explain.test.ts` matches occurrences chronologically and checks additions, removals, date shifts, and order changes. |

The synthetic metrics in these tests are invented comparison values. E3 neither computes nor publishes agronomic metrics.

## Resource behavior

Daily proof merges only `(available day, previous crop, selected mask)`. The bitset bounds retained visited state by the calendar horizon and at most twelve selected purposes. The ranking traversal does not merge histories that may score differently. It retains its current prefix, the baseline, the best and runner-up assessments, and at most two seed identities.

Each ranking prefix is unique because every parent offers a sorted, deduplicated set of next crop/date edges. A child appends one occurrence to exactly one parent. A prefix emits its complete calendar once. Generated candidates therefore need no retained set of 100,000 canonical strings. Only the independently assessed seed keys are skipped.

The default prefix limit remains an unbenchmarked deterministic safety bound. No representative performance or memory claim is made. E2's whole-calendar assessment cost remains outside this fixture evidence.

## Verification

Use the supplied local Node 24 executable directory at the start of `PATH`.

```sh
export PATH=/Users/kyusuku/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH
npm ci --offline --no-audit --no-fund
npx vitest run tests/engine/search
npm run typecheck
TEST_DATABASE_URL="$GILIR_TEST_DATABASE_URL" B3_TEST_DATABASE_URL="$GILIR_TEST_DATABASE_URL" I1_TEST_DATABASE_URL="$GILIR_TEST_DATABASE_URL" npm run check
npm run build
```

`GILIR_TEST_DATABASE_URL` represents the authorized disposable PostgreSQL 18 connection on `127.0.0.1:55418`. Credentials are omitted from this document. The first full check under the network sandbox failed with `connect EPERM`; the authorized escalated rerun used the same disposable database and passed. Live external climate acceptance was not enabled.

Verification ran on Node `v24.22.3` against the final source and test tree recorded in `f9a022273ec85fec6c098aa36fd3263d0c717cd3`.

| Command | Observed result |
| --- | --- |
| `npm ci --offline --no-audit --no-fund` | Passed. Installed 194 cached packages. |
| `npx vitest run tests/engine/search` | Passed. 76 tests in five files. |
| `npm run typecheck` | Passed. |
| `npm run check` with the three disposable database variables | Passed. 217 tests, one intentional live-climate skip, and module boundaries passed. See [check.log](check.log). |
| `npm run build` | Passed. Production webpack build and TypeScript completed. See [build.log](build.log). |
| `git diff --check` | Passed. |

The source commits are `aef137a` for calendar proof and ranking, then `f9a0222` for composition and explanations. This evidence-only follow-up does not change tested source. No performance conclusion is drawn from test-run or build timing.

## Unresolved integration limits

- The current `MetricInput` receives field lookup latitude and the first frozen snapshot's elevation. `ClimateCohort` has no E2-selected elevation field. Snapshot order is not a sufficient public selection policy. Root must add an E2-owned selected-elevation port and forward it before claiming real E2 integration.
- `SearchCoverage.ranking` has no interrupted status. When required evidence or processing fails during ranking, the result accurately returns `insufficient_data` or `service_error` and retains the operation counts. The current status remains `not_started` until the traversal has a complete or limit outcome. Root must resolve this label before shipping.
- Real crop publication, scientific metric validation, NASA acceptance, I1/I2/I3 assembled acceptance, and browser/PDF behavior are not established by these E3 fixtures.
- This candidate does not self-approve. The independent blind acceptance and exact-commit review remain with root. All configured arena models belong to GPT; no cross-family judge is configured.
