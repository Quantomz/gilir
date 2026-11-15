// Node environment. Ids in brackets name the requirement each case covers, so `rg "\[G3\]" tests/frontend/onboarding`
// finds every case for a row.
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { parseIsoDate } from "@/contracts";
import type { IsoDate } from "@/contracts";
import {
  addYears,
  formatDay,
  formatInstant,
  isoDate,
  planLastDay,
  todayLocal,
} from "@/features/onboarding/model/dates";

const realZone = process.env.TZ;
afterEach(() => {
  if (realZone === undefined) delete process.env.TZ;
  else process.env.TZ = realZone;
});

// The month as this runtime's language writes it, read from mid-month so no time zone can move it.
function monthWord(month0: number, style: "short" | "long"): string {
  return new Date(Date.UTC(2000, month0, 15)).toLocaleDateString(undefined, { month: style, timeZone: "UTC" });
}

describe("isoDate", () => {
  it("[G1] rejects 2026-02-30, 2025-02-29 and \"\" (null) and accepts 2024-02-29 as a branded date", () => {
    expect(isoDate("2026-02-30")).toBeNull();
    expect(isoDate("2025-02-29")).toBeNull();
    expect(isoDate("")).toBeNull();
    expect(isoDate("2024-02-29")).toBe("2024-02-29");
    expectTypeOf(isoDate).returns.toEqualTypeOf<IsoDate | null>();
  });

  it("[G1] refuses years 0000 and 9999, whose 12 months before or plan year after are not writable dates", () => {
    expect(isoDate("0000-06-01")).toBeNull();
    expect(isoDate("9999-06-01")).toBeNull();
    expect(isoDate("0001-01-01")).toBe("0001-01-01");
    expect(isoDate("9998-12-31")).toBe("9998-12-31");
    expect(addYears(parseIsoDate("0001-01-01"), -1)).toBe("0000-01-01");
    expect(planLastDay(parseIsoDate("9998-12-31"))).toBe("9999-12-30");
  });
});

describe("addYears and the plan window", () => {
  it("addYears(2028-02-29, -1) is 2027-02-28 and addYears(2028-02-29, 1) is 2029-02-28", () => {
    expect(addYears(parseIsoDate("2028-02-29"), -1)).toBe("2027-02-28");
    expect(addYears(parseIsoDate("2028-02-29"), 1)).toBe("2029-02-28");
    expect(addYears(parseIsoDate("2028-02-29"), 4)).toBe("2032-02-29");
  });

  it("[G3] planLastDay(2028-02-29) is 2029-02-27: the window is [start, anniversary) and shows its last day", () => {
    expect(planLastDay(parseIsoDate("2028-02-29"))).toBe("2029-02-27");
  });

  it("[G3] planLastDay(2026-07-01) is 2027-06-30", () => {
    expect(planLastDay(parseIsoDate("2026-07-01"))).toBe("2027-06-30");
  });
});

describe("display", () => {
  it("[B7] formatDay(2026-07-01) shows 1 July in a UTC-10 time zone (process.env.TZ), never 30 June", () => {
    process.env.TZ = "Pacific/Honolulu";
    for (const style of ["short", "long"] as const) {
      const shown = formatDay(parseIsoDate("2026-07-01"), style);
      expect(shown).toContain(monthWord(6, style));
      expect(shown).not.toContain(monthWord(5, style));
      expect(shown).toMatch(/\b1\b/);
      expect(shown).toContain("2026");
    }
  });

  it("[B7] formatInstant shows completedAt 2026-07-01T23:30:00Z as the local calendar day: 2 July at UTC+9, 1 July at UTC-10", () => {
    process.env.TZ = "Asia/Tokyo";
    const inTokyo = formatInstant("2026-07-01T23:30:00Z");
    expect(inTokyo).toContain(monthWord(6, "short"));
    expect(inTokyo).toMatch(/\b2\b/);
    expect(inTokyo).not.toMatch(/\b1\b/);

    process.env.TZ = "Pacific/Honolulu";
    const inHonolulu = formatInstant("2026-07-01T23:30:00Z");
    expect(inHonolulu).toContain(monthWord(6, "short"));
    expect(inHonolulu).toMatch(/\b1\b/);
    expect(inHonolulu).not.toMatch(/\b2\b/);
  });

  it("[G4] todayLocal uses the browser's own calendar day, so the past-date note follows the farmer's clock", () => {
    const instant = new Date("2026-07-01T23:30:00Z");
    process.env.TZ = "Asia/Tokyo";
    expect(todayLocal(instant)).toBe("2026-07-02");
    process.env.TZ = "Pacific/Honolulu";
    expect(todayLocal(instant)).toBe("2026-07-01");
  });
});
