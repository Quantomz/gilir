import type { ClimateAssessment, ClimateCohort, CohortInput, MetricInput } from "@/contracts/engine";
import { assessClimate as assess } from "./metrics/assess";
import { buildClimateCohort as buildCohort } from "./metrics/cohort";

type AssessClimate = (input: MetricInput) => ClimateAssessment;
type BuildClimateCohort = (input: CohortInput) => ClimateCohort;

export const assessClimate: AssessClimate = assess;
export const buildClimateCohort: BuildClimateCohort = buildCohort;
