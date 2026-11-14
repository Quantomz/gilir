# Railway production evidence

Recorded on 14 November 2026. The deployment coordinator observed the dashboard state and ran the HTTP checks below. The documentation worker inspected the captured response headers and bodies. The owner approved deployment, additional Railway usage charges, and then the public web domain. No database credentials or farm inputs appear in this note.

## Deployment identity

| Resource | Observed identity |
| --- | --- |
| Workspace | Nefalos, `b092dee0-34fb-4b63-9189-e0217fa75aa3` |
| Project | [gilir](https://railway.com/project/a110cf19-bdbc-45eb-9769-e4c98ffeee82), `a110cf19-bdbc-45eb-9769-e4c98ffeee82` |
| Environment | production, `05626386-ac59-4759-9f42-2118d6941513` |
| Reviewed source | `Quantomz/nefalos_nasa_hackathon`, `main`, `6fd5cb37a6939209af6fda748bd5ab496f03b122` |
| Public website | [gilir-web-production.up.railway.app](https://gilir-web-production.up.railway.app/), target port `8080` |

All application services use the repository-root `Dockerfile` and one Singapore replica. The web deployment title identifies merge PR #21, consistent with the reviewed source. The exact deployed SHA has not been read from any service's deployment details. The reviewed source commit is not proof of deployed commit identity. Automatic source deployment settings remain unverified.

## Service state

| Role | Observed service name | Service ID | Observed state |
| --- | --- | --- | --- |
| Web | `gilir-web` | `a35f0405-2be2-479f-9e3d-31fa92a0dcb8` | Online, with public HTTP responses below |
| Worker | `nefalos_nasa_hackathon Copy` | `1bcb4429-f681-49f1-abfc-c36922c2398e` | Online. Runtime readiness log not yet verified |
| Cleanup | `nefalos_nasa_hackathon Copy Copy` | `3fb355c3-e57d-44ae-9d90-5dd3c05773ce` | Image Ready, with a next hourly run shown. Successful execution not yet verified |
| PostgreSQL | `Postgres` | `cc47e8e9-8f7f-4c00-b889-a05ae72f583a` | Online after deployment and volume migration were submitted |

Only the web rename is verified. Worker and cleanup still have the observed default names. Neither has a public domain.

PostgreSQL uses `ghcr.io/railwayapp-templates/postgres-ssl:18` and volume `77a46806-0e31-4b7e-808e-e6a298065bee`. Private DNS is `postgres.railway.internal`. Public database access is disabled. The database was created in US East, and the coordinator submitted a volume move to Singapore with deployment. The final database region has not been read back.

## Service settings

The coordinator read these dashboard values before applying the deployment. The cleanup read-back also confirmed its start command, drain, hourly schedule, restart policy, and disabled Serverless setting.

| Setting | Web | Worker | Cleanup |
| --- | --- | --- | --- |
| Start command | `sh deploy/start.sh web` | `sh deploy/start.sh worker` | `sh deploy/start.sh cleanup` |
| Pre-deploy command | `sh deploy/start.sh migrate` | `sh deploy/start.sh migrate` | Not verified. Cron UI hides the fields |
| Pre-deploy timeout | 120 seconds | 120 seconds | Not verified |
| HTTP healthcheck | `/`, timeout 120 seconds | None | None |
| Restart policy | On failure, up to 10 retries | On failure, up to 10 retries | Never |
| Serverless sleeping | Off | Off | Off |
| Cron schedule | None | None | `0 * * * *` UTC |
| Draining time | 30 seconds | 300 seconds | 30 seconds |
| Public domain | Website above, port 8080 | None | None |

These configuration observations do not establish that migration or cleanup commands completed successfully.

## Runtime variables

The coordinator verified variable names and the database reference without recording the resolved secret.

| Variable | Services | Observed value |
| --- | --- | --- |
| `DATABASE_URL` | Web, worker, cleanup | `${{Postgres.DATABASE_URL}}` |
| `PORT` | Web | `8080` |
| `GILIR_DATA_CUTOFF` | Web | `2026-06-30` |
| `WORKER_LEASE_SECONDS` | Worker | `60` |
| `WORKER_POLL_MILLISECONDS` | Worker | `1000` |

## Public HTTP checks

The coordinator sent these requests to the public website after domain creation. The root response header records `2026-11-14 13:46:34 UTC`, and the job-read response records `2026-11-14 13:54:25 UTC`. Both include `x-railway-edge: sin1`. The edge header does not establish the database region.

| Request | Observed response |
| --- | --- |
| `GET /` | HTTP 200 |
| `GET /api/catalogue` | HTTP 200, `{"version":"v1-empty","entries":[]}` |
| `GET /dev/fixtures` | HTTP 404 |
| `GET /api/plans/00000000-0000-4000-8000-000000000000` with a synthetic bearer token | HTTP 404, `{"error":{"code":"not_found","message":"The job was not found.","retryable":false}}` |

The captured home page displays "Gilir development baseline" and "No farm recommendation is available in this starter." HTTP 200 confirms that starter page is reachable. It does not demonstrate a completed farmer journey, and the catalogue has no released crops.

The job probe uses a valid UUID and an invented token, not a real job capability. In the reviewed [job store](../../../src/server/jobs/index.ts), that UUID reaches a read-only `jobs` query with the token hash. The observed response supports database-backed job lookup through the deployed API. It does not prove the complete migration history, worker readiness, or a completed planning job. The request created no job and made no NASA request.

## Unverified checks

| Check | Status |
| --- | --- |
| Exact deployed commit for each application service | NOT VERIFIED |
| Web and worker migration execution logs | NOT VERIFIED |
| Worker `worker_ready` log | NOT VERIFIED |
| Successful hourly cleanup execution and exit | NOT VERIFIED |
| Cleanup pre-deploy configuration or execution | NOT VERIFIED |
| Final PostgreSQL region after the volume move | NOT VERIFIED |
| Automatic source deployment settings | NOT VERIFIED |

B1, B2, and B3 are Done. [I1 issue #11](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/11) remains open because E1 has no released entries and E2 and E3 remain `not_implemented`. Hosting evidence does not complete I1, I2, or I3 or establish scientific product readiness.

The [local image evidence](README.md) describes an earlier container verification run. Its migration, worker, and cleanup results are local evidence and do not fill the unverified hosted checks above.

## Documentation verification

This documentation change passed `npm run check` and `npm run build` with Node `v24.22.3`. The check used `TEST_DATABASE_URL`, `B3_TEST_DATABASE_URL`, and `I1_TEST_DATABASE_URL` for the authorized disposable local database, with `I1_LIVE=0`. Typechecking, module boundaries, and 91 tests passed. The one live pipeline test remained explicitly skipped. No live NASA test ran.
