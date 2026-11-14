import { describe, expect, it } from "vitest";
import { cropDemand, dailyKc } from "@/engine/metrics/crop";
import { metricInputFixture } from "@/fixtures/science";
import { av, missing } from "./helpers";

const close = (actual: readonly number[], expected: readonly number[]) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 10));
};

describe("Kc stage interpolation", () => {
  it("synthetic fixture profile (1-day stages, Kc 0.5 / 0.8 / 0.6) gives [0.5, 0.8, 0.8, 0.6]", () => {
    const p = metricInputFixture.profiles[0];
    close(dailyKc(p.kc, p.timing.generatedStageDays), [0.5, 0.8, 0.8, 0.6]);
  });

  it("is flat in initial and middle stages and linear through development and late, reaching each endpoint", () => {
    // initial 2 @0.3, development 4 -> 1.2, middle 3 @1.2, late 2 -> 0.6
    close(
      dailyKc({ initial: 0.3, middle: 1.2, end: 0.6 }, { initial: 2, development: 4, middle: 3, late: 2 }),
      [0.3, 0.3, 0.525, 0.75, 0.975, 1.2, 1.2, 1.2, 1.2, 0.9, 0.6],
    );
  });

  it("returns one value per occupied day (sum of the stage lengths)", () => {
    expect(dailyKc({ initial: 0.4, middle: 1.1, end: 0.5 }, { initial: 20, development: 30, middle: 40, late: 25 })).toHaveLength(115);
  });

  it("handles a late stage that rises (Kc end above Kc mid)", () => {
    close(dailyKc({ initial: 0.5, middle: 0.5, end: 1.0 }, { initial: 1, development: 1, middle: 1, late: 2 }), [0.5, 0.5, 0.5, 0.75, 1.0]);
  });
});

describe("crop demand ETc = Kc x ET0", () => {
  it("multiplies Kc by ET0", () => {
    expect(cropDemand(0.8, av(5))).toEqual({ kind: "available", value: 4 });
  });

  it("is zero demand, not unavailable, when Kc is 0", () => {
    expect(cropDemand(0, av(5))).toEqual({ kind: "available", value: 0 });
  });

  it("stays unavailable when ET0 is unavailable", () => {
    expect(cropDemand(0.8, missing()).kind).toBe("unavailable");
  });
});
