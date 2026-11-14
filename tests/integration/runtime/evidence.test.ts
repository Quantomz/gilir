import { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { climateSnapshotFixture } from "@/fixtures/science";
import { frozenEvidence, frozenRun } from "./support";

it("records the actual synthetic snapshot count before strict acceptance rejects it", async () => {
  const pool = new Pool();
  const run = frozenRun([climateSnapshotFixture], "controlled-input-hash");
  vi.spyOn(pool, "query").mockResolvedValue({ rows: [{ frozen_run: run }] });
  try {
    const evidence = await frozenEvidence(pool, { jobId: "controlled-job", token: "controlled-token" });
    expect(evidence.syntheticSnapshots).toBe(1);
    expect(evidence.providerSnapshots).toBe(0);
  } finally { await pool.end(); }
});
