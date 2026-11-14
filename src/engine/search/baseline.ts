import type { CropPurposeId } from "@/contracts/common";
import type { CandidateCalendar, DateInterval } from "@/contracts/engine";
import type { FarmInput, HistoryEntry } from "@/contracts/input";
import type { CropProfile, RotationRule } from "@/contracts/registry";
import type { BaselineComparison } from "@/contracts/result";
import { calendarProblems, compareText, compileCalendar, dateAt, ordinal, shiftYear, supportsHistory } from "./calendar";

const entryStart = (entry: HistoryEntry) => entry.kind === "crop" ? entry.planted : entry.start;
const entryEnd = (entry: HistoryEntry) => entry.kind === "crop" ? ordinal(entry.harvested) + 1 : ordinal(entry.endExclusive);

export function initialPredecessor(input: FarmInput): CropPurposeId | null {
  const history = input.history;
  if (history.kind === "skipped" || history.endExclusive !== input.planningStart) return null;
  let cursor = ordinal(input.planningStart);
  for (const entry of [...history.entries].sort((a, b) => compareText(entryStart(b), entryStart(a)))) {
    if (entryEnd(entry) !== cursor) return null;
    if (entry.kind === "crop") return entry.crop.kind === "catalogue" ? entry.crop.cropPurposeId : null;
    cursor = ordinal(entry.start);
  }
  return null;
}

export type ModeledBaseline =
  | { readonly kind: "unavailable"; readonly comparison: BaselineComparison }
  | { readonly kind: "modeled"; readonly calendar: CandidateCalendar; readonly eligible: boolean; readonly approximate: boolean };

export function modelBaseline(input: FarmInput, horizon: DateInterval, profiles: readonly CropProfile[], rules: readonly RotationRule[]): ModeledBaseline {
  const history = input.history;
  if (history.kind === "skipped") return { kind: "unavailable", comparison: { kind: "not_recorded" } };
  const unavailable = (reason: string): ModeledBaseline => ({ kind: "unavailable", comparison: { kind: "not_assessable", reasons: [reason] } });
  const crops = history.entries.filter(entry => entry.kind === "crop").sort((a, b) => compareText(a.planted, b.planted));
  if (crops.some(entry => entry.crop.kind === "unsupported")) return unavailable("A historical crop has no supported catalogue profile.");
  for (const entry of crops) {
    const profile = profiles.find(item => entry.crop.kind === "catalogue" && item.cropPurposeId === entry.crop.cropPurposeId);
    if (!profile) return unavailable("A historical crop has no applicable profile.");
    if (!supportsHistory(profile, ordinal(entry.harvested) - ordinal(entry.planted) + 1)) {
      return unavailable("The reported historical duration has no unambiguous released stage allocation.");
    }
  }
  const approximate = crops.some(entry => entry.plantedPrecision === "approximate" || entry.harvestedPrecision === "approximate");
  const firstShift = Number(horizon.start.slice(0, 4)) - Number(history.endExclusive.slice(0, 4)) - 1;
  const lastShift = Number(horizon.endExclusive.slice(0, 4)) - Number(history.start.slice(0, 4)) + 1;
  let lastReason = "No single year shift places the entire historical sequence inside this horizon.";
  for (let years = firstShift; years <= lastShift; years++) {
    const translated = history.entries.map(entry => entry.kind === "crop"
      ? { ...entry, planted: shiftYear(entry.planted, years), harvested: shiftYear(entry.harvested, years) }
      : { ...entry, start: shiftYear(entry.start, years), endExclusive: shiftYear(entry.endExclusive, years) });
    const ordered = [...translated].sort((a, b) => compareText(entryStart(a), entryStart(b)));
    if (ordered.some((entry, index) => entryEnd(entry) <= ordinal(entryStart(entry))
      || (index > 0 && ordinal(entryStart(entry)) < entryEnd(ordered[index - 1])))) {
      lastReason = "Year translation creates overlapping or empty historical intervals.";
      continue;
    }
    const occurrences = crops.map(entry => {
      const profile = profiles.find(item => entry.crop.kind === "catalogue" && item.cropPurposeId === entry.crop.cropPurposeId);
      if (!profile) throw new Error("Historical profile disappeared.");
      const planted = shiftYear(entry.planted, years);
      const lastOccupied = shiftYear(entry.harvested, years);
      return { cropPurposeId: profile.cropPurposeId, profileId: profile.id, profileVersion: profile.version,
        planted, lastOccupied, fieldAvailable: dateAt(ordinal(lastOccupied) + 1 + profile.timing.turnaround.days) };
    });
    if (occurrences.some(item => item.planted < horizon.start || item.fieldAvailable > horizon.endExclusive)) continue;
    const calendar: CandidateCalendar = { origin: "baseline", horizon, occurrences };
    const historicalIds = [...new Set(occurrences.map(item => item.cropPurposeId))];
    if (historicalIds.length) {
      const context = compileCalendar({ horizon, cropPurposeIds: historicalIds, profiles, hardConstraints: rules,
        initialPredecessor: initialPredecessor(input), eligibleBaseline: null, expansionLimit: 0 });
      const problems = calendarProblems(calendar, context, true);
      if (problems.length) { lastReason = problems[0]; continue; }
    }
    const translatedStart = shiftYear(history.start, years);
    const translatedEnd = shiftYear(history.endExclusive, years);
    let cursor = ordinal(horizon.start);
    const end = ordinal(horizon.endExclusive);
    for (const entry of translated.sort((a, b) => compareText(entryStart(a), entryStart(b)))) {
      const start = Math.max(ordinal(entryStart(entry)), ordinal(translatedStart));
      const finish = Math.min(entryEnd(entry), ordinal(translatedEnd));
      if (finish <= cursor) continue;
      if (start > cursor) break;
      cursor = finish;
    }
    if (cursor < end) { lastReason = "The translated history contains unknown coverage; explicit fallow is required for a numeric comparison."; continue; }
    const domain = compileCalendar({ horizon, cropPurposeIds: input.cropPurposeIds, profiles, hardConstraints: rules,
      initialPredecessor: initialPredecessor(input), eligibleBaseline: null, expansionLimit: 0 });
    return { kind: "modeled", calendar, approximate, eligible: calendarProblems(calendar, domain).length === 0 };
  }
  return unavailable(lastReason);
}
