# B1 local acceptance evidence

B1 gives a farmer a durable anonymous job that only its random capability can read or delete. The worker receives one lease identity and one frozen run. A stale lease or changed manifest cannot complete that job.

This record covers local PostgreSQL 18 and real localhost HTTP. The inputs, registry identity, climate snapshots, and completed result used in these component tests are explicitly synthetic. They are not production recommendations or live NASA evidence.

## Reproduce the checks

Use Node 24.22.3. Set `TEST_DATABASE_URL` to an isolated PostgreSQL 18 database with permission to create and remove test schemas. The suite makes a fresh schema for each database test file and removes it afterward. Never point this variable at a production database.

Run these commands from the repository root with that environment variable set.

```sh
npx vitest run tests/backend/jobs tests/backend/api
npm run check
npm run build
```

For a local development database, copy `.env.example` to `.env`, set a local password, and start `docker compose up -d postgres`. Set `DATABASE_URL` in the migration process environment, then run `node --import tsx scripts/migrate.ts`. A repeat run does not reapply the migration. The root coordinator owns adding the npm migration command.

## Observed results

Checks ran on 14 November 2026 with Node 24.22.3 and a coordinator-provided PostgreSQL 18 Docker service. The store suite checks the server major version directly. The Compose file was checked separately with `docker compose config --quiet` and a temporary local password. The acceptance database did not require a second Docker service.

| Command | Observed result |
| --- | --- |
| `npx vitest run tests/backend/jobs tests/backend/api` | PASS. Five files and 21 tests. No skipped tests. |
| `npm run check` with the real test database | PASS. Seven files and 33 tests, TypeScript, and module boundaries. No skipped tests. |
| `npm run build` | PASS. Production routes include catalogue, submission, and job polling/deletion. |
| `docker compose config --quiet` | PASS. PostgreSQL 18 uses a persistent named volume mounted at `/var/lib/postgresql`. |
| `node --import tsx scripts/migrate.ts` with the isolated development database | PASS. First run printed `Applied 001-jobs.sql`. Second run exited successfully without applying it again. |

The initial missing-adapter test failed before implementation. Real PostgreSQL then caught a completed timestamp that PostgreSQL had formatted as a SQL timestamp instead of the required ISO string. The corrected completion writes an ISO UTC timestamp. A later configuration test caught a synchronous singleton throw. All singleton methods now reject through their promised async contract.

## Acceptance coverage

| Requirement | Executable evidence |
| --- | --- |
| Independent authorization for identical inputs | `tests/backend/jobs/store.test.ts`. Two jobs have distinct random tokens. Crossing their tokens returns null and cannot delete the other job. Only SHA-256 token hashes are stored. Tokens contain 256 random bits. |
| Concurrent claims | Twelve simultaneous claims for one queued job produce one winner. Claim uses a single `UPDATE` with a `FOR UPDATE SKIP LOCKED` candidate. |
| Stale lease rejection | An expired lease cannot renew, freeze, complete, or fail. Recovery creates a new lease identity. |
| Immutable input and frozen run | Freeze checks the created input hash, registry versions, cutoff, settings version, and climate snapshot IDs. Identical repeated freeze succeeds. A changed frozen run fails. SQL triggers also reject direct identity or frozen-run changes. |
| Completion provenance | Completion requires an available result manifest exactly equal to the persisted frozen manifest. Changed and unavailable result manifests return false and leave the job calculating. |
| Atomic completion and restart | The connection-restart case recovers the frozen run and writes one completed snapshot. `restart-process.ts` also creates and freezes a job in one Node process, exits, then recovers and completes it in a different process. Capabilities pass through IPC and are not written to evidence logs. |
| Terminal expiry | Terminal jobs remain at exactly 24 hours and are removed after 24 hours. Queued jobs remain. |
| Migrations | `migration.test.ts` runs concurrent migration commands, repeats the command, and verifies that a changed applied checksum is rejected. |
| HTTP submission and polling | `api/http.test.ts` runs a real localhost HTTP server over the PostgreSQL adapter. It checks catalogue, 202 creation, queued polling, completed polling, 204 deletion, and an empty deletion body. |
| Input validation | HTTP tests reject schema errors, unknown catalogue IDs, intersecting polygons, extra topology fields, malformed JSON, oversized bodies, and oversized streams without `Content-Length`. Concave and dateline-crossing fields remain accepted. |
| Capability isolation over HTTP | Missing and wrong tokens receive the same 404 response. Wrong-token reads and deletion cannot access a real existing job. The client sends a bearer header and puts only the job ID in the URL. |
| Request limits | The HTTP suite exhausts the submission quota and receives 429 with `rate_limited`. |
| Unavailable service | An absent database URL returns `not_configured`. Database and catalogue exceptions return sanitized 503 responses. Transport failures never substitute fixture output. |

## Public construction and operational details

- `createPgJobStore(pool: Pool): JobStore` and `hashNormalizedInput(input: FarmInput): string` are exported by `src/server/jobs/index.ts`.
- `createPlannerClient({baseUrl?, fetch?}): PlannerClient` and the browser `plannerClient` are exported by `src/client/planner.ts`.
- `createPlanApi({store, readRegistry, now?, requestsPerMinute?, dataCutoff?})` allows HTTP acceptance tests to inject their database and synthetic release. Next routes use the production `jobStore` and released registry reader.
- The production HTTP adapter freezes `GILIR_DATA_CUTOFF` when configured. Otherwise it uses the previous UTC date. A retry uses the persisted cutoff.
- The singleton pool permits idle worker-process exit. Database credentials are read only in server code.
- Request quotas are process-wide and reset each minute. The defaults are 60 submissions and 600 other requests per minute. They reset after process restart and are not a distributed rate limiter.
- Without `TEST_DATABASE_URL`, PostgreSQL and HTTP database suites are explicitly skipped. Such a run does not establish B1 acceptance.

## Review and remaining gates

The implementation was inspected with the pstack deslop criteria. Independent GPT-6 Astra review passed the implementation at `aeac4a732f78e5b3c3c2b4f48772f12a3595fd10`. It reran all 21 B1 tests, all 33 repository tests, typechecking, boundaries and the production build. Additional real-database probes covered twenty concurrent job claims, exact lease expiry, competing terminal writes and completed-result expiry. A fresh comment and suppression audit found no actionable findings. A minor stale migration-command status was corrected in this completion update.

The pstack skill was `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md`, using the Feature playbook. The frozen contracts and direct parameterized SQL adapter were approved by the coordinator. No architect arena or cross-family review is claimed. The available configured reviewers are all from the GPT family.

The root npm migration script passed against PostgreSQL 18. [PR #19](https://github.com/Quantomz/nefalos_nasa_hackathon/pull/19) records final CI and merge status. CI now runs the database cases against a PostgreSQL 18 service. B1 does not establish assembled worker behavior, live NASA retrieval, released crop coverage, or any I1, I2, or I3 completion. No deployment, paid service, or hackathon submission occurred.

The SQL locking choice follows the [PostgreSQL 18 SELECT documentation](https://www.postgresql.org/docs/18/sql-select.html). The persistent volume path follows the [official PostgreSQL Docker image documentation](https://hub.docker.com/_/postgres). Parameter binding and migration transactions follow [node-postgres query documentation](https://node-postgres.com/features/queries) and [transaction documentation](https://node-postgres.com/features/transactions).
