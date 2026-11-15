# Global crop model release

The new catalogue releases 32 reviewed crop-purpose models. The user chose to defer the other eight on 15 November 2026. The two archived 40-crop catalogues retain their original bytes, fixed-day engine behavior, and saved snapshot formats.

The review is an AI technical check of source transcription, harvest-purpose mapping, model assumptions, and numerical-method design. It is not an agronomist's approval, field validation, or proof of local suitability. `approved-published-32.json`, `evidence-payloads.json`, and `method-review.json` preserve the independent source review. `source-review-bundle-lock.json` identifies the original review bundle, including deferred audit artifacts that are not runtime inputs. `scheduling-policy.json` records the separate seven-day turnaround policy.

The authoritative publications are [FAO's revised Paper 56](https://openknowledge.fao.org/handle/20.500.14283/cd6621en) and [1998 Table 12](https://www.fao.org/4/x0490e/x0490e0b.htm). The review records document hashes and exact row locators. The repository does not redistribute the publications.

## Timing and water

`thermal-model-v1` uses Equation 6.23. It caps the mean of daily Tmin and Tmax before subtracting the base temperature, then floors the daily result at zero. The four source GDD amounts are incremental. Their cumulative thresholds determine stage-end dates independently for every retained climate replay.

Thermal prefix sums use Kahan compensated addition. Both the horizon check and stage-boundary binary search use the same numerical tolerance. It combines `8 * Number.EPSILON * max(abs(endPrefix), abs(startPrefix), abs(target))` with the sum of daily arithmetic bounds since planting. Each positive-GDD day's bound is `4 * Number.EPSILON * (abs(Tmin) + abs(Tmax) + abs(Tbase) + abs(Tupper))`. This covers cancellation near the base temperature as well as prefix roundoff. Zero-GDD days add no allowance, so a flat thermal tail cannot create a later completion by increasing the tolerance. The policy does not change reviewed thresholds or represent weather uncertainty. Tests preserve a genuine 0.000001-GDD deficit and recover the exact 200-day boundary for 20 GDD accumulated at 10.1 C above a 10 C base.

A stage ends after the first day that reaches its threshold. Overshoot remains available for later thresholds. Coincident thresholds create zero-day stages. Kc follows calendar-time interpolation over those derived stage lengths. Development and late-stage ramps use j/n for days j = 1 through n. Zero-GDD days retain full-day crop demand. The completion day is also charged in full. This is Gilir's declared daily discretization of the FAO calendar-stage curve.

Every replay remains in the common cohort. A crop placement exists only when all replays complete within the horizon and the seven-day turnaround fits. The field stays reserved through the latest completion. Each replay's water calculation stops at its own completion. The two unplanted indicators describe planned slots, including waiting after an earlier harvest. They do not measure continuous live crop cover.

The selected long, maximum-length, or common source scenario is fixed before ranking. It is not a universal upper bound on maturity or demand. The 1998 Kc values retain their reviewed management assumptions and receive no local climate adjustment. Thermal development does not assess frost survival, heat injury, photoperiod, vernalization, soil suitability, or yield. Water stress does not delay modeled development.

## Frozen identity and limits

New jobs use manifest 2 and completed snapshot 3. The manifest binds the exact model release, settings, original climate-response hashes, and canonical normalized climate-artifact hashes. The runtime verifies these hashes before calculation and after recovery. The pure engine accepts that verified frozen run and checks its version identities. Old manifest-1 jobs keep their existing dispatcher path and complete as snapshot 2.

The prepared domain uses one thermal prefix series per crop and retained replay, with binary search for stage completion. Search reads those reservations and never supplies a separate duration. The default scoring budget is 5,000,000 advanced crop days, rolling-window day visits, and crop-by-replay aggregation visits in total. Structural expansion, ranking expansion, and scored-candidate limits remain separately frozen. An exhausted budget preserves an assessed incumbent, or returns `search_incomplete` if none exists. It never produces an impossibility proof.

Snapshots 1 and 2 remain readable. Snapshot 3 requires consistent model IDs, replay membership, stage boundaries, harvest ranges, field reservation, and selected crop coverage. Rendering and PDF export consume saved evidence without recalculating a plan.

## Reproduction and observed checks

Run `node --import tsx scripts/models/build-release.ts --check` to verify that the runtime release is the exact deterministic transformation of the reviewed source artifact. The converter pins the approval file hash and refuses a changed approval without renewed review.

The implementation tests cover hand-calculated development, calendar Kc, missing temperature, retained noncompletion, reservations, per-replay scoring windows, repeats, mandatory crops, deterministic budget outcomes, and strict snapshots. The archival registry tests keep their original canonical-byte hash assertions.

The local PostgreSQL 18 checks exercised snapshot-3 storage and the actual worker with the recorded NASA Bangkok archive. Existing snapshot-2 completion and frozen retry checks passed in the same isolated database. Runtime tests rejected modified settings, modified model parameters with copied version/hash labels, and modified normalized climate with the original response hash unchanged.

These are local component and recorded-climate results. They do not establish deployment or local agricultural validation. The [release verification record](verification.md) contains the independent code review, application checks and browser evidence with their exact code identities.
