# F4 PDF inspection

This is fixture evidence. Every page below comes from a synthetic snapshot, and every page says so in its footer. No live backend ran.

A person looked at every page of the four committed PDFs as PNG renders made with `pdftoppm -r 110 -png`. They also looked at the warning plan's first two pages in grayscale (`pdftoppm -r 110 -gray -png`) and at the files in Chromium's own PDF viewer with the network off. The files were made for an A4 reader (`en-GB`, UTC). The browser download and `tests/frontend/pdf/evidence.ts` write the same bytes.

Each entry records clipping, warnings, source details, the data period, and readability.

## fixture-plan.pdf (plan, 4 pages)

**Page 1** ([render](fixture-plan-1.png)). The page opens with the brand line, then the title "Keep last year’s rotation" at 24 pt. The head gives the place "Synthetic example field", the weather point "15.005° N, 100.005° E", "Made 1 Jul 2026 · Your year: 1 Jul 2026 to 30 Jun 2027", and the answers line "Crops: Synthetic crop · Water: Rain only · Last year: 1 crop". The synthetic label sits in its own bordered box. The green status box says "This order passed every check we could run." and that this is not a promise about next season. The timeline shows twelve month names from Jul to Jun with ticks, a crop bar 4 days wide at the start, a dashed no-crop bar for the rest of the year, and the years 2026 and 2027. The track ends about 9 pt before the right margin, which keeps room for a row number at the year's end. Row number 1 sits below the narrow crop bar, to the right of its tick, and 2 sits inside the no-crop bar. No crop name is drawn inside a bar. The legend names all three marks in words. Row 1 reads "Synthetic crop. Plant 1 Jul 2026 · Harvest 4 Jul 2026. 4 days in the field. The field is free again on 6 Jul 2026." Nothing is clipped. The footer reads "Gilir crop plan · Made 1 Jul 2026", "Page 1 of 4", and the synthetic label.

**Page 2** ([render](fixture-plan-2.png)). Row 2 continues as "No planned crop. 5 Jul 2026 to 30 Jun 2027 · 361 days", which matches the ranking's longest stretch, with a sentence on the day after harvest. "Why this plan ranked first" explains the fixed order and lists the four ranking rows in words: "Never", "None", "361 days", "361 days", each with its own explanation. The bold line "Shown, but not used to rank" has its two rows under it on the same page, and both print "Not available", not zero. The period line reads "Checked against 1 past season, Jul 2000. From past seasons, not a prediction. Checked with rain alone: backup water is not counted." Nothing is clipped. There are no warnings in this state.

**Page 3** ([render](fixture-plan-3.png)). "Compared with last year" says last year's rotation ranked first, that the dates are approximate, the comparison of weeks with less rain ("This plan: 0%", "Last year’s rotation: 0%", "The same"), and, under "Changes from last year", "No changes: the same crops, order and dates as last year." That sentence is right here because the rotation was kept. "Get ready" prints the snapshot's one preparation line. "How this was worked out" prints the engine explanation. "Assumptions" prints the snapshot's one assumption. "Sources, period and versions" starts with the period "Checked against 1 past season, Jul 2000.", the cohort method `synthetic-v1`, and "Calculation methods: synthetic-v1.", so the heading has three lines under it before the page ends. Small text is 12 pt in dark gray-green and reads clearly. Nothing is clipped.

**Page 4** ([render](fixture-plan-4.png)). The versions continue with the crop profile and its version, the engine, settings, crop list, rules, "records before 1 Jan 2026", and the weather records. The closing lines say the plan comes from past seasons, uses rain alone, and gives no fertilizer amounts, costs or soil tests. The last line says Gilir is not affiliated with or endorsed by NASA. The rest of the page is blank. The footer reads "Page 4 of 4".

## fixture-plan_with_warnings.pdf (warning plan, 4 pages)

**Page 1** ([render](fixture-plan_with_warnings-1.png), [gray](fixture-plan_with_warnings-gray-1.png)). The title is "Your plan, with warnings". The head matches the plan, and the answers line adds "Last year: 1 crop and 1 empty time". The status box is warn-brown with the word "With warnings." and the size from the ranking: "In past seasons, rain fell short of what the crops need in about 5 in 10 weeks." "What we flagged" explains the strict check, then the one warning with its farmer head "Rain fell short of what synthetic crop needs in past seasons" and the snapshot's own message "Example rainfall warning.", then the sentence that a warning is not a failure or a prediction. "Good to know" prints the note "The search stopped at its limit" with its message. In grayscale the status box keeps its border and its word, so the warning reads without colour. Nothing is clipped.

**Page 2** ([render](fixture-plan_with_warnings-2.png), [gray](fixture-plan_with_warnings-gray-2.png)). The timeline and its two rows match the plan. Under the rows, "We stopped at our search limit. This is the best plan we found, not proven to be the best. We tried planting dates every 7 days." discloses the bounded search. "Why this plan ranked first" starts with "About 5 in 10 weeks". In grayscale the crop bar is solid dark and the no-crop bar is dashed, so the marks differ by shape; the legend shows the hatched after-harvest mark too. Nothing is clipped.

**Page 3** ([render](fixture-plan_with_warnings-3.png)). The ranking continues with "About 25%" for the shortfall, then the two day counts. "Shown, but not used to rank" keeps its two "Not available" rows with it. The period line is the same as the plan's. "Compared with last year" opens with "We couldn’t score last year’s rotation:" and its reason on the same page, then the estimate line, then "What you told us about last year (not scored)" with "Synthetic unlisted crop (not on our crop list)" and the empty stretch "5 Jul to 31 Jul 2025 · 27 days". Nothing is clipped.

**Page 4** ([render](fixture-plan_with_warnings-4.png)). The last history row "Not sure: nothing recorded. 1 Aug 2025 to 30 Jun 2026 · 334 days" ends the comparison. Then "Get ready", "How this was worked out", "Assumptions", "Sources, period and versions" with the period, "Calculation methods: synthetic-v1." and every version, and the closing lines. Nothing is clipped. The footer reads "Page 4 of 4".

## fixture-insufficient_data.pdf (missing data, 2 pages)

**Page 1** ([render](fixture-insufficient_data-1.png)). The title is "We can’t make a plan yet", and the footer calls the file a "Gilir status report". The head gives the place, the weather point, the made date, the year asked about, and the answers. The status box is ink-black with "No plan yet. Some information a plan needs is missing." "What’s missing" names "Enough complete past seasons of weather" with its reason, says that making the plan again gives the same answer until new data exists, and ends "This is a status report. No calendar is shown, because no plan was made." There is no timeline, no plant or harvest row, no ranking, and no "Get ready". "Compared with last year" says last year could not be scored, gives the reason, and lists what the farmer said under its bold line, which is not left alone at the page's end. Nothing is clipped.

**Page 2** ([render](fixture-insufficient_data-2.png)). The comparison ends with "Not sure: nothing recorded. 5 Jul 2025 to 30 Jun 2026 · 361 days". "How this was worked out" and "Assumptions" follow. "Sources, period and versions" says in words that the past seasons are unavailable: "Past seasons: A complete cohort was not assessed in this example." It does not print a period of zero seasons. "Calculation methods: synthetic-v1.", the crop profile and every version follow, then the closing lines. Nothing is clipped. The footer reads "Page 2 of 2".

## variant-frozenLabels.pdf (warning plan from a version 2 snapshot, 6 pages)

The snapshot is version 2. Its frozen catalogue names `synthetic-crop`, `synthetic-second-crop` and `synthetic-third-crop` "Synthetic bean (dry grain)", "Synthetic maize (grain)" and "Synthetic oats (grain)", labels that a name made from the ID can't produce. The old rotation's `synthetic-old-crop` is not in that catalogue. Each page was checked for a selected crop named from its ID, and none is: `pdftotext` finds no "synthetic crop", "synthetic second crop" or "synthetic third crop" ([text](fixture-poppler.txt)). Since the third review's fixes each label prints with its own capital letter inside a sentence too, and pages 1 to 5 were looked at again; page 6 rendered byte-identical.

**Page 1** ([render](variant-frozenLabels-1.png)). The title is "Your plan, with warnings". The answers line "Crops: Synthetic bean (dry grain), Synthetic maize (grain) and Synthetic oats (grain) · Water: Rain only · Last year: 1 crop" wraps onto a second line, whole. The warn-brown status box says rain fell short in about 5 in 10 weeks "and temperatures went outside the limits for Synthetic maize (grain) on about 20% of checked days in a bad year." "What we flagged" heads its two warnings "Rain fell short of what Synthetic bean (dry grain) needs in past seasons", which now wraps after "past", and "Temperatures went outside the limits for Synthetic maize (grain)", each with the snapshot's message. Nothing is clipped.

**Page 2** ([render](variant-frozenLabels-2.png)). The timeline has three crop bars, three after-harvest marks and the year's last no-crop stretch, numbered 1 to 6; the narrow stretch 4 has its number below the track. Rows 1, 3 and 5 are headed "Synthetic bean (dry grain)", "Synthetic maize (grain)" and "Synthetic oats (grain)". Each no-crop row says "The first 7 days are the time after the Synthetic … harvest" with the label of the crop before it. Nothing is clipped.

**Page 3** ([render](variant-frozenLabels-3.png)). "Why this plan ranked first" lists its four rows. Under "Shown, but not used to rank", "Heat and cold" ends "Outside the limits in past seasons: Synthetic maize (grain).", "No checked day outside the limits for Synthetic bean (dry grain)." and "Not assessed for Synthetic oats (grain)." Nothing is clipped.

**Page 4** ([render](variant-frozenLabels-4.png)). The period line, then "Compared with last year": the new plan ranked ahead, five comparison rows, and the first change "Added: Synthetic oats (grain), 6 Jan to 6 Mar 2027." Nothing is clipped.

**Page 5** ([render](variant-frozenLabels-5.png)). The changes go on: "Not in the new plan: synthetic old crop, 1 Mar to 9 Apr 2027 in last year’s rotation." names the crop the catalogue lacks from its ID, in lower case, "Plant Synthetic bean (dry grain) 7 days later", "Plant Synthetic maize (grain) on the same day" and "Synthetic maize (grain) moves from first to second in the order." "What we couldn’t check" is headed "Heat and cold limits for Synthetic oats (grain)". "How this was worked out" now reads "Synthetic result: the new plan ranks ahead of the existing rotation in this example.", which agrees with page 4. Until the third review it printed the plan fixture's "the existing rotation ranks first", which `changedBaseline` inherited. Nothing is clipped.

**Page 6** ([render](variant-frozenLabels-6.png)). "Crop profiles: Synthetic bean (dry grain) synthetic-synthetic-crop-profile synthetic-v1; Synthetic maize (grain) …; Synthetic oats (grain) …", then the versions, with "crop list synthetic-catalogue", the frozen catalogue's version. The closing lines follow. The footer reads "Page 6 of 6".

## Opened offline in Chromium's PDF viewer

`download.spec.ts` downloads each of the three files, saves it in the test's output folder, checks that it equals the node render byte for byte, turns the browser context's network off, and opens the saved file in Chromium's own PDF viewer. The viewer showed the file's title and page count: "Gilir crop plan, made 1 Jul 2026" with 4 pages for the plan and for the warning plan, and "Gilir status report, made 1 Jul 2026" with 2 pages for the missing-data file. [Warning plan in the viewer](fixture-plan_with_warnings-offline-viewer.png). [Missing data in the viewer](fixture-insufficient_data-offline-viewer.png). The viewer drew the text with a substitute for Helvetica, because the file embeds no font.

## Pages looked at for the review fixes

These were made outside this folder from fixtures and variants and are not kept. `node --import tsx tests/frontend/pdf/evidence.ts <folder> --all` writes the variant files again.

- **variant-freeAtYearEnd.pdf, page 1.** The year ends in a 7-day after-harvest bar. Its row number 4 sits below the track, to the right of its own tick, and no tick runs through it.
- **The plan fixture for a `vi-VN` reader, page 1.** The timeline labels the months 7 to 6 with numbers, all twelve, because the Vietnamese short names are wider than a month.
- **The no_calendar_fit fixture with an assessed, unranked baseline, page 1.** "Compared with last year" gives the verdict and "How they compare: No numbers to compare." and has no "Changes from last year" and no "No changes" line. The third review found that page said the rotation "is shown" while showing no numbers; it now lists them (see below).
- **variant-manySources.pdf, as text (`pdftotext -layout`).** Each weather product line ends with "Version synthetic-v1." and the product's URL as plain text.

## Pages looked at for the second review's fixes

Made in scratch with `renderPdf` for an `en-GB` reader at 80 dpi and not kept. Each snapshot is a fixture or variant with one field changed.

- **changedBaseline with `eligible: false`, page 3.** "Compared with last year" opens "Last year’s rotation is shown for comparison only. It can’t be the suggestion, because it doesn’t meet every rule for a plan." No line says the new plan ranked ahead.
- **The no_calendar_fit fixture, page 1.** The status box says "Together they need at least 366 days; your year has 365." "Why they don’t fit" starts with "Each crop needs at least:", so the sentence is printed once.
- **The service_error fixture, page 1.** The status box says "Example source did not respond." "What happened" starts with "No new plan was made. It wasn’t anything you did."
- **no_calendar_fit from 29 February 2028, with the water answer "I’m not sure", page 1.** The head reads "Your year: 29 Feb 2028 to 27 Feb 2029", which is the 365 days the status box gives. The note under "Good to know" is headed "Only rain is counted".

## Pages looked at for the frozen labels

Made in scratch with `renderPdf` for an `en-GB` reader at 80 dpi and not kept. Each is a fixture made version 2 with the test helper `frozen`, which the full `completedSnapshotV2Schema` accepts.

- **insufficient_data, its one crop saved as "Synthetic bean (dry grain)", with a crop_profile gap and a last-year crop `synthetic-retired-crop` the catalogue lacks, pages 1 and 2.** The answers line, "Growing details for synthetic bean (dry grain) in this place" under "What’s missing" (since the third review "Synthetic bean (dry grain)", with the label's capital), the first row of "What you told us about last year (not scored)" and the crop profile line all print the label. The retired crop's row is headed "Synthetic retired crop", from its ID.
- **no_calendar_fit with the same label, page 1.** "Each crop needs at least:" lists "Synthetic bean (dry grain): at least 366 days", and last year's row is headed by the label.
- **The plan fixture with the label "ถั่ว synthetic", page 1.** The fonts can't draw the Thai letters, so the answers line and calendar row print "Synthetic crop", from the ID, and no "?" appears.
- **Every other committed page.** The three fixture PDFs hold version 1 snapshots and rendered byte-identical to the files committed before this change, and so did all 21 files `evidence.ts --all` wrote before it.

## Pages looked at for the third review's fixes

Made in scratch with `renderPdf` for an `en-GB` reader from the review's real engine snapshots (release fao56-hard-windows-2026-11-15, captured Bangkok weather; the Fresno run pairs Bangkok weather with a Fresno lookup point), version 2, at 80 dpi, and not kept.

- **One rice crop at Bangkok from 15 Jan 2027, no_calendar_fit by structural proof, page 1.** Under the engine's two constraints and "We checked 209 ways of placing them.", the page says "The time of year when your crop can be planted leaves no way to fit it into one year from your start date, 15 Jan 2027. Try another start date or another crop, then make the plan again." It no longer says to choose fewer or faster crops. The farm section opens "Weather from 25 past seasons, Jan 2001 to Jan 2026." Nothing is clipped.
- **Rice and soybean at Bangkok with last year's rice scored, no_calendar_fit, pages 1 and 2.** The advice names the planting times of "your crops" and offers fewer crops among the choices. "Compared with last year" says the rotation is shown for comparison only, then "Last year’s rotation in past seasons" lists eight numbers, each under its own head, such as "95%" under "Weeks with less rain than the crops need" and "Not available" with the engine's reason under "Checked days outside temperature limits in a bad year", then "What you told us about last year" with its three rows. No line says "No numbers to compare." Nothing is clipped.
- **Rice, Brussels sprouts and pumpkin and winter squash at Bangkok, insufficient_data, page 1.** The answers line reads "Rice (paddy); Brussels sprouts; Pumpkin and winter squash". Under "What’s missing", "Growing details for Brussels sprouts in this place" is followed by "No released Brussels sprouts profile applies at this location.", where the reason used to print `brussels-sprouts`. Nothing is clipped.
- **Eight crops at a Fresno lookup point, insufficient_data, page 1.** The answers line splits the eight labels with semicolons over three lines, so "Pumpkin and winter squash; Squash and zucchini" reads as two crops. Each of the five gaps names its crop by its label in the head and in the reason. Nothing is clipped.

## What this inspection does not show

- No reader aged 50 to 80 has read these pages. Readability here is one person's judgment at 110 dpi.
- The pages were looked at on screen, not on paper.
- The Letter paper file and the other three no-plan states are no longer kept here. The layout tests check every fixture state and every variant on A4 and Letter for clipping, page breaks and footers.
