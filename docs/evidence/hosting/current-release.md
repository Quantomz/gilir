# Railway release on 15 November 2026

Gilir's web, worker, and hourly cleanup are deployed at `ec2ef2255ba76d6383d81dad43ff98a70584a850` in Nefalos production. The [read-back record](release-2026-11-15.json) identifies each service, deployment, source pin, and retained settings. [PR #45](https://github.com/Quantomz/nefalos_nasa_hackathon/pull/45) supplied shared snapshot support; [PR #46](https://github.com/Quantomz/nefalos_nasa_hackathon/pull/46) refreshed the strict I1 gate. Both were independently reviewed and passed CI before merging.

## Public acceptance

The [public API report](live-api-2026-11-15.json) passed at 07:48 UTC. It submitted the public illustrative Boise bean input through HTTPS and observed queued, fetching, calculating, and completed states. The production worker's [matching completion event](worker-events-2026-11-15.json) records the same job ID.

| Check | Observed result |
| --- | --- |
| Website and fixture exclusion | `/` returns 200; `/dev/fixtures` returns 404. |
| Public catalogue | `fao56-hard-windows-2026-11-15`, 40 entries. Before the update it was `v1-empty`, zero entries. |
| Saved result | Schema v2, accepted job ID, and the entire official catalogue equal to the HTTP catalogue. A repeat GET returns identical data. |
| Scientific outcome | `plan_with_warnings`, 25 usable seasons, June 1 planting, September 8 last occupied day, September 16 field availability. Rainfall mismatch is disclosed and temperature remains unassessed. |
| Frozen identity | Profile `common-bean-dry-fao56-idaho-jun` at `reviewed-2026-11-15.2`; cutoff `2026-11-14`; three climate snapshot IDs. |
| Authorization and cleanup | Missing and wrong tokens get 404 for GET and DELETE. The probe deletes only its own job and verifies subsequent authorized GET returns 404. |

This is deployed API/worker acceptance. It does not prove a complete browser journey, PDF rendering, map-provider behavior, or worldwide agronomic suitability. The [local I1 record](../I1/README.md) separately verifies SIGKILL/replay, web restart, cross-job rejection, provider fault injection, and missing-profile behavior. Those disruptive fault checks were not repeated in production.

## Rollout and settings

The web deployed first and served the current catalogue before worker and cleanup deployment began. Railway reports SUCCESS for all three exact commit identities. Each source is pinned to that commit. Branch pushes do not advance these pins; the next release must deliberately select a reviewed commit.

All application services retain the repository-root Dockerfile and `sh deploy/start.sh` role command. All three have the migration pre-deploy command and a 120-second timeout. Web and worker reached their running states with that gate configured; no separate production migration-history query was made. Worker logs explicitly show `worker_ready` before the hosted request.

Web alone has a public domain on port 8080. Worker, cleanup, and PostgreSQL have no public domains or TCP proxies. The PostgreSQL volume is confirmed in Singapore. The database deployment was not changed. Secret values were not read or written. Only the web cutoff changed, from the previously recorded June 30 value to the live-tested November 14 value; the hosted manifest confirms it.

The worker retains a 300-second drain. Cleanup retains `0 * * * *` UTC and restart policy NEVER. The new image's [execution logs](cleanup-events-2026-11-15.json) record `expired_jobs_purged` with count 0 at 08:04:27 and 08:05:38 UTC. Verification covered the scheduled interval and one owner-approved manual restart. The logs do not label trigger origin, so successful execution and the configured schedule are recorded separately.

Automatic approval review initially rejected the manual restart as an avoidable production interruption without explicit authorization. The owner then approved one cleanup restart, and that single restart was performed. No database, web, or worker restart and no schedule change accompanied it.

## Local and review evidence

The production image smoke passed migration idempotency, worker readiness, cleanup exit, non-root operation, public routes, catalogue with 40 entries, and idle SIGTERM shutdown against a disposable PostgreSQL 18 database. Its image identity is in the read-back record. The disposable smoke database was removed afterward.

The production code and dependency tree are unchanged from the PR #46 candidate that passed 1,473 tests, the separate 28-test live gate, and the production build. This follow-up changes documentation and sanitized evidence only. GitHub CI and independent review gate the documentation PR merge. Pstack `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md`, Shipping with the technical-writing workflow; local GPT review has no cloud or cross-family claim.

The [14 November deployment record](railway-production.md) remains unchanged as historical evidence. Its empty-catalogue and unverified-readiness statements describe that earlier observation.
