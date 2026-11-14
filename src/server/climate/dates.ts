import { parseIsoDate, type IsoDate } from "@/contracts/common";
import type { EngineSettings } from "@/contracts/climate";

export const maximumPermittedLookbackDays = 366;
const millisecondsPerDay = 86_400_000;

export function addDays(date: IsoDate, days: number): IsoDate {
  return parseIsoDate(new Date(Date.parse(`${date}T00:00:00Z`) + days * millisecondsPerDay).toISOString().slice(0, 10));
}

export function dayDistance(start: IsoDate, endExclusive: IsoDate): number {
  return (Date.parse(`${endExclusive}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / millisecondsPerDay;
}

export function anchorInYear(date: IsoDate, year: number): IsoDate {
  const monthDay = date.slice(5) === "02-29" && new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1
    ? "02-28" : date.slice(5);
  return parseIsoDate(`${year.toString().padStart(4, "0")}-${monthDay}`);
}

export function historicalPeriod(planningStart: IsoDate, cutoff: IsoDate, settings: EngineSettings) {
  if (!Number.isInteger(settings.targetSeasons) || settings.targetSeasons < 1 || settings.targetSeasons > 100) {
    throw new RangeError("Climate target seasons must be between 1 and 100.");
  }
  const horizonDays = dayDistance(planningStart, anchorInYear(planningStart, Number(planningStart.slice(0, 4)) + 1));
  let latestYear = Number(cutoff.slice(0, 4));
  while (addDays(anchorInYear(planningStart, latestYear), horizonDays) > cutoff) latestYear--;
  const seasons = Array.from({ length: settings.targetSeasons }, (_, index) => {
    const start = anchorInYear(planningStart, latestYear - settings.targetSeasons + index + 1);
    return { start, endExclusive: addDays(start, horizonDays) };
  });
  return {
    start: addDays(seasons[0].start, -maximumPermittedLookbackDays),
    endExclusive: seasons[seasons.length - 1].endExclusive,
    horizonDays,
    seasons,
    lookbackDays: maximumPermittedLookbackDays,
    method: "calendar-anchor-feb29-to-feb28-fixed-horizon-days-v1",
  };
}

export function datesInPeriod(start: IsoDate, endExclusive: IsoDate): IsoDate[] {
  return Array.from({ length: Math.max(0, dayDistance(start, endExclusive)) }, (_, index) => addDays(start, index));
}
