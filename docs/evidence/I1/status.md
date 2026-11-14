# I1 verification status

I1 remains **BLOCKED**. See [the acceptance evidence](README.md) for commands, source identity, results, and owners. The actual production catalogue has no released selectable entries, and the actual calculation thread returns `service_error` with `not_implemented` in the tested baseline.

The isolated real PostgreSQL and HTTP checks pass with controlled scientific calculations and saved real NASA responses. They cover separate worker death and replay, web restart, authorization, stale leases, terminal expiry, persistent-cache concurrency, distinct cutoff identities, injected provider failures, and process-log privacy. These checks are operational evidence. They do not satisfy the source-backed live-plan gate.

[The live preflight](live-preflight.json) records fresh actual NASA retrievals and the production blockers. The strict live test was executed separately and failed because the report is `BLOCKED`. A successful default test run skips that opt-in live test and does not close issue #11.

Independent review and merge remain with the root owner. CI and deployment are separate evidence layers. This worktree did not deploy, change board status, create a PR, or merge.
