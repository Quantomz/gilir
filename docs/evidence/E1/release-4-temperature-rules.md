# E1 release `fao56-temperature-rules-2026-11-15`

This release adds 23 crop-specific daily temperature rules for 16 crops. It changes nothing else: the crops, profiles, stage lengths, Kc and regions are identical to `fao56-vegetables-2026-11-15`. A profile that gains rules gets a new profile version and the release-4 review record. All earlier releases are still served unchanged, confirmed by a byte-for-byte JSON comparison against the committed versions.

The research behind this release is in the local report "Temperature rules for remaining crops" (git-ignored `reports/`). Six research tracks covered the crops that had no rule, using peer-reviewed papers and reviews only.

## Decisions (card owner, 2026-11-15)

1. **Crop-specific rules only.** Two proposed same-species inherited rules were not added:
   - sweet maize from field maize (max > 35 °C)
   - green bean from dry bean (min > 20 °C)
2. **Barley canopy frost, and the same rule for wheat.** Barley's canopy-frost rule (Frederiks et al. 2015) is added. Wheat gets the matching rule from the same paper so the two cereals are treated alike. It was rejected earlier because it is a crop-canopy, not weather-station, temperature; that caveat is stated on both rules.

## Rules added

All rules are daily air-temperature checks that produce warnings only. "Mid" is the FAO-56 mid-season stage. Each rule's `limitations` carries the caveats in full.

| Crop | Rule | Source (DOI) | Access | Key caveat |
|---|---|---|---|---|
| Wheat | min ≤ −3.5 °C, mid | Frederiks et al. 2015, J Exp Bot (10.1093/jxb/erv088) | Full text | Canopy, not screen, temperature: under-warns on radiant frosts |
| Barley | min ≤ −12.9 °C, whole season | Luo 2011 Table 2 (Prasil 2007 LT50); Frederiks 2015 | Full text | Hardened winter barley; under-warns for spring or dehardened crops |
| Barley | min ≤ −4 °C, mid | Frederiks 2015 | Full text | Canopy temperature, as for wheat |
| Sorghum | mean ≥ 31 °C, mid | Prasad 2015 (10.3389/fpls.2015.00820); Prasad 2006; Djanaguiraman 2018 | Full text and abstract | Chamber regimes; sensitive window shorter than mid-season |
| Sorghum | mean ≥ 35 °C, mid | Luo 2011 (40/30 °C failure point); Prasad 2015 | Full text | Day/night-to-mean mapping is arithmetic |
| Sorghum | min ≤ 10 °C, mid | Brooking 1976 (10.1071/PP9760589) | Abstract | One cold-night treatment; booting may fall in late development |
| Groundnut | max > 37 °C, mid | Luo 2011 §3 (Vara Prasad 2000) | Full text | Short heat episodes at flowering, one cultivar |
| Lentil | max > 32 °C, mid | Sita 2017 (10.3389/fpls.2017.00744) | Full text | 32/20 °C originates in a conference paper; only the maximum is encoded |
| Faba bean (dry) | max ≥ 28 °C, mid | Bishop 2016 (10.1111/jac.12172) | Full text | 5-day chamber stress; over-warns where nights are cooler |
| Faba bean (dry) | min ≤ −4 °C, mid | Alharbi 2021 (10.3390/plants10091925) | Full text | Two field frost events, not a fitted threshold |
| Mung bean (dry) | max > 36 °C, mid | Priya 2019 (10.1038/s41598-019-44163-w), citing Kaur 2015 | Full text (secondary statement) | Only the day value of 36/28 °C is encoded |
| Cowpea (dry) | min ≥ 24 °C, mid | Patel & Hall 1990 (10.2135/cropsci1990.0011183X003000030029x) | Abstract | Field-site mean; likely fires late |
| Sunflower | min ≤ −4 °C, whole season | Kaya 2025 (10.7717/peerj.20282); Hniličková 2017 | Full text | Seedling data; later frosts likely damage at warmer temperatures |
| Potato | min ≤ −2.5 °C, whole season | Seppänen 2001 (10.23986/afsci.5690) | Abstract | Foliage lethal temperature; over-warns before emergence |
| Potato | min > 18 °C, development | Kim & Lee 2019 (10.3389/fpls.2019.00300); Gautam 2024 | Full text | Warm nights suppress tuberization; daily minimum fires late |
| Cauliflower | mean > 20 °C, development | Rosen 2018 (10.3389/fpls.2018.00078) | Full text (secondary statement) | Summer cultivars; delay of curd induction, not damage |
| Spinach | mean > 20 °C, initial | Leskovar 1999, J Am Soc Hortic Sci 124:301-306 | Abstract | Laboratory seed thermoinhibition; direct-seeded crops only |
| Sweet pepper | max ≥ 32 °C, mid | Aloni 2001 (10.1034/j.1399-3054.2001.1120407.x); Karni & Aloni 2002 | Abstract | 32/26 °C chamber regime; only the day value is encoded |
| Sweet pepper | min ≤ 12 °C, mid | Darnell 2012 (10.1093/aob/mcs173) | Abstract | Fruit malformation (quality), not chilling injury |
| Tomato | mean ≥ 29 °C, mid | Pressman 2002 (10.1093/aob/mcf240), citing Peet 1997; Sato 2006; Sato 2002 | Full text and abstract | Chronic multi-day exposure; the sensitive window is narrower |
| Tomato | max > 40 °C, mid | Pressman 2002 and Sato 2006, citing Iwahori 1965 | Full text (secondary statement) | Needs a few hours above 40 °C, not just a daily maximum |
| Watermelon | max ≥ 32 °C, mid | Tao 2026 (10.3389/fpls.2026.1902742), citing Manzano 2014 | Full text (secondary statement) | Shift in sex expression; yield effect not quantified |
| Green bean | min ≥ 27 °C, mid | Konsens 1991 (10.1093/oxfordjournals.aob.a088155) | Abstract | Single night-temperature contrast with a 17 °C control |

**Source metadata.** Where a paper's full title was not confirmed during research, the registry gives a descriptive title (authors, year, journal and volume, topic) instead of guessing it. The Luo 2011 entry in this release names the barley, sorghum, groundnut and broccoli passages it supports. The earlier releases keep their original Luo entry.

## Crops still "not assessed" (20)

These crops have no rule; the app shows their temperature risk as not assessed and never as safe.

| Crop(s) | Why no rule |
|---|---|
| Oats, millet (unspecified species), sweet potato, Brussels sprouts, eggplant, cantaloupe, sweet melon, pumpkin, zucchini, dry and fresh pea | Only snippets, storage temperatures or conflicting secondary values. Pearl millet's field threshold (max 42 °C, Gupta et al. 2015) is ready if a pearl-millet profile is created. |
| Carrot, celery, dry and green onion, radish, table beet, cabbage | Bolting is driven by weeks of accumulated cold (vernalization), which a single-day rule cannot express. Table beet's only values come from sugar beet. |
| Sweet maize | Its only rule would be inherited from field maize (owner decision: crop-specific only). |
| Safflower | A −7 °C rosette rule was proposed but removed after the independent review. Landry et al. 2017 give −7 °C in a passage on winter-type germplasm and report spring types surviving worse than winter types at −4.4 °C, so the rule would under-warn for the spring-sown California profile. |

Crops that now have a rule may still lack a frost or a heat rule. Those directions stay unassessed, not safe.

## Credibility notes

- The US Climate Change Science Program SAP 4.3 public-review draft (Hatfield et al. 2008) is not cited as a source. It is mentioned only in one limitation, as corroboration of the sorghum 35 °C failure point, which Luo 2011 also supports.
- Hatfield et al. 2011 (Agronomy Journal) could not be opened, so no value is attributed to it.
- Values that research read only through web-tool summaries (Frederiks barley sentence, Kaya 2025, Gautam 2024) were re-checked by the independent review (see `review.md`, release 4).
