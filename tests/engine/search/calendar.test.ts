import { describe, expect, it } from "vitest";
import type { CalendarSearchInput } from "@/contracts/engine";
import { findCalendar } from "@/engine/search";
import { calendarProblems, compileCalendar, horizonFor } from "@/engine/search/calendar";
import { enumerateGrid } from "@/engine/search/grid";
import { initialPredecessor } from "@/engine/search/baseline";
import { date, historyRun, id, occurrence, profile, prohibition } from "./fixtures";

const input = (days = 10, profiles = [profile()]): CalendarSearchInput => ({
  horizon: { start: date("2026-07-01"), endExclusive: date(`2026-07-${String(days + 1).padStart(2, "0")}`) },
  cropPurposeIds: profiles.map(p => p.cropPurposeId), profiles, hardConstraints: [], initialPredecessor: null, eligibleBaseline: null, expansionLimit: 100_000,
});

describe("daily calendar proof", () => {
  it("uses inclusive occupancy, final turnaround, every crop, and no substitutions", () => {
    const request = input(12, [profile("grain", 4, 2), profile("cover", 4, 2)]);
    const result = findCalendar(request);
    expect(result.kind).toBe("witness");
    if (result.kind !== "witness") return;
    expect(new Set(result.calendar.occurrences.map(item => item.cropPurposeId))).toEqual(new Set(request.cropPurposeIds));
    expect(result.calendar.occurrences.at(-1)?.fieldAvailable).toBe(request.horizon.endExclusive);
    expect(calendarProblems(result.calendar, compileCalendar(request))).toEqual([]);
    expect(findCalendar({ ...request, horizon: input(11).horizon })).toMatchObject({ kind: "proved_impossible", expandedStates: 0,
      proof: { kind: "duration_lower_bound", mandatoryMinimumDays: 12 } });
  });

  it("uses anniversary horizons and keeps leap-only hard windows unavailable in non-leap years", () => {
    expect(horizonFor(date("2024-02-29"))).toEqual({ start: date("2024-02-29"), endExclusive: date("2025-02-28") });
    const p = profile();
    const leap = { ...p, timing: { ...p.timing, plantingWindows: [{ basis: "hard_constraint" as const,
      sourceIds: p.sourceIds, window: { startMonthDay: "02-29", endMonthDayInclusive: "02-29" } }] } };
    expect(findCalendar({ ...input(10, [leap]), horizon: { start: date("2025-02-25"), endExclusive: date("2025-03-10") } }).kind).toBe("proved_impossible");
    expect(findCalendar({ ...input(10, [leap]), horizon: { start: date("2024-02-25"), endExclusive: date("2024-03-10") } })).toMatchObject({ kind: "witness",
      calendar: { occurrences: [{ planted: "2024-02-29" }] } });
  });

  it("allows wrapped hard windows and does not use recommendations to reject a calendar", () => {
    const p = profile();
    const windows = { ...p, timing: { ...p.timing, plantingWindows: [{ basis: "hard_constraint" as const, sourceIds: p.sourceIds,
      window: { startMonthDay: "12-25", endMonthDayInclusive: "01-05" } }] } };
    expect(findCalendar({ ...input(10, [windows]), horizon: { start: date("2026-12-30"), endExclusive: date("2027-01-10") } }).kind).toBe("witness");
    const recommendation = { ...p, timing: { ...p.timing, plantingWindows: [{ ...windows.timing.plantingWindows[0], basis: "recommendation" as const }] } };
    expect(findCalendar(input(10, [recommendation])).kind).toBe("witness");
  });

  it("retains a daily witness away from weekly starts", () => {
    const p = profile();
    const narrow = { ...p, timing: { ...p.timing, plantingWindows: [{ basis: "hard_constraint" as const, sourceIds: p.sourceIds,
      window: { startMonthDay: "07-03", endMonthDayInclusive: "07-03" } }] } };
    expect(findCalendar(input(10, [narrow]))).toMatchObject({ kind: "witness", calendar: { occurrences: [{ planted: "2026-07-03" }] } });
  });

  it("preserves predecessor through waits and explicitly recorded fallow", () => {
    const request = { ...input(), initialPredecessor: id("previous"), hardConstraints: [prohibition(["previous"], ["crop-a"])] };
    expect(findCalendar(request).kind).toBe("proved_impossible");
    expect(findCalendar({ ...request, initialPredecessor: null }).kind).toBe("witness");
    const historical = historyRun();
    expect(initialPredecessor(historical.input)).toBe(id("crop-a"));
    if (historical.input.history.kind !== "recorded") return;
    expect(initialPredecessor({ ...historical.input, history: { ...historical.input.history, endExclusive: date("2026-06-30"),
      entries: historical.input.history.entries.slice(0, 1) } })).toBeNull();
  });

  it("distinguishes zero, interrupted, and exact exhaustion budgets", () => {
    expect(findCalendar({ ...input(), expansionLimit: 0 }).kind).toBe("limit_reached");
    const blocked = { ...input(4), hardConstraints: [prohibition(["previous"], ["crop-a"])], initialPredecessor: id("previous") };
    const complete = findCalendar(blocked);
    expect(complete).toMatchObject({ kind: "proved_impossible", expandedStates: 1 });
    expect(findCalendar({ ...blocked, expansionLimit: 1 })).toEqual(complete);
    expect(findCalendar({ ...blocked, expansionLimit: 0 })).toMatchObject({ kind: "limit_reached", expandedStates: 0 });
    expect(findCalendar({ ...input(4), expansionLimit: 1 }).kind).toBe("witness");
  });

  it("validates the independent baseline before a generated-duration proof", () => {
    const p = profile("crop-a", 8);
    const supported = { ...p, timing: { ...p.timing, historicalStageAllocations: [profile().timing.generatedStageDays] } };
    const request = input(4, [supported]);
    const baseline = { origin: "baseline" as const, horizon: request.horizon, occurrences: [occurrence(supported)] };
    expect(findCalendar({ ...request, expansionLimit: 0, eligibleBaseline: baseline })).toMatchObject({ kind: "witness", expandedStates: 0 });
    expect(findCalendar({ ...request, expansionLimit: 0, eligibleBaseline: { ...baseline, occurrences: [] } }).kind).toBe("proved_impossible");
  });

  it("matches a separate exhaustive daily oracle over small complete state spaces", () => {
    for (let horizon = 8; horizon <= 13; horizon++) for (let forbidden = 0; forbidden < 16; forbidden++) {
      const profiles = [profile("crop-a"), profile("crop-b")];
      const rules = profiles.flatMap((a, i) => profiles.flatMap((b, j) => forbidden & (1 << (i * 2 + j)) ? [prohibition([a.cropPurposeId], [b.cropPurposeId])] : []));
      const request = { ...input(horizon, profiles), initialPredecessor: id("crop-a"), hardConstraints: rules };
      const oracle = (day: number, previous: string, included: Set<string>): boolean => {
        if (included.size === 2) return true;
        if (day + 4 > horizon) return false;
        for (const p of profiles) {
          if (rules.some(rule => rule.predicate.predecessorCropPurposeIds.some(id => id === previous) && rule.predicate.successorCropPurposeIds.includes(p.cropPurposeId))) continue;
          if (oracle(day + 4, p.cropPurposeId, new Set([...included, p.cropPurposeId]))) return true;
        }
        return oracle(day + 1, previous, included);
      };
      expect(findCalendar(request).kind === "witness").toBe(oracle(0, "crop-a", new Set()));
    }
  });
});

describe("ranking date traversal", () => {
  it("emits repeats, unique calendars, stable date order, and exact prefix counts", () => {
    const domain = compileCalendar(input(8));
    const iterator = enumerateGrid(domain, 7, 100, null);
    const results = [];
    let next = iterator.next();
    while (!next.done) { results.push(next.value.calendar); next = iterator.next(); }
    expect(results.map(item => item.occurrences.length)).toEqual([1, 2]);
    expect(next.value).toEqual({ kind: "grid_complete", expandedStates: 3 });
    const exact = enumerateGrid(domain, 7, 3, null);
    expect([...exact]).toHaveLength(2);
    const limited = enumerateGrid(domain, 7, 2, null);
    expect(limited.next().done).toBe(false);
    expect(limited.next()).toEqual({ done: true, value: { kind: "limit_reached", expandedStates: 2 } });
  });

  it("counts dead prefixes independently of complete calendars", () => {
    const request = { ...input(8, [profile("crop-a"), profile("crop-b")]), hardConstraints: [prohibition(["crop-a"], ["crop-b"]), prohibition(["crop-b"], ["crop-a"])] };
    const iterator = enumerateGrid(compileCalendar(request), 7, 1, null);
    expect(iterator.next()).toEqual({ done: true, value: { kind: "limit_reached", expandedStates: 1 } });
  });
});
