import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { CompletedSnapshot, FarmInput, JobCapability, PlannerClient, RunManifest } from "@/contracts";

export interface FrozenEvidence {
  readonly manifest: RunManifest;
  readonly digest: string;
  readonly providerSnapshots: number;
  readonly syntheticSnapshots: number;
  readonly firstDate: string;
  readonly lastDate: string;
}

export interface AcceptanceControls {
  readonly client: PlannerClient;
  readonly input: FarmInput;
  readonly expectedState: CompletedSnapshot["result"]["state"];
  readonly rejectUnauthorized: (capability: JobCapability) => Promise<void>;
  readonly freezeAndCrash: (capability: JobCapability) => Promise<FrozenEvidence>;
  readonly finishAfterRestart: (capability: JobCapability) => Promise<CompletedSnapshot>;
  readonly readFrozen: (capability: JobCapability) => Promise<FrozenEvidence>;
  readonly restartWeb: () => Promise<void>;
  readonly assertPrivateLogs: (capability: JobCapability) => Promise<void>;
}

export async function verifyRestartedPipeline(controls: AcceptanceControls) {
  const submission = await controls.client.submit(controls.input);
  assert.equal(submission.kind, "accepted", "A real HTTP request must be accepted by the released catalogue.");
  if (submission.kind !== "accepted") throw new Error("HTTP submission failed.");
  const capability = submission.capability;
  try {
    await controls.rejectUnauthorized(capability);
    const before = await controls.freezeAndCrash(capability);
    assert.ok(before.providerSnapshots > 0, "The frozen run must contain actual provider snapshots.");
    assert.equal(before.syntheticSnapshots, 0, "Synthetic snapshots cannot satisfy I1.");
    assert.ok(before.firstDate < before.lastDate, "The frozen source period must be recorded.");
    assert.ok(before.manifest.climateSnapshotIds.length > 0, "The frozen manifest must identify its climate snapshots.");

    const completed = await controls.finishAfterRestart(capability);
    assert.equal(completed.result.state, controls.expectedState, "The declared scientific outcome must match the actual terminal result.");
    assert.notEqual(completed.result.state, "service_error", "A service error is not successful live pipeline acceptance.");
    assert.deepEqual(completed.input, controls.input, "The completed snapshot must preserve the submitted input.");
    assert.equal(completed.result.details.provenance.kind, "run", "Production results must not have synthetic provenance.");
    const manifest = completed.result.details.provenance.manifest;
    assert.equal(manifest.kind, "available", "The completed result must expose its frozen manifest.");
    if (manifest.kind !== "available") throw new Error("The result has no manifest.");
    assert.deepEqual(manifest.value, before.manifest, "Worker restart must preserve every manifest field.");
    const after = await controls.readFrozen(capability);
    assert.equal(after.digest, before.digest, "Worker restart must preserve all frozen input bytes and snapshots.");

    await controls.restartWeb();
    const persisted = await controls.client.read(capability);
    assert.equal(persisted.state, "completed", "The result must remain readable after the web process restarts.");
    if (persisted.state !== "completed") throw new Error("The completed job was lost after restart.");
    assert.deepEqual(persisted.snapshot, completed, "A process restart cannot replace the saved result.");
    await controls.rejectUnauthorized(capability);
    await controls.assertPrivateLogs(capability);

    return {
      state: completed.result.state,
      manifest: before.manifest,
      frozenDigest: before.digest,
      resultDigest: createHash("sha256").update(JSON.stringify(completed)).digest("hex"),
      sourcePeriod: { firstDate: before.firstDate, lastDate: before.lastDate },
      providerSnapshots: before.providerSnapshots,
      workerRestartPreservedFrozenRun: true,
      webRestartPreservedResult: true,
      unauthorizedReadsAndDeletesRejected: true,
      privateValuesAbsentFromLogs: true,
    };
  } finally {
    await controls.client.remove(capability);
  }
}
