import { describe, expect, it } from "vitest";
import { syntheticRegistrySchema } from "@/contracts/registry";
import { syntheticRegistryFixture } from "@/fixtures/science";
import { expected, fixture } from "./fixtures";

describe("X3 independent reference checks (zero engine comparisons; run node --import tsx tests/overflow/metric-audit/run.ts)", () => {
  it("checks the frozen window arithmetic", () => {
    process.stdout.write("X3 reference checks only; zero engine comparisons. Run node --import tsx tests/overflow/metric-audit/run.ts for engine comparisons.\n");
    expect(1 / (1 - expected.dayMismatch * 4)).toBeCloseTo(expected.dayEt0, 12);
    expect(expected.dailyEt0.slice(0, 4).reduce((a, b) => a + b, 0)).toBeCloseTo(expected.fourDemand, 12);
    expect((expected.fourDemand - 4) / expected.fourDemand).toBeCloseTo(expected.fourMismatch, 12);
    expected.rollingDemand.forEach((d, i) => {
      expect(expected.dailyEt0.slice(i, i + 7).reduce((a, b) => a + b, 0)).toBeCloseTo(d, 12);
      expect(Math.max(0, d - expected.rollingRain[i]) / d).toBeCloseTo(expected.rollingMismatch[i], 12);
    });
    expect(expected.rollingMismatch.reduce<number>((a, b) => a + b, 0) / 3).toBeCloseTo(expected.meanMismatch, 12);
    expect(expected.rollingMismatch.filter(value => value > 0).length / 3).toBe(expected.meanFrequency);
  });
  it("uses valid synthetic profiles and a full chronological replay", () => {
    for (const input of [fixture(), fixture({ length: 9, wetRepeats: 2 }), fixture({ kc: 0 })]) {
      syntheticRegistrySchema.parse({ ...syntheticRegistryFixture, profiles: input.profiles });
      const days = input.cohort[0].days;
      expect(days).toHaveLength(365);
      expect(days[0].date).toBe(input.cohort[0].interval.start);
      expect(new Date(`${days[364].date}T00:00:00Z`).getTime() + 86400000).toBe(new Date(`${input.cohort[0].interval.endExclusive}T00:00:00Z`).getTime());
      days.slice(1).forEach((day, i) => expect(new Date(`${day.date}T00:00:00Z`).getTime() - new Date(`${days[i].date}T00:00:00Z`).getTime()).toBe(86400000));
      input.calendar.occurrences.forEach((o, index) => {
        expect(o.planted < o.lastOccupied && o.lastOccupied < o.fieldAvailable).toBe(true);
        expect(o.planted >= input.calendar.horizon.start && o.fieldAvailable <= input.calendar.horizon.endExclusive).toBe(true);
        if (index > 0) expect(o.planted >= input.calendar.occurrences[index - 1].fieldAvailable).toBe(true);
      });
    }
  });
  it("removes a required input from every rolling window", () => {
    for (const field of ["humidityPct", "rainMm"] as const) {
      const input = fixture({ length: 9, missing: field });
      for (let start = 0; start < 3; start++) {
        expect(input.cohort[0].days.slice(start, start + 7).filter(day => day[field].kind === "unavailable")).toHaveLength(1);
      }
    }
  });
});
