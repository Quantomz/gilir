# F1 browser evidence

This folder is **fixture evidence** for card F1, the four input pages and the editable history. Every run here used a synthetic farm input, stubbed network routes and `next dev`. It is not live end-to-end evidence. No live planning job and no real Results screen took part. Storage is F4's real IndexedDB in Chromium. I1, I2 and I3 gate the assembled product.

## What the browser runs used

The runs used two surfaces.

- **`/dev/fixtures`.** This is the development lab. It renders `<Onboarding client={fixtureClient} initialInput={inputFixture} />`. No network is involved. `lab.spec.ts` runs here.
- **`/`.** This is the real page with the real HTTP client from `src/client/planner.ts`. `journey.spec.ts` and `evidence.spec.ts` run here.
  - A development-only seed opens it with a fixture input, because the field picker slot cannot mark a field yet. `src/app/page.tsx` reads that seed only in development, and the production build drops it.
  - The routes below are answered with `page.route`. Each answer is parsed with the contract schema before it is sent: `releasedRegistrySchema` for the catalogue, `completedSnapshotSchema` and `serviceFailureSchema` for jobs and failures. Each POST body is parsed with `farmInputSchema`.

| Route | Answered with |
| --- | --- |
| `GET /api/catalogue` | `journey.spec.ts` uses the synthetic catalogue (one crop), so its POST bodies can be compared with `inputFixture` exactly. `[E3]` uses the real empty release `v1-empty`. `evidence.spec.ts` uses the released list `fao56-reviewed-2026-11-15`, 40 crops, so page 2 shows the real long list. |
| `POST /api/plans` | 202 accepted with a fixed UUID capability, 400 invalid on `["cropPurposeIds", 0]`, 503 unavailable, 429 and 413, per test. |
| `GET /api/plans/{id}` | `jobFixtures` states in order (queued, fetching, calculating, then completed or failed), or a 404 `not_found`. |
| `DELETE /api/plans/{id}` | 204. |

`evidence.spec.ts` seeds `inputFixture` with one change. Its synthetic crop is swapped for `maize-grain` from the released list, so page 2 needs no fixing before the flow can go on. The field, the date and the 4-day bar are the fixture's.

Storage is F4's real IndexedDB, and it works in these runs. So no storage line shows, except where a case makes the browser refuse storage (`[L1]` and the F4 storage words cases) or seeds a record F4 sets aside. The round "N" button in the corner of the recordings and screenshots is the `next dev` tools button. A production build does not have it.

## Files

| File | What it shows |
| --- | --- |
| `flow-360.webm`, `flow-1280.webm` | The input flow at 360 x 740 and at 1280 x 800, about 35 seconds each. First a Tab walk through each page with a visible focus ring. Then on page 2, Find a crop with "bean" and a second crop picked, named in the dock. On page 3, a water answer. On page 4, real mouse drags of the harvest and planting handles, Add a crop from the farmer's own crops, and Make my plan. Then Making through queued, fetching and calculating, and the Results slot. Playwright records them, and `ffmpeg -crf 40` re-encodes them to VP9 to keep the folder small. The 1280 recording is scaled to 800 x 500. |
| `focus-order-360.md`, `focus-order-1280.md` | One Tab walk per page and one inside the Change dates sheet: area, role, accessible name, size, and whether the focused element was covered. |
| `360-page2-light.png`, `1280-page2-light.png` | Page 2 with the 40-crop list, Find a crop, and the picked crop named in the dock. |
| `360-page4-light.png`, `360-page4-dark.png`, `360-page4-contrast.png`, `1280-page4-light.png` | Page 4 in light, dark (emulated `prefers-color-scheme`) and High contrast. |
| `360-rejected-submission.png` | After a 400 on `["cropPurposeIds", 0]`, page 2 opens with the issue beside the list and focus on it. |
| `360-failed-job.png` | A failed job (`retrieval_failed`) shows no plan and offers Try again and Change my answers. |
| `360-first-paint-largest-contrast.png` | The first screenshot taken after a load with Largest text and High contrast saved. It is already Largest and high contrast. |
| `360-set-aside-results.png` | A saved plan whose job can't be followed opens on Results. F4's set-aside notice and its Got it sit above the frame. |
| `360-no-room-page2.png` | Page 2 after the device filled up. The quiet line gives F4's words for a full device, then says the answers stay while the page is open. |

## Card F1 "Done when", case by case

| Done-when clause | Browser case | Result |
| --- | --- | --- |
| Completes all four pages | lab `[M1][A3]` at 360 and 1280. journey `[M1][K1][K2]`. | Passed. One primary button per page, Back on pages 2 to 4. On `/`, Making shows each step, then the Results slot replaces the inputs. The POST body equals `inputFixture`. |
| Resizes both crop endpoints | lab `[M1][H4]` at 360 and 1280 | Passed. A real mouse drag of the harvest handle, then the planting handle. Each lands on the day the pointer travel gives, start day + round(travel / track width x 365). |
| Moves a bar | lab `[H3]` at 360 and 1280 | Passed. Dragging the bar body moves both ends by the same days. |
| Goes backward without data loss | lab `[M1][C1]` and `[C1] phone Back` at 360 and 1280 | Passed. In-app Back from page 4 to page 1 and forward keeps the crop, the water answer and the dragged harvest day. Phone Back moves one page without a reload, and on page 1 it leaves the app. |
| Skips history | lab `[M1][H1]`, journey `[H1]` | Passed. I don't remember is pressed. The POST body has `history: { kind: "skipped" }`, and Show last year's entries again brings the bar back. |
| A rejected submission | journey `[M1][J3]`, evidence `[J3][K5]` | Passed. Page 2 shows the issue with focus on it, and every answer is kept. Making never shows and the Results slot never appears. |
| A failed JobState with no completed snapshot | journey `[M1][K5]` and `[K6]`, evidence `[J3][K5]` | Passed. The failure screen shows with no Results, and the job is deleted. Change my answers returns to page 4 with the same answers. A 404 on read ends on "This plan request has expired". |
| The three water choices | journey `[A4][F2]` | Passed. The same answers were sent with each water answer. The three POST bodies differ only in `water`. |
| No priority field in the POST body | journey `[A4][F2]` | Passed. Every body has exactly `cropPurposeIds`, `field`, `history`, `planningStart`, `schemaVersion` and `water`, and no "priorit" text. |
| A recording of the flow and the focus order at phone and desktop widths | evidence `[L5]` and `[L3][L5]` at 360 and 1280 | Passed. On every page the skip link comes first, then the top bar, the page, and the dock. Storage works in this run, so no notice is in the walk. The dock's last stop is the page's primary button, and no focused element was covered. Tab stays inside the sheet. |

The other browser cases also passed.

- **Opening.** `[A9]` checks that `/` opens on Opening, then "Where is your farm?". It shows no landing, sign in or sign up, and the served HTML holds only the Opening screen.
- **The seed.** `[D4]` checks that a seeded page 1 goes on and an unseeded one waits. No hydration error appeared in the console with the seed set.
- **Send failures.** `[J4]` checks the 503, 429 and 413 words, with one Make my plan button.
- **The capability token.** `[A10]` checks that the token is in no request URL, no page URL and no history state, and only in `Authorization`.
- **The empty catalogue.** `[E3]` checks that it shows "No crops are available yet" and no Next.
- **Layout and look.** `[L1]` finds no sideways scroll and no month label cut off in the overview strip, and `[L2]` finds no target under 48 x 48 CSS px. Both visit nine screens at Normal and at Largest text. `[L6]` checks the title contrast in light, dark and High contrast. Saved Largest and High contrast apply before the first paint.
- **Small phones at Largest.** lab `[L2]` opens the Text size sheet at 360 x 640 and 320 x 568 with Largest saved: the title and all three sizes are in view and the chosen size has focus. A Not sure sheet too tall for 320 x 568 and 360 x 640 opens on its title at the top, and Shift+Tab from that title stays inside the sheet. At 360 x 740 Normal it opens on its main action.
- **The page 2 dock.** lab `[E1]` checks that the picked crops are named on screen beside the count, on one line.
- **A drag that stops.** lab `[H4]` drags the planting handle past the start of the 12 months. The handle stays on day 0 and a note says "Synthetic crop stays inside the 12 months shown." When a note with Undo is showing, the same drag leaves that note and its Undo in place, and only the status line says the stop.
- **The field-ready date.** lab `[G2][G4]` types one digit too many in the year. Chromium keeps four digits, so the date becomes a past year and "This date has passed" shows, and the field is never wiped. lab `[G2]` deletes the year by keyboard. The plan window line goes, and Make my plan stays on page 4 and asks for the date.
- **High contrast progress.** lab `[L6]` checks that a step not reached yet is drawn differently from a step done.

## Bugs this run found, fixed in F1's files

- **A note covered the storage notice.** The toast was placed at the top bar's height. While the storage notice sits above the bar, the bar is lower than that, so at 360 the note covered the notice's Got it. The note now follows the top bar's bottom edge (`views/frame.tsx`, `terrace.css`). The case `[L1] the note under the top bar never covers the storage notice…` failed before the fix and passes now.
- **A note covered an open sheet.** The toast sat above sheets (z-index 75 over 71), so at 360 it covered the Change dates sheet's Close. It now sits under the scrim (65). The same case and the focus-order "Fully visible" check cover it.
- **Undo stayed on Making.** The toast stayed into Making, where no answer can change, so its Undo did nothing. The controller now drops the toast when the input pages close. A Vitest case in `ui/making.test.tsx` failed before the fix and passes now.

## Review fixes that change what the browser shows

An independent review of the branch led to these changes. Each new browser case above failed on the code before its fix and passes now.

- **Text size sheet on small phones.** Focus went to Done, the sheet's last control, and the browser scrolled the title and the size choices away. Focus now lands on the chosen size, and a sheet whose first control starts below its visible part focuses its title instead.
- **Month letters at large text.** At Largest on a 360 px phone the letters were wider than their months and ran together. Labels are now sized in the row's own em and left out when a 28-day month cannot hold one. At 360 x 740 the row reads "J A S O N D J F M A M J" at Normal and shows only the years at Large and Largest.
- **The page 2 dock** names the picked crops, so a farmer can check the picks without scrolling 40 crops. The recordings show "2 picked: maize (grain) and common …".
- **Making** says "Keep this page open while we work." instead of promising a time, and its ring is at most 28% of the screen's height, so the first step starts on the first screen at 360 x 740.
- **High contrast** draws steps not reached as white with a black edge, and the Making ring's track as a dotted line.
- **Notes.** A stopped drag shows its reason as a note, unless a note with Undo is showing. Then only the status line says the stop. A note with Undo goes when any answer changes or the page changes, and it comes right after the quiet notices in the Tab order. No evidence case raises a note, so the focus-order files did not change.

## Fixes after the second review

A second independent review of 75146ad, and two skeptics on its fix round, led to these changes. Each has a Vitest or Playwright case that failed before its fix.

- **Undo.** The note with Undo goes when a later answer changes, so Undo never discards a later step. A drag that stops keeps that note. Undo says "Undone: …", and a sentence said twice in a row is said again.
- **Focus.** Shift+Tab from a sheet's title stays inside the sheet. After Change inputs, focus lands on the title of the page that opens. Try again on the crop list keeps focus on the page or sheet title and says whether the list loaded. Listen is a plain button.
- **Change inputs.** It never reopens a job whose plan was already shown. Answers count as newer than the plan only when this visit showed them at the hand-off to Results, so a draft from before a failed open is never kept, and answers changed while a job ran are. What it opens is saved at once.
- **Storage at open.** A load that fails within 1 s of the open is tried again, up to three loads in all. A load that fails later is not tried again.
- **Service errors.** A saved `service_error` is never offered as the earlier plan. With saved answers, it opens those answers instead of Results.
- **Making and the failed screen.** Try again shows the busy button while it sends. Three failed reads of any kind show "We can't reach the planning service right now". The note goes when Making reopens on the same job.
- **The field-ready date.** Text that is not a date stays in the input and clears the answer, so the plan never uses a date the input does not show. The input is bounded to four-digit years.

## F4's storage words

Card F4 asked F1 to show its storage words through `services/saved.ts`, F1's only storage door (F4 design, decisions D1 and D2). F1 now shows two kinds of line. Each is a quiet line with Got it that never blocks input.

- **Saved data set aside.** F4 moves saved data this version can't read to one side, and `readStorageNotice()` describes it. `saved.ts` reads it once per page load, after the first open that read storage, because that load is what sets data aside. The line shows above the input pages and Making, and above Results too, because `AppFrame` shows it. Got it calls the notice's own `dismiss`, which removes that data for good. A reload without Got it shows the line again. An open that could not read storage reads no notice.
- **Why storage failed.** A failed load or save shows `storageProblem(error).text`, then "Your answers stay while this page is open." A write skipped because the open could not read storage repeats the open's reason. The first failure's words stay until Got it, as the generic line did before.

| Case | Surface | What it shows |
| --- | --- | --- |
| `ui/storage-words.test.tsx`, 8 cases | jsdom, `src/app/page.tsx` with mocked storage and F4's own `storageProblem` | Each visit is a fresh module graph, as a reload is. The set-aside line shows once and stays across pages. Got it removes it for this visit and the next, and focus goes to the title. A reload without Got it reads and shows it again. On Results it sits outside the Results region, is read once, and stays gone after Change inputs and a new plan. A normal visit shows no line. A failed open reads no notice. Blocked, full and newer storage each show their own words, and a full device keeps every answer on screen and saves nothing. |
| `services/saved.test.ts` `[F4-D1]`, 2 cases | Vitest | Each reason reports F4's words. A write skipped after a failed open repeats the open's reason and writes nothing. |
| `conventions.test.ts` `[F4-D1]` | Vitest | Only `saved.ts` names `localPlans`, `readStorageNotice` or `storageProblem`, and no F1 file restates F4's storage words. |
| `journey.spec.ts` `[F4-D1]`, 6 cases | Chromium, `/` with F4's real IndexedDB | A normal visit saves the step and shows no line. A state record whose plan is from an older Gilir is written raw into the `gilir` database. After a reload the line shows once, stays across pages, and Got it removes the set-aside record, read back raw. A second reload shows nothing. A saved plan whose job can't be followed opens Results with the line above it, a reload shows it again, and Got it puts focus on `#main`. A record from a newer Gilir says to close the page and open Gilir again. A blocked browser and a full device are simulated, as the next paragraph says. |
| `evidence.spec.ts` `[F4-D1]` at 360 and 1280 | Chromium, `/` | The two screenshots in the file table, written at 360. |

The blocked browser is an init script that makes `indexedDB.open` throw `SecurityError`, as Chromium does when site data is blocked. The full device is an init script that makes every IndexedDB `put` throw `QuotaExceededError` once the test says the device is full. Everything after the refusal is F4's real storage code and F1's real screens.

## Commands and observed results

Run from the repository root with Node 24. Playwright 1.65.1 cannot find its own Chromium on this machine, so the commands below set `PW_CHROMIUM`. Each spec uses it as the browser only when it is set, and Playwright's own Chromium otherwise. Its video recorder also needs an ffmpeg that can write VP9, which is missing from the browsers folder here. So the evidence run points `PLAYWRIGHT_BROWSERS_PATH` at a folder whose `ffmpeg-1013/ffmpeg-linux` links to the system `/usr/bin/ffmpeg`. Writing the evidence also needs `ffmpeg` on `PATH`. Playwright's `webServer` starts `next dev` on 127.0.0.1:3000, or reuses one already running there.

One way to make that folder:

```sh
mkdir -p "$HOME/pw-browsers/ffmpeg-1013" && ln -sf /usr/bin/ffmpeg "$HOME/pw-browsers/ffmpeg-1013/ffmpeg-linux"
```

| Command | Observed (15 November 2026, at the head that adds this table, on a machine whose load average was 14 to 27 on 4 cores) |
| --- | --- |
| `PW_CHROMIUM=/opt/pw-browsers/chromium PLAYWRIGHT_BROWSERS_PATH=$HOME/pw-browsers npx playwright test tests/frontend/onboarding/lab.spec.ts tests/frontend/onboarding/journey.spec.ts` on a warmed `next dev` | 43 tests: lab 26, journey 17. The first run on 2 workers passed 39. Four stopped at the 30 s test limit or a 5 s wait: lab `[E1]` and `[H3]` at 1280, and the two set-aside cases of journey `[F4-D1]`. The page snapshot of the Results case shows the expected notice on screen when the limit hit. The same four rerun with `--last-failed --workers=1` passed (48.7 s). |
| `PW_CHROMIUM=/opt/pw-browsers/chromium F1_EVIDENCE=1 PLAYWRIGHT_BROWSERS_PATH=$HOME/pw-browsers npx playwright test tests/frontend/onboarding/evidence.spec.ts --workers=1` | 22 passed (8.8 min). It rewrote every file in this folder except this README. Page 1 in the recordings and focus-order files now shows F2's field picker, and no screen shows a storage line unless its case asks for one. |
| `npx vitest run tests/frontend/onboarding` | 16 files passed, 365 tests passed. |
| `npm run check` | Exit 0 with only this README uncommitted. 82 files passed and 5 skipped. 1446 tests passed and 33 skipped. "Module boundaries passed." Two earlier runs failed outside F1's files. A backend climate test hit its 5 s limit at a load average of 14, and it passes alone (19 of 19). `tests/integration/runtime/report.test.ts` stopped at its `code_identity` stage while the re-recorded evidence was uncommitted, because `git diff --binary HEAD` was then 4.5 MB, more than the 1 MiB `execFileSync` buffers by default. |
| `npm run build` | Exit 0, with `next dev` stopped, because both use `.next`. `/` is static, the prerendered `index.html` holds "Opening Gilir…", and `__gilirDevInput` is in no file under `.next/static`. |

CI does not run Playwright. Without `F1_EVIDENCE=1`, `evidence.spec.ts` writes its files to `test-results/` only. With it, the spec stages them under `test-results/f1-evidence/` and copies them here after the last test, only when all 22 passed. A file written into the repository during the run makes `next dev` rebuild, and two earlier runs that wrote here directly got a 500 on `/` during that rebuild.

## Not verified

- **A field marked by hand.** Every run on `/` takes its field from the development seed.
- **Storage on a phone.** Storage ran on Chromium for desktop Linux only. A blocked browser and a full device were simulated, by making the browser's IndexedDB calls throw the errors Chromium raises. No real quota was reached, and Safari's and Firefox's storage were not tried.
- **A live job.** It needs `DATABASE_URL` and the worker, and the plan routes here are stubs.
- **The real Results.** The Results slot is still a stub that prints its prop names. The lab's Results slot cannot show which snapshot it got. So Change inputs, and every fix above that starts from it, has jsdom evidence through `src/app/page.tsx` only.
- **Assistive technology and other browsers.** No screen reader was run. What Listen hands to speech was captured from a stub in Chromium and in jsdom, but no voice was heard. Drag was driven with a mouse, not a touch screen. Only Chromium was used, not Safari or Firefox.
- **A production server.** Every browser run used `next dev`, because the seed exists only there. The build was checked separately.

## Requirement ids in test names

Test names start with ids such as `[K6]`. Each id is a row of the F1 requirement matrix written before the build, grouped by letter: A scope and hard product rules, B entry rule and shell, C navigation and saved answers, D page 1, E page 2, F page 3, G the field-ready date, H the history editor, I validation, J submission, K the job and Making, L accessibility, layout and the Terrace look, M the checks the card names. Sources cite file and line as they stood on `main` at `cc26407`.

| Id | Requirement | Source |
| --- | --- | --- |
| A1 | F1 changes only `src/features/onboarding/**`, `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `tests/frontend/onboarding/**`, plus evidence in `docs/evidence/F1/`. | docs/cards/F1.md:22-30, 48 |
| A2 | No root dependency, lockfile or contract change. Use only installed libraries. No copy of any schema or type. | AGENTS.md:38, docs/contracts.md:25, docs/cards/F1.md:30 |
| A3 | Pages are location, crops, water, history plus start date, in that order. One primary task per page. Each page has a back control and one continue action. | docs/cards/F1.md:34, spec.md:35-42 |
| A4 | No priority page and no `priority` field in the submitted input. The strict schema rejects an unknown key at path `[]`. | docs/cards/F1.md:43, spec.md:19, docs/contracts.md:36, tests/contracts/spec11.test.ts:33-39 |
| A5 | No pest or weed content. No crop-family proxy. | spec.md:31, spec.md:129, AGENTS.md:47 |
| A6 | No runtime LLM. | AGENTS.md:43, spec.md:11 |
| A7 | Production files never import `src/fixtures`. `page.tsx` uses the real `plannerClient`. Feature and "use client" files never import node built-ins, pg, server-only, next/server, `src/server`, `src/engine` or `src/registry`. | scripts/check-boundaries.mjs:32, 38-39 |
| A8 | Do not edit the F2 or F3 slots. Render them with their props unchanged. | docs/cards/F1.md:18, 38; docs/contracts.md:10-11 |
| A9 | No landing page, sign in or sign up. The app opens on the first question, the saved plan, the saved draft or the running job. | The user's brief |
| A10 | Keep credentials and exact farm inputs out of logs. Capability tokens never in a URL or query string. | AGENTS.md:65, spec.md:421, docs/contracts.md:83 |
| B1 | Entry rule order: active job, then saved snapshot, then saved draft at its saved step, else page 1. | The user's brief |
| B2 | A throw from `localPlans.load/save/clear` means "nothing saved". The app keeps working. | src/client/storage.ts:14-16 |
| B3 | A storage failure gives a visible message. It must not block input. | spec.md:423, docs/cards/F4.md:37 |
| B4 | After `onCompleted`, `page.tsx` shows `Results` with that snapshot. | docs/cards/F1.md:37, src/features/ports.ts:3-4 |
| B5 | `Results.onChangeInputs(input)` reopens Onboarding with `initialInput = input`. Values are prefilled. Regeneration happens by resubmitting. | spec.md:25, spec.md:60, src/features/ports.ts:4 |
| B6 | A finished `service_error` must not replace an earlier saved plan. That plan stays labelled with its original date. | spec.md:367 |
| B7 | `layout.tsx` keeps `<html lang="en">`. Interface is English, metric, browser-local date display. | src/app/layout.tsx:3, spec.md:64 |
| C1 | Values survive Back and Continue. | spec.md:35, docs/cards/F1.md:42 |
| C2 | Values survive refresh. Save `LocalState { draft, step, activeJob, snapshot }` on every change. | spec.md:35, docs/cards/F1.md:37, src/client/storage.ts:2-7 |
| C3 | `draft` is `Partial<FarmInput>`. Its `history` must still be a whole history value or absent. Never save a half-built history object. | src/client/storage.ts:3 |
| C4 | `step` is a number with no defined base in the port. F1 must pick and document one: F1 uses 1 to 4. | src/client/storage.ts:4 |
| C5 | Restore an active job through the port and resume polling. | docs/cards/F1.md:37, docs/cards/I3.md:26 |
| C6 | `initialInput` (a full FarmInput) seeds every page. Decide which wins when both `initialInput` and a stored draft exist. | src/features/ports.ts:3 |
| D1 | Render the F2 `FieldPicker` slot with `value` and `onChange`. Search, globe, drawing, coordinates, 2D fallback and dateline normalising are F2. | spec.md:39, 50; docs/cards/F2.md:24-28; docs/cards/F1.md:18 |
| D2 | Stored value is one field `{ ring, lookup, label }`. | spec.md:39, src/contracts/input.ts:45-49 |
| D3 | Continue needs a field. Field issues (`field.*`) show on page 1. | docs/cards/F1.md:36 |
| D4 | Until F2 lands, the stub cannot emit a field. Page 1 completes only when `initialInput` or a draft holds a field. | src/features/location/index.tsx:3-5, src/app/dev/fixtures/fixture-lab.tsx:17 |
| E1 | Load choices from `client.catalogue()`. Only catalogue entries are selectable. Show the label and food or cover purpose. | spec.md:40, spec.md:121, src/contracts/registry.ts:7-12 |
| E2 | `catalogue()` can throw (`PlannerServiceError` on 503, a ZodError on a bad body). Show a retry. Keep inputs. | src/client/planner.ts:43-47, 38-41 |
| E3 | An empty catalogue (the released `v1-empty`) must say so honestly and not offer Continue with zero crops. | src/registry/index.ts:5-13, docs/contracts.md:18 |
| E4 | Select 1 to 12 distinct crop-purpose IDs. Block a 13th with a message. | src/contracts/input.ts:10, 50, 56; docs/contracts.md:30 |
| E5 | All selected crops are mandatory. Never drop a crop to make a result. Never silently remove a saved crop that is missing from the catalogue; show the issue. | spec.md:16, spec.md:40, docs/cards/F1.md:36, AGENTS.md:45 |
| E6 | Cover crops count the same as food crops. | spec.md:272 |
| F1 | One answer: `rain_only`, `rain_plus_backup`, `unsure`. Labels exactly "Rain only", "Rain + water when it's dry", "I'm not sure". | spec.md:41, 44; src/contracts/input.ts:4 |
| F2 | The form works with all three. Water changes only `water` in the submitted input. | docs/cards/F1.md:43, spec.md:20, spec.md:441 |
| F3 | Text must not suggest backup water feeds the calculation. | spec.md:20, AGENTS.md:45 |
| G1 | Required. A real ISO calendar date `YYYY-MM-DD`. | docs/cards/F1.md:36, src/contracts/input.ts:52, src/contracts/common.ts:3 |
| G2 | No invented default (no rain-onset default). | The user's brief |
| G3 | Show the plan window `[start, anniversary)`. A Feb 29 start ends Feb 28 the next year. Display the last day as anniversary minus one. | spec.md:259, spec.md:18 |
| G4 | A past date is allowed by the schema. A soft note is advised, not a block. | src/contracts/input.ts:52 |
| H1 | Optional history. "Skip history" stores `{ kind: "skipped" }`. Skipping differs from a fallow year. | spec.md:23, spec.md:48, src/contracts/input.ts:34 |
| H2 | Recorded history is `{ kind: "recorded", start, endExclusive, entries }` with `start < endExclusive <= planningStart`. | src/contracts/input.ts:35-40, 65-67 |
| H3 | Add, remove, move and resize crop bars. Each bar has a crop and planting and harvest dates. | spec.md:46, docs/cards/F1.md:35 |
| H4 | Resize both endpoints by drag and by keyboard. | docs/cards/F1.md:35, 42 |
| H5 | Tapping an endpoint opens an accessible date control for that endpoint. Dragging is never the only way. | spec.md:46 |
| H6 | A short "Dates are approximate" control. It sets `plantedPrecision` and `harvestedPrecision` (`exact` or `approximate`). | spec.md:23, 46; src/contracts/input.ts:5, 22-23 |
| H7 | Harvest is the last day in the field (inclusive). Same-day planting and harvest is valid. | spec.md:261, docs/contracts.md:29 |
| H8 | Crops from the catalogue store `{ kind: "catalogue", cropPurposeId }`. A crop not on the list stores `{ kind: "unsupported", label }` with a typed, non-blank name. | spec.md:48, src/contracts/input.ts:16-19 |
| H9 | Empty gaps stay unknown. Never auto-fill a gap as fallow. | spec.md:48, docs/cards/F1.md:35 |
| H10 | Explicit fallow is a `{ kind: "fallow", id, start, endExclusive }` entry, made only by a farmer action. | spec.md:48, src/contracts/input.ts:25-30, spec.md:443 |
| H11 | Each entry has a distinct non-blank `id` (1 to 240 chars after trim). | src/contracts/input.ts:14, 26, 77; src/contracts/common.ts:5 |
| H12 | At most 64 entries. | src/contracts/input.ts:10, 39 |
| H13 | Entries cannot overlap. A crop harvested on day X blocks any entry starting on X. A fallow ending (exclusive) on X allows a start on X. | src/contracts/input.ts:81-87 |
| H14 | Entries stay inside coverage. Crop: `planted >= start`, `harvested < endExclusive`, `planted <= harvested`. Fallow: `start >= history.start`, `endExclusive <= history.endExclusive`, `start < endExclusive`. | src/contracts/input.ts:69-76 |
| H15 | Changing planningStart moves the coverage. Bars may fall outside. Never drop them silently. | src/contracts/input.ts:65-76 (derived) |
| H16 | Historical crops are kept as context. Unsupported crops do not get invented parameters. | spec.md:48, spec.md:348 |
| I1 | Run `farmInputSchema` at submission. Submit the parsed value (labels trimmed). | docs/cards/F1.md:36, src/contracts/input.ts:43 |
| I2 | Show each issue beside its page: `field.*` page 1, `cropPurposeIds*` page 2, `water` page 3, `planningStart` and `history*` page 4. | docs/cards/F1.md:36 |
| I3 | Issues with path `[]` (bad JSON body, unknown key) or `schemaVersion` map to no page. Show them in the summary. | src/server/jobs/http.ts:110 |
| I4 | Issues on `history.entries.N` and `history.entries.N.id` sit beside entry N. | src/contracts/input.ts:76-77, 85 |
| I5 | Zod skips the cross-field checks (duplicates, ring closure, history rules) when a type error exists. A missing date hides a duplicate crop. Validate each page's presence first, then the full parse. | The user's brief |
| I6 | An invalid planningStart format also raises a misleading `history` issue. Show only the date issue when the date is invalid. | The user's brief |
| J1 | Call `client.submit(input)`. It resolves to `accepted`, `invalid` or `unavailable`. The HTTP client never throws from submit. | src/contracts/jobs.ts:23-26, src/client/planner.ts:48-57 |
| J2 | `accepted`: save `activeJob = capability`, then poll. | src/contracts/jobs.ts:24, docs/cards/F1.md:37 |
| J3 | `invalid`: no Making. Keep every input. Route issues to their pages (I2). | docs/cards/F1.md:42, src/server/jobs/http.ts:113-119 |
| J4 | `unavailable`: show the failure message in plain words. Retry keeps inputs. Codes include `rate_limited` (429), `payload_too_large` (413), `temporarily_unavailable`, `not_configured`, `not_implemented`. | docs/contracts.md:79, 83; src/contracts/result.ts:208 |
| J5 | Payload stays under 65536 bytes. | src/contracts/input.ts:10, src/server/jobs/http.ts:107 |
| J6 | Prevent double submit while sending. | The user's brief |
| K1 | Poll `client.read(capability)` until a terminal state. | docs/cards/F1.md:37 |
| K2 | Show queued, fetching and calculating as text, announced politely. | docs/cards/F1.md:37, spec.md:64, spec.md:419 |
| K3 | Stop polling on `completed` or `failed`. Stop on unmount. | docs/cards/F1.md:37 |
| K4 | `completed`: call `onCompleted(snapshot)` once. Clear `activeJob`. | docs/cards/F1.md:37, src/features/ports.ts:3 |
| K5 | `failed`: show the failure. Do not call onCompleted. Clear `activeJob`. Keep inputs. Offer to try again. | docs/cards/F1.md:42 |
| K6 | `read` can reject. On 404 it throws `PlannerServiceError` with `not_found`, `retryable: false`: treat as failed (expired request). On transport failure (`retryable: true`) keep polling with backoff. A malformed body throws a plain Error. | src/client/planner.ts:58-62, 38-41, 22; docs/contracts.md:80 |
| K7 | Never show fixture output when an HTTP call fails. | docs/contracts.md:85 |
| K8 | The Making words must not overclaim ("every order and date"). The search is approximate. | spec.md:282 |
| L1 | Layout works at 360 CSS px and desktop. No sideways scroll. | spec.md:64, docs/cards/F1.md:38 |
| L2 | Targets at least 44 px (repo). The user asks for 48 px minimum. | spec.md:64, docs/cards/F1.md:38 |
| L3 | Full keyboard operation. Logical focus order. | docs/cards/F1.md:38, spec.md:457 |
| L4 | Statuses have text labels, not colour alone. | spec.md:64 |
| L5 | A browser recording of the flow and focus order at phone and desktop widths, stored under `docs/evidence/F1/`. | docs/cards/F1.md:44, 48 |
| L6 | Terrace look: tokens for light, dark and high contrast, large text with a Text size control, 4.5:1 contrast, read aloud ("Listen"), and the approved design's screens and words. | The user's brief |
| L7 | `globals.css` keeps the Tailwind 4 import and carries the Terrace tokens. | src/app/globals.css:1-3 |
| M1 | Fixture-backed browser run: four pages, resize both endpoints, Back without loss, skip history, a rejected submission, and a failed JobState with no completed snapshot. | docs/cards/F1.md:42 |
| M2 | `npx vitest run tests/frontend/onboarding`, `npm run check`, `npm run build`. A missing test file is not a pass. | docs/cards/F1.md:48, AGENTS.md:55 |
| M3 | deslop pass, no-comments review, independent peer review of the exact PR. | AGENTS.md:57, docs/cards/F1.md:48 |
