# I3 hosted acceptance

The public Gilir website now shows real planning results, retains saved work, and downloads the result as a PDF. The final hosted acceptance passed on 15 November 2026.

## Released application

| Component | Verified identity |
| --- | --- |
| Public website | https://gilir-web-production.up.railway.app/ |
| Web source | `fe4728a0f31c40f8ee17e651f0405c6311661062` |
| Railway web deployment | `c9f29c50-5e98-44d6-8368-59a17b0f9bca`, SUCCESS |
| Worker and cleanup source | `ec2ef2255ba76d6383d81dad43ff98a70584a850`, unchanged |
| Catalogue | `fao56-hard-windows-2026-11-15`, 40 entries |
| Browser | Installed Google Chrome through Playwright, 360 by 740 and 1280 by 800, en-US and UTC |

[PR #56](https://github.com/Quantomz/nefalos_nasa_hackathon/pull/56) merged the reviewed integration harness. [PR #57](https://github.com/Quantomz/nefalos_nasa_hackathon/pull/57) supplied the existing Gilir mark as a browser icon and corrected the native-date keyboard test. Both received independent exact-commit review and passed both GitHub checks before merge. The merged trees matched their reviewed heads.

The web update includes the previously merged results, storage, PDF, and map improvements. Backend source, contracts, dependencies, and migrations did not change. The web Dockerfile already carried its public MapTiler build argument before this release; the worker uses the compatible earlier backend image. Only the web source pin was changed in Railway. No database configuration, worker restart, or manual cleanup run was performed.

[Railway read-back](hosted-2026-11-15/release.json) records all four services without issues and no staged changes. [HTTP checks](hosted-2026-11-15/http.json) confirm the website, catalogue, map logo, and reviewed icon return 200, while production `/dev/fixtures` returns 404.

## Hosted acceptance

The final [live run](hosted-2026-11-15/run.log) passed all 17 cases. This is the real public website, API, PostgreSQL, worker, released data and engine, and NASA climate pipeline. The test field is a synthetic box at a public Bangkok location, not a farmer's private field.

| Check | Result |
| --- | --- |
| Field, crops, water, edited history, plan, comparison, and details | Passed at both widths |
| Reload during planning and reopen a saved result with the API refused | Passed at both widths |
| Clear saved data, Undo, change answers, regenerate, clear and reload | Passed at both widths |
| PDF download with the browser offline and exact API-snapshot comparison | Passed at both widths |
| Keyboard-only journey through real plan, details, PDF and returning to answers | Passed at both widths |
| No-WebGL drawing and corner-list fallback through a real plan | Passed at both widths |
| Missing crop evidence returns its report without a timeline | Passed at both widths |
| Refused planning request retains answers and succeeds after retry | Passed at both widths |
| Phone demo of the real journey | Recorded locally |

A separate controlled fixture check established pending-job reload with one submission and the same capability. The local production-build fixture suite passed all four cases. These checks remain fixture evidence. The release check and build passed with 1,762 unit tests and 33 explicit integration-dependent skips; those skips do not replace the hosted checks.

Independent [real map acceptance](hosted-2026-11-15/map-acceptance.md) passed place-name search, NASA globe images, satellite images, official linked attribution, and field-corner editing before generating a real plan at both widths. Both results preserved the submitted answers and carried 25 usable historical seasons and three climate products. Page errors and provider HTTP errors were zero. [Sanitized machine results](hosted-2026-11-15/map-results.json) retain observed counts without keys, tokens or raw responses.

## Recovery and exported files

Before deployment, a real completed test plan reached the old [results placeholder](hosted-2026-11-15/before-results.png). Its browser storage was preserved privately. On the final release, that same stored plan opened at both widths with every API request refused, without another planning submission. Details, offline PDF download, and another reload passed. See [recovery checks](hosted-2026-11-15/recovery.json), [phone recovery](hosted-2026-11-15/recovered-360.png), and [desktop recovery](hosted-2026-11-15/recovered-1280.png).

The final [phone PDF](hosted-2026-11-15/live-360.pdf) and [desktop PDF](hosted-2026-11-15/live-1280.pdf) each contain seven pages. Both have SHA-256 `15a506ae5f6174a855483b89666a4bc05c789445e72fd6e2d3268d1b18e51cd7`. They are byte-identical to the exports independently rendered and inspected on all 14 pages. The checks also compared their text with the displayed title, calendar dates, warnings, notes, and historical period. No clipping, missing glyphs, overlap, or footer collision was found. Text extraction is retained beside each PDF.

A new hosted phone video is retained locally in the release audit directory. It is not published by this evidence change. Hackathon submission and public video distribution remain separate actions.

## Findings fixed during acceptance

The [first hosted run](hosted-2026-11-15/initial-failed-run.log) passed 14 cases and failed three. A fresh Chrome load requested the absent default favicon. The keyboard case also assumed US native date-field order at both widths. PR #57 added the app icon and uses June 6, whose month and day are unambiguous. Fresh Chrome loaded the declared icon with HTTP 200 and the full final run passed. A May 5 test candidate returned a legitimate no-calendar result and was not treated as an engine defect.

Earlier review fixed configured map-search labels, a fast fixture completion race, overbroad console-error suppression, and PDF extraction failures being mislabeled as missing tooling. Live traces are off, and capability assertions never print token values.

## Scope and remaining notes

- Phone evidence uses a narrow Chromium viewport. Physical devices, touch hardware, Safari, Firefox, and screen readers were not tested.
- The location permission control passed using a browser-granted synthetic location. This does not verify physical GPS or a device permission prompt.
- Native Codex agents performed independent review. Only GPT-family models were configured; no cross-family review is claimed.
- Some older F1 browser assertions still target the retired Results slot. The full historical browser suite is not claimed green. I3 targets the real results screen.
- The original I3 record lists non-blocking presentation observations, including technical wording, long phone results, and missing metric source IDs. The PDF and result retain their overall data sources and historical period.
- A valid result is a rainfall screening comparison with explicit warnings. This acceptance does not establish worldwide agronomic validation or predict harvest success.

## Reproduce

Use Node 24, the project dependencies, an installed Chromium, and Poppler `pdftotext` on PATH. From the repository root, run:

```sh
I3_LIVE=1 I3_BASE_URL=https://gilir-web-production.up.railway.app \
PW_CHROMIUM='/path/to/chromium' \
npx playwright test -c tests/integration/browser/playwright.config.ts live.spec.ts
```

Set `I3_EVIDENCE=1` to record screenshots, PDFs, and the demo. Those artifacts write under `docs/evidence/I3` relative to the working directory; use a separate audit working directory when preserving earlier evidence. Each run submits anonymous synthetic jobs through the public API. Source date and provider data can change a scientific result, so a changed outcome must be investigated instead of relabeled as a pass. Runtime API failures are simulated only in the recovery/error cases. Live map probes use real providers without route stubs.
