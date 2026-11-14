import type { FrozenRun, PlanResult } from "@/contracts";

export function calculate(run: FrozenRun): PlanResult {
  const missing = [{ code: "crop_profile", reason: "Controlled integration calculation only. No released crop profile was assessed.", cropPurposeIds: run.input.cropPurposeIds, sourceIds: [] }] satisfies Extract<PlanResult, { state: "insufficient_data" }>["missing"];
  return {
    state: "insufficient_data", missing,
    details: {
      explanation: "Controlled adapter evidence only. This is not scientific acceptance.", insights: [], metrics: [], seasonMetrics: [], warnings: [], unassessedChecks: missing,
      cohort: { kind: "unavailable", reason: "No scientific cohort assessment was performed." }, baseline: { kind: "not_recorded" }, preparation: [],
      search: { structural: "not_started", ranking: "not_started", structuralExpandedStates: 0, gridExpandedStates: 0, scoredCandidates: 0, structuralExpansionLimit: run.settings.structuralExpansionLimit, gridExpansionLimit: run.settings.gridExpansionLimit, scoredCandidateLimit: run.settings.scoredCandidateLimit, gridStepDays: run.settings.searchGridStepDays },
      provenance: { kind: "run", manifest: { kind: "available", value: run.manifest }, sources: [], profiles: [], rules: [], climateProducts: [] },
      assumptions: ["I1 injected calculation. Operational test result only."],
    },
  };
}
