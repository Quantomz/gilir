import { describe, expect, it } from "vitest";
import { dailyGdd, prepareThermal, trajectory } from "@/engine/model/thermal";

const model = { baseC: 10, upperC: 30, incrementalStageGdd: { initial: 10, development: 20, middle: 10, late: 20 } };
const kc = { initial: 0.2, middle: 1, end: 0.4 };
const series = (temperatures: number[]) => prepareThermal(temperatures.map(t => ({ minC: t, maxC: t })), model);

describe("potential thermal development", () => {
  it("caps the mean of the extrema, with a zero floor", () => {
    expect(dailyGdd({ minC: 0, maxC: 50 }, model)).toBe(15);
    expect(dailyGdd({ minC: 30, maxC: 50 }, model)).toBe(20);
    expect(dailyGdd({ minC: -10, maxC: 5 }, model)).toBe(0);
  });
  it("uses incremental targets and carries a day's progress across stage boundaries", () => {
    const result = trajectory(series([30, 30, 30, 30]), model, kc, 0);
    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") return;
    expect(result.endOffset).toBe(3);
    expect(result.stageCompletionOffsets).toEqual([1, 2, 2, 3]);
    expect(result.kc).toEqual([0.2, 1, 0.4]);
  });
  it("keeps zero-GDD days inside the current stage and retains noncompletion", () => {
    const completed = trajectory(series([20, 10, 30, 30, 20]), model, kc, 0);
    expect(completed.kind).toBe("completed");
    if (completed.kind === "completed") expect(completed.kc[1]).toBeCloseTo(0.6);
    expect(trajectory(series([10, 10, 10]), model, kc, 0)).toEqual({ kind: "not_completed", achievedGdd: 0, requiredGdd: 60 });
  });
  it("has less time to develop when planting later", () => {
    expect(trajectory(series([30, 30, 30]), model, kc, 1).kind).toBe("not_completed");
  });
});
