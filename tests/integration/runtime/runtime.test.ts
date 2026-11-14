import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { defaultEngineSettings, parseIsoDate } from "@/contracts";
import type { JobCapability } from "@/contracts";
import { createPlannerClient } from "@/client/planner";
import { createPgClimateCache } from "@/server/cache";
import { createPrepareClimate } from "@/server/climate";
import { createPgJobStore, hashNormalizedInput } from "@/server/jobs";
import { runWorkerOnce } from "@/server/runtime";
import { verifyRestartedPipeline } from "./acceptance";
import { calculate } from "./controlled-engine";
import { controlledRegistry, cutoff, database, freezeLeaseSeconds, frozenEvidence, frozenRun, input, poolForSchema, savedPreparation, savedProviderFetcher, startProcess } from "./support";

describe.skipIf(!process.env.I1_TEST_DATABASE_URL)("I1 real adapters with controlled scientific calculations", () => {
  let db: Awaited<ReturnType<typeof database>>;
  beforeAll(async () => { db = await database(); });
  afterAll(async () => { await db?.close(); });

  it("preserves the entire real NASA frozen run across a killed separate worker and web restart", async () => {
    let web = startProcess({ ...db, mode: "web-controlled" });
    const ready = z.object({ port: z.number() }).parse(await web.event("web_ready"));
    const baseUrl = "http://127.0.0.1:" + ready.port;
    const client = createPlannerClient({ baseUrl });
    const processes = [web];
    const capabilityTokens = new Set<string>();
    const unauthorized = async (capability: JobCapability) => {
      capabilityTokens.add(capability.token);
      const other = await client.submit(input);
      assert.equal(other.kind, "accepted");
      if (other.kind !== "accepted") throw new Error("Second capability not created.");
      capabilityTokens.add(other.capability.token);
      try {
        for (const method of ["GET", "DELETE"]) {
          for (const token of [undefined, "incorrect-token", other.capability.token]) {
            const response = await fetch(baseUrl + "/api/plans/" + capability.jobId, { method, headers: token ? { Authorization: "Bearer " + token } : {} });
            expect(response.status).toBe(404);
            expect(await response.json()).toMatchObject({ error: { code: "not_found" } });
          }
        }
        expect((await client.read(capability)).state).not.toBe("failed");
      } finally { await client.remove(other.capability); }
    };
    try {
      const evidence = await verifyRestartedPipeline({
        client, input, expectedState: "insufficient_data", rejectUnauthorized: unauthorized,
        freezeAndCrash: async capability => {
          const worker = startProcess({ ...db, mode: "worker-freeze" });
          processes.push(worker);
          await worker.event("frozen");
          const frozen = await frozenEvidence(db.pool, capability);
          expect(frozen.manifest.normalizedInputHash).toBe(hashNormalizedInput(input));
          expect(frozen.providerSnapshots).toBe(3);
          expect(frozen.firstDate).toBe("2000-06-30");
          expect(frozen.lastDate).toBe("2026-06-30");
          expect(await worker.stop("SIGKILL")).toEqual({ code: null, signal: "SIGKILL" });
          await delay(freezeLeaseSeconds * 1000 + 100);
          return frozen;
        },
        finishAfterRestart: async capability => {
          const worker = startProcess({ ...db, mode: "worker-replay" });
          processes.push(worker);
          expect((await worker.event("tick")).kind).toBe("completed");
          expect(await worker.exit()).toEqual({ code: 0, signal: null });
          const state = await client.read(capability);
          assert.equal(state.state, "completed");
          if (state.state !== "completed") throw new Error("Restart did not complete.");
          expect(state.snapshot.result.details.explanation).toContain("Controlled adapter evidence only");
          return state.snapshot;
        },
        readFrozen: capability => frozenEvidence(db.pool, capability),
        restartWeb: async () => {
          expect((await web.stop()).code).toBe(0);
          web = startProcess({ ...db, mode: "web-controlled", extra: [String(ready.port)] });
          processes.push(web);
          await web.event("web_ready");
        },
        assertPrivateLogs: async capability => {
          const logs = processes.map(process => process.logs()).join("\n");
          for (const privateValue of [...capabilityTokens, capability.token, db.connectionString, input.field.label, ...input.field.ring.flatMap(point => point.map(String)), JSON.stringify(input.field.lookup), JSON.stringify(input.field.ring), JSON.stringify(input)]) expect(logs).not.toContain(privateValue);
        },
      });
      expect(evidence.workerRestartPreservedFrozenRun).toBe(true);
      expect(evidence.webRestartPreservedResult).toBe(true);
    } finally { await Promise.all(processes.map(process => process.stop())); }
  }, 60000);

  it("rejects every stale lease operation, frozen identity mutation, and expired capability", async () => {
    const jobs = createPgJobStore(db.pool);
    const old = "2026-11-10T00:00:00.000Z";
    const capability = await jobs.create({ input, registry: controlledRegistry.identity, cutoff, createdAt: old });
    const claims = await Promise.all(["stale-worker-a", "stale-worker-b"].map(workerId => jobs.claim({ workerId, now: old, leaseSeconds: 1 })));
    expect(claims.filter(claim => claim !== null)).toHaveLength(1);
    const first = claims.find(claim => claim !== null);
    assert.ok(first);
    const nextTime = "2026-11-10T00:00:02.000Z";
    const second = await jobs.claim({ workerId: "replacement-worker", now: nextTime, leaseSeconds: 60 });
    assert.ok(second);
    expect(second.lease.leaseId).not.toBe(first.lease.leaseId);
    const climate = await (await savedPreparation())({ input, cutoff, settings: defaultEngineSettings, cache: createPgClimateCache(db.pool) });
    const run = frozenRun(climate.snapshots, hashNormalizedInput(input));
    const failure = { code: "processing_failed", message: "Controlled stale worker failure.", retryable: false } as const;
    expect(await jobs.renew(first.lease, nextTime, 60)).toBe(false);
    expect(await jobs.freeze(first.lease, run, nextTime)).toBe(false);
    expect(await jobs.complete(first.lease, calculate(run), nextTime)).toBe(false);
    expect(await jobs.fail(first.lease, failure, nextTime)).toBe(false);
    expect(await jobs.freeze(second.lease, run, nextTime)).toBe(true);
    expect(await jobs.freeze(second.lease, { ...run, settings: { ...run.settings, targetSeasons: 24 } }, nextTime)).toBe(false);
    await expect(db.pool.query("UPDATE jobs SET frozen_run = frozen_run || '{\"settings\":{}}'::jsonb WHERE id = $1", [capability.jobId])).rejects.toThrow("Frozen run is immutable");
    expect(await jobs.complete(second.lease, calculate(run), nextTime)).toBe(true);
    const recent = await jobs.create({ input, registry: controlledRegistry.identity, cutoff, createdAt: "2026-11-14T00:00:00Z" });
    expect(await jobs.purgeExpired("2026-11-11T00:00:02.000Z")).toBe(0);
    expect(await jobs.purgeExpired("2026-11-11T00:00:02.001Z")).toBe(1);
    expect(await jobs.get(capability)).toBeNull();
    expect(await jobs.get(recent)).toEqual({ state: "queued" });
    const web = startProcess({ ...db, mode: "web-controlled" });
    try {
      const { port } = z.object({ port: z.number() }).parse(await web.event("web_ready"));
      for (const method of ["GET", "DELETE"]) {
        const response = await fetch("http://127.0.0.1:" + port + "/api/plans/" + capability.jobId, { method, headers: { Authorization: "Bearer " + capability.token } });
        expect(response.status).toBe(404);
      }
      expect(await createPlannerClient({ baseUrl: "http://127.0.0.1:" + port }).read(recent)).toEqual({ state: "queued" });
    } finally { await web.stop(); }
    await jobs.delete(recent);
  }, 30000);

  it("persists concurrent independent NASA preparers and distinct cutoff identities without mutation", async () => {
    const isolated = await database();
    const secondPool = poolForSchema(isolated.connectionString, isolated.schema);
    try {
      const firstCache = createPgClimateCache(isolated.pool);
      const secondCache = createPgClimateCache(secondPool);
      const fetcher = await savedProviderFetcher();
      const first = createPrepareClimate({ fetch: fetcher, now: () => new Date("2026-11-14T01:00:00Z") });
      const second = createPrepareClimate({ fetch: fetcher, now: () => new Date("2026-11-14T01:01:00Z") });
      const args = { input, cutoff, settings: defaultEngineSettings };
      const results = await Promise.all([
        first({ ...args, cache: { read: async () => null, put: firstCache.put } }),
        second({ ...args, cache: { read: async () => null, put: secondCache.put } }),
      ]);
      expect(results.map(result => result.kind)).toEqual(["ready", "ready"]);
      expect(results[0].snapshots.map(snapshot => snapshot.contentHash)).toEqual(results[1].snapshots.map(snapshot => snapshot.contentHash));
      expect(new Set(results.flatMap(result => result.snapshots.map(snapshot => snapshot.id))).size).toBe(6);
      expect((await isolated.pool.query("SELECT count(*)::int AS count FROM gilir_climate_snapshots")).rows[0].count).toBe(6);
      const cached = createPrepareClimate({ fetch: async () => { throw new Error("A cache hit must not fetch NASA."); } });
      const same = await cached({ ...args, cache: firstCache });
      const changed = await cached({ ...args, cutoff: parseIsoDate("2026-11-15"), cache: secondCache });
      expect(same.kind).toBe("ready");
      expect(changed.kind).toBe("ready");
      expect(same.snapshots.map(snapshot => snapshot.contentHash)).toEqual(changed.snapshots.map(snapshot => snapshot.contentHash));
      for (let index = 0; index < same.snapshots.length; index++) {
        expect(same.snapshots[index].id).not.toBe(changed.snapshots[index].id);
        expect(changed.snapshots[index].cutoff).toBe("2026-11-15");
      }
    } finally { await secondPool.end(); await isolated.close(); }
  }, 30000);

  it("distinguishes controlled provider outage from missing rain while keeping failure and no-plan states separate", async () => {
    const isolated = await database();
    try {
      const jobs = createPgJobStore(isolated.pool);
      const cache = createPgClimateCache(isolated.pool);
      const request = await savedProviderFetcher();
      let attempts = 0;
      const outage = createPrepareClimate({ fetch: async () => { attempts++; return new Response("Controlled outage", { status: 503 }); }, sleep: async () => {} });
      const options = { jobs, climateCache: cache, readRegistryRelease: () => controlledRegistry, calculate, settings: defaultEngineSettings, workerId: "i1-failure", leaseSeconds: 60, now: () => new Date().toISOString() };
      const failed = await jobs.create({ input, registry: controlledRegistry.identity, cutoff, createdAt: options.now() });
      expect(await runWorkerOnce({ ...options, prepareClimate: outage })).toMatchObject({ kind: "failed", failure: { code: "retrieval_failed", retryable: true } });
      expect(attempts).toBe(3);
      expect(await jobs.get(failed)).toMatchObject({ state: "failed", failure: { code: "retrieval_failed" } });
      await jobs.delete(failed);
      const missing = createPrepareClimate({ fetch: async url => {
        const response = await request(url);
        if (!String(url).includes("IMERG_PRECTOT")) return response;
        const body = z.object({ properties: z.object({ parameter: z.record(z.string(), z.record(z.string(), z.number())) }).passthrough() }).passthrough().parse(await response.json());
        body.properties.parameter.IMERG_PRECTOT = Object.fromEntries(Object.keys(body.properties.parameter.IMERG_PRECTOT).map(date => [date, -999]));
        return Response.json(body);
      } });
      const prepared = await missing({ input, cutoff, settings: defaultEngineSettings, cache });
      expect(prepared.kind).toBe("unavailable");
      expect(prepared.snapshots[2].days.every(day => day.rainMm.kind === "unavailable")).toBe(true);
      const noPlan = await jobs.create({ input, registry: controlledRegistry.identity, cutoff, createdAt: options.now() });
      expect(await runWorkerOnce({ ...options, prepareClimate: missing })).toMatchObject({ kind: "completed" });
      expect(await jobs.get(noPlan)).toMatchObject({ state: "completed", snapshot: { result: { state: "insufficient_data" } } });
      await jobs.delete(noPlan);
    } finally { await isolated.close(); }
  }, 30000);
});
