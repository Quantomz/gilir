# B2 workflow record

This worker follows the Feature playbook in `/Users/kyusuku/.codex/skills/poteto-mode/SKILL.md` and `playbooks/feature.md`.

## Playbook checklist

1. `how` over the affected subsystem.
   Complete. The published entrypoint is unimplemented. `ClimatePreparation` separates ready, unavailable, and failed results. Product snapshots flow through an injected `ClimateCache`. B3 owns PostgreSQL composition. E2 owns scientific cohorts and ET0.
2. `architect` for parallel design exploration.
   The frozen public port settles the public shape. Root explicitly retained that shape and scheduled independent review. This worker does not spawn nested agents while all slots are assigned. A product registry and a strict response boundary own the implementation.
3. Write the throughput checkpoint as four todo items. A dimension that genuinely does not apply (single file, no fan-out) keeps its item with `n/a: <reason>` rather than being dropped.
   Complete. The checkpoint is below.
4. Delegate code-writing to a subagent using your configured feature model.
   This worker is the delegated code owner. The playbook explicitly permits a subagent forbidden to spawn to own its diff with independent review separation. Root coordinates that review.
5. Verify on the matching surface. "Inconclusive" or wrong-surface is not a pass. Flag it.
   Complete. Synthetic response-shape behavior tests, saved real provider responses, the real fetch CLI, repository checks, and the production build run on their actual surfaces.
6. Rebase into small, ordered commits. Stack follow-ups.
   One B2 change starts at published shared baseline `6e36a76`. Root owns integration and any rebase onto merged shared work.
7. If the design is contested, `interrogate` before shipping.
   No contested public design. Root found an immutable snapshot identity race during review. This worker accepted it and added a behavioral regression test.
8. Run **Opening a PR**.
   Root owns the PR, independent exact-change review, CI gate, and merge. This worker is explicitly instructed not to push or open a PR.

## Throughput checkpoint

- Blocking first steps. Read the frozen contracts and official NASA grid/unit definitions before implementation. Observe the actual source metadata before choosing version or stream labels.
- Independent workstreams. B2 source files, tests, CLI, and evidence are exclusively owned here. Other backend workers implement the cache port and runtime independently.
- Shared mutable state. Root is the only package, lockfile, contract, and merge writer. No B2 edit touches those files. Native cache requests coalesce within one preparer and cache instance.
- Smallest safe decomposition. One worker owns the product registry, network boundary, normalizer, and tests because they share the same provider invariants. Root supplies independent review after this worker finishes.

## Design choice and principles

The selected shape stores one snapshot per native product cell and requested interval. A combined exact-point snapshot would refetch meteorology and solar observations unnecessarily when only the smaller rainfall cell changes. The existing contract already supports separate snapshots, so no contract amendment is necessary.

Model the Domain changed the implementation into a typed registry of product grids and field conversions. Boundary Discipline and Type System Discipline keep raw provider JSON as unknown until schema validation. Prove It Works changed verification from a seven-day example into two full-period retrievals and replay of the saved source bodies. Sequence Work into Verifiable Units kept component tests ahead of final repository checks. Explain the Number limits the reported season count to daily field completeness, capped by the 25 requested candidates. It does not claim scientific cohort eligibility.

The self deslop pass found no application comments, TypeScript suppressions, `any` casts, synthetic production fallback, or unrelated file edits. The fresh no-comments pass and exact-change peer review remain root-owned review gates. All configured review models are GPT family models. No cross-family review is claimed.
