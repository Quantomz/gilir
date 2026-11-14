import { z } from "zod";
import type { PlannerClient } from "@/contracts/jobs";
import { releasedRegistrySchema } from "@/contracts/registry";
import { completedSnapshotSchema, serviceFailureSchema } from "@/contracts/result";
import type { ServiceFailure } from "@/contracts/result";

const capabilitySchema = z.strictObject({ jobId: z.string().uuid(), token: z.string().min(1).max(512) });
const submissionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("accepted"), capability: capabilitySchema }),
  z.strictObject({ kind: z.literal("invalid"), issues: z.array(z.strictObject({ path: z.array(z.union([z.string(), z.number()])), message: z.string() })) }),
  z.strictObject({ kind: z.literal("unavailable"), failure: serviceFailureSchema }),
]);
const jobStateSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("queued") }),
  z.strictObject({ state: z.literal("fetching") }),
  z.strictObject({ state: z.literal("calculating") }),
  z.strictObject({ state: z.literal("completed"), snapshot: completedSnapshotSchema }),
  z.strictObject({ state: z.literal("failed"), failure: serviceFailureSchema }),
]);
const errorSchema = z.strictObject({ error: serviceFailureSchema });
const catalogueSchema = releasedRegistrySchema.unwrap().shape.catalogue;
const transportFailure: ServiceFailure = { code: "temporarily_unavailable", message: "The planning service could not be reached. Try again shortly.", retryable: true };

export class PlannerServiceError extends Error {
  constructor(readonly failure: ServiceFailure) { super(failure.message); this.name = "PlannerServiceError"; }
}

interface PlannerHttpOptions {
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
}

export function createPlannerClient({ baseUrl = "", fetch: request = (...args) => globalThis.fetch(...args) }: PlannerHttpOptions = {}): PlannerClient {
  async function call(path: string, options?: RequestInit): Promise<Response> {
    try { return await request(baseUrl + path, { ...options, cache: "no-store" }); }
    catch { throw new PlannerServiceError(transportFailure); }
  }
  async function reject(response: Response): Promise<never> {
    const parsed = errorSchema.safeParse(await response.json().catch(() => null));
    throw new PlannerServiceError(parsed.success ? parsed.data.error : transportFailure);
  }
  return {
    async catalogue() {
      const response = await call("/api/catalogue");
      if (response.status !== 200) return reject(response);
      return catalogueSchema.parse(await response.json());
    },
    async submit(input) {
      try {
        const response = await call("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
        if (![202, 400, 503].includes(response.status)) await reject(response);
        const submission = submissionSchema.parse(await response.json());
        if ((response.status === 202) !== (submission.kind === "accepted")
          || (response.status === 400) !== (submission.kind === "invalid")) throw new Error("Unexpected submission response.");
        return submission;
      } catch (error) { return { kind: "unavailable", failure: error instanceof PlannerServiceError ? error.failure : transportFailure }; }
    },
    async read(capability) {
      const response = await call("/api/plans/" + encodeURIComponent(capability.jobId), { headers: { Authorization: "Bearer " + capability.token } });
      if (response.status !== 200) return reject(response);
      return jobStateSchema.parse(await response.json());
    },
    async remove(capability) {
      const response = await call("/api/plans/" + encodeURIComponent(capability.jobId), { method: "DELETE", headers: { Authorization: "Bearer " + capability.token } });
      if (response.status !== 204) await reject(response);
    },
  };
}

export const plannerClient = createPlannerClient();
