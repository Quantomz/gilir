import type { EvidenceValue } from "@/contracts/common";
import { available, unavailable } from "./evidence";

export interface WaterResult {
  readonly frequency: number;
  readonly mismatch: number;
  readonly validWindows: number;
}

/**
 * Rolling rain-demand mismatch over every window of `windowDays` (or the whole series if shorter).
 * Windows with any missing value or zero demand are skipped, never read as 0 mm.
 */
export function rollingMismatch(
  demand: readonly EvidenceValue<number>[],
  rain: readonly EvidenceValue<number>[],
  windowDays: number,
): EvidenceValue<WaterResult> {
  const size = Math.min(windowDays, demand.length);
  const ratios: number[] = [];
  for (let start = 0; size > 0 && start + size <= demand.length; start++) {
    let d = 0;
    let p = 0;
    let complete = true;
    for (let k = start; k < start + size && complete; k++) {
      const dk = demand[k];
      const pk = rain[k];
      if (dk?.kind === "available" && pk?.kind === "available") {
        d += dk.value;
        p += pk.value;
      } else {
        complete = false;
      }
    }
    if (complete && d > 0) ratios.push(Math.max(0, d - p) / d);
  }
  if (ratios.length === 0) return unavailable("No rolling window had complete rain and positive crop demand.");
  return available({
    frequency: ratios.filter(r => r > 0).length / ratios.length,
    mismatch: ratios.reduce((sum, r) => sum + r, 0) / ratios.length,
    validWindows: ratios.length,
  });
}
