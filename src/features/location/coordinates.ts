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
  | "out_of_range"
  /** Minutes or seconds of 60 or more. */
  | "minutes";

export type CoordResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly error: CoordError };

/** One spelling for each sign, degree, minute and second mark that phones, GPS units and map apps write. */
function normalise(raw: string): string {
  return raw
    .trim()
    .replace(/[−–‒]/g, "-")
    .replace(/[°º˚]/g, "°")
    .replace(/[′’‘´`]/g, "'")
    .replace(/''/g, '"')
    .replace(/[″”“]/g, '"')
    .replace(/\s+/g, " ");
}

const number = String.raw`\d{1,3}(?:[.,]\d+)?`;
const part = String.raw`\d{1,2}(?:[.,]\d+)?`;
const amount = String.raw`[+-]?\s*${number}\s*°?(?:\s*${part}\s*')?(?:\s*${part}\s*")?`;
const coordPattern = new RegExp(String.raw`^([NSEW])?\s*([+-]?)\s*(${number})\s*°?(?:\s*(${part})\s*')?(?:\s*(${part})\s*")?\s*([NSEW])?$`, "i");
const letters: Record<Axis, string> = { latitude: "NS", longitude: "EW" };
const ranges: Record<Axis, number> = { latitude: 90, longitude: 180 };
const decimal = (typed: string) => Number.parseFloat(typed.replace(",", "."));

/**
 * One typed number. Accepts "-6.326", "6,326" (comma decimal), "6.326 S", "S 6.326", "6.326°S", degrees and minutes
 * ("6°19.56'S"), degrees, minutes and seconds ("6°19'33.6\"S"), a Unicode minus or dash, and spaces. A latitude beyond
 * ±85 parses here and is refused later as a shape problem ("pole"), with its own words.
 */
export function parseCoord(raw: string, axis: Axis): CoordResult {
  const text = normalise(raw);
  if (!text) return { ok: false, error: "empty" };
  const match = coordPattern.exec(text);
  if (!match) return { ok: false, error: "not_number" };
  const [, before = "", sign, degrees, minutes, seconds, after = ""] = match;
  if (before && after) return { ok: false, error: "not_number" };
  if ((minutes !== undefined && /[.,]/.test(degrees)) || (seconds !== undefined && (minutes === undefined || /[.,]/.test(minutes)))) {
    return { ok: false, error: "not_number" };
  }
  const hemisphere = (before || after).toUpperCase();
  if (hemisphere && !letters[axis].includes(hemisphere)) return { ok: false, error: "wrong_letter" };
  if (hemisphere && sign === "-") return { ok: false, error: "sign_and_letter" };
  const [m, s] = [minutes === undefined ? 0 : decimal(minutes), seconds === undefined ? 0 : decimal(seconds)];
  if (m >= 60 || s >= 60) return { ok: false, error: "minutes" };
  const size = round6(decimal(degrees) + m / 60 + s / 3600);
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
  | { readonly kind: "bad_position"; readonly axis: Axis; readonly error: CoordError }
  /** Reads like a position but is not two coordinates. Never searched by name, because it may hold the farm's position. */
  | { readonly kind: "unclear_position" };

/** The hemisphere letter after each number ("6.326 S"), or before it ("S 6.326"). Both numbers use the same order. */
const tokens = [String.raw`${amount}\s*[NSEW]?`, String.raw`[NSEW]\s*${amount}`];
/**
 * Separators, tried in order: ";", a comma followed by a space, a space, then a bare comma or a slash only when a
 * number has a decimal point or a mark, so "6,326" stays one comma-decimal number. Two bare integers split by a space
 * are a postcode such as "114 55" or "560 001", never a position.
 */
const separators: readonly { readonly between: string; readonly accepts: (left: string, right: string) => boolean }[] = [
  { between: " ?; ?", accepts: () => true },
  { between: " ?, ", accepts: () => true },
  { between: " ", accepts: (left, right) => !/^\d+$/.test(left) || !/^\d+$/.test(right) },
  { between: ",", accepts: (left, right) => /[.°'"]/.test(left + right) },
  { between: " ?/ ?", accepts: (left, right) => /[.°'"]/.test(left + right) },
];
const pairs = separators.flatMap(({ between, accepts }) =>
  tokens.map(token => ({ pattern: new RegExp(`^(${token})${between}(${token})$`, "i"), accepts })));

/**
 * Tells a name from a position. A position is two numbers, latitude first as phone maps copy them ("-6.326, 108.32",
 * "-6.326 108.32", "(-6.326, 108.32)", "6.326 S 108.32 E", "6°19'33.6\"S 108°19'12.0\"E"). With letters either order
 * works ("108.32 E, 6.326 S"). Text with a word of three or more letters is a name ("Route 66", "São Paulo").
 * Anything else with a decimal point or a degree, minute or second mark is a position typed some other way, and is
 * never sent to the geocoder, which would otherwise receive the farm's coordinates.
 */
export function classifyQuery(raw: string): Query {
  const text = raw.trim();
  if (Array.from(text).length < 2) return { kind: "short" };
  const bare = normalise(text).replace(/^[([{] ?/, "").replace(/ ?[)\]}]$/, "");
  const pair = pairOf(bare);
  if (!pair) return looksLikePosition(bare) ? { kind: "unclear_position" } : { kind: "name", text };
  const axes = axesOf(pair);
  const [first, second] = pair.map((typed, i) => parseCoord(typed, axes[i]));
  if (!first.ok) return { kind: "bad_position", axis: axes[0], error: first.error };
  if (!second.ok) return { kind: "bad_position", axis: axes[1], error: second.error };
  return { kind: "position", at: axes[0] === "longitude" ? [first.value, second.value] : [second.value, first.value] };
}

function looksLikePosition(text: string): boolean {
  return !/\p{L}{3,}/u.test(text) && /\d\.\d|\d ?["'°]/.test(text);
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
    const letter = (/^[a-z]/i.test(typed) ? typed[0] : typed.at(-1) ?? "").toUpperCase();
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
