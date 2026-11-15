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

/**
 * One spelling for each digit, sign, degree, minute and second mark that phones, GPS units and map apps write. The marks
 * go first: NFKC would turn º into the letter o.
 */
function normalise(raw: string): string {
  return raw
    .trim()
    .replace(/[−–‒—‐‑]/g, "-")
    .replace(/[°º˚]/g, "°")
    .replace(/[′’‘´`]/g, "'")
    .replace(/''/g, '"')
    .replace(/[″”“]/g, '"')
    .normalize("NFKC")
    .replace(/\p{Nd}/gu, asciiDigit)
    .replace(/٫/g, ".")
    .replace(/[،、٬]/g, ",")
    .replace(/\s+/g, " ");
}

/** Unicode writes every script's digits as runs of ten from 0 to 9, so a digit's value is its place in its run. */
function asciiDigit(digit: string): string {
  const code = digit.codePointAt(0) ?? 0;
  let place = 0;
  while (/\p{Nd}/u.test(String.fromCodePoint(code - place - 1))) place += 1;
  return String(place % 10);
}

const number = String.raw`\d{1,3}(?:[.,]\d+)?`;
const part = String.raw`\d{1,2}(?:[.,]\d+)?`;
const amount = String.raw`[+-]?${number}\s*°?(?:\s*${part}\s*')?(?:\s*${part}\s*")?`;
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

const labelWord = String.raw`lat(?:itude)?|lng|lon(?:g(?:itude)?)?`;
const label = String.raw`(?:${labelWord})"?\.? ?[:=]? ?`;
const leadingLabel = new RegExp(`^${label}`, "i");
const axisOfLabel = (word: string): Axis => (word.toLowerCase().startsWith("lat") ? "latitude" : "longitude");

/**
 * One number of a pair: a label before it ("lat: -6.326"), then the hemisphere letter after it ("6.326 S") or before
 * it ("S 6.326").
 */
const tokens = [String.raw`(?:${label})?${amount}\s*[NSEW]?`, String.raw`(?:${label})?[NSEW]\s*${amount}`];
/**
 * Separators, tried in order: ";", a comma followed by a space, "&", a dash with a space each side, a space, then a
 * bare comma or a slash only when a number has a decimal point or a mark, so "6,326" stays one comma-decimal number.
 * Two bare integers split by a space or a dash are a postcode such as "114 55" or an address such as "12 - 50", never a
 * position.
 */
const notTwoIntegers = (left: string, right: string) => !/^\d+$/.test(left) || !/^\d+$/.test(right);
const separators: readonly { readonly between: string; readonly accepts: (left: string, right: string) => boolean }[] = [
  { between: " ?; ?", accepts: () => true },
  { between: " ?, ", accepts: () => true },
  { between: " ?& ?", accepts: () => true },
  { between: " - ", accepts: notTwoIntegers },
  { between: " ", accepts: notTwoIntegers },
  { between: ",", accepts: (left, right) => /[.°'"]/.test(left + right) },
  { between: " ?/ ?", accepts: (left, right) => /[.°'"]/.test(left + right) },
];
const pairs = separators.flatMap(({ between, accepts }) =>
  tokens.map(token => ({ pattern: new RegExp(`^(${token})${between}(${token})$`, "i"), accepts })));
/** The same pairs anywhere in the text, with no letter or digit touching either end. A lookahead, so pairs may overlap. */
const pairsInside = separators.flatMap(({ between, accepts }) =>
  tokens.map(token => ({ pattern: new RegExp(String.raw`(?<![\p{L}\p{N}])(?=(${token})${between}(${token})(?![\p{L}\p{N}]))`, "giu"), accepts })));
const heading = new RegExp(String.raw`^(${labelWord})\.? ?[/,&]? ?(${labelWord})\.? ?[:=]? ?`, "i");
const labelledNumber = new RegExp(String.raw`(?<!\p{L})${label}[+-]?\d`, "giu");

/** Labels in other languages or misspelt, and hemispheres written as a word, as the labels and letters above. */
const spellings: readonly (readonly [RegExp, string])[] = Object.entries({
  lat: "lattitude|latitud|latitudine|lati|lintang|breitengrad|breite|широта|vĩ độ|enlem",
  lon: "longtitude|longitud|longitudine|longi|bujur|längengrad|länge|долгота|kinh độ|boylam",
  N: "north|utara|norte|nord|lu",
  S: "south|selatan|sur|sul|sud|süd|ls",
  E: "east|timur|este|leste|est|ost|bt",
  W: "west|barat|oeste|ouest|bb",
}).map(([to, words]) => [new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${words})(?![\p{L}\p{N}])`, "giu"), to]);
const spelled = (text: string) => spellings.reduce((out, [words, to]) => out.replace(words, to), text);

/**
 * Tells a name from a position. A position is two numbers, latitude first as phone maps copy them ("-6.326, 108.32",
 * "-6.326 108.32", "(-6.326, 108.32)", "6.326 S 108.32 E", "6°19'33.6\"S 108°19'12.0\"E"). With letters either order
 * works ("108.32 E, 6.326 S"), and labels name the axes ("lon: 108.32, lat: -6.326", "Lat/Long: -6.326, 108.32").
 * Labels and hemispheres may be words ("lintang -6.326 bujur 108.32", "6.326 South, 108.32 East"). Text that may hold a
 * position among other words is held back, because sending it would send the farm's coordinates: see holdsPosition.
 * Otherwise a word of three or more letters makes a name ("Route 66").
 */
export function classifyQuery(raw: string): Query {
  const text = raw.trim();
  if (Array.from(text).length < 2) return { kind: "short" };
  const typed = spelled(normalise(text)).replace(/^[([{] ?/, "").replace(/ ?[)\]}]$/, "");
  const { axes, rest } = underHeading(typed);
  const pair = pairOf(rest);
  if (pair) return readPair(pair, axes);
  return holdsPosition(typed) ? { kind: "unclear_position" } : { kind: "name", text };
}

/** "Lat/Long: -6.326, 108.32": a heading names both axes before the numbers. */
function underHeading(text: string): { readonly axes: readonly [Axis, Axis] | null; readonly rest: string } {
  const named = heading.exec(text);
  if (!named || axisOfLabel(named[1]) === axisOfLabel(named[2])) return { axes: null, rest: text };
  return { axes: [axisOfLabel(named[1]), axisOfLabel(named[2])], rest: text.slice(named[0].length) };
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

function readPair(pair: readonly [string, string], order: readonly [Axis, Axis] | null): Query {
  const axes = order ?? axesOf(pair);
  if (axes === null) return { kind: "unclear_position" };
  const [first, second] = pair.map((typed, i) => parseCoord(typed.replace(leadingLabel, ""), axes[i]));
  if (!first.ok) return { kind: "bad_position", axis: axes[0], error: first.error };
  if (!second.ok) return { kind: "bad_position", axis: axes[1], error: second.error };
  return { kind: "position", at: axes[0] === "longitude" ? [first.value, second.value] : [second.value, first.value] };
}

/**
 * A label names the axis of its own number; else N or S marks a latitude and E or W a longitude; with neither, latitude
 * comes first. Two labels for one axis cannot be read.
 */
function axesOf(pair: readonly [string, string]): readonly [Axis, Axis] | null {
  const labels = pair.map(typed => (leadingLabel.test(typed) ? axisOfLabel(typed) : null));
  if (labels[0] !== null && labels[0] === labels[1]) return null;
  const [first, second] = pair.map((typed, i): Axis | null => {
    const letter = (/^[a-z]/i.test(typed) ? typed[0] : typed.at(-1) ?? "").toUpperCase();
    return labels[i] ?? (letters.latitude.includes(letter) ? "latitude" : letters.longitude.includes(letter) ? "longitude" : null);
  });
  if (first === "longitude" || (first === null && second === "latitude")) return ["longitude", "latitude"];
  return ["latitude", "longitude"];
}

/** Forms that hold a position, or lead to one, wherever they stand in the text. */
const positionForms: readonly RegExp[] = [
  // A link, with or without https://.
  /:\/\/|^(?:geo:|www\.)/i,
  /(?:^|\s)(?:[\p{L}\p{N}-]+\.)+\p{L}{2,}\/\S*/u,
  // A what3words address, which also catches a bare host such as maps.google.com.
  /(?:^|\s)(?:\/\/\/)?\p{L}{2,}\.\p{L}{2,}\.\p{L}{2,}(?=\s|$)/u,
  // A plus code, which Google Maps shows for a dropped pin.
  /(?<![\p{L}\p{N}])[2-9CFGHJMPQRVWX]{4,8}\+[2-9CFGHJMPQRVWX]{2,3}(?![\p{L}\p{N}])/iu,
  // A grid reference: an easting and a northing of 5 to 7 digits.
  /(?<!\d)\d{5,7}(?: ?m?[EN])? ?[ ,;/] ?(?:[EN] )?\d{5,7}(?!\d)/i,
  // Degrees and minutes, with marks or words: 6°19', 6d19m, 6 deg 19.56.
  /\d ?[°d] ?\d{1,2}(?:[.,]\d+)? ?(?:'|m|min|minutes?)(?!\p{L})|\d ?deg(?:rees?)? ?\d/iu,
  // Degrees and minutes with spaces and a hemisphere letter: 6 19 33 S, S 06 19.56.
  /(?<![\p{L}\p{N}])(?:[NSEW] ?\d{1,3} \d{1,2}(?:[.,]\d+| \d{1,2})|\d{1,3} \d{1,2}(?:[.,]\d+| \d{1,2}(?:[.,]\d+)?) ?[NSEW])(?![\p{L}\p{N}])/iu,
  // A number with its own sign and a decimal point. No place name has one.
  /(?<![\p{L}\p{N}.,])[+-]\d+[.,]\d/u,
  // A label beside a number with a decimal point: "lon 108.3", "6.3 lat".
  new RegExp(String.raw`(?<!\p{L})${label}\d+[.,]\d|\d[.,]\d+°? ?(?:${labelWord})(?!\p{L})`, "iu"),
];

/**
 * Text that is not two coordinates alone but may hold a position. It errs toward holding: a pair of numbers that reads
 * in range is held unless it reads as an address, such as a house number and a floor ("Rúa 1º de Maio 12, 3º") or
 * kilometre marks ("Ruta 3 Km 4.5 a 5.5").
 */
function holdsPosition(text: string): boolean {
  const labelled = (text.match(labelledNumber) ?? []).length >= 2;
  const noWords = !/\p{L}[\p{L}\p{M}]{2,}/u.test(text) && /\d\.\d|\d ?["']/.test(text);
  return positionForms.some(form => form.test(text)) || labelled || noWords || preciseNeighbours(text) || pairAmongWords(text);
}

/**
 * Two numbers next to each other that read in range, both with a decimal point and one with 2 places or more: about a
 * kilometre. Distances and kilometre marks are written to 1 place.
 */
function preciseNeighbours(text: string): boolean {
  const numbers = [...text.matchAll(/(?<![\d.,])\d+(?:[.,](\d+))?/g)];
  return numbers.some((match, index) => {
    const next = numbers.at(index + 1);
    if (next === undefined || match[1] === undefined || next[1] === undefined) return false;
    const [a, b] = [decimal(match[0]), decimal(next[0])];
    const inRange = Math.min(a, b) <= ranges.latitude && Math.max(a, b) <= ranges.longitude;
    return inRange && Math.max(match[1].length, next[1].length) >= 2;
  });
}

/**
 * "my farm 6.3, 108.3", "45N 9E farm". Each number carries a decimal, a mark, a letter or a label, and the pair reads in
 * range, so a house number and a floor ("Calle Mayor 12, 3º E") or a grid address out of range ("100 N 200 E Provo")
 * stays a name.
 */
function pairAmongWords(text: string): boolean {
  return pairsInside.some(({ pattern, accepts }) => [...text.matchAll(pattern)].some(match => {
    const pair = [match[1].trim(), match[2].trim()] as const;
    const marked = pair.every(typed => /\d[.,]\d|['"°]|\p{L}/u.test(typed));
    return accepts(...pair) && marked && readPair(pair, null).kind === "position";
  }));
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

/**
 * Every per-number error at once. The shape itself is judged by the picker. A farmer who walks the boundary may type
 * the starting corner again at the end, so a last row on the first corner closes the ring instead of repeating it.
 */
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
  if (errors.length > 0) return { ok: false, errors };
  const corners = cornersFrom(points);
  const [start, end] = [corners[0], corners.at(-1)];
  const closed = corners.length >= 4 && end !== undefined && start[0] === end[0] && start[1] === end[1];
  return { ok: true, corners: closed ? cornersFrom(points.slice(0, -1)) : corners };
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
