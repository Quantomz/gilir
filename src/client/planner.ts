import { NotImplementedError } from "@/contracts/common";
import type { PlannerClient } from "@/contracts/jobs";
import type { ServiceFailure } from "@/contracts/result";

const failure = {
  code: "not_configured",
  message: "The planning service is not configured.",
  retryable: false,
} satisfies ServiceFailure;

export const plannerClient: PlannerClient = {
  async catalogue() { throw new NotImplementedError("Catalogue client"); },
  async submit() { return { kind: "unavailable", failure }; },
  async read() { return { state: "failed", failure }; },
  async remove() { throw new NotImplementedError("Job deletion client"); },
};
