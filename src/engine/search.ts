import type { CalendarSearchInput, CalendarSearchResult, CandidateCalendar } from "@/contracts/engine";
import type { CalendarOccurrence } from "@/contracts/result";
import { calendarProblems, canFollow, compileCalendar, occurrenceAt } from "./search/calendar";

export { rankCandidates } from "./search/ranking";

export function findCalendar(input: CalendarSearchInput): CalendarSearchResult {
  const domain = compileCalendar(input);
  if (input.eligibleBaseline && calendarProblems(input.eligibleBaseline, domain).length === 0) {
    return { kind: "witness", calendar: input.eligibleBaseline, expandedStates: 0 };
  }
  if (domain.lowerBound[0] > domain.days) {
    return { kind: "proved_impossible", expandedStates: 0, proof: {
      kind: "duration_lower_bound", horizonDays: domain.days, mandatoryMinimumDays: domain.lowerBound[0],
      minimumByCrop: domain.profiles.map((profile, index) => ({ cropPurposeId: profile.cropPurposeId, minimumDays: domain.spans[index] })),
    } };
  }
  const width = domain.profiles.length + 1;
  const masks = domain.fullMask + 1;
  const visited = new Uint8Array(Math.ceil((domain.days + 1) * width * masks / 8));
  const path: CalendarOccurrence[] = [];
  let expandedStates = 0;
  let witness: CandidateCalendar | null = null;
  function visit(day: number, previous: number, mask: number): "found" | "exhausted" | "limited" {
    if (mask === domain.fullMask) {
      witness = { origin: "generated", horizon: domain.horizon, occurrences: [...path] };
      return "found";
    }
    if (domain.lowerBound[mask] > domain.days - day) return "exhausted";
    const key = (day * width + previous) * masks + mask;
    const byte = Math.floor(key / 8);
    const bit = 1 << (key % 8);
    if (visited[byte] & bit) return "exhausted";
    if (expandedStates === input.expansionLimit) return "limited";
    visited[byte] |= bit;
    expandedStates++;
    const predecessor = previous === domain.profiles.length ? domain.initialPredecessor : domain.profiles[previous].cropPurposeId;
    for (let crop = 0; crop < domain.profiles.length; crop++) {
      if (!domain.allowed[crop][day] || day + domain.spans[crop] > domain.days
        || !canFollow(predecessor, domain.profiles[crop].cropPurposeId, domain.rules)) continue;
      path.push(occurrenceAt(domain, crop, day));
      const result = visit(day + domain.spans[crop], crop, mask | (1 << crop));
      path.pop();
      if (result !== "exhausted") return result;
    }
    return day < domain.days ? visit(day + 1, previous, mask) : "exhausted";
  }
  const result = visit(0, domain.profiles.length, 0);
  if (result === "found" && witness) return { kind: "witness", calendar: witness, expandedStates };
  if (result === "limited") return { kind: "limit_reached", expandedStates };
  return { kind: "proved_impossible", expandedStates, proof: {
    kind: "structural_exhaustion", horizon: input.horizon, expandedStates,
    constraints: ["Every selected crop must fit with its released occupancy and turnaround.",
      "Hard planting windows and applicable successor prohibitions apply on every day."],
  } };
}
