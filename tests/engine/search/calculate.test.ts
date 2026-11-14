import { describe, expect, it, vi } from "vitest";
import { calculate } from "@/engine";
import type { CalculateOptions } from "@/engine";
import type { ClimateAssessment, FrozenRun, MetricInput } from "@/contracts/engine";
import { parsePlanResult } from "@/contracts/result";
import { climateCohortFixture } from "@/fixtures/science";
import { allocation, metrics, assessment, date, historyRun, id, options, profile, registry, run } from "./fixtures";

function resultFor(assess: (input: MetricInput) => ClimateAssessment, value = run()) {
  return calculate(value, registry([profile()]), options(assess));
}

const missing = [{ code: "ranking_metric" as const, reason: "Synthetic required metric unavailable.", cropPurposeIds: [], sourceIds: [] }];
const optional = { code: "temperature_rule" as const, reason: "No supported temperature threshold.", cropPurposeIds: [], sourceIds: [] };

describe("composition and result states", () => {
  it("returns all six states with strict result payloads", () => {
    const cases = [
      calculate(run(), registry([profile()]), options()),
      resultFor(input => assessment(input.calendar, undefined, true)),
      resultFor(() => ({ kind: "insufficient_data", missing, metrics: [], seasonMetrics: [], warnings: [], unassessedChecks: [] })),
      calculate(run([profile("crop-a", 366)]), registry([profile("crop-a", 366)]), options()),
      calculate(run([profile()], { structuralExpansionLimit: 0 }), registry([profile()]), options()),
      resultFor(() => { throw new Error("Injected processing failure."); }),
    ];
    expect(cases.map(value => value.state)).toEqual(["plan", "plan_with_warnings", "insufficient_data", "no_calendar_fit", "search_incomplete", "service_error"]);
    for (const result of cases) {
      expect(parsePlanResult(result)).toEqual(result);
      if (result.state !== "plan" && result.state !== "plan_with_warnings") expect("plan" in result).toBe(false);
    }
  });

  it("forwards annual applicability unchanged and retains optional missing temperature checks", () => {
    const release = registry([profile()]);
    const lookup = vi.fn<NonNullable<CalculateOptions["resolveRegistry"]>>(input => {
      expect(input.climate).toBe(climateCohortFixture.applicabilityClimate);
      return { profiles: release.profiles, rules: [], gaps: [optional] };
    });
    const value = calculate(run(), release, { ...options(input => ({ ...assessment(input.calendar), unassessedChecks: [optional] })),
      resolveRegistry: lookup, buildCohort: () => ({ ...climateCohortFixture, gaps: [optional] }) });
    expect(value.state).toBe("plan");
    expect(lookup).toHaveBeenCalledOnce();
    expect(value.details.unassessedChecks).toContainEqual(optional);
  });

  it("keeps available insights when required cohort or selected-profile evidence is missing", () => {
    const insights = [{ metric: metrics()[0], month: null, period: { kind: "unavailable" as const, reason: "Synthetic period is incomplete." } }];
    const absentCohort = calculate(run(), registry([profile()]), { ...options(), buildCohort: () => ({ ...climateCohortFixture, insights,
      usable: [], coverage: { kind: "unavailable", reason: "Not enough seasons." } }) });
    expect(absentCohort.state).toBe("insufficient_data");
    expect(absentCohort.details.insights).toEqual(insights);
    const absentProfile = calculate(run(), registry([profile()]), { ...options(), resolveRegistry: () => ({ profiles: [], rules: [], gaps: [] }) });
    expect(absentProfile.state).toBe("insufficient_data");
  });

  it.each(["removed", "added", "crop", "profile", "version", "planting", "occupancy", "release", "reordered"])("rejects assessor %s changes", mode => {
    const p = [profile("crop-a", 180), profile("crop-b", 180)];
    const result = calculate(run(p), registry(p), options(input => {
      const response = assessment(input.calendar);
      let occurrences = [...response.occurrences];
      if (mode === "removed") occurrences = occurrences.slice(1);
      if (mode === "added") occurrences.push(occurrences[0]);
      if (mode === "reordered") occurrences.reverse();
      if (mode === "crop") occurrences[0] = { ...occurrences[0], cropPurposeId: id("different-crop") };
      if (mode === "profile") occurrences[0] = { ...occurrences[0], profileId: "different-profile" };
      if (mode === "version") occurrences[0] = { ...occurrences[0], profileVersion: "different-version" };
      if (mode === "planting") occurrences[0] = { ...occurrences[0], planted: date("2026-07-02") };
      if (mode === "occupancy") occurrences[0] = { ...occurrences[0], lastOccupied: date("2026-12-01") };
      if (mode === "release") occurrences[0] = { ...occurrences[0], fieldAvailable: date("2026-12-30") };
      return { ...response, occurrences };
    }));
    expect(result.state).toBe("service_error");
  });

  it("classifies missing metrics as insufficient and contradictory metrics as processing failure", () => {
    const missingMetric = resultFor(input => { const response = assessment(input.calendar); return { ...response, metrics: response.metrics.slice(1) }; });
    expect(missingMetric.state).toBe("insufficient_data");
    const duplicate = resultFor(input => { const response = assessment(input.calendar); return { ...response, metrics: [...response.metrics, response.metrics[0]] }; });
    expect(duplicate.state).toBe("service_error");
    const badUnit = resultFor(input => { const response = assessment(input.calendar); return { ...response, metrics: response.metrics.map(metric => metric.id === "mean_frequency" ? { ...metric, unit: "days" } : metric) }; });
    expect(badUnit.state).toBe("service_error");
  });

  it("rejects conflicting resolved profiles and cohort coverage as processing failures", () => {
    const different = { ...profile(), timing: { ...profile().timing, generatedStageDays: allocation(100) } };
    expect(calculate(run(), registry([profile()]), { ...options(), resolveRegistry: () => ({ profiles: [different], rules: [], gaps: [] }) }).state).toBe("service_error");
    expect(calculate(run(), registry([profile()]), { ...options(), buildCohort: () => ({ ...climateCohortFixture, usable: [] }) }).state).toBe("service_error");
  });

  it.each(["buildCohort", "resolveRegistry", "assess"])("turns malformed %s responses into a processing result", dependency => {
    const ports = options();
    Reflect.set(ports, dependency, () => null);
    const result = calculate(run(), registry([profile()]), ports);
    expect(result.state).toBe("service_error");
    expect(parsePlanResult(result)).toEqual(result);
  });

  it("counts additional unavailable assessments and withholds the plan even after a valid witness", () => {
    const p = profile("crop-a", 180);
    const assess = vi.fn((input: MetricInput): ClimateAssessment => input.calendar.occurrences.length === 1
      ? assessment(input.calendar) : { kind: "insufficient_data", missing, metrics: [], seasonMetrics: [], warnings: [], unassessedChecks: [] });
    const result = calculate(run([p], { gridExpansionLimit: 100, scoredCandidateLimit: 1 }), registry([p]), options(assess));
    expect(result.state).toBe("insufficient_data");
    expect(result.details.search.scoredCandidates).toBe(1);
    expect(assess).toHaveBeenCalledTimes(2);
  });

  it("preserves seed assessments for independent zero budgets and discloses limits", () => {
    for (const settings of [{ gridExpansionLimit: 0, scoredCandidateLimit: 100 }, { gridExpansionLimit: 100, scoredCandidateLimit: 0 }]) {
      const assess = vi.fn((input: MetricInput) => assessment(input.calendar));
      const result = calculate(run([profile()], settings), registry([profile()]), options(assess));
      expect(result.state).toBe("plan");
      expect(result.details.search).toMatchObject({ ranking: "limit_reached", scoredCandidates: 0 });
      expect(result.details.warnings.some(item => item.code === "search_limit")).toBe(true);
      expect(assess).toHaveBeenCalledOnce();
    }
  });

  it("reports exact score and prefix exhaustion as complete only with no remaining work", () => {
    const base = profile("crop-a", 364);
    const p = { ...base, timing: { ...base.timing, plantingWindows: [{ basis: "recommendation" as const, sourceIds: base.sourceIds,
      window: { startMonthDay: "07-02", endMonthDayInclusive: "07-02" } }] } };
    const complete = calculate(run([p], { gridExpansionLimit: 3, scoredCandidateLimit: 1 }), registry([p]), options());
    expect(complete.details.search).toMatchObject({ ranking: "grid_complete", gridExpandedStates: 3, scoredCandidates: 1 });
    const prefixLimited = calculate(run([p], { gridExpansionLimit: 2, scoredCandidateLimit: 1 }), registry([p]), options());
    expect(prefixLimited.details.search).toMatchObject({ ranking: "limit_reached", gridExpandedStates: 2, scoredCandidates: 0 });
    const scoreLimited = calculate(run([p], { gridExpansionLimit: 3, scoredCandidateLimit: 0 }), registry([p]), options());
    expect(scoreLimited.details.search).toMatchObject({ ranking: "limit_reached", gridExpandedStates: 3, scoredCandidates: 0 });
    const only = profile("crop-a", 365);
    const zeroExact = calculate(run([only], { gridExpansionLimit: 2, scoredCandidateLimit: 0 }), registry([only]), options());
    expect(zeroExact.details.search).toMatchObject({ ranking: "grid_complete", gridExpandedStates: 2, scoredCandidates: 0 });
  });

  it("allows a repeated crop to win without dropping mandatory purposes", () => {
    const p = profile("crop-a", 180);
    const result = calculate(run([p], { gridExpansionLimit: 100, scoredCandidateLimit: 1 }), registry([p]), options(input =>
      assessment(input.calendar, [0.1, 0.1, input.calendar.occurrences.length === 2 ? 5 : 185, 5])));
    expect(result.state).toBe("plan");
    if (result.state !== "plan") return;
    expect(result.plan.occurrences).toHaveLength(2);
    expect(result.details.explanation).toContain("unplanted_days");
  });

  it("assesses the baseline witness once outside additional budgets", () => {
    const assess = vi.fn((input: MetricInput) => assessment(input.calendar));
    const result = calculate(historyRun(), registry([profile()]), options(assess));
    expect(result.details.baseline).toMatchObject({ kind: "assessed", recommendation: "kept" });
    expect(assess).toHaveBeenCalledOnce();
    expect(result.details.search.scoredCandidates).toBe(0);
  });

  it("withholds a plan when the eligible baseline seed lacks required evidence", () => {
    const assess = vi.fn((): ClimateAssessment => ({ kind: "insufficient_data", missing, metrics: [], seasonMetrics: [], warnings: [], unassessedChecks: [] }));
    const result = calculate(historyRun(), registry([profile()]), options(assess));
    expect(result.state).toBe("insufficient_data");
    expect(assess).toHaveBeenCalledOnce();
  });

  it("is deterministic and leaves frozen inputs unchanged", () => {
    const value = run();
    const release = registry([profile()]);
    const before = JSON.stringify({ value, release });
    const freeze = (item: unknown): void => {
      if (item === null || typeof item !== "object") return;
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    };
    freeze(value);
    freeze(release);
    const first = calculate(value, release, options());
    expect(calculate(value, release, options())).toEqual(first);
    expect(JSON.stringify({ value, release })).toBe(before);
    expect(first.details.provenance.manifest).toEqual({ kind: "available", value: value.manifest });
  });

  it("does not change ranking when the water answer changes", () => {
    const value = run();
    const first = calculate(value, registry([profile()]), options());
    const backup: FrozenRun = { ...value, input: { ...value.input, water: "rain_plus_backup" } };
    const second = calculate(backup, registry([profile()]), options());
    expect(first.state).toBe("plan");
    expect(second.state).toBe("plan");
    if (first.state !== "plan" || second.state !== "plan") return;
    expect(second.plan).toEqual(first.plan);
    expect(second.details.warnings.some(warning => warning.code === "water_context")).toBe(true);
  });
});
