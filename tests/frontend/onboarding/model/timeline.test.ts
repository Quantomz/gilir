// Node environment. The history editor's geometry (src/features/onboarding/model/timeline.ts).
import { describe, it } from "vitest";

describe("coverage and spans", () => {
  it.todo("[H2] coverageFor(2027-03-01) is [2026-03-01, 2027-03-01) with 365 days");
  it.todo("[H2] coverageFor(2028-02-29) starts 2027-02-28 and has 366 days");
  it.todo("[H7] a crop planted and harvested on day 0 spans [0, 1): a same-day harvest is one day in the field");
  it.todo("a fallow [2025-07-05, 2025-08-01) spans [4, 31): the exclusive end is not a day of the field");
  it.todo("[H14] placementOf flags a crop harvested on planningStart as outside (src/contracts/input.ts:75)");
});

describe("agreement with the contract (graft from candidate 2)", () => {
  it.todo("[H13] for nine touching layouts (crop then crop same day, next day; fallow then crop same day; crop then fallow same day; harvest on endExclusive; one-day bar; contained bar; outside start; outside end) liveEntryIssues and stepEntry limits agree with farmInputSchema's history.entries issues");
});

describe("gapsOf: gaps stay unknown and are derived", () => {
  it.todo("[H9] no entries gives one gap over the whole window");
  it.todo("[H9] crop [10, 40) and fallow [40, 60) leave gaps [0, 10) and [60, N)");
  it.todo("[H9] a crop harvested on day 39 and a crop planted on day 40 leave no gap between them");
});

describe("stepEntry: drag and keyboard share one rule", () => {
  it.todo("[H4] moving the end handle +1 day adds a day to harvested and keeps planted");
  it.todo("[H4] moving the start handle past the end stops with { kind: \"short\" } and keeps one day");
  it.todo("[H14] moving the end handle onto planningStart stops with { kind: \"edge\" } at endExclusive - 1");
  it.todo("[H13] moving into the next crop stops one day before it with { kind: \"overlap\", with: thatCrop }");
  it.todo("[H13] a crop may end the day before a fallow starts, and a crop may start on a fallow's exclusive end");
  it.todo("[H3] moving the whole bar keeps its length and stops at the window edge");
  it.todo("[H15] a bar already outside the window may move back in but never further out");
  it.todo("stepping to the current day returns the same entries array and no stop (idempotent)");
  it.todo("after a move the entries are still sorted by start day (draft invariant I2)");
});

describe("placeNew", () => {
  it.todo("[H3] an empty year places a 90-day crop at day 0 (policy.history.newCropDays)");
  it.todo("[H3] with a crop at [0, 100) the next crop goes at day 100");
  it.todo("[H3] a tapped gap [200, 230) places the crop inside it, clipped to 30 days");
  it.todo("[H3] a year with only a 5-day gap returns null (the year is full); a 7-day gap is used");
});

describe("moveWindow", () => {
  it.todo("[H15] a new planningStart moves start and endExclusive and keeps every entry unchanged");
  it.todo("[H15] a whole-year empty record follows the new window");
  it.todo("[H1] a skipped history is returned unchanged");
});

describe("pointer to day", () => {
  it.todo("[H4] dayAtPointer maps the track's left edge to day 0, its right edge to day N - 1, and clamps outside the track");
  it.todo("nextEntryId gives crop-N and empty-N one above the largest N in use, with no crypto.randomUUID");
});
