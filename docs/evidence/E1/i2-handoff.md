# E1 to I2 handoff cases

These public illustrative inputs replace the superseded Ibadan maize and Madrid winter-wheat cases. Registry resolution is component evidence. The current default is `fao56-hard-windows-2026-11-15`. Every retained profile has version `reviewed-2026-11-15.2`. The earlier `fao56-reviewed-2026-11-15` release with version `reviewed-2026-11-15.1` remains readable for frozen retries. See [hard-planting-windows.md](hard-planting-windows.md).

## Supported case: Boise dry bean

| Field | Value |
| --- | --- |
| Lookup | `[-116.2, 43.6]` near Boise, Idaho; use a small valid polygon containing this public illustrative point |
| Crops | `common-bean-dry` |
| Water | `rain_only`; backup-water answers change explanation only |
| Planning start | `2027-06-01` |
| History | Skipped |
| Profile | `common-bean-dry-fao56-idaho-jun` |
| Stage days | Initial 25, development 25, middle 30, late 20; 100 days total |
| Printed duration | 100 days, available from FAO-56 Table 11 |
| Kc | 0.4 / 1.15 / 0.35, FAO-56 Table 12 dry-bean row and stated non-tall-stalk assumption |
| Turnaround | 7 days, a Gilir scheduling assumption |
| Planting window | June, a hard constraint. A 2027-06-01 start plants in June 2027 |
| Temperature | Unassessed; there is no operational heat or cold rule |
| Component observation | One applicable profile and no registry gaps |

The source gives regional examples under stated management assumptions. The Idaho rectangle is an approximation, not a FAO-published boundary or farm certification. A complete usable climate cohort and actual calculation must still be established. A real returned plan belongs to I1 and I2; this note makes no live success claim.

## Unsupported control: Bangkok dry bean

Use `common-bean-dry` near Bangkok at lookup `[100.5, 13.75]`, with the same planning start, water answer, and skipped history. The purpose is in the catalogue, but no retained profile applies there. `resolveRegistry` returns no profiles and a `crop_profile` gap with reason `No released common-bean-dry profile applies at this location.`

The live HTTP and worker control must establish `insufficient_data` with this actual profile gap and no plan. Provider or cohort failure alone does not establish that control.

## Other verified component cases

| Point | Public resolver observation |
| --- | --- |
| Boise `[-116.2, 43.6]` | `maize-grain-fao56-idaho-apr`: 30/40/50/50 stage days, total 170 |
| Central India `[77.4, 23.3]` | `wheat-grain-fao56-central-india-nov`: 15/25/50/30 stage days, total 120 |
| Madrid `[-3.7, 40.4]` | Wheat uses the retained broader `wheat-grain-fao56-lat35-45n-mar-apr` row, total 135; maize remains 150 |

The former Madrid 404-day impossibility example depended on withheld winter wheat. Its replacement resolution totals 299 days including two 7-day turnarounds, so the former no-calendar-fit expectation no longer applies. Calendar search must determine the actual outcome.

Humid-Nigeria, East-African highland, and India dry/cool maize rows are withheld because the current lookup cannot establish their essential source qualifiers. Do not use those draft rows to claim live acceptance.
