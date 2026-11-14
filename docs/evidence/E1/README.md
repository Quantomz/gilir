# E1 evidence

Card: E1, [issue #8](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/8). Release: `fao56-2026-11-14` (the empty `v1-empty` release stays readable).

| File | Contents |
|---|---|
| `source-comparison.md` | Every released number next to the FAO-56 Table 11/12 cell it came from; omitted rows; assumptions not from the source |
| `review.md` | Independent source check (separate Claude agent) and follow-ups |
| `i2-handoff.md` | Supported, no-calendar-fit and insufficient-data test inputs for I2 |

## What the release contains

- **Catalogue:** `common-bean-dry`, `maize-grain`, `wheat-grain`.
- **Profiles:** 12 regional profiles (5 maize, 2 dry bean, 5 wheat), from FAO-56 Table 11 (stage lengths) and Table 12 (Kc).
- **Turnaround:** 7 days, labelled as a Gilir scheduling assumption.
- **Not released:** temperature rules, preparation text and rotation rules. The cited sources contain none.
- **Pest/weed coverage:** none. `pestCoverage` is always unavailable (spec 1.1).

## Verification (2026-11-14)

Node: the repo requires Node >= 24. This machine has no Node 24, so the checks ran on Node 22.20.0. The default Node 20.19.1 runs the tests but cannot run Vitest's failure reporter (`Map.groupBy`).

| Command | Result |
|---|---|
| `npx vitest run tests/engine/registry` | 3 files, 35 tests passed |
| `npm run check` | typecheck passed; 13 files / 99 tests passed, 28 skipped (live PostgreSQL/NASA suites, unchanged by E1); module boundaries passed |
| `npm run build` | passed; routes built including `/api/catalogue` |

All E1 tests use the real release data or labelled synthetic fixtures (`syntheticRegistryFixture`) for resolution-rule edge cases. Fixture tests are component evidence only. A live plan from this data belongs to I2.

## Not verified here

- Human peer review of the source comparison (requested in the PR).
- That NASA POWER returns 15 or more complete seasons at the I2 hand-off point (B2/I2).
- Checks on Node 24 specifically.
- pstack: `AGENTS.md` asks for pstack's poteto-mode workflow, but pstack is not installed in this environment, so it did not run.
