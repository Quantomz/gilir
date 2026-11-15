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

describe("floating-point thermal thresholds", () => {
  const barley = { baseC: 0, upperC: 30, incrementalStageGdd: { initial: 300, development: 675, middle: 690, late: 660 } };
  const temperatures = (values: number[]) => prepareThermal(values.map(value => ({ minC: value, maxC: value })), barley);
  it("completes the published 2325-GDD barley target after 250 days at 9.3 C", () => {
    const result = trajectory(temperatures([...Array(250).fill(9.3), ...Array(115).fill(0)]), barley, kc, 0);
    expect(result.kind).toBe("completed");
    if (result.kind === "completed") expect(result.endOffset).toBe(250);
  });
  it("preserves the completion date after a shifted planting origin and a zero-GDD tail", () => {
    const result = trajectory(temperatures([...Array(31).fill(17.1), ...Array(250).fill(9.3), ...Array(84).fill(0)]), barley, kc, 31);
    expect(result.kind).toBe("completed");
    if (result.kind === "completed") expect(result.endOffset).toBe(281);
  });
  it("does not turn a genuinely insufficient thermal sum into completion", () => {
    const result = trajectory(temperatures([...Array(249).fill(9.3), 9.3 - 0.000001, ...Array(115).fill(0)]), barley, kc, 0);
    expect(result.kind).toBe("not_completed");
  });
});

describe("roundoff during temperature subtraction", () => {
  it("reaches a 20-GDD initial stage after 200 days at 10.1 C above a 10 C base", () => {
    const stages = { ...model, incrementalStageGdd: { initial: 20, development: 20, middle: 20, late: 20 } };
    const days = [...Array(200).fill(10.1), ...Array(6).fill(20), ...Array(159).fill(10)].map(t => ({ minC: t, maxC: t }));
    const result = trajectory(prepareThermal(days, stages), stages, kc, 0);
    expect(result.kind).toBe("completed");
    if (result.kind === "completed") expect(result.stageCompletionOffsets).toEqual([200, 202, 204, 206]);
  });
});
