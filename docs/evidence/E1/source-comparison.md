# E1 source comparison: FAO-56 release `fao56-2026-11-14`

Source page: [FAO-56 Chapter 6](https://www.fao.org/4/x0490e/x0490e0b.htm), extracted 2026-11-14 from the raw HTML (not a summary). Registry source IDs: `fao56-table11` (stage lengths) and `fao56-table12` (crop coefficients).

All values are FAO-56 **examples for the stated region and planting period** under standard (non-stressed, well-managed) conditions. They are not local observations or a validation for any farm.

## Stage lengths: FAO-56 Table 11

Source cells are copied as `Init | Dev | Mid | Late | Total | Plant date | Region`.

| Profile id | Table 11 crop row | Source cells | Released `generatedStageDays` | Planting window | Precedence |
|---|---|---|---|---|---|
| `maize-grain-fao56-idaho-apr` | Maize (grain) | 30 \| 40 \| 50 \| 50 \| 170 \| April \| Idaho, USA | 30/40/50/50 = 170 | 04-01 to 04-30 | 1 |
| `maize-grain-fao56-nigeria-humid-jun` | Maize (grain) | 20 \| 35 \| 40 \| 30 \| 125 \| June \| Nigeria (humid) | 20/35/40/30 = 125 | 06-01 to 06-30 | 2 |
| `maize-grain-fao56-spain-california-apr` | Maize (grain) | 30 \| 40 \| 50 \| 30 \| 150 \| April \| Spain (spr, sum.); Calif. | 30/40/50/30 = 150 | 04-01 to 04-30 | 3 |
| `maize-grain-fao56-east-africa-highland-apr` | Maize (grain) | 30 \| 50 \| 60 \| 40 \| 180 \| April \| East Africa (alt.) | 30/50/60/40 = 180 | 04-01 to 04-30 | 4 |
| `maize-grain-fao56-india-dry-cool-oct` | Maize (grain) | 20 \| 35 \| 40 \| 30 \| 125 \| October \| India (dry, cool) | 20/35/40/30 = 125 | 10-01 to 10-31 | 5 |
| `common-bean-dry-fao56-idaho-jun` | Beans (dry) | 25 \| 25 \| 30 \| 20 \| 100 \| June \| Idaho, USA | 25/25/30/20 = 100 | 06-01 to 06-30 | 1 |
| `common-bean-dry-fao56-pakistan-california-jun` | Beans (dry) | 15 \| 25 \| 35 \| 20 \| 95 \| June \| Pakistan, Calif. | 15/25/35/20 = 95 | 06-01 to 06-30 | 2 |
| `wheat-grain-fao56-central-india-nov` | Barley/Oats/Wheat | 15 \| 25 \| 50 \| 30 \| 120 \| November \| Central India | 15/25/50/30 = 120 | 11-01 to 11-30 | 1 |
| `wheat-grain-fao56-california-winter-dec` | Winter Wheat | 20² \| 60² \| 70 \| 30 \| 180 \| December \| Calif., USA | 20/60/70/30 = 180 | 12-01 to 12-31 | 2 |
| `wheat-grain-fao56-east-africa-jul` | Barley/Oats/Wheat | 15 \| 30 \| 65 \| 40 \| 150 \| July \| East Africa | 15/30/65/40 = 150 | 07-01 to 07-31 | 3 |
| `wheat-grain-fao56-mediterranean-winter-nov` | Winter Wheat | 30 \| 140 \| 40 \| 30 \| 240 \| November \| Mediterranean | 30/140/40/30 = 240 | 11-01 to 11-30 | 4 |
| `wheat-grain-fao56-lat35-45n-mar-apr` | Barley/Oats/Wheat | 20 \| 25 \| 60 \| 30 \| 135 \| March/Apr \| 35-45 °L | 20/25/60/30 = 135 | 03-01 to 04-30 | 5 |

The superscript "²" on the California winter wheat row is footnote 2 (winter wheat stages lengthen in frozen climates). The raw HTML renders it glued to the number as "202" and "602".

`publishedDurationDays` for each profile is the row total. `historicalStageAllocations` contains only the same row, so a farmer's past season is scored only if it matches the published allocation. Planting windows use basis `recommendation`: they cover the row's plant month and are not hard limits.

### Table 11 rows deliberately not released

| Row | Reason |
|---|---|
| Maize (grain) 25/40/45/30 = 140, Dec/Jan, "Arid Climate" | The region is a climate type with no numeric definition in the source. A climate scope would invent thresholds. |
| Beans (dry) 20/30/40/20 = 110, May/June, "Continental Climates" | Same: not mappable to a region or numeric climate range without inventing one. |
| Barley/Oats/Wheat 40/30/40/20 = 130 Apr; 40/60/60/40 = 200 Nov | The region cell is blank in the source HTML. Assigning a region would be a guess. |
| Barley/Oats/Wheat 20/50/60/30 = 160, Dec, Calif. Desert, USA | Overlaps the California winter wheat row. Kept out of the first release to avoid two California wheat profiles needing a desert/non-desert boundary. |
| Winter Wheat 160/75/75/25 = 335, October, Idaho, USA | Frozen-soil overwintering season. A 335-day occupancy leaves no room for another crop in a one-year plan. It could be added later with frozen-soil Kc ini 0.4. |

## Crop coefficients: FAO-56 Table 12

| Crop | Table 12 row (source cells) | Released Kc ini / mid / end | Choice and footnote |
|---|---|---|---|
| Maize (grain) | "Maize, Field (grain) (field corn)": mid 1.20, end 0.60-0.35¹¹. Kc ini from group row "i. Cereals" 0.3 | 0.3 / 1.20 / 0.35 | Footnote 11: the second Kc end value is for harvest after complete field drying of the grain. A dry-grain crop-purpose uses 0.35. |
| Common bean (dry) | "Beans, dry and Pulses": 0.4 \| 1.15² \| 0.35 | 0.4 / 1.15 / 0.35 | Footnote 2: 1.20 applies when dry beans grow on stalks reaching 1.5-2 m. Not grown on tall stalks is assumed. |
| Wheat (spring type) | "Spring Wheat": mid 1.15, end 0.25-0.4¹⁰. Kc ini from "i. Cereals" 0.3 | 0.3 / 1.15 / 0.25 | Footnote 10: the higher value is for hand-harvested crops. Machine harvest is assumed. |
| Wheat (winter) | "Winter Wheat - with non-frozen soils": 0.7 \| 1.15 \| 0.25-0.4¹⁰ | 0.7 / 1.15 / 0.25 | California and Mediterranean have mild winters, so the non-frozen-soil row applies. Machine harvest is assumed. |

Footnote 1 applies to every Kc ini: the values are general, and frequent wetting (including daily rain) can raise Kc ini toward 1.0-1.2. Table 12 values are for sub-humid conditions (RHmin about 45%, u2 about 2 m/s). This release applies no climatic adjustment. Every profile's `kc.assumptions` records these points.

## Assumptions that are not from the source

| Item | Value | Status |
|---|---|---|
| Field turnaround after harvest | 7 days, `basis: "scheduling_assumption"` | Gilir planning assumption chosen by the card owner. FAO-56 gives no turnaround. It is labelled as such in every profile. |
| Region rectangles (`src/registry/regions.ts`) | Approximate bounding boxes around each named place | Author mapping of FAO's place names to lon/lat. Edges are rough. "East Africa (alt.)" means highland, but elevation is not checked, and the profile carries a warning. "35-45 °L" is applied to northern latitudes only. |
| Precedence within a crop | Smaller region outranks a larger one (1 = highest) | Registry policy, so overlapping regions resolve deterministically. Example: California winter wheat (2) beats the 35-45°N band (5). |
| Scientific names | *Zea mays*, *Phaseolus vulgaris*, *Triticum* spp. | FAO-56 uses common names only. Mapping "Beans (dry)" to *Phaseolus vulgaris* is an assumption. |
| Temperature rules | None released | FAO-56 Tables 11-12 give no daily heat or cold limits. Temperature checks stay unassessed. |
| Preparation text | None released | The cited sources contain no preparation steps. |
| Pest/weed rules and coverage | None | Removed from the MVP (spec 1.1, section 3.4). `pestCoverage` is always unavailable. |
