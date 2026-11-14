import { describe, expect, it } from "vitest";
import {
  assessmentMetricSchema, parseCropPurposeId, parseIsoDate, syntheticRegistrySchema,
} from "@/contracts";
import type {
  AssessedCandidate, AssessmentMetric, CalendarOccurrence, CalendarSearchInput,
  CandidateCalendar, CropProfile, CropPurposeId, IsoDate, RankingInput, RotationRule,
} from "@/contracts";
import { findCalendar, rankCandidates } from "@/engine/search";
import { syntheticRegistryFixture } from "@/fixtures/science";

const DAY_MS = 86_400_000;
const sourceIds = ["synthetic:no-publication"];
const label = "Independent synthetic acceptance data; not farm advice.";
const seedProfile = syntheticRegistryFixture.profiles[0];
if (!seedProfile) throw new Error("The shared synthetic profile fixture is required.");

function shift(date: IsoDate, days: number): IsoDate {
  return parseIsoDate(new Date(Date.parse(date + "T00:00:00Z") + days * DAY_MS).toISOString().slice(0, 10));
}

function distance(start: IsoDate, end: IsoDate): number {
  return (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / DAY_MS;
}

type Window = CropProfile["timing"]["plantingWindows"][number];
type CropSpec = {
  readonly id: string;
  readonly days?: number;
  readonly turnaround?: number;
  readonly purpose?: CropProfile["purpose"];
  readonly windows?: readonly Window[];
};
type Prohibition = readonly [predecessor: string, successor: string];

function window(startMonthDay: string, endMonthDayInclusive = startMonthDay, basis: Window["basis"] = "hard_constraint"): Window {
  return { window: { startMonthDay, endMonthDayInclusive }, basis, sourceIds };
}

function registry(crops: readonly CropSpec[], prohibited: readonly Prohibition[] = []) {
  const rules: readonly RotationRule[] = prohibited.map(([predecessor, successor], index) => ({
    status: "synthetic", id: "independent-rule-" + index, version: "independent-v1",
    target: "Independent synthetic successor restriction", category: "physical_or_regulatory",
    applicability: seedProfile.applicability,
    predicate: {
      kind: "prohibit_successor",
      predecessorCropPurposeIds: [parseCropPurposeId(predecessor)],
      successorCropPurposeIds: [parseCropPurposeId(successor)],
    },
    limitations: [label], preparation: [], sourceIds,
  }));
  return syntheticRegistrySchema.parse({
    ...syntheticRegistryFixture,
    catalogue: {
      version: "independent-v1",
      entries: crops.map(crop => ({ id: crop.id, label: crop.id, purpose: crop.purpose ?? "food" })),
    },
    profiles: crops.map(crop => {
      const allocation = { initial: 1, development: 1, middle: 1, late: (crop.days ?? 4) - 3 };
      return {
        ...seedProfile, id: "profile-" + crop.id, version: "independent-v1", cropPurposeId: crop.id,
        commonName: crop.id, purpose: crop.purpose ?? "food", temperatureRules: [],
        rotationRuleIds: rules.map(rule => rule.id),
        timing: {
          ...seedProfile.timing, generatedStageDays: allocation, historicalStageAllocations: [allocation],
          plantingWindows: crop.windows ?? [],
          turnaround: { basis: "scheduling_assumption", days: crop.turnaround ?? 0, assumption: label },
        },
      };
    }),
    rules,
  });
}

function searchInput(
  crops: readonly CropSpec[], horizonDays: number,
  options: {
    readonly start?: string;
    readonly prohibited?: readonly Prohibition[];
    readonly predecessor?: string | null;
    readonly expansionLimit?: number;
  } = {},
): CalendarSearchInput {
  const data = registry(crops, options.prohibited);
  const start = parseIsoDate(options.start ?? "2026-01-01");
  return {
    horizon: { start, endExclusive: shift(start, horizonDays) },
    cropPurposeIds: data.catalogue.entries.map(entry => entry.id), profiles: data.profiles,
    hardConstraints: data.rules, initialPredecessor: options.predecessor ? parseCropPurposeId(options.predecessor) : null,
    eligibleBaseline: null, expansionLimit: options.expansionLimit ?? 1_000_000,
  };
}

function duration(profile: CropProfile): number {
  const stages = profile.timing.generatedStageDays;
  return stages.initial + stages.development + stages.middle + stages.late;
}

function allowedAt(profile: CropProfile, date: IsoDate): boolean {
  const hard = profile.timing.plantingWindows.filter(entry => entry.basis === "hard_constraint");
  const monthDay = date.slice(5);
  return hard.length === 0 || hard.some(({ window: bounds }) => {
    if (bounds.startMonthDay <= bounds.endMonthDayInclusive) {
      return bounds.startMonthDay <= monthDay && monthDay <= bounds.endMonthDayInclusive;
    }
    return monthDay >= bounds.startMonthDay || monthDay <= bounds.endMonthDayInclusive;
  });
}

function prohibitedTransition(input: CalendarSearchInput, previous: CropPurposeId | null, next: CropPurposeId): boolean {
  return previous !== null && input.hardConstraints.some(rule =>
    rule.predicate.predecessorCropPurposeIds.includes(previous)
      && rule.predicate.successorCropPurposeIds.includes(next));
}

function occurrence(profile: CropProfile, planted: IsoDate): CalendarOccurrence {
  return {
    cropPurposeId: profile.cropPurposeId, profileId: profile.id, profileVersion: profile.version,
    planted, lastOccupied: shift(planted, duration(profile) - 1),
    fieldAvailable: shift(planted, duration(profile) + profile.timing.turnaround.days),
  };
}

function exhaustiveWitness(input: CalendarSearchInput): readonly CalendarOccurrence[] | null {
  const horizonDays = distance(input.horizon.start, input.horizon.endExclusive);
  const profiles = input.profiles.filter(profile => input.cropPurposeIds.includes(profile.cropPurposeId));
  function enumerate(available: number, previous: CropPurposeId | null, prefix: readonly CalendarOccurrence[]): readonly CalendarOccurrence[] | null {
    if (input.cropPurposeIds.every(id => prefix.some(item => item.cropPurposeId === id))) return prefix;
    for (const profile of profiles) {
      if (prohibitedTransition(input, previous, profile.cropPurposeId)) continue;
      const reserved = duration(profile) + profile.timing.turnaround.days;
      for (let day = available; day + reserved <= horizonDays; day += 1) {
        const planted = shift(input.horizon.start, day);
        if (!allowedAt(profile, planted)) continue;
        const found = enumerate(day + reserved, profile.cropPurposeId, [...prefix, occurrence(profile, planted)]);
        if (found) return found;
      }
    }
    return null;
  }
  return enumerate(0, input.initialPredecessor, []);
}

function expectValidWitness(input: CalendarSearchInput, calendar: CandidateCalendar): void {
  expect(calendar.horizon).toEqual(input.horizon);
  expect(calendar.occurrences.length).toBeGreaterThan(0);
  for (const id of input.cropPurposeIds) expect(calendar.occurrences.some(item => item.cropPurposeId === id)).toBe(true);
  let available = input.horizon.start;
  let previous = input.initialPredecessor;
  for (const item of calendar.occurrences) {
    expect(input.cropPurposeIds).toContain(item.cropPurposeId);
    const profile = input.profiles.find(candidate => candidate.id === item.profileId && candidate.version === item.profileVersion);
    if (!profile) throw new Error("Witness used an unknown profile/version.");
    expect(profile.cropPurposeId).toBe(item.cropPurposeId);
    expect(item).toEqual(occurrence(profile, item.planted));
    expect(item.planted >= available).toBe(true);
    expect(item.planted >= input.horizon.start).toBe(true);
    expect(item.fieldAvailable <= input.horizon.endExclusive).toBe(true);
    expect(allowedAt(profile, item.planted)).toBe(true);
    expect(prohibitedTransition(input, previous, item.cropPurposeId)).toBe(false);
    available = item.fieldAvailable;
    previous = item.cropPurposeId;
  }
}

function expectOracleAgreement(input: CalendarSearchInput): void {
  const before = structuredClone(input);
  const expected = exhaustiveWitness(input);
  const actual = findCalendar(input);
  expect(input).toEqual(before);
  expect(actual.expandedStates).toBeLessThanOrEqual(input.expansionLimit);
  expect(actual.kind).toBe(expected ? "witness" : "proved_impossible");
  if (actual.kind === "witness") expectValidWitness(input, actual.calendar);
}

function tinyDomain(index: number): CalendarSearchInput {
  const anchors = ["2026-01-01", "2026-12-27", "2027-02-25", "2028-02-25"];
  const start = parseIsoDate(anchors[index % anchors.length]);
  const horizonDays = 8 + index % 13;
  const cropCount = 1 + Math.floor(index / 13) % 3;
  const crops = Array.from({ length: cropCount }, (_, cropIndex): CropSpec => {
    const hardDays = Array.from({ length: horizonDays }, (_, day) => day)
      .filter(day => (index + cropIndex * 7 + day * 3) % 11 < 3);
    return {
      id: "crop-" + cropIndex, days: 4 + (index + cropIndex) % 3,
      turnaround: (Math.floor(index / 5) + cropIndex) % 3,
      purpose: cropIndex === 1 ? "cover" : "food",
      windows: index % 4 === 0 ? [window("10-31", "10-31", "recommendation")]
        : hardDays.map(day => window(shift(start, day).slice(5))),
    };
  });
  const prohibited: Prohibition[] = [];
  for (let from = 0; from < cropCount; from += 1) {
    for (let to = 0; to < cropCount; to += 1) {
      if ((index + from * 5 + to * 3) % 7 === 0) prohibited.push(["crop-" + from, "crop-" + to]);
    }
  }
  if (index % 5 === 0) prohibited.push(["external-predecessor", "crop-0"]);
  return searchInput(crops, horizonDays, {
    start, prohibited, predecessor: index % 5 === 0 ? "external-predecessor" : null,
  });
}

describe("independent daily calendar acceptance", () => {
  it("agrees with an exhaustive schedule oracle across 240 deterministic tiny domains", () => {
    for (let index = 0; index < 240; index += 1) {
      expectOracleAgreement(tinyDomain(index));
    }
  });

  it("includes distinct selected food and cover purposes without substituting an unselected crop", () => {
    const input = searchInput([{ id: "alpha-food" }, { id: "alpha-cover", purpose: "cover" }], 8);
    const unrelated = registry([{ id: "unselected-food" }]);
    expectOracleAgreement({ ...input, profiles: [...input.profiles, ...unrelated.profiles] });
  });

  it("returns the same semantic witness after reversing incidental profile and selected-ID order", () => {
    const input = searchInput([{ id: "beta" }, { id: "alpha" }], 8);
    const forward = findCalendar(input);
    const reversed = findCalendar({ ...input, profiles: [...input.profiles].reverse(), cropPurposeIds: [...input.cropPurposeIds].reverse() });
    expect(forward.kind).toBe("witness");
    expect(reversed.kind).toBe("witness");
    if (forward.kind === "witness" && reversed.kind === "witness") {
      expectValidWitness(input, forward.calendar);
      expectValidWitness(input, reversed.calendar);
      expect(reversed.calendar).toEqual(forward.calendar);
    }
  });

  it("accepts inclusive harvest occupancy and final turnaround finishing exactly at the horizon", () => {
    const exact = searchInput([{ id: "alpha", turnaround: 2 }], 6);
    const found = findCalendar(exact);
    expect(found.kind).toBe("witness");
    if (found.kind !== "witness") throw new Error("Expected final-release witness.");
    expectValidWitness(exact, found.calendar);
    expect(found.calendar.occurrences[0]).toMatchObject({
      planted: "2026-01-01", lastOccupied: "2026-01-04", fieldAvailable: "2026-01-07",
    });
    const short = findCalendar(searchInput([{ id: "alpha", turnaround: 2 }], 5));
    expect(short.kind).toBe("proved_impossible");
    if (short.kind === "proved_impossible") {
      expect(short.proof).toMatchObject({ kind: "duration_lower_bound", horizonDays: 5, mandatoryMinimumDays: 6 });
    }
  });

  it("prevents planting during the prior crop's harvest day or turnaround", () => {
    expectOracleAgreement(searchInput([{ id: "alpha", turnaround: 1 }, { id: "beta" }], 8));
    expectOracleAgreement(searchInput([{ id: "alpha", turnaround: 1 }, { id: "beta" }], 9));
  });

  it("finds a daily witness whose only hard-window start is off the weekly grid", () => {
    const input = searchInput([{ id: "alpha", windows: [window("01-04")] }], 7);
    const found = findCalendar(input);
    expect(found.kind).toBe("witness");
    if (found.kind !== "witness") throw new Error("Expected off-grid witness.");
    expectValidWitness(input, found.calendar);
    expect(found.calendar.occurrences.map(item => item.planted)).toEqual(["2026-01-04"]);
  });

  it.each([
    { start: "2027-02-25", days: 8, windows: [window("02-29")], fits: false },
    { start: "2028-02-25", days: 8, windows: [window("02-29")], fits: true },
    { start: "2026-12-31", days: 4, windows: [window("12-30", "01-02")], fits: true },
    { start: "2026-01-06", days: 5, windows: [window("01-02"), window("01-07")], fits: true },
    { start: "2026-01-04", days: 4, windows: [window("01-02"), window("01-07")], fits: false },
    { start: "2026-01-04", days: 4, windows: [window("10-01", "10-02", "recommendation")], fits: true },
  ])("handles leap-only, wrapped, union and recommended windows: $start/$fits", ({ start, days, windows, fits }) => {
    const input = searchInput([{ id: "alpha", windows }], days, { start });
    expect(Boolean(exhaustiveWitness(input))).toBe(fits);
    expectOracleAgreement(input);
  });

  it("retains a known predecessor across waiting/fallow, while null does not invent one", () => {
    const input = searchInput([{ id: "alpha", windows: [window("01-06")] }], 9, {
      predecessor: "previous-crop", prohibited: [["previous-crop", "alpha"]],
    });
    expect(exhaustiveWitness(input)).toBeNull();
    expectOracleAgreement(input);
    const unknown = { ...input, initialPredecessor: null } satisfies CalendarSearchInput;
    const found = findCalendar(unknown);
    expect(found.kind).toBe("witness");
    if (found.kind === "witness") {
      expectValidWitness(unknown, found.calendar);
      expect(found.calendar.occurrences[0]?.planted).toBe("2026-01-06");
    }
  });

  const repeatedCrops: readonly CropSpec[] = [
    { id: "a", windows: [window("01-05")] },
    { id: "b", windows: [window("01-13")] },
    { id: "c", windows: [window("01-01"), window("01-09")] },
  ];

  it("accepts C-A-C-B as a zero-budget eligible baseline in the original repeat example", () => {
    const input = searchInput(repeatedCrops, 16, { prohibited: [["a", "b"]], expansionLimit: 0 });
    const placements: readonly (readonly [string, number])[] = [["c", 0], ["a", 4], ["c", 8], ["b", 12]];
    const occurrences = placements.map(([id, day]) => {
      const profile = input.profiles.find(item => item.cropPurposeId === id);
      if (!profile) throw new Error("Missing repeat fixture profile.");
      return occurrence(profile, shift(input.horizon.start, day));
    });
    const baseline = { origin: "baseline", horizon: input.horizon, occurrences } satisfies CandidateCalendar;
    expectValidWitness(input, baseline);
    const found = findCalendar({ ...input, eligibleBaseline: baseline });
    expect(found.kind).toBe("witness");
    if (found.kind === "witness") expect(found.calendar).toEqual(baseline);
  });

  it("finds the genuinely necessary C-A-C-B repeat with a restrictive initial predecessor", () => {
    const input = searchInput(repeatedCrops, 16, {
      predecessor: "external-p",
      prohibited: [["a", "b"], ["external-p", "a"], ["external-p", "b"]],
    });
    expect(exhaustiveWitness(input)?.map(item => item.cropPurposeId)).toEqual(["c", "a", "c", "b"]);
    const found = findCalendar(input);
    expect(found.kind).toBe("witness");
    if (found.kind !== "witness") throw new Error("Expected necessary-repeat witness.");
    expectValidWitness(input, found.calendar);
    expect(found.calendar.occurrences.map(item => item.cropPurposeId)).toEqual(["c", "a", "c", "b"]);
    expect(found.calendar.occurrences.map(item => item.planted)).toEqual([
      "2026-01-01", "2026-01-05", "2026-01-09", "2026-01-13",
    ]);
  });

  it("returns limit_reached rather than proof when a feasible search has no expansion allowance", () => {
    const input = searchInput([{ id: "alpha" }, { id: "beta" }], 8, { expansionLimit: 0 });
    expect(exhaustiveWitness(input)).not.toBeNull();
    expect(findCalendar(input)).toEqual({ kind: "limit_reached", expandedStates: 0 });
  });

  it.each([true, false])("does not call an exactly sufficient structural bound incomplete (fits=$0)", fits => {
    const input = fits ? searchInput([{ id: "alpha" }], 4)
      : searchInput([{ id: "alpha", windows: [window("10-01")] }], 8);
    const complete = findCalendar(input);
    expect(complete.kind).toBe(fits ? "witness" : "proved_impossible");
    expect(complete.expandedStates).toBeGreaterThan(0);
    const exact = findCalendar({ ...input, expansionLimit: complete.expandedStates });
    expect(exact).toEqual(complete);
  });
});

type Placement = {
  readonly day: number;
  readonly occupiedDays?: number;
  readonly crop?: string;
  readonly profileId?: string;
};

function metric(id: string, value: number, unit: AssessmentMetric["unit"]): AssessmentMetric {
  return assessmentMetricSchema.parse({
    id, label: id, value: { kind: "available", value }, unit, basis: "estimated",
    methodVersion: "independent-v1", sourceIds,
    denominator: { kind: "available", value: { count: 1, unit: "seasons" } }, assumptions: [label],
  });
}

function assessed(options: {
  readonly frequency?: number;
  readonly mismatch?: number;
  readonly placements?: readonly Placement[];
  readonly origin?: CandidateCalendar["origin"];
  readonly flagged?: boolean;
  readonly warnings?: AssessedCandidate["assessment"]["warnings"];
} = {}): AssessedCandidate {
  const start = parseIsoDate("2026-01-01");
  const horizonDays = 20;
  const placements = options.placements ?? [{ day: 0 }];
  const occurrences: readonly CalendarOccurrence[] = placements.map(item => ({
    cropPurposeId: parseCropPurposeId(item.crop ?? "alpha"), profileId: item.profileId ?? "profile-alpha",
    profileVersion: "independent-v1", planted: shift(start, item.day),
    lastOccupied: shift(start, item.day + (item.occupiedDays ?? 4) - 1),
    fieldAvailable: shift(start, item.day + (item.occupiedDays ?? 4)),
  }));
  let previousEnd = 0;
  let occupied = 0;
  let longest = 0;
  for (const item of occurrences) {
    const planted = distance(start, item.planted);
    const end = distance(start, item.lastOccupied) + 1;
    if (planted < previousEnd) throw new Error("Independent ranking fixture overlaps.");
    longest = Math.max(longest, planted - previousEnd);
    occupied += end - planted;
    previousEnd = end;
  }
  longest = Math.max(longest, horizonDays - previousEnd);
  return {
    calendar: { origin: options.origin ?? "generated", horizon: { start, endExclusive: shift(start, horizonDays) }, occurrences },
    assessment: {
      kind: "assessed", flagged: options.flagged ?? false,
      occurrences: occurrences.map(item => ({ ...item, seasonMetrics: [] })),
      metrics: [
        metric("mean_frequency", options.frequency ?? 0.2, "fraction"),
        metric("mean_mismatch", options.mismatch ?? 0.2, "fraction"),
        metric("unplanted_days", horizonDays - occupied, "days"),
        metric("longest_unplanted_gap", longest, "days"),
      ],
      seasonMetrics: [], warnings: options.warnings ?? [], unassessedChecks: [],
    },
  };
}

function expectSelected(candidates: readonly AssessedCandidate[], winner: AssessedCandidate, rankingDecimalPlaces = 6): void {
  const before = structuredClone(candidates);
  for (const ordered of [candidates, [...candidates].reverse()]) {
    const input = { candidates: ordered, rankingDecimalPlaces } satisfies RankingInput;
    const result = rankCandidates(input);
    expect(result.kind).toBe("selected");
    if (result.kind !== "selected") throw new Error("Expected a ranked candidate.");
    expect(result.candidate).toEqual(winner);
    expect(result.rankingTuple.components.map(component => component.metricId)).toEqual([
      "mean_frequency", "mean_mismatch", "unplanted_days", "longest_unplanted_gap",
    ]);
    expect(result.rankingTuple.components.map(component => component.value)).toEqual(
      winner.assessment.metrics.map(item => {
        if (item.value.kind !== "available") throw new Error("Winner fixture lacks a metric.");
        return Number(item.value.value.toFixed(rankingDecimalPlaces));
      }),
    );
  }
  expect(candidates).toEqual(before);
}

describe("independent direct ranking acceptance", () => {
  it("returns none for an empty candidate pool", () => {
    expect(rankCandidates({ candidates: [], rankingDecimalPlaces: 6 })).toEqual({ kind: "none" });
  });

  it("compares frequency before a more favorable mismatch and schedule", () => {
    const winner = assessed({ frequency: 0.2, mismatch: 0.9 });
    const loser = assessed({ frequency: 0.3, mismatch: 0.1, placements: [{ day: 0 }, { day: 4 }, { day: 8 }] });
    expectSelected([loser, winner], winner);
  });

  it("compares mismatch before a more favorable schedule at equal frequency", () => {
    const winner = assessed({ mismatch: 0.1 });
    const loser = assessed({ mismatch: 0.2, placements: [{ day: 0 }, { day: 4 }, { day: 8 }] });
    expectSelected([loser, winner], winner);
  });

  it("prefers fewer unplanted days after equal water metrics", () => {
    const winner = assessed({ placements: [{ day: 0 }, { day: 4 }] });
    const loser = assessed({ placements: [{ day: 8 }] });
    expectSelected([loser, winner], winner);
  });

  it("prefers a four-day longest gap to seven days after the earlier components tie", () => {
    const winner = assessed({ placements: [{ day: 4 }, { day: 12 }] });
    const loser = assessed({ placements: [{ day: 0 }, { day: 9 }] });
    expectSelected([loser, winner], winner);
    expect(winner.assessment.metrics[3]?.value).toEqual({ kind: "available", value: 4 });
    expect(loser.assessment.metrics[3]?.value).toEqual({ kind: "available", value: 7 });
  });

  it("prefers an unflagged pool even when a flagged baseline has a better complete tuple", () => {
    const winner = assessed({ frequency: 0.9, mismatch: 0.9 });
    const loser = assessed({ frequency: 0, mismatch: 0, origin: "baseline", flagged: true, placements: [{ day: 0 }, { day: 4 }] });
    expectSelected([loser, winner], winner);
  });

  it("still selects the best candidate when every assessed candidate is flagged", () => {
    const winner = assessed({ frequency: 0.2, flagged: true });
    const loser = assessed({ frequency: 0.3, flagged: true, placements: [{ day: 16 }] });
    expectSelected([loser, winner], winner);
  });

  it("uses the explicit environmental flag rather than treating a search-limit warning as risk", () => {
    const winner = assessed({ frequency: 0.9, warnings: [{
      code: "search_limit", message: "Independent bounded-search disclosure.", cropPurposeIds: [], ruleIds: [], metricIds: [],
    }] });
    const loser = assessed({ frequency: 0, flagged: true, placements: [{ day: 16 }] });
    expectSelected([loser, winner], winner);
  });

  it("prefers an eligible baseline on a full rounded tuple tie", () => {
    const baseline = assessed({ origin: "baseline", placements: [{ day: 16 }] });
    const generated = assessed({ placements: [{ day: 0 }] });
    expectSelected([generated, baseline], baseline);
  });

  it("prefers fewer occurrences after an equal tuple without a baseline", () => {
    const winner = assessed({ placements: [{ day: 6, occupiedDays: 8, profileId: "z-profile" }] });
    const loser = assessed({ placements: [{ day: 0 }, { day: 10 }] });
    expectSelected([loser, winner], winner);
  });

  it("uses code-unit canonical crop/profile/date order after all earlier ties", () => {
    const alpha = assessed({ placements: [{ day: 0, crop: "alpha" }] });
    const beta = assessed({ placements: [{ day: 0, crop: "beta" }] });
    expectSelected([beta, alpha], alpha);
    const uppercase = assessed({ placements: [{ day: 0, profileId: "Z-profile" }] });
    const lowercase = assessed({ placements: [{ day: 0, profileId: "a-profile" }] });
    expectSelected([lowercase, uppercase], uppercase);
    const early = assessed({ placements: [{ day: 4 }] });
    const late = assessed({ placements: [{ day: 12 }] });
    expectSelected([late, early], early);
  });

  it.each([
    { precision: 0, lower: 0.21, higher: 0.29 },
    { precision: 6, lower: 0.20000041, higher: 0.20000049 },
    { precision: 12, lower: 0.20000000000041, higher: 0.20000000000049 },
  ])("rounds only comparison values at precision $precision and preserves raw evidence", ({ precision, lower, higher }) => {
    const baseline = assessed({ frequency: higher, origin: "baseline", placements: [{ day: 16 }] });
    const generated = assessed({ frequency: lower });
    const before = structuredClone([baseline, generated]);
    expectSelected([generated, baseline], baseline, precision);
    expect([baseline, generated]).toEqual(before);
    expect(baseline.assessment.metrics[0]?.value).toEqual({ kind: "available", value: higher });
  });

  it("lets declared precision change the winner rather than hardcoding six places", () => {
    const baseline = assessed({ frequency: 0.20000049, origin: "baseline", placements: [{ day: 16 }] });
    const generated = assessed({ frequency: 0.20000041 });
    expectSelected([baseline, generated], baseline, 6);
    expectSelected([baseline, generated], generated, 7);
    const fineBaseline = assessed({ frequency: 0.2000000000006, origin: "baseline", placements: [{ day: 16 }] });
    const fineGenerated = assessed({ frequency: 0.2000000000004 });
    expectSelected([fineBaseline, fineGenerated], fineGenerated, 12);
  });

  it("ignores metric array order and unrelated descriptive evidence", () => {
    const winner = assessed({ frequency: 0.1 });
    const shuffled: AssessedCandidate = {
      ...winner, assessment: {
        ...winner.assessment,
        metrics: [metric("temperature_exposure", 0.99, "fraction"), ...[...winner.assessment.metrics].reverse()],
      },
    };
    const result = rankCandidates({ candidates: [assessed({ placements: [{ day: 16 }] }), shuffled], rankingDecimalPlaces: 6 });
    expect(result.kind).toBe("selected");
    if (result.kind === "selected") {
      expect(result.candidate).toEqual(shuffled);
      expect(result.rankingTuple.components.map(component => component.value)).toEqual([0.1, 0.2, 16, 16]);
    }
  });

  it("rejects missing, unavailable, duplicate, wrong-unit and nonfinite required evidence", () => {
    const candidate = assessed();
    const first = candidate.assessment.metrics[0];
    if (!first) throw new Error("Missing frequency fixture.");
    const invalidMetrics: readonly (readonly AssessmentMetric[])[] = [
      candidate.assessment.metrics.filter(item => item.id !== "mean_frequency"),
      candidate.assessment.metrics.map(item => item.id === "mean_frequency"
        ? { ...item, value: { kind: "unavailable", reason: "Synthetic missing required metric." } } : item),
      [...candidate.assessment.metrics, first],
      candidate.assessment.metrics.map(item => item.id === "mean_frequency" ? { ...item, unit: "mm" } : item),
      candidate.assessment.metrics.map(item => item.id === "mean_frequency" ? { ...item, value: { kind: "available", value: Number.NaN } } : item),
      candidate.assessment.metrics.map(item => item.id === "mean_mismatch" ? { ...item, value: { kind: "available", value: Number.POSITIVE_INFINITY } } : item),
    ];
    for (const metrics of invalidMetrics) {
      const invalid: AssessedCandidate = { ...candidate, assessment: { ...candidate.assessment, metrics } };
      expect(() => rankCandidates({ candidates: [invalid], rankingDecimalPlaces: 6 })).toThrow();
      expect(() => rankCandidates({ candidates: [assessed({ frequency: 0.01, placements: [{ day: 16 }] }), invalid], rankingDecimalPlaces: 6 })).toThrow();
    }
  });
});
