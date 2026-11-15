# Build Gilir in three parallel lanes

The original card plan below is retained as historical scope. On 15 November 2026, the user authorized a follow-up that makes complete reference-model data available for every newly listed crop, selected 32 reviewed crops for the first release, and deferred eight unresolved models. This follow-up spans source review, thermal development, search, frozen runtime identity, and results/PDF compatibility. It does not change the original cards' owners or estimates. Its current evidence and release limits are in [the global-model record](evidence/global-models/README.md).

The initial plan budgeted ten hours for each of three AI-assisted builders. It is not a delivery guarantee. The approved E3 handoff on 14 November moves its three-hour estimate to kyusuku while yslee1106 completes E1 and E2. Each person retains two hours for integration, review, and fixes. There is no planning-only lane.

The shared starter is prepared before the timed build. Every coding card starts from it, uses an explicit fixture or port, and can be implemented without another card merging. The final assembled application necessarily depends on the completed modules. Integration cards name those dependencies instead of hiding them.

| Owner | Core cards | Core budget | Final integration | Total |
| --- | --- | --- | --- | --- |
| Quantomz | F1, F2, F3, F4 | 8 h | I3, 2 h | 10 h |
| kyusuku | B1, B2, B3, E3 | 11 h | I1, 2 h | 13 h |
| yslee1106 | E1, E2 | 5 h | I2, 2 h | 7 h |

The user explicitly owns backend setup. Quantomz's frontend assignment follows the OneTab precedent. The calculations and data work are split across both backend lanes.

## Board columns

The board has exactly four columns: `Quantomz | Frontend`, `kyusuku | Backend and NASA data`, `yslee1106 | Crop data and calculations`, and `Done`. Integration cards stay in the relevant owner column. Overflow uses the help-wanted label inside its home lane, not another column. When someone claims a helper card, update its assignee and move it to that person's column. Move to Done only under the completion rule below.

Every card has a numeric `Estimate (hours)` field visible in the board view. Values are person-hours, matching OneTab. The current allocation above preserves each card's estimate and the original 30-hour team total. Unassigned X cards are optional additional work and are excluded from those totals.

## Start together

1. Install or locate pstack and confirm host tools before the build clock starts.
2. Check out the published baseline, install with `npm ci`, and run `npm run check` and `npm run build`.
3. Read the assigned card. Use its named fixture and command. No card asks another person to design its input shape.
4. Start each card on a separate branch from `chore/parallel-build-baseline` until PR #17 merges, then use `main`. Target PRs at `main`; their shared starter commits are accounted for when #17 merges. Keep files within its ownership list.
5. Open small PRs as cards finish. A teammate or independent agent reviews the exact change. Keep the final two hours for real integration.

At hour 2, every lane runs its first component with its fixture. At hour 4, each lane has a reviewable change and records missing external evidence. At hour 6, merge completed pieces and run the first real form-to-result path. At hour 8, stop optional additions and run I1, I2, and I3. Fix failed core checks during the last two hours.

## Starter availability

[PR #17](https://github.com/Quantomz/nefalos_nasa_hackathon/pull/17) publishes the common starter. Local checks, twelve tests, and the production build passed. GitHub Actions did not start because GitHub reported an account billing lock. Quantomz must resolve the repository owner billing issue and rerun the checks before normal CI-based merge. This is not an authentication failure. Coding and local verification can start from the published branch now.

## Keep the ten-hour scope honest

All agreed application behavior stays in the core cards, including globe selection, editable history, one deterministic plan, warnings and missing-data states, baseline comparison, local save, and PDF. The first data release targets three published crop profiles from the specification's candidate list. E1 targets maize, common bean as a dry grain crop, and wheat because FAO tables are available. Applicable timing and management assumptions must be recorded. Other profiles remain unavailable until reviewed. This changes the initial curation order, not the worldwide geography requirement.

Worldwide selection does not mean every crop-location combination has evidence. The farmer-selected priority and the pest and weed rule registry were removed from the MVP in spec 1.1. Every run uses one fixed water-first ranking. Do not fabricate a pest matrix or crop-family proxy. A no-evidence demonstration alone does not satisfy the live-plan integration gate.

Optional soil-moisture imagery and vegetation overlays are not required by spec.md and are outside the core build. Future crop expansion and additional rule coverage are overflow. Fertilizer, costs, accounts, multiple recommended plans, and an LLM remain outside scope.

The timeboxes are aggressive, especially scientific validation and globe interaction. A missed acceptance criterion stays open. The team may demonstrate completed parts, but must not label the entire specification complete when integration or scientific evidence is missing.

## Help another lane without conflicts

When Quantomz or another owner finishes early, take an unclaimed X card. X1 adds an independent crop-source review, X2 checks additional global climate coverage, and X3 adds independent metric fixtures. These change separate files and do not move core requirements into optional work.

To take over an unstarted core card, update its GitHub assignee and leave a handoff record before editing. For an active card, agree a separate file or test fragment. Do not have two people update the same module or lockfile concurrently.

## Dependencies that still exist

PostgreSQL, network access to NASA, map-provider configuration, reviewed crop evidence, and a host for a persistent worker are operational prerequisites. Their absence cannot be solved by claiming a mock is real. Local component work continues with the published fixtures. The integration cards require the real dependencies.

The project board is owned by kyusuku and both named teammates have been granted writer access. GitHub only links a project into a repository's Projects tab when their owners match. This board remains usable through its direct link, and its cards are issues in Quantomz/nefalos_nasa_hackathon.

## Completion rule

GitHub owns task status. Repository card briefs own implementation detail. Update both if scope changes. Core cards are Done only with merged code and their scoped evidence. I1, I2, and I3 gate the assembled product. No card is closed just because a checklist or test file was written.

## GitHub cards

| Card | Owner | Budget | Phase |
| --- | --- | --- | --- |
| [F1](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/1) | Quantomz | 2 h | core |
| [F2](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/2) | Quantomz | 2 h | core |
| [F3](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/3) | Quantomz | 2 h | core |
| [F4](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/4) | Quantomz | 2 h | core |
| [B1](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/5) | kyusuku | 3 h | core |
| [B2](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/6) | kyusuku | 3 h | core |
| [B3](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/7) | kyusuku | 2 h | core |
| [E1](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/8) | yslee1106 | 2 h | core |
| [E2](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/9) | yslee1106 | 3 h | core |
| [E3](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/10) | kyusuku | 3 h | core |
| [I1](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/11) | kyusuku | 2 h | integration |
| [I2](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/12) | yslee1106 | 2 h | integration |
| [I3](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/13) | Quantomz | 2 h | integration |
| [X1](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/14) | Claim when free | 0.75 h | overflow |
| [X2](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/15) | Claim when free | 0.75 h | overflow |
| [X3](https://github.com/Quantomz/nefalos_nasa_hackathon/issues/16) | Claim when free | 0.75 h | overflow |
