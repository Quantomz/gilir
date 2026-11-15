# F1 browser evidence

This folder is **fixture evidence** for card F1, the four input pages and the editable history. Every run here used a synthetic farm input, stubbed network routes and `next dev`. It is not live end-to-end evidence. No real field picker, saved storage, planning job or Results screen took part. I1, I2 and I3 gate the assembled product.

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

The shared storage port still rejects every call, so every screen shows "This browser isn't saving your answers" with Got it. The round "N" button in the corner of the recordings and screenshots is the `next dev` tools button. A production build does not have it.

## Files

| File | What it shows |
| --- | --- |
| `flow-360.webm`, `flow-1280.webm` | The input flow at 360 x 740 and at 1280 x 800, about 35 seconds each. First a Tab walk through each page with a visible focus ring. Then on page 2, Find a crop with "bean" and a second crop picked. On page 3, a water answer. On page 4, real mouse drags of the harvest and planting handles, Add a crop from the farmer's own crops, and Make my plan. Then Making through queued, fetching and calculating, and the Results slot. Playwright records them, and `ffmpeg -crf 40` re-encodes them to VP9 to keep the folder small. The 1280 recording is scaled to 800 x 500. |
| `focus-order-360.md`, `focus-order-1280.md` | One Tab walk per page and one inside the Change dates sheet: area, role, accessible name, size, and whether the focused element was covered. |
| `360-page2-light.png`, `1280-page2-light.png` | Page 2 with the 40-crop list and Find a crop. |
| `360-page4-light.png`, `360-page4-dark.png`, `360-page4-contrast.png`, `1280-page4-light.png` | Page 4 in light, dark (emulated `prefers-color-scheme`) and High contrast. |
| `360-rejected-submission.png` | After a 400 on `["cropPurposeIds", 0]`, page 2 opens with the issue beside the list and focus on it. |
| `360-failed-job.png` | A failed job (`retrieval_failed`) shows no plan and offers Try again and Change my answers. |
| `360-first-paint-largest-contrast.png` | The first screenshot taken after a load with Largest text and High contrast saved. It is already Largest and high contrast. |

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
| A recording of the flow and the focus order at phone and desktop widths | evidence `[L5]` and `[L3][L5]` at 360 and 1280 | Passed. On every page the skip link comes first, then the notice, the top bar, the page, and the dock. The dock's last stop is the page's primary button, and no focused element was covered. Tab stays inside the sheet. |

The other browser cases also passed.

- **Opening.** `[A9]` checks that `/` opens on Opening, then "Where is your farm?". It shows no landing, sign in or sign up, and the served HTML holds only the Opening screen.
- **The seed.** `[D4]` checks that a seeded page 1 goes on and an unseeded one waits. No hydration error appeared in the console with the seed set.
- **Send failures.** `[J4]` checks the 503, 429 and 413 words, with one Make my plan button.
- **The capability token.** `[A10]` checks that the token is in no request URL, no page URL and no history state, and only in `Authorization`.
- **The empty catalogue.** `[E3]` checks that it shows "No crops are available yet" and no Next.
- **Layout and look.** `[L1]` finds no sideways scroll, and `[L2]` finds no target under 48 x 48 CSS px. Both visit nine screens at Normal and at Largest text. `[L6]` checks the title contrast in light, dark and High contrast. Saved Largest and High contrast apply before the first paint.

## Bugs this run found, fixed in F1's files

- **A note covered the storage notice.** The toast was placed at the top bar's height. While the storage notice sits above the bar, the bar is lower than that, so at 360 the note covered the notice's Got it. The note now follows the top bar's bottom edge (`views/frame.tsx`, `terrace.css`). The case `[L1] the note under the top bar never covers the storage notice…` failed before the fix and passes now.
- **A note covered an open sheet.** The toast sat above sheets (z-index 75 over 71), so at 360 it covered the Change dates sheet's Close. It now sits under the scrim (65). The same case and the focus-order "Fully visible" check cover it.
- **Undo stayed on Making.** The toast stayed into Making, where no answer can change, so its Undo did nothing. The controller now drops the toast when the input pages close. A Vitest case in `ui/making.test.tsx` failed before the fix and passes now.

## Commands and observed results

Run from the repository root with Node 24. Playwright 1.65.1 cannot find its own Chromium on this machine, so each spec reads `PW_CHROMIUM` and falls back to `/opt/pw-browsers/chromium`. Its video recorder also needs an ffmpeg that can write VP9, which is missing from the browsers folder here. So the evidence run points `PLAYWRIGHT_BROWSERS_PATH` at a folder whose `ffmpeg-1013/ffmpeg-linux` links to the system `/usr/bin/ffmpeg`. Writing the evidence also needs `ffmpeg` on `PATH`. Playwright's `webServer` starts `next dev` on 127.0.0.1:3000, or reuses one already running there.

One way to make that folder:

```sh
mkdir -p "$HOME/pw-browsers/ffmpeg-1013" && ln -sf /usr/bin/ffmpeg "$HOME/pw-browsers/ffmpeg-1013/ffmpeg-linux"
```

| Command | Observed (15 November 2026) |
| --- | --- |
| `PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test tests/frontend/onboarding/lab.spec.ts` | 12 passed (1.1 min) |
| `PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test tests/frontend/onboarding/journey.spec.ts` | 11 passed (1.2 min) |
| `PW_CHROMIUM=/opt/pw-browsers/chromium F1_EVIDENCE=1 PLAYWRIGHT_BROWSERS_PATH=$HOME/pw-browsers npx playwright test tests/frontend/onboarding/evidence.spec.ts` | 20 passed (3.6 min). It wrote every file in this folder except this README. |
| `npx vitest run tests/frontend/onboarding` | 15 files passed, 315 tests passed |
| `npm run check` | Exit 0. 58 files passed and 5 skipped. 851 tests passed and 29 skipped. "Module boundaries passed." |
| `npm run build` (dev server stopped) | Exit 0. `/` is static, the prerendered `index.html` holds "Opening Gilir…", and `__gilirDevInput` is in no file under `.next/static`. |

CI does not run Playwright. Without `F1_EVIDENCE=1`, `evidence.spec.ts` writes its files to `test-results/` only. With it, the spec stages them under `test-results/f1-evidence/` and copies them here after the last test, only when all 20 passed. A file written into the repository during the run makes `next dev` rebuild, and two earlier runs that wrote here directly got a 500 on `/` during that rebuild.

## Not verified

- **A real field.** Page 1 shows the field picker stub, and the field comes from the seed.
- **Real storage.** Every storage call rejects, so a reload loses the answers.
- **A live job.** It needs `DATABASE_URL` and the worker, and the plan routes here are stubs.
- **The real Results.** The Results slot is still a stub that prints its prop names. The lab's Results slot cannot show which snapshot it got.
- **Assistive technology and other browsers.** No screen reader or speech was run. Drag was driven with a mouse, not a touch screen. Only Chromium was used, not Safari or Firefox.
- **A production server.** Every browser run used `next dev`, because the seed exists only there. The build was checked separately.
