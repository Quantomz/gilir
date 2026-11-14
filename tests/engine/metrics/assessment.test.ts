import { describe, expect, it } from "vitest";
import type { MetricInput } from "@/contracts/engine";
import { parseFarmInput } from "@/contracts/input";
import { assessmentMetricSchema, resultDetailsSchema } from "@/contracts/result";
import { assessClimate, buildClimateCohort } from "@/engine/metrics";
import { metricInputFixture, syntheticRegistryFixture } from "@/fixtures/science";
import {
  DRY, WET, assessed, cohortInput, history, metric, metricInput, missing, occurrence, profile, season, seasons, value,
} from "./helpers";

const RANKING = [
  ["mean_frequency", "fraction"], ["mean_mismatch", "fraction"],
  ["unplanted_days", "days"], ["longest_unplanted_gap", "days"],
] as const;

const crop = profile({ id: "crop-a", stageDays: { initial: 2, development: 2, middle: 2, late: 1 } }); // 7 days, Kc 1
const plan = (cohort: MetricInput["cohort"], extra: Partial<Parameters<typeof metricInput>[0]> = {}) =>
  metricInput({ horizonDays: 365, profiles: [crop], occurrences: [occurrence(crop, "2026-07-01")], cohort, ...extra });

describe("shared synthetic fixture", () => {
  it("metricInputFixture is assessed: no shortfall, no heat, 361 days without a planned crop", () => {
    const a = assessed(assessClimate(metricInputFixture));
    expect(a.occurrences).toHaveLength(1);
    expect(value(a.metrics, "mean_frequency")).toBe(0);
    expect(value(a.metrics, "mean_mismatch")).toBe(0);
    expect(value(a.metrics, "unplanted_days")).toBe(361);
    expect(value(a.metrics, "longest_unplanted_gap")).toBe(361);
    expect(a.flagged).toBe(false);
  });
});

describe("result packaging", () => {
  it("returns the four fixed ranking components with their units", () => {
    const a = assessed(assessClimate(plan(seasons(3, 7, () => WET))));
    for (const [id, unit] of RANKING) {
      expect(metric(a.metrics, id).unit).toBe(unit);
      expect(metric(a.metrics, id).value.kind).toBe("available");
    }
  });

  it("retains the raw arithmetic mean for one dry season out of three", () => {
    const a = assessed(assessClimate(plan(seasons(3, 7, year => (year === 2025 ? DRY : WET)))));
    expect(value(a.metrics, "mean_frequency")).toBe(1 / 3);
    expect(value(a.metrics, "mean_mismatch")).toBe(1 / 3);
  });

  it("returns identical raw assessment metrics at ranking precisions 0, 6 and 12", () => {
    const input = plan(seasons(3, 7, year => year === 2025 ? WET : () => ({ rainMm: 2 })));
    const assessments = [0, 6, 12].map(rankingDecimalPlaces => assessed(assessClimate({
      ...input, settings: { ...input.settings, rankingDecimalPlaces },
    })));
    expect(assessments[0]).toEqual(assessments[1]);
    expect(assessments[1]).toEqual(assessments[2]);
    expect(value(assessments[0].metrics, "mean_frequency")).toBe(2 / 3);
    const seasonMismatch = assessments[0].seasonMetrics.map(season => value(season.metrics, "mismatch"));
    expect(value(assessments[0].metrics, "mean_mismatch")).toBe(seasonMismatch.reduce((sum, mismatch) => sum + mismatch, 0) / 3);
  });

  it("q90_mismatch is the nearest-rank 90th percentile of season mismatch", () => {
    const nineDry = assessed(assessClimate(plan(seasons(10, 7, year => (year > 2016 ? DRY : WET)))));
    const oneDry = assessed(assessClimate(plan(seasons(10, 7, year => (year === 2025 ? DRY : WET)))));
    expect(value(nineDry.metrics, "q90_mismatch")).toBe(1); // sorted [0, 1 x9] -> 9th = 1
    expect(value(oneDry.metrics, "q90_mismatch")).toBe(0); //  sorted [0 x9, 1] -> 9th = 0
    expect(value(oneDry.metrics, "mean_mismatch")).toBe(0.1);
  });

  it("returns one season record per replay season, keyed by replay start, at both plan and crop level", () => {
    const cohort = seasons(3, 7, () => WET);
    const a = assessed(assessClimate(plan(cohort)));
    expect(a.seasonMetrics.map(s => s.replayStart)).toEqual(cohort.map(s => s.interval.start));
    expect(a.occurrences[0].seasonMetrics).toHaveLength(3);
    for (const s of a.seasonMetrics) {
      expect(s.metrics.some(m => m.id === "frequency")).toBe(true);
      expect(s.metrics.some(m => m.id === "mismatch")).toBe(true);
    }
  });

  it("occurrences echo the calendar's crop, profile and dates", () => {
    const input = plan(seasons(1, 7, () => WET));
    const a = assessed(assessClimate(input));
    const { seasonMetrics: _ignored, ...echo } = a.occurrences[0];
    expect(echo).toEqual(input.calendar.occurrences[0]);
  });

  it("every metric, warning and unassessed check matches the published result contract", () => {
    const a = assessed(assessClimate(plan(seasons(3, 7, year => (year === 2025 ? DRY : WET)))));
    const details = resultDetailsSchema.unwrap().shape;
    for (const m of [...a.metrics, ...a.seasonMetrics.flatMap(s => s.metrics), ...a.occurrences.flatMap(o => o.seasonMetrics.flatMap(s => s.metrics))]) {
      expect(() => assessmentMetricSchema.parse(m)).not.toThrow();
    }
    expect(() => details.warnings.parse(a.warnings)).not.toThrow();
    expect(() => details.unassessedChecks.parse(a.unassessedChecks)).not.toThrow();
  });
});

describe("flags and warnings", () => {
  it("a rain shortfall sets flagged and adds a rainfall_mismatch warning naming the crop", () => {
    const a = assessed(assessClimate(plan(seasons(3, 7, year => (year === 2025 ? DRY : WET)))));
    expect(a.flagged).toBe(true);
    expect(a.warnings.some(w => w.code === "rainfall_mismatch" && w.cropPurposeIds.includes(crop.cropPurposeId))).toBe(true);
  });

  it("no shortfall and no temperature exposure leaves the plan unflagged", () => {
    const a = assessed(assessClimate(plan(seasons(3, 7, () => WET))));
    expect(a.flagged).toBe(false);
    expect(a.warnings.some(w => w.code === "rainfall_mismatch")).toBe(false);
  });
});

describe("fail closed: missing water evidence gives insufficient_data", () => {
  const insufficient = (input: MetricInput) => {
    const result = assessClimate(input);
    expect(result.kind).toBe("insufficient_data");
    if (result.kind === "insufficient_data") expect(result.missing.length).toBeGreaterThan(0);
    return result;
  };

  const rankingGap = (result: ReturnType<typeof assessClimate>) =>
    result.kind === "insufficient_data" && result.missing.some(g => g.code === "ranking_metric" && g.cropPurposeIds.length > 0);

  it("zero crop demand everywhere (Kc 0) is not a perfect score; it reports a ranking_metric gap", () => {
    const zero = profile({ id: "zero-kc", kc: { initial: 0, middle: 0, end: 0 } });
    expect(rankingGap(insufficient(metricInput({ horizonDays: 365, profiles: [zero], occurrences: [occurrence(zero, "2026-07-01")], cohort: seasons(3, 4, () => DRY) })))).toBe(true);
  });

  it("missing rain across a crop's only window is not read as 0 mm; it reports a ranking_metric gap", () => {
    expect(rankingGap(insufficient(plan([season("2025-07-01", 7, (_d, i) => (i === 3 ? { rainMm: missing() } : {}))])))).toBe(true);
  });

  it("one crop without valid windows in one season blocks the assessment even if others are fine", () => {
    const cohort = [season("2025-07-01", 7, () => WET()), season("2024-07-01", 7, (_d, i) => (i === 3 ? { rainMm: missing() } : {}))];
    insufficient(plan(cohort));
  });

  it("an empty cohort", () => {
    insufficient(plan([]));
  });

  it("unavailable site elevation (ET0 cannot be computed)", () => {
    insufficient(plan(seasons(3, 7, () => WET), { elevationM: missing("No elevation.") }));
  });

  it("an occurrence whose profile is not supplied reports a crop_profile gap", () => {
    const result = insufficient(metricInput({ horizonDays: 365, profiles: [], occurrences: [occurrence(crop, "2026-07-01")], cohort: seasons(3, 7, () => WET) }));
    if (result.kind === "insufficient_data") expect(result.missing.some(g => g.code === "crop_profile")).toBe(true);
  });

  it("a missing temperature rule alone does not block the plan", () => {
    expect(assessClimate(plan(seasons(3, 7, () => WET))).kind).toBe("assessed");
  });
});

describe("rain-only invariance", () => {
  const baseline = plan(seasons(3, 7, year => (year === 2025 ? DRY : WET)));

  it("the farmer's backup-water answer changes nothing (rain only)", () => {
    const args = cohortInput({
      days: history("2022-07-01", "2026-07-01", date => ({ rainMm: date.startsWith("2025") ? 0 : 100 })),
      cutoff: "2026-07-01", horizonStart: "2026-07-01", horizonDays: 365,
      settings: { ...baseline.settings, targetSeasons: 3, minimumUsableSeasons: 3 },
    });
    const results = ["rain_only", "rain_plus_backup", "unsure"].map(water => {
      const run = { ...args.run, input: parseFarmInput({ ...args.run.input, water }) };
      const cohort = buildClimateCohort({ ...args, run });
      expect(cohort.usable).toHaveLength(3);
      const assessment = assessed(assessClimate({
        ...baseline, cohort: cohort.usable, elevationM: cohort.elevationM,
        latitudeDeg: run.input.field.lookup[1], history: run.input.history, settings: run.settings,
      }));
      return { cohort, assessment };
    });
    expect(value(results[0].assessment.metrics, "mean_frequency")).toBeGreaterThan(0);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it("recorded vs skipped field history does not change any metric", () => {
    const skipped = assessed(assessClimate({ ...baseline, history: { kind: "skipped" } }));
    const recorded = assessed(assessClimate(baseline));
    expect(skipped.metrics).toEqual(recorded.metrics);
    expect(skipped.seasonMetrics).toEqual(recorded.seasonMetrics);
  });
});

describe("calendar-origin stage allocation", () => {
  const generatedStages = { initial: 1, development: 1, middle: 5, late: 1 };
  const historicalStages = { initial: 5, development: 1, middle: 1, late: 1 };
  const base = profile({
    id: "origin-stages", stageDays: generatedStages, kc: { initial: 0.1, middle: 2, end: 0.1 },
    temperatureRules: syntheticRegistryFixture.profiles[0].temperatureRules,
  });
  const historicalProfile = { ...base, timing: { ...base.timing, historicalStageAllocations: [historicalStages] } };
  const input = metricInput({
    horizonDays: 365, profiles: [historicalProfile], occurrences: [occurrence(historicalProfile, "2026-07-01")],
    cohort: [season("2025-07-01", 365, (_date, index) => ({ rainMm: 1, maxC: index === 2 ? 40 : 30 }))],
  });
  const baselineInput = { ...input, calendar: { ...input.calendar, origin: "baseline" as const } };

  it("uses the historical Kc and sensitive-stage allocation for a same-duration baseline", () => {
    const generated = assessed(assessClimate(input));
    const historical = assessed(assessClimate(baselineInput));
    expect(value(generated.occurrences[0].seasonMetrics[0].metrics, "mismatch")).toBeCloseTo(0.8769078910959509, 12);
    expect(value(historical.occurrences[0].seasonMetrics[0].metrics, "mismatch")).toBeCloseTo(0.6581719067596703, 12);
    expect(value(generated.occurrences[0].seasonMetrics[0].metrics, "temperature_exposure")).toBe(1 / 5);
    expect(value(historical.occurrences[0].seasonMetrics[0].metrics, "temperature_exposure")).toBe(0);
    expect(generated.warnings.some(warning => warning.code === "temperature_exposure")).toBe(true);
    expect(historical.warnings.some(warning => warning.code === "temperature_exposure")).toBe(false);
  });

  it("accepts repeated identical historical allocations as one distinct allocation", () => {
    const repeated = { ...historicalProfile, timing: { ...historicalProfile.timing, historicalStageAllocations: [historicalStages, { ...historicalStages }] } };
    expect(assessClimate({ ...baselineInput, profiles: [repeated] })).toEqual(assessClimate(baselineInput));
  });

  it("returns a crop-profile gap when historical allocations are absent, mismatched or ambiguous", () => {
    for (const historicalStageAllocations of [[], [{ initial: 1, development: 1, middle: 1, late: 1 }], [historicalStages, generatedStages]]) {
      const p = { ...historicalProfile, timing: { ...historicalProfile.timing, historicalStageAllocations } };
      const result = assessClimate({ ...baselineInput, profiles: [p] });
      expect(result.kind).toBe("insufficient_data");
      expect(metric(result.metrics, "mean_mismatch").value.kind).toBe("unavailable");
      if (result.kind === "insufficient_data") expect(result.missing.some(gap => gap.code === "crop_profile")).toBe(true);
      expect(assessClimate({ ...input, profiles: [p] }).kind).toBe("assessed");
    }
  });

  it("requires generated occupancy to match the generated stages even when historical stages match", () => {
    const shortGenerated = { ...historicalProfile, timing: { ...historicalProfile.timing, generatedStageDays: { initial: 1, development: 1, middle: 1, late: 1 } } };
    const result = assessClimate({ ...input, profiles: [shortGenerated] });
    expect(result.kind).toBe("insufficient_data");
    if (result.kind === "insufficient_data") expect(result.missing.some(gap => gap.code === "crop_profile")).toBe(true);
    expect(assessClimate({ ...baselineInput, profiles: [shortGenerated] }).kind).toBe("assessed");
  });

  it("versions corrected water and temperature methods with origin-specific stage assumptions", () => {
    const result = assessed(assessClimate(baselineInput));
    const water = metric(result.metrics, "mean_mismatch");
    const temperature = metric(result.metrics, "q90_temperature_exposure");
    expect(water.methodVersion).toBe("rain-demand-window-v2");
    expect(temperature.methodVersion).toBe("daily-temperature-rule-v2");
    expect(water.assumptions.join(" ")).toMatch(/historical.*generated|generated.*historical/i);
    expect(temperature.assumptions.join(" ")).toMatch(/historical.*generated|generated.*historical/i);
    expect(water.assumptions.join(" ")).toMatch(/raw|unrounded/i);
    expect(water.assumptions.join(" ")).toContain("Frozen mismatchWindowDays is 7.");
    expect(water.assumptions.join(" ")).toMatch(/radiation.*latitude|latitude.*radiation/i);
    const configured = assessed(assessClimate({ ...baselineInput, settings: { ...baselineInput.settings, mismatchWindowDays: 1 } }));
    const waterMetrics = [
      ...configured.metrics, ...configured.seasonMetrics.flatMap(season => season.metrics),
      ...configured.occurrences.flatMap(occurrence => occurrence.seasonMetrics.flatMap(season => season.metrics)),
    ].filter(metric => metric.methodVersion === "rain-demand-window-v2");
    expect(waterMetrics.length).toBeGreaterThan(0);
    expect(waterMetrics.every(metric => metric.assumptions.join(" ").includes("Frozen mismatchWindowDays is 1."))).toBe(true);
  });
});

describe("determinism", () => {
  it("the same input gives a deep-equal result and the input is not mutated", () => {
    const input = plan(seasons(3, 7, year => (year === 2025 ? DRY : WET)));
    const before = structuredClone(input);
    const first = assessClimate(input);
    const second = assessClimate(input);
    expect(second).toEqual(first);
    expect(input).toEqual(before);
  });
});
