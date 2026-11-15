import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { resultFixtures } from "@/fixtures/results";
import { climateSnapshotFixture, syntheticRegistryFixture } from "@/fixtures/science";
import { releasedRegistrySchema } from "@/contracts";
import type { RuntimeDependencies } from "@/server/runtime";
import { runWorkerLoop, runWorkerOnce } from "@/server/runtime";
import { executeInThread } from "../../../scripts/worker";
import { controlledRegistry, dependencies, MemoryJobs, resultForRun, snapshot } from "./support";

describe("injected durable worker", () => {
  it.each(Object.values(resultFixtures))("preserves result state $state", async result => {
    const jobs = new MemoryJobs();
    const calculate = vi.fn<RuntimeDependencies["calculate"]>(run => resultForRun(run, result));
    expect(await runWorkerOnce({ ...dependencies(jobs), calculate })).toEqual({ kind: "completed", jobId: jobs.capability.jobId });
    expect(jobs.state.state).toBe("completed");
    if (jobs.state.state === "completed") expect(jobs.state.snapshot.result).toEqual(calculate.mock.results[0]?.value);
    expect(calculate).toHaveBeenCalledOnce();
    expect(jobs.frozenRun?.manifest.climateSnapshotIds).toEqual([snapshot.id]);
    expect(jobs.frozenRun?.manifest.normalizedInputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await runWorkerOnce(dependencies(jobs))).toEqual({ kind: "idle" });
    expect(jobs.completions).toBe(1);
    if (!jobs.lease) throw new Error("Expected a lease.");
    expect(await jobs.complete(jobs.lease, { result, catalogue: controlledRegistry.catalogue }, dependencies().now())).toBe(false);
  });

  it("freezes missing coverage and lets the deterministic engine assess both first attempt and replay", async () => {
    const jobs = new MemoryJobs();
    jobs.crashAfterFreeze = true;
    const prepareClimate = vi.fn(async () => ({ kind: "unavailable" as const, reason: "No observations.", snapshots: [] }));
    const calculate = vi.fn<RuntimeDependencies["calculate"]>(run => {
      expect(run.climate).toEqual([]);
      return resultForRun(run, resultFixtures.insufficient_data);
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
    const calculate = vi.fn<RuntimeDependencies["calculate"]>(run => resultForRun(run));
    const changed = { ...dependencies(jobs).settings, version: "changed-settings" };
    expect((await runWorkerOnce({ ...dependencies(jobs), prepareClimate, calculate, settings: changed, now: () => "2026-01-01T00:02:00.000Z" })).kind).toBe("completed");
    expect(prepareClimate).toHaveBeenCalledOnce();
    expect(calculate.mock.calls[0]?.[0]).toEqual(frozen);
    expect(Object.isFrozen(calculate.mock.calls[0]?.[0])).toBe(true);
    expect(Object.isFrozen(calculate.mock.calls[0]?.[0]?.climate)).toBe(true);
  });

  it("pins replay calculation and completion labels even when the default release changes", async () => {
    const jobs = new MemoryJobs();
    jobs.crashAfterFreeze = true;
    await runWorkerOnce(dependencies(jobs));
    const frozenBytes = JSON.stringify(jobs.frozenRun);
    jobs.crashAfterFreeze = false;
    jobs.rejectRenewal = false;
    const changedDefault = releasedRegistrySchema.parse({
      ...controlledRegistry,
      identity: { ...controlledRegistry.identity, catalogueVersion: "worker-controlled-v2" },
      catalogue: { version: "worker-controlled-v2", entries: controlledRegistry.catalogue.entries.map(entry => ({ ...entry, label: "Changed current label" })) },
    });
    const readRegistryRelease = vi.fn<RuntimeDependencies["readRegistryRelease"]>(version => version === undefined ? changedDefault : dependencies(jobs).readRegistryRelease(version));
    const calculate = vi.fn<RuntimeDependencies["calculate"]>((run, registry) => {
      expect(registry).toEqual(controlledRegistry);
      expect(Object.isFrozen(registry.catalogue.entries[0])).toBe(true);
      return resultForRun(run);
    });
    expect((await runWorkerOnce({ ...dependencies(jobs), readRegistryRelease, calculate, now: () => "2026-01-01T00:02:00.000Z" })).kind).toBe("completed");
    expect(readRegistryRelease.mock.calls).toEqual([[controlledRegistry.identity.catalogueVersion]]);
    expect(JSON.stringify(jobs.frozenRun)).toBe(frozenBytes);
    expect(jobs.state.state).toBe("completed");
    if (jobs.state.state !== "completed") throw new Error("Expected replay completion.");
    expect(jobs.state.snapshot.schemaVersion).toBe(2);
    if (jobs.state.snapshot.schemaVersion !== 2) throw new Error("Expected saved catalogue.");
    expect(jobs.state.snapshot.catalogue).toEqual(controlledRegistry.catalogue);
    expect(jobs.state.snapshot.catalogue).not.toEqual(changedDefault.catalogue);
  });

  it.each(["catalogue_version", "release_identity", "duplicate_entries", "missing_selected"] as const)("fails malformed %s completion metadata without reporting a lost lease", async kind => {
    const jobs = new MemoryJobs();
    const badRegistry = releasedRegistrySchema.parse({
      ...controlledRegistry,
      identity: kind === "release_identity" ? { ...controlledRegistry.identity, ruleVersion: "different-rules" } : controlledRegistry.identity,
      catalogue: kind === "catalogue_version" ? { ...controlledRegistry.catalogue, version: "different" }
        : kind === "duplicate_entries" ? { ...controlledRegistry.catalogue, entries: [...controlledRegistry.catalogue.entries, ...controlledRegistry.catalogue.entries] }
        : kind === "missing_selected" ? { ...controlledRegistry.catalogue, entries: [] } : controlledRegistry.catalogue,
    });
    const complete = vi.spyOn(jobs, "complete");
    const result = await runWorkerOnce({ ...dependencies(jobs), readRegistryRelease: () => badRegistry });
    expect(result).toMatchObject({ kind: "failed", failure: { code: "processing_failed" } });
    expect(jobs.state).toMatchObject({ state: "failed", failure: { code: "processing_failed" } });
    expect(complete).not.toHaveBeenCalled();
    expect(jobs.completions).toBe(0);
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

  it("fails a replay with a missing frozen climate snapshot without retrieving another version", async () => {
    const jobs = new MemoryJobs();
    jobs.crashAfterFreeze = true;
    await runWorkerOnce(dependencies(jobs));
    if (!jobs.frozenRun) throw new Error("Expected a durable frozen run.");
    jobs.frozenRun = { ...jobs.frozenRun, climate: [] };
    jobs.rejectRenewal = false;
    const prepareClimate = vi.fn(dependencies().prepareClimate);
    expect((await runWorkerOnce({ ...dependencies(jobs), prepareClimate, now: () => "2026-01-01T00:02:00.000Z" })).kind).toBe("failed");
    expect(prepareClimate).not.toHaveBeenCalled();
    expect(jobs.completions).toBe(0);
  });

  it("rejects synthetic data and registry data at production runtime boundaries", async () => {
    const jobs = new MemoryJobs();
    expect((await runWorkerOnce({ ...dependencies(jobs), prepareClimate: async () => ({ kind: "ready", snapshots: [climateSnapshotFixture] }) })).kind).toBe("failed");
    const other = new MemoryJobs();
    const wrongReader = () => releasedRegistrySchema.parse(syntheticRegistryFixture);
    expect((await runWorkerOnce({ ...dependencies(other), readRegistryRelease: wrongReader })).kind).toBe("failed");
  });

  it("rejects synthetic engine output", async () => {
    const jobs = new MemoryJobs();
    expect((await runWorkerOnce({ ...dependencies(jobs), calculate: () => resultFixtures.plan })).kind).toBe("failed");
    expect(jobs.completions).toBe(0);
  });

  it.each(["unavailable", "mismatched"])("rejects %s result provenance", async kind => {
    const jobs = new MemoryJobs();
    const result = await runWorkerOnce({
      ...dependencies(jobs),
      calculate: run => {
        const calculated = resultForRun(run);
        return {
          ...calculated,
          details: {
            ...calculated.details,
            provenance: {
              ...calculated.details.provenance,
              manifest: kind === "unavailable"
                ? { kind: "unavailable", reason: "Missing run identity." }
                : { kind: "available", value: { ...run.manifest, normalizedInputHash: "different-input" } },
            },
          },
        };
      },
    });
    expect(result.kind).toBe("failed");
    expect(jobs.completions).toBe(0);
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
      executeCalculation: async run => { jobs.rejectRenewal = true; await delay(30); return resultForRun(run); },
    });
    expect(result.kind).toBe("lost_lease");
    expect(jobs.completions).toBe(0);
  });

  it("fences synchronous calculations that block the heartbeat past lease expiry", async () => {
    const jobs = new MemoryJobs();
    let now = "2026-01-01T00:00:00.000Z";
    const result = await runWorkerOnce({
      ...dependencies(jobs), now: () => now,
      calculate: run => { now = "2026-01-01T00:02:00.000Z"; return resultForRun(run); },
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
    await runWorkerLoop({ dependencies: { ...dependencies(jobs), executeCalculation: async run => { stopping.abort(); await delay(5); return resultForRun(run); } }, signal: stopping.signal, pollMilliseconds: 1000, onTick });
    expect(jobs.completions).toBe(1);
    expect(onTick).toHaveBeenCalledOnce();
    expect(jobs.sequence).toBe(1);
  });
});
