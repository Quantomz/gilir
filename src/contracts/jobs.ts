import type { FarmInput } from "./input";
import type { ClimateSnapshot } from "./climate";
import type { FrozenRun } from "./engine";
import type { Catalogue, RegistryIdentity } from "./registry";
import type { IsoDate } from "./common";
import type { CompletedSnapshot, PlanResult, ServiceFailure } from "./result";

export interface JobCapability {
  readonly jobId: string;
  readonly token: string;
}

export type JobState =
  | { readonly state: "queued" | "fetching" | "calculating" }
  | { readonly state: "completed"; readonly snapshot: CompletedSnapshot }
  | { readonly state: "failed"; readonly failure: ServiceFailure };

export interface InputIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export type Submission =
  | { readonly kind: "accepted"; readonly capability: JobCapability }
  | { readonly kind: "invalid"; readonly issues: readonly InputIssue[] }
  | { readonly kind: "unavailable"; readonly failure: ServiceFailure };

export interface PlannerClient {
  catalogue(): Promise<Catalogue>;
  submit(input: FarmInput): Promise<Submission>;
  read(capability: JobCapability): Promise<JobState>;
  remove(capability: JobCapability): Promise<void>;
}

export interface LeaseIdentity {
  readonly jobId: string;
  readonly workerId: string;
  readonly leaseId: string;
}

export interface JobClaim {
  readonly lease: LeaseIdentity;
  readonly leaseExpiresAt: string;
  readonly input: FarmInput;
  readonly registry: RegistryIdentity;
  readonly cutoff: IsoDate;
  readonly frozenRun: FrozenRun | null;
}

export interface JobStore {
  purgeExpired(now: string): Promise<number>;
  create(args: {
    readonly input: FarmInput;
    readonly registry: RegistryIdentity;
    readonly cutoff: IsoDate;
    readonly createdAt: string;
  }): Promise<JobCapability>;
  get(capability: JobCapability): Promise<JobState | null>;
  delete(capability: JobCapability): Promise<boolean>;
  claim(args: {
    readonly workerId: string;
    readonly now: string;
    readonly leaseSeconds: number;
  }): Promise<JobClaim | null>;
  renew(lease: LeaseIdentity, now: string, leaseSeconds: number): Promise<boolean>;
  freeze(lease: LeaseIdentity, run: FrozenRun, now: string): Promise<boolean>;
  complete(lease: LeaseIdentity, result: PlanResult, now: string): Promise<boolean>;
  fail(lease: LeaseIdentity, failure: ServiceFailure, now: string): Promise<boolean>;
}

export type ClimatePreparation =
  | { readonly kind: "ready"; readonly snapshots: readonly ClimateSnapshot[] }
  | { readonly kind: "unavailable"; readonly reason: string; readonly snapshots: readonly ClimateSnapshot[] }
  | { readonly kind: "failed"; readonly failure: ServiceFailure; readonly snapshots: readonly ClimateSnapshot[] };
