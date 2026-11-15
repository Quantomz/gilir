# Final hosted map acceptance

PASS. The final hosted map-to-plan journey completed at phone 360 by 740 and desktop 1280 by 800.

The release coordinator confirmed Railway web deployment `c9f29c50-5e98-44d6-8368-59a17b0f9bca`, successful at 14:01:38 UTC on 15 November 2026, with source SHA `fe4728a0f31c40f8ee17e651f0405c6311661062`. This browser verification opened `https://gilir-web-production.up.railway.app` only after that confirmation. Main execution ran from 14:02:16 to 14:03:07 UTC. The browser has no source version endpoint, so deployment identity is supplied by the coordinator's Railway observation.

| Observed outcome | Phone 360 by 740 | Desktop 1280 by 800 |
| --- | --- | --- |
| NASA globe image responses | 9 successful | 9 successful |
| MapTiler Bangkok name search | 1 successful | 1 successful |
| MapTiler satellite image responses | 66 successful | 110 successful |
| Satellite metadata | 1 successful | 1 successful |
| Loaded logo linked to official MapTiler destination | PASS | PASS |
| First corner changed its visible coordinate row | PASS | PASS |
| Other three corners stayed fixed | PASS | PASS |
| Field area status changed | PASS | PASS |
| Marked-field page avoided horizontal overflow | PASS | PASS |
| One real planning submission | HTTP 202 | HTTP 202 |
| Completed API result | Version 2 plan with warnings | Version 2 plan with warnings |
| Real-run provenance | PASS | PASS |
| Rice paddy, Rain only, 2027-05-06 and skipped history preserved | PASS | PASS |
| Usable past seasons and climate products | 25 and 3 | 25 and 3 |
| Skipped history had no invented baseline | PASS | PASS |
| Timeline crop, caveat and saved-state label visible | PASS | PASS |
| View details and back to result | PASS | PASS |
| Browser page errors and provider HTTP errors | 0 and 0 | 0 and 0 |
| Browser-granted synthetic location control | PASS | PASS |

The first corner moved about 34 screen pixels. Exactly its coordinate row changed. The other handle positions were unchanged. The interior lookup intentionally stayed the same for this outward boundary edit, while the visible area status changed. The probe read fresh bounds and checked the pointer hit immediately before the drag.

Both real results showed rainfall mismatch and crop profile limitations. The interface retained the plan-with-warnings title and the explanation that past seasons are not a prediction. The test field is synthetic at a public Bangkok search result. This is not validation of an actual farm or worldwide agronomic coverage.

The two location controls opened the explanation and called the browser geolocation API with browser-granted permission and a synthetic location. Both marked the expected field and loaded satellite imagery. They do not verify physical GPS hardware or a real device permission prompt.

Each journey made three authorized GET plan reads. All used a capability header and no URL query. `apiStatusCounts` groups responses by resource path, so `read 204` records the app's plan-resource cleanup response. The separate `planReads` count covers GET requests only.

The supplemental globe-only probe passed at both sizes with nine successful NASA images each, no NASA HTTP error, no page error, and no extra planning submission. Every final PNG was opened and visually inspected. Globe, place search, satellite field before and after the drag, rotation, real result, details and synthetic location screenshots show the expected rendered screens.

The sanitized machine report is `map-results.json`. All 18 screenshots are small viewport or map crops. No provider URL with a key, capability token, job ID, precise geometry, raw API snapshot, trace or HAR was persisted. No route was stubbed. This verifier made no source or remote configuration changes.

The rerunnable scripts are one directory above this report. `map-results.json` records their SHA-256 hashes. Both scripts write to a deployment-specific directory based on `FINAL_DEPLOYMENT_SHA`. Prior deployment evidence remains separately archived under `e5ca3eafa43c/`.

The release coordinator owns the separate standard I3 recovery, keyboard, no-WebGL, PDF and demo suite. This report makes no independent pass claim for that suite. Native Codex verification is GPT-only and makes no cross-family claim.

Pstack is installed at `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md`. The bounded workflow used Control UI and the repository's existing Playwright dependency. Build the Lever produced the rerunnable probes. Prove It Works required actual hosted responses and inspected screenshots. Model the Domain kept real journeys separate from synthetic permission controls.
