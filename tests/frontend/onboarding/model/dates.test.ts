// Node environment. Pure date arithmetic on the contract's branded IsoDate (src/features/onboarding/model/dates.ts).
// Outlines: it.todo reports as "todo", never as a pass, until the body is written. Ids in brackets are rows of
// ground/requirements.md, so `rg "\[G3\]" tests/frontend/onboarding` finds every case for a row.
import { describe, it } from "vitest";

describe("isoDate", () => {
  it.todo("[G1] rejects 2026-02-30, 2025-02-29 and \"\" (null) and accepts 2024-02-29 as a branded date");
});

describe("addYears and the plan window", () => {
  it.todo("addYears(2028-02-29, -1) is 2027-02-28 and addYears(2028-02-29, 1) is 2029-02-28 (spec.md:259)");
  it.todo("[G3] planLastDay(2028-02-29) is 2029-02-27: the window is [start, anniversary) and shows its last day");
  it.todo("[G3] planLastDay(2026-07-01) is 2027-06-30");
});

describe("display", () => {
  it.todo("[B7] formatDay(2026-07-01) shows 1 July in a UTC-10 time zone (process.env.TZ), never 30 June");
  it.todo("[B7] formatInstant shows completedAt 2026-07-01T23:30:00Z as the local calendar day (known issue 23)");
  it.todo("[G4] todayLocal uses the browser's own calendar day, so the past-date note follows the farmer's clock");
});
