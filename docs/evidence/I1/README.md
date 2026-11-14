# I1 acceptance evidence

## Current harness verification

The final strict live run is **NOT RUN** in this change. The coordinator will merge the corrected E1 release before running the source-backed acceptance. The expected primary result is fixed to `plan_with_warnings`. I1 remains open until the recorded live run and independent exact-change review complete.

The harness uses the public illustrative `boise-dry-bean-june` case with `common-bean-dry`, planning start `2027-06-01`, and cutoff `2026-11-14`. The worker diagnostic imports the same case. The corrected catalogue must be `fao56-reviewed-2026-11-15`, and the result must identify `common-bean-dry-fao56-idaho-jun` at profile version `reviewed-2026-11-15.1`. These are acceptance requirements awaiting live observation.

Each frozen provider snapshot now records its actual hash, retrieval time, cutoff, daily period, day count, daily sequence completeness, native cell, units, conversion version, and supplied product release and stream evidence. Source URLs retain their origin and path. Their query, fragment, and credentials are removed. Synthetic snapshots are counted from the stored snapshot kinds. The required source period is derived from the stored input, cutoff, and target-season setting. Every required product must cover that period with consecutive daily records.

The returned and persisted report includes the selected profile and source references, actual cohort and usable-season count, unassessed checks, plan occurrence dates, result state, manifest, frozen digest, and result digest. The primary result must disclose unassessed temperature. A second HTTP request at the public Bangkok case must complete through the real registry, live NASA, PostgreSQL, and engine as `insufficient_data` with `crop_profile` gaps and an adequate real cohort. It must have no plan. That control runs after the primary job completes.

Missing, wrong, and cross-job capabilities must receive HTTP 404 for GET and DELETE before and after primary restart. Each cross-job capability belongs to a short-lived peer job removed before a worker starts. Every issued token joins the child-log and report scan. The controlled adapter case also scans its peer tokens.

A separately labelled HTTP 503 control uses the production API, registry, worker, and calculation executor configuration. Its only injected behavior is the provider response. Its fresh disposable schema avoids successful-case cache entries. It must observe three retrieval attempts and a saved `retrieval_failed` job. Preparation fails before calculation. Existing saved-response provider, expiry, stale-worker, and controlled-calculation checks retain their original scope.

The CLI and opt-in Vitest entrypoint both write the sanitized JSON report on success and partial failure. An assertion or execution failure records a fixed code and stage. The report includes code SHA, tracked-diff digest, test-case ID, opaque job IDs, expected and actual states, exit status, and cleanup outcomes. The default path is `docs/evidence/I1/current-live-report.json`. `--report` or `I1_REPORT_PATH` selects an explicit path. The historical files below keep their original contents and tested code identities.

```sh
node --import tsx tests/integration/runtime/live.ts --report docs/evidence/I1/final-live-report.json
I1_LIVE=1 I1_REPORT_PATH=docs/evidence/I1/final-live-vitest-report.json npx vitest run tests/integration/runtime/live.test.ts
```

The expected-state environment override has been removed. A no-plan result cannot satisfy the primary gate. The final report is written after owned child shutdown and schema cleanup. A report-write failure returns a sanitized CLI failure with exit 1.

### Local checks before the corrected E1 merge

The failing regression commit is `d830903`. Its synthetic snapshot test failed with `ZodError` and `Invalid input: expected "provider"`. After the fix, that test and the product metadata, individual product coverage, duplicate-day, duplicate-product, and CLI/Vitest partial-report checks pass.

| Check | Observed result | Scope |
| --- | --- | --- |
| Scoped evidence, report, acceptance, and support suites | 13 passed, 1 skipped | The schema-cleanup case requires PostgreSQL. No live provider call ran. |
| `npm run typecheck` | Passed | Current harness changes. |
| `npm run check` with `I1_LIVE` and all database variables unset | [476 passed, 29 skipped](final-harness-check.log) | Typecheck, default non-database tests, and module boundaries. |
| Final real PostgreSQL acceptance | NOT RUN by this implementation delegate | Coordinator owns the assembled run. |
| Final strict NASA acceptance and production build | NOT RUN by this implementation delegate | Coordinator owns the corrected-release verification. |
| Fresh independent exact-change review | Pending with coordinator | No independent or cross-family verdict is claimed here. |

This change uses `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md` and the Bug fix playbook. The implementation delegate owns `tests/integration/runtime/**` and `docs/evidence/I1/**`. Model the Domain placed the two public inputs in named records. Fix Root Causes replaced catalogue-order selection and hardcoded snapshot counts at their source. Type System Discipline derives evidence shapes from the contract types. The throughput checkpoint ran the focused regression and typecheck before the non-database checks, then handed live execution and review to the coordinator. The deslop pass checked the owned diff for added narration, casts, suppressions, and unused indirection.

## Historical execution records

The following records describe their pinned commits. Their FAILED, BLOCKED, and NOT RUN results remain available for comparison.

I1 remains **BLOCKED**. The production catalogue is empty, and the actual calculation thread returns `service_error` with `not_implemented`. The strict live test fails on this outcome. This evidence does not close issue #11.

The tested code commit is `58d33f4bc3a1630498acd2731a2e4d639943869c`. Its assembled component baseline is `1caf3590cd88460b1087cc5cf57019367ff28997`. These are local worktree results. They do not establish deployment behavior. The coordinator subsequently merged main and enabled the real adapter suite in GitHub CI. CI uses the disposable `gilir_i1` database and keeps the live provider gate explicitly opt-in. Final review and CI results are recorded on the PR.

## Acceptance-runner reliability fixes

The reliability code commit is `fcbd81de8aeea6d756d368c2de37b72fd8b780a1`, based on reviewed head `a8d9b3b03511ab1c5df163c722499c0f0d1628e1`. The following results cover this code. This evidence update changes documentation and logs only. It does not replace the earlier execution records below.

The [baseline reproduction](reliability-repro.log) records a real stdout pipe split across two writes. The unmodified runner threw `SyntaxError` before the complete JSON event arrived. A second child emitted its event and remained alive while its exit promise stayed pending. Manual `SIGKILL` was required for the baseline cleanup.

The process handle now parses newline-complete stdout records, keeps earlier events available, and checks both exit codes and signals. Its `exit()` deadline defaults to 20 seconds. Event and exit deadlines kill the owned child and await its closure before rejecting. Graceful shutdown escalates to `SIGKILL` after five seconds, with a five-second bound on confirming termination. The production engine diagnostic runs in an owned child with a 240-second event deadline. That child reads the same real PostgreSQL climate cache, input, and production registry, then uses the actual calculation-thread executor. The acceptance process no longer directly awaits an uncancellable calculation thread. All external unbounded child-exit waits were removed.

| Check | Observed result | Evidence scope |
| --- | --- | --- |
| `npx vitest run tests/integration/runtime` | [11 passed, 1 skipped](reliability-focused.log) | Existing real adapters plus five process-reliability regressions. Only the explicit live test is skipped. |
| `npm run check` with all three database variables set | [91 passed, 1 skipped](reliability-check.log) | Node 24, real PostgreSQL, typecheck, tests, and module boundaries. |
| `npm run build` | [Passed](reliability-build.log) | Node 24 production build. |
| Fresh `live.ts --preflight` | [BLOCKED](reliability-live-preflight.json) | Actual NASA, production HTTP API, isolated PostgreSQL, production worker, and the moved real engine diagnostic. [Raw stdout](reliability-live-preflight.log) retains migration output before the JSON report. |
| Final cleanup | [No I1 schemas or runtime children remain](reliability-cleanup.log) | Direct `pg_namespace` query and `pgrep` for the owned runtime entrypoints. |

The new regressions deliver a valid JSON event in separate stdout writes, retrieve an earlier complete event afterward, and reject a child killed by a signal. A controlled child that emits `tick` but never exits misses a 100-millisecond exit deadline and is killed. Another controlled child runs a never-returning `calculate()` through the production `executeInThread` executor. Its 100-millisecond diagnostic deadline kills the process that owns the calculation thread. These tests verify the child's PID is no longer alive. The database-enabled diagnostic regression also observes the random test schema removed after `finally` cleanup. None depends on the unfinished production engine returning its current error.

The fresh preflight returned three real provider snapshots with 9,497 days each. The production catalogue remains `v1-empty`, HTTP submission remains invalid, and the moved calculation diagnostic returns `service_error` with `not_implemented`. Child-log privacy passes. The strict opt-in live test was not repeated during this reliability fix. Its earlier failed execution remains archived in [strict-live.log](strict-live.log). Issue #11 remains open and requires source-backed live-plan and restart evidence after E1, E2, and E3 are implemented.

This fix used `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md` and its Bug fix workflow within I1's files. Model the Domain kept lifecycle ownership in one process handle. Fix Root Causes moved the stalled calculation into a process the runner can terminate. Test Behavior, Not Implementation selected real-pipe and process-liveness assertions. Laziness Protocol kept production B3 and shared contracts unchanged. Prove It Works required full checks, a fresh real diagnostic, and direct cleanup observations. The throughput checkpoint used one writer for runtime code and evidence, ran the focused suite before full checks, and left integration and fresh independent review to the root. The deslop selfcheck found no added comments, suppressions, or type casts. Fresh independent no-comments review and exact-final-head review remain with the root. The configured reviewers are GPT-only.

## Recorded results

| Check | Observed result | Evidence scope |
| --- | --- | --- |
| Required `npm run check` with every database test enabled | [86 passed, 1 skipped](check.log) | Real PostgreSQL adapters, contract tests, typecheck, and module boundaries. Only the explicit live test is skipped by default. |
| Required `npm run build` | [Passed](build.log) | Production Next.js build. |
| Focused `npx vitest run tests/integration/runtime` | [6 passed, 1 skipped](focused.log) | Four real adapter cases and two injected acceptance-runner rejection checks. |
| Live preflight | `BLOCKED`, exit 2 | Actual production catalogue and HTTP API, fresh live NASA responses, real PostgreSQL, separate production worker, and actual calculation thread. |
| Strict opt-in live acceptance | [Failed, exit 1](strict-live.log) | The returned `BLOCKED` report cannot satisfy the required `PASSED` assertion. |
| Production accepted job, source-backed plan, and live restart replay | `NOT RUN` | Blocked by E1, E2, and E3. |

The focused real adapter cases exercise these behaviors:

- A real HTTP request uses an explicitly controlled test catalogue and real PostgreSQL. Its separate worker normalizes the saved, hash-verified real NASA response bytes under `docs/evidence/B2/bangkok/`. Each of three products has 9,497 daily records from 2000-06-30 through 2026-06-30.
- The parent kills the worker with `SIGKILL` immediately after its durable freeze. A new worker process reclaims the expired lease and calculates through the production thread executor with a controlled test calculation. Replay preparation throws if called. The test compares every manifest field and a canonical JSON digest covering the full input, settings, manifest, and normalized snapshots.
- The controlled result remains identical after the HTTP process restarts on the same port. Missing tokens, incorrect tokens, and a second job's token receive HTTP 404 for reads and deletes. Child logs exclude the capability, database URL, field label, precise coordinate values, full polygon, and full input.
- Two simultaneous PostgreSQL claims acquire one job only once. Every stale lease operation fails. Frozen identity mutation fails. Terminal expiry preserves the job at exactly 24 hours, removes it immediately afterward, and produces HTTP 404 for both read and delete. A queued job remains available.
- Two independent B2 preparers concurrently write identical saved NASA response bytes with different injected retrieval timestamps through separate PostgreSQL pools into one shared cache. All six immutable snapshot identities coexist. A cache hit avoids retrieval, and a different cutoff keeps the same source bytes with a distinct returned snapshot identity.
- Controlled provider HTTP 503 responses produce `retrieval_failed` after three bounded attempts. Controlled all-missing IMERG markers produce unavailable climate evidence. An injected no-plan calculation demonstrates terminal state delivery. This case does not validate scientific missing-coverage classification.

The two acceptance-runner tests use injected ports only. They prove that `service_error` and changed frozen data are rejected. They are not live pipeline evidence.

One final repeat failed because the test process used a 0.3-second lease for full-period replay. [focused-short-lease-failed.log](focused-short-lease-failed.log) preserves the observed `lost_lease` result. The corrected setup uses a five-second freeze lease, waits 5.1 seconds after the killed process exits, and uses a thirty-second replay lease. The focused suite, complete checks, and build were rerun after that correction. The failed attempt remains visible.

## Live observations and remaining owners

[live-preflight.json](live-preflight.json) records fresh NASA content hashes, actual retrieval timestamps, native cells, source URLs, the source period, and actual production outcomes. NASA returned `ready` for all three 9,497-day products. POWER identifies API version `v2.10.3` but omits underlying product release and per-day stream attribution. Those fields remain explicitly unavailable.

| Unfinished acceptance | Status | Owner |
| --- | --- | --- |
| A released selectable crop and applicable reviewed profile | `BLOCKED`. Catalogue `v1-empty` has zero entries. The actual HTTP submission is invalid. | E1, yslee1106 |
| Actual climate cohort, ET0, and scientific metrics | `NOT RUN`. E2 is unimplemented in this baseline. | E2, yslee1106 |
| An actual source-backed plan from the calculation thread | `BLOCKED`. Actual engine diagnostic returns `service_error` and `not_implemented`. | E3, yslee1106 |
| Worker crash and web restart for a production-accepted scientific result | `NOT RUN`. The controlled adapter case passes, but the strict production gate cannot start. | I1, kyusuku after E1, E2, E3 |
| Production outage and missing scientific coverage end states | `NOT RUN`. Controlled operational fault checks pass. | I1 and E1, E2, E3 |
| Deployed service and production credentials | Outside this local evidence. | Hosting owner |

The production engine diagnostic uses real normalized NASA snapshots in the actual calculation thread. Its input was rejected by the production catalogue. It is a direct diagnostic, not a completed HTTP job.

## Reproduce the checks

Use Node 24 and the installed repository dependencies. Export `I1_TEST_DATABASE_URL` with the dedicated local database named `gilir_i1`. Keep its credential outside git. The runner refuses a different database name. It creates a unique `i1_...` schema, applies the actual migrations, and removes only that schema afterward. It allocates its own HTTP port and stops its own child processes. It does not use an existing development server.

```sh
npx vitest run tests/integration/runtime
TEST_DATABASE_URL="$I1_TEST_DATABASE_URL" B3_TEST_DATABASE_URL="$I1_TEST_DATABASE_URL" npm run check
npm run build
node --import tsx tests/integration/runtime/live.ts --preflight
I1_LIVE=1 npx vitest run tests/integration/runtime/live.test.ts
```

The first command runs the four real adapter cases only when `I1_TEST_DATABASE_URL` is set. The two injected runner checks run without it. A skipped database suite is not acceptance evidence.

The standalone preflight returns exit 2 for a recorded blocker and exit 1 for a failed check. It never converts either outcome to a pass. The strict live test requires `PASSED`. Once a production catalogue and scientific engine exist, it submits through the actual HTTP API, fetches live NASA data in a separate worker, kills that worker after freeze, replays in another process, and restarts the HTTP process. It verifies the full required source period and all three provider snapshots. The default expected result is `plan`. Set `I1_EXPECTED_STATE=plan_with_warnings` when the declared real case requires warnings. A no-plan diagnostic cannot complete I1's real-plan requirement.

## Workflow record

The I1 owner read `AGENTS.md`, `spec.md`, `docs/build-plan.md`, `docs/contracts.md`, and `docs/cards/I1.md`. The installed pstack entrypoint was `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md`, using the Feature playbook. The root assigned this isolated worktree and retained merge ownership and independent review. No nested agent was spawned.

The Model the Domain principle separated controlled operational evidence from the strict production outcome. Build the Lever produced the rerunnable scripts. Prove It Works required actual PostgreSQL, HTTP, process death, live provider observations, and explicit failure results. The throughput checkpoint kept startup and contract inspection first, used one process-owning test workstream, isolated schema and port state, and left peer review to the root.

The deslop and no-comments selfchecks found no added comments, suppression directives, or `any` escapes. Independent exact-commit review remains with the root. The configured panel is GPT-only and supplies no cross-family reviewer.
