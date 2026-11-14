# Run the backend

Use Node 24 and PostgreSQL. Run the web server and worker as separate processes from the same checkout. Apply B1 and B3 migrations before either process accepts work.

## Configure the processes

Set `DATABASE_URL` to the server-only PostgreSQL connection string. Give each worker a distinct `WORKER_ID`. Keep the connection string in the process environment.

Set `WORKER_LEASE_SECONDS` to the renewable lease duration. The default is 60 seconds. Set `WORKER_POLL_MILLISECONDS` to the idle polling interval. The default is 1000 milliseconds. Both values must be positive.

Use the same released registry and engine version in every web and worker process. The runtime pins engine version `v1`. Retain the exact releases needed by unfinished frozen jobs.

## Apply migrations

Run the migration runner after B1 is present.

```sh
npx tsx scripts/migrate.ts
```

The runner applies sorted files under `migrations/` and records them in `schema_migrations`. B3 supplies `002-climate-cache.sql`. It creates `gilir_climate_snapshots` and `gilir_climate_cache`. B1 supplies the `jobs` table.

## Start the web server

Build once, then start the HTTP process.

```sh
npm run build
npm start
```

For local web development, run `npm run dev`.

## Check worker readiness

Run the readiness command with `DATABASE_URL` and `WORKER_ID` set.

```sh
npm run worker:check
```

The command checks access to `jobs`, `gilir_climate_cache`, and `gilir_climate_snapshots`, then loads the current registry release. Success prints a JSON `worker_ready` event and exits with code 0. Failure prints `worker_startup_or_storage_failed` and exits with code 1. Verify NASA and scientific coverage through the I1 and I2 acceptance commands.

## Start and stop a worker

Start the long-running worker in a separate terminal or process supervisor.

```sh
npm run worker
```

To claim at most one job, run the command below.

```sh
npm run worker -- --once
```

Send `SIGTERM` or `SIGINT` to stop a worker. The worker finishes its current tick, stops claiming jobs, and closes its cache pool. Allow the retrieval and calculation to finish before a supervisor forces termination. A forced termination leaves the durable lease to expire. A replacement worker can then reclaim the job.

## Remove expired jobs

Run cleanup periodically through your process scheduler.

```sh
npm run cleanup
```

Cleanup calls `JobStore.purgeExpired` with the current UTC timestamp. B1 applies the 24-hour terminal retention policy. Success prints an `expired_jobs_purged` event with the count. Immutable climate cache records remain available for replay.

## Inspect worker outcomes

Use `worker_tick` events to find completed, failed, and lost-lease ticks. Events include the job ID and outcome. The runtime omits farm geometry, history, capability tokens, and provider payloads from logs.

A provider `failed` response persists the supplied `ServiceFailure`. A genuine `unavailable` response freezes its actual partial snapshots and calls the deterministic engine. The engine assesses missing scientific coverage from those same snapshots on every replay. The unavailable response's explanatory string is transient because `FrozenRun` stores the snapshots and manifest.

After freezing, retries reuse the stored normalized input, cutoff, settings, climate snapshots, and registry identity. The worker fails explicitly when that registry release or compatible frozen data is unavailable. Cache entries can advance to another immutable snapshot without changing a frozen run.

Calculation runs in a worker thread so the lease timer can renew during synchronous engine work. The runtime requires run provenance with the exact frozen manifest and renews immediately before completion. A failed renewal prevents completion or failure publication by that worker.

## Reproduce B3 component evidence

Run the injected-port and process lifecycle tests.

```sh
npx vitest run tests/backend/worker
```

To include the PostgreSQL cache cases, set `B3_TEST_DATABASE_URL` to a disposable local test database, then run the same command. The tests truncate only the two B3 cache tables in that database. They use invented provider-shaped records and synthetic calculation results.

Run the repository checks before review.

```sh
npm run check
npm run build
```

The thread implementation follows the Node worker API. Cache transactions use one checked-out PostgreSQL client and release it after commit or rollback. [Node worker threads](https://nodejs.org/api/worker_threads.html), [node-postgres transactions](https://node-postgres.com/features/transactions)
