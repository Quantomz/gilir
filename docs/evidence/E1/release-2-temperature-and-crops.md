# E1 release `fao56-temperature-2026-11-14`

> Superseded draft evidence. This document preserves the original E1 curation and review narrative. It does not establish acceptance of the corrected release. The four draft identities are retired; see [current remediation](remediation.md).

This release adds daily temperature rules for maize, common bean and wheat, and 16 more crops from FAO-56. The earlier release `fao56-2026-11-14` is still served unchanged for frozen-job retries. A byte-for-byte JSON comparison against the committed version confirmed this. The research behind the choices is in the local report "Crop temperature limits and parameters" (git-ignored `reports/`), produced from peer-reviewed and FAO sources only.

**Spec 1.1 update (2026-11-15).** After main merged the spec 1.1 contract (#26), every release record dropped its empty `coverage` field to pass the strict schema. All other data in every release is unchanged, and catalogue and rule versions are kept.

## 1. Temperature rules

The rule format is: daily air temperature above the threshold during the FAO-56 mid-season stage. A day counts as exposure. E2 computes the fraction of mid-season days above the threshold. A flagged day is a warning, not a ranking input (spec 1.1).

| Crop | Rule | Sources (registry id) | What the source says | Caveats recorded in `limitations` |
|---|---|---|---|---|
| Maize | `max_c above 35` | `gourdji2013`, `teixeira2013` | Gourdji et al. 2013: critical temperature 35 °C for maize, 30-day reproductive window centred about 5 days before silking. Teixeira et al. 2013 Table 2: Tcrit 35 °C, Tlim 45 °C on daytime temperature. | Teixeira uses daytime temperature, not Tmax, so Tmax flags more often. Maximum damage is at 45 °C. The window is 30 days, while mid-season is longer. Gourdji does not state verbatim that it uses Tmax. Air, not canopy, temperature. |
| Wheat (all 5 profiles) | `max_c above 34` | `gourdji2013`, `teixeira2013` | Gourdji et al. 2013: 34 °C for wheat, 30-day window centred about 5 days before heading. | Conflicts with Teixeira's 27 °C onset / 40 °C maximum on daytime temperature. Same window, variable and air-temperature notes as maize. Porter & Gawith 1999 (31 °C anthesis upper development limit) is a further conflicting value. It is recorded here only, because it was read through reproductions, not the original. |
| Common bean | `max_c above 30` and `min_c above 20` | `vargas2021`, `silva2020` | Vargas et al. 2021 (Introduction): "Temperatures higher than 20°C during the night or higher than 30°C during the day have been reported to cause seed yield reduction" (cites Rainey & Griffiths 2005). Silva et al. 2020 (Discussion), quoting Porch et al. 2010: "mean maximum daily temperatures above 30 °C and nighttime temperatures above 20 °C" can significantly affect bean yield "in the tropics". | A rule of thumb quoted in two peer-reviewed papers that credit different originals, which were not read. The sources name no stage or window, so the mid-season scope is a Gilir assumption. Silva limits the statement to the tropics. |
| Rice (paddy) | `max_c above 36` | `gourdji2013`, `teixeira2013` | Gourdji et al. 2013: 36 °C for rice. | Teixeira uses 35 °C (onset) to 45 °C (maximum) on daytime temperature for wetland rice. |
| Soybean | `max_c above 39` | `gourdji2013`, `teixeira2013` | Gourdji et al. 2013: 39 °C for soybean. | Conflicts with Teixeira's 35 °C onset / 40 °C maximum on daytime temperature. |

**Why Gourdji for rice and soybean.** The approved wheat rule is Gourdji's 34 °C. Gourdji's maize value (35 °C) matches Teixeira's. Using one study for all four Gourdji crops keeps the thresholds comparable. Teixeira's values are recorded in each rule's limitations as the alternative.

**Teixeira et al. 2013 Table 2 was checked against the full text.** The table text was extracted from the openly hosted PDF: "Maize (Zea mays) 35 45, Wetland rice (Oriza sativa) 35 45, Soybean (Glycine max) 35 40, Wheat (Triticum aestivum) 27 40". Two research notes read the same PDF independently.

**No rule added for** the other 14 crops, frost/cold limits (none credible as a daily air-temperature predicate), or the wheat multi-day and conditional rules (Harkness et al. 2020: Tmax > 35 °C on 3 or more days; Tmin ≤ −20 °C with no snow). The schema cannot express those.

## 2. New crops and profiles (FAO-56 Tables 11 and 12)

Source cells are `Init | Dev | Mid | Late | Total | Plant date | Region`. Each profile's region box is approximate (`src/registry/regions.ts`). Precedence 1 is the smallest region.

| Crop (id) | Profile slug | Table 11 cells | Planting window | Kc ini / mid / end (Table 12) |
|---|---|---|---|---|
| Rice (`rice-paddy`) | mediterranean-may | 30 \| 30 \| 60 \| 30 \| 150 \| Dec; May \| Tropics; Mediterranean | 05-01 to 05-31 | 1.05 / 1.20 / 0.90 |
| | tropics-dec | same row | 12-01 to 12-31 | same |
| Barley (`barley-grain`) and Oats (`oats-grain`) | california-desert-dec | Barley/Oats/Wheat 20 \| 50 \| 60 \| 30 \| 160 \| Dec \| Calif. Desert, USA | Dec | 0.3 / 1.15 / 0.25 |
| | central-india-nov | 15 \| 25 \| 50 \| 30 \| 120 \| November \| Central India | Nov | same |
| | east-africa-jul | 15 \| 30 \| 65 \| 40 \| 150 \| July \| East Africa | Jul | same |
| | lat35-45n-mar-apr | 20 \| 25 \| 60 \| 30 \| 135 \| March/Apr \| 35-45 °L | Mar-Apr | same |
| Millet (`millet-grain`) | pakistan-jun | 15 \| 25 \| 40 \| 25 \| 105 \| June \| Pakistan | Jun | 0.3 / 1.00 / 0.30 |
| | central-usa-apr | 20 \| 30 \| 55 \| 35 \| 140 \| April \| Central USA | Apr | same |
| Sorghum (`sorghum-grain`) | usa-pakistan-mediterranean-may-jun | 20 \| 35 \| 40 \| 30 \| 130 \| May/June \| USA, Pakis., Med. | May-Jun | 0.3 / 1.10 / 0.55 |
| Soybean (`soybean-grain`) | japan-jun | 20 \| 25 \| 75 \| 30 \| 150 \| June \| Japan | Jun | 0.4 / 1.15 / 0.50 |
| | central-usa-may | 20 \| 30/35 \| 60 \| 25 \| 140 \| May \| Central USA | May | same |
| | tropics-dec | 15 \| 15 \| 40 \| 15 \| 85 \| Dec \| Tropics | Dec | same |
| Groundnut (`groundnut`) | mediterranean | 35 \| 45 \| 35 \| 25 \| 140 \| (misaligned) \| Mediterranean | none | 0.4 / 1.15 / 0.60 |
| | west-africa-dry-season | 25 \| 35 \| 45 \| 25 \| 130 \| Dry season \| West Africa | none | same |
| Lentil (`lentil-dry`) | europe-apr | 20 \| 30 \| 60 \| 40 \| 150 \| April \| Europe | Apr | 0.4 / 1.10 / 0.30 |
| Pea (`pea-dry`) | idaho-apr | 35 \| 25 \| 30 \| 20 \| 110 \| April \| Idaho, USA | Apr | 0.4 / 1.15 / 0.30 |
| | mediterranean-mar-apr | 20 \| 30 \| 35 \| 15 \| 100 \| Mar/Apr \| Mediterranean | Mar-Apr | same |
| | europe-may | 15 \| 25 \| 35 \| 15 \| 90 \| May \| Europe | May | same |
| Faba bean (`faba-bean-dry`) | mediterranean-mar-apr | 20 \| 30 \| 35 \| 15 \| 100 \| Mar/Apr \| Mediterranean | Mar-Apr | 0.5 / 1.15 / 0.30 |
| | europe-may | 15 \| 25 \| 35 \| 15 \| 90 \| May \| Europe | May | same |
| Mung bean (`mung-bean-dry`) and Cowpea (`cowpea-dry`) | mediterranean-mar | Green gram, cowpeas 20 \| 30 \| 30 \| 20 \| 110 \| March \| Mediterranean | Mar | 0.4 / 1.05 / 0.35 |
| Sunflower (`sunflower-seed`) | mediterranean-california-apr-may | 25 \| 35 \| 45 \| 25 \| 130 \| April/May \| Medit.; California | Apr-May | 0.35 / 1.00 / 0.35 |
| Safflower (`safflower-seed`) | california-apr | 20 \| 35 \| 45 \| 25 \| 125 \| April \| California, USA | Apr | 0.35 / 1.00 / 0.25 |
| Potato (`potato`) | california-desert-dec | 30 \| 35 \| 50 \| 25 \| 140 \| Dec \| Calif. Desert, USA | Dec | 0.5 / 1.15 / 0.75 |
| | idaho-apr-may | 45 \| 30 \| 70 \| 20 \| 165 \| Apr/May \| Idaho, USA | Apr-May | same |
| | europe-apr | 30 \| 35 \| 50 \| 30 \| 145 \| April \| Europe | Apr | same |
| Sweet potato (`sweet-potato`) | mediterranean-apr | 20 \| 30 \| 60 \| 40 \| 150 \| April \| Mediterranean | Apr | 0.5 / 1.15 / 0.65 |
| | tropics-rainy-season | 15 \| 30 \| 50 \| 30 \| 125 \| Rainy seas. \| Tropical regions | none | same |

### Kc choices where Table 12 gives a range or a blank

| Crop | Table 12 cell | Released | Why |
|---|---|---|---|
| Sorghum, grain | mid 1.00-1.10 (no footnote) | 1.10 | Higher value gives the more cautious water-demand estimate. Pereira et al. 2021 also lists 1.10 (section 3; not a registry source). |
| Rice | end 0.90-0.60 (no footnote) | 0.90 | Higher value gives the more cautious estimate. |
| Sunflower, Safflower | mid 1.0-1.15 (footnote 9) | 1.0 | Footnote 9: "The lower values are for rainfed crops having less dense plant populations." Rainfed, less dense stands are assumed. |
| Green gram/cowpeas | end 0.60-0.35 (footnote 6) | 0.35 | Footnote 6: second value is for harvested dry. |
| Potato | end 0.75 (footnote 4) | 0.75 | Footnote 4 gives about 0.40 only for long-season potatoes with vine kill. No vine kill is assumed. |
| Peas, dry/seed | Kc ini blank (fresh row lists 0.5) | 0.4 | Legumes group value. |
| Rice | Kc ini 1.05 | 1.05 | Assumes 0.10-0.20 m standing water, sub-humid, light wind (Table 14 range 1.00-1.20). |
| Group Kc ini | blank crop cells | cereals 0.3, legumes 0.4, oil crops 0.35, roots/tubers 0.5 | Table 12 group rows. |

### Readings of ambiguous Table 11 cells

- **Rice** "Dec; May" with "Tropics; Mediterranean" is read as December for the tropics and May for the Mediterranean, giving two profiles.
- **Soybean, Central USA**: the development cell is "30/35". 35 is used because only 20 + 35 + 60 + 25 = 140 matches the row total.
- **Groundnut**: the plant-date cells are misaligned in the HTML ("Dry" / "season" / "May May/June"). No planting window is released for either groundnut profile.

### Rows whose printed total disagrees with their stage lengths

Found on 2026-11-15 when listing the release; both independent reviews missed it.

| Row | Stage sum | Printed total | Released |
|---|---|---|---|
| Sorghum 20 \| 35 \| 40 \| 30 \| 130 \| May/June \| USA, Pakis., Med. | 125 | 130 | Stages as printed; season length 125 days (the stage sum). A warning notes the unused printed 130. |
| Green gram, cowpeas 20 \| 30 \| 30 \| 20 \| 110 \| March \| Mediterranean | 100 | 110 | Stages as printed; season length 100 days (the stage sum) on both the mung bean and cowpea profiles. A warning notes the unused printed 110. |

Decision (card owner, 2026-11-15): use the summed stage days as the season length. No stage length was changed.

### Table 11 rows not released

| Row | Reason |
|---|---|
| Rice 30/30/80/40 = 180, May, Tropics | Same region as the 150-day tropical row, with no stored rule to choose between them. The HTML also prints "30." in the development cell. |
| Sorghum 140 Mar/April "Arid Region"; Potato "(Semi) Arid", "Continental"; Lentil "Arid Region"; Safflower "High Latitudes", "Arid Region"; Groundnut "High Latitudes" | Climate-type regions with no geographic or numeric definition in the source. |
| Barley/Oats/Wheat 130 Apr and 200 Nov | Region cell empty in the source. |
| Faba bean, broad bean, dry: 90/45/40/60 = 235, Nov, Europe | Same region as the released Europe May faba row, with no stored rule to choose between the two Europe rows. |
| Grains (small) 150 April Mediterranean; 165 Oct/Nov Pakistan; Arid Reg. | The row does not name barley, oats or any other specific crop, so it is not assigned to a crop profile. |
| Castor bean (Indonesia, Nov) | Industrial oil crop. The catalogue only allows `food` or `cover` purposes, so it cannot be described accurately. |

## 3. Pereira et al. 2021: documented alternative, not released

Pereira, Paredes, Hunsaker, López-Urrea & Mohammadi Shad 2021, *Agricultural Water Management* 243:106466 (doi 10.1016/j.agwat.2020.106466), plus the companion vegetables paper (AWM 243:106196, for potato). These update FAO-56 Kc mid/end from field studies. They give **no stage lengths**, so they cannot form a complete profile on their own. FAO-56 stays the baseline so that stage lengths and Kc come from one source. The registry schema has no field for alternative Kc values, so they are recorded here.

| Crop | FAO-56 Kc mid/end (released) | Pereira 2021 standard Kc mid/end |
|---|---|---|
| Barley | 1.15 / 0.25 | 1.05 / 0.25 |
| Oats | 1.15 / 0.25 | 1.05 / 0.25 |
| Millet (pearl) | 1.00 / 0.30 | 1.10 / 0.35 (its text says millet was unchanged; the table and text disagree) |
| Sorghum, grain | 1.10 / 0.55 | 1.10 / 0.45 |
| Rice | 1.20 / 0.90 | flooded 1.20 / 1.05; rainfed 1.10 / 0.80 (Kc ini 1.05 / 0.80) |
| Soybean | 1.15 / 0.50 | 1.15 / 0.35 |
| Groundnut | 1.15 / 0.60 | 1.10 / 0.60 |
| Green gram (mung bean) | 1.05 / 0.35 | 1.15 / 0.65 |
| Cowpea (dry) | 1.05 / 0.35 | 1.10 / 0.45 |
| Sunflower | 1.00 / 0.35 | 1.20 / 0.30 |
| Potato | 1.15 / 0.75 | short season 1.15 / 0.75; long season 1.15 / 0.40 |

## 4. Assumptions carried over from release 1

- Turnaround is a 7-day scheduling assumption.
- Region boxes are approximate rectangles. The new boxes are tropics (±23.44°), West Africa, Europe, Japan, Central USA, contiguous USA and California desert.
  - Japan uses two rectangles (Honshu/Kyushu/Shikoku and Hokkaido) so that Korea, northeast China and the Russian Far East are excluded.
  - Profiles carry warnings where a box clearly reaches beyond the named place: the USA box reaches northern Mexico and southern Canada; the California desert box includes Yuma and Mexicali.
  - The West Africa box spans the Sahara and the Europe box touches North Africa and Anatolia. These are recorded as known limitations.
- Precedence: a smaller region outranks a larger one.
- No preparation text, rotation rules or pest coverage.
