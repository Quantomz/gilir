// Calendar-day arithmetic on the contract's branded IsoDate. Pure.
// Every function that makes a date parses it with the contract's own isoDateSchema, so no value is cast to IsoDate.
// All arithmetic is on UTC midnights, so a calendar date never shifts with the browser's time zone.
import { isoDateSchema } from "@/contracts";
import type { IsoDate } from "@/contracts";

const dayMs = 86_400_000;

/**
 * Parse what an `<input type="date">` gives ("" or "YYYY-MM-DD"). Null for empty or impossible dates (2026-02-30).
 * Years 0000 and 9999 are refused too, because the 12 months before such a date, or the plan year after it, fall
 * outside the four-digit years isoDateSchema accepts.
 */
export function isoDate(raw: string): IsoDate | null {
  const parsed = isoDateSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { year } = partsOf(parsed.data);
  return year >= 1 && year <= 9998 ? parsed.data : null;
}

export function partsOf(date: IsoDate): {
  readonly year: number;
  readonly month0: number;
  readonly day: number;
  readonly monthDays: number;
} {
  const year = Number(date.slice(0, 4));
  const month0 = Number(date.slice(5, 7)) - 1;
  return { year, month0, day: Number(date.slice(8, 10)), monthDays: new Date(utcMs(year, month0 + 1, 0)).getUTCDate() };
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const { year, month0, day } = partsOf(date);
  const moved = new Date(utcMs(year, month0, day) + days * dayMs);
  return isoOf(moved.getUTCFullYear(), moved.getUTCMonth(), moved.getUTCDate());
}

/** date + n years. Feb 29 becomes Feb 28 when the target year is not a leap year. */
export function addYears(date: IsoDate, years: number): IsoDate {
  const { year, month0, day } = partsOf(date);
  const target = year + years;
  const leap = (target % 4 === 0 && target % 100 !== 0) || target % 400 === 0;
  return isoOf(target, month0, month0 === 1 && day === 29 && !leap ? 28 : day);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = partsOf(from);
  const b = partsOf(to);
  return Math.round((utcMs(b.year, b.month0, b.day) - utcMs(a.year, a.month0, a.day)) / dayMs);
}

/**
 * The last day the plan covers: the anniversary minus one day. The plan window is [start, anniversary), so a
 * 2028-02-29 start ends on 2029-02-27.
 */
export function planLastDay(planningStart: IsoDate): IsoDate {
  return addDays(addYears(planningStart, 1), -1);
}

/** Today's calendar date in the browser's own time zone. Used only for the soft "This date has passed" note. */
export function todayLocal(now: Date = new Date()): IsoDate {
  return isoOf(now.getFullYear(), now.getMonth(), now.getDate());
}

/** A calendar date in the browser's language and date order, read as UTC so it never shows the day before. */
export function formatDay(date: IsoDate, style: "short" | "long"): string {
  const { year, month0, day } = partsOf(date);
  return new Date(utcMs(year, month0, day)).toLocaleDateString(undefined, {
    day: "numeric",
    month: style,
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A real timestamp (CompletedSnapshot.completedAt) as the farmer's own calendar date, never the UTC date. */
export function formatInstant(isoDateTime: string): string {
  return new Date(isoDateTime).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Localised month name for the overview strip, "short" or "narrow" by the width the strip gives it. */
export function monthName(month0: number, kind: "short" | "narrow"): string {
  return new Date(utcMs(2001, month0, 1)).toLocaleDateString(undefined, { month: kind, timeZone: "UTC" });
}

// setUTCFullYear, unlike Date.UTC, keeps years 0 to 99 as written instead of moving them to 1900 to 1999.
function utcMs(year: number, month0: number, day: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month0, day);
  return date.getTime();
}

function isoOf(year: number, month0: number, day: number): IsoDate {
  const pad = (value: number, width: number) => String(value).padStart(width, "0");
  return isoDateSchema.parse(`${pad(year, 4)}-${pad(month0 + 1, 2)}-${pad(day, 2)}`);
}
