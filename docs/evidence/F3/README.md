# F3 evidence

Card: [F3](../../cards/F3.md).

Everything in this folder is **fixture evidence**. The snapshots are synthetic: the six shared ones in `src/fixtures/results.ts` and F3's sixteen variants in `tests/frontend/results/support/variants.ts`. Three variants (`labels_several`, `labels_changed`, `labels_warnings`) are version 2 snapshots with a frozen catalogue. In the browser they reach Results through a stubbed `/api` and the real HTTP client, inside F1's real `AppFrame` on `/`, in Chromium on `next dev`. Storage and the PDF are F4's real ports. None of it is live end-to-end evidence. **Live end-to-end evidence is NOT RUN** for this card: no live backend took part. Cards I1, I2 and I3 gate the assembled product.

## How the browser run reaches Results

`tests/frontend/results/support/walk.ts` opens `/` the way a farmer finishes the answers.

- F1's development-only seed (`window.__gilirDevInput`) opens the four answer pages with the snapshot's own answers. It is given to the first load only, so a reload opens what storage holds. A production build drops that seed.
- `GET /api/catalogue` answers with the synthetic catalogue plus every crop the answers name, parsed with the contract's `catalogueSchema`. For a version 2 snapshot its frozen labels replace the synthetic ones, so F1's pages and Results name each crop the same way.
- `POST /api/plans` answers 202 with a fixed UUID capability. `GET /api/plans/{id}` answers `completed` with the snapshot, parsed with `completedSnapshotSchema`. `DELETE` answers 204.
- Page 1's globe asks NASA GIBS for map tiles, which this machine cannot reach. The walk answers each tile with a blank 1x1 PNG, so a failed tile is not logged as a console error.
- The walk taps Next: crops, Next: water, Next: your rotation and Make my plan, then waits for the "What you can do" card.

Two variants need another seed. The last year in `changed` and `labels_changed` starts 16 days before the 12 months F1's page 4 shows, so F1 asks the farmer to fix it first. Those walks send the same answers with last year skipped. The result drawn is still the variant's own snapshot, its answers included.

Each test runs in a fresh browser profile. F1 saves every finished result in IndexedDB through F4's `localPlans`, so every row in `states.md` shows the saved line: "Saved on this device." for a plan and "This result is saved on this device." for a result with no plan. F1 also saves a `service_error` when nothing earlier is saved, which is F1's rule (`keepSnapshot` in `src/features/onboarding/services/saved.ts`). Results only reports what storage holds.

## Files

`states.md`, `tab-order-*.md`, `shots/` and the PDF are written by `results.spec.ts` with `F3_EVIDENCE=1`. They are copied here once, after a complete passing run. This README is written by hand.

| File | What it shows |
| --- | --- |
| `states.md` | Every shared state and every variant at 360 and 1280: title, status label, the saved line, sideways scroll at Normal and at Largest text, page height, the actions in order, and the sections and year lines in reading order. |
| `tab-order-360.md`, `tab-order-1280.md` | Tab from `#main` for `plan` and `insufficient_data`, and Tab inside View details for each, with role, accessible name and size. Clear saved data is the last stop in the result. |
| `plan_with_warnings-360.pdf` | The file Download PDF made in Chromium with the network off, after the result was on screen. 5 pages. |
| `shots/<state>-360-full.jpg`, `shots/<state>-1280-full.jpg` | The whole page of each of the six shared states at both widths. JPEG at quality 60; the first 740 or 800 pixels are the first screen. |
| `shots/plan_with_warnings-360-newer.png` | Storage holding a newer Gilir's record: F4's words, then that this plan stays on the page and the PDF keeps a copy. No Save or Clear. |
| `shots/plan_with_warnings-360-cleared-set-aside.png` | Clear saved data while F4 held a saved plan this version cannot open: the cleared line also says that data was cleared too and Undo can't bring it back. |
| `shots/plan_with_warnings-360-undo-kept.png` | Undo after another tab saved since the clear: the alert says that was kept and nothing was put back, and the line reads "This plan isn’t saved on this device." with Save on this device. |
| `shots/plan_with_warnings-<width>-saved.png` | The actions card with F1's saved plan: "Saved on this device." and Clear saved data last. |
| `shots/plan_with_warnings-<width>-cleared.png` | The same card after Enter on Clear saved data: the cleared line with focus on it, and Undo inside it. |
| `shots/service_error-<width>-earlier.png` | A `service_error` after a saved plan: "This result isn’t saved. Your earlier plan, made Jul 1, 2026, is still saved on this device." and Open my earlier plan. |
| `shots/plan_with_warnings-<width>-not-saving.png` | The card with IndexedDB taken away: the not-saving note and no Save or Clear. |
| `shots/plan_with_warnings-<width>-pdf-failed.png` | A browser that refuses the download after the PDF was made: the alert, then the focused Download PDF. |
| `shots/labels_several-360-timeline.jpg` | A version 2 snapshot's timeline: each row is named by its frozen label, "Maize (grain)", "Common bean (dry grain)", "Rice (paddy)". JPEG at quality 70. |
| `shots/plan_with_warnings-360-largest-top.png` | The first screen at Largest text, set through F1's Text size sheet. |
| `shots/plan_with_warnings-360-dark-top.png`, `shots/plan_with_warnings-360-contrast-top.png` | The first screen in emulated dark mode, and with F1's High contrast switch on. |
| `shots/plan_with_warnings-<width>-details-top.jpg` | View details opened by keyboard: Back to the result above the h1, at the top of the page. JPEG at quality 70. |
| `shots/plan_with_warnings-1280-scrolled.jpg` | The page scrolled to its end at 1280 Normal: the actions card is still in view in its own column. JPEG at quality 70. |

The three tallest or widest captures are JPEG at quality 70, which halves their size and keeps every word legible. The small card captures stay PNG. Commit a new set before running `npm run check`: `tests/integration/runtime/report.test.ts` reads `git diff --binary HEAD` into a 1 MB buffer, and several MB of uncommitted images overflow it.

The other screenshots (each variant's first screen and whole page, every state's first screen at Largest, and the actions card at 1366x650 after a failed PDF) stay in the run's output folder, `test-results/f3/`, which git ignores.

## Commands and observed results

Each command ran from the repository root with Node 24 first on `PATH` (`PATH=/opt/node24/bin:$PATH`). The Playwright runs also set `PW_CHROMIUM=/opt/pw-browsers/chromium`, because the pinned Playwright cannot find its own Chromium on this machine. Without `PW_CHROMIUM`, the spec uses that path only when it exists, and Playwright's own Chromium otherwise. They ran with `env -u CLAUDECODE -u AI_AGENT`, so `next dev` did not rewrite `AGENTS.md`.

| Command | Observed |
| --- | --- |
| `npx tsc --noEmit -p .` | Exit 0. |
| `npx vitest run tests/frontend/results` | 10 files passed; 240 tests passed, 0 failed. Before the review fixes, the new and changed model and keeper cases failed on the old code (22 failed, 138 passed), and the three new screen cases failed on it too (3 failed, 44 passed). |
| `npm run check` | Exit 0 on the final tree: typecheck passed, 91 test files passed and 5 skipped, 1681 tests passed and 33 skipped, and "Module boundaries passed." The load average was about 3. An earlier state of this branch recorded FAILED three times, never in an F3 file: once with several MB of screenshots uncommitted, and twice on Vitest's 5-second limit while other sessions held the load average near 17. |
| `npm run build` | Exit 0. "Compiled successfully", TypeScript finished, 4 of 4 static pages generated, `/` and `/dev/fixtures` prerendered as static. |
| `F3_EVIDENCE=1 npx playwright test -c tests/frontend/results/playwright.config.ts` | 89 passed in 4.6 minutes, three workers, `next dev` on port 3200 started and stopped by Playwright. "F3 evidence published", which wrote this folder. The run before it, on the same code, FAILED 1 of 89 and published nothing: this README and a test helper were edited while it ran, `next dev` rebuilt ("Router action dispatched before initialization"), and the page navigated during the 1280 `labels_several` capture. A filtered run of the 12 storage cases also passed. |
| `pdfinfo` and `pdftotext` on `plan_with_warnings-360.pdf` | The file is byte-identical to the one read page by page before (`pdftotext` and `pdftoppm`). `%PDF-1.7`, 5 pages, titled "Gilir crop plan, made Jul 1, 2026". Page 1 has the title, the synthetic note, the warning box, What we flagged and Good to know with the search-limit note. The footer repeats the synthetic note on every page. |
| Eleven deliberate breaks of F3's code, before the review fixes | Reported as 11 of 11 caught by an earlier run. The script and its logs are not in the repository, so this result cannot be re-run from here, and the breaks were not repeated after later changes. |
| Each commit of the series alone, in a scratch worktree | `npx tsc --noEmit -p .` exit 0 at each of the four commits, and the Vitest files each commit adds pass there: 143, 17, 64 and 16 tests. |
| Every committed screenshot opened | See "What the screenshots show". |
| Live end-to-end | NOT RUN. BLOCKED: no live backend here. I1 to I3 gate it. |

## Card F3 "Done when"

| Item | Browser case in `results.spec.ts` | Result |
| --- | --- | --- |
| Every synthetic PlanResult state is inspected at phone and desktop widths | "[R1][R35] {name}: its title and status show…", for 6 shared states and 16 variants at 360x740 and 1280x800 | Passed, fixture evidence. Each shows its own title, its status label in words and the saved line. Nothing scrolls sideways at Normal or at Largest text (`states.md`). No two bars in a year line overlap by more than 1 px, and every number disc stays inside its line. Every committed screenshot was opened. |
| Missing-data and impossible-calendar fixtures have no fake generated bars | "[R2] insufficient_data and no_calendar_fit show no When to plant and harvest card…", and the same rule inside every matrix case | Passed. The plan fixture's timeline has bars this check can see. `insufficient_data` and `no_calendar_fit` have no plan-only heading, and their one year line is "What you told us about last year (not scored)". The same holds for every no-plan variant. |
| The warning fixture keeps risk language and the search-limit disclosure | "[R3][R8] plan_with_warnings shows the risk words and the search-limit note above the timeline, before View details" | Passed. "Rain fell short of what synthetic crop needs in past seasons", its message, "The search stopped at its limit" and its message each end above the "When to plant and harvest" heading on screen. "We stopped at our search limit." and "This is the best plan we found, not proven to be the best." are in the ranking card. Details was never opened. |
| The kept-baseline fixture recommends keeping the sequence | "[R11] the plan fixture is titled Keep last year’s rotation" | Passed. The title is "Keep last year’s rotation", and Compared with last year says "Last year’s rotation ranked first, so we suggest keeping it." and "No changes: the same crops, order and dates as last year." |
| Keyboard users can open details and activate regeneration and export | "[R34] keyboard only…", "[R34] the phone’s Back on View details…", "[R34] the Tab order…", "[R23] the real PDF…", "[R24] a browser that refuses the download…", "[R22] Change my answers opens Where is your farm?…" | Passed. Tab from `#main` reaches Download PDF, View details, Change my answers and Clear saved data, then leaves the result (`tab-order-*.md`). Enter opens details with focus on its h1 at the top; Back to the result, above by Shift+Tab and Enter, and below by Tab and Space, returns focus to View details with the page where it was. The phone's Back (`page.goBack()`) closes details the same way and stays on Results. Enter on Download PDF downloads a real PDF; Enter and Space retry after a refused download; Enter works Change my answers, and Make my plan sends the shown result's answers again. |
| No direct editing of output bars | "[R4] a pointer drag across a crop bar and the year line changes no text and moves no focus" | Passed. A mouse drag and a click across the plan's year line and the reported year line change no text in `#main` and move no focus, and the first crop bar stays where it was. |

From the card's Implement list, "a storage or export failure remains visible while the result stays readable" is "[R25] with IndexedDB taken away…" and "[R24] a browser that refuses the download…". With no IndexedDB the not-saving note is on screen, the status line holds the same words, nothing offers Save or Clear, and Download PDF still makes the file. When the browser refuses the download, Enter on Download PDF shows "We couldn’t make the PDF. Your plan is still here on this page. You can try again." as a visible alert, focus stays on the button, and the title, the warnings and the timeline stay. A second try empties the alert and then shows it again. The browser's own error text never reaches the page.

## Storage and the PDF in a real browser

F4's real ports ran in Chromium for these cases. Each was recorded at 360 and at 1280.

- **Saved, cleared, Undo.** "[R25][R26] real storage: the plan reads Saved on this device., Clear saved data empties it with Undo, and Undo saves it back for a reload to open". F1 saved the finished plan, and the IndexedDB record holds its id. The line reads "Saved on this device." and Clear saved data is the last action. Enter on Clear saved data empties the record. The line then reads "Your saved answers and plan are cleared. This plan stays on this page until you leave it." with focus on it, Undo inside it is at least 48 by 48 px, Clear saved data is gone, and the result stays. Enter on Undo stores the plan again and the line reads "Saved on this device." again. A reload opens the plan from storage with the same line.
- **The earlier plan beside a `service_error`.** "[R28] real storage: a service_error after a saved plan keeps that plan…". After a saved plan, Change my answers and Make my plan return a `service_error`. F1 keeps the earlier plan in storage, and the line reads "This result isn’t saved. Your earlier plan, made Jul 1, 2026, is still saved on this device." The actions are Change my answers, Open my earlier plan, Download PDF, View details and Clear saved data. Open my earlier plan shows "Keep last year’s rotation" with focus on its h1 and the line "Saved on this device."
- **A made PDF.** "[R23] the real PDF: with the network off after the result shows…". Results called `preparePdf()` when it appeared, and the PDF code was fetched then. With the network off, Enter on Download PDF downloads `gilir-plan-<day>.pdf`. The file starts with `%PDF-`, the status line says "The PDF was made. Look in your downloads.", and no alert shows. `plan_with_warnings-360.pdf` is that file, and it was read page by page.
- **Not saving.** "[R25] with IndexedDB taken away…", described above.
- **A newer Gilir's record.** "[R25] real storage holding a newer Gilir’s record…". Before F1 opens, storage holds a state record of version 2. The saved line and the polite status line read "Gilir has a newer version. Close this page and open Gilir again to see what you saved. This plan stays here while this page is open. Download the PDF to keep a copy." The actions are Download PDF, View details and Change my answers, and the version 2 record is still there afterwards.
- **Data F4 set aside.** "[R26] real storage with a saved plan this version cannot open…". Before F1 opens, storage holds a state whose plan this version cannot read, and F4 sets it aside. After the plan is made and saved, Clear saved data empties both records, and the line adds "Saved data this version of Gilir couldn’t open was cleared too. Undo can’t bring that back." Undo puts the plan back and the set-aside record stays gone.
- **Undo after another tab saved.** "[R26] real storage: Undo after another tab saved since the clear…". After Clear saved data, a state holding another plan is written the way a second Gilir tab would. Undo keeps it: the alert reads "Something was saved on this device after you cleared it. We kept it, so your earlier answers and plan were not put back.", the line reads "This plan isn’t saved on this device." with focus on it, and storage still holds the other plan.

`tests/frontend/results/support/shelf.ts` is the only place these cases read or write F4's private IndexedDB layout.

These stay jsdom component evidence with fake ports in `tests/frontend/results/ui/screen.test.tsx` and `tests/frontend/results/model/actions.test.ts`, because a real browser here never reaches them:

- Save on this device. F1 saves every finished result, so Results shows an unsaved result only after F1's own save failed.
- A full device. A failed save or a refused first read names it in F4's words ("This device has no room left to save Gilir."), followed by F3's sentence on what happens to this result. A newer Gilir that refuses a save, a clear or an Undo is named the same way. A failed clear names only a newer Gilir. A full device there could only come from F4 reading first, and "no room left to save" would read as a reason to clear again. A refused browser keeps F3's own sentence, because F4's words for it add no step the farmer can take.
- A rejected clear or Undo, and a PDF that cannot be made (`exportPdf` rejects).

## Crop names

`cropNamesOf(snapshot)` in `src/features/results/model/words.ts` is the one place a crop gets its name. A version 2 snapshot names each crop by the label in its frozen catalogue, as written, inside a sentence too. A version 1 snapshot, or an id missing from the frozen catalogue (a crop known only from last year), keeps its readable id: "Maize grain", and "maize grain" inside a sentence.

- Browser: "[R1] a version 2 snapshot shows its frozen crop labels in the head and the year line; a version 1 snapshot shows readable ids". `labels_several` reads "Maize (grain), Rice (paddy) and Common bean (dry grain)" in the head and names each year line row by its label (`shots/labels_several-360-timeline.jpg`). Its version 1 pair, `several_crops`, reads "Maize grain, rice paddy and common bean dry".
- Model tests (`tests/frontend/results/model/result-page.test.ts`, "frozen crop labels"): labels in the head, the status sentence, the year line rows, warnings, the ranking's heat and cold row, unchecked items, baseline changes, last year's moved line, the answers and the profiles. In `labels_changed`, `synthetic-old` is missing from the frozen catalogue and keeps "Synthetic old" beside the labelled crops. Every fixture and variant made version 2 names no crop by its readable id, and no version 1 snapshot shows a frozen label.

## Words F3 writes, and numbers it now shows

These came from an independent review of the branch at `75d2ffd`. Each has a model or keeper test that failed before the change (`npx vitest run tests/frontend/results/model tests/frontend/results/services`: 22 failed, 138 passed) and passes now.

- **A crop with no growing details.** All but one of the `crop_profile` reasons the registry and engine write name the crop or its profile by id, such as "No released maize-grain profile applies at this location." Under the head "Growing details for Maize (grain) in this place", F3 now writes "We can’t use any yet. They say when to plant it, how long it grows and how much water it needs." The `insights` variant carries the engine's own form of that reason. A model test runs the seven forms the engine and registry write, and a sweep finds no raw crop id on any result page, in version 1 or with every crop labelled.
- **Warnings on a result with no plan.** They show under Good to know, after the actions, so "Your backup water isn’t counted" stays on every no-plan state. The `insights` variant now has backup water and that note. On `search_incomplete` the search-limit warning is not repeated, because Where the search stopped says it.
- **Keep last year's rotation.** Only an eligible baseline gets that title, its timeline heading and its ranking heading.
- **Each crop's own numbers.** Past seasons used in View details now has one table per planted crop, with that crop's F, M and X for each season and what each is out of ("about 30%, over 84 windows"). The season table above it keeps the highest among the crops. The `temperature` variant carries these numbers in the engine's ids.
- **Storage.** A refused first read keeps F4's reason, Undo never overwrites a state saved since the clear, and a clear that removed set-aside data says so. These are covered in a real browser above.

## Plain words in place of the engine's sentences

This section records the regional-profile release. The [global-model follow-up](../global-models/verification.md) retains this wording for archived results. A modeled no-calendar result also shows its model-specific explanation and constraints in the result's no-fit section.

A run of the real stack on 15 November 2026 (card I3) showed sentences no fixture had carried: "The first deciding metric against the final runner-up was mean_frequency: 0.898327 versus 0.904004 fraction, after comparison rounding." under Why this plan ranked first, "Every reachable daily calendar state was exhausted under the released durations, hard planting windows, and successor prohibitions." under a no-plan title, and "In some replay seasons, rainfall fell below estimated crop demand in at least one rolling window." under a warning. The fixtures say "Synthetic result: …" and "Example rainfall warning." in those places, so no test had met the real text.

- **The engine's explanation** is no longer on the result page in any state. Why this plan ranked first opens with F3's own fixed-order note and the four numbers. View details shows the explanation as given, last under How far the search went, headed "The calculation’s own summary", with a structural proof's constraint sentences after it.
- **Warnings.** Five codes whose engine message is one fixed sentence get F3's own line: rain ("In some past seasons, at least one week had less rain than it needs."), temperature, the search limit, water and approximate dates. A crop profile's note and a rule's text still show as given, because they carry content of their own. The profile note's head is now "About the growing details for …", as in the PDF, since most real notes are not limits. The water note's head follows the answer: "Your backup water isn’t counted", or "Only rain is counted" for Rain only and I’m not sure.
- **Crops that don't fit.** For the proof the engine tries after the crops' days fit in the year, Why they don’t fit now says "The times of year when your crops can be planted leave no way to fit them all into one year from your start date, …" and "Try another start date, other crops or fewer crops, then make the plan again." It no longer lists the engine's constraint sentences or says "Choose fewer crops" for one crop.

Each has a model test that fails on the code before this change. With the real stack running, a Madrid plan for radish and barley and a Bangkok result for rice and soybean were opened at 360 px: neither page held `mean_frequency`, "runner-up", "rolling window", "replay season" or the exhaustion sentence, and View details held the engine's explanation.

The browser spec ran again with `F3_EVIDENCE=1` after this change, and every screenshot, `states.md` and the PDF here are from that run: 89 passed in 3.6 minutes. The run before it **FAILED** 5 of 89. One failure was a source file edited during the run, which made `next dev` rebuild. Four were the two storage cases at both widths: since F1 shows F4's storage words above Results (#54), `getByRole("status")` matched F1's line as well as F3's, so the spec now looks for F3's status inside `#main`. With storage blocked, the farmer sees both F1's line above the page and F3's line in What you can do; they agree.

## What the screenshots show

- **plan_with_warnings at 360.** The first screen: place and day, the two-line title, the status box with its icon and bold label, the facts, the synthetic note, then What we flagged. The year line, the steps under it, the actions card with "Saved on this device.", the ranking card and Compared with last year follow. "Change my answers" wraps onto two lines at 360.
- **The actions card.** Saved: a green check and "Saved on this device.", then Download PDF, View details, Change my answers and the quiet Clear saved data. Cleared: the line in a blue focus ring, with Undo inside it, and no Clear saved data. Earlier plan: the info line with its date, Change my answers first and Open my earlier plan second. Not saving: the warning triangle and the note, with three buttons. Failed PDF: the alert above the buttons and the focus ring on Download PDF.
- **labels_several timeline.** Each crop row is headed by its label. Inside a sentence the label keeps its capital, as in "the Common bean (dry grain) harvest", because it is the name the farmer picked.
- **no_calendar_fit.** "Why they don’t fit" has two number boxes. Each crop's days are a text line, with no crop picture, because the snapshot carries no crop art.
- **service_error.** Its title and status, with no Try again button and no lead sentence: the service's own message is only in View details. The words say to tap Change my answers, then Make my plan. With nothing saved before, F1 saved the error, so its line reads "This result is saved on this device."
- **plan (kept).** "Last year’s rotation ranked first, so we suggest keeping it." Each compared value is a bulleted item in regular weight.
- **Newer Gilir, set-aside clear, Undo kept.** The warning triangle with F4's words and no Save or Clear. The cleared line with its extra two sentences and Undo under it. The Undo alert in its warm box above the buttons, with the line "This plan isn’t saved on this device." and Save on this device above it. F1's sticky top bar is hidden in the Undo capture, which is taller than the window.
- **1280.** Two columns at Normal text, the actions card on the right. `plan_with_warnings-1280-scrolled.jpg` shows it still in view at the end of the page.
- **Largest, dark, High contrast.** Each stays legible, and the status reads by its word.
- **Year lines.** Each bar is as wide as its days, at least 3 px for a crop, and its number is a disc over the middle of the bar. On a 360 px phone the disc is about 40 days of the year wide, so it can still cover a short stretch beside a short crop, such as the 27 empty days in the warnings fixture's last year. The bars under it are drawn true, and the list under each line says every stretch in words.
- **Dates.** They follow the browser's language, here en-US ("Jul 1, 2026"), always in the Gregorian calendar with Latin digits. The jsdom suite pins en-GB.

## Requirement rows behind the [Rn] test tags

Test names carry `[Rn]` tags; `rg "\[R12\]" tests/frontend/results` finds every case for a row.

| Row | Requirement |
| --- | --- |
| R1 | Render all six PlanResult branches, each with its own title and status line. |
| R2 | Only `plan` and `plan_with_warnings` show a generated timeline; the other four have no plan bars and no "When to plant" section. |
| R3 | Warning text sits above the timeline on the main page, not only in details. |
| R4 | One view-only suggested plan; no direct editing of output bars. |
| R5 | The fixed ranking indicators in their fixed order; Q90 shortfall and temperature are shown as not used to rank. |
| R6 | No farmer-selected priority; the order is fixed and said to be fixed. |
| R7 | The actual cohort count and period. |
| R8 | Search incompleteness is disclosed on the main page. |
| R9 | Missing and unassessed checks are visible on the main page. |
| R10 | An unassessed crop is never called safe from heat, cold or frost. |
| R11 | A kept baseline: the headline recommends keeping the rotation, with the same evidence and warnings as a changed plan. |
| R12 | A changed baseline lists crop-order and date changes from `baseline.changes`, and last year's rotation is described, not given as planting dates. |
| R13 | An unassessable baseline shows its reasons and the reported history as context, not scored, with no numeric comparison. |
| R14 | Skipped history says no comparison was made; no delta and no invented predecessor. |
| R15 | A baseline that is assessed but not eligible is shown for comparison only and cannot be the suggestion, whatever its recommendation field says. |
| R16 | Deltas are shown as given with their direction; no percentage improvement. |
| R17 | Approximate dates are labelled as estimates; "this comparison is approximate too" only when a comparison was made. |
| R18 | Preparation comes only from `details.preparation`, with its sources; no invented roadmap or advice. |
| R19 | View details holds source references, profiles, assumptions, metrics, units, denominators and method versions, for insights too. |
| R20 | Details also hold grid sizes, missingness, calculation definitions, score components and search coverage. |
| R21 | Unknown and unavailable values stay distinct from zero. |
| R22 | Change my answers calls the supplied callback with the shown snapshot's input. |
| R23 | Download PDF goes through `exportPdf(snapshot)` and saves a real file. |
| R24 | An export failure stays visible while the result stays readable. |
| R25 | The storage status is honest: saved, not saved, or this browser is not saving. A storage failure is visible and keeps the PDF. |
| R26 | Clear saved data goes through `localPlans.clear()`, confirms, offers Undo, and shows a failure. |
| R27 | A save from Results never overwrites onboarding's draft, step or active job. |
| R28 | A `service_error` makes no new plan; an earlier saved result stays labelled with its own date. |
| R29 | A `service_error` shows plain words, never a failure code or the service's raw message. |
| R30 | `search_incomplete` explains the limit and how to try again; `insufficient_data` says trying again gives the same answer without new evidence. |
| R31 | `insufficient_data` keeps the available insights visible, with their period. |
| R32 | `no_calendar_fit` explains the binding constraints. |
| R33 | Statuses have text labels and do not depend on colour. |
| R34 | Keyboard and the phone's Back: open details, come back to where you were, and work regeneration and export. |
| R35 | Works at 360 px and on desktop, with targets at least 48 px. |
| R36 | English, metric units, browser-local dates in the Gregorian calendar; an ISO calendar date never shifts a day. |
| R37 | Synthetic provenance is labelled on the result and in details; fixtures are never presented as advice. |
| R38 | Words make no claim about irrigation need, actual shortage, probability, harvest, bare soil, yield, soil improvement, pests, weeds, fertilizer or cost, and never predict next season. |
| R39 | Backup water changes the explanation only. |
| R40 | Days-without-crop rows agree with the ranking: a gap row starts the day after harvest. |
| R41 | No scientific metric is recalculated in React. |
| R42 | A plain explanation of why the plan ranked first. |

## Known limits

- The PDF is F4's. It still names crops by their readable ids, so for a version 2 snapshot the page says "Maize (grain)" where the PDF says "Maize grain". `docs/evidence/shared-snapshots/f4-review.md` leaves PDF labels to F4.
- There is no Try again button. Results has no retry port, so trying again is Change my answers, then Make my plan.
- After Change my answers, F1 shows "Where is your farm?" with focus on `<body>`. That is F1's first-paint rule, and F3 cannot change it.
- If Results is replaced while View details is open, the history entry details pushed stays, and the next phone Back is expected to do nothing visible (read from the code, not tested).
- The browser runs use `next dev`, because the seed exists only in development. `npm run build` passed separately.
- Three review passes (correctness, experience, maintainability) read an earlier state of this branch. A second independent review (correctness, quality) read `75d2ffd`, and this branch fixes each of its findings. No review has read the fixes yet, and this README does not claim a cross-family review.
- Other gap codes keep the engine's reason. Today none names a crop, but a `ranking_metric` reason names a metric id, such as "Required metric mean_frequency is unavailable."
- View details shows profile ids and rule targets as the snapshot holds them, as references. A released profile id starts with its crop's id (`<crop id>-fao56-<row>` in `src/registry/profiles.ts`).
- The empty state the keeper writes from nothing is held to F1's by a test through F1's `createSavedPlans`, not by a shared export.
