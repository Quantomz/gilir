import type { DailyWeather } from "@/contracts/climate";
import type { EvidenceValue } from "@/contracts/common";
import type { CropProfile } from "@/contracts/registry";
import { stageRange } from "./crop";
import type { StageDays } from "./crop";
import { available, unavailable } from "./evidence";

type TemperatureRule = CropProfile["temperatureRules"][number];

const fieldFor = { min_c: "minC", mean_c: "meanC", max_c: "maxC" } as const satisfies Record<TemperatureRule["variable"], keyof DailyWeather>;
const predicates: Record<TemperatureRule["predicate"], (value: number, threshold: number) => boolean> = {
  above: (v, t) => v > t,
  at_or_above: (v, t) => v >= t,
  below: (v, t) => v < t,
  at_or_below: (v, t) => v <= t,
};

export interface Exposure {
  readonly fraction: number;
  readonly validDays: number;
  readonly exposedRuleIds: readonly string[];
}

/**
 * Worst rule's share of exposed days among valid days in its scope. `days[k]` is occupancy day k
 * (undefined when the season does not cover it). Returns null when the crop has no rule.
 */
export function cropExposure(
  rules: readonly TemperatureRule[],
  days: readonly (DailyWeather | undefined)[],
  stages: StageDays,
): EvidenceValue<Exposure> | null {
  if (rules.length === 0) return null;
  let worst: { fraction: number; validDays: number } | null = null;
  const exposedRuleIds: string[] = [];
  for (const rule of rules) {
    const [from, to] = rule.scope.kind === "stage" ? stageRange(stages, rule.scope.stage) : [0, days.length];
    let valid = 0;
    let exposed = 0;
    for (let k = from; k < to; k++) {
      const v = days[k]?.[fieldFor[rule.variable]];
      if (v?.kind !== "available") continue;
      valid++;
      if (predicates[rule.predicate](v.value, rule.thresholdC)) exposed++;
    }
    if (valid === 0) continue;
    if (exposed > 0) exposedRuleIds.push(rule.id);
    if (!worst || exposed / valid > worst.fraction) worst = { fraction: exposed / valid, validDays: valid };
  }
  return worst ? available({ ...worst, exposedRuleIds }) : unavailable("No valid temperature day in any rule's scope.");
}
