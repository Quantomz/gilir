// Day geometry of last year's timeline. Pure: no React, no words, no storage.
//
// Coverage is the 12 months before the field-ready date: [addYears(planningStart, -1), planningStart). The contract
// asks only for start < endExclusive <= planningStart, so the 12-month window is F1's own choice.
//
// A Span is a half-open run of days [a, b) counted from coverage.start. A crop occupies [planted, harvested + 1)
// because its harvest day is inclusive. A fallow entry occupies [start, endExclusive). With these spans the contract's
// asymmetric overlap rule becomes one interval test: a crop harvested on day X blocks a start on X, a fallow ending
// (exclusive) on X does not.
//
// Gaps (days no entry covers) are derived and never stored, so they stay unknown.
import type { FarmInput, IsoDate } from "@/contracts";
import { addDays, addYears, daysBetween, partsOf } from "./dates";
import { policy } from "./policy";

export type History = FarmInput["history"];
export type RecordedHistory = Extract<History, { readonly kind: "recorded" }>;
export type Entry = RecordedHistory["entries"][number];
export type CropEntry = Extract<Entry, { readonly kind: "crop" }>;
export type FallowEntry = Extract<Entry, { readonly kind: "fallow" }>;
export type CropRef = CropEntry["crop"];

export interface Coverage {
  readonly start: IsoDate;
  readonly endExclusive: IsoDate;
  /** Number of days in the window, 365 or 366. */
  readonly days: number;
}

export interface Span {
  readonly a: number;
  readonly b: number;
}

/** Which part of a bar a drag or key moves. */
export type End = "start" | "end" | "move";

/** Why a step stopped before reaching its target. Words live in model/words.ts. */
export type Stop =
  | { readonly kind: "edge" }                           // the bar would stick further out of the 12 months
  | { readonly kind: "short" }                          // fewer than one day in the field
  | { readonly kind: "overlap"; readonly with: Entry }; // one crop at a time

export function coverageFor(planningStart: IsoDate): Coverage {
  const start = addYears(planningStart, -1);
  return { start, endExclusive: planningStart, days: daysBetween(start, planningStart) };
}

export function spanOf(entry: Entry, coverage: Coverage): Span {
  const day = (date: IsoDate) => daysBetween(coverage.start, date);
  return entry.kind === "crop"
    ? { a: day(entry.planted), b: day(entry.harvested) + 1 }
    : { a: day(entry.start), b: day(entry.endExclusive) };
}

/** Layout facts a lane needs: cut ends at the window edges, and the "outside" and "inverted" flags. */
export function placementOf(entry: Entry, coverage: Coverage): {
  readonly visible: Span | null;   // clipped to [0, days), null when wholly outside
  readonly cutStart: boolean;
  readonly cutEnd: boolean;
  readonly outside: boolean;       // some day is outside the window, or a crop is harvested on planningStart
  readonly inverted: boolean;      // ends before it starts
} {
  const { a, b } = spanOf(entry, coverage);
  const clipped = { a: Math.max(0, a), b: Math.min(coverage.days, b) };
  const visible = clipped.b > clipped.a ? clipped : null;
  return {
    visible,
    cutStart: visible !== null && a < 0,
    cutEnd: visible !== null && b > coverage.days,
    outside: a < 0 || b > coverage.days,
    inverted: b <= a,
  };
}

/** Days no entry covers, in order. The whole window when there are no entries. */
export function gapsOf(entries: readonly Entry[], coverage: Coverage): readonly Span[] {
  const gaps: Span[] = [];
  let covered = 0;
  for (const span of entries.map(entry => spanOf(entry, coverage)).sort((p, q) => p.a - q.a)) {
    const a = Math.max(0, span.a);
    const b = Math.min(coverage.days, span.b);
    if (b <= a) continue;
    if (a > covered) gaps.push({ a: covered, b: a });
    covered = Math.max(covered, b);
  }
  if (covered < coverage.days) gaps.push({ a: covered, b: coverage.days });
  return gaps;
}

/** Entries sorted by start day, ties by id. The draft keeps this order at all times. */
export function sortEntries(entries: readonly Entry[]): readonly Entry[] {
  const startOf = (entry: Entry) => (entry.kind === "crop" ? entry.planted : entry.start);
  const compare = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return [...entries].sort((p, q) => compare(startOf(p), startOf(q)) || compare(p.id, q.id));
}

/**
 * A fresh id no entry uses: "crop-N" or "empty-N", one above the largest number any id ends with, so it cannot
 * collide. A counter, because crypto.randomUUID is missing on a phone that opens the app over plain http.
 */
export function nextEntryId(entries: readonly Entry[], prefix: "crop" | "empty"): string {
  const numbers = entries.map(entry => Number(/-(\d+)$/.exec(entry.id)?.[1] ?? 0)).filter(Number.isSafeInteger);
  return `${prefix}-${Math.max(0, ...numbers) + 1}`;
}

/**
 * Move one end of an entry, or the whole bar, toward `targetDay` one day at a time. `targetDay` is the planting or
 * start day for "start" and "move", and the harvest day (the last day of the bar) for "end".
 * Stops at the first day that would make the bar shorter than one day, stick further out of the window, or overlap
 * another entry more than it already does. Returns the entries with the moved bar re-sorted, and why it stopped early.
 * Drag, arrow keys, Page keys and Home/End all call this, so no input method can reach a state another cannot.
 * Idempotent: stepping to where the bar already is returns the same entries array and no stop.
 */
export function stepEntry(
  entries: readonly Entry[],
  entryId: string,
  end: End,
  targetDay: number,
  coverage: Coverage,
): { readonly entries: readonly Entry[]; readonly stop: Stop | null } {
  const index = entries.findIndex(entry => entry.id === entryId);
  const entry = entries[index];
  if (entry === undefined) return { entries, stop: null };
  const others = entries.flatMap((other, i) => (i === index ? [] : [{ entry: other, span: spanOf(other, coverage) }]));
  const now = spanOf(entry, coverage);
  const length = now.b - now.a;
  const at = (day: number): Span =>
    end === "start" ? { a: day, b: now.b } : end === "end" ? { a: now.a, b: day + 1 } : { a: day, b: day + length };
  const from = end === "end" ? now.b - 1 : now.a;
  const target = Math.round(targetDay);
  const direction = Math.sign(target - from);
  let day = from;
  let stop: Stop | null = null;
  // A counted loop, so a NaN target moves nothing instead of walking forever.
  for (let walked = 0; walked < Math.abs(target - from); walked++) {
    stop = refusal(at(day), at(day + direction), others, coverage.days);
    if (stop !== null) break;
    day += direction;
  }
  if (day === from) return { entries, stop };
  const span = at(day);
  const moved: Entry = entry.kind === "crop"
    ? { ...entry, planted: addDays(coverage.start, span.a), harvested: addDays(coverage.start, span.b - 1) }
    : { ...entry, start: addDays(coverage.start, span.a), endExclusive: addDays(coverage.start, span.b) };
  return { entries: sortEntries(entries.map((other, i) => (i === index ? moved : other))), stop };
}

function refusal(
  now: Span,
  next: Span,
  others: readonly { readonly entry: Entry; readonly span: Span }[],
  days: number,
): Stop | null {
  if (next.b - next.a < 1) return { kind: "short" };
  if (outsideDays(next, days) > outsideDays(now, days)) return { kind: "edge" };
  const hit = others.find(other => sharedDays(next, other.span) > sharedDays(now, other.span));
  return hit === undefined ? null : { kind: "overlap", with: hit.entry };
}

function outsideDays(span: Span, days: number): number {
  return Math.max(0, -span.a) + Math.max(0, span.b - days);
}

function sharedDays(p: Span, q: Span): number {
  return Math.max(0, Math.min(p.b, q.b) - Math.max(p.a, q.a));
}

/**
 * Where a new crop goes: inside `within` (a tapped gap) when given; else the first gap after the last entry that fits
 * `length`; else any gap that fits; else the longest gap if it has at least policy.history.minimumFitDays.
 * Null when the year is full.
 */
export function placeNew(entries: readonly Entry[], coverage: Coverage, length: number, within: Span | null): Span | null {
  if (within !== null) return { a: within.a, b: Math.min(within.b, within.a + length) };
  const gaps = gapsOf(entries, coverage);
  const last = Math.max(0, ...entries.map(entry => spanOf(entry, coverage).b));
  const fits = (gap: Span) => gap.b - gap.a >= length;
  const fit = gaps.find(gap => gap.a >= last && fits(gap)) ?? gaps.find(fits);
  if (fit !== undefined) return { a: fit.a, b: fit.a + length };
  const longest = gaps.reduce<Span | null>((best, gap) => (best === null || gap.b - gap.a > best.b - best.a ? gap : best), null);
  return longest !== null && longest.b - longest.a >= policy.history.minimumFitDays ? longest : null;
}

/**
 * The history after the field-ready date changes. A recorded history moves its window with the date and keeps its
 * entries where they are (they may now fall outside and are flagged, never dropped). A whole-year empty record follows
 * the new window. A skipped history is unchanged.
 */
export function moveWindow(history: History, planningStart: IsoDate): History {
  if (history.kind === "skipped") return history;
  const { start, endExclusive } = coverageFor(planningStart);
  if (history.start === start && history.endExclusive === endExclusive) return history;
  const emptyYear = wholeYearFallow(history);
  const entries = emptyYear === null ? history.entries : [{ ...emptyYear, start, endExclusive }];
  return { ...history, start, endExclusive, entries };
}

/** True when the only entry is one fallow covering the whole window ("My field was empty all year"). */
export function isEmptyAllYear(history: RecordedHistory): boolean {
  return wholeYearFallow(history) !== null;
}

function wholeYearFallow(history: RecordedHistory): FallowEntry | null {
  const [only] = history.entries;
  return history.entries.length === 1 && only?.kind === "fallow"
    && only.start === history.start && only.endExclusive === history.endExclusive ? only : null;
}

/** Month bands for the overview strip and the lane grid lines: one per calendar month the window touches. */
export function monthBands(coverage: Coverage): readonly { readonly span: Span; readonly month0: number; readonly year: number }[] {
  const bands: { readonly span: Span; readonly month0: number; readonly year: number }[] = [];
  for (let a = 0; a < coverage.days;) {
    const { year, month0, day, monthDays } = partsOf(addDays(coverage.start, a));
    const b = Math.min(coverage.days, a + monthDays - day + 1);
    bands.push({ span: { a, b }, month0, year });
    a = b;
  }
  return bands;
}

/**
 * The day under a pointer on a lane track. Day d sits at left + d / days * width, so this is the nearest day,
 * clamped to [0, days - 1]. The track excludes the two handle insets, because each handle sits outside its bar end,
 * so a drag subtracts its grab offset from clientX before asking.
 */
export function dayAtPointer(clientX: number, track: { readonly left: number; readonly width: number }, days: number): number {
  return Math.min(days - 1, Math.max(0, Math.round(((clientX - track.left) / track.width) * days)));
}
