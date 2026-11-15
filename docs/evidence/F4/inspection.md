# F4 PDF inspection

This is fixture evidence. Every page below comes from a synthetic snapshot, and every page says so in its footer. No live backend ran.

A person looked at every page of the three committed PDFs as PNG renders made with `pdftoppm -r 110 -png`. They also looked at the warning plan's first two pages in grayscale (`pdftoppm -r 110 -gray -png`) and at the files in Chromium's own PDF viewer with the network off. The files were made for an A4 reader (`en-GB`, UTC). The browser download and `tests/frontend/pdf/evidence.ts` write the same bytes.

Each entry records clipping, warnings, source details, the data period, and readability.

## fixture-plan.pdf (plan, 4 pages)

**Page 1** ([render](fixture-plan-1.png)). The page opens with the brand line, then the title "Keep last year’s rotation" at 24 pt. The head gives the place "Synthetic example field", the weather point "15.005° N, 100.005° E", "Made 1 Jul 2026 · Your year: 1 Jul 2026 to 30 Jun 2027", and the answers line "Crops: Synthetic crop · Water: Rain only · Last year: 1 crop". The synthetic label sits in its own bordered box. The green status box says "This order passed every check we could run." and that this is not a promise about next season. The timeline shows twelve month names from Jul to Jun with ticks, a crop bar 4 days wide at the start, a dashed no-crop bar for the rest of the year, and the years 2026 and 2027. The track ends about 9 pt before the right margin, which keeps room for a row number at the year's end. Row number 1 sits below the narrow crop bar, to the right of its tick, and 2 sits inside the no-crop bar. No crop name is drawn inside a bar. The legend names all three marks in words. Row 1 reads "Synthetic crop. Plant 1 Jul 2026 · Harvest 4 Jul 2026. 4 days in the field. The field is free again on 6 Jul 2026." Nothing is clipped. The footer reads "Gilir crop plan · Made 1 Jul 2026", "Page 1 of 4", and the synthetic label.

**Page 2** ([render](fixture-plan-2.png)). Row 2 continues as "No planned crop. 5 Jul 2026 to 30 Jun 2027 · 361 days", which matches the ranking's longest stretch, with a sentence on the day after harvest. "Why this plan ranked first" explains the fixed order and lists the four ranking rows in words: "Never", "None", "361 days", "361 days", each with its own explanation. The bold line "Shown, but not used to rank" has its two rows under it on the same page, and both print "Not available", not zero. The period line reads "Checked against 1 past season, Jul 2000. From past seasons, not a prediction. Checked with rain alone: backup water is not counted." Nothing is clipped. There are no warnings in this state.

**Page 3** ([render](fixture-plan-3.png)). "Compared with last year" says last year's rotation ranked first, that the dates are approximate, the comparison of weeks with less rain ("This plan: 0%", "Last year’s rotation: 0%", "The same"), and, under "Changes from last year", "No changes: the same crops, order and dates as last year." That sentence is right here because the rotation was kept. "Get ready" prints the snapshot's one preparation line. "How this was worked out" prints the engine explanation. "Assumptions" prints the snapshot's one assumption. "Sources, period and versions" starts with the period "Checked against 1 past season, Jul 2000.", the cohort method `synthetic-v1`, and the crop profile with its version. Small text is 12 pt in dark gray-green and reads clearly. Nothing is clipped.

**Page 4** ([render](fixture-plan-4.png)). The versions continue with the engine, settings, crop list, rules, "records before 1 Jan 2026", and the weather records. The closing lines say the plan comes from past seasons, uses rain alone, and gives no fertilizer amounts, costs or soil tests. The last line says Gilir is not affiliated with or endorsed by NASA. The rest of the page is blank. The footer reads "Page 4 of 4".

## fixture-plan_with_warnings.pdf (warning plan, 4 pages)

**Page 1** ([render](fixture-plan_with_warnings-1.png), [gray](fixture-plan_with_warnings-gray-1.png)). The title is "Your plan, with warnings". The head matches the plan, and the answers line adds "Last year: 1 crop and 1 empty time". The status box is warn-brown with the word "With warnings." and the size from the ranking: "In past seasons, rain fell short of what the crops need in about 5 in 10 weeks." "What we flagged" explains the strict check, then the one warning with its farmer head "Rain fell short of what synthetic crop needs in past seasons" and the snapshot's own message "Example rainfall warning.", then the sentence that a warning is not a failure or a prediction. "Good to know" prints the note "The search stopped at its limit" with its message. In grayscale the status box keeps its border and its word, so the warning reads without colour. Nothing is clipped.

**Page 2** ([render](fixture-plan_with_warnings-2.png), [gray](fixture-plan_with_warnings-gray-2.png)). The timeline and its two rows match the plan. Under the rows, "We stopped at our search limit. This is the best plan we found, not proven to be the best. We tried planting dates every 7 days." discloses the bounded search. "Why this plan ranked first" starts with "About 5 in 10 weeks". In grayscale the crop bar is solid dark and the no-crop bar is dashed, so the marks differ by shape; the legend shows the hatched after-harvest mark too. Nothing is clipped.

**Page 3** ([render](fixture-plan_with_warnings-3.png)). The ranking continues with "About 25%" for the shortfall, then the two day counts. "Shown, but not used to rank" keeps its two "Not available" rows with it. The period line is the same as the plan's. "Compared with last year" opens with "We couldn’t score last year’s rotation:" and its reason on the same page, then the estimate line, then "What you told us about last year (not scored)" with "Synthetic unlisted crop (not on our crop list)" and the empty stretch "5 Jul to 31 Jul 2025 · 27 days". Nothing is clipped.

**Page 4** ([render](fixture-plan_with_warnings-4.png)). The last history row "Not sure: nothing recorded. 1 Aug 2025 to 30 Jun 2026 · 334 days" ends the comparison. Then "Get ready", "How this was worked out", "Assumptions", "Sources, period and versions" with the period and every version, and the closing lines. Nothing is clipped. The footer reads "Page 4 of 4".

## fixture-insufficient_data.pdf (missing data, 2 pages)

**Page 1** ([render](fixture-insufficient_data-1.png)). The title is "We can’t make a plan yet", and the footer calls the file a "Gilir status report". The head gives the place, the weather point, the made date, the year asked about, and the answers. The status box is ink-black with "No plan yet. Some information a plan needs is missing." "What’s missing" names "Enough complete past seasons of weather" with its reason, says that making the plan again gives the same answer until new data exists, and ends "This is a status report. No calendar is shown, because no plan was made." There is no timeline, no plant or harvest row, no ranking, and no "Get ready". "Compared with last year" says last year could not be scored, gives the reason, and lists what the farmer said under its bold line, which is not left alone at the page's end. Nothing is clipped.

**Page 2** ([render](fixture-insufficient_data-2.png)). The comparison ends with "Not sure: nothing recorded. 5 Jul 2025 to 30 Jun 2026 · 361 days". "How this was worked out" and "Assumptions" follow. "Sources, period and versions" says in words that the past seasons are unavailable: "Past seasons: A complete cohort was not assessed in this example." It does not print a period of zero seasons. The crop profile and every version follow, then the closing lines. Nothing is clipped. The footer reads "Page 2 of 2".

## Opened offline in Chromium's PDF viewer

`download.spec.ts` downloads each of the three files, saves it in the test's output folder, checks that it equals the node render byte for byte, turns the browser context's network off, and opens the saved file in Chromium's own PDF viewer. The viewer showed the file's title and page count: "Gilir crop plan, made 1 Jul 2026" with 4 pages for the plan and for the warning plan, and "Gilir status report, made 1 Jul 2026" with 2 pages for the missing-data file. [Warning plan in the viewer](fixture-plan_with_warnings-offline-viewer.png). [Missing data in the viewer](fixture-insufficient_data-offline-viewer.png). The viewer drew the text with a substitute for Helvetica, because the file embeds no font.

## Pages looked at for the review fixes

These were made outside this folder from fixtures and variants and are not kept. `node --import tsx tests/frontend/pdf/evidence.ts <folder> --all` writes the variant files again.

- **variant-freeAtYearEnd.pdf, page 1.** The year ends in a 7-day after-harvest bar. Its row number 4 sits below the track, to the right of its own tick, and no tick runs through it.
- **The plan fixture for a `vi-VN` reader, page 1.** The timeline labels the months 7 to 6 with numbers, all twelve, because the Vietnamese short names are wider than a month.
- **The no_calendar_fit fixture with an assessed, unranked baseline, page 1.** "Compared with last year" gives the verdict and "How they compare: No numbers to compare." and has no "Changes from last year" and no "No changes" line.
- **variant-manySources.pdf, as text (`pdftotext -layout`).** Each weather product line ends with "Version synthetic-v1." and the product's URL as plain text.

## What this inspection does not show

- No reader aged 50 to 80 has read these pages. Readability here is one person's judgment at 110 dpi.
- The pages were looked at on screen, not on paper.
- The Letter paper file and the other three no-plan states are no longer kept here. The layout tests check every fixture state and every variant on A4 and Letter for clipping, page breaks and footers.
