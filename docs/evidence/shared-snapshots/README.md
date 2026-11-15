# Shared snapshot contract evidence

This follow-up supports F4 through shared contracts and producers. Quantomz retains PDF and persistence feature ownership. Implementation commit `6ccb892` preserves valid version 1 snapshots and writes version 2 snapshots with the exact run's public catalogue. Farm inputs, hashes, manifests, frozen runs and existing saved records are unchanged.

## Verification on 15 November 2026

Checks ran locally with Node 24 and a disposable PostgreSQL 18 database. Database suites used their existing isolated schemas and teardown. No deployed service or live NASA fetch was exercised by this follow-up.

| Command | Observed result |
| --- | --- |
| `npx vitest run tests/contracts tests/backend/jobs tests/backend/api tests/backend/worker tests/integration/runtime/runtime.test.ts` with database test URLs | 153 tests passed across 14 files. Real PostgreSQL, HTTP, lease guards, immutable completion, process restart and frozen replay ran. |
| `npm run check` with database test URLs | 1,179 tests passed across 75 files. One opt-in live NASA test was skipped. Type checking and module boundaries passed. |
| `F4_PORT=0 npx playwright test -c tests/frontend/persistence/playwright.config.ts --reporter=line` with the installed Chromium executable | 27 tests passed, including 20 persistence cases and 7 PDF cases. |
| `npm run build` | Production build passed. |
| `git diff --check` | Passed. |

The database cases prove version 2 completion, strict metadata rejection, terminal immutability and unchanged frozen bytes and input hash. Existing version 1 database rows remain readable. Worker tests prove pinned catalogue labels survive replay and malformed metadata records a processing failure instead of an endless lease retry.

Chromium restored both snapshot versions after a page reload and left their raw IndexedDB records unchanged. The existing version 1 case also restarted the browser process. Future draft version 2 and snapshot version 3 independently prevented load, save, clear and pending-notice dismissal from changing stored data. The tests used synthetic snapshots in the component harness.

Plan, warning-plan and missing-data PDF downloads matched the Node renderer and opened in Chromium's viewer while offline. PDF rendering source did not change. These tests do not establish that PDFs consume the new official labels.

## Design and review

The installed pstack skill was `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md`, using the Feature playbook. The work used an isolated branch, subsystem grounding, two independent architecture candidates, one implementation writer, a deslop pass and a fresh comment review before correctness review. All configured models were GPT-family; no cross-family review is claimed.

Model the Domain led to an explicit version union and reuse of the existing Catalogue structure. The alternative projected label map required another format and a crop-reference collector. The selected design stores the bounded public catalogue instead. Prove It Works led to database and browser checks in addition to schema tests.

The comment review found no added comments, suppressions or actionable findings. Two obsolete comment blocks were removed when their private capability parser and shared version threshold were deleted. The native Comment Sicko agent type was unavailable, so a fresh GPT reviewer performed the scoped equivalent.

An independent GPT reviewer passed implementation commit `6ccb892abc52a0d565622321bdaea39a66c73c69` against `73e1b6fdd4302d1015aa2a78990842957f6cf1b7` with no actionable correctness findings. The reviewer inspected the entire 26-file implementation diff and independently ran 92 contract, worker and storage tests, all passing. Subsequent commits add only this evidence and the separate F4 review.

## F4 handoff and limits

The [contract guide](../../contracts.md#saved-snapshot-compatibility-and-f4-handoff) documents the new exports, version 2 fixtures and label lookup. The [independent F4 review](f4-review.md) records the reproducible no-plan PDF leap-day error and existing component checks. Official PDF label consumption and the leap-day correction remain F4 work.

New readers accept versions 1 and 2. Old readers cannot read version 2; update web readers before enabling new worker writes. This follow-up performs no deployment or database migration and does not close F4 or I3. Safari, Firefox, real device usability, full Unicode PDF names and assembled live flows were not verified here.
