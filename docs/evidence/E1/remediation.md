# E1 source correction

The corrected default `fao56-reviewed-2026-11-15` retains 75 FAO-56 profiles covering 40 food crop purposes. It removes unsupported operational temperature mappings, withholds 11 unresolved rows, and records four printed-duration conflicts as unavailable. Supported stage allocations, Kc values, planting recommendations, management assumptions, harvest choices, approximate boundaries, and the 7-day scheduling assumption remain.

This record describes the implementation comparison against X1's inspected source observations. The coordinator records the independent exact-head verdict in [PR #33](https://github.com/Quantomz/nefalos_nasa_hackathon/pull/33) before merge. No agronomist, human-peer, cross-family, deployed-plan, or live-provider approval is claimed.

## Identity and retry behavior

Every retained profile has the new version `reviewed-2026-11-15.1`. The unchanged empty rotation set retains `no-rules-2026-11-14`. The corrected release is validated and deeply frozen at construction; its canonical SHA-256 is `608644417618b2b7d4fa5757d49b90fb4cafcb801ed8488f5fd07c3ffdee811b`. Canonical serialization recursively sorts object keys in JavaScript code-unit order, preserves array order, and uses compact JSON. `tests/engine/registry/release.test.ts` pins these bytes.

`v1-empty` retains its exact object and original `JSON.stringify` SHA-256 `df4d902631463c5ca8a48dc877698f00eef5c29c7e598f028f6b56256e953892`. The four unmerged draft identities throw an explicit retired-release `RangeError`; none aliases the corrected release:

- `fao56-2026-11-14`
- `fao56-temperature-2026-11-14`
- `fao56-vegetables-2026-11-15`
- `fao56-temperature-rules-2026-11-15`

A queued or frozen draft job cannot resume through the replacement. No persisted records are rewritten. The coordinator owns the narrow [compatibility policy](../../contracts.md). Unknown preview consumers have not been ruled out by a database inspection.

## Source comparison

[X1's FAO comparison](../X1/fao-source-comparison.json) records 71 distinct Table 11 source rows and 86 profile mappings at `090626a6b172fb05901a5e4fafa15be497bcae7e`. It is preserved unchanged. This correction uses those primary-source observations; no new paper access or full-text temperature review is claimed.

For every retained mapping, the corrected public registry matches X1's recorded stage allocation, selected Kc values, and recommended planting windows. Available durations use a required literal source total curated on the row. There is no computed-duration fallback. Spinach keeps the documented April interpretation: the first published `60/70` total, 60 days, paired with the first `15/25` middle-stage value. The existing soybean `30/35` development choice remains 35 to match the source's 140-day total, with its warning preserved.

The four retained total conflicts keep the sourced stages. Both the literal printed total and derived stage sum appear in the unavailable reason and warning:

| Profile | Derived stage sum | Literal total | Disposition |
| --- | ---: | ---: | --- |
| `sorghum-grain-fao56-usa-pakistan-mediterranean-may-jun` | 125 | 130 | Published duration unavailable; cultivar description corrected |
| `mung-bean-dry-fao56-mediterranean-mar` | 100 | 110 | Published duration unavailable; cultivar description corrected |
| `cowpea-dry-fao56-mediterranean-mar` | 100 | 110 | Published duration unavailable; cultivar description corrected |
| `eggplant-fao56-mediterranean-may-jun` | 140 | 40 | Published duration unavailable; no claim that 40 is a proven typo |

The stage sum remains usable by the existing engine. Unavailable published duration does not create a replacement scientific range.

## Withheld source rows

The original row facts remain in `src/registry/profiles.ts` with explicit publication dispositions. Historical draft narratives carry a superseded banner; Git history and X1 evidence remain intact.

| Profile | Unresolved evidence |
| --- | --- |
| `maize-grain-fao56-nigeria-humid-jun` | Current lookup cannot establish humid Nigeria |
| `maize-grain-fao56-east-africa-highland-apr` | Highland elevation is not established |
| `maize-grain-fao56-india-dry-cool-oct` | Dry, cool season is not established |
| `wheat-grain-fao56-california-winter-dec` | Non-frozen soil for the selected Kc is not established |
| `wheat-grain-fao56-mediterranean-winter-nov` | Non-frozen soil for the selected Kc is not established |
| `groundnut-fao56-west-africa-dry-season` | Dry season is not established |
| `sweet-potato-fao56-tropics-rainy-season` | Rainy season is not established |
| `faba-bean-dry-fao56-mediterranean-mar-apr` | Short row does not establish dry-seed harvest |
| `faba-bean-dry-fao56-europe-may` | Short row does not establish dry-seed harvest |
| `sweet-pepper-fao56-europe-mediterranean-apr-jun` | Initial `25/30` and April/June pairing remain unresolved; continuous April–June adds unsourced May |
| `sweet-maize-fao56-idaho-apr` | Late-stage `103` interpretation is unconfirmed, independently of the 100-stage-day versus 110-printed-day conflict |

Dry faba's separate 235-day row is not substituted without applicability review. Table 12 footnote 2 gives Kc mid 1.20 for beans, peas, and broad beans grown on stalks reaching 1.5–2 m; choosing 1.15 assumes no such tall stalks. That qualification is now retained in the withheld faba curation so a future release cannot omit it.

Withholding is a conservative release disposition, not proof that every location inside a rectangle is unsuitable. The catalogue derives from retained profiles, so `faba-bean-dry` and `sweet-pepper` leave it. Supported alternative sweet-maize rows remain. Other approximate regional examples remain disclosed assumptions. No new humidity, altitude, freezing, seasonal, or planting-date gate is invented. Planting windows remain recommendations.

## Temperature remains unassessed

All 32 draft operational mappings are absent from the new release. X1 classified 28 mappings unsupported and four unverified overall; this is not a claim that all numeric thresholds are disproved. Source records and historical audit explanations remain available for future curation.

The new profiles have empty `temperatureRules` arrays and cite only FAO-56 Tables 11 and 12. Tests execute the public E2 assessment with resolved Boise bean and maize plus explicitly synthetic wet weather. Both remain assessable, with a `temperature_rule` unassessed check, unavailable temperature exposure, and no assertion of temperature safety. This is component behavior, not observed NASA or live-plan evidence.

## Verification and review

Pstack path: `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md`; selected playbook: Bug fix. The implementation followed the coordinator's two-candidate design review. Model the Domain put publication decisions on the existing source rows. Prove It Works changed verification to the public registry and resolver. The installed Deslop skill was applied before each implementation commit. Native Comment Sicko and cloud review are unavailable. A fresh local GPT reviewer inspected comments and suppressions. Both accepted cleanups were applied; a separate independent exact-head review gates merge.

The first focused regression was committed before production changes as `44b18f9`. Its observed failure was:

```text
Test Files  1 failed (1)
     Tests  10 failed (10)
```

The default mismatch was `Expected: "fao56-reviewed-2026-11-15"`, `Received: "fao56-temperature-rules-2026-11-15"`. Retired lookups failed with `expected function to throw an error, but it didn't`. Duration assertions observed `kind: "available"` where `kind: "unavailable"` was required.

Checks use Node `v24.22.3` with `PATH=/Users/kyusuku/.npm/_npx/387698761821791d/node_modules/node/bin:$PATH`:

| Command | Observed result |
| --- | --- |
| `npx vitest run tests/engine/registry/source-remediation.test.ts` before fix | Failed: 10 tests, intended source-policy conflicts |
| `npx vitest run tests/engine/registry/source-remediation.test.ts` after initial fix | Passed: 10 tests |
| `npx vitest run tests/engine/registry` after correction | Passed: 7 files, 67 tests |
| `npm run typecheck` | Passed: route types generated and TypeScript exited 0 |
| `npm run check` with real PostgreSQL suites enabled | Passed at `b657167`: 564 tests passed; one opt-in live I1 test skipped; typecheck and module boundaries passed |
| `npm run build` | Passed at `b657167` |
| Independent exact-change review | Required before merge; exact-head verdict is recorded in PR #33 |
| Live NASA, HTTP, PostgreSQL, restarts, and returned plan | NOT RUN here; separate integration acceptance |

The [handoff cases](i2-handoff.md) and [public-entrypoint observations](remediation-observed.json) identify the supported profiles and missing coverage. E1 is not marked Done by this implementation record.
