import type { CropProfile, RegistryLookup } from "@/contracts/registry";
import type { LngLat } from "@/contracts/input";

type Scope = CropProfile["applicability"]["scope"];
type Bounds = Extract<Scope, { kind: "regional" }>["bounds"][number];

const levels = { regional: 0, climate: 1, broad: 2 } as const;

export function scopeLevel(scope: Scope): number {
  return levels[scope.kind];
}

function longitudeInside([longitude]: LngLat, bounds: Bounds): boolean {
  return bounds.westDeg <= bounds.eastDeg
    ? longitude >= bounds.westDeg && longitude <= bounds.eastDeg
    : longitude >= bounds.westDeg || longitude <= bounds.eastDeg;
}

export function boundsContain(bounds: Bounds, point: LngLat): boolean {
  return point[1] >= bounds.southDeg && point[1] <= bounds.northDeg && longitudeInside(point, bounds);
}

export type ScopeMatch = "inside" | "outside" | "unknown";

export function matchScope(scope: Scope, lookup: RegistryLookup): ScopeMatch {
  if (scope.kind === "broad") return "inside";
  if (scope.kind === "regional") return scope.bounds.some(bounds => boundsContain(bounds, lookup.lookup)) ? "inside" : "outside";
  const value = scope.variable === "mean_annual_temperature_c" ? lookup.climate.meanAnnualTemperatureC : lookup.climate.meanAnnualPrecipitationMm;
  if (value.kind === "unavailable") return "unknown";
  return value.value >= scope.inclusiveRange[0] && value.value <= scope.inclusiveRange[1] ? "inside" : "outside";
}

export function isApplicable(applicability: CropProfile["applicability"], lookup: RegistryLookup): ScopeMatch {
  const scope = matchScope(applicability.scope, lookup);
  if (scope !== "inside") return scope;
  const exclusions = applicability.exclusions.map(exclusion => matchScope(exclusion, lookup));
  if (exclusions.includes("inside")) return "outside";
  return exclusions.includes("unknown") ? "unknown" : "inside";
}

function longitudeRanges(bounds: Bounds): [number, number][] {
  return bounds.westDeg <= bounds.eastDeg ? [[bounds.westDeg, bounds.eastDeg]] : [[bounds.westDeg, 180], [-180, bounds.eastDeg]];
}

function boundsOverlap(a: Bounds, b: Bounds): boolean {
  if (a.southDeg > b.northDeg || b.southDeg > a.northDeg) return false;
  return longitudeRanges(a).some(([aw, ae]) => longitudeRanges(b).some(([bw, be]) => aw <= be && bw <= ae));
}

export function scopesMayOverlap(a: Scope, b: Scope): boolean {
  if (a.kind === "regional" && b.kind === "regional") return a.bounds.some(left => b.bounds.some(right => boundsOverlap(left, right)));
  if (a.kind === "climate" && b.kind === "climate" && a.variable === b.variable) {
    return a.inclusiveRange[0] <= b.inclusiveRange[1] && b.inclusiveRange[0] <= a.inclusiveRange[1];
  }
  return true;
}
