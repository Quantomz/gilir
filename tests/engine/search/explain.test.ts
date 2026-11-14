import { describe, expect, it } from "vitest";
import { calculate } from "@/engine";
import { explainResult } from "@/engine/explain";
import { rankCandidates } from "@/engine/search";
import type { ExplanationInput, FrozenRun } from "@/contracts/engine";
import { releasedRegistrySchema } from "@/contracts/registry";
import { parsePlanResult } from "@/contracts/result";
import { climateCohortFixture } from "@/fixtures/science";
import { assessment, candidate, date, historyRun, metrics, occurrence, options, profile, registry, run } from "./fixtures";

function explanation(): ExplanationInput {
  const selected = candidate("crop-a", [0.1, 0.1, 20, 10]);
  const ranked = rankCandidates({ candidates: [candidate("crop-b", [0.2, 0.1, 20, 10]), selected], rankingDecimalPlaces: 6 });
  if (ranked.kind !== "selected") throw new Error("Expected a ranked fixture.");
  const initial = calculate(run(), registry([profile()]), options());
  return { run: run(), profiles: [profile()], rules: [], outcome: { state: "plan", plan: { horizon: selected.calendar.horizon,
    occurrences: selected.assessment.occurrences, rankingTuple: ranked.rankingTuple } }, selected, decision: ranked.decision,
    baseline: { kind: "not_recorded" }, cohort: climateCohortFixture.coverage, insights: [], search: initial.details.search,
    provenance: initial.details.provenance };
}

describe("deterministic result explanations", () => {
  it("states the observed deciding metric and values, and never invents a tied metric advantage", () => {
    const input = explanation();
    expect(explainResult(input).explanation).toContain("mean_frequency: 0.1 versus 0.2 fraction");
    expect(explainResult({ ...input, decision: { kind: "canonical", comparedCalendarKey: "synthetic-comparison" } }).explanation).toContain("All metrics");
    expect(explainResult({ ...input, decision: { kind: "only_candidate" } }).explanation).toContain("sole assessed");
    expect(explainResult({ ...input, decision: { kind: "environmental_pool", comparedCalendarKey: "synthetic-comparison", selectedFlagged: false, otherFlagged: true } }).explanation).toContain("runner-up was flagged");
  });

  it("matches repeated crops chronologically and emits additions, removals, date shifts, and order changes", () => {
    const input = explanation();
    const a = profile("crop-a");
    const b = profile("crop-b");
    const c = profile("crop-c");
    const before = [occurrence(a), occurrence(b, "2026-07-05"), occurrence(a, "2026-07-09")];
    const after = [occurrence(a, "2026-07-02"), occurrence(a, "2026-07-07"), occurrence(c, "2026-07-11")];
    const selected = { calendar: { ...candidate().calendar, occurrences: after }, assessment: assessment({ ...candidate().calendar, occurrences: after }, [0.2, 0.1, 20, 10]) };
    const result = explainResult({ ...input, selected, baseline: { kind: "assessed", recommendation: "no_recommendation", eligible: false, approximateDates: true,
      occurrences: before.map(item => ({ ...item, seasonMetrics: [] })), metrics: metrics([0, 0, 30, 10]), deltas: [], changes: [] } });
    expect(result.baseline.kind).toBe("assessed");
    if (result.baseline.kind !== "assessed") return;
    expect(result.baseline.recommendation).toBe("changed");
    expect(result.baseline.changes.map(change => change.kind)).toEqual(["date_shift", "date_shift", "order_change", "added", "removed"]);
    const shifts = result.baseline.changes.filter(change => change.kind === "date_shift");
    expect(shifts[1].before.planted).toBe("2026-07-09");
    expect(result.baseline.deltas[0]).toEqual({ metricId: "mean_frequency", difference: { kind: "available", value: 0.2 }, unit: "fraction", direction: "lower_preferred" });
    expect(JSON.stringify(result)).not.toContain("Infinity");
  });

  it("preserves source references, frozen product metadata, and visible synthetic climate labels", () => {
    const p = profile();
    const base = registry([p]);
    const { label: _label, ...releaseFields } = base;
    const released = releasedRegistrySchema.parse({ ...releaseFields, kind: "released",
      profiles: [{ ...p, status: "released", review: { reviewer: "E3 fixture reviewer", reviewedOn: "2026-01-01" } }],
      sources: [{ id: "synthetic:no-publication", title: "Invented source for provenance behavior test", url: "https://example.org/e3-fixture",
        section: "Synthetic section", publishedOn: { kind: "unavailable", reason: "No real publication." }, extractedOn: "2026-01-01" }],
    });
    const original = run();
    const value: FrozenRun = { ...original, climate: original.climate.map(snapshot => ({ ...snapshot, products: [{
      provider: "Synthetic provider", product: "Synthetic rain", version: { kind: "available", value: "synthetic-v2" },
      stream: { kind: "unavailable", reason: "No real stream." }, cellId: "synthetic-cell", gridDegrees: [0.1, 0.1], timeStandard: "UTC",
      sourceUrl: "https://example.org/synthetic-climate", fields: [{ field: "rainMm", providerField: "SYNTHETIC_RAIN", originalUnit: "mm/day", canonicalUnit: "mm/day", conversionVersion: "synthetic-identity" }],
      missingDatesByField: [{ field: "rainMm", dates: [date("2000-07-05")] }],
    }] })) };
    const result = calculate(value, released, options());
    expect(result.state).toBe("plan");
    expect(result.details.provenance.kind).toBe("synthetic");
    expect(result.details.provenance.sources).toEqual(released.sources);
    expect(result.details.provenance.climateProducts).toEqual([{ provider: "Synthetic provider", product: "Synthetic rain", version: { kind: "available", value: "synthetic-v2" },
      stream: { kind: "unavailable", reason: "No real stream." }, cellId: "synthetic-cell", gridDegrees: [0.1, 0.1], timeStandard: "UTC", sourceUrl: "https://example.org/synthetic-climate",
      unitsByField: [{ field: "rainMm", canonicalUnit: "mm/day", originalUnit: "mm/day" }], missingDayCounts: [{ field: "rainMm", missingDays: 1 }] }]);
    expect(result.details.provenance.manifest).toEqual({ kind: "available", value: value.manifest });
    expect(result.details.preparation).toEqual([{ templateId: p.preparation[0].id, text: p.preparation[0].text, sourceIds: p.preparation[0].sourceIds }]);
    expect(parsePlanResult(result)).toEqual(result);
  });

  it("preserves separate synthetic registry and climate labels without truncation", () => {
    const value = run();
    const release = { ...registry([profile()]), label: "Synthetic registry. " + "R".repeat(200) };
    const climateLabel = "Synthetic climate. " + "C".repeat(200);
    const changed = { ...value, climate: value.climate.map(snapshot => ({ ...snapshot, kind: "synthetic" as const, label: climateLabel })) };
    const result = calculate(changed, release, options());
    expect(result.details.assumptions).toContain(release.label);
    expect(result.details.assumptions).toContain(climateLabel);
    expect(parsePlanResult(result)).toEqual(result);
  });

  it("treats missing released source references as a processing error", () => {
    const p = profile();
    const base = registry([p]);
    const { label: _label, ...releaseFields } = base;
    const released = releasedRegistrySchema.parse({ ...releaseFields, kind: "released",
      profiles: [{ ...p, status: "released", review: { reviewer: "E3 fixture reviewer", reviewedOn: "2026-01-01" } }] });
    expect(calculate(run(), released, options()).state).toBe("service_error");
  });

  it("reports a changed baseline with raw new-minus-old values and retains approximate uncertainty", () => {
    const value = historyRun(profile(), true);
    const p = profile();
    const result = calculate({ ...value, settings: { ...value.settings, gridExpansionLimit: 100, scoredCandidateLimit: 1 } }, registry([p]), options(input =>
      assessment(input.calendar, input.calendar.origin === "baseline" ? [0.5, 0.2, 30, 10] : [0.1, 0.1, 20, 10])));
    expect(result.details.baseline).toMatchObject({ kind: "assessed", recommendation: "changed", approximateDates: true,
      deltas: [{ metricId: "mean_frequency", difference: { kind: "available", value: -0.4 } },
        { metricId: "mean_mismatch", difference: { kind: "available", value: -0.1 } },
        { metricId: "unplanted_days", difference: { kind: "available", value: -10 } },
        { metricId: "longest_unplanted_gap", difference: { kind: "available", value: 0 } }] });
    expect(result.details.warnings.some(warning => warning.code === "approximate_history")).toBe(true);
    expect(result.details.baseline.kind === "assessed" && result.details.baseline.changes.some(change => change.kind === "added")).toBe(true);
  });
});
