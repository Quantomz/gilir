// Day geometry of last year's timeline. Pure: no React, no words, no storage.
//
// Coverage is the 12 months before the field-ready date: [addYears(planningStart, -1), planningStart).
// The schema only needs start < endExclusive <= planningStart (src/contracts/input.ts:65-67). The 12-month window is
// F1's choice, as in the prototype (threefield-web src/contract.js `coverage`).
//
// A Span is a half-open run of days [a, b) counted from coverage.start. A crop occupies [planted, harvested + 1)
// because its harvest day is inclusive. A fallow entry occupies [start, endExclusive). With these spans the contract's
// asymmetric overlap rule (src/contracts/input.ts:84) becomes one interval test: a crop harvested on day X blocks a
// start on X, a fallow ending (exclusive) on X does not.
//
// Gaps (days no entry covers) are derived and never stored. They stay unknown (spec.md:48).
import type { FarmInput, IsoDate } from "@/contracts";

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
  throw new Error("not implemented");
  // TODO: start = addYears(planningStart, -1); days = daysBetween(start, planningStart)
}

export function spanOf(entry: Entry, coverage: Coverage): Span {
  throw new Error("not implemented");
  // TODO: crop -> { a: days(planted), b: days(harvested) + 1 }; fallow -> { a: days(start), b: days(endExclusive) }
}

/** Layout facts a lane needs: cut ends at the window edges, and the "outside" and "inverted" flags. */
export function placementOf(entry: Entry, coverage: Coverage): {
  readonly visible: Span | null;   // clipped to [0, days), null when wholly outside
  readonly cutStart: boolean;
  readonly cutEnd: boolean;
  readonly outside: boolean;       // some day is outside the window, or a crop is harvested on planningStart
  readonly inverted: boolean;      // ends before it starts
} {
  throw new Error("not implemented");
}

/** Days no entry covers, in order. The whole window when there are no entries. */
export function gapsOf(entries: readonly Entry[], coverage: Coverage): readonly Span[] {
  throw new Error("not implemented");
  // TODO port gapsOf (threefield-web app.js): clip spans to [0, N), sort by a, walk a cursor, emit [cursor, a) holes.
}

/** Entries sorted by start day, ties by id. The draft keeps this order at all times (model/draft.ts I2). */
export function sortEntries(entries: readonly Entry[]): readonly Entry[] {
  throw new Error("not implemented");
}

/** A fresh id no entry uses: "crop-N" or "empty-N". A counter, not crypto.randomUUID (missing on plain http, gotcha 11). */
export function nextEntryId(entries: readonly Entry[], prefix: "crop" | "empty"): string {
  throw new Error("not implemented");
}

/**
 * Move one end of an entry, or the whole bar, toward `targetDay` one day at a time.
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
  throw new Error("not implemented");
  // TODO port stepOk/stepTo (threefield-web app.js, by function name):
  //   spans = entries.map(spanOf); cur = spans[i]; len = cur.b - cur.a
  //   at(v) = start: {a: v, b: cur.b} | end: {a: cur.a, b: v + 1} | move: {a: v, b: v + len}
  //   pos = end === "end" ? cur.b - 1 : cur.a; walk pos toward target while stepOk(at(pos), at(pos + dir))
  //   stepOk(now, cand): cand.b - cand.a >= 1 && outside(cand) <= outside(now) && every other j: overlap(cand, j) <= overlap(now, j)
  //   write back: crop planted = addDays(start, a), harvested = addDays(start, b - 1); fallow start/endExclusive = a/b
}

/**
 * Where a new crop goes: inside `within` (a tapped gap) when given; else the first gap after the last entry that fits
 * `length`; else any gap that fits; else the longest gap if it has at least policy.history.minimumFitDays.
 * Null when the year is full.
 */
export function placeNew(entries: readonly Entry[], coverage: Coverage, length: number, within: Span | null): Span | null {
  throw new Error("not implemented");
}

/**
 * The history after the field-ready date changes. A recorded history moves its window with the date and keeps its
 * entries where they are (they may now fall outside and are flagged, never dropped). A whole-year empty record follows
 * the new window. A skipped history is unchanged.
 */
export function moveWindow(history: History, planningStart: IsoDate): History {
  throw new Error("not implemented");
}

/** True when the only entry is one fallow covering the whole window ("My field was empty all year"). */
export function isEmptyAllYear(history: RecordedHistory): boolean {
  throw new Error("not implemented");
}

/** Month bands for the overview strip and the lane grid lines. At most 14. */
export function monthBands(coverage: Coverage): readonly { readonly span: Span; readonly month0: number; readonly year: number }[] {
  throw new Error("not implemented");
}

/**
 * The day under a pointer on a lane track (graft from candidates 2 and 3, pure so it is tested without a DOM).
 * The track element excludes the two handle insets (views/rotation.tsx puts the handles OUTSIDE the bar ends), so
 * the day is round((clientX - left) / width * days), clamped to [0, days - 1].
 */
export function dayAtPointer(clientX: number, track: { readonly left: number; readonly width: number }, days: number): number {
  throw new Error("not implemented");
}
