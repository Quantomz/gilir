# Prepare Gilir hosting

The container setup is prepared and tested locally. The coordinator created the empty private [Gilir project](https://railway.com/project/a110cf19-bdbc-45eb-9769-e4c98ffeee82) in Nefalos after the owner requested hosting setup. A hosted database, running application, and public domain are not established by this source change. Provisioning and deployment can incur charges. Follow the owner's latest authorization when executing them.

Target the **Nefalos** Railway workspace requested by the owner. The coordinator verified workspace ID `b092dee0-34fb-4b63-9189-e0217fa75aa3` in the existing signed-in browser session. Gilir project ID is `a110cf19-bdbc-45eb-9769-e4c98ffeee82`; its production environment is `05626386-ac59-4759-9f42-2118d6941513`. Do not use the CLI's personal default workspace or the existing Caravan project. Read back service IDs from this Gilir project during provisioning.

Use one reviewed Git commit for every service. The image runs Next.js and the durable worker as separate processes. PostgreSQL stores jobs and immutable weather snapshots. The cleanup process runs hourly. Local verification is recorded in [hosting evidence](evidence/hosting/README.md).

The current application still has an empty released catalogue and unimplemented scientific engine modules. Successful process checks establish infrastructure readiness. They do not establish a usable farm planner or scientific acceptance.

## Use Railway PostgreSQL

The owner selected Railway for the website, persistent worker, and PostgreSQL. The browser calls Next.js API routes and never connects to PostgreSQL. The container remains portable because its database interface is the server-only `DATABASE_URL`.

Reference `${{Postgres.DATABASE_URL}}` from all three application services. The name `Postgres` must match the actual database service name. Keep the database on [Railway private networking](https://docs.railway.com/networking/private-networking). Do not add a public database proxy for the application. Never expose the connection through a `NEXT_PUBLIC_` variable.

## Review the Railway service settings

The following are dashboard settings to apply after approval. They are not already applied. Use the repository root as the source directory and its `Dockerfile` for each application service. Select the same approved commit for every service. Leave automatic source deployments disabled until the release workflow is approved.

| Setting | Web | Worker | Cleanup |
| --- | --- | --- | --- |
| Suggested service name | `gilir-web` | `gilir-worker` | `gilir-cleanup` |
| Builder | Dockerfile | Dockerfile | Dockerfile |
| Dockerfile path | `Dockerfile` | `Dockerfile` | `Dockerfile` |
| Start command | `sh deploy/start.sh web` | `sh deploy/start.sh worker` | `sh deploy/start.sh cleanup` |
| Pre-deploy command | `sh deploy/start.sh migrate` | `sh deploy/start.sh migrate` | `sh deploy/start.sh migrate` |
| Pre-deploy timeout | 120 seconds | 120 seconds | 120 seconds |
| Healthcheck path | `/` | None | None |
| Healthcheck timeout | 120 seconds | None | None |
| Replicas | 1 | 1 | 1 |
| Restart policy | On failure, up to 10 retries | On failure, up to 10 retries | Never |
| Serverless sleeping | Off | Off | Off |
| Cron schedule | None | None | `0 * * * *` |
| Draining time | 30 seconds | 300 seconds | 30 seconds |
| Public domain | Web service only, target port 8080 | None | None |

Each pre-deploy migration is safe to repeat. The runner serializes migrations with a PostgreSQL advisory transaction lock and checks applied file hashes. A failed [pre-deploy command](https://docs.railway.com/deployments/pre-deploy-command) prevents that deployment from starting. A web healthcheck tests the HTTP process, while worker startup separately checks database tables and the registry release.

Keep [Serverless](https://docs.railway.com/deployments/serverless) off for the worker so job processing does not depend on incoming HTTP traffic. The worker receives `SIGTERM` directly because `deploy/start.sh` replaces the shell with Node. A busy worker finishes its current tick before exiting. The configured [draining time](https://docs.railway.com/deployments/deployment-teardown) is finite. If a job exceeds it, durable lease expiry permits a replacement worker to reclaim it.

Railway's [cron scheduler](https://docs.railway.com/cron-jobs) uses UTC. The cleanup process exits when its task completes. A run that remains active prevents the next scheduled run. The hourly interval is within the documented minimum spacing of five minutes.

Do not add legacy `railway.json` or `railway.toml` files. The live [Config as Code documentation](https://docs.railway.com/config-as-code), checked on 14 November 2026, says new services cannot opt in and existing support ends on 1 December 2026. The supported [Infrastructure as Code workflow](https://docs.railway.com/infrastructure-as-code) is a future alternative to these dashboard settings. No IaC package, runner, or apply operation is part of this preparation.

## Set the runtime variables

Set these in the service environment after approving the target resources. Keep secrets out of source files, command arguments, and shared logs.

| Variable | Services | Value |
| --- | --- | --- |
| `DATABASE_URL` | All three | `${{Postgres.DATABASE_URL}}` |
| `PORT` | Web | `8080` |
| `WORKER_LEASE_SECONDS` | Worker | `60` |
| `WORKER_POLL_MILLISECONDS` | Worker | `1000` |
| `GILIR_DATA_CUTOFF` | Web | Approved ISO date no later than the available provider evidence |

The image sets `NODE_ENV=production` and disables Next.js telemetry. The worker wrapper takes its ID from `WORKER_ID`, then `RAILWAY_REPLICA_ID`, then the container hostname. Leave `WORKER_ID` unset on Railway so replicas receive distinct IDs.

The image retains development dependencies because the worker, calculation thread, cleanup, and migration runner require `tsx` and TypeScript sources at runtime. Do not prune dependencies from this image. The Node 24 base image digest is pinned in `Dockerfile`. Update that digest deliberately and rerun the checks.

## Verify the local image

Create an empty disposable PostgreSQL database named `gilir_hosting`. Supply its connection through the environment. On Docker Desktop, use `host.docker.internal` to reach a published local PostgreSQL port.

```sh
	export DATABASE_URL='postgresql://USER:PASSWORD@host.docker.internal:PORT/gilir_hosting'
	node deploy/smoke.mjs
```

The script builds the real image and applies migrations twice. It checks worker readiness, cleanup exit, a non-root runtime, HTTP 200 on port 8080, production fixture HTTP 404, the catalogue response, and idle-worker `SIGTERM` exit. It removes its own web and worker containers. It preserves the disposable database and built image for inspection. It refuses remote database hosts and any other database name.

Run `npm run check` and `npm run build` with Node 24 before review. The smoke script does not submit jobs to NASA or fabricate a successful scientific result.

## Provision only after approval

Review the confirmed Nefalos workspace ID, region, budget, exact release commit, and three application services with the owner. Creating the Railway project, adding its database or application services, applying remote migrations, and pressing **Deploy** are the remote actions outside this local preparation. Follow the owner's latest authorization before taking those steps.

After that approval, create the chosen resources, set the reviewed values, deploy the same commit to all services, and generate a public domain for web only. Read back every service setting and variable name without printing credentials. Confirm migration success, `worker_ready`, hourly cleanup completion, HTTP responses, and the deployed commit identity. Run the remaining I1, I2, and I3 acceptance checks separately before calling the product ready.
