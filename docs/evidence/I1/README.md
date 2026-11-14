# I1 real pipeline acceptance

**Runtime acceptance PASSED** at code commit `2e7e1b90bdff2d69831c02fcc54583a1f876991a`, after E1 merged as `1c448946c5ed3b63cc9e38be084c2ddc76b51fcb`. The [strict report](live-2026-11-15.json) and [test log](final-live-test.log) record 22 passing tests with no skips. The coordinator requires independent exact-head review and green CI before merging the I1 PR and closing [issue #11](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/11).

## Observed live behavior

The public illustrative Boise case selected `common-bean-dry`, planning start `2027-06-01`, and cutoff `2026-11-14`. This is an intentionally selected regional demonstration, not a surveyed farm or a farmer questionnaire. The production catalogue was `fao56-reviewed-2026-11-15`. The actual result used `common-bean-dry-fao56-idaho-jun` at version `reviewed-2026-11-15.1` and returned `plan_with_warnings`.

| Check | Observed outcome |
| --- | --- |
| Real HTTP, PostgreSQL, NASA, registry, and separate calculation worker | Accepted and completed the declared warning-plan case. No injected calculation or fixture supplied the production result. |
| Provider evidence | Three actual provider snapshots, zero synthetic snapshots, and 9,498 consecutive daily records per product, from 2000-05-31 through 2026-06-01. |
| Scientific cohort | 25 of 25 target seasons usable; minimum required 15. Actual profile, sources, methods, and unassessed temperature are retained. |
| Worker restart | Killed the first worker with SIGKILL after durable freeze. A new process reclaimed the lease. Manifest and full frozen digest remained identical. Replay preparation throws if called. |
| Web restart | A new HTTP process read the identical saved result and result digest. |
| Authorization | Missing, wrong, and another job's token received 404 for GET and DELETE before and after restart. |
| Real missing-profile control | Bangkok bean request completed as insufficient_data with only crop_profile gaps, no plan, and 25 usable real seasons. |
| Provider outage control | A fresh schema used production API, registry, cache, and worker composition with only HTTP 503 provider responses injected. Three attempts produced retrieval_failed before calculation. |
| Stale worker, expiry, cache concurrency | Real PostgreSQL controlled cases passed. These fault tests retain their explicitly controlled calculation or captured-response scope. |
| Privacy and cleanup | Child-log and artifact scans passed. All eight live child processes stopped. Direct checks after execution found zero I1 schemas and no owned runtime child processes. |

The report preserves each provider's hash, retrieval timestamp, native cell, daily period, units, conversion version, and product description. NASA POWER identifies API `v2.10.3` but omits underlying release versions and per-day stream attribution. Those fields remain explicitly unavailable. Source URLs retain origin and path without coordinates, queries, credentials, or fragments.

## Scientific handoff to I2

The returned bean occurrence runs from **2027-11-09 through 2028-02-16**, with field availability on 2028-02-24. Rainfall-only ranking selected these winter dates. The FAO June window is advisory, and the corrected release has no supported daily temperature rule. The result discloses temperature as unassessed and contains a rainfall-mismatch warning.

This observed result completes I1's runtime gate. It does not establish that winter beans in Idaho are agronomically suitable. [I2, owned by yslee1106](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/12), must assess the source applicability and warning behavior before treating this as an accepted farming recommendation. Temperature rules and hard planting constraints require separately reviewed evidence. I3 and deployed behavior also remain separate gates.

## Verification

All commands used Node 24.22.3. Database suites used the dedicated disposable PostgreSQL 18 database. [Coordinator verification](coordinator-verification.json) binds the evidence hashes and tested code.

| Command | Result |
| --- | --- |
| I1_LIVE=1 with I1_TEST_DATABASE_URL, then npx vitest run tests/integration/runtime | [22 passed, zero skipped](final-live-test.log). |
| npm run check with TEST_DATABASE_URL, B3_TEST_DATABASE_URL, and I1_TEST_DATABASE_URL | [574 passed, one explicit live opt-in skip](final-check.log). The live gate passed separately above. Typecheck and module boundaries passed. |
| npm run build | [Passed](final-build.log). |
| Direct schema and process inventory | Zero I1 schemas and zero owned runtime children after the live run and full checks. |
| Independent review | Exact-head verdict is recorded in the I1 PR conversation before merge. Reviews are local GPT; native cloud and cross-family review are unavailable. |

## Preserved failure and correction

The first assembled attempt at `6a75bbd` [failed](failed-product-identity-2026-11-15.json), with [18 passing tests and one live failure](failed-product-identity-test.log). All three real products had complete daily data, but an I1 assertion incorrectly compared descriptive product names to short product IDs. It stopped before the intended SIGKILL and replay.

Regression commit `45c4b75` reproduces the mismatch using captured NASA responses through the real normalizer. Fix `0d117df` matches the stable native-cell product ID and checks that the descriptive label agrees. Duplicate or missing products, mismatched labels, fields, periods, and manifest identities remain checked. The corrected assertion also passed against the retained first-run frozen summary before the successful rerun.

[Historical evidence](historical-evidence.md) preserves older blocked, failed, skipped, and unrun records. The original files and their code identities remain intact.

## Reproduce

Use Node 24 and the installed dependencies. Set I1_TEST_DATABASE_URL outside git to the dedicated local database named gilir_i1. The runner creates and removes only its random I1 schemas and owns its child processes and HTTP ports.

```sh
I1_LIVE=1 I1_REPORT_PATH=docs/evidence/I1/new-live-report.json npx vitest run tests/integration/runtime
TEST_DATABASE_URL="$I1_TEST_DATABASE_URL" B3_TEST_DATABASE_URL="$I1_TEST_DATABASE_URL" npm run check
npm run build
```

The CLI alternative is `node --import tsx tests/integration/runtime/live.ts --report docs/evidence/I1/new-live-report.json`. Run one strict entrypoint when repeating acceptance; the CLI and Vitest use the same runner. The expected primary result is fixed to plan_with_warnings. There is no expected-state environment override. Preflight never satisfies restart acceptance. A skipped live test is not a passing live result.

## Workflow

Pstack entrypoint `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md`, Bug fix and Shipping. Separate worktrees kept E1 data and I1 tests independent. Model the Domain made named live cases and source-row dispositions explicit. Fix Root Causes corrected the product identity comparison. Prove It Works required the real pipeline, retained failures, and direct cleanup checks. Deslop and fresh local no-comments reviews preceded final review. Merge and deployment are separate actions.
