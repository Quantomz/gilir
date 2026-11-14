import { describe, expect, it } from "vitest";
import { rankCandidates } from "@/engine/search";
import { calendarKey } from "@/engine/search/calendar";
import { candidate, metrics, occurrence, profile } from "./fixtures";

function winner(candidates: ReturnType<typeof candidate>[], precision = 6) {
  const result = rankCandidates({ candidates, rankingDecimalPlaces: precision });
  if (result.kind !== "selected") throw new Error("Expected a selected candidate.");
  return result;
}

describe("fixed water-first ordering", () => {
  it.each([
    [[0.1, 0.9, 30, 20], [0.2, 0.1, 0, 0], "mean_frequency"],
    [[0.1, 0.1, 30, 20], [0.1, 0.2, 0, 0], "mean_mismatch"],
    [[0.1, 0.1, 10, 10], [0.1, 0.1, 20, 0], "unplanted_days"],
    [[0.1, 0.1, 10, 2], [0.1, 0.1, 10, 8], "longest_unplanted_gap"],
  ])("uses the first differing metric %#", (better, worse, metricId) => {
    const selected = candidate("crop-z", better);
    const second = candidate("crop-a", worse);
    const result = winner([second, selected]);
    expect(result.candidate).toBe(selected);
    expect(result.decision).toMatchObject({ kind: "metric", metricId, comparedCalendarKey: calendarKey(second.calendar) });
  });

  it("selects the unflagged pool before metrics and the best warning calendar when all are flagged", () => {
    const warning = candidate("crop-a", [0, 0, 0, 0], true);
    const safe = candidate("crop-b", [1, 1, 30, 20]);
    expect(winner([warning, safe]).decision).toMatchObject({ kind: "environmental_pool", selectedFlagged: false, otherFlagged: true });
    const worse = candidate("crop-b", [0.2, 0.1, 20, 10], true);
    expect(winner([warning, worse]).candidate).toBe(warning);
  });

  it("compares rounded values with exact toFixed semantics and keeps raw evidence", () => {
    const a = candidate("crop-a", [0.2000001, 0.2, 20, 10]);
    const b = candidate("crop-b", [0.2000002, 0.1, 20, 10]);
    expect(winner([a, b]).candidate).toBe(b);
    expect(winner([a, b], 7).candidate).toBe(a);
    const rounded = winner([candidate("crop-a", [0.15, 0, 0, 0])], 1);
    expect(rounded.rankingTuple.components[0].value).toBe(Number((0.15).toFixed(1)));
    expect(rounded.candidate.assessment.metrics[0].value).toEqual({ kind: "available", value: 0.15 });
  });

  it("applies baseline, fewer occurrences, then code-unit canonical ties", () => {
    const baseline = candidate("crop-z", undefined, false, "baseline");
    const other = candidate("crop-a");
    expect(winner([other, baseline]).decision.kind).toBe("baseline");
    const two = { ...other, calendar: { ...other.calendar, occurrences: [...other.calendar.occurrences, occurrence(profile("crop-a"), "2026-07-05")] } };
    const twoAssessed = { ...two, assessment: { ...other.assessment, occurrences: two.calendar.occurrences.map(item => ({ ...item, seasonMetrics: [] })) } };
    expect(winner([twoAssessed, candidate("crop-b")]).decision.kind).toBe("fewer_occurrences");
    expect(winner([candidate("crop-z"), candidate("crop-a")]).candidate.calendar.occurrences[0].cropPurposeId).toBe("crop-a");
    expect(winner([candidate("crop-z"), candidate("crop-a")]).decision.kind).toBe("canonical");
    expect(winner([other]).decision.kind).toBe("only_candidate");
  });

  it("names the final runner-up after later candidates displace earlier incumbents", () => {
    const first = candidate("crop-a", [0.8, 0, 0, 0]);
    const best = candidate("crop-b", [0.1, 0, 0, 0]);
    const second = candidate("crop-c", [0.2, 0, 0, 0]);
    expect(winner([first, best, second]).decision).toMatchObject({ kind: "metric", comparedCalendarKey: calendarKey(second.calendar), selectedValue: 0.1, otherValue: 0.2 });
  });

  it("deduplicates baseline/generated identities and preserves the baseline tie preference", () => {
    const generated = candidate();
    const baseline = { ...generated, calendar: { ...generated.calendar, origin: "baseline" as const } };
    const result = winner([generated, baseline]);
    expect(result.candidate.calendar.origin).toBe("baseline");
    expect(result.decision.kind).toBe("only_candidate");
  });
});

describe("ranking boundary", () => {
  it("returns none only for empty input", () => {
    expect(rankCandidates({ candidates: [], rankingDecimalPlaces: 6 })).toEqual({ kind: "none" });
    const value = candidate();
    expect(() => winner([{ ...value, assessment: { ...value.assessment, metrics: [] } }])).toThrow();
  });

  it.each(["missing", "duplicate", "unavailable", "unit", "negative", "fraction", "fractional-days", "longest-gap", "nan"])("rejects %s required evidence", mode => {
    const value = candidate();
    let changed = metrics();
    if (mode === "missing") changed = changed.slice(1);
    if (mode === "duplicate") changed = [...changed, changed[0]];
    if (mode === "unavailable") changed[0] = { ...changed[0], value: { kind: "unavailable", reason: "No valid windows." } };
    if (mode === "unit") changed[0] = { ...changed[0], unit: "days" };
    if (mode === "negative") changed[0] = { ...changed[0], value: { kind: "available", value: -1 } };
    if (mode === "fraction") changed[0] = { ...changed[0], value: { kind: "available", value: 2 } };
    if (mode === "fractional-days") changed[2] = { ...changed[2], value: { kind: "available", value: 1.5 } };
    if (mode === "longest-gap") changed[3] = { ...changed[3], value: { kind: "available", value: 30 } };
    if (mode === "nan") changed[0] = { ...changed[0], value: { kind: "available", value: NaN } };
    expect(() => winner([{ ...value, assessment: { ...value.assessment, metrics: changed } }])).toThrow();
  });

  it.each([-1, 1.5, 13, NaN])("rejects invalid frozen precision %s", precision => {
    expect(() => winner([candidate()], precision)).toThrow();
  });

  it("rejects changed assessment occurrences at its public boundary", () => {
    const value = candidate();
    expect(() => winner([{ ...value, assessment: { ...value.assessment, occurrences: [] } }])).toThrow();
  });
});
