# Map provider build verification

The hosting fix lets Railway supply `NEXT_PUBLIC_MAPTILER_KEY` to `next build`. It adds one build-stage `ARG`. Provider code and frontend behavior are unchanged.

Verified on 15 November 2026 against main `02eb6721b81f95859ef3a7124332308e211589be` and that commit plus the Dockerfile change. The tests used Node 24.22.3, Docker Desktop, and headless Google Chrome at 360 by 740 CSS pixels. The marker strings below are deliberately fake, not provider credentials.

## Before and after

Both images were built with `--build-arg NEXT_PUBLIC_MAPTILER_KEY=gilir_public_build_probe`. An inspection of the actual `.next/static` JavaScript returned these results.

```json
{"image":"baseline","markerPresent":false}
{"image":"fixed","markerPresent":true,"runtimeMarkerPresent":false}
```

The fixed image was inspected with runtime `NEXT_PUBLIC_MAPTILER_KEY=gilir_runtime_probe`. The runtime marker did not replace the build marker.

Each image served `/` through the real production start command at `http://127.0.0.1:3317`. Both received that different runtime marker. The browser checks returned these results.

```json
{"phase":"before","coordinateSearch":1,"placeSearch":0,"missingKey":1}
{"phase":"after","coordinateSearch":0,"placeSearch":1,"missingKey":0,"syntheticSearchReturned":true,"requestsUseBuildKey":true}
```

The fixed-image browser submitted a name and received an intercepted synthetic place. Every intercepted MapTiler request used the build marker. All external requests in the fixed-image check were intercepted. Imagery was deliberately unavailable. This verifies build-variable delivery and configured search behavior, not live geocoding or satellite imagery.

To reproduce the bundle check, build the base and candidate Dockerfiles with the same fake marker. Inspect the candidate with a different runtime marker.

```sh
	docker build --build-arg NEXT_PUBLIC_MAPTILER_KEY=gilir_public_build_probe -t gilir-map-probe .
	docker run --rm -i --network none -e NEXT_PUBLIC_MAPTILER_KEY=gilir_runtime_probe --entrypoint node gilir-map-probe <<-'NODE'
	const fs = require('node:fs');
	const root = '/app/.next/static';
	const code = fs.readdirSync(root, {recursive:true})
	  .filter(name => name.endsWith('.js'))
	  .map(name => fs.readFileSync(root + '/' + name, 'utf8')).join('\n');
	const result = {
	  markerPresent: code.includes('gilir_public_build_probe'),
	  runtimeMarkerPresent: code.includes('gilir_runtime_probe'),
	};
	console.log(JSON.stringify(result));
	if (!result.markerPresent || result.runtimeMarkerPresent) process.exit(1);
	NODE
```

## Repository checks

| Check | Observed result |
| --- | --- |
| `npm run check` with the existing local PostgreSQL 18 test database | 1,473 tests passed, one opt-in live NASA test skipped. Typechecking and module boundaries passed. |
| `vitest run tests/frontend/location` with an empty public key | 263 tests passed. |
| `npm run build` with an empty public key | Passed. |
| Actual Docker build with the fake public key | Passed. |
| Actual Docker build without a public key | Passed. |
| Live Playwright configuration discovery | Listed all 17 expected cases. No live case body ran. |

The first sandboxed check could not connect to localhost, and the first sandboxed build could not download the configured Google Fonts. Both passed when rerun with the required local database or network access. No code change was needed for those environment restrictions.

## Pending provider and hosted verification

No MapTiler key was available. The 17 live cases remain **BLOCKED**, and this change does not complete F2 or I3. The public Railway website was not redeployed for this verification.

Use separate keys for the production domain and the local test origin as described in [the hosting guide](../../hosting.md#enable-map-search-and-satellite-imagery). The Node-side TileJSON helper in the existing live suite sends no origin header. Supply the allowed test origin through its Playwright request configuration before running it. Keep trace, video, and HAR capture disabled.

After the live suite, inspect imagery and attribution in the screenshots and check actual provider response statuses. Also check the hosted `/` page after rebuilding with the production key. The live suite uses `/dev/fixtures`, which production intentionally excludes.

The current picker shows text attribution but no MapTiler logo. [MapTiler requires a linked logo for Free accounts](https://docs.maptiler.com/guides/map-design/attribution/add-attribution/). Account-plan verification and any required logo change remain with the F2 owner before enabling that plan in production. The existing live test annotates this requirement but does not assert that a logo is displayed.
