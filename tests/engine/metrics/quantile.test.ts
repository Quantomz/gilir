import { describe, expect, it } from "vitest";
import { nearestRankQuantile } from "@/engine/metrics/quantile";

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("nearest-rank quantile Qp = x[ceil(p * N)] (1-based, sorted)", () => {
  it("Q0.9 of 1..10 is the 9th value", () => {
    expect(nearestRankQuantile(range(10), 0.9)).toBe(9);
  });

  it("sorts its input first", () => {
    expect(nearestRankQuantile([7, 3, 10, 1, 9, 2, 8, 4, 6, 5], 0.9)).toBe(9);
  });

  it("Q0.9 of 25 seasons is the 23rd value", () => {
    expect(nearestRankQuantile(range(25), 0.9)).toBe(23);
  });

  it("Q0.9 of 30 values is the 27th when p * N is an exact integer rank", () => {
    expect(nearestRankQuantile(range(30), 0.9)).toBe(27);
  });

  it("Q0.07 of 100 values is the 7th, not the 8th (0.07 * 100 is 7.000000000000001 in floating point)", () => {
    expect(nearestRankQuantile(range(100), 0.07)).toBe(7);
  });

  it("Q0.5 of 4 values is the 2nd (no interpolation)", () => {
    expect(nearestRankQuantile([10, 20, 30, 40], 0.5)).toBe(20);
  });

  it("Q0.1 of 15 values is the 2nd", () => {
    expect(nearestRankQuantile(range(15), 0.1)).toBe(2);
  });

  it("a single observation is every quantile", () => {
    expect(nearestRankQuantile([0.42], 0.9)).toBe(0.42);
    expect(nearestRankQuantile([0.42], 0.1)).toBe(0.42);
  });

  it("returns null for no observations", () => {
    expect(nearestRankQuantile([], 0.9)).toBeNull();
  });

  it("does not mutate its input", () => {
    const input = [3, 1, 2];
    nearestRankQuantile(input, 0.5);
    expect(input).toEqual([3, 1, 2]);
  });
});
