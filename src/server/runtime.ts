import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { ClimateCache, EngineSettings, FrozenRun, JobStore, PlanResult, ReleasedRegistry, ServiceFailure } from "@/contracts";
import { completedSnapshotSchemaVersion, completedSnapshotV2Schema, parsePlanResult, releasedRegistrySchema } from "@/contracts";
import type { calculate } from "@/engine";
import type { readRegistryRelease } from "@/registry";
import type { prepareClimate } from "@/server/climate";
import { providerSnapshotSchema } from "@/server/cache/schema";

const engineVersion = "v1";

function sortedJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(sortedJson).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return "{" + Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => JSON.stringify(key) + ":" + sortedJson(child)).join(",") + "}";
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Scientific inputs must be JSON values.");
  return serialized;
}

function hashNormalizedInput(input: FrozenRun["input"]): string {
  return createHash("sha256").update(sortedJson(input)).digest("hex");
}

export interface RuntimeDependencies {
  readonly jobs: JobStore;
  readonly climateCache: ClimateCache;
  readonly prepareClimate: typeof prepareClimate;
  readonly readRegistryRelease: typeof readRegistryRelease;
  readonly calculate: typeof calculate;
  readonly executeCalculation?: (run: FrozenRun, registry: ReleasedRegistry) => Promise<PlanResult>;
  readonly settings: EngineSettings;
  readonly workerId: string;
  readonly leaseSeconds: number;
  readonly now: () => string;
}
export type WorkerTickResult =
  | { readonly kind: "idle" }
  | { readonly kind: "completed"; readonly jobId: string }
  | { readonly kind: "failed"; readonly jobId: string; readonly failure: ServiceFailure }
  | { readonly kind: "lost_lease"; readonly jobId: string };
function immutable<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

function assertFrozenRun(run: FrozenRun, claim: NonNullable<Awaited<ReturnType<JobStore["claim"]>>>) {
  const manifest = run.manifest;
  const expectedInputHash = hashNormalizedInput(claim.input);
  if (hashNormalizedInput(run.input) !== expectedInputHash
    || manifest.normalizedInputHash !== expectedInputHash
    || manifest.dataCutoff !== claim.cutoff
    || manifest.catalogueVersion !== claim.registry.catalogueVersion
    || manifest.ruleVersion !== claim.registry.ruleVersion
    || manifest.configurationVersion !== run.settings.version
    || manifest.engineVersion !== engineVersion
    || JSON.stringify(manifest.climateSnapshotIds) !== JSON.stringify(run.climate.map(snapshot => snapshot.id))) {
    throw new Error("Frozen scientific inputs are unavailable or incompatible with this worker.");
  }
  for (const snapshot of run.climate) {
    providerSnapshotSchema.parse(snapshot);
    if (snapshot.cutoff !== manifest.dataCutoff) throw new Error("Frozen climate cutoff differs from its manifest.");
  }
}

export async function runWorkerOnce(dependencies: RuntimeDependencies): Promise<WorkerTickResult> {
  const { jobs, workerId, leaseSeconds, now } = dependencies;
  if (workerId.trim().length === 0 || !Number.isFinite(leaseSeconds) || leaseSeconds <= 0) {
    throw new Error("A worker ID and positive lease duration are required.");
  }
  const claim = await jobs.claim({ workerId, now: now(), leaseSeconds });
  if (claim === null) return { kind: "idle" };
  const { lease } = claim;
  const lostResult = { kind: "lost_lease", jobId: lease.jobId } satisfies WorkerTickResult;
  let lost = false;
  let renewal: Promise<boolean> | undefined;
  const renew = (): Promise<boolean> => {
    if (lost) return Promise.resolve(false);
    if (renewal) return renewal;
    renewal = jobs.renew(lease, now(), leaseSeconds)
      .catch(() => false)
      .then(owned => { lost = !owned; return owned; })
      .finally(() => { renewal = undefined; });
    return renewal;
  };
  const heartbeat = setInterval(() => { void renew(); }, Math.max(1, leaseSeconds * 1000 / 3));
  try {
    if (!await renew()) return lostResult;
    const registry = immutable(releasedRegistrySchema.parse(dependencies.readRegistryRelease(claim.registry.catalogueVersion)));
    if (registry.identity.catalogueVersion !== claim.registry.catalogueVersion || registry.identity.ruleVersion !== claim.registry.ruleVersion || registry.catalogue.version !== claim.registry.catalogueVersion) {
      throw new Error("The exact frozen registry release is unavailable.");
    }
    let run = claim.frozenRun;
    if (run === null) {
      const climate = await dependencies.prepareClimate({
        input: claim.input,
        cutoff: claim.cutoff,
        settings: dependencies.settings,
        cache: dependencies.climateCache,
      });
      if (lost) return lostResult;
      if (climate.kind === "failed") {
        if (!await renew()) return lostResult;
        const accepted = await jobs.fail(lease, climate.failure, now());
        return accepted ? { kind: "failed", jobId: lease.jobId, failure: climate.failure } : lostResult;
      }
      run = immutable(structuredClone({
        input: claim.input,
        manifest: {
          schemaVersion: 1,
          normalizedInputHash: hashNormalizedInput(claim.input),
          engineVersion,
          configurationVersion: dependencies.settings.version,
          catalogueVersion: claim.registry.catalogueVersion,
          ruleVersion: claim.registry.ruleVersion,
          climateSnapshotIds: climate.snapshots.map(snapshot => snapshot.id),
          dataCutoff: claim.cutoff,
        },
        climate: climate.snapshots,
        settings: dependencies.settings,
      } satisfies FrozenRun));
      assertFrozenRun(run, claim);
      if (!await renew() || !await jobs.freeze(lease, run, now())) return lostResult;
    } else {
      run = immutable(structuredClone(run));
      assertFrozenRun(run, claim);
    }
    if (!await renew()) return lostResult;
    const result = parsePlanResult(await (dependencies.executeCalculation
      ? dependencies.executeCalculation(run, registry)
      : dependencies.calculate(run, registry)));
    const provenance = result.details.provenance;
    if (provenance.kind !== "run" || provenance.manifest.kind !== "available"
      || sortedJson(provenance.manifest.value) !== sortedJson(run.manifest)) {
      throw new Error("Calculation output does not identify the exact frozen run.");
    }
    const completion = { result, catalogue: registry.catalogue };
    completedSnapshotV2Schema.parse({
      schemaVersion: completedSnapshotSchemaVersion, id: lease.jobId, completedAt: now(), input: run.input, ...completion,
    });
    if (!await renew()) return lostResult;
    const accepted = await jobs.complete(lease, completion, now());
    return accepted ? { kind: "completed", jobId: lease.jobId } : lostResult;
  } catch {
    if (!await renew()) return lostResult;
    const failure = {
      code: "processing_failed",
      message: "The worker could not complete the frozen calculation.",
      retryable: false,
    } satisfies ServiceFailure;
    const accepted = await jobs.fail(lease, failure, now());
    return accepted ? { kind: "failed", jobId: lease.jobId, failure } : lostResult;
  } finally {
    clearInterval(heartbeat);
    await renewal;
  }
}

export async function runWorkerLoop(args: {
  readonly dependencies: RuntimeDependencies;
  readonly signal: AbortSignal;
  readonly pollMilliseconds: number;
  readonly onTick: (result: WorkerTickResult) => void;
}): Promise<void> {
  if (!Number.isFinite(args.pollMilliseconds) || args.pollMilliseconds <= 0) throw new Error("Polling interval must be positive.");
  while (!args.signal.aborted) {
    const result = await runWorkerOnce(args.dependencies);
    args.onTick(result);
    if (result.kind === "idle" && !args.signal.aborted) {
      try {
        await delay(args.pollMilliseconds, undefined, { signal: args.signal });
      } catch (error) {
        if (!args.signal.aborted) throw error;
      }
    }
  }
}
