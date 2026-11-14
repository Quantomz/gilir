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
