import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { CompletedSnapshot, EngineSettings, FarmInput, JobCapability, PlannerClient, PlanResult, RunManifest } from "@/contracts";
import { completedSnapshotV2Schema } from "@/contracts";
import type { historicalPeriod } from "@/server/climate";
import { sanitizedUrl } from "./support";
import type { providerEvidence } from "./support";

export interface FrozenEvidence {
  readonly manifest: RunManifest;
  readonly digest: string;
  readonly providerSnapshots: number;
  readonly syntheticSnapshots: number;
  readonly firstDate: string;
  readonly lastDate: string;
  readonly snapshots: readonly ReturnType<typeof providerEvidence>[];
  readonly settings: Pick<EngineSettings, "version" | "targetSeasons" | "minimumUsableSeasons">;
  readonly requiredSourcePeriod: ReturnType<typeof historicalPeriod>;
}

export function scientificEvidence(result: PlanResult) {
  const details = result.details;
  return {
    state: result.state,
    profiles: details.provenance.profiles,
    sources: details.provenance.sources.map(source => ({ ...source, url: sanitizedUrl(source.url) })),
    cohort: details.cohort,
    usableSeasons: details.cohort.kind === "available" ? details.cohort.value.seasons.filter(season => season.status === "usable").length : 0,
    unassessedChecks: details.unassessedChecks,
    missing: result.state === "insufficient_data" ? result.missing : [],
    hasPlan: "plan" in result,
    occurrences: "plan" in result ? result.plan.occurrences.map(({ cropPurposeId, profileId, profileVersion, planted, lastOccupied, fieldAvailable }) => ({ cropPurposeId, profileId, profileVersion, planted, lastOccupied, fieldAvailable })) : [],
    warnings: details.warnings,
    search: details.search,
  };
}

export type PipelineObservation =
  | { readonly stage: "submitted"; readonly jobId: string }
  | { readonly stage: "frozen"; readonly evidence: FrozenEvidence }
  | { readonly stage: "completed"; readonly scientific: ReturnType<typeof scientificEvidence>; readonly resultDigest: string };

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
  readonly observe?: (observation: PipelineObservation) => void;
}

export async function verifyRestartedPipeline(controls: AcceptanceControls) {
  const submission = await controls.client.submit(controls.input);
  assert.equal(submission.kind, "accepted", "A real HTTP request must be accepted by the released catalogue.");
  if (submission.kind !== "accepted") throw new Error("HTTP submission failed.");
  const capability = submission.capability;
  try {
    controls.observe?.({ stage: "submitted", jobId: capability.jobId });
    await controls.rejectUnauthorized(capability);
    const before = await controls.freezeAndCrash(capability);
    controls.observe?.({ stage: "frozen", evidence: before });
    assert.ok(before.providerSnapshots > 0, "The frozen run must contain actual provider snapshots.");
    assert.equal(before.syntheticSnapshots, 0, "Synthetic snapshots cannot satisfy I1.");
    assert.ok(before.firstDate < before.lastDate, "The frozen source period must be recorded.");
    assert.ok(before.manifest.climateSnapshotIds.length > 0, "The frozen manifest must identify its climate snapshots.");

    const completed = completedSnapshotV2Schema.parse(await controls.finishAfterRestart(capability));
    assert.equal(completed.id, capability.jobId, "The completed snapshot must identify the accepted job.");
    assert.equal(completed.catalogue.version, before.manifest.catalogueVersion, "The saved catalogue must match the frozen run.");
    const scientific = scientificEvidence(completed.result);
    const resultDigest = createHash("sha256").update(JSON.stringify(completed)).digest("hex");
    controls.observe?.({ stage: "completed", scientific, resultDigest });
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
      jobId: capability.jobId,
      state: completed.result.state,
      manifest: before.manifest,
      frozenDigest: before.digest,
      resultDigest,
      sourcePeriod: { firstDate: before.firstDate, lastDate: before.lastDate },
      providerSnapshots: before.providerSnapshots,
      syntheticSnapshots: before.syntheticSnapshots,
      snapshots: before.snapshots,
      settings: before.settings,
      requiredSourcePeriod: before.requiredSourcePeriod,
      scientific,
      workerRestartPreservedFrozenRun: true,
      webRestartPreservedResult: true,
      unauthorizedReadsAndDeletesRejected: true,
      privateValuesAbsentFromLogs: true,
    };
  } finally {
    await controls.client.remove(capability);
  }
}
