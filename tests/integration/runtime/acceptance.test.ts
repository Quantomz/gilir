import { expect, it, vi } from "vitest";
import type { CompletedSnapshot } from "@/contracts";
import { defaultEngineSettings } from "@/contracts";
import { historicalPeriod } from "@/server/climate";
import { hashNormalizedInput } from "@/server/jobs";
import type { AcceptanceControls } from "./acceptance";
import { verifyRestartedPipeline } from "./acceptance";
import { calculate as controlledCalculation } from "./controlled-engine";
import { frozenRun, input } from "./support";

function controlledRun() {
  const run = frozenRun([], hashNormalizedInput(input));
  return { ...run, manifest: { ...run.manifest, climateSnapshotIds: ["controlled-only-snapshot"] } };
}

function injectedControls(result: CompletedSnapshot["result"]): AcceptanceControls {
  const run = controlledRun();
  const snapshot: CompletedSnapshot = { schemaVersion: 1, id: "controlled-job", completedAt: "2026-11-14T12:00:00.000Z", input, result };
  const evidence = { manifest: run.manifest, digest: "controlled-frozen-digest", providerSnapshots: 3, syntheticSnapshots: 0, firstDate: "2000-06-30", lastDate: "2026-06-30", snapshots: [], settings: defaultEngineSettings, requiredSourcePeriod: historicalPeriod(input.planningStart, run.manifest.dataCutoff, run.settings) };
  return {
    input, expectedState: result.state,
    client: { catalogue: async () => ({ version: "controlled-only", entries: [] }), submit: async () => ({ kind: "accepted", capability: { jobId: "00000000-0000-4000-8000-000000000002", token: "controlled-token" } }), read: async () => ({ state: "completed", snapshot }), remove: vi.fn(async () => {}) },
    rejectUnauthorized: async () => {}, freezeAndCrash: async () => evidence, finishAfterRestart: async () => snapshot, readFrozen: async () => evidence, restartWeb: async () => {}, assertPrivateLogs: async () => {},
  };
}

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
