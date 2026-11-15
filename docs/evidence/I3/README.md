# I3 browser evidence: the assembled journey

The later [hosted acceptance](hosted.md) verifies the final public release. This file preserves the original local run and its limitations.

Card I3 asks for the farmer's journey on the assembled application, with a real result through the API, restored work and an inspected PDF, at phone and desktop widths.

Two phases are recorded here and they are different kinds of evidence:

- **Live evidence.** `tests/integration/browser/live.spec.ts` drives the page against the real stack: the production build of the web server, PostgreSQL, one worker, the released registry and engine, and NASA POWER over the network. Nothing is stubbed except where a test cuts the network on purpose.
- **Fixture evidence.** `tests/integration/browser/fixture.spec.ts` drives the same page with every card's real browser code and a stand-in for `/api` that returns the synthetic fixtures. It needs no database. It is not live evidence.

The field in every run is a synthetic 1 hectare box at a public place (central Bangkok, 13.75° N, 100.50° E). It is not a farm.

## What ran

| | |
| --- | --- |
| Code | `main` at `35f2d8f` plus this card's tests |
| Web server | `npm run build`, then `next start` on 127.0.0.1:3700 (production build; `/dev/fixtures` answers 404) |
| Database | PostgreSQL 16.15 on 127.0.0.1, migrated with `scripts/migrate.ts` (`001-jobs.sql`, `002-climate-cache.sql`) |
| Worker | `scripts/worker.ts`, one process |
| Climate | NASA POWER daily point data, fetched by the worker, with `GILIR_DATA_CUTOFF=2026-11-14` |
| Catalogue | `fao56-hard-windows-2026-11-15`, 40 entries, from `GET /api/catalogue` |
| Browser | Chromium 153 (Chrome for Testing), headless, 360x740 and 1280x800, locale en-US, time zone UTC |
| Node | 24.22.3 |

This is a local run of the real stack. It is **not** a run against the hosted Railway deployment: this build container cannot reach `gilir-web-production.up.railway.app`. The same live spec runs against any running Gilir with `I3_BASE_URL` (see Commands).

The container also cannot reach `gibs.earthdata.nasa.gov` or `api.maptiler.com`, and no `NEXT_PUBLIC_MAPTILER_KEY` was set. So every run shows the picker's own "The map pictures didn’t load" and "Search by name and close-up pictures aren’t set up on this site" notices, and the field is found by a typed position. Search by place name and satellite pictures inside the assembled journey are **NOT RUN** here; the F2 live records (`docs/evidence/F2/live-2026-11-15.md`, `logo-2026-11-15.md`) cover them for the picker alone.

## Commands and observed results

All with Node 24.

| Command | Observed |
| --- | --- |
| `I3_EVIDENCE=1 I3_LIVE=1 I3_BASE_URL=http://127.0.0.1:3700 npx playwright test -c tests/integration/browser/playwright.config.ts` | **21 passed** (3.6 min): 16 live cases (8 at each width), 4 fixture cases (2 at each width) and the recording. Log: [run.log](run.log) |
| `npx playwright test -c tests/integration/browser/playwright.config.ts` with no `I3_LIVE` | 4 passed, 17 skipped (40 s): the fixture cases on the config's own `next dev` on port 3300, and every live case skipped as BLOCKED |
| `I3_LIVE=1 DATABASE_URL=… npx playwright test -c tests/integration/browser/playwright.config.ts live.spec.ts`, two cases | 2 passed (31 s), run with `-g "phone 360x740 \[I3-[14]\]"`: the spec applied the migrations and started its own worker, and the config started `next dev` |
| `npm run check` | Passed: 1,762 tests passed, 33 skipped, "Module boundaries passed." |
| `npm run build` | Passed |

Without `I3_LIVE=1` and a stack, every live case skips with the reason "BLOCKED: the live phase needs I3_LIVE=1 with DATABASE_URL … or with I3_BASE_URL naming a running Gilir."

To run the live phase against a deployed site, from a machine that can reach it:

```sh
I3_LIVE=1 I3_BASE_URL=https://<the site> npx playwright test -c tests/integration/browser/playwright.config.ts live.spec.ts
```

Each live case creates anonymous jobs through the public API with the synthetic field above, as any visitor would.

The live PDF check requires Poppler's `pdftotext` on `PATH`. A missing executable or failed extraction fails the check. The browser harness accepts both the configured place-search label and the keyless coordinate-search label. It disables live traces even when invoked through the root Playwright configuration, and capability assertions do not print token values.

Independent release review found and corrected those harness gaps before hosted verification. The console-error exception now applies only to failed resource requests whose reported URL belongs to MapTiler or NASA GIBS. Unexpected app resource errors remain failures. Provider connectivity needs its separate live check. The refresh case also requires one submission and reads of one job ID. The recorded local results above describe the original run; they do not establish hosted acceptance.

## What each live case shows

Each case runs at 360x740 and at 1280x800.

| Case | What a farmer does | What was observed |
| --- | --- | --- |
| I3-1 | Types a position, marks the field, picks Rice (paddy), picks "Rain + water when it’s dry", sets the field-ready date, adds last year's rice and moves its harvest day with the arrow key, then Make my plan | `POST /api/plans` once, then reads that carry the capability in an `Authorization` header and nothing in the address. One version 2 snapshot, state `plan_with_warnings`. The page shows "Your plan, with warnings", the timeline with Rice (paddy) and its planting and harvest dates, "Checked against 25 past seasons, May 2001 to May 2026. From past seasons, not a prediction. Checked with rain alone.", "Saved on this device.", and last year's rice under Compared with last year. View details opens "How this result was made" with each number's method version and season count, and Back returns. No page error and no console error of the app's own |
| I3-2 | Reloads while the plan is being made, then reloads after it is shown with every `/api` request refused | The reload mid-job stays on "Making your plan" and reaches the result. With the server cut off, the reload reopens the same result and year from this device, still "Saved on this device." |
| I3-3 | Clear saved data, Undo, Change my answers, a new field-ready date, Make my plan, then Clear and reload | Clear shows "Your saved answers and plan are cleared." with Undo; Undo saves again. Change my answers opens page 1 with "This is the field you marked before.", and the crop, the water answer and the date are still there. The new plan is a second job with the new year (Jun 1, 2027 to May 31, 2028). After Clear and a reload, page 1 opens with nothing marked |
| I3-4 | Download PDF with the browser offline | A file named `gilir-plan-<day>.pdf` that starts `%PDF-`. It is byte for byte the PDF rendered in Node from the snapshot the API returned. Its text (read with `pdftotext`) holds the screen's title, year, planting and harvest dates, every warning, every note's text, the source period and "Checked with rain alone" and "not a prediction" |
| I3-5 | Uses only Tab, Enter, Space and typing | The keyboard alone types the position, marks the field, opens the corner list (the four corners are filled), answers every page, makes the plan, opens details and comes back, downloads the PDF and activates Change my answers |
| I3-6 | Opens the page on a browser with no WebGL | "This phone can’t show the moving globe." shows, there is no globe, the drawing ("A drawing, not a photo") stands in, and the journey still reaches a real plan |
| I3-7 | Picks Maize (grain), which has no released growing details for this place | A real `insufficient_data` snapshot: "We can’t make a plan yet", "Growing details for Maize (grain) in this place", no timeline, no crop id on the page, and a PDF that downloads |
| I3-8 | Make my plan while the planning service refuses connections | The rotation page stays, with "The planning service isn’t available right now" and "Your answers are kept. Try again in a few minutes."; the date is still filled. Once the service is back, Make my plan reaches the result |

One state was seen once during setup and is not a repeatable test: with a worker that had no route to NASA POWER, the job ended `failed` with `retrieval_failed`, and the page showed "We couldn’t get the weather records", "NASA’s weather service didn’t answer this time. Your answers are kept, so you can try again.", "No plan was made.", Try again and Change my answers.

## Files

| File | What it is |
| --- | --- |
| `shots/360-*.jpg`, `shots/1280-*.jpg` | The live journey at each width: 1 farm, 2 field marked, 3 crops, 4 rotation with last year's rice, 5 making, 6 the real result (whole page), 7 details, 8 reopened with the server cut off, 9 cleared with Undo, 10 the drawing with no WebGL, 11 no growing details, 12 planning service unreachable. Pages 1 to 5 and 7 to 10 and 12 are the window as the farmer sees it |
| `shots/fixture-*.jpg` | The fixture phase: the synthetic plan with warnings and the synthetic missing-evidence report, at each width |
| `live-360.pdf`, `live-1280.pdf` | The PDFs downloaded in I3-4. Both are 7 pages and identical, because the PDF does not depend on the window |
| `live-360.pdf.txt`, `live-1280.pdf.txt` | `pdftotext -layout` of each |
| `pdf-page-2.png` | Page 2 of the PDF, with the timeline, rendered with `pdftoppm` |
| `demo-360.webm` | A recording of the real journey at phone width: field, crop, water, rotation, the real result with its warnings and caveats, details and the PDF download. Saved here only; publishing it is a separate decision |
| `run.log` | The reporter output of the recorded run |

Every screenshot and all seven PDF pages (rendered with `pdftoppm`) were opened and looked at. In the PDF nothing is clipped, the warning box and "What we flagged" are on page 1, the timeline and its legend are on page 2, and the source period is on pages 4 and 6.

## Done when, against the evidence

- **Browser evidence shows the assembled real-data flow, not only isolated component fixtures.** I3-1 to I3-8, on the local real stack. Not on the hosted site.
- **A downloaded PDF matches the displayed result and retains warnings and source period.** I3-4.
- **Keyboard navigation, narrow layout, and unavailable map and data states are usable.** I3-5 (keyboard), every case at 360 px, I3-6 and the picture and search notices in every run (map), I3-7 and I3-8 (data and service).

## Not verified

- The hosted deployment. **NOT RUN**: this container cannot reach it.
- Search by place name and satellite pictures inside the assembled journey. **NOT RUN**: no key, and the provider hosts are refused here.
- A real phone, touch, Safari, Firefox and a screen reader. **NOT RUN**. Chromium only.
- "Use my location". **NOT RUN**.
- The Playwright video uses mouse clicks, not touch.
- The real result depends on NASA POWER as it answered on 15 November 2026. If the provider revises its data, I3-1's "this input gives a plan" can change; the test then fails with that message rather than passing on a different state.

## Seen during the run, for the owners

These did not stop the journey. They are recorded so they are not lost. The first two were fixed afterwards on the branch `fix/frontend-audit-findings`: the page and the PDF now share one head and one plain line per warning, and the engine's ranking and no-plan sentences are in View details only. The screenshots and PDFs here are from before that change.

- **Results and the PDF head the same notes differently.** The page says "A limit of the growing details for Rice (paddy)" above each crop profile note, and the PDF says "About the growing details for Rice (paddy)". Two of the three real notes are not limits (they explain how a source table was read), which is why the PDF's head was changed. (F3)
- **Engine and registry text reaches the farmer as written.** "In some replay seasons, rainfall fell below estimated crop demand in at least one rolling window.", "This was the sole assessed eligible calendar; no advantage over another calendar was established.", "The reported historical duration has no unambiguous released stage allocation." and "The FAO-56 cell 'Dec; May' with region 'Tropics; Mediterranean' is read as December planting for the tropics." are accurate and hard to read. (E1, E3)
- **View details shows "Sources: None recorded" for every ranking number**, although each rests on NASA POWER and FAO-56. The snapshot's metrics carry no source ids. (E2, E3)
- **The rice plan at this place plants on 1 December** and leaves the field without a planned crop for 209 days from May. That follows the one released tropical rice profile, and the result says so in its notes. It is the outcome a judge will see for the most likely demo crop.
- **The result page is about eleven phone screens long** at 360 px (8,306 px).
