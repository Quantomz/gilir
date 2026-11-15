import type { CropModel } from "@/contracts/model";
import { thermalStages } from "@/contracts/model";
import { dailyKc } from "../metrics/crop";

type Development = Pick<CropModel["development"], "baseC" | "upperC" | "incrementalStageGdd">;
type Coefficients = Pick<CropModel["kc"], "initial" | "middle" | "end">;
export interface PreparedThermal { readonly prefix: Float64Array; readonly daily: Float64Array }
export type ThermalOutcome =
  | { readonly kind: "not_completed"; readonly achievedGdd: number; readonly requiredGdd: number }
  | { readonly kind: "completed"; readonly endOffset: number; readonly stageCompletionOffsets: readonly [number, number, number, number]; readonly kc: readonly number[] };

export function dailyGdd(day: { readonly minC: number; readonly maxC: number }, model: Pick<Development, "baseC" | "upperC">): number {
  return Math.max(0, Math.min((day.maxC + day.minC) / 2, model.upperC) - model.baseC);
}

export function prepareThermal(days: readonly { readonly minC: number; readonly maxC: number }[], model: Development): PreparedThermal {
  const daily = Float64Array.from(days, day => dailyGdd(day, model));
  const prefix = new Float64Array(daily.length + 1);
  for (let index = 0; index < daily.length; index++) prefix[index + 1] = prefix[index] + daily[index];
  return { prefix, daily };
}

function firstReached(prefix: Float64Array, target: number, start: number): number {
  let low = start + 1;
  let high = prefix.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (prefix[middle] >= target) high = middle;
    else low = middle + 1;
  }
  return low;
}

export function completion(thermal: PreparedThermal, model: Development, plantedOffset: number) {
  const totals: [number, number, number, number] = [0, 0, 0, 0];
  let target = 0;
  thermalStages.forEach((stage, index) => { target += model.incrementalStageGdd[stage]; totals[index] = target; });
  const origin = thermal.prefix[plantedOffset];
  const achievedGdd = thermal.prefix[thermal.daily.length] - origin;
  if (achievedGdd < target) return { kind: "not_completed", achievedGdd, requiredGdd: target } as const;
  const stageCompletionOffsets: [number, number, number, number] = [
    firstReached(thermal.prefix, origin + totals[0], plantedOffset),
    firstReached(thermal.prefix, origin + totals[1], plantedOffset),
    firstReached(thermal.prefix, origin + totals[2], plantedOffset),
    firstReached(thermal.prefix, origin + totals[3], plantedOffset),
  ];
  return { kind: "completed", endOffset: stageCompletionOffsets[3], stageCompletionOffsets, totals } as const;
}

export function trajectory(thermal: PreparedThermal, model: Development, coefficients: Coefficients, plantedOffset: number): ThermalOutcome {
  const result = completion(thermal, model, plantedOffset);
  if (result.kind === "not_completed") return result;
  const ends = result.stageCompletionOffsets;
  const kc = dailyKc(coefficients, {
    initial: ends[0] - plantedOffset,
    development: ends[1] - ends[0],
    middle: ends[2] - ends[1],
    late: ends[3] - ends[2],
  });
  return { kind: "completed", endOffset: result.endOffset, stageCompletionOffsets: ends, kc };
}
