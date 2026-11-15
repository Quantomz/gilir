import { describe, expect, it, vi } from "vitest";
import { calculate } from "@/engine";
import { runWorkerOnce } from "@/server/runtime";
import { snapshot } from "./support";
import { setup } from "../../engine/model/fixtures";
import { MemoryJobs, dependencies } from "./support";

describe("frozen modeled worker execution", () => {
  function configured() {
    const { run, registry, cohort } = setup();
    const jobs = new MemoryJobs(run.input, registry.identity);
    const base = dependencies(jobs);
    return { jobs, deps: { ...base, settings: run.settings, readRegistryRelease: () => registry,
      prepareClimate: vi.fn(async () => ({ kind: "ready" as const, snapshots: [] })),
      calculate: vi.fn((frozen: Parameters<typeof calculate>[0], released: Parameters<typeof calculate>[1]) => calculate(frozen, released, { buildCohort: () => cohort })),
    } };
  }
  it("freezes model and configuration hashes and completes a version-three snapshot", async () => {
    const { jobs, deps } = configured();
    expect((await runWorkerOnce(deps)).kind).toBe("completed");
    expect(jobs.frozenRun?.manifest).toMatchObject({ schemaVersion: 2, engineVersion: "thermal-model-v1", modelReleaseVersion: "test-model-v1", configurationHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(jobs.state).toMatchObject({ state: "completed", snapshot: { schemaVersion: 3, result: { state: "plan" } } });
  });
  it("replays the frozen model settings after a crash even when defaults change", async () => {
    const { jobs, deps } = configured();
    jobs.crashAfterFreeze = true;
    expect((await runWorkerOnce(deps)).kind).toBe("lost_lease");
    const frozen = structuredClone(jobs.frozenRun);
    jobs.crashAfterFreeze = false;
    jobs.rejectRenewal = false;
    expect((await runWorkerOnce({ ...deps, settings: { ...deps.settings, version: "different-current-default", targetSeasons: 50 }, now: () => "2026-01-01T00:02:00.000Z" })).kind).toBe("completed");
    expect(jobs.frozenRun).toEqual(frozen);
    expect(deps.prepareClimate).toHaveBeenCalledOnce();
  });
  it("rejects altered frozen settings whose label was unchanged", async () => {
    const { jobs, deps } = configured();
    jobs.crashAfterFreeze = true;
    await runWorkerOnce(deps);
    if (!jobs.frozenRun) throw new Error("Expected frozen model run.");
    jobs.frozenRun = { ...jobs.frozenRun, settings: { ...jobs.frozenRun.settings, searchGridStepDays: 1 } };
    jobs.crashAfterFreeze = false;
    jobs.rejectRenewal = false;
    expect((await runWorkerOnce({ ...deps, now: () => "2026-01-01T00:02:00.000Z" })).kind).toBe("failed");
    expect(deps.calculate).not.toHaveBeenCalled();
  });
  it("rejects altered normalized climate while retaining the raw-response hash", async () => {
    const { jobs, deps } = configured();
    const climate = { ...snapshot, contentHash: "a".repeat(64) };
    jobs.crashAfterFreeze = true;
    await runWorkerOnce({ ...deps, prepareClimate: async () => ({ kind: "ready", snapshots: [climate] }) });
    if (!jobs.frozenRun) throw new Error("Expected frozen climate.");
    jobs.frozenRun = { ...jobs.frozenRun, climate: [{ ...climate, latitudeDeg: 20 }] };
    jobs.crashAfterFreeze = false;
    jobs.rejectRenewal = false;
    expect((await runWorkerOnce({ ...deps, now: () => "2026-01-01T00:02:00.000Z" })).kind).toBe("failed");
    expect(deps.calculate).not.toHaveBeenCalled();
  });
  it("rejects a changed model whose version and hash labels were copied", async () => {
    const { deps } = configured();
    const original = deps.readRegistryRelease();
    const changed = { ...original, modelRelease: { ...original.modelRelease, models: original.modelRelease.models.map((model, index) => index ? model : { ...model, kc: { ...model.kc, middle: 0.9 } }) } };
    expect((await runWorkerOnce({ ...deps, readRegistryRelease: () => changed })).kind).toBe("failed");
    expect(deps.calculate).not.toHaveBeenCalled();
  });
});
