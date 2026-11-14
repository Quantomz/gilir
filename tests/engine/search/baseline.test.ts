import { describe, expect, it } from "vitest";
import { calculate } from "@/engine";
import { modelBaseline, initialPredecessor } from "@/engine/search/baseline";
import { horizonFor } from "@/engine/search/calendar";
import { allocation, assessment, date, historyRun, id, options, profile, registry, run } from "./fixtures";
import type { FrozenRun } from "@/contracts/engine";

function model(value: FrozenRun, profiles = [profile()]) {
  return modelBaseline(value.input, horizonFor(value.input.planningStart), profiles, []);
}

function record(value = historyRun()) {
  if (value.input.history.kind !== "recorded") throw new Error("Expected recorded history.");
  return value.input.history;
}

describe("historical modeling", () => {
  it("distinguishes skipped, unsupported, unknown coverage, and explicit fallow", () => {
    expect(model(run())).toMatchObject({ kind: "unavailable", comparison: { kind: "not_recorded" } });
    const value = historyRun();
    const history = record(value);
    expect(model({ ...value, input: { ...value.input, history: { ...history, entries: history.entries.slice(0, 1) } } })).toMatchObject({ kind: "unavailable", comparison: { kind: "not_assessable" } });
    expect(model(value)).toMatchObject({ kind: "modeled", eligible: true });
    const unsupported = history.entries.map(entry => entry.kind === "crop" ? { ...entry, crop: { kind: "unsupported" as const, label: "Uncatalogued crop" } } : entry);
    expect(model({ ...value, input: { ...value.input, history: { ...history, entries: unsupported } } })).toMatchObject({ kind: "unavailable", comparison: { reasons: [expect.stringContaining("no supported")] } });
    const fallow = { ...value, input: { ...value.input, history: { ...history, entries: [{ kind: "fallow" as const, id: "fallow", start: history.start, endExclusive: history.endExclusive }] } } };
    expect(model(fallow)).toMatchObject({ kind: "modeled", eligible: false, calendar: { occurrences: [] } });
    expect(initialPredecessor(fallow.input)).toBeNull();
  });

  it("withholds unsupported or ambiguous historical allocations without blocking a new plan", () => {
    const p = profile("crop-a", 180);
    const value = historyRun(p);
    expect(model(value, [p])).toMatchObject({ kind: "unavailable", comparison: { reasons: [expect.stringContaining("stage allocation")] } });
    expect(calculate(value, registry([p]), options()).state).toBe("plan");
    const ambiguous = { ...p, timing: { ...p.timing, historicalStageAllocations: [allocation(5), { initial: 2, development: 1, middle: 1, late: 1 }] } };
    const history = record(value);
    const changed = { ...value, input: { ...value.input, history: { ...history, entries: [
      ...history.entries.filter(item => item.kind === "crop").map(item => ({ ...item, harvested: date("2025-07-05") })),
      { kind: "fallow" as const, id: "fallow", start: date("2025-07-06"), endExclusive: history.endExclusive },
    ] } } };
    expect(model(changed, [ambiguous]).kind).toBe("unavailable");
  });

  it("uses one common year shift for a December-crossing sequence", () => {
    const p = profile();
    const value = run([p]);
    const history: FrozenRun["input"]["history"] = { kind: "recorded", start: date("2024-07-01"), endExclusive: date("2025-07-01"), entries: [
      { kind: "fallow", id: "start", start: date("2024-07-01"), endExclusive: date("2024-12-30") },
      { kind: "crop", id: "crossing", crop: { kind: "catalogue", cropPurposeId: p.cropPurposeId }, planted: date("2024-12-30"), harvested: date("2025-01-02"), plantedPrecision: "exact", harvestedPrecision: "exact" },
      { kind: "fallow", id: "end", start: date("2025-01-03"), endExclusive: date("2025-07-01") },
    ] };
    expect(model({ ...value, input: { ...value.input, history } })).toMatchObject({ kind: "modeled", calendar: { occurrences: [{ planted: "2026-12-30", lastOccupied: "2027-01-02" }] } });
  });

  it("requires a separately supported allocation when leap translation changes duration", () => {
    const p = profile("crop-a", 5);
    const value = { ...run([p]), input: { ...run([p]).input, planningStart: date("2025-01-01"), history: { kind: "recorded" as const,
      start: date("2024-01-01"), endExclusive: date("2025-01-01"), entries: [
        { kind: "fallow" as const, id: "before", start: date("2024-01-01"), endExclusive: date("2024-02-27") },
        { kind: "crop" as const, id: "crop", crop: { kind: "catalogue" as const, cropPurposeId: p.cropPurposeId }, planted: date("2024-02-27"), harvested: date("2024-03-02"), plantedPrecision: "exact" as const, harvestedPrecision: "exact" as const },
        { kind: "fallow" as const, id: "after", start: date("2024-03-03"), endExclusive: date("2025-01-01") },
      ] } } };
    expect(model(value, [p]).kind).toBe("unavailable");
    const supported = { ...p, timing: { ...p.timing, historicalStageAllocations: [allocation(5), allocation(4)] } };
    expect(model(value, [supported])).toMatchObject({ kind: "modeled", calendar: { occurrences: [{ planted: "2025-02-27", lastOccupied: "2025-03-02" }] } });
  });

  it("retains unselected modelable history as context, and missing extras affect only comparison", () => {
    const old = profile("old-crop");
    const selected = profile("new-crop");
    const value = { ...historyRun(old), input: { ...historyRun(old).input, cropPurposeIds: [selected.cropPurposeId] } };
    const result = calculate(value, registry([old, selected]), options());
    expect(result.state).toBe("plan");
    expect(result.details.baseline).toMatchObject({ kind: "assessed", eligible: false, recommendation: "changed" });
    expect(result.details.provenance.profiles.map(item => item.cropPurposeId)).toContain(id("old-crop"));
    const noHistoryProfile = calculate(value, registry([old, selected]), { ...options(), resolveRegistry: lookup => ({ profiles: lookup.cropPurposeIds.includes(selected.cropPurposeId) ? [selected] : [], rules: [], gaps: [] }) });
    expect(noHistoryProfile.state).toBe("plan");
    expect(noHistoryProfile.details.baseline.kind).toBe("not_assessable");
  });

  it("keeps eligible baselines under zero search budgets and labels approximate history", () => {
    const value = historyRun(profile(), true);
    const result = calculate({ ...value, settings: { ...value.settings, structuralExpansionLimit: 0 } }, registry([profile()]), options());
    expect(result.state).toBe("plan");
    expect(result.details.baseline).toMatchObject({ kind: "assessed", eligible: true, recommendation: "kept", approximateDates: true });
    expect(result.details.warnings.some(item => item.code === "approximate_history")).toBe(true);
    expect(result.details.assumptions).toContain("Keep the existing rotation. Its supported translated calendar is the selected plan.");
  });

  it("allows an eligible supported historical duration before a generated-duration impossibility proof", () => {
    const base = profile("crop-a", 366);
    const p = { ...base, timing: { ...base.timing, historicalStageAllocations: [allocation(4)] } };
    const value = historyRun(p);
    const result = calculate({ ...value, settings: { ...value.settings, structuralExpansionLimit: 0 } }, registry([p]), options());
    expect(result.state).toBe("plan");
    expect(result.details.baseline).toMatchObject({ kind: "assessed", recommendation: "kept" });
    expect(result.details.search.structuralExpandedStates).toBe(0);
  });

  it("keeps a hard-window violation contextual without making it eligible", () => {
    const base = profile();
    const p = { ...base, timing: { ...base.timing, plantingWindows: [{ basis: "hard_constraint" as const, sourceIds: base.sourceIds,
      window: { startMonthDay: "07-02", endMonthDayInclusive: "07-02" } }] } };
    const value = historyRun(p);
    expect(model(value, [p])).toMatchObject({ kind: "modeled", eligible: false });
    const result = calculate(value, registry([p]), options());
    expect(result.state).toBe("plan");
    expect(result.details.baseline).toMatchObject({ kind: "assessed", eligible: false, recommendation: "changed" });
  });

  it("clips explicit fallow outside the horizon while translating the complete crop sequence", () => {
    const value = historyRun();
    const history = record(value);
    const changed = { ...value, input: { ...value.input, history: { ...history, start: date("2010-07-01"), entries: [
      { kind: "fallow" as const, id: "older-known-fallow", start: date("2010-07-01"), endExclusive: date("2025-07-01") }, ...history.entries,
    ] } } };
    expect(model(changed)).toMatchObject({ kind: "modeled", eligible: true, calendar: { occurrences: [{ planted: "2026-07-01" }] } });
  });

  it("keeps all-fallow history distinct from skipped history without inventing water metrics", () => {
    const value = historyRun();
    const history = record(value);
    const changed = { ...value, input: { ...value.input, history: { ...history, entries: [{ kind: "fallow" as const, id: "known-fallow", start: history.start, endExclusive: history.endExclusive }] } } };
    const result = calculate(changed, registry([profile()]), options(input => input.calendar.occurrences.length ? assessment(input.calendar) : {
      kind: "insufficient_data", metrics: [], seasonMetrics: [], warnings: [], unassessedChecks: [],
      missing: [{ code: "ranking_metric", reason: "No crop windows in the explicitly fallow historical calendar.", cropPurposeIds: [], sourceIds: [] }],
    }));
    expect(result.state).toBe("plan");
    expect(result.details.baseline.kind).toBe("not_assessable");
    expect(changed.input.history.entries).toHaveLength(1);
  });

  it("keeps unavailable contextual water evidence out of the required-candidate path", () => {
    const old = profile("old-crop");
    const p = profile("crop-a");
    const value = { ...historyRun(old), input: { ...historyRun(old).input, cropPurposeIds: [p.cropPurposeId] } };
    const result = calculate(value, registry([p, old]), options(input => input.calendar.origin === "baseline" ? {
      kind: "insufficient_data", metrics: [], seasonMetrics: [], warnings: [], unassessedChecks: [],
      missing: [{ code: "ranking_metric", reason: "No valid historical windows.", cropPurposeIds: [], sourceIds: [] }],
    } : assessment(input.calendar)));
    expect(result.state).toBe("plan");
    expect(result.details.baseline.kind).toBe("not_assessable");
  });
});
