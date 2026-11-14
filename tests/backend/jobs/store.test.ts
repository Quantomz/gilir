import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { z } from "zod";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createPgJobStore } from "@/server/jobs";
import { inputFixture } from "@/fixtures/input";
import { syntheticRegistryFixture } from "@/fixtures/science";
import { resultFixtures } from "@/fixtures/results";
import { parsePlanResult } from "@/contracts/result";
import { completedJobResultFixture, frozenJobRunFixture } from "./fixtures";
import type { JobCapability, JobStore } from "@/contracts/jobs";

const connectionString = process.env.TEST_DATABASE_URL;
describe.skipIf(!connectionString)("PostgreSQL durable jobs", () => {
  const schema = "b1_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString });
  let pool: Pool;
  let store: JobStore;
  const now = "2026-11-14T00:00:00.000Z";
  const later = "2026-11-14T00:00:31.000Z";
  const run = frozenJobRunFixture;
  const create = () => store.create({ input: inputFixture, registry: syntheticRegistryFixture.identity, cutoff: run.manifest.dataCutoff, createdAt: now });
  const claim = (workerId = "worker-1", at = now) => store.claim({ workerId, now: at, leaseSeconds: 30 });

  beforeAll(async () => {
    const version = await admin.query<{ server_version_num: string }>("SHOW server_version_num");
    expect(Number(version.rows[0].server_version_num)).toBeGreaterThanOrEqual(180000);
    expect(Number(version.rows[0].server_version_num)).toBeLessThan(190000);
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
    await pool.query(await readFile(new URL("../../../migrations/001-jobs.sql", import.meta.url), "utf8"));
    store = createPgJobStore(pool);
  });
  beforeEach(async () => { await pool.query("TRUNCATE jobs"); });
  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });

  test("isolates identical input jobs by random capability and stores hashes only", async () => {
    const first = await create();
    const second = await create();
    expect(first.token).not.toEqual(second.token);
    expect(Buffer.from(first.token, "base64url").length).toBeGreaterThanOrEqual(16);
    expect(await store.get(first)).toEqual({ state: "queued" });
    expect(await store.get({ jobId: first.jobId, token: second.token })).toBeNull();
    expect(await store.get({ jobId: "not-a-uuid", token: first.token })).toBeNull();
    const rows = await pool.query("SELECT token_hash, input FROM jobs WHERE id = $1", [first.jobId]);
    expect(rows.rows[0].token_hash.toString("hex")).not.toEqual(first.token);
    expect(rows.rows[0].input).toEqual(inputFixture);
  });

  test("concurrent claims have one winner and expired leases reject every stale write", async () => {
    await create();
    const claims = await Promise.all(Array.from({ length: 12 }, (_, i) => claim("worker-" + i)));
    const claimed = claims.filter(c => c !== null);
    expect(claimed).toHaveLength(1);
    const first = claimed[0];
    expect(first).toBeTruthy();
    if (!first) throw new Error("Expected a claim");
    expect(await store.renew(first.lease, later, 30)).toBe(false);
    const next = await claim("recovered-worker", later);
    expect(next?.lease.leaseId).not.toEqual(first.lease.leaseId);
    expect(await store.freeze(first.lease, run, later)).toBe(false);
    expect(await store.complete(first.lease, resultFixtures.insufficient_data, later)).toBe(false);
    expect(await store.fail(first.lease, { code: "processing_failed", message: "Synthetic failure.", retryable: false }, later)).toBe(false);
  });

  test("freezes the created input, registry, cutoff and complete manifest once", async () => {
    await create();
    const current = await claim();
    if (!current) throw new Error("Expected a claim");
    expect(await store.complete(current.lease, resultFixtures.insufficient_data, now)).toBe(false);
    expect(await store.freeze(current.lease, { ...run, manifest: { ...run.manifest, normalizedInputHash: "changed" } }, now)).toBe(false);
    expect(await store.freeze(current.lease, { ...run, input: { ...run.input, water: "unsure" } }, now)).toBe(false);
    expect(await store.freeze(current.lease, { ...run, manifest: { ...run.manifest, catalogueVersion: "changed" } }, now)).toBe(false);
    expect(await store.freeze(current.lease, { ...run, manifest: { ...run.manifest, dataCutoff: inputFixture.planningStart } }, now)).toBe(false);
    expect(await store.freeze(current.lease, { ...run, manifest: { ...run.manifest, climateSnapshotIds: [] } }, now)).toBe(false);
    expect(await store.freeze(current.lease, run, now)).toBe(true);
    expect(await store.freeze(current.lease, structuredClone(run), now)).toBe(true);
    expect(await store.freeze(current.lease, { ...run, manifest: { ...run.manifest, engineVersion: "changed" } }, now)).toBe(false);
    expect(await store.freeze(current.lease, { ...run, settings: { ...run.settings, targetSeasons: 2 } }, now)).toBe(false);
  });

  test("a new connection recovers the frozen run and completes atomically", async () => {
    const capability = await create();
    const first = await claim();
    if (!first) throw new Error("Expected a claim");
    expect(await store.freeze(first.lease, run, now)).toBe(true);
    await pool.end();
    pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
    store = createPgJobStore(pool);
    const recovered = await claim("after-restart", later);
    expect(recovered?.frozenRun).toEqual(run);
    if (!recovered) throw new Error("Expected recovery");
    expect(await store.renew(recovered.lease, later, 60)).toBe(true);
    expect(await store.complete(recovered.lease, completedJobResultFixture, later)).toBe(true);
    const state = await store.get(capability);
    expect(state).toMatchObject({ state: "completed", snapshot: { id: capability.jobId, input: inputFixture, result: completedJobResultFixture, completedAt: later } });
    expect(await store.fail(recovered.lease, { code: "processing_failed", message: "Too late.", retryable: false }, later)).toBe(false);
    expect(await store.claim({ workerId: "extra", now: later, leaseSeconds: 30 })).toBeNull();
  });

  test("authorized deletion removes only its job", async () => {
    const first = await create();
    const second = await create();
    expect(await store.delete({ jobId: first.jobId, token: second.token })).toBe(false);
    expect(await store.delete(first)).toBe(true);
    expect(await store.get(first)).toBeNull();
    expect(await store.get(second)).toEqual({ state: "queued" });
  });

  test("independent Node processes preserve a submitted frozen job and completion", async () => {
    async function runProcess(command: { mode: "create" } | { mode: "complete"; capability: JobCapability }): Promise<unknown> {
      const child = fork(fileURLToPath(new URL("./restart-process.ts", import.meta.url)), [], {
        execArgv: ["--import", "tsx"],
        env: { ...process.env, TEST_JOB_SCHEMA: schema },
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      });
      const errors: Buffer[] = [];
      child.stderr?.on("data", chunk => errors.push(Buffer.from(chunk)));
      let message: unknown;
      child.on("message", value => { message = value; });
      await new Promise<void>((resolve, reject) => {
        child.on("error", reject);
        child.on("exit", code => code === 0 ? resolve() : reject(new Error("Child process failed: " + Buffer.concat(errors).toString())));
        child.send(command);
      });
      return message;
    }
    const capability = z.strictObject({ jobId: z.string().uuid(), token: z.string() }).parse(await runProcess({ mode: "create" }));
    expect(await store.get(capability)).toEqual({ state: "calculating" });
    expect(await runProcess({ mode: "complete", capability })).toMatchObject({ state: "completed", snapshot: { id: capability.jobId, input: inputFixture } });
    expect(await store.get(capability)).toMatchObject({ state: "completed" });
  });

  test("database constraints reject direct input and frozen manifest changes", async () => {
    const capability = await create();
    await expect(pool.query("UPDATE jobs SET cutoff = '2000-01-01' WHERE id = $1", [capability.jobId])).rejects.toThrow("immutable");
    const current = await claim();
    if (!current) throw new Error("Expected a claim");
    await store.freeze(current.lease, run, now);
    await expect(pool.query("UPDATE jobs SET frozen_run = '{}'::jsonb WHERE id = $1", [capability.jobId])).rejects.toThrow("immutable");
  });

  test("completion rejects an unavailable or changed result manifest", async () => {
    const capability = await create();
    const current = await claim();
    if (!current) throw new Error("Expected a claim");
    expect(await store.freeze(current.lease, run, now)).toBe(true);
    expect(await store.complete(current.lease, resultFixtures.insufficient_data, now)).toBe(false);
    const mismatched = {
      ...completedJobResultFixture,
      details: {
        ...completedJobResultFixture.details,
        provenance: {
          ...completedJobResultFixture.details.provenance,
          manifest: { kind: "available", value: { ...run.manifest, engineVersion: "changed" } },
        },
      },
    };
    expect(await store.complete(current.lease, parsePlanResult(mismatched), now)).toBe(false);
    expect(await store.get(capability)).toEqual({ state: "calculating" });
    expect(await store.complete(current.lease, completedJobResultFixture, now)).toBe(true);
  });

  test("expiry removes terminal jobs only after 24 hours", async () => {
    const failed = await create();
    const current = await claim();
    if (!current) throw new Error("Expected a claim");
    expect(await store.fail(current.lease, { code: "processing_failed", message: "Synthetic failure.", retryable: false }, now)).toBe(true);
    const queued = await create();
    expect(await store.purgeExpired("2026-11-15T00:00:00.000Z")).toBe(0);
    expect(await store.purgeExpired("2026-11-15T00:00:00.001Z")).toBe(1);
    expect(await store.get(failed)).toBeNull();
    expect(await store.get(queued)).toEqual({ state: "queued" });
  });
});
