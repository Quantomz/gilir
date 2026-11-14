import type { EvidenceValue } from "@/contracts/common";
import type { CropProfile } from "@/contracts/registry";
import { available } from "./evidence";

type KcValues = Pick<CropProfile["kc"], "initial" | "middle" | "end">;
export type StageDays = CropProfile["timing"]["generatedStageDays"];
export type Stage = keyof StageDays;

const stageOrder: readonly Stage[] = ["initial", "development", "middle", "late"];

export const totalStageDays = (s: StageDays): number => s.initial + s.development + s.middle + s.late;

/** Day indexes [start, end) of a stage within an occurrence. */
export function stageRange(s: StageDays, stage: Stage): readonly [number, number] {
  const start = stageOrder.slice(0, stageOrder.indexOf(stage)).reduce((sum, name) => sum + s[name], 0);
  return [start, start + s[stage]];
}

const ramp = (from: number, to: number, n: number): number[] =>
  Array.from({ length: n }, (_, i) => from + ((i + 1) / n) * (to - from));

/** One Kc per occupied day: flat initial and middle stages, linear development and late stages ending on their endpoint. */
export function dailyKc(kc: KcValues, s: StageDays): number[] {
  return [
    ...Array<number>(s.initial).fill(kc.initial),
    ...ramp(kc.initial, kc.middle, s.development),
    ...Array<number>(s.middle).fill(kc.middle),
    ...ramp(kc.middle, kc.end, s.late),
  ];
}

export const cropDemand = (kc: number, et0: EvidenceValue<number>): EvidenceValue<number> =>
  et0.kind === "available" ? available(kc * et0.value) : et0;
