import type { CandidateCalendar } from "@/contracts/engine";
import type { CalendarOccurrence } from "@/contracts/result";
import { canFollow, occurrenceAt, ordinal } from "./calendar";
import type { CalendarDomain } from "./calendar";

export interface GridEnd { readonly kind: "grid_complete" | "limit_reached"; readonly expandedStates: number }

export function* enumerateGrid(domain: CalendarDomain, stepDays: number, expansionLimit: number,
  baseline: CandidateCalendar | null): Generator<{ readonly calendar: CandidateCalendar; readonly expandedStates: number }, GridEnd> {
  if (!Number.isSafeInteger(stepDays) || stepDays < 1 || !Number.isSafeInteger(expansionLimit) || expansionLimit < 0) {
    throw new Error("Invalid ranking grid settings.");
  }
  const fixedDates = domain.profiles.map((_, crop) => [...new Set([
    ...Array.from({ length: Math.ceil(domain.days / stepDays) }, (_, index) => index * stepDays),
    ...domain.edges[crop],
    ...(baseline?.occurrences.map(item => ordinal(item.planted) - domain.start) ?? []),
  ])].sort((a, b) => a - b));
  const path: CalendarOccurrence[] = [];
  let expandedStates = 0;
  function* visit(day: number, previous: number, mask: number): Generator<{ readonly calendar: CandidateCalendar; readonly expandedStates: number }, boolean> {
    if (expandedStates === expansionLimit) return false;
    expandedStates++;
    if (domain.lowerBound[mask] > domain.days - day) return true;
    if (mask === domain.fullMask) yield { calendar: { origin: "generated", horizon: domain.horizon, occurrences: [...path] }, expandedStates };
    const predecessor = previous === domain.profiles.length ? domain.initialPredecessor : domain.profiles[previous].cropPurposeId;
    for (let crop = 0; crop < domain.profiles.length; crop++) {
      if (!canFollow(predecessor, domain.profiles[crop].cropPurposeId, domain.rules)) continue;
      const dates = [...new Set([day, ...fixedDates[crop]])].sort((a, b) => a - b);
      for (const planted of dates) {
        if (planted < day || !domain.allowed[crop][planted] || planted + domain.spans[crop] > domain.days) continue;
        path.push(occurrenceAt(domain, crop, planted));
        const complete = yield* visit(planted + domain.spans[crop], crop, mask | (1 << crop));
        path.pop();
        if (!complete) return false;
      }
    }
    return true;
  }
  const complete = yield* visit(0, domain.profiles.length, 0);
  return { kind: complete ? "grid_complete" : "limit_reached", expandedStates };
}
