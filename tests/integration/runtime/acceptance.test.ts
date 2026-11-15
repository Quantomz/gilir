import { expect, it, vi } from "vitest";
import type { CompletedSnapshot, CompletedSnapshotV2 } from "@/contracts";
import { defaultEngineSettings } from "@/contracts";
import { historicalPeriod } from "@/server/climate";
import { hashNormalizedInput } from "@/server/jobs";
import type { AcceptanceControls } from "./acceptance";
import { verifyRestartedPipeline } from "./acceptance";
import { calculate as controlledCalculation } from "./controlled-engine";
import { controlledRegistry, frozenRun, input } from "./support";

const controlledCapability = { jobId: "00000000-0000-4000-8000-000000000002", token: "controlled-token" };

function controlledRun() {
  const run = frozenRun([], hashNormalizedInput(input));
  return { ...run, manifest: { ...run.manifest, climateSnapshotIds: ["controlled-only-snapshot"] } };
}

function injectedControls(result: CompletedSnapshot["result"]): AcceptanceControls {
  const run = controlledRun();
  const snapshot: CompletedSnapshotV2 = { schemaVersion: 2, id: controlledCapability.jobId, completedAt: "2026-11-14T12:00:00.000Z", input, result, catalogue: controlledRegistry.catalogue };
  const evidence = { manifest: run.manifest, digest: "controlled-frozen-digest", providerSnapshots: 3, syntheticSnapshots: 0, firstDate: "2000-06-30", lastDate: "2026-06-30", snapshots: [], settings: defaultEngineSettings, requiredSourcePeriod: historicalPeriod(input.planningStart, run.manifest.dataCutoff, run.settings) };
  return {
    input, expectedState: result.state,
    client: { catalogue: async () => controlledRegistry.catalogue, submit: async () => ({ kind: "accepted", capability: controlledCapability }), read: async () => ({ state: "completed", snapshot }), remove: vi.fn(async () => {}) },
    rejectUnauthorized: async () => {}, freezeAndCrash: async () => evidence, finishAfterRestart: async () => snapshot, readFrozen: async () => evidence, restartWeb: async () => {}, assertPrivateLogs: async () => {},
  };
}

function withSavedSnapshot(controls: AcceptanceControls, snapshot: CompletedSnapshot): AcceptanceControls {
  return { ...controls, finishAfterRestart: async () => snapshot, client: { ...controls.client, read: async () => ({ state: "completed", snapshot }) } };
}

it("accepts a controlled v2 completion with the accepted job and frozen catalogue", async () => {
  const controls = injectedControls(controlledCalculation(controlledRun()));
  await expect(verifyRestartedPipeline(controls)).resolves.toMatchObject({ jobId: controlledCapability.jobId, workerRestartPreservedFrozenRun: true, webRestartPreservedResult: true });
  expect(controls.client.remove).toHaveBeenCalledOnce();
});

it("rejects a legacy v1 snapshot as a newly completed job", async () => {
  const controls = injectedControls(controlledCalculation(controlledRun()));
  const { id, completedAt, input, result } = await controls.finishAfterRestart(controlledCapability);
  await expect(verifyRestartedPipeline(withSavedSnapshot(controls, { schemaVersion: 1, id, completedAt, input, result }))).rejects.toThrow(/schemaVersion/);
  expect(controls.client.remove).toHaveBeenCalledOnce();
});

it("rejects a newly completed snapshot for a different job", async () => {
  const controls = injectedControls(controlledCalculation(controlledRun()));
  const snapshot = await controls.finishAfterRestart(controlledCapability);
  await expect(verifyRestartedPipeline(withSavedSnapshot(controls, { ...snapshot, id: "different-job" }))).rejects.toThrow("The completed snapshot must identify the accepted job");
  expect(controls.client.remove).toHaveBeenCalledOnce();
});

it("rejects a newly completed snapshot with a different catalogue identity", async () => {
  const controls = injectedControls(controlledCalculation(controlledRun()));
  const snapshot = await controls.finishAfterRestart(controlledCapability);
  await expect(verifyRestartedPipeline(withSavedSnapshot(controls, { ...snapshot, schemaVersion: 2, catalogue: { ...controlledRegistry.catalogue, version: "different-catalogue" } }))).rejects.toThrow("Catalogue must match the result's run manifest");
  expect(controls.client.remove).toHaveBeenCalledOnce();
});

it("rejects a newly completed snapshot without a selected crop's saved catalogue entry", async () => {
  const controls = injectedControls(controlledCalculation(controlledRun()));
  const snapshot = await controls.finishAfterRestart(controlledCapability);
  await expect(verifyRestartedPipeline(withSavedSnapshot(controls, { ...snapshot, schemaVersion: 2, catalogue: { ...controlledRegistry.catalogue, entries: [] } }))).rejects.toThrow("Selected crop must have a saved catalogue entry");
  expect(controls.client.remove).toHaveBeenCalledOnce();
});

it("rejects a saved official label that changes after web restart", async () => {
  const controls = injectedControls(controlledCalculation(controlledRun()));
  await expect(verifyRestartedPipeline({
    ...controls,
    client: {
      ...controls.client,
      read: async capability => ({ state: "completed", snapshot: { ...await controls.finishAfterRestart(capability), catalogue: { ...controlledRegistry.catalogue, entries: controlledRegistry.catalogue.entries.map(entry => ({ ...entry, label: "Changed controlled label" })) } } }),
    },
  })).rejects.toThrow("A process restart cannot replace the saved result");
  expect(controls.client.remove).toHaveBeenCalledOnce();
});

it("rejects a controlled service_error even when declared as the expected state", async () => {
  const run = controlledRun();
  const controls = injectedControls({ state: "service_error", error: { code: "processing_failed", message: "Controlled service error.", retryable: false }, details: controlledCalculation(run).details });
  await expect(verifyRestartedPipeline(controls)).rejects.toThrow("A service error is not successful live pipeline acceptance");
  expect(controls.client.remove).toHaveBeenCalledOnce();
});

it("rejects changed frozen bytes in a controlled acceptance-port test", async () => {
  const run = controlledRun();
  const controls = injectedControls(controlledCalculation(run));
  await expect(verifyRestartedPipeline({ ...controls, readFrozen: async capability => ({ ...await controls.readFrozen(capability), digest: "changed-digest" }) })).rejects.toThrow("Worker restart must preserve all frozen input bytes and snapshots");
  expect(controls.client.remove).toHaveBeenCalledOnce();
});
