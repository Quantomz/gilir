import type { ClimateSnapshot, FrozenRun, JobCapability, JobClaim, JobState, JobStore, LeaseIdentity, PlanResult, ServiceFailure } from "@/contracts";
import { parseIsoDate } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { readRegistryRelease } from "@/registry";
import type { RuntimeDependencies } from "@/server/runtime";
import { resultFixtures } from "@/fixtures/results";

export const snapshot: ClimateSnapshot = {
  kind: "provider",
  id: "test-provider-shaped-snapshot",
  contentHash: "test-content-hash",
  cutoff: parseIsoDate("2026-01-01"),
  retrievedAt: "2026-01-01T00:00:00Z",
  latitudeDeg: 15,
  elevationM: { kind: "unavailable", reason: "Invented component test has no elevation." },
  products: [],
  days: [],
};

export function resultForRun(run: FrozenRun, result: PlanResult = resultFixtures.plan): PlanResult {
  return {
    ...result,
    details: {
      ...result.details,
      provenance: {
        kind: "run",
        manifest: { kind: "available", value: run.manifest },
        profiles: result.details.provenance.profiles,
        rules: result.details.provenance.rules,
        sources: result.details.provenance.sources,
        climateProducts: result.details.provenance.climateProducts,
      },
    },
  };
}

export class MemoryJobs implements JobStore {
  readonly capability = { jobId: "test-job", token: "test-capability" };
  readonly input = inputFixture;
  readonly registry = readRegistryRelease().identity;
  readonly cutoff = snapshot.cutoff;
  state: JobState = { state: "queued" };
  frozenRun: FrozenRun | null = null;
  lease: LeaseIdentity | null = null;
  expires = 0;
  sequence = 0;
  rejectRenewal = false;
  crashAfterFreeze = false;
  completions = 0;

  async purgeExpired() { return 0; }
  async create() { return this.capability; }
  async get(capability: JobCapability) { return capability.token === this.capability.token ? this.state : null; }
  async delete() { return false; }
  async claim(args: { workerId: string; now: string; leaseSeconds: number }): Promise<JobClaim | null> {
    if (this.state.state === "completed" || this.state.state === "failed" || this.lease && Date.parse(args.now) < this.expires) return null;
    this.lease = { jobId: this.capability.jobId, workerId: args.workerId, leaseId: String(++this.sequence) };
    this.expires = Date.parse(args.now) + args.leaseSeconds * 1000;
    this.state = { state: this.frozenRun ? "calculating" : "fetching" };
    return { lease: this.lease, leaseExpiresAt: new Date(this.expires).toISOString(), input: this.input, registry: this.registry, cutoff: this.cutoff, frozenRun: this.frozenRun };
  }
  owns(lease: LeaseIdentity, now: string) {
    return this.lease?.leaseId === lease.leaseId && this.lease.workerId === lease.workerId && Date.parse(now) < this.expires
      && this.state.state !== "completed" && this.state.state !== "failed";
  }
  async renew(lease: LeaseIdentity, now: string, seconds: number) {
    if (this.rejectRenewal || !this.owns(lease, now)) return false;
    this.expires = Date.parse(now) + seconds * 1000;
    return true;
  }
  async freeze(lease: LeaseIdentity, run: FrozenRun, now: string) {
    if (!this.owns(lease, now)) return false;
    this.frozenRun = structuredClone(run);
    this.state = { state: "calculating" };
    if (this.crashAfterFreeze) { this.rejectRenewal = true; throw new Error("Simulated process crash after durable freeze."); }
    return true;
  }
  async complete(lease: LeaseIdentity, result: PlanResult, now: string) {
    if (!this.owns(lease, now)) return false;
    this.completions += 1;
    this.state = { state: "completed", snapshot: { schemaVersion: 1, id: lease.jobId, completedAt: now, input: this.input, result } };
    return true;
  }
  async fail(lease: LeaseIdentity, failure: ServiceFailure, now: string) {
    if (!this.owns(lease, now)) return false;
    this.state = { state: "failed", failure };
    return true;
  }
}

export function dependencies(jobs = new MemoryJobs()): RuntimeDependencies {
  return {
    jobs,
    climateCache: { async read() { return null; }, async put() {} },
    prepareClimate: async () => ({ kind: "ready", snapshots: [snapshot] }),
    readRegistryRelease,
    calculate: run => resultForRun(run),
    settings: { version: "test-v1", targetSeasons: 25, minimumUsableSeasons: 15, structuralExpansionLimit: 10, gridExpansionLimit: 10, scoredCandidateLimit: 10, searchGridStepDays: 7, mismatchWindowDays: 7, dryDayThresholdMm: 1, rankingDecimalPlaces: 6, adverseQuantile: 0.9 },
    workerId: "test-worker",
    leaseSeconds: 60,
    now: () => "2026-01-01T00:00:00.000Z",
  };
}
