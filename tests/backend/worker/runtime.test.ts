import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { resultFixtures } from "@/fixtures/results";
import { climateSnapshotFixture, syntheticRegistryFixture } from "@/fixtures/science";
import { readRegistryRelease } from "@/registry";
import { releasedRegistrySchema } from "@/contracts";
import type { RuntimeDependencies } from "@/server/runtime";
import { runWorkerLoop, runWorkerOnce } from "@/server/runtime";
import { executeInThread } from "../../../scripts/worker";
import { dependencies, MemoryJobs, snapshot } from "./support";

describe("injected durable worker", () => {
  it.each(Object.values(resultFixtures))("preserves result state $state", async result => {
    const jobs = new MemoryJobs();
    const calculate = vi.fn<RuntimeDependencies["calculate"]>(() => result);
    expect(await runWorkerOnce({ ...dependencies(jobs), calculate })).toEqual({ kind: "completed", jobId: jobs.capability.jobId });
    expect(jobs.state.state).toBe("completed");
    if (jobs.state.state === "completed") expect(jobs.state.snapshot.result).toEqual(result);
    expect(calculate).toHaveBeenCalledOnce();
    expect(jobs.frozenRun?.manifest.climateSnapshotIds).toEqual([snapshot.id]);
    expect(jobs.frozenRun?.manifest.normalizedInputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await runWorkerOnce(dependencies(jobs))).toEqual({ kind: "idle" });
    expect(jobs.completions).toBe(1);
    if (!jobs.lease) throw new Error("Expected a lease.");
    expect(await jobs.complete(jobs.lease, result, dependencies().now())).toBe(false);
  });

  it("freezes missing coverage and lets the deterministic engine assess both first attempt and replay", async () => {
    const jobs = new MemoryJobs();
    jobs.crashAfterFreeze = true;
    const prepareClimate = vi.fn(async () => ({ kind: "unavailable" as const, reason: "No observations.", snapshots: [] }));
    const calculate = vi.fn<RuntimeDependencies["calculate"]>(run => {
      expect(run.climate).toEqual([]);
      return resultFixtures.insufficient_data;
    });
    expect((await runWorkerOnce({ ...dependencies(jobs), prepareClimate, calculate })).kind).toBe("lost_lease");
    jobs.crashAfterFreeze = false;
    jobs.rejectRenewal = false;
    expect((await runWorkerOnce({ ...dependencies(jobs), prepareClimate, calculate, now: () => "2026-01-01T00:02:00.000Z" })).kind).toBe("completed");
    expect(prepareClimate).toHaveBeenCalledOnce();
    expect(calculate).toHaveBeenCalledOnce();
    expect(jobs.state.state === "completed" && jobs.state.snapshot.result.state).toBe("insufficient_data");
    const firstAttempt = new MemoryJobs();
    await runWorkerOnce({ ...dependencies(firstAttempt), prepareClimate, calculate });
    expect(firstAttempt.state.state === "completed" && firstAttempt.state.snapshot.result).toEqual(jobs.state.state === "completed" && jobs.state.snapshot.result);
  });

  it("records a provider outage without presenting missing scientific coverage", async () => {
    const jobs = new MemoryJobs();
    const failure = { code: "retrieval_failed", message: "Provider unavailable.", retryable: true } as const;
    const calculate = vi.fn();
    expect(await runWorkerOnce({ ...dependencies(jobs), calculate, prepareClimate: async () => ({ kind: "failed", failure, snapshots: [] }) })).toEqual({ kind: "failed", jobId: jobs.capability.jobId, failure });
    expect(calculate).not.toHaveBeenCalled();
    expect(jobs.frozenRun).toBeNull();
    expect(jobs.state).toEqual({ state: "failed", failure });
  });

  it("replays immutable snapshots, cutoff, registry, and settings after a crash", async () => {
    const jobs = new MemoryJobs();
    jobs.crashAfterFreeze = true;
    const prepareClimate = vi.fn(dependencies().prepareClimate);
    expect((await runWorkerOnce({ ...dependencies(jobs), prepareClimate })).kind).toBe("lost_lease");
    const frozen = structuredClone(jobs.frozenRun);
    jobs.crashAfterFreeze = false;
    jobs.rejectRenewal = false;
    const calculate = vi.fn<RuntimeDependencies["calculate"]>(() => resultFixtures.plan);
    const changed = { ...dependencies(jobs).settings, version: "changed-settings" };
    expect((await runWorkerOnce({ ...dependencies(jobs), prepareClimate, calculate, settings: changed, now: () => "2026-01-01T00:02:00.000Z" })).kind).toBe("completed");
    expect(prepareClimate).toHaveBeenCalledOnce();
    expect(calculate.mock.calls[0]?.[0]).toEqual(frozen);
    expect(Object.isFrozen(calculate.mock.calls[0]?.[0])).toBe(true);
    expect(Object.isFrozen(calculate.mock.calls[0]?.[0]?.climate)).toBe(true);
  });

  it("rejects a missing exact registry release on replay", async () => {
    const jobs = new MemoryJobs();
    jobs.crashAfterFreeze = true;
    await runWorkerOnce(dependencies(jobs));
    jobs.rejectRenewal = false;
    const calculate = vi.fn();
    const result = await runWorkerOnce({ ...dependencies(jobs), calculate, now: () => "2026-01-01T00:02:00.000Z", readRegistryRelease: () => { throw new RangeError("Release removed."); } });
    expect(result.kind).toBe("failed");
    expect(calculate).not.toHaveBeenCalled();
  });

  it("rejects synthetic data and registry data at production runtime boundaries", async () => {
    const jobs = new MemoryJobs();
    expect((await runWorkerOnce({ ...dependencies(jobs), prepareClimate: async () => ({ kind: "ready", snapshots: [climateSnapshotFixture] }) })).kind).toBe("failed");
    const other = new MemoryJobs();
    const wrongReader = () => releasedRegistrySchema.parse(syntheticRegistryFixture);
    expect((await runWorkerOnce({ ...dependencies(other), readRegistryRelease: wrongReader })).kind).toBe("failed");
  });

  it("fences a lease lost during retrieval", async () => {
    const jobs = new MemoryJobs();
    const result = await runWorkerOnce({
      ...dependencies(jobs), leaseSeconds: 0.03,
      prepareClimate: async () => { jobs.rejectRenewal = true; await delay(30); return { kind: "ready", snapshots: [snapshot] }; },
    });
    expect(result.kind).toBe("lost_lease");
    expect(jobs.frozenRun).toBeNull();
    expect(jobs.completions).toBe(0);
  });

  it("allows a replacement owner to complete while the expired worker is still retrieving", async () => {
    const jobs = new MemoryJobs();
    let now = "2026-01-01T00:00:00.000Z";
    let finishRetrieval = () => {};
    const pending = new Promise<void>(resolve => { finishRetrieval = resolve; });
    const firstPreparation = vi.fn(async () => { await pending; return { kind: "ready" as const, snapshots: [snapshot] }; });
    const first = runWorkerOnce({ ...dependencies(jobs), now: () => now, prepareClimate: firstPreparation });
    await vi.waitFor(() => { expect(firstPreparation).toHaveBeenCalledOnce(); });
    now = "2026-01-01T00:02:00.000Z";
    const second = await runWorkerOnce({ ...dependencies(jobs), now: () => now, workerId: "replacement-worker" });
    expect(second.kind).toBe("completed");
    finishRetrieval();
    expect((await first).kind).toBe("lost_lease");
    expect(jobs.completions).toBe(1);
  });

  it("fences a lease lost during asynchronous calculation", async () => {
    const jobs = new MemoryJobs();
    const result = await runWorkerOnce({
      ...dependencies(jobs), leaseSeconds: 0.03,
      executeCalculation: async () => { jobs.rejectRenewal = true; await delay(30); return resultFixtures.plan; },
    });
    expect(result.kind).toBe("lost_lease");
    expect(jobs.completions).toBe(0);
  });

  it("fences synchronous calculations that block the heartbeat past lease expiry", async () => {
    const jobs = new MemoryJobs();
    let now = "2026-01-01T00:00:00.000Z";
    const result = await runWorkerOnce({
      ...dependencies(jobs), now: () => now,
      calculate: () => { now = "2026-01-01T00:02:00.000Z"; return resultFixtures.plan; },
    });
    expect(result.kind).toBe("lost_lease");
    expect(jobs.completions).toBe(0);
  });

  it("renews the lease while the production thread adapter executes blocking calculation", async () => {
    const jobs = new MemoryJobs();
    const renew = vi.spyOn(jobs, "renew");
    const result = await runWorkerOnce({
      ...dependencies(jobs), leaseSeconds: 0.3, now: () => new Date().toISOString(),
      executeCalculation: (run, registry) => executeInThread(run, registry, fileURLToPath(new URL("./slow-engine.ts", import.meta.url))),
    });
    expect(result.kind).toBe("completed");
    expect(renew.mock.calls.length).toBeGreaterThan(5);
  });

  it("drains a current tick and stops claiming after shutdown", async () => {
    const jobs = new MemoryJobs();
    const stopping = new AbortController();
    const onTick = vi.fn();
    await runWorkerLoop({ dependencies: { ...dependencies(jobs), executeCalculation: async () => { stopping.abort(); await delay(5); return resultFixtures.plan; } }, signal: stopping.signal, pollMilliseconds: 1000, onTick });
    expect(jobs.completions).toBe(1);
    expect(onTick).toHaveBeenCalledOnce();
    expect(jobs.sequence).toBe(1);
  });
});
