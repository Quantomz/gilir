# F4 evidence

Card F4 lets a farmer reopen saved answers and a saved result on the same device, with no account, and download a PDF that opens offline. Everything in this folder is **fixture evidence**. The snapshots are synthetic, built from `src/fixtures/` and `tests/frontend/pdf/support/variants.ts`, and every PDF page carries the synthetic label. No live backend ran. **Live end-to-end evidence was not run here.** Cards I1 to I3 gate the assembled application.

The browser checks ran in Chromium (Google Chrome for Testing 153.0.8010.12, headless) on the F4 harness. The harness serves the real `src/client/storage.ts` and `src/client/pdf.ts` through Vite, which comes in through `vitest/node` and is not a direct dependency. No F1 or F3 page was involved. Every command ran with Node 24 (`PATH=/opt/node24/bin:$PATH`).

## Files

| File | What it is |
| --- | --- |
| `fixture-plan.pdf`, `fixture-plan_with_warnings.pdf`, `fixture-insufficient_data.pdf` | The PDFs `evidence.ts` writes (`en-GB` reader, UTC, A4). `download.spec.ts` downloads the same three in Chromium and checks each against a fresh node render of its snapshot (`renderPdf`), byte for byte. `cmp` then showed the three downloaded files equal these. |
| `fixture-plan-1.png` to `-4.png`, `fixture-plan_with_warnings-1.png` to `-4.png`, `fixture-insufficient_data-1.png` and `-2.png` | Every page of the three downloaded PDFs at 110 dpi. |
| `fixture-plan_with_warnings-gray-1.png`, `-gray-2.png` | The warning plan's status box and timeline pages in grayscale. |
| `fixture-plan_with_warnings-offline-viewer.png`, `fixture-insufficient_data-offline-viewer.png` | Chromium's own PDF viewer showing the saved files with the network off. |
| `fixture-poppler.txt` | `pdfinfo`, `pdffonts` and `pdftotext -layout` for the three downloaded PDFs. |
| `fixture-playwright.txt` | The final Ps and Pd runs, one line per case. |
| `fixture-load-timing.json` | The time of a load, and of F1's write (a load, then a save), of a 300 KB synthetic snapshot under a 6x CPU throttle, measured on the current `storage.ts`, with what the save's extra parse costs. |
| `inspection.md` | What a person saw on every page of the three downloaded PDFs. |

## Commands and observed results

| Key | Command | Observed |
| --- | --- | --- |
| V | `npx vitest run tests/frontend/persistence tests/frontend/pdf` | exit 0; 9 files, 204 tests passed; no `it.todo` or `test.fixme` is left in either folder |
| C | `npm run check` | exit 0; typegen and `tsc` clean; Vitest 54 files passed and 5 skipped, 750 tests passed and 29 skipped; "Module boundaries passed." |
| B | `npm run build` | exit 0; compiled, TypeScript finished, every route built |
| Ps | `env -u CLAUDECODE -u AI_AGENT PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test -c tests/frontend/persistence/playwright.config.ts storage.spec` | 18 passed ([output](fixture-playwright.txt)) |
| Pd | the same with `download.spec` | 7 passed ([output](fixture-playwright.txt)) |
| E | `node --import tsx tests/frontend/pdf/evidence.ts docs/evidence/F4` | the three PDFs written; `cmp` shows the three files Pd downloaded are byte-identical to these. With `--all` and another folder it writes all 21 (6 states, 14 variants, the plan on Letter) |
| | `pdftoppm -r 110 -png fixture-<state>.pdf fixture-<state>` for the three downloaded PDFs | 10 page PNGs. After the second review's fixes, only plan pages 3 and 4, warning plan page 4 and missing-data page 2 changed, each by the new "Calculation methods" line; the other six rendered byte-identical |
| | `pdftoppm -r 110 -gray -png -f 1 -l 2 fixture-plan_with_warnings.pdf fixture-plan_with_warnings-gray` | 2 PNGs; every pixel was already gray, so they were stored as 8-bit gray with no loss. Rendered again after the second review's fixes, pixel-identical |
| | `pdfinfo`, `pdffonts` and `pdftotext -layout` on the three downloaded PDFs | A4, 4, 4 and 2 pages; title "Gilir crop plan, made 1 Jul 2026" or "Gilir status report, made 1 Jul 2026"; Creator and Producer "Gilir"; JavaScript no; fonts Helvetica and Helvetica-Bold, Type 1, WinAnsi, not embedded ([output](fixture-poppler.txt)) |
| I | A person looked at every page image | [inspection.md](inspection.md): nothing clipped, every warning and source printed, the period stated, no calendar in the status report |
| Timing | `storage.spec -g "phone-speed" --repeat-each 5` | all 10 passed; a 306,322-byte snapshot loads in a median of 45.9 ms warm and 84.5 ms on the first load of a page, worst 90.2 ms. F1's write of it, a load then a save, takes a median of 94.5 ms, worst 125.1 ms. The limit is 5,000 ms ([numbers](fixture-load-timing.json)) |
| Save cost | a scratch benchmark of F1's write, 54a76bc's `storage.ts` against this one, alternated, 5 runs each | save median 36.7 ms before and 51.4 ms now, write median 72.5 ms before and 87.4 ms now. Save now parses the stored record, so an unreadable part is set aside before the state is replaced. The parse is the price of that, and it is kept ([details](fixture-load-timing.json)) |
| Overlap | a storage.spec run and a download.spec run started at the same time, with no `F4_PORT` | both passed. Before the harness took a free port, the second failed with "Port 3300 is already in use" |
| M | `git merge-tree --write-tree 73e1b6f HEAD`, then `tsc --noEmit`, `vitest run tests/frontend` and `check-boundaries.mjs` on that tree | 73e1b6f is the `main` that merged PR #42 at 54a76bc. Clean merge; `tsc` exit 0; 24 files, 533 tests passed, F1's onboarding tests among them; "Module boundaries passed." |
| M2 | `git merge-tree --write-tree f79ffd7 HEAD` | **FAILED.** f79ffd7 is `main` after PR #45, the shared-contract change that made CompletedSnapshot version 2 and edited `storage.ts` and the persistence tests. The merge conflicts in `storage.ts`, `conventions.test.ts` and `record.test.ts`. A follow-up must resolve them before this branch can merge |

## What each card item rests on

**A saved result stays readable after a browser restart and a server expiry, and draft and job restoration are covered.** `storage.spec` saves a partial draft, page 3, a job capability and the plan snapshot, closes Chromium, launches it again on the same user data folder, and loads the same state with the snapshot's id, date and provenance unchanged. With every `/api` request answering 404 `not_found`, and again with every request failing, a reload still loads the snapshot. The route sees only the test's own probe request, so `load` sent nothing. `load`, `save`, `readStorageNotice` and `clear` send no request at all.

**A full device, blocked storage and an invalid old record give useful words, with no silent loss and no made-up defaults.** With a 256 KB quota, a save of incompressible data rejects with "This device has no room left to save Gilir.", the earlier state still loads, and a save that fits still works. In a sandboxed frame, `load`, `save` and `clear` reject with "This browser isn’t letting Gilir open or save your answers on this device." An old record written with raw IndexedDB loads its answers with the snapshot left out (null, never a default), the notice says "Your saved plan can’t be opened by this version of Gilir. Make the plan again to see it. Your answers are kept.", and the record sits unchanged in the set-aside record. A notice read in the same tick as that load, before it or after it, names the plan too. The notice survives a restart until dismissed and stays gone after a dismiss and a restart. Clearing site data while the page is open makes the next load resolve null, not reject. A newer database rejects "newer" and stays untouched. Every record, the state and the set-aside one, carries the FarmInput, CompletedSnapshot and RunManifest versions of the build that wrote it. So an older build refuses a newer build's records, or a snapshot whose input or run manifest is newer, instead of setting them aside or deleting them (`record.test.ts`). On a full device, a load that can't set an unreadable part aside still returns the readable answers, the notice still names that part, and the next save sets it aside first or rejects "full" with the old record kept. That is shown with the IndexedDB double in `record.test.ts`. Chromium's quota override makes that write fail only now and then. In three runs of a scratch probe with a 240 KB record and seven quotas from 380 to 600 KB, the load's write failed at three quotas, then two, then none. At the other quotas the record itself couldn't be written, or the load's write fit. Each time it failed, the notice named the plan. That is too erratic for a test. Another tab's upgrade is not blocked. A tab holding the database stops a save at the 5 s limit, and that save changed nothing. The farmer sees these words only once F1 shows them, so the screen half of this item is PARTIAL.

**The fixture lab never touches the farmer's database.** A save under `/dev/fixtures/` is invisible at `/` and the reverse, `indexedDB.databases()` lists `gilir` and `gilir-fixture-lab`, and Clear in the lab leaves the farmer's state.

**PDFs from a plan, a warning plan and the missing-data fixture open offline and were inspected.** Each downloads as `gilir-plan-2026-07-01.pdf`, starts with `%PDF-`, equals the node render byte for byte, and opens in Chromium's PDF viewer with the network off, which shows its title and page count. [inspection.md](inspection.md) records every page. After `preparePdf`, a download works with the network off. Once the PDF code has loaded, making all six files sends no request. With storage denied, `exportPdf` still returns a PDF.

## Not run or not shown here

- **NOT RUN.** Live end-to-end evidence with the assembled application and a real backend. Cards I1 to I3 own it.
- **NOT RUN.** Safari and Firefox. Every browser case ran in Chromium only.
- **NOT RUN.** A real cheap phone. The 6x throttle slows only the page's main thread, not IndexedDB's disk work.
- **NOT RUN.** The specs under the root `playwright.config.ts`. Its web server starts `next dev`. Both configs list the same 24 cases.
- **Not kept here.** The PDFs of the other three result states, the 14 variants and the Letter plan. The layout and export tests render every one of them on A4 and Letter; `evidence.ts --all` writes them for a person to look at.
- **PARTIAL.** The farmer seeing the storage words and the set-aside notice. That needs F1 to show `readStorageNotice()` and `storageProblem(error).text`.
- **Not shown by the harness.** Retrying the PDF after an offline failure. `export.test.ts` covers it in Vitest: the render import fails once, and the next export returns a PDF. Without the reset in `pdf.ts` that test fails. The harness can't show it in Chromium, because it loads native ES modules and Chromium keeps a failed module fetch. The product build loads the PDF code as a webpack chunk, which forgets a failed load. A one-off production build with a probe page (outside the repo, then deleted) showed an offline export reject twice and the next online export return a PDF, in 3 of 3 rounds.
