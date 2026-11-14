import { NotImplementedError } from "@/contracts/common";
import type { ClimateAssessment, ClimateCohort, CohortInput, MetricInput } from "@/contracts/engine";

type AssessClimate = (input: MetricInput) => ClimateAssessment;
type BuildClimateCohort = (input: CohortInput) => ClimateCohort;

export const assessClimate: AssessClimate = () => { throw new NotImplementedError("Climate assessment"); };
export const buildClimateCohort: BuildClimateCohort = () => { throw new NotImplementedError("Climate cohort construction"); };
