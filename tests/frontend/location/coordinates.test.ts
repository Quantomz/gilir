// How a farmer types a coordinate, how the one search box tells a name from a position, and how F2 writes a
// coordinate back. Shapes come back through outline.ts and are judged by the contract's parser.
import { describe, expect, it } from "vitest";
import { classifyQuery, coordsText, cornersOfRows, parseCoord, rowsOfPoints } from "@/features/location/coordinates";
import type { CornerRow } from "@/features/location/coordinates";
import { boxAround, cornersFrom, cornersOfRing, markOutline } from "@/features/location/outline";
import { inputFixture } from "@/fixtures/input";
import { fieldIssues, good } from "./support/shapes";

const valueOf = (raw: string, axis: "latitude" | "longitude") => {
  const result = parseCoord(raw, axis);
  return result.ok ? result.value : result.error;
};

const rowsOf = (points: readonly (readonly [number, number])[]): CornerRow[] =>
  points.map(([lng, lat]) => ({ latitude: String(lat), longitude: String(lng) }));

describe("parseCoord", () => {
  it("[R15] accepts -6.326, 6.326, +6.326, 6,326 (comma decimal), ' 6.326 ', 6.326 S, 6.326°S, 6.326 s, and a Unicode minus or dash", () => {
    expect(valueOf("-6.326", "latitude")).toBe(-6.326);
    expect(valueOf("6.326", "latitude")).toBe(6.326);
    expect(valueOf("+6.326", "latitude")).toBe(6.326);
    expect(valueOf("6,326", "latitude")).toBe(6.326);
    expect(valueOf(" 6.326 ", "latitude")).toBe(6.326);
    expect(valueOf("6.326 S", "latitude")).toBe(-6.326);
    expect(valueOf("6.326°S", "latitude")).toBe(-6.326);
    expect(valueOf("6.326 s", "latitude")).toBe(-6.326);
    expect(valueOf("6.326° S", "latitude")).toBe(-6.326);
    expect(valueOf("−6.326", "latitude")).toBe(-6.326);
    expect(valueOf("–6.326", "latitude")).toBe(-6.326);
    expect(valueOf("‒6.326", "latitude")).toBe(-6.326);
    expect(valueOf("- 6.326", "latitude")).toBe(-6.326);
    expect(valueOf("108", "longitude")).toBe(108);
  });

  it("[R15] S and W make the value negative; N and E keep it", () => {
    expect(valueOf("6.3 N", "latitude")).toBe(6.3);
    expect(valueOf("6.3 S", "latitude")).toBe(-6.3);
    expect(valueOf("108.32 E", "longitude")).toBe(108.32);
    expect(valueOf("108.32 W", "longitude")).toBe(-108.32);
    expect(valueOf("108.32w", "longitude")).toBe(-108.32);
  });

  it("[R15] empty -> empty; 'abc' and '6..3' -> not_number", () => {
    expect(valueOf("", "latitude")).toBe("empty");
    expect(valueOf("   ", "longitude")).toBe("empty");
    expect(valueOf("abc", "latitude")).toBe("not_number");
    expect(valueOf("6..3", "latitude")).toBe("not_number");
    expect(valueOf("6.3.2", "longitude")).toBe("not_number");
    expect(valueOf("1080.5", "longitude")).toBe("not_number");
    expect(valueOf("6.3 SS", "latitude")).toBe("not_number");
  });

  it("[R15] E on a latitude and N on a longitude -> wrong_letter; '-6.3 S' -> sign_and_letter", () => {
    expect(valueOf("6.3 E", "latitude")).toBe("wrong_letter");
    expect(valueOf("108 N", "longitude")).toBe("wrong_letter");
    expect(valueOf("-6.3 S", "latitude")).toBe("sign_and_letter");
    expect(valueOf("-108 W", "longitude")).toBe("sign_and_letter");
    expect(valueOf("+6.3 S", "latitude")).toBe(-6.3);
  });

  it("[R15] degrees, minutes and seconds as GPS units and map apps write them, with the letter before or after", () => {
    expect(valueOf(`6°19'33.6"S`, "latitude")).toBe(-6.326);
    expect(valueOf("6° 19′ 33.6″ S", "latitude")).toBe(-6.326);
    expect(valueOf("6°19’33.6”S", "latitude")).toBe(-6.326);
    expect(valueOf("6°19'33.6''S", "latitude")).toBe(-6.326);
    expect(valueOf("6°19.56'S", "latitude")).toBe(-6.326);
    expect(valueOf("108°19'12.0\"E", "longitude")).toBe(108.32);
    expect(valueOf("S 6.326", "latitude")).toBe(-6.326);
    expect(valueOf("w108.32", "longitude")).toBe(-108.32);
    expect(valueOf("6.326º S", "latitude")).toBe(-6.326);
    expect(valueOf("-6°19'33.6\"", "latitude")).toBe(-6.326);
  });

  it("[R15] minutes or seconds of 60 or more -> minutes; minutes after decimal degrees, seconds with no minutes, or a letter on both sides -> not_number", () => {
    expect(valueOf("6°60'S", "latitude")).toBe("minutes");
    expect(valueOf("6°19'60\"S", "latitude")).toBe("minutes");
    expect(valueOf("6.5°19'S", "latitude")).toBe("not_number");
    expect(valueOf("6°33.6\"S", "latitude")).toBe("not_number");
    expect(valueOf("6°19.5'33\"S", "latitude")).toBe("not_number");
    expect(valueOf("S 6.326 S", "latitude")).toBe("not_number");
    expect(valueOf("S -6.326", "latitude")).toBe("sign_and_letter");
    expect(valueOf("N 108", "longitude")).toBe("wrong_letter");
  });

  it("[R1] latitude 90 and -90 and longitude 180 and -180 are accepted; 90.1 and 180.1 -> out_of_range", () => {
    expect(valueOf("90", "latitude")).toBe(90);
    expect(valueOf("-90", "latitude")).toBe(-90);
    expect(valueOf("90 S", "latitude")).toBe(-90);
    expect(valueOf("180", "longitude")).toBe(180);
    expect(valueOf("-180", "longitude")).toBe(-180);
    expect(valueOf("90.1", "latitude")).toBe("out_of_range");
    expect(valueOf("-90.1", "latitude")).toBe("out_of_range");
    expect(valueOf("180.1", "longitude")).toBe("out_of_range");
    expect(valueOf("180.1 W", "longitude")).toBe("out_of_range");
    expect(valueOf("100", "latitude")).toBe("out_of_range");
  });
});

describe("classifyQuery", () => {
  it("[R6] one letter is short: nothing would be sent", () => {
    expect(classifyQuery("a")).toEqual({ kind: "short" });
    expect(classifyQuery("  a  ")).toEqual({ kind: "short" });
    expect(classifyQuery("")).toEqual({ kind: "short" });
    expect(classifyQuery("é")).toEqual({ kind: "short" });
    expect(classifyQuery("ab")).toEqual({ kind: "name", text: "ab" });
  });

  it("[R20] '-6.326, 108.32' and '-6.326 108.32' are the position [108.32, -6.326] (latitude first)", () => {
    for (const typed of ["-6.326, 108.32", "-6.326 108.32", "-6.326,108.32", "-6.326; 108.32", "  -6.326 ,  108.32  ", "−6.326, 108.32"]) {
      expect(classifyQuery(typed), typed).toEqual({ kind: "position", at: [108.32, -6.326] });
    }
    expect(classifyQuery("-6,326; 108,32")).toEqual({ kind: "position", at: [108.32, -6.326] });
    expect(classifyQuery("-6,326 108,32")).toEqual({ kind: "position", at: [108.32, -6.326] });
  });

  it("[R20] '108.32 E, 6.326 S' and '6.326 S 108.32 E' are the same position (letters decide the order)", () => {
    for (const typed of ["108.32 E, 6.326 S", "6.326 S 108.32 E", "6.326° S, 108.320° E", "108.32E 6.326S", "6.326 S, 108.32", "108.32, 6.326 S", "108.32 E, -6.326"]) {
      expect(classifyQuery(typed), typed).toEqual({ kind: "position", at: [108.32, -6.326] });
    }
  });

  it("[R20] '-6.326, 200' is bad_position longitude out_of_range, not a name search", () => {
    expect(classifyQuery("-6.326, 200")).toEqual({ kind: "bad_position", axis: "longitude", error: "out_of_range" });
    expect(classifyQuery("95.5, 108")).toEqual({ kind: "bad_position", axis: "latitude", error: "out_of_range" });
    expect(classifyQuery("6.3 E, 108.3 E")).toEqual({ kind: "bad_position", axis: "latitude", error: "wrong_letter" });
    expect(classifyQuery("-6.3 S, 108.3")).toEqual({ kind: "bad_position", axis: "latitude", error: "sign_and_letter" });
  });

  it("[R1] 'Indramayu', 'Nakuru, Kenya', 'São Paulo' and 'Route 66' are names", () => {
    for (const typed of ["Indramayu", "Nakuru, Kenya", "São Paulo", "Route 66", "Ушуая", "6,326", "114 55", "560 001", "10115", "SW1A 1AA", "N1 9GU", "S33 6RR", "12/5", "Km 4.5 Ruta 3"]) {
      expect(classifyQuery(typed), typed).toEqual({ kind: "name", text: typed });
    }
    expect(classifyQuery("  Labasa  ")).toEqual({ kind: "name", text: "Labasa" });
  });

  it("[R20][R25] positions in degrees and minutes, with a leading letter, with º, in brackets or split by a slash are positions", () => {
    const typed = [
      `6°19'33.6"S 108°19'12.0"E`,
      `6°19.560'S 108°19.200'E`,
      "6° 19′ 33.6″ S, 108° 19′ 12″ E",
      "S 6.326, E 108.32",
      "S6.326 E108.32",
      "6.326º S, 108.32º E",
      "(-6.326, 108.32)",
      "[-6.326; 108.32]",
      "-6.326/108.32",
      `6°19'33.6"S,108°19'12"E`,
    ];
    for (const text of typed) expect(classifyQuery(text), text).toEqual({ kind: "position", at: [108.32, -6.326] });
    expect(classifyQuery("N 6.326 E 108.32")).toEqual({ kind: "position", at: [108.32, 6.326] });
    expect(classifyQuery("6º S, 108º E")).toEqual({ kind: "position", at: [108, -6] });
  });

  it("[R25] text that reads like a position but is not two coordinates is never a name, so it never reaches the geocoder", () => {
    for (const text of ["-6.326", "6.326 S 108.32 E 12", `6°19'33.6"S`, "S6.326E108.32", "6.326 108.32 7.1", "-6.326 / 108.32 / 9"]) {
      expect(classifyQuery(text).kind, text).toBe("unclear_position");
    }
    expect(classifyQuery("6°60'S 108°E")).toEqual({ kind: "bad_position", axis: "latitude", error: "minutes" });
  });

  it("[R11] '-16.79, 179.99' and '-16.79, -179.99' are positions on both sides of 180°", () => {
    expect(classifyQuery("-16.79, 179.99")).toEqual({ kind: "position", at: [179.99, -16.79] });
    expect(classifyQuery("-16.79, -179.99")).toEqual({ kind: "position", at: [-179.99, -16.79] });
    expect(classifyQuery("16.79 S, 179.99 W")).toEqual({ kind: "position", at: [-179.99, -16.79] });
  });

  it("[R25] a position with lat and lon labels is read by its numbers, in the labels' order", () => {
    for (const typed of ["lat: -6.326, lon: 108.32", "Latitude: -6.326, Longitude: 108.32", "Lat -6.326 Lon 108.32", "lat=-6.326&lon=108.32", "LAT -6.326 LNG 108.32"]) {
      expect(classifyQuery(typed), typed).toEqual({ kind: "position", at: [108.32, -6.326] });
    }
    for (const typed of ["lng: 108.32, lat: -6.326", "long=36.07&lat=-0.3"]) {
      expect(classifyQuery(typed).kind, typed).toBe("position");
    }
    expect(classifyQuery("lon: 36.07, lat: -0.3")).toEqual({ kind: "position", at: [36.07, -0.3] });
  });

  it("[R25] words around two or more decimal numbers or a degree mark never make a name, so a pasted link or a note never reaches the geocoder", () => {
    for (const typed of [
      "https://maps.google.com/?q=-6.326,108.32",
      "geo:-6.326,108.32",
      "my farm -6.326, 108.32",
      "6.326 South, 108.32 East",
      "GPS -6.326 108.32",
      "Farm 6°19' S",
    ]) {
      expect(classifyQuery(typed).kind, typed).not.toBe("name");
    }
  });

  it("[R1] place names that hold a label word or one decimal number stay names", () => {
    for (const typed of ["Latvia", "Lat Krabang", "Long Beach", "Long Xuyen", "Km 4.5 Ruta 3", "Lon Nol Road"]) {
      expect(classifyQuery(typed), typed).toEqual({ kind: "name", text: typed });
    }
  });
});

describe("rows", () => {
  it("[R15] a walked boundary whose last row repeats the first marks the field by its other corners", () => {
    const walked = [...good.square, good.square[0]];
    const result = cornersOfRows(rowsOf(walked));
    if (!result.ok) throw new Error("the walked rows should parse");
    expect(result.corners).toEqual(cornersFrom(good.square));
    const marked = markOutline(result.corners, { kind: "choose" });
    expect(marked.ok).toBe(true);
    const triangle = cornersOfRows(rowsOf([...good.square.slice(0, 2), good.square[0]]));
    if (!triangle.ok) throw new Error("the three rows should parse");
    expect(triangle.corners).toHaveLength(3);
  });

  it("[R15] cornersOfRows reports every bad number at once, in reading order, with row and axis", () => {
    const result = cornersOfRows([
      { latitude: "-6.3", longitude: "108.3" },
      { latitude: "", longitude: "abc" },
      { latitude: "6.3 E", longitude: "108.4" },
      { latitude: "-6.4", longitude: "200" },
    ]);
    expect(result).toEqual({
      ok: false,
      errors: [
        { row: 1, axis: "latitude", error: "empty" },
        { row: 1, axis: "longitude", error: "not_number" },
        { row: 2, axis: "latitude", error: "wrong_letter" },
        { row: 3, axis: "longitude", error: "out_of_range" },
      ],
    });
  });

  it("[R11] cornersOfRows on the Fiji rows returns corners in drawing space (179.99, 180.01)", () => {
    const result = cornersOfRows(rowsOf(good.fiji));
    if (!result.ok) throw new Error("the Fiji rows should parse");
    expect(result.corners.map(([lng]) => lng)).toEqual([179.99, 180.01, 180.01, 179.99]);
    expect(result.corners.map(([, lat]) => lat)).toEqual([-16.8, -16.8, -16.79, -16.79]);
    const marked = markOutline(result.corners, { kind: "choose" });
    if (!marked.ok) throw new Error(`the Fiji rows should mark, got ${marked.problem}`);
    expect(fieldIssues({ ring: marked.marked.ring, lookup: marked.marked.lookup, label: "Field" })).toEqual([]);
  });

  it("[R23] rowsOfPoints of a field's ring without its closing point gives its corners at 6 decimals with plain minus signs, and cornersOfRows of those rows gives the same shape back", () => {
    const ring = [[-68.3123456, -54.8100001], [-68.3, -54.81], [-68.3, -54.8], [-68.31, -54.8]] as const;
    const rows = rowsOfPoints(ring);
    expect(rows[0]).toEqual({ latitude: "-54.81", longitude: "-68.312346" });
    for (const row of rows) {
      for (const text of [row.latitude, row.longitude]) {
        expect(text).toMatch(/^-?\d{1,3}(\.\d{1,6})?$/);
      }
    }
    const fixtureRows = rowsOfPoints(inputFixture.field.ring.slice(0, -1));
    expect(fixtureRows).toEqual([
      { latitude: "15", longitude: "100" },
      { latitude: "15", longitude: "100.01" },
      { latitude: "15.01", longitude: "100.01" },
      { latitude: "15.01", longitude: "100" },
    ]);
    const back = cornersOfRows(fixtureRows);
    if (!back.ok) throw new Error("the fixture's rows should parse");
    expect(back.corners).toEqual(cornersOfRing(inputFixture.field.ring));
  });

  it("[R11] rowsOfPoints of a box astride 180° shows every longitude in [-180, 180]", () => {
    for (const at of [[179.9998, -16.8], [-179.9998, -16.8], [180, 64]] as const) {
      const box = boxAround(at, 1);
      expect(Math.max(...box.map(([lng]) => lng)) > 180 || Math.min(...box.map(([lng]) => lng)) < -180).toBe(true);
      const rows = rowsOfPoints(box);
      for (const row of rows) {
        expect(Math.abs(Number(row.longitude))).toBeLessThanOrEqual(180);
        expect(row.longitude).not.toMatch(/e/);
      }
      const back = cornersOfRows(rows);
      if (!back.ok) throw new Error("the box's rows should parse");
      expect(back.corners).toEqual(box);
    }
  });
});

describe("coordsText", () => {
  it("[R13] writes '6.327° S, 108.320° E' with 3 decimals and '6.33° S, 108.32° E' with 2", () => {
    expect(coordsText([108.32, -6.3271], 3)).toBe("6.327° S, 108.320° E");
    expect(coordsText([108.32, -6.3271], 2)).toBe("6.33° S, 108.32° E");
    expect(coordsText([-70.6, -33.4], 2)).toBe("33.40° S, 70.60° W");
    expect(coordsText([-21.95, 64.14], 3)).toBe("64.140° N, 21.950° W");
  });

  it("writes N and E for zero, and for a value that rounds to zero, and never a minus sign", () => {
    expect(coordsText([0, 0], 3)).toBe("0.000° N, 0.000° E");
    expect(coordsText([-0.0001, -0.0004], 3)).toBe("0.000° N, 0.000° E");
    expect(coordsText([-0.004, -0.004], 2)).toBe("0.00° N, 0.00° E");
    expect(coordsText([-0.006, -0.006], 2)).toBe("0.01° S, 0.01° W");
    for (const at of [[-180, -90], [-0, -0], [-12.5, -45.25]] as const) {
      expect(coordsText(at, 2)).not.toMatch(/-/);
      expect(coordsText(at, 3)).not.toMatch(/-/);
    }
  });
});
