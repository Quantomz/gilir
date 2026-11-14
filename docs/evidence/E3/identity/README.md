# E3 assessment identity correction

Historical and generated calendars can have identical crop profiles and dates but different released stage allocations. The old search treated them as the same assessment. A valid synthetic case returned the flagged historical baseline even though the generated model had no rainfall mismatch. Direct ranking also discarded the runner-up, and the explanation called a same-date generated winner a kept baseline.

The correction keeps the canonical schedule key for ordering and uses origin plus that key for assessment identity. Different origins retain separate assessments and runner-up evidence. Equal metrics still prefer the eligible baseline. A generated winner is reported as changed even when its date-change list is empty. One additional generated assessment can consume the scoring budget when the two stage allocations happen to match.

This is an E3 follow-up required for E2's origin-specific stage calculation. It changes no shared payload schema, crop data, formula, dependency, or deployed service.

## Verification identity

- Base: `98f3b3260aa17f149febf60d1b41d739324a6111`.
- Failing regression commit: `0349d5fa94041ffbd744de166e2ced4b90356271`.
- Corrected source: `ab8a7e018a61d8e0f1dfbaf96d895f00346e450c`.
- Runtime: Node 24, PostgreSQL 18 in a disposable local database.
- Workflow: `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md`, Bug fix and Shipping. Two architecture candidates were compared. Local independent verification is recorded on the PR; this host has no Cursor cloud agent or specialized Comment Sicko, and its configured reviewers are all GPT-family.

## Executed checks

| Command | Observed result |
| --- | --- |
| `npx vitest run tests/engine/search/identity.test.ts tests/engine/search/ranking.test.ts tests/engine/search/explain.test.ts` before correction | 8 failed, 31 passed. |
| `npx vitest run tests/engine/search` after correction | 156 passed. |
| `npm run typecheck` | Passed. |
| `npm run check` with the three test database variables configured | 303 passed, 1 skipped; typecheck and module boundaries passed. |
| `npm run build` | Passed; production pages and API routes compiled. |
| `git diff --check` | Passed. |

The one skipped test is the opt-in I1 live pipeline, not an E3 failure. The public regression in `tests/engine/search/identity.test.ts` validates the synthetic registry and history, injects deterministic assessment outcomes, and exercises `calculate`, ranking, counters, zero-budget behavior, and explanations. It is component evidence, not a real crop recommendation or deployed result. E2's actual calculator is checked separately after integration. I1 remains open until the released registry, real weather, database, HTTP, and worker pipeline meet its acceptance criteria.
