# Release verification

The user approved labeled estimates where local profiles are unavailable, then selected a first release of 32 reviewed crops on 15 November 2026. The eight unresolved mappings remain outside the new catalogue. This record distinguishes model coverage, numerical behavior, saved-result compatibility and deployment.

Application code was reviewed and checked at `6aaa25440ccbe434cf4a1cc0aea18f7ac30b0b17`, against main `048f22a235730345ec10f57d42deb49dced4c210`. The model content hash is `71386782c0b1a6ef76c8479b5482539003cc6bde5c760b621f09bd06a75b6246`.

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

Independent code review found and verified fixes for floating-point threshold errors, incomplete validation at direct database completion, and incorrect snapshot anniversaries. A stale storage convention test was also corrected. No unresolved P0, P1 or P2 finding remains in that review. Review models were GPT-family only; no cross-family or agronomist approval is claimed.

## Recorded NASA checks

All 32 models were evaluated at seven public illustrative locations, for 224 model/location evaluations. No model was missing. At least one modeled planting date was available for 32 crops in Bangkok, Ibadan, Pretoria, Sydney and Cairo, 27 in Madrid, and five in Helsinki. These counts describe model completion within the planning horizon, not local crop suitability.

The full engine returned a warning plan for the reported Bangkok rice, wheat and sweet-maize selection. All three water answers retained the same plan. Wheat occupied the first slot, sweet maize the second, and rice the third. Sydney wheat and Cairo maize also returned warning plans. Helsinki rice returned a model-scoped no-calendar result. All four snapshots passed the saved-result schema after the final numerical fixes. The [case receipt](final-case-receipt.json) binds these observations to snapshot, climate-archive and model hashes.

These runs use captured NASA data in the local application. They do not establish deployed behavior or local agricultural validation. The models do not assess frost survival, heat injury, photoperiod, vernalization, soil suitability or yield.

## Release state

Independent production-build browser verification, GitHub CI and the Railway deployment are tracked by the release PR. No production claim follows from the local checks above.
