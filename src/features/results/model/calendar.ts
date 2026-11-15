// F1's date helpers are private to F1, so F3 keeps these few. All arithmetic is on UTC midnights, so a calendar date
// never shifts with the browser's time zone.
import { isoDateSchema } from "@/contracts";
import type { BaselineComparison, CalendarOccurrence, CropPurposeId, FarmInput, IsoDate, Plan, PlanOccurrence } from "@/contracts";

/** A half-open stretch of calendar days, as the contract writes a horizon. */
export interface Year {
  readonly start: IsoDate;
  readonly endExclusive: IsoDate;
}

export type RecordedHistory = Extract<FarmInput["history"], { readonly kind: "recorded" }>;
export type AssessedBaseline = Extract<BaselineComparison, { readonly kind: "assessed" }>;

const dayMs = 86_400_000;

function utcMs(date: IsoDate): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: IsoDate, n: number): IsoDate {
  return isoDateSchema.parse(new Date(utcMs(date) + n * dayMs).toISOString().slice(0, 10));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((utcMs(to) - utcMs(from)) / dayMs);
}

export function monthOf(date: IsoDate): number {
  return Number(date.slice(5, 7));
}

export function shareOf(year: Year, date: IsoDate): number {
  const share = daysBetween(year.start, date) / daysBetween(year.start, year.endExclusive);
  return Math.min(1, Math.max(0, share));
}

export function monthStarts(year: Year): readonly IsoDate[] {
  const starts: IsoDate[] = [];
  const startsOnFirst = year.start.slice(8) === "01";
  for (let months = Number(year.start.slice(0, 4)) * 12 + monthOf(year.start) - (startsOnFirst ? 1 : 0); ; months++) {
    const pad = (value: number, width: number) => String(value).padStart(width, "0");
    const first = isoDateSchema.parse(`${pad(Math.floor(months / 12), 4)}-${pad((months % 12) + 1, 2)}-01`);
    if (first >= year.endExclusive) return starts;
    starts.push(first);
  }
}

/** One crop in the field. `order` counts crops from 1 in planting order and is the mark on its bar and row. */
export interface CropSpan {
  readonly kind: "crop";
  readonly order: number;
  readonly cropPurposeId: CropPurposeId;
  readonly planted: IsoDate;
  /** Inclusive, the harvest day. */
  readonly lastOccupied: IsoDate;
  readonly fieldAvailable: IsoDate;
  readonly occupiedDays: number;
  readonly modeledTiming?: PlanOccurrence["modeledTiming"];
}

/**
 * A run of days with no planned crop. It starts the day after a harvest (or on the first day of the year) and ends the
 * day before the next planting (or on the last day of the year), so its length is the one the ranking counts.
 * When `afterHarvestDays === openDays` the whole run is the time after a harvest before the field is free.
 */
export interface OpenSpan {
  readonly kind: "open";
  readonly first: IsoDate;
  /** Inclusive. */
  readonly last: IsoDate;
  readonly openDays: number;
  /** How many of the first days are the time after the harvest, before the field is free. 0 before the first crop. */
  readonly afterHarvestDays: number;
  /** The crop whose harvest opens this run, or null for days before the first crop. */
  readonly after: CropPurposeId | null;
}

export type PlanSpan = CropSpan | OpenSpan;

export function planSpans(plan: Plan): readonly PlanSpan[] {
  return spansIn(plan.horizon, plan.occurrences);
}

/** A crop that starts before the plan's year keeps its real dates for its row, and shareOf cuts its bar at the edge. */
export function baselineSpans(plan: Plan, baseline: AssessedBaseline): readonly PlanSpan[] {
  return spansIn(plan.horizon, baseline.occurrences);
}

function spansIn(year: Year, occurrences: readonly PlanOccurrence[]): readonly PlanSpan[] {
  const spans: PlanSpan[] = [];
  let free = year.start;
  let previous: CalendarOccurrence | null = null;
  const byPlanting = [...occurrences].sort((a, b) => a.planted.localeCompare(b.planted));
  for (const [index, occurrence] of byPlanting.entries()) {
    const openEnd = occurrence.planted < year.endExclusive ? occurrence.planted : year.endExclusive;
    if (openEnd > free) spans.push(openSpan(free, openEnd, previous));
    spans.push({
      kind: "crop",
      order: index + 1,
      cropPurposeId: occurrence.cropPurposeId,
      planted: occurrence.planted,
      lastOccupied: occurrence.lastOccupied,
      fieldAvailable: occurrence.fieldAvailable,
      occupiedDays: daysBetween(occurrence.planted, occurrence.lastOccupied) + 1,
      ...(occurrence.modeledTiming ? { modeledTiming: occurrence.modeledTiming } : {}),
    });
    const dayAfter = addDays(occurrence.lastOccupied, 1);
    if (dayAfter > free) free = dayAfter;
    previous = occurrence;
  }
  if (year.endExclusive > free) spans.push(openSpan(free, year.endExclusive, previous));
  return spans;
}

function openSpan(first: IsoDate, endExclusive: IsoDate, harvested: CalendarOccurrence | null): OpenSpan {
  const openDays = daysBetween(first, endExclusive);
  const turnaround = harvested === null ? 0 : daysBetween(first, harvested.fieldAvailable);
  return {
    kind: "open",
    first,
    last: addDays(endExclusive, -1),
    openDays,
    afterHarvestDays: Math.min(openDays, Math.max(0, turnaround)),
    after: harvested?.cropPurposeId ?? null,
  };
}

/** What the farmer said grew last year. Shown as context when the baseline was not scored, or beside no plan. */
export type ReportedSpan =
  | {
      readonly kind: "crop";
      readonly crop: { readonly listed: CropPurposeId } | { readonly unlisted: string };
      readonly planted: IsoDate;
      readonly harvested: IsoDate;
      readonly plantedAbout: boolean;
      readonly harvestedAbout: boolean;
    }
  | { readonly kind: "empty"; readonly first: IsoDate; readonly last: IsoDate; readonly spanDays: number }
  | { readonly kind: "not_sure"; readonly first: IsoDate; readonly last: IsoDate; readonly spanDays: number };

/** Stretches the farmer left blank stay "not_sure": unknown is never drawn as empty. */
export function reportedSpans(history: RecordedHistory): readonly ReportedSpan[] {
  const spans: ReportedSpan[] = [];
  let unknownFrom = history.start;
  const notSure = (endExclusive: IsoDate) => {
    if (endExclusive > unknownFrom) {
      spans.push({ kind: "not_sure", first: unknownFrom, last: addDays(endExclusive, -1), spanDays: daysBetween(unknownFrom, endExclusive) });
    }
  };
  const startOf = (entry: RecordedHistory["entries"][number]) => (entry.kind === "crop" ? entry.planted : entry.start);
  for (const entry of [...history.entries].sort((a, b) => startOf(a).localeCompare(startOf(b)))) {
    notSure(startOf(entry));
    if (entry.kind === "crop") {
      spans.push({
        kind: "crop",
        crop: entry.crop.kind === "catalogue" ? { listed: entry.crop.cropPurposeId } : { unlisted: entry.crop.label },
        planted: entry.planted,
        harvested: entry.harvested,
        plantedAbout: entry.plantedPrecision === "approximate",
        harvestedAbout: entry.harvestedPrecision === "approximate",
      });
      unknownFrom = addDays(entry.harvested, 1);
    } else {
      spans.push({ kind: "empty", first: entry.start, last: addDays(entry.endExclusive, -1), spanDays: daysBetween(entry.start, entry.endExclusive) });
      unknownFrom = entry.endExclusive;
    }
  }
  notSure(history.endExclusive);
  return spans;
}
