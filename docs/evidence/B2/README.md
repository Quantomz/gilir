# B2 NASA climate evidence

The climate adapter retrieves real daily history for the frozen planning horizon. It preserves separate native product grids and explicit missing values.

## Observed full-period retrievals

These are public illustrative locations, not private farm inputs. Both retrievals ran on 2026-11-14. Exact response bodies, retrieval timestamps, URLs, and SHA-256 hashes are in each directory.

| Location | Requested public lookup | Saved source interval, inclusive | Days per product | Complete daily-weather season potential |
| --- | --- | --- | --- | --- |
| Bangkok | 100.5 longitude, 13.75 latitude | 2000-06-30 through 2026-06-30 UTC | 9,497 | 25 of 25 |
| Pretoria | 28.2 longitude, -25.75 latitude | 2000-06-30 through 2026-06-30 UTC | 9,497 | 25 of 25 |

The selected planning date is 2026-07-01. The cutoff is 2026-11-14. Each replay candidate begins on July 1 and follows 365 actual days, the length of this planning horizon. A candidate crossing February 29 ends on June 30 exclusively. Other candidates end on July 1 exclusively. Every candidate crosses December. The source interval also includes a 366-day allowance before the earliest candidate.

All eight required daily fields have zero missing observations in these source intervals. The potential count measures daily field completeness only. It is not the E2 common scientific cohort, an ET0 validation, or proof of crop suitability. Activated rules requiring more than the exported `maximumPermittedLookbackDays = 366` cannot obtain sufficient lookback from this adapter. Consumers must keep those assessments unavailable.

Read [Bangkok summary](bangkok/summary.json) and [Pretoria summary](pretoria/summary.json). Each directory contains three compressed raw JSON responses and compressed normalized provider snapshots. The component tests decompress all six real responses, verify their saved content hashes, and normalize all 9,497 dates again.

## Reproduce the retrieval

Run these commands from the repository root with Node 24 and installed dependencies. Negative option values use the equals form required by Node's argument parser.

```sh
node --import tsx scripts/fetch-climate.ts --longitude 100.5 --latitude 13.75 --planning-start 2026-07-01 --cutoff 2026-11-14 --output /tmp/gilir-b2-bangkok
node --import tsx scripts/fetch-climate.ts --longitude 28.2 --latitude=-25.75 --planning-start 2026-07-01 --cutoff 2026-11-14 --output /tmp/gilir-b2-pretoria
```

`summary.json` reports the interval and missingness. Provider timing metadata can change between requests, so the byte hash can change even when weather values are equal. The committed hashes identify the exact saved responses.

## Provider metadata and limitations

The saved responses report POWER Daily API `v2.10.3`. Meteorology reports sources `MERRA2` and `POWER`. Solar reports `SRB` and `SYN1DEG` across this historical period. Rain reports `IMERG`. The API does not identify the underlying source release version or attribute the actual stream to each day. `ClimateProduct.version` and `.stream` therefore remain explicitly unavailable. The adapter never labels the returned rain as Final or V07 by inference.

The returned original units are `C`, `%`, `m/s`, `MJ/m^2/day`, `kPa`, and `mm/day`. The normalizer records each original unit and canonical conversion version. The fixture tests additionally exercise pressure in Pa and radiation in kW-hr/m²/day. Those alternate units are fixture evidence, not the units observed in these six live responses.

The native grid model comes from the following primary NASA sources.

| Product family | Native grid, latitude by longitude | Origin of grid centers | Evidence |
| --- | --- | --- | --- |
| MERRA-2 meteorology | 0.5° by 0.625° | -90°, -180° | [MERRA-2 grid specification, section 4.1](https://gmao.gsfc.nasa.gov/media/publications/zbly36ziNFDQeVqPhUoFbmYmvh/MERRA-2_GIO_File_Specification-Office_Note_v1.0__2Xts4xu.pdf) and [native-grid metadata](https://opendap.nccs.nasa.gov/dods/merra2_gmi/tavgM_3d_met_Nv) |
| Solar radiation | 1° by 1° | -89.5°, -179.5° | [CERES grid definition, table 4a](https://ceres.larc.nasa.gov/documents/DPC/DPC_current/pdfs/DPC_SYN1deg-Month_R6V1.pdf) and [POWER energy-flux methodology](https://power.larc.nasa.gov/docs/methodology/data/sources_fluxes/) |
| IMERG precipitation | 0.1° by 0.1° | -89.95°, -179.95° | [IMERG grid documentation](https://gpm.nasa.gov/sites/default/files/document_files/IMERG_doc.pdf) and [POWER IMERG methodology](https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/) |

The implementation chooses the nearest documented center. Exact boundary ties select the higher index, longitude wraps at the dateline, and polar latitude indices clamp to the supported center. Each source URL requests that native center. `ClimateSnapshot.latitudeDeg` is the provider-requested native center latitude, not the farmer's lookup latitude. `elevationM` is POWER's MERRA-2 grid-average elevation at the requested point. It is not measured farm elevation. Latitude-dependent calculations must consciously select the frozen input latitude or this documented grid latitude as their method requires.

The cache key contains the native cell, owned fields, source-version-unreported policy, daily-v2 API family, normalization version, interval, and UTC. It contains no farm geometry. Since POWER omits the source release version, the cache cannot claim a release-pinned upstream archive. Saved immutable content hashes preserve the actual observations used in a run. A later upstream correction does not rewrite a frozen snapshot.

[POWER Daily API documentation](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) supplies the UTC request option and the 20-parameter point-request limit. This adapter requests at most six parameters in one call. It serializes its network calls, limits each attempt to 60 seconds, and allows at most three attempts for transport, HTTP 429, or HTTP 5xx failures. Backoff is bounded at ten seconds. Permanent HTTP errors and corrupt provider data do not retry. Missing observations never receive a weather substitute.

`ready` means the provider retrieval produced observations for every required field. Isolated missing days remain explicit for E2. `unavailable` means a required field has no observations anywhere in the requested interval. `failed` carries a `ServiceFailure` for provider outage or corruption. Both preserve prior validated product snapshots.

## Verification and review

The initial run under Node 25 exposed a floating-point tie at the dateline. The cell-index calculation now applies a numeric tie tolerance. The supported Node 24 run passes that case. An initial CLI call with a negative latitude separated by a space failed before retrieval. The documented equals syntax succeeded.

The implementation passes 19 climate tests, including six saved real full-period response validations. Synthetic response-shape tests cover missing markers, zero rain, missing dates, conversions, duplicate JSON dates, corrupt units, source changes, UTC, cache reuse, concurrent reuse, provider failures, and synthetic-cache rejection. Independent preparers with different retrieval timestamps can save identical source content without conflicting immutable snapshot identities.

The supplemental [recent solar response](recent-solar-missing.json) is a real two-day unavailable-coverage example. POWER returns only missing markers and an empty source list. The normalizer preserves those unavailable values. An empty source list with available observations remains a provider corruption error. This supplemental sample does not contribute to the full-period acceptance count.

`npm run check` passes under Node 24, including typechecking, 31 tests across three files, and module import boundaries. `npm run build` produces the Next.js production build. The explicit component command is `npx vitest run tests/backend/climate`. The supported Node 24 binary was available locally at `/Users/kyusuku/.npm/_npx/387698761821791d/node_modules/node/bin/node`; verification prepended that directory to `PATH`.

Independent review results are recorded by the root review handoff. No PR, merge, deployment, or board update is performed by this worker.
