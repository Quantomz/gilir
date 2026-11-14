# B3 component verification

The B3 worker freezes durable scientific inputs, replays them after a crash, and persists a terminal result while it owns a renewable lease.

## Scope

The implementation starts from published baseline `6e36a76`. This component uses injected `JobStore`, climate preparation, released-registry readers, and calculators. The process tests use invented provider-shaped climate records and synthetic results. They establish component lifecycle behavior.

The real PostgreSQL cases use the local PostgreSQL 18 acceptance database supplied by the coordinator. They establish cache persistence, immutable snapshot identity, concurrent identical writes, mapping updates, and corrupt-data rejection.

## Observed checks

The worker suite passed with 28 tests across three files. The PostgreSQL cases ran with `B3_TEST_DATABASE_URL` set. The command ran with Node 24.22.3.

```sh
B3_TEST_DATABASE_URL="$B3_TEST_DATABASE_URL" npx vitest run tests/backend/worker
```

The six result states arrive unchanged at `JobStore.complete`. Test calculators supply the actual frozen manifest with their synthetic result payloads. The runtime rejects synthetic provenance, an unavailable result manifest, and a manifest that differs from the frozen run. Missing observations freeze and replay the same partial snapshot set. Provider failure reaches `JobStore.fail` without calculation. A simulated crash after freeze preserves snapshots, cutoff, registry identity, and settings while avoiding another climate retrieval. A removed registry release or missing frozen snapshot produces an explicit processing failure.

Lease tests reject publication after retrieval-time renewal failure, calculation-time renewal failure, and synchronous calculation that advances beyond lease expiry. The production calculation-thread adapter runs a 450-millisecond blocking test calculator while the parent continues lease renewals.

The process suite starts a child worker, exits it immediately after the freeze file is durable, and starts a new process that completes from that frozen input. A second process receives `SIGTERM` during calculation, completes its claim, and exits with code 0.

The required `npm run check` and `npm run build` passed. The check run reported 36 passing tests and four PostgreSQL tests skipped because that separate command omitted `B3_TEST_DATABASE_URL`. The explicitly configured worker-suite command ran all four PostgreSQL cases successfully.

`git diff --check` passed. A deslop pass reviewed the runtime, scripts, SQL, tests, and documentation before the implementation commit. Independent correctness and no-comments review passed at `d63694aeea6d91217922b0429b5944e4c7e73b47`. The reviewer independently ran all 28 worker tests, including the four PostgreSQL cases, and the production build.

## Integration evidence

Real B1 durable-job composition, worker readiness against the complete migrated schema, cleanup retention, HTTP delivery, and real NASA plus engine behavior belong to I1 and I2. B1 and B2 are now merged into main and included in this branch. The teammate engine entrypoints remain unimplemented. B3 introduces no production fixture import.

The root package scripts include `worker`, `worker:check`, and `cleanup`. The operations commands use those agreed names. The B1 migration runner supplies the migration command.

The coordinator verifies GitHub CI, independent review, and merge status on the final PR head. This record contains the local component evidence.
