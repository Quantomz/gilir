import { NotImplementedError } from "@/contracts/common";
import type { ClimateCache, EngineSettings, JobStore, ServiceFailure } from "@/contracts";
import type { calculate } from "@/engine";
import type { readRegistryRelease } from "@/registry";
import type { prepareClimate } from "@/server/climate";

export interface RuntimeDependencies {
  readonly jobs: JobStore;
  readonly climateCache: ClimateCache;
  readonly prepareClimate: typeof prepareClimate;
  readonly readRegistryRelease: typeof readRegistryRelease;
  readonly calculate: typeof calculate;
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
export async function runWorkerOnce(_dependencies: RuntimeDependencies): Promise<WorkerTickResult> {
  throw new NotImplementedError("Worker orchestration");
}
