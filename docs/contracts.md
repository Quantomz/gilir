# Frozen implementation contracts

Contract version 1 is the shared starting point for all cards. `src/contracts/` is the authoritative executable/type definition. This guide names the same public entrypoints. No card begins by negotiating another person's payload.

## Public entrypoints and ownership

| Owner/card | Entrypoint | Contract and independent input |
| --- | --- | --- |
| F1 | `Onboarding` in `src/features/onboarding/index.tsx` | `OnboardingProps`. Inject `fixtureClient` and `inputFixture`. F1 owns its history editor. |
| F2 | `FieldPicker` in `src/features/location/index.tsx` | `FieldPickerProps`, with field or null and onChange. Use `inputFixture.field`. |
| F3 | `Results` in `src/features/results/index.tsx` | `ResultsProps`, with completed snapshot and onChangeInputs. Use `completedSnapshotsByState`. |
| F4 | `localPlans` in `src/client/storage.ts` | load/save/clear of LocalState. Partial draft, current step, active capability, and completed snapshot are explicit. |
| F4 | `exportPdf(snapshot)` in `src/client/pdf.ts` | Promise of a real PDF Blob. Takes a saved snapshot only. |
| B1 | `jobStore` in `src/server/jobs/index.ts` | JobStore. An injected store is sufficient for all other modules' local tests. |
| B1 | `plannerClient` in `src/client/planner.ts` | Catalogue, submit, read, remove. Frontend never imports SQL or the engine. |
| B2 | `prepareClimate({input,cutoff,settings,cache})` | Promise of ClimatePreparation. `ready`, `unavailable`, and `failed` preserve snapshots. The failed branch carries ServiceFailure for provider corruption or outage. Unexpected programming errors can throw and B3 records processing_failed. |
| B3 | `runWorkerOnce` in `src/server/runtime.ts` | Receives JobStore, prepareClimate, registry reader, calculator, fixed clock/cutoff settings, and worker ID. Tests inject these dependencies. RuntimeDependencies and its explicit unimplemented entrypoint are already present. B3 implements it. |
| E1 | `readRegistryRelease(version?)`, `readCatalogue(version?)` | Returns the immutable released version. Initial real catalogue is empty. |
| E1 | `resolveRegistry(input,registry)` | RegistryLookup to RegistryResolution, including selected applicable profiles, physical/regulatory rules, and gaps. `pestCoverage` is always unavailable in the MVP. |
| E2 | `buildClimateCohort(input)` | CohortInput to common usable seasons, excluded-season reasons, and climate insights. |
| E2 | `assessClimate(input)` | MetricInput to assessed occurrences, named metrics, flags, or missing-data evidence. Use `metricInputFixture`. |
| E3 | `calculate(run,registry,{assess?,buildCohort?,resolveRegistry?})` | FrozenRun and RegistryRelease to one PlanResult. Injection makes E3 independent of E1 and E2 implementation. |
| E3 | `findCalendar`, `rankCandidates`, `explainResult` | Exact input/result types are in `src/contracts/engine.ts`. Search proof and budget exhaustion are separate variants. |

Global package changes and contract amendments belong to kyusuku. Card-specific tests and source files belong to their card. No consumer copies schemas or casts an incompatible payload to make integration compile.

## Data conventions

- Coordinates are longitude then latitude. Field ring is closed. The shared parser verifies bounded coordinates, closure, nonzero planar area, and an inside/boundary lookup after longitude unwrapping. F2/B1 must reject self-intersection and unsupported polygon topology before production acceptance. The starter is not a complete GIS validator.
- Dates use branded, validated ISO calendar strings. A crop's harvested/lastOccupied date is inclusive. Fallow and horizon intervals end exclusively. Field release follows occupancy and required turnaround.
- Selected crop-purpose IDs are distinct and mandatory. The parser currently limits selection to 12 and polygon vertices to 256 as input bounds. Catalogue membership is checked against the release at API submission.
- Weather records declare mm, degrees C, percent humidity, m/s wind at 2 m, MJ/m²/day radiation, and kPa pressure. A known numeric zero and unavailable evidence are different variants.
- `PlanResult` has six branches. Only `plan` and `plan_with_warnings` contain `.plan`. The strict schema rejects a timeline added to a no-plan branch.
- Every CompletedSnapshot contains its input, result, schema version, ID, and completion timestamp. It remains readable without a server.
- Ranking uses one fixed tuple for every run: `mean_frequency`, `mean_mismatch`, `unplanted_days`, `longest_unplanted_gap`. E2 calculates values; E3 assembles and compares the tuple. MetricInput includes recorded/skipped history. ExplanationInput includes the resolved profiles and rules so source-backed preparation is available to the pure explanation function. No React component recalculates scores.
- Pending contract amendment (owner kyusuku): `FarmInput.priority`, `MetricInput.priority`, `priorityMetricIds`, pest/weed rule categories, coverage, and `pestCoverage` still exist in `src/contracts/` but are retired by spec 1.1. Until the amendment merges, the frontend sends `water`, the engine ignores the field and applies the fixed tuple, and `pestCoverage` is unavailable. Do not build features on the retired fields.
- `RegistryRelease` supports explicitly synthetic fixtures in tests. `ReleasedRegistry` is the production-only type. B3 accepts only released registry data and actual provider snapshots. Catalogue/profile publication still requires source review.
- Immutable FrozenRun includes normalized input, data cutoff, climate snapshot IDs, registry versions, engine/config versions, and settings. A retry cannot switch those values silently.

## HTTP wire format

The HTTP layer adapts the types in `src/contracts/jobs.ts`.

| Method and path | Success | Failure |
| --- | --- | --- |
| GET `/api/catalogue` | 200 Catalogue | 503 with a ServiceFailure envelope |
| POST `/api/plans` | 202 Submission of kind accepted, including capability | 400 Submission of kind invalid, 413 oversized body, 429 rate limit, or 503 Submission of kind unavailable |
| GET `/api/plans/{jobId}` | 200 JobState | 404 for both unknown job and invalid/missing capability |
| DELETE `/api/plans/{jobId}` | 204 empty body | 404 for unknown job or invalid/missing capability |

The request body for POST is FarmInput. Capability requests use `Authorization: Bearer <token>`. The URL contains only the job ID. A capability is never placed in a query string. Catalogue failures, 404, 413, and 429 use `{ "error": ServiceFailure }`; POST 400 and 503 use the Submission union described above. HTTP 413 uses `payload_too_large`, HTTP 429 uses `rate_limited`, and HTTP 404 uses `not_found`. These codes are already in ServiceFailure.

Job states are queued, fetching, calculating, completed with snapshot, and failed with a ServiceFailure. The store's get method returns null for an unauthorized or absent job. Clients must not display fixture output when an HTTP call fails.

## Job and cache semantics

`JobStore.create` freezes the input, selected registry identity, and cutoff. The database stores only a hash of a random capability. `claim` returns a unique lease identity and optional already-frozen run. `renew`, `freeze`, `complete`, and `fail` reject stale or ineligible leases with false.

Frozen data is written before calculation. Completion is atomic. Crash recovery preserves the frozen run. Identical normalized inputs can share climate cache entries but do not share authorization. B1 implements `purgeExpired(now): Promise<number>` on JobStore for terminal jobs older than 24 hours. B3 cleanup calls that port and does not duplicate job SQL.

B2 receives the ClimateCache port. B3 implements its PostgreSQL runtime adapter in separate files. B2 tests use an in-memory adapter and do not wait for B3. Cache keys include native cell, product/version, fields, date interval, and UTC. Private farm geometry is not the shared cache key.

## Fixture map and commands

| Module | Exports |
| --- | --- |
| `src/fixtures/input.ts` | inputFixture |
| `src/fixtures/results.ts` | resultFixtures, completedSnapshotFixture, completedSnapshotsByState, jobFixtures |
| `src/fixtures/science.ts` | syntheticRegistryFixture, registryResolutionFixture, frozenRunFixture, metricInputFixture and related small weather examples |
| `src/fixtures/client.ts` | fixtureClient and makeFixtureClient |

`npm run dev` exposes `/dev/fixtures`. It is a development-only lab. Production requests to that route return 404. Synthetic data is labeled and cannot serve as the project's scientific evidence. All real ports either return empty/unavailable data or throw a named unimplemented error until their card is implemented.

Run `npm run check` for typechecking, contract tests, and import boundaries. Run `npm run build` for the production build. Each card creates its own tests under the path in its brief and runs the named Vitest filter. Real PostgreSQL, live NASA, browser, and PDF acceptance remain explicit card criteria; the starter does not satisfy them.
