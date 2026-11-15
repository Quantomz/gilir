# F4 independent review

Reviewed merged PR 42 at baseline `73e1b6fdd4302d1015aa2a78990842957f6cf1b7`. This review accompanies the shared-contract follow-up. Quantomz retains F4 implementation ownership.

## Finding

**P2. A leap-day start gives a no-plan PDF an extra day.** `src/client/pdf/compose.ts:195` uses `Date.setUTCFullYear` to calculate a no-plan horizon. The valid start `2028-02-29` overflows to `2029-03-01`. The real compose function prints `Your year: 29 Feb 2028 to 28 Feb 2029`. Spec section 4 at `spec.md:259` requires the exclusive anniversary `2029-02-28`; the last displayed day must therefore be `27 Feb 2029`. The plan-bearing branch uses the stored horizon and is unaffected. F4 should clamp this anniversary and cover all four no-plan branches with a February 29 case. No application code changed for this finding.

Reproduction on Node 24, from the repo:

```sh
node --import tsx --input-type=module -e 'import { compose } from "./src/client/pdf/compose.ts"; import { completedSnapshotsByState } from "./src/fixtures/results.ts"; const s=structuredClone(completedSnapshotsByState.insufficient_data); s.input.planningStart="2028-02-29"; console.log(compose(s,{locale:"en-GB",timeZone:"UTC"}).head.lines);'
```

## Shared-contract handoff

The current PDF reconstructs names from IDs. For example, `common-bean-dry` becomes `Common bean dry`, while its official catalogue label is `Common bean (dry grain)`. This follow-up supplies frozen catalogue evidence in new snapshots. F4 must use that evidence consistently in the header, timeline, warnings, duration proofs, history, baseline changes, missing-evidence lists and profile references. Legacy snapshots and unavailable historical IDs need the existing honest fallback. This report does not claim PDF label consumption is implemented.

## Checks observed

- Existing persistence and PDF unit suite passed, 187 tests across 9 files.
- Existing Chromium persistence suite passed, 16 tests. It exercised browser restart, server expiry, unavailable storage, newer envelopes, multiple tabs and separate fixture storage.
- Existing Chromium PDF suite passed, 7 tests. Plan, warning-plan and missing-data downloads matched the Node renderer byte-for-byte and opened in Chromium's PDF viewer while offline. This exercised the component harness, not the assembled app.
- Root inspected the committed missing-data PDF page 1 PNG. It is readable at the supplied resolution, preserves the no-plan status and synthetic labels, and shows no clipping on that page. This is a limited check of an existing fixture artifact, not a new whole-document visual acceptance.
- The leap-day defect was independently reproduced through the actual compose function. Passing the existing suites does not cover that edge case.

## Open component acceptance

PDF adoption of official labels, the leap-day fix, full Unicode font support, F1 storage-notice integration, and device/browser coverage remain with their owning frontend work. Current F4 evidence is fixture-based. This review does not establish deployed behavior or complete the assembled product's I3 acceptance.
