import { NotImplementedError } from "@/contracts/common";
import type { CalendarSearchInput, CalendarSearchResult, RankingInput, RankingResult } from "@/contracts/engine";

type FindCalendar = (input: CalendarSearchInput) => CalendarSearchResult;
type RankCandidates = (input: RankingInput) => RankingResult;

export const findCalendar: FindCalendar = () => { throw new NotImplementedError("Calendar search"); };
export const rankCandidates: RankCandidates = () => { throw new NotImplementedError("Candidate ranking"); };
