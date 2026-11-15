# X2 independent review

The goal is to establish recorded climate coverage and gap behavior at four contrasting public locations, with a CLI that distinguishes live captures, synthetic checks, and offline replay. This review checks the selected implementation and evidence without editing the repository or making provider requests.

Verdict **PASS+NOTES**. No actionable P1 or P2 findings.

The reviewed head is `a6e8893e6ec748380c8097fd76c5f336bc4a0f1b` in `/Users/kyusuku/Hackathons/gilir-x2-review`. The base is `9431aa134866f63b036f7ec753b5c92ecede4d5d`. The implementation first appeared in `f444c13c1e0498bf1e08bf7f69fe6ff1de5b14d5`, and the live captures appeared in `ddfdc5fb5cbb09886bc0c6c4bf253463f719f791`. The final head changes only the README and adds `captured.test.ts` after that capture commit. The implementation and original behavior tests remain identical to `f444c13`.

The reviewer did not write the selected script, tests, captures, or README. This is a local Codex collaboration review. The host has no Cursor cloud agent capability. The configured reviewers are GPT models, so this is not cross-family verification. No nested agents ran.

## Evidence and commands

I read `AGENTS.md`, the X2 card, specification and relevant frozen contracts, the build plan, the complete selected script and tests, the B2 adapter and normalization code, and E2 cohort behavior. The workflow uses `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md`, its Shipping and Opening a PR playbooks, and `/Users/kyusuku/.codex/skills/control-cli/SKILL.md`. The root supplied the completed independent no-comments pass. The added captured-response test also contains no comments or suppressions.

The scoped suite ran first at `ddfdc5f` and passed all 18 behavior tests in 16.71 seconds. After the final delta, the following command passed both files and all 19 tests in 17.15 seconds.

```sh
PATH=/Users/kyusuku/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH npx --no-install vitest run tests/overflow/global-coverage
```

The CLI was executed as a subprocess, including `--help`. The independent harness used a Node preload that replaces `globalThis.fetch` with a throwing function. CLI replays therefore could not issue NASA requests. The harness and results are retained outside the repository.

```sh
python3 /Users/kyusuku/Hackathons/.audit/gilir/x2-independent-run.py
```

- `x2-independent-run.py` independently reads and validates compressed captures, then drives the actual CLI.
- `x2-independent-results.json` contains computed cells, units, periods, counts, timestamps, and CLI outcomes.
- `x2-independent-*.stdout` and `x2-independent-*.stderr` retain the CLI transcripts.

The base does not contain `scripts/check-global-coverage.ts`. At the reviewed head, its help documents explicit live and replay modes, and actual replay reconstructs the recorded coverage without a provider dependency. No existing production path was changed.

## Raw-capture verification

I used Python's JSON, gzip, SHA-256, date arithmetic, and direct observation dictionaries. These checks do not call the script's summary function or the B2 and E2 helpers.

All four compressed bundle hashes match the report. All 12 raw text hashes match both their attempt records and normalized product content hashes. Each bundle's context, location, and expected summary agree with the report. All responses record HTTP 200, and the source label remains `live`.

Every one of the eight required fields has exactly 9,498 distinct dates from June 30, 2000 through July 1, 2026 inclusive. No required value is null, nonfinite, or the provider's missing marker. The reported missing counts and observed date bounds match the raw bodies. All 25 recorded seasons per location contain 366 complete days. Independently recomputed annual temperature means and annual rainfall totals match the reported applicability summaries.

| Location | Meteorology center | Solar center | IMERG center | Usable seasons |
| --- | --- | --- | --- | --- |
| Cordoba | -64.375, -31.5 | -64.5, -31.5 | -64.15, -31.45 | 25 |
| Berlin | 13.125, 52.5 | 13.5, 52.5 | 13.45, 52.55 | 25 |
| Quito | -78.75, 0 | -78.5, -0.5 | -78.45, -0.15 | 25 |
| Taveuni | -180, -17 | 179.5, -16.5 | 179.95, -16.75 | 25 |

The centers were independently calculated from the declared native grids and public lookups. They match the request cell IDs, report coordinates, and raw returned geometry. Taveuni correctly has a meteorology center at longitude -180 while the other products remain east of 179 degrees.

Provider units match the preserved provenance. Temperature uses C, humidity percent, wind m/s, pressure kPa, solar MJ/m^2/day, and precipitation mm/day. The API identifies itself as POWER Daily API v2.10.3. Actual source-stream and source-release versions remain unavailable. Available elevations equal the raw returned native-cell elevations.

Capture timestamps run from `2026-11-14T18:47:54.904Z` through the final adapter clock at `2026-11-14T18:48:20.069Z`. All three per-location clock positions match their successful attempts. Capture times precede corresponding retrieval times, and sequential attempts start after prior retrieval times.

Only the four explicitly public lookups and native product centers occur in this evidence path. The script constructs illustrative polygons for those points and does not read private farm inputs. It imports neither the synthetic science fixture nor a plan calculator. I found no invented observations or claims of worldwide agronomic validation. Hashes establish internal consistency, not independent authentication of NASA or the capture author.

## CLI and failure checks

| Actual subprocess case | Observed result |
| --- | --- |
| `--help` | Exit 0 and both supported invocation forms. |
| Invalid calendar date in live arguments | Exit 2 before an output directory was created. |
| Missing explicit mode | Exit 2. |
| Replay with a cutoff override | Exit 2 before output creation. |
| Checked-in live capture replay with fetch blocked | Exit 0, four verified rows, exact summaries and snapshot identities, source remains live. |
| Reuse the replay output directory | Exit 2 and every existing output file retained its previous hash. |
| Changed first request URL with a recomputed bundle hash | Exit 2, first row marked corrupt, three later rows still verified. |
| Injected HTTP 422 after successful Cordoba meteorology, then replay | Exit 1, first snapshot retained, failed and unattempted products distinguished, other locations ready, all replay integrity checks verified. |
| Corrupt first request inside an otherwise expected three-attempt transport outage | Exit 2 with the original request-order integrity error. Later outage rows still verified. |

The failure fixtures are explicitly labeled `fixture`. The 422 case reuses saved raw bodies for other responses and does not make a network request. The transport-outage case throws an injected error. Neither is represented as a naturally observed provider failure.

The last case specifically probes the latched integrity error in `scripts/check-global-coverage.ts` at lines 183, 191, and 253. The B2 retry loop could otherwise consume an integrity exception and produce the same expected provider-failure summary. The implementation retains and reports the integrity failure instead.

The scoped behavior suite also verifies exact attempt and clock consumption, reordered requests, missing and extra attempts, changed clock position and value, modified bodies and summaries, incomplete captures, failed body reads, retry bounds, zero rainfall, one missing day, all-missing rain, unavailable elevation, and continuation after a failed location.

## Final delta and maintainability

I reviewed the final 41-line captured-response test and README. The test checks the checked-in raw capture through the public operation, blocks network calls, compares full summaries including snapshot identities, and restores its spy and temporary directory. The README's locations, cells, units, date period, timestamps, and live-versus-synthetic distinction agree with the independently inspected artifacts. Its integration test and build claims come from root's runs, not this review.

The implementation remains one 296-line CLI module with explicit attempt outcomes, one context, and one compressed bundle per location. The mutable attempt and clock counters are needed to reproduce the adapter's sequential protocol. They are reset per location and guarded by a latched integrity error. I found no speculative framework, copied climate calculations, or changes outside X2 ownership that warrant revision.

Prove It Works led me to execute the actual CLI and recompute values from raw bodies. Minimize Reader Load led me to trace the capture and replay states and confirm that the single operation avoids unnecessary abstraction.

## Limits

I made no new NASA requests and did not rerun the full PostgreSQL suite or production build, as assigned. Root reported `npm run check` with 476 passed tests and one opt-in I1 skip, plus passing type checks, boundaries, and production build. Those are separate integration results. This review establishes the X2 code, captures, scoped tests, and CLI behavior at the stated head. It does not establish deployment, assembled application acceptance, crop suitability, ET0 correctness, or worldwide recommendations.

The only local worktree item is the pre-existing untracked dependency symlink `node_modules`. No repository files were edited by this reviewer.
