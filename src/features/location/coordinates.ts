// How a farmer writes a coordinate, and how F2 writes one back. Pure. Ported from the prototype's `parseCoord` and
// `coords` (threefield-web src/app.js, read by function name). The words for each error live in words.ts.
import { cornersFrom } from "./outline";
import type { Corners, LngLat } from "./outline";

export type Axis = "latitude" | "longitude";

/** Why one typed number was refused. words.ts turns (axis, error) into the prototype's sentence. */
export type CoordError =
  | "empty"            // "Type the latitude."
  | "not_number"       // "Type a number, like -6.326."
  | "wrong_letter"     // "Use N or S for latitude."
  | "sign_and_letter"  // "Use a minus sign or a letter, not both."
  | "out_of_range";    // "Latitude goes from -90 to 90."

export type CoordResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly error: CoordError };

/**
 * One typed number. Accepts "-6.326", "6,326" (comma decimal), "6.326 S", "6.326°S", a Unicode minus or dash, and
 * spaces. A letter and a minus sign together are refused. Range: latitude ±90, longitude ±180. A latitude beyond ±85
 * parses here and is refused later as a shape problem ("pole"), with its own words.
 */
export function parseCoord(raw: string, axis: Axis): CoordResult {
  throw new Error("not implemented");
  // TODO: trim; replace [−–‒] with "-"; match /^([+-]?)\s*(\d{1,3}(?:[.,]\d+)?)\s*°?\s*([NSEWnsew])?$/
}

/** What the one search box was given (candidate 1's rule). A position needs no request, so it works with no key. */
export type Query =
  /** Fewer than 2 letters: nothing is sent. */
  | { readonly kind: "short" }
  /** A place name, sent to the geocoder on Search or Enter only. */
  | { readonly kind: "name"; readonly text: string }
  | { readonly kind: "position"; readonly at: LngLat }
  /** Two numbers, but one of them cannot be a coordinate: shown as the corner list's error, never searched by name. */
  | { readonly kind: "bad_position"; readonly axis: Axis; readonly error: CoordError };

/**
 * Tells a name from a position. A position is two numbers, latitude first as phone maps copy them ("-6.326, 108.32",
 * "-6.326 108.32", "6.326 S 108.32 E"). With letters either order works ("108.32 E, 6.326 S"). Text with any other
 * letter is a name ("Route 66", "São Paulo").
 */
export function classifyQuery(raw: string): Query {
  throw new Error("not implemented");
  // TODO: trimmed length < 2 -> short
  //       split on ";" or ", " or whitespace between number-like tokens, so "6,326" stays one comma decimal
  //       not exactly two number-like tokens -> name
  //       letters decide the axes (E/W longitude, N/S latitude); no letters -> latitude first
  //       parseCoord each; the first failure -> bad_position; else position at [lng, lat]
}

/** The text of one row of the corner list. Text, not numbers: a half-typed value must survive a re-render. */
export interface CornerRow {
  readonly latitude: string;
  readonly longitude: string;
}

export interface RowError {
  /** 0-based row. */
  readonly row: number;
  readonly axis: Axis;
  readonly error: CoordError;
}

export type RowsResult =
  | { readonly ok: true; readonly corners: Corners }
  /** In reading order, so the first entry is where focus goes. */
  | { readonly ok: false; readonly errors: readonly RowError[] };

/** Parse every row; all per-number errors at once. The shape itself is judged by the picker (markOutline). */
export function cornersOfRows(rows: readonly CornerRow[]): RowsResult {
  throw new Error("not implemented");
  // TODO: on success return cornersFrom(points) (imported above), points as [lng, lat]
}

/**
 * The rows that show an open list of points (a field's ring without its closing point, or a box's corners): each
 * longitude wrapped into [-180, 180], 6 decimals, plain minus signs. So changing one corner never means retyping the
 * rest (prototype CornersSheet prefill).
 */
export function rowsOfPoints(points: readonly LngLat[]): readonly CornerRow[] {
  throw new Error("not implemented");
}

/** "6.327° S, 108.320° E" (prototype `coords`). 3 decimals on the place card, 2 in a field label (about 1 km). */
export function coordsText(at: LngLat, decimals: 2 | 3): string {
  const [lng, lat] = at;
  const part = (value: number, positive: string, negative: string) => {
    const shown = Math.abs(value).toFixed(decimals);
    return `${shown}° ${value < 0 && Number(shown) !== 0 ? negative : positive}`;
  };
  return `${part(lat, "N", "S")}, ${part(lng, "E", "W")}`;
}
