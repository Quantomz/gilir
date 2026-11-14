# I1 acceptance evidence

I1 remains **BLOCKED**. The production catalogue is empty, and the actual calculation thread returns `service_error` with `not_implemented`. The strict live test fails on this outcome. This evidence does not close issue #11.

The tested code commit is `58d33f4bc3a1630498acd2731a2e4d639943869c`. Its assembled component baseline is `1caf3590cd88460b1087cc5cf57019367ff28997`. These are local worktree results. They do not establish deployment behavior.

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
