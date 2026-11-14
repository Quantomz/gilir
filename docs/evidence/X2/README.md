# X2 climate coverage evidence

The live sweep retrieved all three NASA POWER products for Cordoba, Berlin, Quito, and Taveuni. Each location has 25 complete replay seasons and no missing required weather values in the requested period. The saved responses reproduce the same normalized snapshots and coverage summaries offline.

These results establish climate coverage at the recorded points and dates. They do not validate crop suitability, ET0, ranking, or worldwide recommendations. No natural gaps or provider failures occurred in this sweep. The gap and failure checks below use synthetic responses.

## Live results

The [live report](live-2026-11-14/report.json) and four compressed response bundles were captured from November 14, 2026 at 18:47:54.904 through 18:48:20.069 UTC, November 15 in Bangkok. All 12 requests returned HTTP 200 on their first attempt. All locations returned 9,498 daily observations for every owned field, covering June 30, 2000 through July 1, 2026 inclusive.

The public lookups and actual returned native centers below use longitude, latitude order.

| Location | Public lookup | Meteorology center | Solar center | IMERG center | Usable seasons |
| --- | --- | --- | --- | --- | --- |
| Cordoba, southern hemisphere | -64.19, -31.42 | -64.375, -31.5 | -64.5, -31.5 | -64.15, -31.45 | 25 of 25 |
| Berlin, temperate | 13.4, 52.52 | 13.125, 52.5 | 13.5, 52.5 | 13.45, 52.55 | 25 of 25 |
| Quito, equatorial | -78.5, -0.2 | -78.75, 0 | -78.5, -0.5 | -78.45, -0.15 | 25 of 25 |
| Taveuni, dateline adjacent | 179.9, -16.8 | -180, -17 | 179.5, -16.5 | 179.95, -16.75 | 25 of 25 |

The planning start is July 1, 2027, with a 366-day horizon that includes February 2028. The frozen cutoff is November 14, 2026. B2 derives the request interval with its 366-day retrieval lookback. E2 checks 25 seasons with a minimum of 15 and zero crop lookback days. The report preserves the full settings and every season interval.

The native grid sizes are 0.5 by 0.625 degrees for meteorology, 1 by 1 degree for solar, and 0.1 by 0.1 degree for IMERG. All values use UTC. NASA reports POWER API version 2.10.3, MERRA2/POWER meteorology, SRB/SYN1DEG solar, and IMERG rain. The source stream and underlying release version remain explicitly unavailable because POWER does not supply them. Native-cell elevation is available at all four points; it is not a field survey.

| Fields | Provider unit | Canonical unit |
| --- | --- | --- |
| Mean, minimum, and maximum temperature | C | degC |
| Relative humidity | % | % |
| Wind at two meters | m/s | m/s |
| Surface pressure | kPa | kPa |
| Solar radiation | MJ/m^2/day | MJ/m²/day |
| IMERG precipitation | mm/day | mm/day |

## Run or replay the sweep

Use Node 24 and the installed dependencies from the repository root. The output directory must be new, and its parent must exist.

```sh
node --import tsx scripts/check-global-coverage.ts --mode live --output /tmp/gilir-x2-new-live
node --import tsx scripts/check-global-coverage.ts --mode replay --input docs/evidence/X2/live-2026-11-14 --output /tmp/gilir-x2-new-replay
```

Live mode accepts `--planning-start` and `--cutoff`; their defaults match this capture. Replay uses the saved dates and rejects overrides. Tests inject a provider through the exported `checkGlobalCoverage` operation and must supply a fixture label. The CLI exposes only live and replay modes.

Each location has one `.json.gz` bundle with ordered attempts, URLs, timestamps, HTTP status, Retry-After, raw successful text and SHA-256, errors, and adapter clock reads. Non-OK response bodies stay unread, matching B2. Each completed location is saved before the next begins. The report records preparation status separately from usable seasons, elevation availability, and replay integrity. Actual observation bounds remain distinct from normalized date rows.

Replay validates the saved context, compressed bundle and body hashes, ordered requests, clock positions, complete consumption, and regenerated summaries. It never falls through to the network. Replays preserve the original live or fixture source label. Hashes detect accidental changes; they do not authenticate the provider or capture author.

| Exit code | Meaning |
| --- | --- |
| 0 | All four rows are ready and meet the minimum season count. |
| 1 | The sweep completed, but a row failed retrieval, was unavailable, or lacked enough complete seasons. |
| 2 | Arguments, capture integrity, output, or execution failed. |

## Verification

The source and captures were tested with Node 24. Full database checks used local PostgreSQL 18.

| Command or check | Result |
| --- | --- |
| Live CLI command | Passed: 12 HTTP 200 responses, four ready locations, no missing owned fields, 25 usable seasons each. |
| Replay CLI command | Passed offline: all four integrity checks verified and every saved summary reproduced. |
| `npx vitest run tests/overflow/global-coverage` | 19 checks passed: 18 synthetic behavior checks and one regression against the four saved live captures. |
| `npm run check` | 476 passed, one opt-in live I1 test skipped; type checking and module boundaries passed. |
| `npm run build` | Passed. |
| Independent review | In progress. |

Synthetic checks cover zero rain, one missing rain day, all-missing rain, unavailable elevation, HTTP 503 retries, permanent HTTP 422, corrupt HTTP 200, transport and body-read failures, partial snapshot preservation, and continuation. Replay checks reject changed bodies, bundles, URLs, attempts, clocks, summaries, contexts, missing files, and incomplete sources. Subprocess checks cover the actual CLI, exit codes, overwrite rejection, date overrides, and import without execution.

## Workflow

This card used `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md` and the Feature, Opening a PR, and Shipping playbooks. Independent design and implementation candidates ran in separate worktrees. The selected implementation keeps one operation and one bundle per location. The other candidate shared this shape but lacked distinct coverage-failure exits and actual observation bounds. No graft was needed.

The throughput checkpoint kept design before implementation, isolated competing writes, serialized NASA requests through one B2 preparer with fresh caches, and assigned final evidence and GitHub operations to root. Build the Lever produced a repeatable CLI; Prove It Works required live retrieval and exact offline replay. An independent no-comments audit found zero comments or suppressions. The configured reviewers are GPT models, and the host supplies local collaboration agents. No cross-family or Cursor cloud review is claimed.
