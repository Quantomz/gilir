import type { ClimateSnapshot, DailyWeather, EngineSettings } from "./climate";
import type { CropPurposeId, EvidenceValue, IsoDate } from "./common";
import type { FarmInput, Priority } from "./input";
import type { CropProfile, RegistryResolution, RotationRule } from "./registry";
import type {
  AssessmentMetric, BaselineComparison, CalendarOccurrence, CalendarProof, EvidenceGap,
  PlanOccurrence, PlanResult, PriorityTuple, ResultDetails, ResultWarning, RunManifest,
} from "./result";

export interface FrozenRun {
  readonly input: FarmInput;
  readonly manifest: RunManifest;
  readonly climate: readonly ClimateSnapshot[];
  readonly settings: EngineSettings;
}

export interface DateInterval {
  readonly start: IsoDate;
  readonly endExclusive: IsoDate;
}

export interface CandidateCalendar {
  readonly origin: "baseline" | "generated";
  readonly horizon: DateInterval;
  readonly occurrences: readonly CalendarOccurrence[];
}

export interface ReplaySeason {
  readonly interval: DateInterval;
  readonly lookbackDays: readonly DailyWeather[];
  readonly days: readonly DailyWeather[];
}

export interface CohortInput {
  readonly run: FrozenRun;
  readonly horizon: DateInterval;
  readonly lookbackDays: number;
}

export interface ClimateCohort {
  readonly coverage: ResultDetails["cohort"];
  readonly usable: readonly ReplaySeason[];
  readonly insights: ResultDetails["insights"];
  readonly gaps: readonly EvidenceGap[];
}

export interface MetricInput {
  readonly history: FarmInput["history"];
  readonly pestCoverage: RegistryResolution["pestCoverage"];
  readonly calendar: CandidateCalendar;
  readonly profiles: readonly CropProfile[];
  readonly rules: readonly RotationRule[];
  readonly cohort: readonly ReplaySeason[];
  readonly settings: EngineSettings;
  readonly latitudeDeg: number;
  readonly elevationM: EvidenceValue<number>;
  readonly priority: Priority;
}

interface AssessmentEvidence {
  readonly metrics: readonly AssessmentMetric[];
  readonly seasonMetrics: ResultDetails["seasonMetrics"];
  readonly warnings: readonly ResultWarning[];
  readonly unassessedChecks: readonly EvidenceGap[];
}

export type ClimateAssessment =
  | (AssessmentEvidence & { readonly kind: "assessed"; readonly occurrences: readonly PlanOccurrence[]; readonly flagged: boolean })
  | (AssessmentEvidence & { readonly kind: "insufficient_data"; readonly missing: readonly EvidenceGap[] });

export interface CalendarSearchInput {
  readonly horizon: DateInterval;
  readonly cropPurposeIds: readonly CropPurposeId[];
  readonly profiles: readonly CropProfile[];
  readonly hardConstraints: readonly RotationRule[];
  readonly eligibleBaseline: CandidateCalendar | null;
  readonly expansionLimit: number;
}

export type CalendarSearchResult =
  | { readonly kind: "witness"; readonly calendar: CandidateCalendar; readonly expandedStates: number }
  | { readonly kind: "proved_impossible"; readonly proof: CalendarProof; readonly expandedStates: number }
  | { readonly kind: "limit_reached"; readonly expandedStates: number };

export interface AssessedCandidate {
  readonly calendar: CandidateCalendar;
  readonly assessment: Extract<ClimateAssessment, { kind: "assessed" }>;
}

export interface RankingInput {
  readonly candidates: readonly AssessedCandidate[];
  readonly priority: Priority;
}

export type RankingResult =
  | { readonly kind: "selected"; readonly candidate: AssessedCandidate; readonly priorityTuple: PriorityTuple }
  | { readonly kind: "none" };

type ExplanationOutcome = PlanResult extends infer R
  ? R extends PlanResult ? Omit<R, "details"> : never
  : never;

export interface ExplanationInput {
  readonly profiles: readonly CropProfile[];
  readonly rules: readonly RotationRule[];
  readonly run: FrozenRun;
  readonly outcome: ExplanationOutcome;
  readonly selected: AssessedCandidate | null;
  readonly baseline: BaselineComparison;
  readonly cohort: ResultDetails["cohort"];
  readonly insights: ResultDetails["insights"];
  readonly search: ResultDetails["search"];
  readonly provenance: ResultDetails["provenance"];
}
