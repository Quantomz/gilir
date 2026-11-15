# Hard FAO-56 planting windows

## Decision

The E1 owner decided that FAO-56 Table 11 planting months are hard limits. Every planting window in the current release has basis `hard_constraint`. Calendar search may plant a profile only inside its stated month.

## Rationale

A Table 11 row gives stage lengths for one stated planting month. Spec 1.1 section 6.1 item 5 requires an applicable released profile for each occurrence. An occurrence planted outside the row's month does not use an applicable profile. This is profile applicability. It is not a seasonal rain recommendation.

The previous release marked every window as a recommendation. E3 enforces only hard windows. The planner could therefore plant Idaho dry bean (June row) in November and Idaho maize (April row) in September because winter water demand is low.

## Release identity

| Field | Value |
| --- | --- |
| Catalogue version | `fao56-hard-windows-2026-11-15` |
| Rule version | `no-rules-2026-11-14` |
| Profile version | `reviewed-2026-11-15.2` |
| Default | Yes, through `latestReleaseVersion` |

The profiles match the previous release except for window basis and profile version. Stage days, Kc, durations, regions, sources, and warnings are unchanged. Profiles without a published planting month remain windowless.

## Previous release

`fao56-reviewed-2026-11-15` with profile version `reviewed-2026-11-15.1` remains readable and byte-identical. Its windows keep basis `recommendation`. Frozen jobs that recorded it can still replay.

## Evidence

`tests/engine/registry/release.test.ts` pins both release digests. It checks that the new release differs only in window basis and profile version. `tests/engine/registry/resolve.test.ts` runs `findCalendar` for Boise dry bean. A 2027-06-01 to 2028-06-01 horizon yields a June planting. A 2027-07-01 to 2028-06-01 horizon contains no June day and is proved impossible.
