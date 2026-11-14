# E1 evidence

The current default is `fao56-reviewed-2026-11-15`: 75 profiles, 40 food crop purposes, and no operational temperature or rotation rules. Every retained profile has version `reviewed-2026-11-15.1`. The empty rotation-rule identity remains `no-rules-2026-11-14`.

This source correction preserves supported FAO curation, withholds 11 unresolved rows, and marks four retained printed-duration conflicts unavailable. It does not establish field validation or a live plan.

| File | Current purpose |
| --- | --- |
| [remediation.md](remediation.md) | Source decisions, compatibility policy, verification, and pending review |
| [remediation-observed.json](remediation-observed.json) | Public-entrypoint inventory, canonical digest, source comparison counts, and selected cases |
| [i2-handoff.md](i2-handoff.md) | Supported Boise case and unsupported Bangkok control |
| [source-comparison.md](source-comparison.md) | Superseded draft source curation, preserved for history |
| [release-2-temperature-and-crops.md](release-2-temperature-and-crops.md) | Superseded draft field-crop and temperature narrative |
| [release-3-vegetables.md](release-3-vegetables.md) | Superseded draft vegetable curation |
| [release-4-temperature-rules.md](release-4-temperature-rules.md) | Superseded draft operational temperature mappings |
| [review.md](review.md) | Historical draft review claims, not reused for corrected-release acceptance |

`v1-empty` remains byte-for-byte unchanged. The four unmerged E1 draft identities are explicitly retired: `fao56-2026-11-14`, `fao56-temperature-2026-11-14`, `fao56-vegetables-2026-11-15`, and `fao56-temperature-rules-2026-11-15`. Lookup throws a retired-release `RangeError`. Draft jobs cannot resume through the corrected default. No alias or persisted-job rewrite is included. The compatibility decision is recorded in [contracts](../../contracts.md).

The [X1 evidence](../X1/README.md) remains an audit of `090626a`. Its source observations inform this correction; its historical failing result is preserved. Component tests compare the corrected public API with those observations and use labelled synthetic weather for the temperature-unassessed check. Real NASA, HTTP, PostgreSQL, restarts, and a returned plan remain integration acceptance.
