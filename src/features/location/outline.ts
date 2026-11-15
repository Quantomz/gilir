// Two spaces for one outline:
//   drawing space  `Corners`: an open list whose longitudes run on from corner to corner, so a field across 180° reads
//                  179.99, 180.01. MapLibre, Turf and the flat plan read only this, because a wrapped ring draws as a
//                  line round the world and Turf measures it the long way round.
//   wire space     `Marked.ring` and `Marked.lookup`: the contract's shapes, every longitude in [-180, 180], the ring
//                  closed with the identical first tuple, the lookup strictly inside.
// Only `markOutline` and `markSaved` make a `Marked`, and both end with the contract's own parser.
import area from "@turf/area";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { farmInputSchema, inputLimits } from "@/contracts";
import type { FarmInput, LngLat } from "@/contracts";

export type Field = FarmInput["field"];
export type { LngLat };

/** One corner in drawing space. Its longitude may leave [-180, 180]. */
export type Corner = readonly [lng: number, lat: number];

declare const cornersBrand: unique symbol;
/**
 * Open (no closing copy of the first corner), corner 0's longitude in [-180, 180], every next one within 180° of the
 * corner before it, every number rounded to 6 decimals. Only this file makes one. The count is judged by `markOutline`.
 */
export type Corners = readonly Corner[] & { readonly [cornersBrand]: true };

export const limits = {
  corners: inputLimits.polygonVertices,
  minCorners: 3,
  /** Policy for a farmer's edit only, never for a saved value. */
  minAreaM2: 25,
  /** Policy for a farmer's edit only. The contract has no limit. */
  maxSpanM: 20_000,
  /** MapLibre's Mercator stops at 85.05°, and the server refuses a corner at a pole. */
  maxLatitude: 85,
  decimals: 6,
  /** "Field near <place>" only when the lookup is this close to the place. */
  nearPlaceM: 30_000,
  /** The contract's longest label. Its parser counts code points, not UTF-16 units. */
  labelCodePoints: 240,
} as const;

export const boxSizes = [0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 20, 50] as const;
export type BoxSize = (typeof boxSizes)[number];
/** "Mark my field" and the corner list's first rows start from a box of this many hectares. */
export const startingBox: BoxSize = 1;

/**
 * `markOutline` and `markSaved` return the first six: the outline cannot be drawn or sent. `withinPolicy` returns the
 * last two, for a farmer's edit only.
 */
export type ShapeProblem =
  | "too_few"
  | "too_many"
  | "pole"
  | "repeated"
  /** Two sides cross or touch, or a side doubles back. */
  | "crossing"
  /** No point strictly inside that the contract also accepts. */
  | "no_inside"
  /** A side half the world long, or, as policy, corners more than limits.maxSpanM apart. */
  | "too_far"
  | "tiny";

declare const markedBrand: unique symbol;
/**
 * An outline that can be drawn and sent: 3 to 256 corners within ±85°, no repeated corner, no crossing, touching or
 * doubled-back side, and a ring and lookup the contract's parser accepts. The lookup is strictly inside, never on a side,
 * because the contract's boundary test is exact float equality and a rounded point on a side often fails it.
 */
export interface Marked {
  readonly [markedBrand]: true;
  readonly corners: Corners;
  readonly ring: Field["ring"];
  readonly lookup: Field["lookup"];
  /** Geodesic, from @turf/area on the drawing-space ring. Only ever shown rounded. */
  readonly areaM2: number;
  /** How far apart the furthest two corners are. */
  readonly spanM: number;
}

export type MarkResult =
  | { readonly ok: true; readonly marked: Marked }
  /** `corner`: the 0-based corner the problem belongs to, for pole and repeated. */
  | { readonly ok: false; readonly problem: ShapeProblem; readonly corner: number | null };

/** Why a saved field cannot be held: its shape, or a label the contract refuses (empty or too long). */
export type SavedProblem = ShapeProblem | "label";

export type SavedResult =
  | { readonly ok: true; readonly marked: Marked }
  | { readonly ok: false; readonly problem: SavedProblem };

export type LookupRule =
  | { readonly kind: "choose" }
  /** A box on a place, or an edit of one corner: keep this point while it stays strictly inside, else choose. */
  | { readonly kind: "keep"; readonly at: LngLat };

const metresPerDegree = { lat: 110_540, lng: 111_320 } as const;
export const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Into [-180, 180]. A longitude already in range is returned as it is, so a typed 180 stays 180. */
export function wrapLng(lng: number): number {
  return lng > 180 || lng < -180 ? ((lng + 540) % 360 + 360) % 360 - 180 : lng;
}

/** Also removes MapLibre's 180.00000000000182 at the dateline. */
export function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** `lng` moved by whole turns to within 180° of `near`, so a line from `near` to it never goes round the world. */
export const unwrapNear = (lng: number, near: number): number => lng + 360 * Math.round((near - lng) / 360);

/** The short way round, on a local flat grid: within a few percent up to 30 km. */
export function metresBetween(a: LngLat, b: LngLat): number {
  const east = wrapLng(b[0] - a[0]) * metresPerDegree.lng * Math.cos(radians((a[1] + b[1]) / 2));
  return Math.hypot(east, (b[1] - a[1]) * metresPerDegree.lat);
}

/** Any open list of points into drawing space. Judges nothing. */
export function cornersFrom(points: readonly LngLat[]): Corners {
  const corners: Corner[] = [];
  for (const [lng, lat] of points) {
    const previous = corners.at(-1)?.[0] ?? wrapLng(lng);
    corners.push([round6(unwrapNear(lng, previous)), round6(lat)]);
  }
  return corners as readonly Corner[] as Corners;
}

export function cornersOfRing(ring: Field["ring"]): Corners {
  return cornersFrom(ring.slice(0, -1));
}

/** A square of `hectares` around `at`, counter-clockwise from the south-west corner. Near a pole it marks as "pole". */
export function boxAround(at: LngLat, hectares: BoxSize): Corners {
  const half = Math.sqrt(hectares * 10_000) / 2;
  const north = half / metresPerDegree.lat;
  const east = half / (metresPerDegree.lng * Math.max(0.01, Math.cos(radians(at[1]))));
  const [lng, lat] = at;
  return cornersFrom([[lng - east, lat - north], [lng + east, lat - north], [lng + east, lat + north], [lng - east, lat + north]]);
}

/** Judge corners the farmer made (a box, a drag, a typed list). Size is not judged here: see `withinPolicy`. */
export function markOutline(corners: Corners, rule: LookupRule): MarkResult {
  const wire = corners.map(([lng, lat]): LngLat => [round6(wrapLng(lng)), lat]);
  const ring: Field["ring"] = [...wire, ...wire.slice(0, 1)];
  const problem = judge(corners, ring);
  if (problem) return problem;
  const polygon = polygonOf(corners);
  const kept = rule.kind === "keep" ? [rule.at] : [];
  for (const [lng, lat] of [...kept, ...insideCandidates(corners)]) {
    const lookup: LngLat = [round6(wrapLng(lng)), round6(lat)];
    const drawn = [unwrapNear(lookup[0], corners[0][0]), lookup[1]];
    if (!booleanPointInPolygon(drawn, polygon, { ignoreBoundary: true })) continue;
    if (fieldIssues({ ring, lookup, label: "Field" }).length === 0) return markedOf(corners, ring, lookup);
  }
  return refused("no_inside");
}

/**
 * Judge a saved field (the `value` prop). Its ring, lookup and label are kept exactly as given, so the picker holds the
 * same field as its parent and adopting it never needs an emit. `withinPolicy` is never applied to it.
 */
export function markSaved(field: Field): SavedResult {
  const corners = cornersOfRing(field.ring);
  const problem = judge(corners, field.ring);
  if (problem) return problem;
  const issues = fieldIssues(field);
  if (issues.some(part => part !== "label")) return refused("no_inside");
  if (issues.length > 0) return { ok: false, problem: "label" };
  return markedOf(corners, field.ring, field.lookup);
}

export function withinPolicy(marked: Marked): ShapeProblem | null {
  if (marked.spanM > limits.maxSpanM) return "too_far";
  if (marked.areaM2 < limits.minAreaM2) return "tiny";
  return null;
}

/** Same ring, lookup and label, number by number. Makes "adopt the field I just emitted" a no-op. */
export function sameField(a: Field | null, b: Field | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.label !== b.label || a.ring.length !== b.ring.length) return false;
  const same = (p: LngLat, q: LngLat) => p[0] === q[0] && p[1] === q[1];
  return same(a.lookup, b.lookup) && a.ring.every((point, index) => same(point, b.ring[index]));
}

/** `to` may arrive wrapped or not: a marker dropped across 180° reports -179.995 beside 179.99. */
export function moveCorner(corners: Corners, index: number, to: LngLat): Corners {
  const lat = Math.min(limits.maxLatitude, Math.max(-limits.maxLatitude, to[1]));
  return cornersFrom(corners.map((corner, i) => (i === index ? [unwrapNear(to[0], corner[0]), lat] : corner)));
}

/**
 * Add a corner in the middle of the side after `after`, or of the longest side. It sits on the old side, so the shape
 * does not change until the farmer drags it, and the server accepts a straight extra corner.
 */
export function insertCorner(corners: Corners, after: number | null): { readonly corners: Corners; readonly index: number } {
  const side = after ?? longestSide(corners);
  const [a, b] = [corners[side], corners[(side + 1) % corners.length]];
  const middle: Corner = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return { corners: cornersFrom([...corners.slice(0, side + 1), middle, ...corners.slice(side + 1)]), index: side + 1 };
}

export function removeCorner(corners: Corners, index: number): Corners {
  return cornersFrom(corners.filter((_, i) => i !== index));
}

export function stepSize(size: BoxSize, step: -1 | 1): BoxSize | null {
  return boxSizes[boxSizes.indexOf(size) + step] ?? null;
}

/** The flat plan's drawing: north up, equal scale both ways, fitted inside width × height with room for the corner marks. */
export interface FlatDrawing {
  /** SVG path "M x y L … Z". */
  readonly path: string;
  readonly corners: readonly { readonly x: number; readonly y: number }[];
  readonly lookup: { readonly x: number; readonly y: number };
  /** A round scale bar: barM metres drawn barPx pixels long. */
  readonly barM: number;
  readonly barPx: number;
}

const planMarginPx = 40;

export function planOf(marked: Marked, width: number, height: number): FlatDrawing {
  const xs = marked.corners.map(([x]) => x);
  const ys = marked.corners.map(([, y]) => y);
  const [west, east, south, north] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const middle = [(west + east) / 2, (south + north) / 2] as const;
  const eastPerDegree = metresPerDegree.lng * Math.cos(radians(middle[1]));
  const margin = Math.min(planMarginPx, width / 4, height / 4);
  const scale = Math.min((width - 2 * margin) / ((east - west) * eastPerDegree), (height - 2 * margin) / ((north - south) * metresPerDegree.lat));
  const project = ([lng, lat]: LngLat) => ({
    x: width / 2 + (lng - middle[0]) * eastPerDegree * scale,
    y: height / 2 - (lat - middle[1]) * metresPerDegree.lat * scale,
  });
  const corners = marked.corners.map(project);
  const barM = roundMetresAtMost((0.4 * width) / scale);
  return {
    path: `${corners.map(({ x, y }, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")} Z`,
    corners,
    lookup: project([unwrapNear(marked.lookup[0], middle[0]), marked.lookup[1]]),
    barM,
    barPx: barM * scale,
  };
}

/** 1, 2 or 5 times a power of ten, at most `most`. */
function roundMetresAtMost(most: number): number {
  let decade = 10 ** Math.floor(Math.log10(most));
  if (decade > most) decade /= 10;
  const step = most >= 5 * decade ? 5 : most >= 2 * decade ? 2 : 1;
  return step * decade;
}

/**
 * The contract's own field rules without copying its schema: parse a whole FarmInput around the field. Returns the part
 * of the field each issue is about: "ring", "lookup" or "label".
 */
function fieldIssues(field: Field): readonly string[] {
  const parsed = farmInputSchema.safeParse({
    schemaVersion: 1,
    field,
    cropPurposeIds: ["placeholder"],
    water: "rain_only",
    planningStart: "2026-01-01",
    history: { kind: "skipped" },
  });
  return parsed.success ? [] : parsed.error.issues.filter(issue => issue.path[0] === "field").map(issue => String(issue.path[1]));
}

type Refused = Extract<MarkResult, { ok: false }>;

const refused = (problem: ShapeProblem, corner: number | null = null): Refused => ({ ok: false, problem, corner });

/**
 * Repeated corners are caught before the server's rule, which meets them as touching sides and would call them
 * crossing. `ring` is the wire ring, so the server's rule does the same float arithmetic as on the server.
 */
function judge(corners: Corners, ring: Field["ring"]): Refused | null {
  if (corners.length < limits.minCorners) return refused("too_few");
  if (corners.length > limits.corners) return refused("too_many");
  const pole = corners.findIndex(([, lat]) => Math.abs(lat) > limits.maxLatitude);
  if (pole >= 0) return refused("pole", pole);
  const repeated = ring.findIndex(([lng, lat], index) => index > 0 && ring[index - 1][0] === lng && ring[index - 1][1] === lat);
  if (repeated > 0) return refused("repeated", repeated % corners.length);
  const server = serverRefuses(ring);
  return server && refused(server);
}

/**
 * The server's simple-shape rule (unsupportedGeometry in src/server/jobs/http.ts), ported line for line. A browser
 * module may not import src/server, so tests/frontend/location/server-parity.test.ts holds the two equal.
 */
function serverRefuses(ring: Field["ring"]): "too_far" | "pole" | "repeated" | "crossing" | null {
  const points: [number, number][] = [];
  for (const [lng, lat] of ring) {
    const previous = points.at(-1)?.[0] ?? lng;
    const x = lng + 360 * Math.round((previous - lng) / 360);
    if (Math.abs(x - previous) >= 180) return "too_far";
    if (Math.abs(lat) === 90) return "pole";
    points.push([x, lat]);
  }
  if (points.at(-1)?.[0] !== points[0][0]) return "too_far";
  const count = points.length - 1;
  const cross = (a: LngLat, b: LngLat, c: LngLat) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const onSegment = (a: LngLat, b: LngLat, p: LngLat) => cross(a, b, p) === 0 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
  for (let i = 0; i < count; i++) {
    const a = points[i], b = points[i + 1], c = points[(i + 2) % count];
    if (a[0] === b[0] && a[1] === b[1]) return "repeated";
    if (cross(a, b, c) === 0 && ((a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1])) > 0) return "crossing";
    for (let j = i + 1; j < count; j++) {
      if (j === i + 1 || (i === 0 && j === count - 1)) continue;
      const e = points[j], d = points[j + 1];
      if (onSegment(a, b, e) || onSegment(a, b, d) || onSegment(e, d, a) || onSegment(e, d, b)
        || (cross(a, b, e) * cross(a, b, d) < 0 && cross(e, d, a) * cross(e, d, b) < 0)) return "crossing";
    }
  }
  return null;
}

function markedOf(corners: Corners, ring: Field["ring"], lookup: LngLat): MarkResult {
  let spanM = 0;
  for (let i = 0; i < corners.length; i++) {
    for (let j = i + 1; j < corners.length; j++) spanM = Math.max(spanM, metresBetween(corners[i], corners[j]));
  }
  return { ok: true, marked: { corners, ring, lookup, areaM2: area(polygonOf(corners)), spanM } as Marked };
}

function polygonOf(corners: Corners) {
  return { type: "Polygon" as const, coordinates: [[...corners, corners[0]].map(([lng, lat]) => [lng, lat])] };
}

/**
 * Candidate lookups in drawing space, best first. @turf/point-on-feature is not used: it returns a corner for concave
 * fields and the far side of the planet for a wrapped ring.
 *  1. The area centroid: a box and any convex field get their middle.
 *  2. On each latitude halfway between two neighbouring distinct corner latitudes, the middles of the inside spans,
 *     widest first. Such a line passes through no corner, so L, U and C fields get a point in an arm.
 * The caller keeps the first that is strictly inside after rounding.
 */
function insideCandidates(corners: Corners): readonly Corner[] {
  const [originLng, originLat] = corners[0];
  let twiceArea = 0, sumLng = 0, sumLat = 0;
  corners.forEach(([pLng, pLat], i) => {
    const [qLng, qLat] = corners[(i + 1) % corners.length];
    const [px, py, qx, qy] = [pLng - originLng, pLat - originLat, qLng - originLng, qLat - originLat];
    const f = px * qy - qx * py;
    twiceArea += f;
    sumLng += (px + qx) * f;
    sumLat += (py + qy) * f;
  });
  const centroid: Corner[] = twiceArea === 0 ? [] : [[originLng + sumLng / (3 * twiceArea), originLat + sumLat / (3 * twiceArea)]];

  const latitudes = [...new Set(corners.map(([, lat]) => lat))].sort((m, n) => m - n);
  const spans: { readonly middle: Corner; readonly width: number }[] = [];
  for (let k = 0; k + 1 < latitudes.length; k++) {
    const lat = (latitudes[k] + latitudes[k + 1]) / 2;
    const crossings: number[] = [];
    corners.forEach(([pLng, pLat], i) => {
      const [qLng, qLat] = corners[(i + 1) % corners.length];
      if ((pLat > lat) !== (qLat > lat)) crossings.push(pLng + ((qLng - pLng) * (lat - pLat)) / (qLat - pLat));
    });
    crossings.sort((m, n) => m - n);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      spans.push({ middle: [(crossings[i] + crossings[i + 1]) / 2, lat], width: crossings[i + 1] - crossings[i] });
    }
  }
  spans.sort((m, n) => n.width - m.width);
  return [...centroid, ...spans.map(span => span.middle)];
}

function longestSide(corners: Corners): number {
  let longest = 0;
  let longestM = -1;
  corners.forEach((corner, i) => {
    const length = metresBetween(corner, corners[(i + 1) % corners.length]);
    if (length > longestM) [longest, longestM] = [i, length];
  });
  return longest;
}
