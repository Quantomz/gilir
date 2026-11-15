# Operate Gilir hosting

Gilir is deployed in the owner's Nefalos Railway workspace. The public website is [gilir-web-production.up.railway.app](https://gilir-web-production.up.railway.app/). The [15 November release record](evidence/hosting/current-release.md) verifies the deployed API and worker, exact application commit, current catalogue, and saved planning result. It records cleanup execution separately.

Use the existing [Gilir project](https://railway.com/project/a110cf19-bdbc-45eb-9769-e4c98ffeee82) and its production environment. Confirm the workspace and service IDs against the [Railway production evidence](evidence/hosting/railway-production.md) before making changes. That historical note records the resource identities. Use the [current read-back](evidence/hosting/release-2026-11-15.json) for release settings and deployment identities. Do not use the CLI's personal default workspace or the existing Caravan project.

The owner approved deployment, additional Railway usage charges, and the public web domain. Follow the owner's current authorization for future changes. Use one reviewed Git commit for every application service and verify the deployed SHA after each release. The three application services are pinned to `ec2ef2255ba76d6383d81dad43ff98a70584a850`. Future branch pushes do not change the pinned release. Historical local container checks are recorded in [local hosting evidence](evidence/hosting/README.md).

The public catalogue now has 40 entries. A real hosted request completed with snapshot v2 and a June bean warning plan. Complete browser acceptance, map-provider behavior, and remaining results/PDF work are separate frontend gates.

## Use Railway PostgreSQL

The owner selected Railway for the website, persistent worker, and PostgreSQL. The browser calls Next.js API routes and never connects to PostgreSQL. The container remains portable because its database interface is the server-only `DATABASE_URL`.

Reference `${{Postgres.DATABASE_URL}}` from all three application services. The name `Postgres` must match the actual database service name. Keep the database on [Railway private networking](https://docs.railway.com/networking/private-networking). Do not add a public database proxy for the application. Never expose the connection through a `NEXT_PUBLIC_` variable.

## Review settings before a release

Use the repository root and its `Dockerfile` for each application service. Compare dashboard values with the [recorded service settings](evidence/hosting/railway-production.md#service-settings). Read back the source repository, branch, and selected commit before deploying. Explicit commit pins make the current release deliberate. Update web readers first, verify health and catalogue identity, then update worker and cleanup to the same reviewed commit. Read back the actual deployed commit for each service.

Retain `sh deploy/start.sh migrate` as the web and worker pre-deploy command with a 120-second timeout. The runner serializes migrations with a PostgreSQL advisory transaction lock and checks applied file hashes. A failed [pre-deploy command](https://docs.railway.com/deployments/pre-deploy-command) prevents that deployment from starting. The current API read-back also confirms the same migration command and timeout for cleanup. Successful deployment clears the configured pre-deploy gate; a separate migration-history audit was not performed. A web healthcheck tests the HTTP process, while worker startup separately checks database tables and the registry release.

Keep [Serverless](https://docs.railway.com/deployments/serverless) off for the worker so job processing does not depend on incoming HTTP traffic. The worker receives `SIGTERM` directly because `deploy/start.sh` replaces the shell with Node. A busy worker finishes its current tick before exiting. The configured [draining time](https://docs.railway.com/deployments/deployment-teardown) is finite. If a job exceeds it, durable lease expiry permits a replacement worker to reclaim it.

Railway's [cron scheduler](https://docs.railway.com/cron-jobs) uses UTC. The cleanup process exits when its task completes. A run that remains active prevents the next scheduled run. The hourly interval is within the documented minimum spacing of five minutes.

Do not add legacy `railway.json` or `railway.toml` files. The live [Config as Code documentation](https://docs.railway.com/config-as-code), checked on 14 November 2026, says new services cannot opt in and existing support ends on 1 December 2026. The supported [Infrastructure as Code workflow](https://docs.railway.com/infrastructure-as-code) is a future alternative. Use Railway service settings for this deployment.

## Set the runtime variables

Keep the [recorded runtime variables](evidence/hosting/railway-production.md#runtime-variables) in the service environment. Web uses `PORT=8080` and `GILIR_DATA_CUTOFF=2026-11-14`, confirmed by the completed hosted job manifest. Change the cutoff only to an approved ISO date supported by the available provider evidence. Keep secrets out of source files, command arguments, and shared logs.

The image sets `NODE_ENV=production` and disables Next.js telemetry. The worker wrapper takes its ID from `WORKER_ID`, then `RAILWAY_REPLICA_ID`, then the container hostname. Leave `WORKER_ID` unset on Railway so replicas receive distinct IDs.

The image retains development dependencies because the worker, calculation thread, cleanup, and migration runner require `tsx` and TypeScript sources at runtime. Do not prune dependencies from this image. The Node 24 base image digest is pinned in `Dockerfile`. Update that digest deliberately and rerun the checks.

## Enable map search and satellite imagery

Create or edit a public browser API key in the [MapTiler account](https://cloud.maptiler.com/account/keys/). When the account permits multiple keys, use separate development and production keys. For an account limited to one active key, first restrict it to `127.0.0.1` and finish the local checks. Before deployment, replace that allowed origin with `gilir-web-production.up.railway.app` and use the same key in Railway. Local live checks stop working after this change. MapTiler accepts these restrictions without a protocol or port. Keep localhost rules off the production key and do not allow unknown origins with `?`. See [MapTiler key restrictions](https://docs.maptiler.com/guides/developer/credentials/api-key/).

Set `NEXT_PUBLIC_MAPTILER_KEY` on the Railway web service before building the reviewed release. The Docker build stage declares this variable as an `ARG`, as [Railway requires for build variables](https://docs.railway.com/builds/dockerfiles#using-variables-at-build-time). [Next.js embeds public variables during the build](https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser). Rebuild the web image after adding or rotating the key. Restarting an existing image does not update its browser assets.

Use a public API key, never a MapTiler service token or database credential. The browser key is visible in downloaded JavaScript and provider requests. Keep its value out of Git, screenshots of network requests, and shared logs. Do not enable traces or HAR capture for live map checks. The worker and cleanup service do not need this variable. A build without it remains supported and offers coordinate input with an explanation.

Store the development key in an ignored `.env.local`. Supply it to both the fresh development server and the Playwright process when running the 17 cases in `tests/frontend/location/live.spec.ts`. Set `F2_LIVE=1` and `PW_CHROMIUM` to the installed browser executable. Use a dedicated local port and disable server reuse. The suite's Node-side TileJSON requests need an `Origin` or `Referer` header matching the allowed local origin. Preserve the key restriction when configuring those requests.

These cases use `/dev/fixtures` with real map providers. Production keeps that route unavailable. Verify the public `/` page separately after deployment, including submitted place search, satellite imagery, and visible attribution. Review screenshots and provider response statuses because passing the suite alone does not establish that every image loaded. Check the MapTiler plan's attribution requirements before treating F2 as complete. The [build verification record](evidence/hosting/map-provider-build.md) records the build proof. The [15 November live verification](evidence/F2/live-2026-11-15.md) records the real-provider results and remaining activation checks.

## Verify the local image

Create an empty disposable PostgreSQL database named `gilir_hosting`. Supply its connection through the environment. On Docker Desktop, use `host.docker.internal` to reach a published local PostgreSQL port.

```sh
	export DATABASE_URL='postgresql://USER:PASSWORD@host.docker.internal:PORT/gilir_hosting'
	node deploy/smoke.mjs
```

The script builds the real image and applies migrations twice. It checks worker readiness, cleanup exit, a non-root runtime, HTTP 200 on port 8080, production fixture HTTP 404, the catalogue response, and idle-worker `SIGTERM` exit. It removes its own web and worker containers. It preserves the disposable database and built image for inspection. It refuses remote database hosts and any other database name.

Run `npm run check` and `npm run build` with Node 24 before review. The smoke script does not submit jobs to NASA or fabricate a successful scientific result.

## Verify each deployment

Record the exact deployed commit for every application service. Confirm migration success in the web and worker deployment logs, `worker_ready` in worker logs, and a successful hourly cleanup exit. Read back the PostgreSQL region after a volume move. The [current production evidence](evidence/hosting/current-release.md) distinguishes observed outcomes from remaining checks. PostgreSQL is confirmed in Singapore, with no public endpoint.

Check `/`, `/api/catalogue`, and the production-only exclusion of `/dev/fixtures` through the public web domain. Use a synthetic capability and a valid, unused UUID for a read-only job lookup. Do not use another person's job ID or token. Keep public access limited to web on port 8080. Worker, cleanup, and PostgreSQL do not need public endpoints.

Keep [I1 runtime evidence](evidence/I1/README.md), [I2 science evidence](evidence/I2/README.md), and I3 browser acceptance distinct. The refreshed I1 gate and hosted API probe pass on the current release. They do not complete the full frontend journey.
