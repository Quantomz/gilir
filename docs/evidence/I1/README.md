# I1 real pipeline acceptance

**Current-release runtime acceptance passed on 15 November 2026.** The [strict report](live-hard-windows-2026-11-15.json) and [test log](hard-windows-live-test.log) record 28 passing tests with live NASA, PostgreSQL, HTTP, and separate worker processes. This refresh follows the hard planting-window release and snapshot v2. It does not establish Railway deployment or frontend I3 acceptance.

The tested production code is `f79ffd7920f46db9c59828b6d017e12413f8c1b2`. The six-file I1 harness patch has SHA-256 `948e275c5dcca6a480015ad2095cd02cd3921812594410bfd1cb9a49bec6a747`, recorded in the report as the binary Git diff against that commit. The follow-up PR binds this patch to its reviewed commit. Evidence files are added after execution and do not change runtime code.

## Observed result

The public illustrative Boise bean case used planning start `2027-06-01` and cutoff `2026-11-14`. It is a regional demonstration, not a surveyed farm. The release is `fao56-hard-windows-2026-11-15`, with profile `common-bean-dry-fao56-idaho-jun` at `reviewed-2026-11-15.2` and rules `no-rules-2026-11-14`.

| Check | Observed outcome |
| --- | --- |
| Real production pipeline | `plan_with_warnings`, with `rainfall_mismatch` and temperature explicitly unassessed. |
| Crop dates | Planted 2027-06-01, last occupied 2027-09-08, available again 2027-09-16. The runner requires the released June window, without fixing the optimum to one day. |
| Provider evidence | Three real snapshots, zero synthetic snapshots, 9,498 consecutive daily records per product covering 2000-05-31 through 2026-06-01. |
| Scientific cohort | All 25 target seasons usable; minimum required 15. |
| Saved snapshot | Schema v2, accepted job ID, exact HTTP catalogue preserved, official label `Common bean (dry grain)`. |
| Worker and web restarts | SIGKILL after durable freeze, new worker replay without preparation, and new web process preserve frozen and saved-result digests. |
| Authorization | Missing, wrong, and cross-job tokens rejected for GET and DELETE before and after restart. |
| Missing-profile control | Real Bangkok request returns `insufficient_data`, crop-profile gaps, no plan, and 25 usable seasons. |
| Provider outage control | Separately injected HTTP 503 responses yield `retrieval_failed` after three attempts. No fixture supplies the primary scientific result. |
| Privacy and cleanup | Child-log and report scans pass. All eight live child processes stopped and owned schemas removed. |

The report preserves provider hashes, retrieval times, native cells, periods, units, conversion methods, profile sources, and observed dates. NASA POWER omits underlying source-release versions and per-day stream attribution; these remain explicitly unavailable. Source URLs omit coordinates and queries.

## Verification

Node 24.22.3 and disposable PostgreSQL 18 were used. [Full checks](hard-windows-check.log) passed 1,473 tests, typechecking, and module boundaries. The one live opt-in skip in that command was satisfied by the separate strict run above. The [production build](hard-windows-build.log) passed. Independent review and GitHub checks are recorded on the follow-up PR before merge. Review uses local GPT agents; no cloud or cross-family review is claimed.

The regression suite rejects stable malformed completions even when web restart returns identical bytes. Newly completed v1, another job ID, a mismatched catalogue, absent selected-crop metadata, and changed official labels cannot satisfy the gate. Existing provider, authorization, expiry, stale-lease, and frozen-replay checks remain.

## Historical evidence

The [stale-run reproduction](failed-stale-release-2026-11-15.json) failed at `http_catalogue` before NASA retrieval because it expected the older catalogue release. The current pins correct that expectation and preserve strict scientific assertions.

The earlier [advisory-window acceptance](advisory-window-acceptance.md) and its original reports remain unchanged. Its November-to-February bean dates describe the older release and are not the current observed plan. [Older failed and blocked runs](historical-evidence.md) remain archived. Runtime acceptance does not certify farming suitability, worldwide coverage, or frontend completion.

## Reproduce

Use Node 24 and set `I1_TEST_DATABASE_URL` outside Git to the disposable local database named `gilir_i1`. The runner allocates its own ports, random schemas, and child processes.

```sh
I1_LIVE=1 I1_REPORT_PATH=docs/evidence/I1/new-live-report.json npx vitest run tests/integration/runtime
TEST_DATABASE_URL="$I1_TEST_DATABASE_URL" B3_TEST_DATABASE_URL="$I1_TEST_DATABASE_URL" npm run check
npm run build
```

Run one strict entrypoint. The CLI alternative is `node --import tsx tests/integration/runtime/live.ts --report docs/evidence/I1/new-live-report.json`. A preflight or skipped live test cannot satisfy acceptance. The primary expected state cannot be overridden through the environment.

Pstack entrypoint `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md`, Bug fix and Shipping playbooks. Scope is I1 harness and evidence only. Production runtime, reviewed crop data, and F4 code are unchanged.
