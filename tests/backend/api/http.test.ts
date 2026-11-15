import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createPlanApi } from "@/server/jobs/http";
import { createPgJobStore, DatabaseNotConfiguredError, hashNormalizedInput } from "@/server/jobs";
import { createPlannerClient } from "@/client/planner";
import { inputFixture } from "@/fixtures/input";
import { frozenRunFixture, syntheticRegistryFixture } from "@/fixtures/science";
import { resultFixtures } from "@/fixtures/results";
import { parsePlanResult } from "@/contracts/result";
import { frozenJobRunFixture } from "../jobs/fixtures";
import type { JobStore } from "@/contracts/jobs";

describe.skipIf(!process.env.TEST_DATABASE_URL)("HTTP planning API over PostgreSQL", () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  const schema = "http_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString });
  let pool: Pool;
  let store: JobStore;
  let base: string;
  let api: ReturnType<typeof createPlanApi>;
  const server = createServer(async (incoming, outgoing) => {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) value.forEach(item => headers.append(key, item));
      else if (value !== undefined) headers.set(key, value);
    }
    const request = new Request(base + incoming.url, {
      method: incoming.method,
      headers,
      body: incoming.method === "GET" ? undefined : Buffer.concat(chunks),
    });
    const response = await api(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
    await pool.query(await readFile(new URL("../../../migrations/001-jobs.sql", import.meta.url), "utf8"));
    store = createPgJobStore(pool);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No HTTP server address.");
    base = "http://127.0.0.1:" + address.port;
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE jobs");
    api = createPlanApi({ store, readRegistry: () => syntheticRegistryFixture, now: () => new Date("2026-11-14T12:00:00Z") });
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await pool?.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  const post = (input: unknown) => fetch(base + "/api/plans", { method: "POST", body: JSON.stringify(input) });

  test("catalogue and real client submit, poll, isolate and delete", async () => {
    const client = createPlannerClient({ baseUrl: base });
    expect(await client.catalogue()).toEqual(syntheticRegistryFixture.catalogue);
    const response = await post(inputFixture);
    expect(response.status).toBe(202);
    const submission = await client.submit(inputFixture);
    if (submission.kind !== "accepted") throw new Error("Expected an accepted job.");
    expect(await client.read(submission.capability)).toEqual({ state: "queued" });
    const path = base + "/api/plans/" + submission.capability.jobId;
    const missing = await fetch(path);
    const wrong = await fetch(path, { headers: { Authorization: "Bearer wrong-token" } });
    expect(missing.status).toBe(404);
    expect(wrong.status).toBe(404);
    expect(await missing.json()).toEqual(await wrong.json());
    expect((await fetch(path, { method: "DELETE", headers: { Authorization: "Bearer wrong-token" } })).status).toBe(404);
    await expect(client.read({ ...submission.capability, token: "wrong-token" })).rejects.toMatchObject({ failure: { code: "not_found" } });
    await client.remove(submission.capability);
    expect(await store.get(submission.capability)).toBeNull();
  });

  test("rejects schema, catalogue membership, self intersections and unsupported topology", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ ...inputFixture, cropPurposeIds: ["unknown"] })).status).toBe(400);
    const crossing = { ...inputFixture, field: { ...inputFixture.field, ring: [[100, 15], [100.03, 15.03], [100, 15.03], [100.02, 15], [100, 15]], lookup: [100.005, 15.025] } };
    expect((await post(crossing)).status).toBe(400);
    expect((await post({ ...inputFixture, field: { ...inputFixture.field, holes: [] } })).status).toBe(400);
    expect((await fetch(base + "/api/plans", { method: "POST", body: "{" })).status).toBe(400);
  });

  test("rejects every retired priority before inserting a job", async () => {
    for (const priority of ["water", "soil", "bad_year", "pests_weeds"]) {
      const response = await post({ ...inputFixture, priority });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ kind: "invalid" });
    }
    expect((await pool.query("SELECT count(*)::int AS count FROM jobs")).rows[0].count).toBe(0);
  });

  test.each([1, 2])("persists immutable input and frozen identity and reads a version %i four-component result over HTTP", async schemaVersion => {
    api = createPlanApi({ store, readRegistry: () => syntheticRegistryFixture, dataCutoff: frozenRunFixture.manifest.dataCutoff });
    const client = createPlannerClient({ baseUrl: base });
    const submitted = await client.submit(inputFixture);
    if (submitted.kind !== "accepted") throw new Error("Expected an accepted job.");
    const original = (await pool.query("SELECT input, input_hash FROM jobs WHERE id = $1", [submitted.capability.jobId])).rows[0];
    expect(original.input).toEqual(inputFixture);
    expect(original.input).not.toHaveProperty("priority");
    expect(original.input_hash).toBe(hashNormalizedInput(inputFixture));
    const now = new Date().toISOString();
    const claimed = await store.claim({ workerId: "http-fixture-worker", now, leaseSeconds: 60 });
    if (!claimed) throw new Error("Expected a claimed job.");
    const run = frozenJobRunFixture;
    expect(await store.freeze(claimed.lease, run, now)).toBe(true);
    expect(await store.freeze(claimed.lease, structuredClone(run), now)).toBe(true);
    expect(await store.freeze(claimed.lease, { ...run, manifest: { ...run.manifest, engineVersion: "changed" } }, now)).toBe(false);
    const result = parsePlanResult({ ...resultFixtures.plan, details: {
      ...resultFixtures.plan.details,
      provenance: { ...resultFixtures.plan.details.provenance, manifest: { kind: "available", value: run.manifest } },
    } });
    if (schemaVersion === 2) {
      expect(await store.complete(claimed.lease, { result, catalogue: syntheticRegistryFixture.catalogue }, now)).toBe(true);
    } else {
      const legacy = { schemaVersion, id: submitted.capability.jobId, completedAt: now, input: inputFixture, result };
      await pool.query("UPDATE jobs SET state = 'completed', snapshot = $2::jsonb, terminal_at = $3::timestamptz, lease_owner = NULL, lease_id = NULL, lease_expires_at = NULL WHERE id = $1", [submitted.capability.jobId, JSON.stringify(legacy), now]);
    }
    const state = await client.read(submitted.capability);
    expect(state).toMatchObject({ state: "completed", snapshot: { schemaVersion, input: inputFixture, result } });
    if (state.state !== "completed" || state.snapshot.result.state !== "plan") throw new Error("Expected a completed fixture plan.");
    expect(state.snapshot.result.plan.rankingTuple.components).toHaveLength(4);
    await expect(pool.query("UPDATE jobs SET input = '{}'::jsonb WHERE id = $1", [submitted.capability.jobId])).rejects.toThrow("immutable");
    await expect(pool.query("UPDATE jobs SET input_hash = 'changed' WHERE id = $1", [submitted.capability.jobId])).rejects.toThrow("immutable");
    await expect(pool.query("UPDATE jobs SET frozen_run = '{}'::jsonb WHERE id = $1", [submitted.capability.jobId])).rejects.toThrow("immutable");
    const persisted = (await pool.query("SELECT input, input_hash, frozen_run FROM jobs WHERE id = $1", [submitted.capability.jobId])).rows[0];
    expect(persisted).toEqual({ ...original, frozen_run: run });
    const response = await fetch(base + "/api/plans/" + submitted.capability.jobId, { method: "DELETE", headers: { Authorization: "Bearer " + submitted.capability.token } });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  test("accepts concave and dateline fields without changing their location", async () => {
    for (const field of [
      { ...inputFixture.field, ring: [[100, 15], [100.04, 15], [100.02, 15.02], [100.04, 15.04], [100, 15.04], [100, 15]], lookup: [100.01, 15.02] },
      { ...inputFixture.field, ring: [[179, 10], [-179, 10], [-179, 11], [179, 11], [179, 10]], lookup: [180, 10.5] },
    ]) expect((await post({ ...inputFixture, field })).status).toBe(202);
  });

  test("limits actual body bytes and streams without a content length", async () => {
    const response = await fetch(base + "/api/plans", { method: "POST", body: "x".repeat(65537) });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "payload_too_large" } });
    const streamed = new Request(base + "/api/plans", Object.assign({
      method: "POST",
      body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(65537)); controller.close(); } }),
    }, { duplex: "half" }));
    expect(streamed.headers.has("content-length")).toBe(false);
    expect((await api(streamed)).status).toBe(413);
  });

  test("returns 429 when submission quota is exhausted", async () => {
    api = createPlanApi({ store, readRegistry: () => syntheticRegistryFixture, requestsPerMinute: 1 });
    expect((await post(inputFixture)).status).toBe(202);
    const response = await post(inputFixture);
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: { code: "rate_limited" } });
  });

  test("returns unavailable failures without exposing database errors", async () => {
    api = createPlanApi({ store: { ...store, create: async () => { throw new Error("secret database detail"); } }, readRegistry: () => syntheticRegistryFixture });
    const response = await post(inputFixture);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
    const unavailable = createPlanApi({ store, readRegistry: () => { throw new Error("Unavailable release"); } });
    expect((await unavailable(new Request(base + "/api/catalogue"))).status).toBe(503);
    api = createPlanApi({ store: { ...store, create: async () => { throw new DatabaseNotConfiguredError(); } }, readRegistry: () => syntheticRegistryFixture });
    expect(await (await post(inputFixture)).json()).toMatchObject({ kind: "unavailable", failure: { code: "not_configured" } });
  });
});
