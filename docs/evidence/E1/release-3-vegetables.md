# E1 release `fao56-vegetables-2026-11-15`

This release adds 23 annual vegetables and annual fruiting crops (41 profiles) to the 19 field crops of `fao56-temperature-2026-11-14`. The total is now 42 crops and 86 profiles. All earlier releases are still served unchanged; a JSON comparison against the committed versions confirmed they are byte-for-byte identical. The 45 earlier profiles are carried into this release unchanged (tested).

The supporting research is in the local report "Vegetable and annual fruit parameters" (git-ignored `reports/`). It used FAO-56 and peer-reviewed sources only.

**Scope.** The spec excludes perennial crops, so "fruits" means annual fruiting crops: tomato, pepper, eggplant, melons, watermelon, squash and pumpkin. Fruit trees, vines, asparagus, artichoke and strawberry (listed by FAO-56 among perennial vegetables) are out of scope.

## Decisions (card owner, 2026-11-15)

1. **Several FAO rows for one region:** release one profile per place, using the first row FAO-56 lists for that region. The planner picks profiles by location only, so a second row for the same place could never be selected. The skipped rows are named in each profile's warnings and listed below.
2. **Temperature rules:** crop-specific rules only, from sources about the crop itself. Nothing is borrowed from other crops.

## Temperature rules

| Crop | Rule | Source | Caveats recorded in `limitations` |
|---|---|---|---|
| Broccoli | Daily min **at or below −7 °C**, whole season | Luo 2011, Climatic Change 109:583-598, Table 2 (doi 10.1007/s10584-011-0028-6): lethal minimum −9 to −7 °C field, −5 to −3 °C pot (Tan et al. 1999) | −7 °C is the warmer end of the field range. The source tested short sub-zero exposures, and daily minimum is the closest daily-weather equivalent. |
| Broccoli | Daily max **above 35 °C**, mid-season | Luo 2011 Table 2 and section 3.3: failure point 35 °C maximum temperature during inflorescence production and floral initiation (Björkman & Pearson 1998) | The source exposure was about one week at 35 °C. Shorter exposures produced little injury, so one hot day is much milder. Placing floral initiation in mid-season is a Gilir assumption; it can fall in development. |
| Lettuce | Daily max **above 30 °C**, whole season | Qin et al. 2020, PLoS ONE 15:e0244198 (doi 10.1371/journal.pone.0244198): "temperatures above 30 °C have resulted in early lettuce bolting" (citing Jenni & Yan 2009) | Secondary citation; the original was not read. Qin's own experiment used sustained 33/25 °C from the sixth true leaf, so one hot day is much milder. Whole-season scope is a Gilir assumption. |

**Not added** (evidence below the bar or borrowed from another crop):
- tomato daily mean > 29 °C, and the 32/26 °C day/night regime (Sato, Peet, Pressman)
- cauliflower mean > 20 °C (curd induction delay, which is development rather than damage)
- pepper 33 °C and eggplant > 35 °C (search snippets only)
- chilling values (storage temperatures)
- green bean and sweet maize rules borrowed from dry bean and maize

## Profiles (FAO-56 Table 11 rows; Kc from Table 12)

| Crop (id) | Released rows (Init/Dev/Mid/Late = days, plant, region) | Kc ini / mid / end |
|---|---|---|
| Broccoli (`broccoli`) | 35/45/40/15 = 135 Sept Calif. Desert; Crucifers 20/30/20/10 = 80 April Mediterranean | 0.7 (group) / 1.05 / 0.95 |
| Brussels sprouts (`brussels-sprouts`) | Crucifers 20/30/20/10 = 80 April Mediterranean (footnote 1: crucifers include Brussels sprouts) | 0.7 / 1.05 / 0.95 |
| Cabbage (`cabbage`) | 40/60/50/15 = 165 Sept Calif. Desert; Crucifers April Mediterranean | 0.7 / 1.05 / 0.95 |
| Cauliflower (`cauliflower`) | 35/50/40/15 = 140 Sept Calif. Desert; Crucifers April Mediterranean | 0.7 / 1.05 / 0.95 |
| Carrot (`carrot`) | 30/50/90/30 = 200 Oct Calif. Desert; 30/40/60/20 = 150 Feb/Mar Mediterranean | 0.7 / 1.05 / 0.95 |
| Celery (`celery`) | 25/40/45/15 = 125 April Mediterranean | 0.7 / 1.05 / 1.00 |
| Lettuce (`lettuce`) | 20/30/15/10 = 75 April Mediterranean | 0.7 / 1.00 / 0.95 |
| Onion, dry bulb (`onion-dry`) | 20/35/110/45 = 210 Jan California ("Oct; Jan." / "Arid Region; Calif."); 15/25/70/40 = 150 April Mediterranean | 0.7 / 1.05 / 0.75 |
| Onion, green (`onion-green`) | 30/55/55/40 = 180 March California; 25/30/10/5 = 70 April/May Mediterranean | 0.7 / 1.00 / 1.00 |
| Spinach (`spinach`) | 20/20/15/5 = 60 April Mediterranean (first values of "15/25", "60/70", "Apr; Sep/Oct") | 0.7 / 1.00 / 0.95 |
| Radish (`radish`) | 5/10/15/5 = 35 Mar/Apr Mediterranean and Europe | 0.7 / 0.90 / 0.85 |
| Eggplant (`eggplant`) | 30/45/40/25 = 140 May/June Mediterranean (printed total 40; stage sum used) | 0.6 (group) / 1.05 / 0.90 |
| Sweet pepper (`sweet-pepper`) | 30/35/40/20 = 125 April/June Europe and Mediterranean (Init "25/30"; 30 matches the total) | 0.6 / 1.05 / 0.90 |
| Tomato (`tomato`) | 25/40/60/30 = 155 Jan Calif. Desert; 35/40/50/30 = 155 Apr/May California; 30/40/45/30 = 145 April/May Mediterranean | 0.6 / 1.15 / 0.90 (range 0.70-0.90; higher value, the more cautious) |
| Cantaloupe (`cantaloupe`) | 30/45/35/10 = 120 Jan California | 0.5 / 0.85 / 0.60 |
| Pumpkin, winter squash (`pumpkin-winter-squash`) | 20/30/30/20 = 100 Mar or Aug Mediterranean; 25/35/35/25 = 120 June Europe | 0.5 (group) / 1.00 / 0.80 |
| Squash, zucchini (`squash-zucchini`) | 25/35/25/15 = 100 April Mediterranean ("Apr; Dec." / "Medit.; Arid Reg."); 20/30/25/15 = 90 May/June Europe | 0.5 / 0.95 / 0.75 |
| Sweet melon (`sweet-melon`) | 15/40/65/15 = 135 Aug Calif. Desert; 30/30/50/30 = 140 March California; 25/35/40/20 = 120 May Mediterranean | 0.5 / 1.05 / 0.75 |
| Watermelon (`watermelon`) | 20/30/30/30 = 110 April Italy | 0.4 / 1.00 / 0.75 |
| Table beet (`beet-table`) | 15/25/20/10 = 70 Apr/May Mediterranean | 0.5 (roots group) / 1.05 / 0.95 |
| Green bean (`green-bean`) | 15/25/25/10 = 75 Aug/Sep Egypt and Lebanon; 20/30/30/10 = 90 Feb/Mar California and Mediterranean | 0.5 / 1.05 / 0.90 |
| Pea, fresh (`pea-green`) | Same Table 11 rows as dry pea: 35/25/30/20 = 110 April Idaho; 20/30/35/15 = 100 Mar/Apr Mediterranean; 15/25/35/15 = 90 May Europe | 0.5 / 1.15 / 1.10 (Peas - Fresh) |
| Sweet maize (`sweet-maize`) | 20/40/70/10 = 140 Jan Calif. Desert; 30/30/30/10 = 100 April Idaho (late cell "103" = 10 + footnote 3; printed total 110, stage sum used); 20/20/30/10 = 80 March Philippines; 20/25/25/10 = 80 May/June Mediterranean | 0.3 (cereals group) / 1.15 / 1.05 (fresh harvest, footnote 12) |

Precedence follows the existing policy: a smaller region outranks a larger one. For example, a field in the California desert gets the desert tomato row, and the rest of California gets the California row. New region boxes: Italy, Philippines, Egypt, Lebanon (approximate rectangles).

## Rows not released

| Row(s) | Reason |
|---|---|
| Lettuce 105 d Nov/Jan and 140 d Feb (Mediterranean) | Same region as the first-listed April row. |
| Spinach Sep/Oct 70 d variant | Same row and region as the first-listed April values. |
| Cantaloupe 120 d Aug (California) | Same region as the first-listed January row. |
| Crucifers 95 d February and 195 d Oct/Nov (Mediterranean) | Same region as the first-listed April Crucifers row. |
| Table beet 90 d Feb/Mar "Mediterranean & Arid" | The Mediterranean takes the first-listed Apr/May row. |
| Squash 90 d May/June for the Mediterranean | The Mediterranean takes the first-listed April row; this row's Europe part is released. |
| Green beans 75 d Aug/Sep for California | California takes the first-listed Feb/Mar row; this row's Egypt and Lebanon parts are released. |
| Arid / (Semi) Arid / Arid climate rows (carrot, celery, lettuce, onion green, spinach, radish, eggplant, sweet pepper, tomato, sweet melon, sweet maize), beets "Mediterranean & Arid", watermelon "Near East (desert)" with plant date "Mat/Aug" | Climate-type or undefined region, or a defective date. |
| Onion (seed) 275 d | Seed-production crop, not a food vegetable. |
| Faba bean "- green" sub-row 90/45/40/0 Nov Europe | Its late stage is 0 days; the registry requires at least 1 day per stage. |
| Green gram / cowpea fresh | Would duplicate the existing dry profiles with a different Kc end only. |
| Cucumber | Both rows are "Arid Region". |
| Garlic, turnip/rutabaga, parsnip | No Table 11 row (Kc only). |
| Cassava | "Rainy season" in "Tropical regions", and a two-year crop. |
| Strawberry | FAO-56 lists it with perennial vegetables, and has no Table 11 row. |
| Lima bean, okra, chili pepper, taro | Not in FAO-56 Table 11. Pereira 2021 gives Kc only. |

## Pereira et al. 2021 (vegetables): documented alternative, not released

Pereira, Paredes, López-Urrea, Hunsaker, Mota & Mohammadi Shad 2021, *Agricultural Water Management* 243:106196. It updates Kc mid/end from field studies, but gives no stage lengths and recommends against using FAO-56's indicative durations. FAO-56 stays the baseline. Largest differences (FAO-56 → Pereira, mid/end):

| Crop | FAO-56 | Pereira 2021 |
|---|---|---|
| Cantaloupe | 0.85 / 0.60 | 1.00 / 0.80 |
| Broccoli | 1.05 / 0.95 | 1.10 / 1.10 |
| Sweet pepper | 1.05 / 0.90 | 1.10 / 1.05 |
| Onion, dry | 1.05 / 0.75 | 1.05 / 0.65 |
| Onion, green | 1.00 / 1.00 | 1.05 / 0.90 |
| Eggplant | 1.05 / 0.90 | 1.05 / 1.00 |
| Sweet melon | 1.05 / 0.75 | 1.05 / 0.85 |
| Tomato | 1.15 / 0.70-0.90 | processing 1.10 / 0.90; fresh market 1.10 / 1.00 |

Most other vegetables differ by 0 to 0.10. The full list is in the research notes.

## Mediterranean dependence

Celery, lettuce, spinach, table beet, eggplant and Brussels sprouts have only a Mediterranean row. If the Mediterranean bounding box were dropped, those crops would have no profile.
