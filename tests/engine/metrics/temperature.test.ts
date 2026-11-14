import { describe, expect, it } from "vitest";
import type { WeatherField } from "@/contracts/climate";
import type { EvidenceValue } from "@/contracts/common";
import type { CropProfile } from "@/contracts/registry";
import { assessClimate } from "@/engine/metrics";
import { assessed, metric, metricInput, missing, occurrence, profile, season, seasons, value } from "./helpers";

type Rule = CropProfile["temperatureRules"][number];
const rule = (
  id: string, stage: "initial" | "development" | "middle" | "late" | null,
  variable: Rule["variable"], predicate: Rule["predicate"], thresholdC: number,
): Rule => ({
  id, scope: stage ? { kind: "stage", stage } : { kind: "whole_occurrence" },
  period: "daily", variable, predicate, thresholdC, sourceIds: ["synthetic:no-publication"], limitations: [],
});

// 9-day crop: initial days 0-1, development 2-3, middle 4-6, late 7-8. Rain 100 mm/day keeps water metrics at 0.
const stages = { initial: 2, development: 2, middle: 3, late: 2 };
const heatMiddle = rule("heat-mid", "middle", "max_c", "above", 35);

function run(rules: Rule[], shape: (i: number) => Partial<Record<WeatherField, number | EvidenceValue<number>>>, stageDays = stages) {
  const crop = profile({ id: "crop-a", stageDays, temperatureRules: rules });
  const length = stageDays.initial + stageDays.development + stageDays.middle + stageDays.late;
  return assessClimate(metricInput({
    horizonDays: 365, profiles: [crop], occurrences: [occurrence(crop, "2026-07-01")],
    cohort: [season("2025-07-01", length, (_d, i) => ({ rainMm: 100, ...shape(i) }))],
  }));
}
const cropSeason = (a: ReturnType<typeof assessed>) => a.occurrences[0].seasonMetrics[0].metrics;

describe("stage-specific temperature exposure", () => {
  it("counts only days in the sensitive stage: 2 of 3 middle days above 35 degC (day 0 heat ignored)", () => {
    const a = assessed(run([heatMiddle], i => ([0, 4, 5].includes(i) ? { maxC: 40 } : {})));
    expect(value(cropSeason(a), "temperature_exposure")).toBeCloseTo(2 / 3, 10);
    expect(metric(cropSeason(a), "temperature_exposure").denominator).toEqual({ kind: "available", value: { count: 3, unit: "days" } });
  });

  it("'above' excludes the threshold itself; 'at_or_above' includes it", () => {
    const shape = (i: number) => (i === 4 ? { maxC: 35 } : {});
    expect(value(cropSeason(assessed(run([heatMiddle], shape))), "temperature_exposure")).toBe(0);
    const inclusive = rule("heat-mid-incl", "middle", "max_c", "at_or_above", 35);
    expect(value(cropSeason(assessed(run([inclusive], shape))), "temperature_exposure")).toBeCloseTo(1 / 3, 10);
  });

  it("cold rule on daily minimum over the whole occurrence: 3 of 9 days below 10 degC", () => {
    const cold = rule("cold-all", null, "min_c", "below", 10);
    const a = assessed(run([cold], i => ([1, 2, 3].includes(i) ? { minC: 5 } : {})));
    expect(value(cropSeason(a), "temperature_exposure")).toBeCloseTo(3 / 9, 10);
  });

  it("with both heat and cold rules, exposure is the larger fraction", () => {
    const cold = rule("cold-all", null, "min_c", "below", 10);
    const a = assessed(run([heatMiddle, cold], i => ({ ...([4, 5].includes(i) ? { maxC: 40 } : {}), ...([1, 2, 3].includes(i) ? { minC: 5 } : {}) })));
    expect(value(cropSeason(a), "temperature_exposure")).toBeCloseTo(2 / 3, 10);
    expect(value(a.seasonMetrics[0].metrics, "temperature_exposure")).toBeCloseTo(2 / 3, 10);
  });

  it("a missing temperature day leaves the denominator, not the count", () => {
    // 16-day crop so some water windows avoid the gap: middle stage days 4-6, day 6 max temperature missing.
    const a = assessed(run([heatMiddle], i => (i === 6 ? { maxC: missing() } : [4, 5].includes(i) ? { maxC: 40 } : {}),
      { initial: 2, development: 2, middle: 3, late: 9 }));
    expect(value(cropSeason(a), "temperature_exposure")).toBe(1);
    expect(metric(cropSeason(a), "temperature_exposure").denominator).toEqual({ kind: "available", value: { count: 2, unit: "days" } });
  });
});

describe("unassessed temperature checks", () => {
  it("a crop with no rule is unassessed, never scored as heat-safe, and still gets a plan", () => {
    const result = run([], i => (i === 4 ? { maxC: 45 } : {}));
    const a = assessed(result);
    expect(a.unassessedChecks.some(g => g.code === "temperature_rule" && g.cropPurposeIds.includes(a.occurrences[0].cropPurposeId))).toBe(true);
    expect(cropSeason(a).some(m => m.id === "temperature_exposure" && m.value.kind === "available")).toBe(false);
    expect(metric(a.metrics, "q90_temperature_exposure").value.kind).toBe("unavailable");
  });

  it("only the crop without rules is listed as unassessed", () => {
    const ruled = profile({ id: "ruled", temperatureRules: [rule("heat", null, "max_c", "above", 35)] });
    const bare = profile({ id: "bare" });
    const a = assessed(assessClimate(metricInput({
      horizonDays: 365, profiles: [ruled, bare],
      occurrences: [occurrence(ruled, "2026-07-01"), occurrence(bare, "2026-07-05")],
      cohort: [season("2025-07-01", 8, () => ({ rainMm: 100 }))],
    })));
    const listed = a.unassessedChecks.filter(g => g.code === "temperature_rule").flatMap(g => g.cropPurposeIds);
    expect(listed).toContain("bare");
    expect(listed).not.toContain("ruled");
    expect(metric(a.metrics, "q90_temperature_exposure").value.kind).toBe("available");
  });
});

describe("temperature is a warning, not a ranking input", () => {
  const ranking = ["mean_frequency", "mean_mismatch", "unplanted_days", "longest_unplanted_gap"];

  it("heat changes flags and warnings but leaves every ranking component unchanged", () => {
    const hot = assessed(run([heatMiddle], i => ([4, 5, 6].includes(i) ? { maxC: 40 } : {})));
    const cool = assessed(run([heatMiddle], () => ({})));
    for (const id of ranking) expect(value(hot.metrics, id)).toBe(value(cool.metrics, id));
    expect(hot.flagged).toBe(true);
    expect(hot.warnings.some(w => w.code === "temperature_exposure" && w.cropPurposeIds.includes(hot.occurrences[0].cropPurposeId))).toBe(true);
    expect(cool.flagged).toBe(false);
    expect(cool.warnings.some(w => w.code === "temperature_exposure")).toBe(false);
  });

  it("q90_temperature_exposure is the nearest-rank 90th percentile of season exposure", () => {
    const crop = profile({ id: "crop-a", stageDays: stages, temperatureRules: [heatMiddle] });
    const build = (hotYears: number) => assessed(assessClimate(metricInput({
      horizonDays: 365, profiles: [crop], occurrences: [occurrence(crop, "2026-07-01")],
      cohort: seasons(10, 9, year => (_d, i) => ({ rainMm: 100, ...(year > 2025 - hotYears && i === 4 ? { maxC: 40 } : {}) })),
    })));
    // 1 hot season of 10: sorted [0 x9, 1/3]; ceil(0.9*10) = 9th = 0.
    expect(value(build(1).metrics, "q90_temperature_exposure")).toBe(0);
    // 9 hot seasons: sorted [0, 1/3 x9]; 9th = 1/3.
    expect(value(build(9).metrics, "q90_temperature_exposure")).toBeCloseTo(1 / 3, 6);
  });
});
