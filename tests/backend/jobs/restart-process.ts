import { Pool } from "pg";
import { z } from "zod";
import { createPgJobStore } from "../../../src/server/jobs/index";
import { inputFixture } from "../../../src/fixtures/input";
import { frozenRunFixture, syntheticRegistryFixture } from "../../../src/fixtures/science";
import { completedJobResultFixture, frozenJobRunFixture } from "./fixtures";

const commandSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("create") }),
  z.strictObject({ mode: z.literal("complete"), capability: z.strictObject({ jobId: z.string(), token: z.string() }) }),
]);

process.once("message", async raw => {
  const command = commandSchema.parse(raw);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: "-c search_path=" + process.env.TEST_JOB_SCHEMA });
  const store = createPgJobStore(pool);
  try {
    if (command.mode === "create") {
      const capability = await store.create({ input: inputFixture, registry: syntheticRegistryFixture.identity, cutoff: frozenRunFixture.manifest.dataCutoff, createdAt: "2026-11-14T00:00:00Z" });
      const claim = await store.claim({ workerId: "first-process", now: "2026-11-14T00:00:00Z", leaseSeconds: 30 });
      if (!claim) throw new Error("No claim in first process.");
      const run = frozenJobRunFixture;
      if (!await store.freeze(claim.lease, run, "2026-11-14T00:00:00Z")) throw new Error("Freeze failed.");
      process.send?.(capability);
    } else {
      const claim = await store.claim({ workerId: "second-process", now: "2026-11-14T00:01:00Z", leaseSeconds: 30 });
      if (!claim?.frozenRun) throw new Error("No durable frozen run after process restart.");
      if (!await store.complete(claim.lease, completedJobResultFixture, "2026-11-14T00:01:00Z")) throw new Error("Completion failed.");
      process.send?.(await store.get(command.capability));
    }
  } finally {
    await pool.end();
    process.disconnect?.();
  }
});
