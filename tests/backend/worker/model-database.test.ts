import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { defaultEngineSettings, parseCropPurposeId, parseIsoDate } from "@/contracts";
import type { FrozenRun } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { calculate } from "@/engine";
import { readRegistryRelease } from "@/registry";
import { createPgJobStore } from "@/server/jobs";
import { runWorkerOnce } from "@/server/runtime";
import { recordedSnapshots } from "../../integration/science/harness";

const connectionString = process.env.TEST_DATABASE_URL;
describe.skipIf(!connectionString)("modeled worker on PostgreSQL and frozen NASA records", () => {
  const schema = "model_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString });
  let pool: Pool;
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
    await pool.query(await readFile(new URL("../../../migrations/001-jobs.sql", import.meta.url), "utf8"));
  });
  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  it("persists the actual NASA-based engine result and exact normalized climate identity", async () => {
    const snapshots = recordedSnapshots("bangkok");
    const jobs = createPgJobStore(pool);
    const registry = readRegistryRelease();
    const input = { ...inputFixture, planningStart: parseIsoDate("2027-06-01"),
      field: { ring: [[100.49, 13.74], [100.51, 13.74], [100.51, 13.76], [100.49, 13.76], [100.49, 13.74]] as const, lookup: [100.5, 13.75] as const, label: "Public Bangkok test cell" },
      cropPurposeIds: [parseCropPurposeId("maize-grain")], history: { kind: "skipped" as const } };
    const now = "2026-11-15T00:00:00.000Z";
    const capability = await jobs.create({ input, registry: registry.identity, cutoff: snapshots[0].cutoff, createdAt: now });
    const deps = { jobs, climateCache: { read: async () => null, put: async () => {} }, prepareClimate: async () => ({ kind: "ready" as const, snapshots }),
      readRegistryRelease, calculate, settings: { ...defaultEngineSettings, gridExpansionLimit: 0, scoredCandidateLimit: 0 }, workerId: "model-database-test", leaseSeconds: 60, now: () => now };
    expect((await runWorkerOnce(deps)).kind).toBe("completed");
    const saved = await jobs.get(capability);
    expect(saved).toMatchObject({ state: "completed", snapshot: { schemaVersion: 3 } });
    if (saved?.state !== "completed") throw new Error("Expected modeled result.");
    expect(["plan", "plan_with_warnings"]).toContain(saved.snapshot.result.state);
    const stored = await pool.query<{ frozen_run: FrozenRun }>("SELECT frozen_run FROM jobs WHERE id = $1", [capability.jobId]);
    const frozen = stored.rows[0].frozen_run;
    expect(frozen.manifest.schemaVersion).toBe(2);
    if (frozen.manifest.schemaVersion !== 2) return;
    expect(frozen.manifest.climateArtifactHashes).toHaveLength(snapshots.length);
    expect(frozen.manifest.climateContentHashes).toEqual(snapshots.map(snapshot => snapshot.contentHash));
    expect(calculate(frozen, registry)).toEqual(saved.snapshot.result);
  }, 20_000);
});
