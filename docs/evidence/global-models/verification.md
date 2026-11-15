# Release verification

The user approved labeled estimates where local profiles are unavailable, then selected a first release of 32 reviewed crops on 15 November 2026. The eight unresolved mappings remain outside the new catalogue. This record distinguishes model coverage, numerical behavior, saved-result compatibility and deployment.

Application code was first reviewed at `6aaa25440ccbe434cf4a1cc0aea18f7ac30b0b17`, against main `048f22a235730345ec10f57d42deb49dced4c210`. Teammate frontend PRs 58 and 60 were then integrated and independently reviewed at `9fb508796ac74d1fe3602772a6f57b1d67ba6166`. Engine, registry, contracts and runtime code remained unchanged. The model content hash is `71386782c0b1a6ef76c8479b5482539003cc6bde5c760b621f09bd06a75b6246`.

## Decisions

- Release only the 32 source mappings approved by independent AI technical review. Defer Brussels sprouts, celery, millet, mung bean, green onion, dry pea, radish and watermelon.
- Calculate development from frozen daily temperatures. Use the same stage trajectory for field occupancy and rainfall demand. Retain all climate replays; reserve the field until the latest completion plus the declared seven-day turnaround.
- Preserve the original registry bytes and engine path for archived jobs. New saved results carry explicit model estimates, reference assumptions and limitations.
- Update and drain workers before updating the website. Jobs store the catalogue identity selected by the submitting website. The new worker understands both archived and new catalogues; an old worker cannot resolve a new catalogue job.

## Observed local checks

| Check | Result |
| --- | --- |
| Node 24 `npm run check` with local PostgreSQL | Typecheck and module boundaries passed; 1,837 tests passed, 10 gated cases skipped |
| Separately enabled cache and runtime/restart suites | All local database cases passed; only the explicit live external-provider pipeline remains unrun |
| `npm run build` | Passed; the initial sandbox attempt could not resolve the existing Google Fonts host, then the network-enabled run passed |
| Deterministic source converter | Exact approved model hash reproduced |
| Independent model/presentation tests | 422 passed |
| Independent PostgreSQL jobs/worker tests | 50 passed; four optional cache tests skipped in that review run |
| Independent thermal oracle | 70,080 integer-arithmetic comparisons across all 32 released vectors passed, including 157 exact threshold hits |
| Independent search oracle | 2,000 structural domains, 8,000 bounded variants and 250 exhaustive grid comparisons passed |
| Author browser checks | 10 Chromium cases passed, including offline restoration, legacy saved results and PDF export; 16 PDF pages visually inspected |
| Combined release `npm run check` with all local database gates | 1,849 tests passed, one explicit live-provider case skipped; typecheck and module boundaries passed |
| Combined release `npm run build` | Passed |
| Independent merge review | 480 tests passed; teammate Listen and styling changes preserved |
| Independent combined production-build browser review | PASS+NOTES at `9fb5087`; eight scenarios, two browser restart checks, six offline PDF downloads, and all 34 unique PDF pages inspected |

The first combined full check had one map-focus timeout. Its 28-test file passed in isolation, then the complete check passed without a source change. The failed run remains in the local audit trail.

The independent browser run used Chrome at 360 and 1280 pixels. It checked captured Bangkok and Helsinki results, old snapshot versions 1 and 2, all eight deferred labels absent from the catalogue, correction of a saved deferred selection, keyboard navigation to details, and API-blocked restoration. No restored scenario made an API request or raised a page error. The detailed Bangkok and Helsinki PDFs contain 17 and nine pages; their length is a nonblocking review note. Native macOS PDFKit rendered all pages after this host's Poppler renderer omitted standard Helvetica text. The actual PDF bytes passed content and active-action checks.

Independent code review found and verified fixes for floating-point threshold errors, incomplete validation at direct database completion, and incorrect snapshot anniversaries. A stale storage convention test was also corrected. No unresolved P0, P1 or P2 finding remains in that review. Review models were GPT-family only; no cross-family or agronomist approval is claimed.

## Recorded NASA checks

All 32 models were evaluated at seven public illustrative locations, for 224 model/location evaluations. No model was missing. At least one modeled planting date was available for 32 crops in Bangkok, Ibadan, Pretoria, Sydney and Cairo, 27 in Madrid, and five in Helsinki. These counts describe model completion within the planning horizon, not local crop suitability.

The full engine returned a warning plan for the reported Bangkok rice, wheat and sweet-maize selection. All three water answers retained the same plan. Wheat occupied the first slot, sweet maize the second, and rice the third. Sydney wheat and Cairo maize also returned warning plans. Helsinki rice returned a model-scoped no-calendar result. All four snapshots passed the saved-result schema after the final numerical fixes. The [case receipt](final-case-receipt.json) binds these observations to snapshot, climate-archive and model hashes.

These runs use captured NASA data in the local application. They do not establish deployed behavior or local agricultural validation. The models do not assess frost survival, heat injury, photoperiod, vernalization, soil suitability or yield.

## Release state

Both GitHub checks passed at `9fb5087`. The final documentation commit, merge and Railway deployment are tracked by [PR 61](https://github.com/Quantomz/gilir/pull/61). No production claim follows from the local checks above.
