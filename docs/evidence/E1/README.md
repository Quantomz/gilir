# E1 evidence

Card: E1, [issue #8](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/8). Latest release: `fao56-temperature-rules-2026-11-15` (42 crops, 86 profiles; temperature rules on 22 crops). Earlier releases `fao56-vegetables-2026-11-15`, `fao56-temperature-2026-11-14`, `fao56-2026-11-14` and `v1-empty` stay readable and unchanged.

| File | Contents |
|---|---|
| `release-4-temperature-rules.md` | Latest release `fao56-temperature-rules-2026-11-15`: 23 crop-specific temperature rules for 16 crops, sources and caveats, and the 20 crops still not assessed |
| `release-3-vegetables.md` | Release `fao56-vegetables-2026-11-15`: the 23 vegetables and annual fruits, first-listed row choices, broccoli and lettuce temperature rules, skipped rows, Pereira 2021 vegetable alternatives |
| `release-2-temperature-and-crops.md` | Release `fao56-temperature-2026-11-14`: temperature rules with sources and caveats, the 16 added crops, Kc range choices, skipped rows, Pereira 2021 alternative values |
| `source-comparison.md` | Release `fao56-2026-11-14`: every number next to the FAO-56 Table 11/12 cell it came from; omitted rows; assumptions not from the source |
| `review.md` | Independent source check (separate Claude agent) and follow-ups |
| `i2-handoff.md` | Supported, no-calendar-fit and insufficient-data test inputs for I2 |

## What the release contains

**`fao56-temperature-rules-2026-11-15` (latest, default)**
- Same crops and profiles as `fao56-vegetables-2026-11-15`, plus 23 crop-specific temperature rules for 16 crops (32 rules on 22 crops in total). See `release-4-temperature-rules.md`.

**`fao56-vegetables-2026-11-15`**
- Everything in `fao56-temperature-2026-11-14`, plus 23 annual vegetables and fruits (41 profiles). Broccoli frost and heat rules and a lettuce bolting rule. See `release-3-vegetables.md`.

**`fao56-temperature-2026-11-14`**
- **Catalogue:** 19 food crops: barley, common bean (dry), cowpea (dry), faba bean (dry), groundnut, lentil, maize, millet, mung bean (dry), oats, pea (dry), potato, rice (paddy), safflower, sorghum, soybean, sunflower, sweet potato, wheat.
- **Profiles:** 45 regional profiles from FAO-56 Table 11 (stage lengths) and Table 12 (Kc).
- **Temperature rules (mid-season, daily):**
  - maize Tmax > 35 °C
  - wheat Tmax > 34 °C
  - common bean Tmax > 30 °C and Tmin > 20 °C
  - rice Tmax > 36 °C
  - soybean Tmax > 39 °C

  Sources: Gourdji et al. 2013, Teixeira et al. 2013, Vargas et al. 2021 and Silva et al. 2020. Each rule carries its caveats.

**`fao56-2026-11-14` (earlier release, kept unchanged)**
- 3 crops (maize, dry bean, wheat), 12 profiles, no temperature rules.

**Both releases**
- **Turnaround:** 7 days, labelled as a Gilir scheduling assumption.
- **Not released:** preparation text and rotation rules. The cited sources contain none.
- **Pest/weed coverage:** none. Pest/weed rules, coverage manifests and `pestCoverage` are not part of the contract (spec 1.1, #26).

## Verification (2026-11-15, latest release)

Node: the repo requires Node >= 24. This machine has no Node 24, so the checks ran on Node 22.20.0.

| Command | Result |
|---|---|
| `npx vitest run tests/engine/registry` | 6 files, 61 tests passed |
| `npm run check` | typecheck passed; 39 files / 490 tests passed, 5 files / 29 tests skipped (live suites, unchanged by E1); module boundaries passed |
| `npm run build` | passed |
| Earlier releases | unchanged except the empty `coverage` field removed to match the spec 1.1 contract |

E1 tests use the real release data, plus labelled synthetic fixtures (`syntheticRegistryFixture`) for resolution-rule edge cases. Fixture tests are component evidence only; a live plan from this data belongs to I2.

## Not verified here

- Human peer review of all releases.
- Gourdji et al. 2013 full text checked (values, window and source confirmed); it does not state whether daily maximum or minimum is compared (see review.md).
- That NASA POWER returns 15 or more complete seasons at the I2 hand-off point (B2/I2).
- Checks on Node 24 specifically.
- pstack: `AGENTS.md` asks for pstack's poteto-mode workflow, but pstack is not installed in this environment, so it did not run.
