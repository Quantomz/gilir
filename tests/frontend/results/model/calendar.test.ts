import { afterEach, describe, expect, it } from "vitest";
import { parseFarmInput, parseIsoDate, parsePlanResult } from "@/contracts";
import type { Plan } from "@/contracts";
import { addDays, baselineSpans, daysBetween, monthStarts, planSpans, reportedSpans, shareOf } from "@/features/results/model/calendar";
import type { RecordedHistory } from "@/features/results/model/calendar";
import { inputFixture, unsupportedHistoryFixture } from "@/fixtures/input";
import { resultFixtures } from "@/fixtures/results";
import { everySnapshot, shared, variant } from "../support/variants";

const realZone = process.env.TZ;
afterEach(() => {
  if (realZone === undefined) delete process.env.TZ;
  else process.env.TZ = realZone;
});

const date = parseIsoDate;

function recorded(history: unknown): RecordedHistory {
  const parsed = parseFarmInput({ ...inputFixture, history }).history;
  if (parsed.kind !== "recorded") throw new Error("Expected a recorded history.");
  return parsed;
}

function everyPlan(): readonly { readonly name: string; readonly plan: Plan }[] {
  return everySnapshot().flatMap(({ name, snapshot }) => ("plan" in snapshot.result ? [{ name, plan: snapshot.result.plan }] : []));
}

/** The plan fixture with other occurrences, parsed by the contract so an impossible calendar fails here. */
function planWith(occurrences: readonly { readonly planted: string; readonly lastOccupied: string; readonly fieldAvailable: string }[]): Plan {
  const [template] = resultFixtures.plan.plan.occurrences;
  const result = parsePlanResult({
    ...resultFixtures.plan,
    plan: { ...resultFixtures.plan.plan, occurrences: occurrences.map(dates => ({ ...template, ...dates })) },
  });
  if (result.state !== "plan") throw new Error("Expected a plan.");
  return result.plan;
}

describe("days", () => {
  it("[R36] addDays and daysBetween work on UTC midnights: across a year end and 29 February, with TZ set west and east of UTC", () => {
    for (const zone of ["Pacific/Honolulu", "Pacific/Kiritimati"]) {
      process.env.TZ = zone;
      expect(addDays(date("2026-12-31"), 1)).toBe("2027-01-01");
      expect(addDays(date("2027-01-01"), -1)).toBe("2026-12-31");
      expect(addDays(date("2028-02-28"), 1)).toBe("2028-02-29");
      expect(addDays(date("2028-02-29"), 1)).toBe("2028-03-01");
      expect(addDays(date("2027-02-28"), 1)).toBe("2027-03-01");
      expect(addDays(date("2026-03-28"), 2)).toBe("2026-03-30");
      expect(daysBetween(date("2026-12-31"), date("2027-01-01"))).toBe(1);
      expect(daysBetween(date("2028-02-28"), date("2028-03-01"))).toBe(2);
      expect(daysBetween(date("2028-03-01"), date("2028-02-28"))).toBe(-2);
      expect(daysBetween(date("2026-07-01"), date("2027-07-01"))).toBe(365);
      expect(daysBetween(date("2027-07-01"), date("2028-07-01"))).toBe(366);
    }
  });

  it("shareOf is 0 at the start, 1 at the end and clamped outside; monthStarts lists each first of a month inside the year", () => {
    const year = { start: date("2026-07-01"), endExclusive: date("2027-07-01") };
    expect(shareOf(year, date("2026-07-01"))).toBe(0);
    expect(shareOf(year, date("2027-07-01"))).toBe(1);
    expect(shareOf(year, date("2025-01-01"))).toBe(0);
    expect(shareOf(year, date("2028-01-01"))).toBe(1);
    expect(shareOf(year, date("2026-07-02"))).toBeCloseTo(1 / 365);
    expect(monthStarts(year)).toEqual([
      "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01",
      "2027-01-01", "2027-02-01", "2027-03-01", "2027-04-01", "2027-05-01", "2027-06-01",
    ]);
    expect(monthStarts({ start: date("2026-12-15"), endExclusive: date("2027-02-15") })).toEqual(["2027-01-01", "2027-02-01"]);
  });
});

describe("planSpans", () => {
  it("spans tile the horizon: every day once, in order, for every plan fixture and variant", () => {
    const plans = everyPlan();
    expect(plans.map(({ name }) => name)).toEqual(expect.arrayContaining(["plan", "plan_with_warnings", "changed", "several_crops", "temperature"]));
    for (const { name, plan } of plans) {
      let next = plan.horizon.start;
      for (const span of planSpans(plan)) {
        const [first, last] = span.kind === "crop" ? [span.planted, span.lastOccupied] : [span.first, span.last];
        expect(first, name).toBe(next);
        expect(span.kind === "crop" ? span.occupiedDays : span.openDays, name).toBe(daysBetween(first, last) + 1);
        next = addDays(last, 1);
      }
      expect(next, name).toBe(plan.horizon.endExclusive);
    }
  });

  it("[R40] the plan fixture has one crop span (1 to 4 Jul 2026, 4 days) and one open span from 5 Jul 2026 to 30 Jun 2027 of 361 days, 1 of them after harvest", () => {
    expect(planSpans(shared("plan").result.plan)).toEqual([
      {
        kind: "crop", order: 1, cropPurposeId: "synthetic-crop",
        planted: "2026-07-01", lastOccupied: "2026-07-04", fieldAvailable: "2026-07-06", occupiedDays: 4,
      },
      { kind: "open", first: "2026-07-05", last: "2027-06-30", openDays: 361, afterHarvestDays: 1, after: "synthetic-crop" },
    ]);
  });

  it("[R40] the open days sum to the tuple’s unplanted_days and the longest open span equals longest_unplanted_gap, for every plan fixture and variant", () => {
    for (const { name, plan } of everyPlan()) {
      const open = planSpans(plan).flatMap(span => (span.kind === "open" ? [span.openDays] : []));
      const [, , unplanted, longest] = plan.rankingTuple.components;
      expect(open.reduce((sum, days) => sum + days, 0), name).toBe(unplanted.value);
      expect(Math.max(0, ...open), name).toBe(longest.value);
    }
  });

  it("days before the first crop are an open span with after null and no after-harvest days; an open span that is all turnaround has afterHarvestDays equal to openDays", () => {
    const spans = planSpans(planWith([
      { planted: "2026-07-11", lastOccupied: "2026-07-20", fieldAvailable: "2026-07-24" },
      { planted: "2026-07-24", lastOccupied: "2026-08-10", fieldAvailable: "2026-08-12" },
    ]));
    expect(spans.map(span => span.kind)).toEqual(["open", "crop", "open", "crop", "open"]);
    expect(spans[0]).toEqual({ kind: "open", first: "2026-07-01", last: "2026-07-10", openDays: 10, afterHarvestDays: 0, after: null });
    expect(spans[2]).toEqual({ kind: "open", first: "2026-07-21", last: "2026-07-23", openDays: 3, afterHarvestDays: 3, after: "synthetic-crop" });
    expect(spans[4]).toMatchObject({ first: "2026-08-11", last: "2027-06-30", afterHarvestDays: 1 });
  });

  it("a crop planted the day after the last harvest leaves no open span between them", () => {
    const spans = planSpans(planWith([
      { planted: "2026-07-01", lastOccupied: "2026-07-04", fieldAvailable: "2026-07-05" },
      { planted: "2026-07-05", lastOccupied: "2027-06-30", fieldAvailable: "2027-07-02" },
    ]));
    expect(spans.map(span => (span.kind === "crop" ? span.order : span.kind))).toEqual([1, 2]);
  });

  it("a repeated crop gets two crop spans with their own order numbers (several_crops)", () => {
    const snapshot = variant("several_crops");
    if (!("plan" in snapshot.result)) throw new Error("several_crops is a plan.");
    const crops = planSpans(snapshot.result.plan).flatMap(span => (span.kind === "crop" ? [[span.order, span.cropPurposeId, span.planted]] : []));
    expect(crops).toEqual([
      [1, "maize-grain", "2026-07-08"],
      [2, "common-bean-dry", "2026-10-20"],
      [3, "rice-paddy", "2027-01-20"],
      [4, "maize-grain", "2027-05-03"],
    ]);
  });
});

describe("baselineSpans", () => {
  it("[R12] the changed variant’s baseline occurrences are laid on the plan’s own year; a stretch outside the year is cut at the edge", () => {
    const { result } = variant("changed");
    if (!("plan" in result) || result.details.baseline.kind !== "assessed") throw new Error("changed is a plan with an assessed baseline.");
    const spans = baselineSpans(result.plan, result.details.baseline);
    expect(spans).toEqual([
      {
        kind: "crop", order: 1, cropPurposeId: "synthetic-old",
        planted: "2026-06-20", lastOccupied: "2026-08-15", fieldAvailable: "2026-08-17", occupiedDays: 57,
      },
      { kind: "open", first: "2026-08-16", last: "2026-08-31", openDays: 16, afterHarvestDays: 1, after: "synthetic-old" },
      {
        kind: "crop", order: 2, cropPurposeId: "synthetic-bean",
        planted: "2026-09-01", lastOccupied: "2026-11-30", fieldAvailable: "2026-12-02", occupiedDays: 91,
      },
      { kind: "open", first: "2026-12-01", last: "2027-01-09", openDays: 40, afterHarvestDays: 1, after: "synthetic-bean" },
      {
        kind: "crop", order: 3, cropPurposeId: "synthetic-crop",
        planted: "2027-01-10", lastOccupied: "2027-04-30", fieldAvailable: "2027-05-02", occupiedDays: 111,
      },
      { kind: "open", first: "2027-05-01", last: "2027-06-30", openDays: 61, afterHarvestDays: 1, after: "synthetic-crop" },
    ]);
    expect(shareOf(result.plan.horizon, date("2026-06-20"))).toBe(0);
    expect(shareOf(result.plan.horizon, date("2026-08-16"))).toBeCloseTo(46 / 365);
  });
});

describe("reportedSpans", () => {
  it("[R13] the unsupported-history input gives an unlisted crop, an empty stretch and not_sure for the rest; a blank is never empty", () => {
    if (unsupportedHistoryFixture.history.kind !== "recorded") throw new Error("Expected a recorded history.");
    expect(reportedSpans(unsupportedHistoryFixture.history)).toEqual([
      {
        kind: "crop", crop: { unlisted: "Synthetic unlisted crop" },
        planted: "2025-07-01", harvested: "2025-07-04", plantedAbout: true, harvestedAbout: true,
      },
      { kind: "empty", first: "2025-07-05", last: "2025-07-31", spanDays: 27 },
      { kind: "not_sure", first: "2025-08-01", last: "2026-06-30", spanDays: 334 },
    ]);
  });

  it("approximate ends are carried per end", () => {
    const spans = reportedSpans(recorded({
      kind: "recorded",
      start: "2025-07-01",
      endExclusive: "2026-07-01",
      entries: [
        {
          kind: "crop", id: "late", crop: { kind: "catalogue", cropPurposeId: "rice-paddy" },
          planted: "2026-01-10", harvested: "2026-05-20", plantedPrecision: "approximate", harvestedPrecision: "exact",
        },
        {
          kind: "crop", id: "early", crop: { kind: "catalogue", cropPurposeId: "maize-grain" },
          planted: "2025-07-01", harvested: "2025-10-30", plantedPrecision: "exact", harvestedPrecision: "approximate",
        },
      ],
    }));
    expect(spans).toEqual([
      {
        kind: "crop", crop: { listed: "maize-grain" },
        planted: "2025-07-01", harvested: "2025-10-30", plantedAbout: false, harvestedAbout: true,
      },
      { kind: "not_sure", first: "2025-10-31", last: "2026-01-09", spanDays: 71 },
      {
        kind: "crop", crop: { listed: "rice-paddy" },
        planted: "2026-01-10", harvested: "2026-05-20", plantedAbout: true, harvestedAbout: false,
      },
      { kind: "not_sure", first: "2026-05-21", last: "2026-06-30", spanDays: 41 },
    ]);
  });
});
