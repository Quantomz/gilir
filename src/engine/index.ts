import type { resolveRegistry } from "@/registry";
import type { FrozenRun } from "@/contracts/engine";
import type { RegistryRelease } from "@/contracts/registry";
import type { PlanResult, ResultDetails, ServiceFailure } from "@/contracts/result";
import type { assessClimate, buildClimateCohort } from "./metrics";

export { assessClimate, buildClimateCohort } from "./metrics";
export { findCalendar, rankCandidates } from "./search";
export { explainResult } from "./explain";

export interface CalculateOptions {
  readonly resolveRegistry?: typeof resolveRegistry;
  readonly assess?: typeof assessClimate;
  readonly buildCohort?: typeof buildClimateCohort;
}

const unavailable = {
  code: "not_implemented",
  message: "The planning engine is not implemented.",
  retryable: false,
} satisfies ServiceFailure;

type Calculate = (run: FrozenRun, registry: RegistryRelease, options?: CalculateOptions) => PlanResult;
export const calculate: Calculate = (run, registry) => {
  const provenance = {
    manifest: { kind: "available", value: run.manifest },
    sources: [],
    profiles: [],
    rules: [],
    climateProducts: [],
  } satisfies Omit<ResultDetails["provenance"], "kind">;
  return {
    state: "service_error",
    error: unavailable,
    details: {
      explanation: unavailable.message,
      insights: [],
      metrics: [],
      seasonMetrics: [],
      warnings: [],
      unassessedChecks: [],
      cohort: { kind: "unavailable", reason: "No assessment was performed." },
      baseline: run.input.history.kind === "skipped"
        ? { kind: "not_recorded" }
        : { kind: "not_assessable", reasons: ["No assessment was performed."] },
      preparation: [],
      search: {
        structural: "not_started", ranking: "not_started", structuralExpandedStates: 0, gridExpandedStates: 0, scoredCandidates: 0,
        structuralExpansionLimit: run.settings.structuralExpansionLimit,
        gridExpansionLimit: run.settings.gridExpansionLimit,
        scoredCandidateLimit: run.settings.scoredCandidateLimit,
        gridStepDays: run.settings.searchGridStepDays,
      },
      provenance: registry.kind === "synthetic"
        ? { kind: "synthetic", label: registry.label, ...provenance }
        : { kind: "run", ...provenance },
      assumptions: [],
    },
  };
};
