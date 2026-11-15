// The field outline. Pure: no React, no MapLibre, no network. Everything F2 knows about "what is a field" is here.
//
// Two spaces, one crossing point:
//   drawing space  `Corners`: an OPEN list of [lng, lat] whose longitudes run on from corner to corner, so a field
//                  across 180° reads 179.99, 180.01 (never 179.99, -179.99). MapLibre, Turf and the flat plan read only
//                  this. A wrapped ring draws as a line round the world and gives Turf 42,611 km² instead of 2.37
//                  (grounding G5 and section 2.6).
//   wire space     `Marked.ring` and `Marked.lookup`: the contract's own shapes (src/contracts/input.ts:43-49), a CLOSED
//                  ring with every longitude in [-180, 180] and a lookup strictly inside.
// `Marked` holds both for one outline, and only `markOutline` and `markSaved` make one. Both end with the contract's own
// parser, so a `Marked` can always be drawn and sent. Nothing else in the folder wraps, unwraps, closes or validates a
// ring, and nothing in the folder copies the contract's schema.
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
 * The corners being drawn. The functions in this file keep these rules, and the brand stops a list built by hand:
 *  - open: no closing copy of the first corner;
 *  - corner 0's longitude is in [-180, 180], and every next one is within 180° of the corner before it;
 *  - every number is rounded to 6 decimals (about 0.1 m).
 * The count is not part of the brand: `markOutline` judges it.
 */
export type Corners = readonly Corner[] & { readonly [cornersBrand]: true };

/** Every number F2 chooses about a shape. The corner cap is the contract's (inputLimits.polygonVertices). */
export const limits = {
  corners: inputLimits.polygonVertices,
  minCorners: 3,
  /** Under this the corners "don’t make a field" (prototype cornersField). Policy: never applied to a saved value. */
  minAreaM2: 25,
  /** The furthest two corners may be apart (prototype: 20 km). The contract has no limit. Policy, open decision 5. */
  maxSpanM: 20_000,
  /** MapLibre's Mercator stops at 85.05°, and the server refuses a corner at a pole (src/server/jobs/http.ts:38). */
  maxLatitude: 85,
  decimals: 6,
  /** "Field near <place>" only when the lookup is this close to the place (prototype fieldLabel). */
  nearPlaceM: 30_000,
} as const;

/** The prototype's box sizes in hectares (app.js SIZES). The starting box is 1 ha. Smaller and Bigger step through them. */
export const boxSizes = [0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 20, 50] as const;
export type BoxSize = (typeof boxSizes)[number];

/**
 * Why some corners are not a field. One list for typed corners, a dragged corner and a saved value.
 * `markOutline` and `markSaved` return the first six: "this cannot be drawn or sent". `withinPolicy` returns the last
 * two: F2's own taste for a farmer's edit. A saved value is never refused for those two.
 */
export type ShapeProblem =
  | "too_few"     // fewer than 3 corners
  | "too_many"    // more than limits.corners
  | "pole"        // a corner beyond ±limits.maxLatitude
  | "repeated"    // two corners in a row on the same spot
  | "crossing"    // two sides cross or touch, or a side doubles back (the server's "unsupported geometry")
  | "no_inside"   // no point strictly inside that the contract also accepts
  | "too_far"     // a side half the world long (not sendable), or, as policy, corners more than limits.maxSpanM apart
  | "tiny";       // policy: under limits.minAreaM2

declare const markedBrand: unique symbol;
/**
 * A field outline that can be drawn and sent. Holding one proves: 3 to 256 corners, every corner within ±85°, no
 * repeated corner, no crossing, touching or doubled-back side, and a ring and lookup that the contract's own parser
 * accepts, with the lookup strictly inside (never on a side: the contract's boundary test is exact float equality).
 */
export interface Marked {
  readonly [markedBrand]: true;
  /** Drawing space. What the globe, the flat plan and Turf read. */
  readonly corners: Corners;
  /** Wire space: the corners wrapped into [-180, 180] and closed with the identical first point. */
  readonly ring: Field["ring"];
  /** Wire space, strictly inside. */
  readonly lookup: Field["lookup"];
  /** Geodesic area from @turf/area on the drawing-space ring. Only ever shown rounded ("About 1 hectare"). */
  readonly areaM2: number;
  /** How far apart the furthest two corners are, in metres. Drives the zoom fit and "100 m across". */
  readonly spanM: number;
}

export type MarkResult =
  | { readonly ok: true; readonly marked: Marked }
  /** `corner`: the corner to point at (0-based) when the problem belongs to one. */
  | { readonly ok: false; readonly problem: ShapeProblem; readonly corner: number | null };

/** Where the lookup comes from when the farmer makes or changes an outline. */
export type LookupRule =
  /** Typed corners: the area centroid when strictly inside, else the middle of the widest inside span. */
  | { readonly kind: "choose" }
  /** A box on a place, or an edit of one corner: keep this point while it stays strictly inside, else choose. */
  | { readonly kind: "keep"; readonly at: LngLat };

// ---------------------------------------------------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------------------------------------------------

/** Into [-180, 180]. A longitude already in range is returned as it is, so a typed 180 stays 180. */
export function wrapLng(lng: number): number {
  return lng > 180 || lng < -180 ? ((lng + 540) % 360 + 360) % 360 - 180 : lng;
}

/** Round to limits.decimals. Also removes MapLibre's 180.00000000000182 (grounding G6). */
export function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Metres between two points the short way round (longitude difference wrapped), on a local flat grid. A few percent under 30 km. */
export function metresBetween(a: LngLat, b: LngLat): number {
  throw new Error("not implemented");
  // TODO: dLng = wrapLng(b[0] - a[0]); x = dLng * 111_320 * cos(midLat); y = (b[1] - a[1]) * 110_540; hypot(x, y)
}

// ---------------------------------------------------------------------------------------------------------------------
// Into drawing space
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Any open list of points (typed corners, points off the map) into drawing space: corner 0's longitude wrapped, each
 * next one moved by a multiple of 360 to within 180° of the one before, every number rounded. Judges nothing.
 */
export function cornersFrom(points: readonly LngLat[]): Corners {
  throw new Error("not implemented");
  // TODO: let previous = wrapLng(points[0][0]);
  //       map [lng, lat] -> x = lng + 360 * Math.round((previous - lng) / 360); previous = x; [round6(x), round6(lat)]
}

/** A wire ring into drawing space: drop the closing point, then unwrap as `cornersFrom` does. */
export function cornersOfRing(ring: Field["ring"]): Corners {
  throw new Error("not implemented");
}

/**
 * The prototype's starting box (contract.js boxRing): a square of `hectares` around `at`, counter-clockwise from the
 * south-west corner. Metres to degrees with 110,540 m per degree of latitude and 111,320 × cos(lat) per degree of
 * longitude (cos floored at 0.01). Near a pole the box fails `markOutline` with "pole" instead of degenerating.
 */
export function boxAround(at: LngLat, hectares: BoxSize): Corners {
  throw new Error("not implemented");
}

// ---------------------------------------------------------------------------------------------------------------------
// The two makers of a Marked
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Judge corners the farmer made (a box, a drag, a typed list) and, when they make a field, build every value once.
 * Order, first failure wins:
 *  1. count: < 3 too_few, > limits.corners too_many
 *  2. a corner beyond ±limits.maxLatitude -> pole (that corner)
 *  3. ring = each corner [round6(wrapLng(lng)), lat], then the identical first tuple again, so closure is exact
 *  4. two points in a row of `ring` equal -> repeated (that corner). Before step 5, because the server's loop meets a
 *     repeated corner as a touching side and would call it crossing (candidate 2's probe).
 *  5. serverRefuses(ring): the server's rule (src/server/jobs/http.ts:33-57) ported line for line and run on the wire
 *     ring, so both sides do the same float arithmetic. too_far for a half-world side or a ring that does not return;
 *     crossing for a doubled-back side or two non-neighbour sides that cross or touch.
 *     tests/frontend/location/server-parity.test.ts asks the real handler on the same corpus.
 *  6. areaM2 = area() of the closed drawing-space corners; spanM = the largest corner-to-corner metresBetween
 *  7. lookup: for each candidate in order (rule.at when "keep", then insideCandidates(corners)): wrap and round it, and
 *     take the first that is strictly inside in drawing space AND that the contract accepts in `fieldIssues` with this
 *     ring. None -> no_inside. The contract has the last word on every emitted lookup.
 * Size is not judged here: see `withinPolicy`.
 */
export function markOutline(corners: Corners, rule: LookupRule): MarkResult {
  throw new Error("not implemented");
  // TODO: uses area() and booleanPointInPolygon(..., { ignoreBoundary: true }) on drawing-space coordinates only.
}

/**
 * Judge a saved field (the `value` prop). Its ring, lookup and label are kept exactly as given, so the picker holds the
 * same field as its parent and adopting it never needs an emit (G12). Corners are derived for drawing only.
 * Steps 1, 2, 4 and 5 of `markOutline` on the given ring, then `fieldIssues(field)` with the real label must be empty
 * (else no_inside). `withinPolicy` is never applied: a field the contract and the server accept is always drawn.
 */
export function markSaved(field: Field): MarkResult {
  throw new Error("not implemented");
}

/**
 * F2's own limits for an outline the farmer is making: spanM > limits.maxSpanM -> too_far, areaM2 < limits.minAreaM2
 * -> tiny, else null. The picker applies it to every farmer edit and never to a saved value.
 */
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

// ---------------------------------------------------------------------------------------------------------------------
// Edits. Each returns new Corners and judges nothing: the picker passes the result to markOutline.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Move one corner. `to` may arrive wrapped or not (a marker dropped across 180° reports -179.995 beside 179.99): it is
 * placed within 180° of that corner's old longitude. Latitude is clamped to ±limits.maxLatitude.
 */
export function moveCorner(corners: Corners, index: number, to: LngLat): Corners {
  throw new Error("not implemented");
}

/**
 * Add a corner in the middle of a side: the side after `after`, or the longest side when `after` is null. Returns the
 * new corner's index so the picker can choose it. The new corner sits on the old side, so the shape does not change
 * until the farmer drags it; the server accepts a straight extra corner (grounding 2.5).
 */
export function insertCorner(corners: Corners, after: number | null): { readonly corners: Corners; readonly index: number } {
  throw new Error("not implemented");
}

/** Remove one corner. Fewer than 3 left is judged by markOutline (too_few). */
export function removeCorner(corners: Corners, index: number): Corners {
  throw new Error("not implemented");
}

/** The next smaller (-1) or bigger (+1) box size, or null at an end of boxSizes. */
export function stepSize(size: BoxSize, step: -1 | 1): BoxSize | null {
  return boxSizes[boxSizes.indexOf(size) + step] ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------
// The flat plan (the 2D fallback when WebGL2 is missing)
// ---------------------------------------------------------------------------------------------------------------------

/** The plan's drawing: north up, equal scale both ways, fitted inside width × height with a margin for the corner marks. */
export interface Plan {
  /** SVG path "M x y L … Z" of the outline. */
  readonly path: string;
  readonly corners: readonly { readonly x: number; readonly y: number }[];
  readonly lookup: { readonly x: number; readonly y: number };
  /** A round scale bar: barM metres drawn barPx pixels long (10, 20, 50, 100 … m). */
  readonly barM: number;
  readonly barPx: number;
}

/** Project an outline for the flat plan, in metres east and north of its middle. Pure, so jsdom and node can check it. */
export function planOf(marked: Marked, width: number, height: number): Plan {
  throw new Error("not implemented");
}

// ---------------------------------------------------------------------------------------------------------------------
// Private
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The contract's own field rules with no copied schema (grounding 2.4): parse a whole FarmInput with placeholder
 * answers and keep the issues under "field". Empty means the shared parser accepts this field.
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
  return parsed.success ? [] : parsed.error.issues.filter(issue => issue.path[0] === "field").map(issue => issue.message);
}

/** The server's unsupportedGeometry (src/server/jobs/http.ts:33-57), ported line for line, on the wire ring. */
function serverRefuses(ring: Field["ring"]): "too_far" | "crossing" | null {
  throw new Error("not implemented");
  // TODO: the reference port in design/probe/outline-probe.test.ts `serverRefuses` passed against createPlanApi.
}

/**
 * Points strictly inside, best first, in drawing space (candidate 1's rule; @turf/point-on-feature returns a corner
 * for concave fields and the far side of the planet for a wrapped dateline ring, so it is not used):
 *  1. the area centroid (shoelace), when strictly inside: a box and any convex field get their middle;
 *  2. for each latitude halfway between two neighbouring distinct corner latitudes, the inside spans of that line
 *     (crossings with every side, sorted, paired); the middles of all spans, widest first. A line between corner
 *     latitudes never passes through a corner, so each middle is strictly inside. L, U and C fields included.
 */
function insideCandidates(corners: Corners): readonly Corner[] {
  throw new Error("not implemented");
}
