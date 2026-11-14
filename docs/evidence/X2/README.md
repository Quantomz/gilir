# X2 climate coverage evidence

This candidate adds a bounded coverage sweep for four public locations. It reuses B2 normalization and E2 cohort construction. No live NASA requests were made for this candidate. Its tests use explicitly synthetic POWER-shaped responses. X2 remains open pending live evidence, integration checks, independent review, and merge.

## Run the sweep

Use Node 24 and the installed repository dependencies. The output directory must not exist. Its parent must exist.

```sh
node --import tsx scripts/check-global-coverage.ts --mode live --output docs/evidence/X2/live-2026-11-15
node --import tsx scripts/check-global-coverage.ts --mode replay --input docs/evidence/X2/live-2026-11-15 --output /tmp/gilir-x2-replay
```

The live command accepts `--planning-start` and `--cutoff`. Replay uses the saved dates and rejects overrides. The CLI exposes no synthetic-provider option. Tests call the exported `checkGlobalCoverage` operation with a required fixture label and injected provider.

| Public location | Category | Longitude | Latitude |
| --- | --- | --- | --- |
| Cordoba | Southern hemisphere | -64.19 | -31.42 |
| Berlin | Temperate | 13.4 | 52.52 |
| Quito | Equatorial | -78.5 | -0.2 |
| Taveuni | Dateline adjacent | 179.9 | -16.8 |

The default planning start is July 1, 2027. Its anniversary horizon contains February 2028 and lasts 366 days. The cutoff is November 14, 2026. Existing B2 date helpers derive June 30, 2000 through July 1, 2026 inclusive, containing 9,498 requested days. The recorded engine settings request 25 seasons and require 15 usable seasons. E2 receives zero lookback days for this coverage check. B2's retrieval allowance still includes 366 lookback days.

## Read the artifacts

Each location has one `.json.gz` bundle. `report.json` records the context and all completed locations after each location finishes. An unfinished or corrupt execution remains `incomplete`.

Bundles preserve exact request order, URL, capture time, HTTP status, Retry-After, raw successful text and SHA-256, transport or body-read errors, and adapter clock reads. Non-OK bodies stay unread, matching B2. Each bundle contains its expected coverage summary. The report contains a SHA-256 of the compressed bundle bytes. There is no new retry policy. B2 retains its three-attempt limit per product, with at most nine attempts per location.

Each summary records requested native cells, returned centers, native grids, field units and conversions, unavailable source-version evidence, snapshot identities and hashes, normalized date rows, actual observation bounds, missingness, preparation outcome, and unattempted products. E2 records usable and excluded seasons, reasons, gaps, annual applicability evidence, and elevation availability. A `ready` preparation is distinct from meeting E2's minimum usable-season count. Available zero rainfall remains an observation.

Replay validates the saved policy and location, body and bundle hashes, exact ordered URLs, clock positions, complete consumption, and the regenerated summary. It performs no provider requests. A replay retains its original `live` or `fixture` source label. A reproduced provider outage can pass replay integrity while its coverage remains failed. Capture hashes detect accidental changes. They do not authenticate the provider or the capture author.

| Exit code | Meaning |
| --- | --- |
| 0 | Execution completed and all four rows are ready with the minimum usable seasons. |
| 1 | Execution completed but at least one row failed retrieval, was unavailable, or lacked the minimum seasons. |
| 2 | Invalid arguments, capture corruption, incomplete execution, or an output error. |

These results establish coverage only at the recorded locations and dates. They do not validate ET0, crop suitability, ranking, or worldwide recommendations. The script builds a coverage-only `FrozenRun` with explicit unused registry versions. It does not import the science fixture or calculate a crop plan.

## Candidate verification

Commands ran on Node 24 with the existing dependency installation.

| Command or evidence | Observed result |
| --- | --- |
| `npx vitest run tests/overflow/global-coverage` | Passed 18 tests. The final functional run took 17.25 seconds. Synthetic data only. |
| `npx tsc --noEmit --incremental false` | Passed. |
| CLI subprocess checks | Passed offline replay, failed-coverage exit code, explicit-mode checks, rejected overrides and overwrite, and inert module import. |
| Live NASA sweep | NOT RUN by this candidate. |
| `npm run check` | NOT RUN by this candidate. Root owns the full integration check. |
| `npm run build` | NOT RUN by this candidate. Root owns the production build. |
| Independent review | NOT RUN by this candidate. Root reviews the exact selected change. |

The tests exercise zero rainfall, one missing rain day, all-missing rain, unavailable elevation, exhausted HTTP 503 retries, permanent HTTP 422, corrupt HTTP 200 JSON, network failures, interrupted successful bodies, preserved earlier snapshots, and continuation to later locations. Corruption scenarios cover modified bodies, wrong or reordered URLs, missing and extra attempts or clocks, mismatched clock positions or values, altered summaries, changed contexts, missing bundles, and incomplete sources.

The workflow uses `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md` and its Feature playbook. Root supplied the completed subsystem investigation and architecture decision. This isolated candidate owns only the X2 script, overflow tests, and evidence directory. The blocking design preceded implementation. One worker owns the coupled CLI and tests. Provider operations serialize through one B2 preparer with fresh per-location caches. Filesystem writes occur after provider execution. Root handles the independent arena comparison and review.

Model the Domain informed the attempt outcome union and explicit execution status. Boundary Discipline placed capture parsing and replay checks at the file boundary. Laziness Protocol kept one exported operation and one location bundle instead of introducing a reusable capture framework. Test Behavior, Not Implementation led to tests through the public operation and actual subprocess CLI. A local deslop pass found no comments, suppressions, copied science calculations, or out-of-scope edits. The configured arena has no cross-family judge pool, so no cross-family review is claimed.
