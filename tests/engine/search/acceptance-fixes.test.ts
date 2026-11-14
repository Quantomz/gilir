import { describe, expect, it, vi } from "vitest";
import type { ClimateAssessment, ClimateCohort, FrozenRun, MetricInput } from "@/contracts/engine";
import type { EvidenceValue } from "@/contracts/common";
import type { EvidenceGap } from "@/contracts/result";
import type { HistoryEntry } from "@/contracts/input";
import { parsePlanResult } from "@/contracts/result";
import { calculate } from "@/engine";
import { climateCohortFixture } from "@/fixtures/science";
import { dateAt, ordinal } from "@/engine/search/calendar";
import { allocation, assessment, date, historyRun, options, profile, prohibition, registry, run } from "./fixtures";

const missing: EvidenceGap[] = [{ code: "ranking_metric", reason: "Synthetic required evidence is absent.", cropPurposeIds: [], sourceIds: [] }];
const unavailable = (): ClimateAssessment => ({ kind: "insufficient_data", missing, metrics: [], seasonMetrics: [], warnings: [], unassessedChecks: [] });

describe("accepted E3 corrections", () => {
  it.each<EvidenceValue<number>>([{ kind: "available", value: -500 }, { kind: "unavailable", reason: "E2 could not select a provider elevation." }])(
    "forwards cohort elevation unchanged despite frozen snapshot order, $kind", elevationM => {
      const original = run();
      const first = original.climate[0];
      const snapshots = [{ ...first, id: "synthetic-elevation-low", elevationM: { kind: "available", value: 10 } satisfies EvidenceValue<number> },
        { ...first, id: "synthetic-elevation-high", elevationM: { kind: "available", value: 500 } satisfies EvidenceValue<number> }];
      for (const climate of [snapshots, [...snapshots].reverse()]) {
        const value = { ...original, climate, manifest: { ...original.manifest, climateSnapshotIds: climate.map(item => item.id) } };
        const assess = vi.fn((input: MetricInput) => {
          expect(input.elevationM).toBe(elevationM);
          expect(input.latitudeDeg).toBe(value.input.field.lookup[1]);
          return assessment(input.calendar);
        });
        const result = calculate(value, registry([profile()]), { ...options(assess), buildCohort: () => ({ ...climateCohortFixture, elevationM }) });
        expect(result.state).toBe("plan");
        expect(assess).toHaveBeenCalledOnce();
      }
    });

  it.each([undefined, { kind: "available", value: Infinity }, { kind: "unavailable", reason: "" }, { kind: "invented", reason: "Unknown discriminant." }])(
    "rejects malformed cohort elevation before assessment", elevation => {
      const cohort = { ...climateCohortFixture };
      Reflect.set(cohort, "elevationM", elevation);
      const assess = vi.fn((input: MetricInput) => assessment(input.calendar));
      const result = calculate(run(), registry([profile()]), { ...options(assess), buildCohort: () => cohort });
      expect(result.state).toBe("service_error");
      expect(assess).not.toHaveBeenCalled();
      expect(parsePlanResult(result)).toEqual(result);
    });

  it("rejects malformed annual evidence discriminants before registry resolution", () => {
    const cohort = { ...climateCohortFixture, applicabilityClimate: { ...climateCohortFixture.applicabilityClimate } };
    Reflect.set(cohort.applicabilityClimate, "meanAnnualTemperatureC", { kind: "invented", reason: "Unknown discriminant." });
    expect(calculate(run(), registry([profile()]), { ...options(), buildCohort: () => cohort }).state).toBe("service_error");
  });

  it("compares cohort intervals independently of object key insertion order", () => {
    const cohort: ClimateCohort = { ...climateCohortFixture, usable: climateCohortFixture.usable.map(season => ({ ...season,
      interval: { endExclusive: season.interval.endExclusive, start: season.interval.start } })) };
    expect(calculate(run(), registry([profile()]), { ...options(), buildCohort: () => cohort }).state).toBe("plan");
  });

  it.each(["aggregate", "occurrence"])("rejects foreign and duplicate seasons in %s assessment evidence", scope => {
    const replayStart = climateCohortFixture.usable[0].interval.start;
    for (const seasonMetrics of [[{ replayStart: date("1800-01-01"), metrics: [] }], [{ replayStart, metrics: [] }, { replayStart, metrics: [] }]]) {
      const result = calculate(run(), registry([profile()]), options(input => {
        const response = assessment(input.calendar);
        return scope === "aggregate" ? { ...response, seasonMetrics } : { ...response,
          occurrences: response.occurrences.map(occurrence => ({ ...occurrence, seasonMetrics })) };
      }));
      expect(result.state).toBe("service_error");
    }
  });

  it("accepts supplied assessment seasons from the common cohort", () => {
    const seasonMetrics = climateCohortFixture.usable.map(season => ({ replayStart: season.interval.start, metrics: [] }));
    const result = calculate(run(), registry([profile()]), options(input => ({ ...assessment(input.calendar), seasonMetrics,
      occurrences: input.calendar.occurrences.map(occurrence => ({ ...occurrence, seasonMetrics })) })));
    expect(result.state).toBe("plan");
  });

  it.each(["missing", "malformed"])("preserves interrupted ranking counters after an additional %s assessment", mode => {
    const p = profile("crop-a", 180);
    const assess = vi.fn((input: MetricInput): ClimateAssessment => {
      if (input.calendar.occurrences.length === 1) return assessment(input.calendar);
      if (mode === "missing") return unavailable();
      const response = assessment(input.calendar);
      return { ...response, occurrences: [] };
    });
    const result = calculate(run([p], { gridExpansionLimit: 100, scoredCandidateLimit: 1 }), registry([p]), options(assess));
    expect(result.state).toBe(mode === "missing" ? "insufficient_data" : "service_error");
    expect(result.details.search).toMatchObject({ ranking: "interrupted", gridExpandedStates: 3, scoredCandidates: 1 });
    expect(result.details.warnings.some(item => item.code === "search_limit")).toBe(false);
    expect(assess).toHaveBeenCalledTimes(2);
    expect(parsePlanResult(result)).toEqual(result);
  });

  it("shares every released planting-window edge across the selected crops", () => {
    const a = profile("crop-a");
    const base = profile("crop-b");
    const b: typeof base = { ...base, timing: { ...base.timing, plantingWindows: [{ basis: "recommendation", sourceIds: base.sourceIds,
      window: { startMonthDay: "07-04", endMonthDayInclusive: "07-04" } }] } };
    const rules = [prohibition(["crop-a"], ["crop-a"]), prohibition(["crop-b"], ["crop-a", "crop-b"])];
    const result = calculate(run([a, b], { gridExpansionLimit: 10_000, scoredCandidateLimit: 10_000 }), registry([a, b], rules), options(input => {
      const preferred = input.calendar.occurrences[0]?.planted === "2026-07-04" && input.calendar.occurrences[1]?.planted === "2026-07-08";
      return assessment(input.calendar, [preferred ? 0 : 1, 0, 0, 0]);
    }));
    expect(result.state).toBe("plan");
    if (result.state !== "plan") return;
    expect(result.plan.occurrences.map(item => [item.cropPurposeId, item.planted])).toEqual([[a.cropPurposeId, "2026-07-04"], [b.cropPurposeId, "2026-07-08"]]);
    expect(result.details.search.ranking).toBe("grid_complete");
  });

  it.each([0, 100])("withholds a recommendation if an eligible baseline lacks required evidence with budgets %i", budget => {
    const base = profile("crop-a", 180);
    const p = { ...base, timing: { ...base.timing, historicalStageAllocations: [allocation(4)] } };
    const value = historyRun(p);
    const assess = vi.fn((input: MetricInput) => input.calendar.origin === "baseline" ? unavailable() : assessment(input.calendar));
    const result = calculate({ ...value, settings: { ...value.settings, structuralExpansionLimit: budget,
      gridExpansionLimit: budget, scoredCandidateLimit: budget } }, registry([p]), options(assess));
    expect(result.state).toBe("insufficient_data");
    if (result.state === "insufficient_data") expect(result.missing).toEqual(missing);
    expect(result.details.baseline).toMatchObject({ kind: "not_assessable", reasons: [expect.stringContaining("Required evidence")] });
    expect(result.details.search.ranking).toBe("not_started");
    expect(assess).toHaveBeenCalledOnce();
  });

  it.each(["resolution", "assessment"])("requires missing physical or regulatory rule evidence from %s", boundary => {
    const gap: EvidenceGap = { code: "rotation_rule", reason: "A referenced physical successor constraint is missing.", cropPurposeIds: [profile().cropPurposeId], sourceIds: [] };
    const ports = options(() => ({ ...unavailable(), kind: "insufficient_data", missing: [gap] }));
    const result = calculate(run(), registry([profile()]), boundary === "assessment" ? ports : {
      ...options(), resolveRegistry: (lookup, release) => ({ profiles: release.profiles.filter(item => lookup.cropPurposeIds.includes(item.cropPurposeId)), rules: [], gaps: [gap] }),
    });
    expect(result.state).toBe("insufficient_data");
    if (result.state === "insufficient_data") expect(result.missing).toContainEqual(gap);
  });

  it.each<EvidenceGap["code"]>(["climate", "crop_profile", "ranking_metric", "rotation_rule"])(
    "withholds a plan when an assessed response leaves required %s evidence unassessed", code => {
      const p = profile("crop-a", 365);
      const gap: EvidenceGap = { code, reason: "Synthetic required evidence remains unassessed.", cropPurposeIds: [p.cropPurposeId], sourceIds: [] };
      const result = calculate(run([p]), registry([p]), options(input => ({ ...assessment(input.calendar), unassessedChecks: [gap] })));
      expect(result.state).toBe("insufficient_data");
      if (result.state === "insufficient_data") expect(result.missing).toEqual([gap]);
      expect("plan" in result).toBe(false);
      expect(parsePlanResult(result)).toEqual(result);
    });

  it.each<EvidenceGap["code"]>(["temperature_rule", "history"])("preserves optional assessed %s gaps with a plan", code => {
    const p = profile("crop-a", 365);
    const gap: EvidenceGap = { code, reason: "Synthetic optional evidence remains unassessed.", cropPurposeIds: [p.cropPurposeId], sourceIds: [] };
    const result = calculate(run([p]), registry([p]), options(input => ({ ...assessment(input.calendar), unassessedChecks: [gap] })));
    expect(result.state).toBe("plan");
    expect(result.details.unassessedChecks).toContainEqual(gap);
  });

  it.each(["first", "later", "both"])("limits an unknown predecessor gap to the selected first crop when rules target %s crops", target => {
    const a = profile("crop-a", 180);
    const b = profile("crop-b", 180);
    const successors = target === "first" ? [a.cropPurposeId] : target === "later" ? [b.cropPurposeId] : [a.cropPurposeId, b.cropPurposeId];
    const result = calculate(run([a, b]), registry([a, b], [prohibition(["old-context"], successors)]), options());
    expect(result.state).toBe("plan");
    if (result.state !== "plan") return;
    expect(result.plan.occurrences.map(item => item.cropPurposeId)).toEqual([a.cropPurposeId, b.cropPurposeId]);
    const gaps = result.details.unassessedChecks.filter(item => item.code === "history");
    expect(gaps).toHaveLength(target === "later" ? 0 : 1);
    if (target !== "later") expect(gaps[0].cropPurposeIds).toEqual([a.cropPurposeId]);
  });

  it("discloses selected-crop predecessor uncertainty when no plan was selected", () => {
    const a = profile("crop-a", 180);
    const b = profile("crop-b", 180);
    const result = calculate(run([a, b], { structuralExpansionLimit: 0 }), registry([a, b], [prohibition(["old-context"], [b.cropPurposeId])]), options());
    expect(result.state).toBe("search_incomplete");
    expect(result.details.unassessedChecks).toContainEqual(expect.objectContaining({ code: "history", cropPurposeIds: [b.cropPurposeId] }));
  });

  it.each(["skipped", "uncovered_tail", "unsupported", "known_fallow"])("discloses unknown successor checks at the initial boundary for %s history", mode => {
    const p = profile();
    const value = historyRun(p);
    if (value.input.history.kind !== "recorded") throw new Error("Expected recorded fixture.");
    const history = value.input.history;
    const input: FrozenRun["input"] = { ...value.input, history: mode === "skipped" ? { kind: "skipped" } : mode === "uncovered_tail"
      ? { ...history, entries: history.entries.slice(0, 1) } : mode === "unsupported" ? { ...history, entries: history.entries.map(entry => entry.kind === "crop"
        ? { ...entry, crop: { kind: "unsupported", label: "Unknown preceding crop" } } : entry) } : history };
    const result = calculate({ ...value, input }, registry([p], [prohibition(["previous-crop"], ["crop-a"])]), options());
    expect(result.state).toBe("plan");
    const gaps = result.details.unassessedChecks.filter(item => item.code === "history");
    expect(gaps.length).toBe(mode === "known_fallow" ? 0 : 1);
    if (mode !== "known_fallow") expect(gaps[0]).toMatchObject({ cropPurposeIds: [p.cropPurposeId], reason: expect.stringContaining("predecessor") });
  });

  it("does not add a predecessor gap without applicable successor constraints", () => {
    expect(calculate(run(), registry([profile()]), options()).details.unassessedChecks.filter(item => item.code === "history")).toEqual([]);
  });

  it("assesses more than twelve supported historical purposes without applying the selected-crop cap", () => {
    const previous = Array.from({ length: 13 }, (_, index) => profile(`old-${index}`));
    const p = profile("selected", 365);
    const value = run([p]);
    const start = date("2025-07-01");
    const input: FrozenRun["input"] = { ...value.input, history: { kind: "recorded", start, endExclusive: date("2026-07-01"), entries: [
      ...previous.map((item, index): HistoryEntry => ({ kind: "crop", id: `history-${index}`, crop: { kind: "catalogue", cropPurposeId: item.cropPurposeId },
        planted: dateAt(ordinal(start) + index * 4), harvested: dateAt(ordinal(start) + index * 4 + 3), plantedPrecision: "exact", harvestedPrecision: "exact" })),
      { kind: "fallow", id: "known-fallow", start: dateAt(ordinal(start) + 52), endExclusive: date("2026-07-01") },
    ] } };
    const result = calculate({ ...value, input }, registry([p, ...previous]), options());
    expect(result.state).toBe("plan");
    expect(result.details.baseline).toMatchObject({ kind: "assessed", eligible: false, occurrences: expect.arrayContaining(previous.map(item => expect.objectContaining({ cropPurposeId: item.cropPurposeId }))) });
  });

  it.each(["lookup", "validation"])("withholds optional historical comparison after an extras-only %s failure", failure => {
    const previous = profile("old-context");
    const p = profile("new-selected", 365);
    const original = historyRun(previous);
    const value = { ...original, input: { ...original.input, cropPurposeIds: [p.cropPurposeId] } };
    const ports = options();
    const result = calculate(value, registry([p, previous]), { ...ports, resolveRegistry: (lookup, release) => {
      if (lookup.cropPurposeIds.includes(previous.cropPurposeId)) {
        if (failure === "lookup") throw new Error("Historical-only lookup failed.");
        return { profiles: [p], rules: [], gaps: [] };
      }
      return { profiles: release.profiles.filter(item => lookup.cropPurposeIds.includes(item.cropPurposeId)), rules: [], gaps: [] };
    } });
    expect(result.state).toBe("plan");
    expect(result.details.baseline).toMatchObject({ kind: "not_assessable", reasons: [expect.stringContaining("processing failed")] });
    expect(result.details.provenance.profiles.map(item => item.cropPurposeId)).toEqual([p.cropPurposeId]);
  });
});
