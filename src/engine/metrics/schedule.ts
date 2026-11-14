import type { DateInterval } from "@/contracts/engine";
import type { CalendarOccurrence } from "@/contracts/result";
import { daysBetween } from "./dates";

/** Days of the plan without a planned crop: occupancy is planted..lastOccupied inclusive, unioned. */
export function unplanted(horizon: DateInterval, occurrences: readonly CalendarOccurrence[]) {
  const length = daysBetween(horizon.start, horizon.endExclusive);
  const occupied = Array<boolean>(length).fill(false);
  for (const o of occurrences) {
    const from = Math.max(0, daysBetween(horizon.start, o.planted));
    const to = Math.min(length - 1, daysBetween(horizon.start, o.lastOccupied));
    for (let i = from; i <= to; i++) occupied[i] = true;
  }
  let days = 0;
  let run = 0;
  let longestGap = 0;
  for (const isOccupied of occupied) {
    run = isOccupied ? 0 : run + 1;
    if (!isOccupied) days++;
    longestGap = Math.max(longestGap, run);
  }
  return { length, days, longestGap };
}
