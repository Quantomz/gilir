import type { IsoDate } from "@/contracts/common";

const DAY_MS = 86_400_000;
const toMs = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
const fromMs = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10) as IsoDate;

export const addDays = (iso: string, n: number): IsoDate => fromMs(toMs(iso) + n * DAY_MS);
export const daysBetween = (start: string, endExclusive: string): number => Math.round((toMs(endExclusive) - toMs(start)) / DAY_MS);
export const dayOfYear = (iso: string): number => daysBetween(`${iso.slice(0, 4)}-01-01`, iso) + 1;
export const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();
const isLeapYear = (year: number): boolean => daysInMonth(year, 2) === 29;

/** The replay anchor in `year` for a plan's month-day; 29 February falls back to 28 February. */
export function anchorDate(year: number, monthDay: string): IsoDate {
  const md = monthDay === "02-29" && !isLeapYear(year) ? "02-28" : monthDay;
  return `${String(year).padStart(4, "0")}-${md}` as IsoDate;
}
