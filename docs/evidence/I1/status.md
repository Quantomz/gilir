# I1 verification status

I1 remains **BLOCKED**. See [the acceptance evidence](README.md) for commands, source identity, results, and owners. The actual production catalogue has no released selectable entries, and the actual calculation thread returns `service_error` with `not_implemented` in the tested baseline.

The isolated real PostgreSQL and HTTP checks pass with controlled scientific calculations and saved real NASA responses. They cover separate worker death and replay, web restart, authorization, stale leases, terminal expiry, persistent-cache concurrency, distinct cutoff identities, injected provider failures, and process-log privacy. These checks are operational evidence. They do not satisfy the source-backed live-plan gate.

[The live preflight](live-preflight.json) records fresh actual NASA retrievals and the production blockers. The strict live test was executed separately and failed because the report is `BLOCKED`. A successful default test run skips that opt-in live test and does not close issue #11.

The acceptance-runner reliability fixes at `fcbd81de8aeea6d756d368c2de37b72fd8b780a1` pass [91 tests with real database suites enabled](reliability-check.log), the [focused 11-test suite](reliability-focused.log), and the [production build](reliability-build.log). Split stdout records, signal exits, stalled child exits, and never-returning controlled calculation threads have direct regressions. Deadlines terminate owned work and permit schema cleanup. The [fresh preflight](reliability-live-preflight.json) exercised the moved real diagnostic child and remains `BLOCKED` by the same catalogue and engine limitations. [Final cleanup](reliability-cleanup.log) observed no I1 schemas or owned runtime children. Earlier failed and blocked evidence remains preserved.

Independent review and merge remain with the root owner. CI and deployment are separate evidence layers. This worktree did not deploy, change board status, create a PR, or merge.
