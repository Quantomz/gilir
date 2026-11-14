import { parseIsoDate } from "@/contracts/common";
import type { CropPurposeId, IsoDate } from "@/contracts/common";
import type { CalendarSearchInput, CandidateCalendar, DateInterval } from "@/contracts/engine";
import type { CropProfile, RotationRule } from "@/contracts/registry";
import type { CalendarOccurrence } from "@/contracts/result";

const dayMs = 86_400_000;
export const ordinal = (date: IsoDate): number => Date.parse(date + "T00:00:00Z") / dayMs;
export const dateAt = (day: number): IsoDate => parseIsoDate(new Date(day * dayMs).toISOString().slice(0, 10));
export const dayCount = (interval: DateInterval): number => ordinal(interval.endExclusive) - ordinal(interval.start);
export const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export function shiftYear(date: IsoDate, years: number): IsoDate {
  const year = Number(date.slice(0, 4)) + years;
  const prefix = String(year).padStart(4, "0");
  const day = date.slice(5);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return parseIsoDate(`${prefix}-${day === "02-29" && !leap ? "02-28" : day}`);
}

export const horizonFor = (start: IsoDate): DateInterval => ({ start, endExclusive: shiftYear(start, 1) });
export const duration = (stages: CropProfile["timing"]["generatedStageDays"]): number =>
  stages.initial + stages.development + stages.middle + stages.late;

export function supportsHistory(profile: CropProfile, days: number): boolean {
  const allocations = profile.timing.historicalStageAllocations.filter(stage => duration(stage) === days);
  return allocations.length > 0 && new Set(allocations.map(stage =>
    [stage.initial, stage.development, stage.middle, stage.late].join(","))).size === 1;
}

function inWindow(date: IsoDate, window: CropProfile["timing"]["plantingWindows"][number]["window"]): boolean {
  const monthDay = date.slice(5);
  return window.startMonthDay <= window.endMonthDayInclusive
    ? monthDay >= window.startMonthDay && monthDay <= window.endMonthDayInclusive
    : monthDay >= window.startMonthDay || monthDay <= window.endMonthDayInclusive;
}

export function canFollow(previous: CropPurposeId | null, next: CropPurposeId, rules: readonly RotationRule[]): boolean {
  return previous === null || !rules.some(rule => rule.predicate.predecessorCropPurposeIds.includes(previous)
    && rule.predicate.successorCropPurposeIds.includes(next));
}

export interface CalendarConstraints {
  readonly horizon: DateInterval;
  readonly start: number;
  readonly days: number;
  readonly profiles: readonly CropProfile[];
  readonly rules: readonly RotationRule[];
  readonly initialPredecessor: CropPurposeId | null;
  readonly allowed: readonly Uint8Array[];
  readonly edges: readonly (readonly number[])[];
  readonly occupied: readonly number[];
  readonly spans: readonly number[];
}

export interface CalendarDomain extends CalendarConstraints {
  readonly lowerBound: Float64Array;
  readonly fullMask: number;
}

export function compileConstraints(input: Pick<CalendarSearchInput, "horizon" | "cropPurposeIds" | "profiles" | "hardConstraints" | "initialPredecessor">): CalendarConstraints {
  const days = dayCount(input.horizon);
  if (!Number.isSafeInteger(days) || days < 1 || days > 366) throw new Error("Invalid calendar horizon.");
  const ids = [...input.cropPurposeIds].sort(compareText);
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error("Invalid calendar crops.");
  const profiles = ids.map(id => {
    const matches = input.profiles.filter(profile => profile.cropPurposeId === id);
    if (matches.length !== 1) throw new Error("Expected one resolved profile per selected crop.");
    return matches[0];
  });
  const start = ordinal(input.horizon.start);
  const allowed = profiles.map(profile => Uint8Array.from({ length: days }, (_, day) => {
    const hard = profile.timing.plantingWindows.filter(item => item.basis === "hard_constraint");
    return Number(!hard.length || hard.some(item => inWindow(dateAt(start + day), item.window)));
  }));
  const edges = profiles.map(profile => {
    const points = new Set<number>();
    for (const item of profile.timing.plantingWindows) {
      const member = Array.from({ length: days }, (_, day) => inWindow(dateAt(start + day), item.window));
      for (let day = 0; day < days; day++) {
        if (member[day] && (!member[day - 1] || !member[day + 1])) points.add(day);
      }
    }
    return [...points].sort((a, b) => a - b);
  });
  const occupied = profiles.map(profile => duration(profile.timing.generatedStageDays));
  const spans = profiles.map((profile, index) => occupied[index] + profile.timing.turnaround.days);
  if (spans.some(span => !Number.isSafeInteger(span) || span <= 0)) throw new Error("Invalid crop duration.");
  return { horizon: input.horizon, start, days, profiles, rules: input.hardConstraints,
    initialPredecessor: input.initialPredecessor, allowed, edges, occupied, spans };
}

export function compileCalendar(input: CalendarSearchInput): CalendarDomain {
  if (!Number.isSafeInteger(input.expansionLimit) || input.expansionLimit < 0) throw new Error("Invalid structural budget.");
  if (input.cropPurposeIds.length > 12) throw new Error("Invalid selected crops.");
  const constraints = compileConstraints(input);
  const { profiles, spans } = constraints;
  const fullMask = (1 << profiles.length) - 1;
  const lowerBound = new Float64Array(fullMask + 1);
  for (let mask = 0; mask <= fullMask; mask++) {
    lowerBound[mask] = spans.reduce((sum, span, index) => sum + (mask & (1 << index) ? 0 : span), 0);
  }
  return { ...constraints, lowerBound, fullMask };
}

export function occurrenceAt(domain: CalendarConstraints, crop: number, day: number): CalendarOccurrence {
  const profile = domain.profiles[crop];
  return { cropPurposeId: profile.cropPurposeId, profileId: profile.id, profileVersion: profile.version,
    planted: dateAt(domain.start + day), lastOccupied: dateAt(domain.start + day + domain.occupied[crop] - 1),
    fieldAvailable: dateAt(domain.start + day + domain.spans[crop]) };
}

export function calendarProblems(calendar: CandidateCalendar, domain: CalendarConstraints, contextual = false): string[] {
  const problems = new Set<string>();
  if (calendar.horizon.start !== domain.horizon.start || calendar.horizon.endExclusive !== domain.horizon.endExclusive) {
    problems.add("The calendar horizon differs from the run.");
  }
  let available = domain.start;
  let previous = domain.initialPredecessor;
  const seen = new Set<CropPurposeId>();
  for (const occurrence of calendar.occurrences) {
    const index = domain.profiles.findIndex(profile => profile.cropPurposeId === occurrence.cropPurposeId);
    const profile = domain.profiles[index];
    if (!profile || profile.id !== occurrence.profileId || profile.version !== occurrence.profileVersion) {
      problems.add("A calendar occurrence has no matching resolved profile.");
      continue;
    }
    const planted = ordinal(occurrence.planted);
    const last = ordinal(occurrence.lastOccupied);
    const release = ordinal(occurrence.fieldAvailable);
    const days = last - planted + 1;
    if (planted < available || days < 1 || release !== last + 1 + profile.timing.turnaround.days || release > domain.start + domain.days) {
      problems.add("Crop occupancy and turnaround must fit without overlap inside the horizon.");
    }
    if (calendar.origin === "baseline" ? !supportsHistory(profile, days) : days !== domain.occupied[index]) {
      problems.add("The occurrence duration has no supported stage allocation.");
    }
    if (!contextual && !domain.allowed[index][planted - domain.start]) problems.add("A planting date violates a hard planting window.");
    if (!contextual && !canFollow(previous, occurrence.cropPurposeId, domain.rules)) problems.add("A successor prohibition prevents this crop order.");
    seen.add(occurrence.cropPurposeId);
    available = release;
    previous = occurrence.cropPurposeId;
  }
  if (!contextual && domain.profiles.some(profile => !seen.has(profile.cropPurposeId))) problems.add("The calendar does not include every selected crop.");
  return [...problems];
}

export function calendarKey(calendar: CandidateCalendar): string {
  return JSON.stringify(calendar.occurrences.map(item => [item.cropPurposeId, item.profileId, item.profileVersion,
    item.planted, item.lastOccupied, item.fieldAvailable]));
}

export function assessmentKey(calendar: CandidateCalendar): string {
  return JSON.stringify([calendar.origin, calendarKey(calendar)]);
}
