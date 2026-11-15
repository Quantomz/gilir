import type { CropPurposeId } from "@/contracts/common";
import type { CalendarProof } from "@/contracts/result";
import type { RotationRule } from "@/contracts/registry";
import { canFollow } from "../search/calendar";
import type { CropSeasonDomain, Placement } from "./domain";

export interface ModelSearchInput {
  readonly domain: CropSeasonDomain;
  readonly rules: readonly RotationRule[];
  readonly initialPredecessor: CropPurposeId | null;
  readonly expansionLimit: number;
}

type StructuralResult =
  | { readonly kind: "witness"; readonly sequence: readonly Placement[]; readonly expandedStates: number }
  | { readonly kind: "proved_impossible"; readonly proof: CalendarProof; readonly expandedStates: number }
  | { readonly kind: "limit_reached"; readonly expandedStates: number };

function bounds(domain: CropSeasonDomain) {
  const fullMask = (1 << domain.models.length) - 1;
  const lower = new Float64Array(fullMask + 1);
  for (let mask = 0; mask <= fullMask; mask++) {
    for (let crop = 0; crop < domain.models.length; crop++) if (!(mask & (1 << crop))) lower[mask] += domain.minimumSpans[crop];
  }
  return { fullMask, lower };
}

export function findModelCalendar(input: ModelSearchInput): StructuralResult {
  const { domain } = input;
  const { fullMask, lower } = bounds(domain);
  let expandedStates = 0;
  const proof = (): StructuralResult => ({ kind: "proved_impossible", expandedStates, proof: {
    kind: "structural_exhaustion", horizon: domain.horizon, expandedStates,
    constraints: ["Every selected crop must complete in every retained weather replay under the released thermal model.",
      "Reserve through the latest modeled harvest plus turnaround, within one calendar year, with successor prohibitions."],
  } });
  if (!Number.isFinite(lower[0])) return proof();
  if (lower[0] > domain.days) return { kind: "proved_impossible", expandedStates, proof: {
    kind: "duration_lower_bound", horizonDays: domain.days, mandatoryMinimumDays: lower[0],
    minimumByCrop: domain.models.map((model, index) => ({ cropPurposeId: model.cropPurposeId, minimumDays: domain.minimumSpans[index] })),
  } };
  const width = domain.models.length + 1;
  const masks = fullMask + 1;
  const visited = new Uint8Array(Math.ceil((domain.days + 1) * width * masks / 8));
  const path: Placement[] = [];
  let witness: readonly Placement[] | null = null;
  function visit(day: number, previous: number, mask: number): "found" | "exhausted" | "limited" {
    if (mask === fullMask) { witness = [...path]; return "found"; }
    if (lower[mask] > domain.days - day) return "exhausted";
    const key = (day * width + previous) * masks + mask;
    const byte = Math.floor(key / 8);
    const bit = 1 << (key % 8);
    if (visited[byte] & bit) return "exhausted";
    if (expandedStates === input.expansionLimit) return "limited";
    expandedStates++;
    visited[byte] |= bit;
    const predecessor = previous === domain.models.length ? input.initialPredecessor : domain.models[previous].cropPurposeId;
    for (let crop = 0; crop < domain.models.length; crop++) {
      const placement = domain.placement(crop, day);
      if (!placement || !canFollow(predecessor, domain.models[crop].cropPurposeId, input.rules)) continue;
      path.push(placement);
      const result = visit(placement.availableOffset, crop, mask | (1 << crop));
      path.pop();
      if (result !== "exhausted") return result;
    }
    return day < domain.days ? visit(day + 1, previous, mask) : "exhausted";
  }
  const result = visit(0, domain.models.length, 0);
  if (result === "found" && witness) return { kind: "witness", sequence: witness, expandedStates };
  return result === "limited" ? { kind: "limit_reached", expandedStates } : proof();
}

export function* enumerateModelGrid(input: ModelSearchInput, stepDays: number): Generator<{
  readonly sequence: readonly Placement[]; readonly expandedStates: number;
}, { readonly kind: "grid_complete" | "limit_reached"; readonly expandedStates: number }> {
  const { domain } = input;
  const { fullMask, lower } = bounds(domain);
  const fixedDates = [...new Set([...Array.from({ length: Math.ceil(domain.days / stepDays) }, (_, index) => index * stepDays), ...domain.edges])].sort((a, b) => a - b);
  const path: Placement[] = [];
  let expandedStates = 0;
  function* visit(day: number, previous: number, mask: number): Generator<{ readonly sequence: readonly Placement[]; readonly expandedStates: number }, boolean> {
    if (expandedStates === input.expansionLimit) return false;
    expandedStates++;
    if (lower[mask] > domain.days - day) return true;
    if (mask === fullMask) yield { sequence: [...path], expandedStates };
    const predecessor = previous === domain.models.length ? input.initialPredecessor : domain.models[previous].cropPurposeId;
    const dates = [...new Set([day, ...fixedDates.filter(date => date >= day)])].sort((a, b) => a - b);
    for (let crop = 0; crop < domain.models.length; crop++) {
      if (!canFollow(predecessor, domain.models[crop].cropPurposeId, input.rules)) continue;
      for (const planted of dates) {
        const placement = domain.placement(crop, planted);
        if (!placement) continue;
        path.push(placement);
        const complete = yield* visit(placement.availableOffset, crop, mask | (1 << crop));
        path.pop();
        if (!complete) return false;
      }
    }
    return true;
  }
  const complete = yield* visit(0, domain.models.length, 0);
  return { kind: complete ? "grid_complete" : "limit_reached", expandedStates };
}
