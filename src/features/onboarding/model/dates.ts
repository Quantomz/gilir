// Calendar-day arithmetic on the contract's branded IsoDate. Pure.
// Every function that makes a date parses it with the contract's own isoDateSchema, so no value is cast to IsoDate.
// All arithmetic is on UTC midnights, so a calendar date never shifts with the browser's time zone.
import { isoDateSchema } from "@/contracts";
import type { IsoDate } from "@/contracts";

/** Parse what an `<input type="date">` gives ("" or "YYYY-MM-DD"). Null for empty or impossible dates (2026-02-30). */
export function isoDate(raw: string): IsoDate | null {
  const parsed = isoDateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** date + n days. */
export function addDays(date: IsoDate, days: number): IsoDate {
  throw new Error("not implemented");
  // TODO: utc(date) + days * 86_400_000 -> "YYYY-MM-DD" (getUTC*, year padded to 4) -> isoDateSchema.parse.
}

/** date + n years. Feb 29 becomes Feb 28 when the target year is not a leap year (spec.md:259). */
export function addYears(date: IsoDate, years: number): IsoDate {
  throw new Error("not implemented");
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  throw new Error("not implemented");
}

/**
 * The last day the plan covers: the anniversary minus one day. The plan window is [start, anniversary)
 * (spec.md:259), so a 2028-02-29 start ends on 2029-02-27 (requirement G3).
 */
export function planLastDay(planningStart: IsoDate): IsoDate {
  return addDays(addYears(planningStart, 1), -1);
}

/** Today's calendar date in the browser's own time zone. Used only for the soft "This date has passed" note. */
export function todayLocal(now: Date = new Date()): IsoDate {
  throw new Error("not implemented");
}

/** A calendar date in the browser's language and date order, read as UTC so it never shows the day before (gotcha 9). */
export function formatDay(date: IsoDate, style: "short" | "long"): string {
  throw new Error("not implemented");
  // TODO: new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { day: "numeric", month: style, year: "numeric", timeZone: "UTC" })
}

/** A real timestamp (CompletedSnapshot.completedAt) as a local calendar date. Never the UTC date (known issue 23). */
export function formatInstant(isoDateTime: string): string {
  throw new Error("not implemented");
}

/** Localised month name for the overview strip, "short" or "narrow" by the width the strip gives it. */
export function monthName(month0: number, kind: "short" | "narrow"): string {
  throw new Error("not implemented");
}
