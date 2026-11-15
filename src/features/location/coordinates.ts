// How a farmer writes a coordinate, and how F2 writes one back. Pure. The words for each error live in words.ts.
import { cornersFrom, round6, wrapLng } from "./outline";
import type { Corners, LngLat } from "./outline";

export type Axis = "latitude" | "longitude";

/** Why one typed number was refused. words.ts says each, per axis. */
export type CoordError =
  | "empty"
  | "not_number"
  | "wrong_letter"
  | "sign_and_letter"
  | "out_of_range";

export type CoordResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly error: CoordError };

const dashes = /[−–‒]/g;
const coordPattern = /^([+-]?)\s*(\d{1,3}(?:[.,]\d+)?)\s*°?\s*([NSEWnsew])?$/;
const letters: Record<Axis, string> = { latitude: "NS", longitude: "EW" };
const ranges: Record<Axis, number> = { latitude: 90, longitude: 180 };

/**
 * One typed number. Accepts "-6.326", "6,326" (comma decimal), "6.326 S", "6.326°S", a Unicode minus or dash, and
 * spaces. A latitude beyond ±85 parses here and is refused later as a shape problem ("pole"), with its own words.
 */
export function parseCoord(raw: string, axis: Axis): CoordResult {
  const text = raw.trim().replace(dashes, "-").replace(/\s+/g, " ");
  if (!text) return { ok: false, error: "empty" };
  const match = coordPattern.exec(text);
  if (!match) return { ok: false, error: "not_number" };
  const [, sign, digits, letter = ""] = match;
  const hemisphere = letter.toUpperCase();
  if (hemisphere && !letters[axis].includes(hemisphere)) return { ok: false, error: "wrong_letter" };
  if (hemisphere && sign === "-") return { ok: false, error: "sign_and_letter" };
  const size = Number.parseFloat(digits.replace(",", "."));
  const value = sign === "-" || hemisphere === "S" || hemisphere === "W" ? -size : size;
  if (Math.abs(value) > ranges[axis]) return { ok: false, error: "out_of_range" };
  return { ok: true, value };
}

/** What the one search box was given. A position needs no request, so it works with no key. */
export type Query =
  /** Fewer than 2 characters: nothing is sent. */
  | { readonly kind: "short" }
  /** A place name, sent to the geocoder on Search or Enter only. */
  | { readonly kind: "name"; readonly text: string }
  | { readonly kind: "position"; readonly at: LngLat }
  /** Two numbers, but one of them cannot be a coordinate: shown with the corner list's words, never searched by name. */
  | { readonly kind: "bad_position"; readonly axis: Axis; readonly error: CoordError };

const token = String.raw`[+-]?\s*\d{1,3}(?:[.,]\d+)?\s*°?\s*[NSEWnsew]?`;
/**
 * Separators, tried in order: ";", a comma followed by a space, a space, then a bare comma only when a number uses a
 * decimal point, so "6,326" stays one comma-decimal number. Two bare integers split by a space are a postcode such as
 * "114 55" or "560 001", never a position.
 */
const pairs: readonly { readonly pattern: RegExp; readonly accepts: (left: string, right: string) => boolean }[] = [
  { pattern: new RegExp(`^(${token}) ?; ?(${token})$`), accepts: () => true },
  { pattern: new RegExp(`^(${token}) ?, (${token})$`), accepts: () => true },
  { pattern: new RegExp(`^(${token}) (${token})$`), accepts: (left, right) => !/^\d+$/.test(left) || !/^\d+$/.test(right) },
  { pattern: new RegExp(`^(${token}),(${token})$`), accepts: (left, right) => left.includes(".") || right.includes(".") },
];

/**
 * Tells a name from a position. A position is two numbers, latitude first as phone maps copy them ("-6.326, 108.32",
 * "-6.326 108.32", "-6.326,108.32", "6.326 S 108.32 E"). With letters either order works ("108.32 E, 6.326 S"). Text
 * with any other letter is a name ("Route 66", "São Paulo").
 */
export function classifyQuery(raw: string): Query {
  const text = raw.trim();
  if (Array.from(text).length < 2) return { kind: "short" };
  const pair = pairOf(text.replace(dashes, "-").replace(/\s+/g, " "));
  if (!pair) return { kind: "name", text };
  const axes = axesOf(pair);
  const [first, second] = pair.map((typed, i) => parseCoord(typed, axes[i]));
  if (!first.ok) return { kind: "bad_position", axis: axes[0], error: first.error };
  if (!second.ok) return { kind: "bad_position", axis: axes[1], error: second.error };
  return { kind: "position", at: axes[0] === "longitude" ? [first.value, second.value] : [second.value, first.value] };
}

function pairOf(text: string): readonly [string, string] | null {
  for (const { pattern, accepts } of pairs) {
    const match = pattern.exec(text);
    if (!match) continue;
    const pair = [match[1].trim(), match[2].trim()] as const;
    if (accepts(...pair)) return pair;
  }
  return null;
}

/** N or S marks a latitude and E or W a longitude; with no letter, latitude comes first. */
function axesOf(pair: readonly [string, string]): readonly [Axis, Axis] {
  const axisOf = (typed: string): Axis | null => {
    const letter = typed.at(-1)?.toUpperCase() ?? "";
    return letters.latitude.includes(letter) ? "latitude" : letters.longitude.includes(letter) ? "longitude" : null;
  };
  const [first, second] = pair.map(axisOf);
  if (first === "longitude" || (first === null && second === "latitude")) return ["longitude", "latitude"];
  return ["latitude", "longitude"];
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

/** Every per-number error at once. The shape itself is judged by the picker. */
export function cornersOfRows(rows: readonly CornerRow[]): RowsResult {
  const errors: RowError[] = [];
  const points: LngLat[] = [];
  rows.forEach((row, index) => {
    const latitude = parseCoord(row.latitude, "latitude");
    const longitude = parseCoord(row.longitude, "longitude");
    if (!latitude.ok) errors.push({ row: index, axis: "latitude", error: latitude.error });
    if (!longitude.ok) errors.push({ row: index, axis: "longitude", error: longitude.error });
    if (latitude.ok && longitude.ok) points.push([longitude.value, latitude.value]);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, corners: cornersFrom(points) };
}

/**
 * The rows for an open list of points (a ring without its closing point, or a box's corners): longitudes wrapped into
 * [-180, 180], 6 decimals, plain minus signs. So changing one corner never means retyping the rest.
 */
export function rowsOfPoints(points: readonly LngLat[]): readonly CornerRow[] {
  const text = (value: number) => String(round6(value));
  return points.map(([lng, lat]) => ({ latitude: text(lat), longitude: text(wrapLng(lng)) }));
}

/** "6.327° S, 108.320° E". 3 decimals on the place card, 2 in a field label (about 1 km). */
export function coordsText(at: LngLat, decimals: 2 | 3): string {
  const [lng, lat] = at;
  const part = (value: number, positive: string, negative: string) => {
    const shown = Math.abs(value).toFixed(decimals);
    return `${shown}° ${value < 0 && Number(shown) !== 0 ? negative : positive}`;
  };
  return `${part(lat, "N", "S")}, ${part(lng, "E", "W")}`;
}
