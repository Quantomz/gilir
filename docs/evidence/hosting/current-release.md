# Reviewed model release on 15 November 2026

[Gilir](https://gilir.up.railway.app) offers 32 crops with complete reviewed reference models. The web and worker run commit `8494a7e571abae32164814bb0b4aaf69d2eeaa0f` in Nefalos production. [PR #61](https://github.com/Quantomz/gilir/pull/61) supplies the model release; [PR #63](https://github.com/Quantomz/gilir/pull/63) fixes its production packaging and adds Docker builds to CI. Both passed independent review and CI before merging.

The [release receipt](global-model-release-2026-11-15.json) records the deployment identities and public acceptance. The [earlier 40-crop regional release](release-2026-11-15-morning.md) remains as historical evidence. Its catalogue and source pins no longer describe the current web and worker.

## Public acceptance

A fresh browser session completed the four-page journey using an illustrative Bangkok field, rice, wheat, sweet maize, rain only, and a 15 November start. At 16:02 UTC it received `plan_with_warnings`, replacing the previous missing-profile outcome for this case. The new production worker's completion event matches that saved snapshot.

| Check | Observed result |
| --- | --- |
| Catalogue | `fao56-global-32-2026-11-15`, exactly 32 entries. The eight unresolved crop purposes are withheld. |
| Production flow | Queued, fetching, calculating, completed; no browser page errors. No mocked plan or climate response. |
| Frozen identity | Snapshot v3, manifest v2, engine `thermal-model-v1`, cutoff `2026-11-14`; three NASA climate products and 25 retained seasons. |
| Model identity | `71386782c0b1a6ef76c8479b5482539003cc6bde5c760b621f09bd06a75b6246`. |
| Result | All three crops appear. Estimated harvest ranges are 4-17 February for wheat, 20-29 June for sweet maize, and 26 October-7 November for rice in 2027. Field availability is 15 November 2027. |
| Presentation | Phone at 360 px and desktop at 1280 px inspected; estimate and local-validation limitations are visible. The phone has no horizontal overflow. |
| Persistence and PDF | Result survives reload. Download succeeds while offline. The 17-page PDF passes content checks, contains no active links or scripts, and was visually inspected with native PDFKit. |
| Fixture exclusion | Public `/dev/fixtures` returns 404. |

The PDF includes extensive model assumptions and per-season diagnostics, making it long. Condensing those details is a presentation follow-up, not a missing-data release blocker.

MapTiler's existing public key was restricted to the current hostname after the public domain changed. A separate origin check returned HTTP 200 for the imagery TileJSON at 15:48 UTC. The fresh plan run recorded no map-provider requests, so it does not establish rendered-map acceptance.

## Deployment and recovery

The first worker build failed because the development model generator imported review documents excluded by the Docker context. PR #63 excludes that development generator too; runtime models remain in `src/registry/models`. It also adds an actual production Docker build after the existing CI checks. The prior live worker and website continued running during that failure.

The corrected worker reported ready at 15:58:39 UTC. Railway confirmed the previous worker was removed at 15:59:42, before the web update began. The web reached SUCCESS at 16:01:46. Both services are pinned to the reviewed packaging commit; branch pushes do not advance them automatically.

Cleanup and PostgreSQL were not redeployed. Cleanup retains its earlier image and hourly schedule; its 16:02:59 execution succeeded. Final read-back shows one running web replica and one running worker replica, no crashed replicas, and no pending environment changes. Railway retains the failed build in recent history; it is not a current runtime failure.

## Scope and supporting checks

Every newly offered crop has the required reviewed model parameters. This is AI technical review of published sources and implementation, not agronomist approval or validation at every location. Estimates do not establish local crop suitability, survival, yield, or sufficient irrigation. Missing climate data and a model with no fitting calendar remain legitimate outcomes.

The [model verification record](../global-models/verification.md) covers source review, numerical tests, legacy saved-result compatibility, real-weather probes across seven locations, and independent browser/PDF checks. The final packaging candidate passed 1,849 tests with one explicitly optional live-provider test skipped, typechecking, boundary checks, production build, and a real PostgreSQL container smoke. Both remote CI runs passed, including the new Docker gate. The public browser journey above is separate deployed evidence.

This documentation follow-up changes evidence only. Its workflow uses `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md`, Shipping with technical writing. Independent local model reviews are within the GPT family; no cross-family or field-validation claim is made.
