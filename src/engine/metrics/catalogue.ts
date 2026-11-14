import type { EvidenceValue } from "@/contracts/common";
import type { AssessmentMetric } from "@/contracts/result";
import { available, unavailable } from "./evidence";

type DenominatorUnit = Extract<AssessmentMetric["denominator"], { kind: "available" }>["value"]["unit"];

interface MetricSpec {
  readonly label: string;
  readonly unit: AssessmentMetric["unit"];
  readonly basis: AssessmentMetric["basis"];
  readonly methodVersion: string;
  readonly assumptions: readonly string[];
}

const WATER_METHOD = "rain-demand-7day-v1";
const WATER_ASSUMPTIONS = [
  "Screening indicator: rainfall only, no soil-water storage, runoff, groundwater or backup water.",
  "Crop demand is FAO-56 ETc = Kc x ET0 with ea = RHmean/100 x es.",
  "Windows with missing data or zero demand are excluded.",
];
const TEMPERATURE_METHOD = "daily-temperature-rule-v1";
const TEMPERATURE_ASSUMPTIONS = ["Only released daily temperature rules are assessed; crops without a rule are unassessed, not safe."];
const SCHEDULE_METHOD = "schedule-occupancy-v1";
const SCHEDULE_ASSUMPTIONS = ["Scheduled crop occupancy, not measured ground cover; turnaround days count as days without a planned crop."];
const INSIGHT_METHOD = "climate-insight-v1";
const MONTH_ASSUMPTIONS = ["Only calendar months wholly inside a complete replay season are counted.", "Quantiles use the nearest rank."];

const water = (label: string): MetricSpec => ({ label, unit: "fraction", basis: "estimated", methodVersion: WATER_METHOD, assumptions: WATER_ASSUMPTIONS });
const temperature = (label: string): MetricSpec => ({ label, unit: "fraction", basis: "rule_derived", methodVersion: TEMPERATURE_METHOD, assumptions: TEMPERATURE_ASSUMPTIONS });
const schedule = (label: string, unit: "days" | "count"): MetricSpec => ({ label, unit, basis: "rule_derived", methodVersion: SCHEDULE_METHOD, assumptions: SCHEDULE_ASSUMPTIONS });
const insight = (label: string, unit: AssessmentMetric["unit"], assumptions = MONTH_ASSUMPTIONS): MetricSpec => ({ label, unit, basis: "measured", methodVersion: INSIGHT_METHOD, assumptions });

const catalogue = {
  mean_frequency: water("Mean share of rolling windows where rain fell below estimated crop demand (worst crop per season)"),
  mean_mismatch: water("Mean relative rain shortfall against estimated crop demand (worst crop per season)"),
  q90_mismatch: water("Adverse-season (nearest-rank 90th percentile) relative rain shortfall"),
  frequency: water("Share of rolling windows where rain fell below estimated crop demand"),
  mismatch: water("Mean relative rain shortfall against estimated crop demand"),
  temperature_exposure: temperature("Share of valid days in the sensitive period beyond the crop's temperature limit"),
  q90_temperature_exposure: temperature("Adverse-season (nearest-rank 90th percentile) temperature exposure"),
  unplanted_days: schedule("Days without a planned crop", "days"),
  longest_unplanted_gap: schedule("Longest run of days without a planned crop", "days"),
  crop_family_count: schedule("Distinct scheduled crop families", "count"),
  legume_crop_count: schedule("Scheduled legume plantings", "count"),
  monthly_rain_median: insight("Median monthly rainfall total", "mm"),
  monthly_rain_p10: insight("10th percentile monthly rainfall total", "mm"),
  monthly_rain_p90: insight("90th percentile monthly rainfall total", "mm"),
  monthly_mean_temperature: insight("Mean daily temperature for the month", "degC"),
  wet_day_frequency: insight("Historical share of wet days (rain at or above the wet-day threshold); not a forecast", "fraction"),
  longest_dry_spell: insight("Longest run of dry days (rain below the dry-day threshold) in the replay season", "days",
    ["Dry day: rain below the dry-day threshold, default 1 mm."]),
} satisfies Record<string, MetricSpec>;

export type MetricId = keyof typeof catalogue;

export function metric(id: MetricId, value: EvidenceValue<number>, count: number, unit: DenominatorUnit): AssessmentMetric {
  const spec: MetricSpec = catalogue[id];
  return {
    id,
    label: spec.label,
    value,
    unit: spec.unit,
    basis: spec.basis,
    methodVersion: spec.methodVersion,
    sourceIds: [],
    denominator: count >= 1 ? available({ count, unit }) : unavailable("No observations to count."),
    assumptions: spec.assumptions,
  };
}
