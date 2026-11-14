# Operate Gilir hosting

Gilir is deployed in the owner's Nefalos Railway workspace. The public website is [gilir-web-production.up.railway.app](https://gilir-web-production.up.railway.app/). On 14 November 2026, the coordinator observed PostgreSQL, web, and worker Online. Cleanup showed its image Ready and a next hourly run. Cleanup execution remains unverified.

Use the existing [Gilir project](https://railway.com/project/a110cf19-bdbc-45eb-9769-e4c98ffeee82) and its production environment. Confirm the workspace and service IDs against the [Railway production evidence](evidence/hosting/railway-production.md) before making changes. That note records the applied settings, HTTP responses, and remaining verification. Do not use the CLI's personal default workspace or the existing Caravan project.

The owner approved deployment, additional Railway usage charges, and the public web domain. Follow the owner's current authorization for future changes. Use one reviewed Git commit for every application service and verify the deployed SHA after each release. The initial deployment's exact SHAs remain unverified. Historical local container checks are recorded in [local hosting evidence](evidence/hosting/README.md).

The current application still has an empty released catalogue and unimplemented scientific engine modules. The HTTP checks establish public reachability and limited API behavior. They do not establish a usable farm planner or scientific acceptance.

## Use Railway PostgreSQL

The owner selected Railway for the website, persistent worker, and PostgreSQL. The browser calls Next.js API routes and never connects to PostgreSQL. The container remains portable because its database interface is the server-only `DATABASE_URL`.

Reference `${{Postgres.DATABASE_URL}}` from all three application services. The name `Postgres` must match the actual database service name. Keep the database on [Railway private networking](https://docs.railway.com/networking/private-networking). Do not add a public database proxy for the application. Never expose the connection through a `NEXT_PUBLIC_` variable.

## Review settings before a release

Use the repository root and its `Dockerfile` for each application service. Compare dashboard values with the [recorded service settings](evidence/hosting/railway-production.md#service-settings). Read back the source repository, branch, and selected commit before deploying. Automatic source deployments have not been verified. Inspect that setting before relying on a manual release sequence.

Retain `sh deploy/start.sh migrate` as the web and worker pre-deploy command with a 120-second timeout. The runner serializes migrations with a PostgreSQL advisory transaction lock and checks applied file hashes. A failed [pre-deploy command](https://docs.railway.com/deployments/pre-deploy-command) prevents that deployment from starting. The cleanup cron UI hides pre-deploy fields, so its pre-deploy configuration and execution remain unverified. A web healthcheck tests the HTTP process, while worker startup separately checks database tables and the registry release.

Keep [Serverless](https://docs.railway.com/deployments/serverless) off for the worker so job processing does not depend on incoming HTTP traffic. The worker receives `SIGTERM` directly because `deploy/start.sh` replaces the shell with Node. A busy worker finishes its current tick before exiting. The configured [draining time](https://docs.railway.com/deployments/deployment-teardown) is finite. If a job exceeds it, durable lease expiry permits a replacement worker to reclaim it.

Railway's [cron scheduler](https://docs.railway.com/cron-jobs) uses UTC. The cleanup process exits when its task completes. A run that remains active prevents the next scheduled run. The hourly interval is within the documented minimum spacing of five minutes.

Do not add legacy `railway.json` or `railway.toml` files. The live [Config as Code documentation](https://docs.railway.com/config-as-code), checked on 14 November 2026, says new services cannot opt in and existing support ends on 1 December 2026. The supported [Infrastructure as Code workflow](https://docs.railway.com/infrastructure-as-code) is a future alternative. Use dashboard settings for this deployment.

## Set the runtime variables

Keep the [recorded runtime variables](evidence/hosting/railway-production.md#runtime-variables) in the service environment. Web uses `PORT=8080` and `GILIR_DATA_CUTOFF=2026-06-30`. Change the cutoff only to an approved ISO date supported by the available provider evidence. Keep secrets out of source files, command arguments, and shared logs.

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

## Verify each deployment

Record the exact deployed commit for every application service. Confirm migration success in the web and worker deployment logs, `worker_ready` in worker logs, and a successful hourly cleanup exit. Read back the PostgreSQL region after a volume move. The initial deployment still needs these checks, as listed in the [production evidence](evidence/hosting/railway-production.md#unverified-checks).

Check `/`, `/api/catalogue`, and the production-only exclusion of `/dev/fixtures` through the public web domain. Use a synthetic capability and a valid, unused UUID for a read-only job lookup. Do not use another person's job ID or token. Keep public access limited to web on port 8080. Worker, cleanup, and PostgreSQL do not need public endpoints.

Run the remaining I1, I2, and I3 acceptance checks separately before calling the product ready. B1, B2, and B3 are Done, but [I1 issue #11](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/11) remains open. The released catalogue is empty, and E2 and E3 remain `not_implemented`.
