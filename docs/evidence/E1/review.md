# E1 independent source review

**Reviewer:** a separate Claude agent, run on 2026-11-14. It was given only the profile file, the region file and the FAO-56 URL, not the author's conclusions, and was told to distrust the transcription. It re-downloaded the raw FAO-56 Chapter 6 HTML, parsed it independently, and checked ROWSPAN attributes to confirm which crop each unlabelled Table 11 row belongs to.

**Not a human review.** The card asks for "a second person or independent review". This agent check is the independent review recorded in each profile's `review.reviewer` field. The PR asks a human teammate to confirm before merge. This is not a cross-family review.

## Result

All numeric values match the source. The check covered all 12 profiles:
- stage days, totals and planting months against FAO-56 Table 11
- Kc ini / mid / end against FAO-56 Table 12
- each footnote reading: footnote 1 (Kc ini approximation), footnote 2 (dry beans on 1.5-2 m stalks give 1.20), footnote 10 (hand harvest gives the higher wheat Kc end), footnote 11 (dry-grain maize harvest gives 0.35)
- the cereals-group Kc ini of 0.3 for maize and spring wheat
- the non-frozen-soil winter wheat Kc ini of 0.7

The crop-to-row mappings ("Barley/Oats/Wheat" for wheat, "Beans, dry and Pulses" for common bean) were judged defensible. The reviewer noted that FAO-56's own Box 15 uses 0.4 / 1.15 / 0.35 for a dry bean crop.

## Follow-ups raised and how they were handled

| Finding | Action |
|---|---|
| Bean Kc note said "stakes"; the source says "stalks" (same meaning, same numbers) | Wording changed to match the source. |
| The Mediterranean box includes Alps, Pyrenees and inland Balkan/Anatolian areas where winter soils freeze, which conflicts with the non-frozen Kc ini 0.7 | Warning added to `wheat-grain-fao56-mediterranean-winter-nov`. The box was not tightened in this release. |
| India box is loose (includes Sri Lanka, Bangladesh, Nepal, eastern Pakistan, part of Myanmar) | Recorded as a known limitation. All boxes are documented as approximate in `source-comparison.md`. |
| Reasons for omitting the "Calif. Desert" wheat row and the Idaho 335-day winter wheat row were not visible in code | Already recorded in `source-comparison.md` under "Table 11 rows deliberately not released". |
| "35-45 °L" hemisphere is unspecified; north-only is an assumption | Already carried as a profile warning. |

## Still needed

- Human peer confirmation of this release in the PR. If the peer changes any value, bump the release version rather than editing `fao56-2026-11-14` in place.

---

# Release `fao56-temperature-2026-11-14`: independent source review

**Reviewer:** a separate Claude agent, run on 2026-11-15, with no access to the author's conclusions.

**How it checked the sources:**
- FAO-56: re-downloaded the raw HTML and parsed the Table 11 and 12 cells.
- Teixeira et al. 2013: extracted the text from the openly hosted PDF.
- Vargas et al. 2021: read the full-text XML from Europe PMC.
- Silva et al. 2020: read through a summarising web tool, because SciELO blocked direct download.
- Gourdji et al. 2013: the publisher's bot check blocked it. The reviewer matched the 34/35/36/39 °C values and the 30-day window against search snippets of the methods. The research notes record an earlier full-page read of the same paper.

**Not a human review.** Human peer confirmation is still pending.

## Result

All transcribed numbers match the sources the reviewer could read:
- every new Table 11 stage length, total, planting date and region
- every Kc ini/mid/end and crop-group Kc ini
- the Teixeira Table 2 values
- the common bean 30/20 °C statements

The readings of ambiguous cells were confirmed as reasonable and disclosed:
- rice "Dec; May / Tropics; Mediterranean" split into two profiles
- soybean "30/35" read as 35, the only value that matches the 140-day total
- groundnut planting cells misaligned in the HTML

## Findings and how they were handled

| Finding | Action |
|---|---|
| Faba bean dry Nov Europe (235 d) and "Grains (small)" rows omitted without a stated reason | Reasons recorded in `release-2-temperature-and-crops.md` (duplicate Europe faba row; Grains (small) names no crop). |
| Table 12 source section listed only footnotes 1, 2, 10, 11 | The latest release uses a Table 12 source entry citing footnotes 1, 2, 4, 6, 9, 10, 11 and Table 14. The earlier release is unchanged. |
| Footnote 9 wording dropped "having less dense plant populations" | Restored verbatim; the assumption is stated. |
| Pea Kc note implied a footnote marker on the dry/seed cell | Reworded to say footnote 2's text gives 1.20 for peas on tall stalks. |
| Bean limitations said "around flowering" (not in either source); Silva's "in the tropics" missing | Mid-season scope now labelled a Gilir assumption, and the tropics limit added. |
| `silva2020` section said Introduction; bean source titles were descriptions | Section set to Discussion; real paper titles used. |
| Wheat rule text cited Teixeira and Porter & Gawith, but `sourceIds` listed only Gourdji | `teixeira2013` added to `sourceIds`. The Porter & Gawith sentence moved to the evidence doc. |
| Window caveat said only "can count more days" | Now also says it can miss window days falling before mid-season. |
| Sorghum "equals Pereira 2021" had no source entry | Removed from the data; kept in the evidence doc as context. |
| Rice carried the generic rain-wetting Kc ini note, which does not apply to a flooded Kc ini | Removed for rice. |
| Potato "assumes no vine kill" overstated footnote 4 | Reworded to say vine kill is not assumed. |
| Japan box covered Korea, northeast China and the Russian Far East | Split into two rectangles around Japan's main islands. |
| USA box covers northern Mexico and southern Canada; California desert box includes Yuma and Mexicali | Warnings added to the affected profiles. |

## Gourdji et al. 2013 full-text check (2026-11-15)

The card owner supplied the published PDF (IOP, open access). Its text was extracted and decoded locally. Findings:

- **Confirmed verbatim:** "For T crit, we use values taken from the review of [14]: 34 °C for wheat, 35 °C for maize, 36 °C for rice and 39 °C for soybean."
  - Reference [14] is Hatfield et al. 2011, Agronomy Journal 103:351-370.
- **Confirmed verbatim:** "The reproductive period was assumed to last 30 days for all crops, and was centered around 5 days prior to a critical crop-specific event (i.e. heading for wheat and rice, pod-setting for soybean, and silking for maize)."
- **Daily variable:** not stated. The paper calculates "the number of days in the reproductive period over T crit" from weather "generated ... by interpolating daily minimum and maximum temperature data". It never says which of the two is compared. The rule caveat says so.
- **Additional caveats in the paper:** the critical temperatures "not only vary by crop species, but also, to some extent, by crop variety", and "canopy temperatures ... differ from the air temperatures". Both are now in the rule limitations (variety) or were already there (air vs canopy).

No threshold value changed.

## Still needed

- Human peer confirmation.
