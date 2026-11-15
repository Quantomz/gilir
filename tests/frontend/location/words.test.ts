// The words as data: complete, in the product's voice, and never claiming too much. Every string words.ts can produce
// is collected by walking its exports and calling its functions with every kind they take.
import { describe, expect, it } from "vitest";
import type { LngLat } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import type { Axis, CoordError } from "@/features/location/coordinates";
import { boxAround, cornersFrom, limits, markOutline, markSaved } from "@/features/location/outline";
import type { Marked, SavedProblem, ShapeProblem } from "@/features/location/outline";
import { labelFor } from "@/features/location/picker";
import type { LocateFailure, Made, Note, Notice, Outline, Place, Surface } from "@/features/location/picker";
import type { Provider, SearchFailure } from "@/features/location/provider";
import * as words from "@/features/location/words";
import { fieldIssues, good } from "./support/shapes";

const {
  acrossText, areaText, coordError, credits, locateFailed, noteWords, searchBox, weatherDot, noticeWords, placeLine, precisionWords,
  problemOnMap, problemTyped, searchFailed, weatherGrid,
} = words;

const kinds = <K extends string>(record: Record<K, true>) => Object.keys(record) as K[];
const shapeProblems = kinds<ShapeProblem>({ too_few: true, too_many: true, pole: true, repeated: true, crossing: true, no_inside: true, too_far: true, tiny: true });
const savedProblems: readonly SavedProblem[] = [...shapeProblems, "label"];
const searchFailures = kinds<SearchFailure>({ offline: true, slow: true, refused: true, busy: true });
const locateFailures = kinds<LocateFailure>({ denied: true, timeout: true, unavailable: true, unsupported: true });
const providers = kinds<Provider["kind"]>({ ready: true, missing: true });
const surfaces = kinds<Surface["kind"]>({ starting: true, globe: true, plan: true });
const coordErrors = kinds<CoordError>({ empty: true, not_number: true, wrong_letter: true, sign_and_letter: true, out_of_range: true, minutes: true });
const axes = kinds<Axis>({ latitude: true, longitude: true });
const globeLosses = kinds<Extract<Notice, { kind: "no_globe" }>["why"]>({ no_webgl: true, lost: true, failed: true });

const indramayu: LngLat = [108.32, -6.3271];
const places = {
  found: { kind: "found", name: "Indramayu", where: "West Java, Indonesia", at: indramayu },
  position: { kind: "position", at: indramayu },
  tapped: { kind: "tapped", at: indramayu },
  gps: { kind: "gps", at: indramayu, accuracyM: 9.6 },
  saved: { kind: "saved", label: "My rice field by the river", at: indramayu },
} as const satisfies { [K in Place["kind"]]: Extract<Place, { kind: K }> };
const everyPlace: readonly Place[] = Object.values(places);

function mark(points: readonly LngLat[]): Marked {
  const result = markOutline(cornersFrom(points), { kind: "choose" });
  if (!result.ok) throw new Error(`expected a field, got ${result.problem}`);
  return result.marked;
}

const box = mark(boxAround(indramayu, 1));
const outlineOf = (made: Made, place: Place | null): Outline => ({ marked: box, label: "Field near Indramayu", made, place });

const everyOutline: readonly Outline[] = [
  ...everyPlace.map(place => outlineOf({ kind: "box", hectares: 1, on: "place" }, place)),
  outlineOf({ kind: "box", hectares: 1, on: "tap" }, places.found),
  outlineOf({ kind: "box", hectares: 1, on: "place" }, null),
  outlineOf({ kind: "drawn" }, places.found),
  outlineOf({ kind: "typed" }, null),
  outlineOf({ kind: "saved" }, places.saved),
];

const everyNotice: readonly Notice[] = [
  { kind: "no_key" },
  ...globeLosses.map(why => ({ kind: "no_globe", why }) as const),
  { kind: "no_pictures" },
  { kind: "still_marked", label: "Field near Indramayu, West Java, Indonesia" },
  ...shapeProblems.map(problem => ({ kind: "refused", problem }) as const),
  ...savedProblems.map(problem => ({ kind: "saved_unusable", problem }) as const),
];

const everyNote: readonly Note[] = [
  ...everyPlace.map(place => ({ kind: "place", place }) as const),
  { kind: "marked" },
  { kind: "typed", corners: 5 },
  { kind: "size_end", step: -1 },
  { kind: "size_end", step: 1 },
  ...shapeProblems.flatMap(problem => (["map", "typed"] as const).map(from => ({ kind: "refused", from, problem, corner: null }) as const)),
  ...savedProblems.map(problem => ({ kind: "saved_unusable", problem }) as const),
];

const areas = [1, 24, 25, 99, 2_500, 5_000, 9_999, 10_000, 12_345, 99_999, 1_194_276, 2_367_388, 5e7, 1e9];

/** Every word: each string reachable from the exports, the word functions called with every kind they take. */
function everyWord(): string[] {
  const found: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") found.push(value);
    else if (typeof value === "function") [[1, 4], [3, 256], [12_345, 7]].forEach(args => walk(value(...args)));
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value !== null && typeof value === "object") Object.values(value).forEach(walk);
  };
  const tables = Object.entries(words).filter(([, value]) => typeof value !== "function");
  expect(tables.length).toBeGreaterThan(10);
  tables.forEach(([, value]) => walk(value));
  everyNotice.forEach(notice => found.push(noticeWords(notice)));
  everyNote.forEach(note => surfaces.forEach(surface => found.push(noteWords(note, everyOutline[0], surface))));
  locateFailures.forEach(why => providers.forEach(kind => {
    const { title, body, steps } = locateFailed(why, kind);
    found.push(title, body, ...steps);
  }));
  everyOutline.forEach(outline => found.push(precisionWords(outline)));
  areas.forEach(area => found.push(areaText(area), acrossText(Math.sqrt(area))));
  everyPlace.forEach(place => found.push(placeLine(place), labelFor(place, place.at)));
  found.push(labelFor(null, indramayu));
  return found;
}

describe("numbers into words", () => {
  it("[R10] areaText: 10,000 m² 'About 1 hectare'; 2,500 'About a quarter hectare'; 5,000 'About half a hectare'; 1,194,276 'About 119 hectares'; 2,367,388 'About 237 hectares'", () => {
    expect(areaText(10_000)).toBe("About 1 hectare");
    expect(areaText(2_500)).toBe("About a quarter hectare");
    expect(areaText(5_000)).toBe("About half a hectare");
    expect(areaText(1_194_276)).toBe("About 119 hectares");
    expect(areaText(2_367_388)).toBe("About 237 hectares");
    expect(areaText(12_345)).toBe("About 1.2 hectares");
    expect(areaText(1_234)).toBe("About 0.12 hectares");
    expect(areaText(123_456_789)).toBe("About 12,346 hectares");
    const fixture = markSaved(inputFixture.field);
    if (!fixture.ok) throw new Error("the fixture should draw");
    expect(areaText(fixture.marked.areaM2)).toBe("About 119 hectares");
    expect(areaText(mark(good.fiji).areaM2)).toBe("About 237 hectares");
    expect(areaText(box.areaM2)).toBe("About 1 hectare");
    expect(areaText(mark(boxAround(indramayu, 0.25)).areaM2)).toBe("About a quarter hectare");
    expect(areaText(mark(boxAround(indramayu, 0.5)).areaM2)).toBe("About half a hectare");
  });

  it("[R10] areaText never prints m² and never more than two decimals", () => {
    for (let exponent = 0; exponent <= 10; exponent += 0.05) {
      const text = areaText(10 ** exponent);
      expect(text).not.toMatch(/m²|m2|square/i);
      expect(text).not.toMatch(/\.\d{3}/);
      expect(text).toMatch(/hectare/);
    }
    expect(areaText(25)).toBe("Less than 0.01 hectares");
  });

  it("acrossText: 100 m '100 m across'; 62 m '60 m across'; 144 m '140 m across'; 1,540 m '1.5 km across'", () => {
    expect(acrossText(100)).toBe("100 m across");
    expect(acrossText(62)).toBe("60 m across");
    expect(acrossText(47)).toBe("45 m across");
    expect(acrossText(144)).toBe("140 m across");
    expect(acrossText(1_540)).toBe("1.5 km across");
    expect(acrossText(998)).toBe("1 km across");
    expect(acrossText(18_400)).toBe("18 km across");
    expect(acrossText(7.4)).toBe("7 m across");
    expect(acrossText(0.2)).toBe("1 m across");
  });

  it("the drawing's scale bar reads '50 m' under a kilometre and '2 km' or '1.5 km' from one", () => {
    expect(words.map.scale(50)).toBe("50 m");
    expect(words.map.scale(500)).toBe("500 m");
    expect(words.map.scale(1_000)).toBe("1 km");
    expect(words.map.scale(2_000)).toBe("2 km");
    expect(words.map.scale(1_500)).toBe("1.5 km");
  });

  it("placeLine: a found place by name and where; a saved place by its label; a typed, tapped or GPS place as '6.327° S, 108.320° E'", () => {
    expect(placeLine(places.found)).toBe("Indramayu, West Java, Indonesia");
    expect(placeLine({ ...places.found, where: "" })).toBe("Indramayu");
    expect(placeLine(places.saved)).toBe("My rice field by the river");
    for (const place of [places.position, places.tapped, places.gps]) expect(placeLine(place)).toBe("6.327° S, 108.320° E");
  });
});

describe("the field label", () => {
  const north = (at: LngLat, km: number): LngLat => [at[0], at[1] + km / 110.54];

  it("labelFor: 'Field near Indramayu, West Java, Indonesia' when the found place is within 30 km of the lookup", () => {
    expect(labelFor(places.found, indramayu)).toBe("Field near Indramayu, West Java, Indonesia");
    expect(labelFor(places.found, north(indramayu, 29))).toBe("Field near Indramayu, West Java, Indonesia");
    expect(labelFor({ ...places.found, where: "" }, north(indramayu, 5))).toBe("Field near Indramayu");
  });

  it("labelFor: 'Field at 6.33° S, 108.32° E' with no place, a typed, tapped or GPS place, or a found place 40 km away", () => {
    for (const place of [null, places.position, places.tapped, places.gps]) {
      expect(labelFor(place, indramayu)).toBe("Field at 6.33° S, 108.32° E");
    }
    expect(labelFor({ ...places.found, at: north(indramayu, 40) }, indramayu)).toBe("Field at 6.33° S, 108.32° E");
  });

  it("labelFor keeps a saved place's own label within 30 km, so retyping one corner of a saved field keeps its name", () => {
    expect(labelFor(places.saved, north(indramayu, 0.2))).toBe("My rice field by the river");
    expect(labelFor(places.saved, north(indramayu, 40))).toBe("Field at 5.97° S, 108.32° E");
  });

  it("[R11] labelFor measures the 30 km the short way across 180°: a lookup at -179.999 is near a place at 179.999 (Labasa, never Tonga)", () => {
    const labasa: Place = { kind: "found", name: "Labasa", where: "Northern, Fiji", at: [179.999, -16.43] };
    const tonga: Place = { kind: "found", name: "Nuku‘alofa", where: "Tonga", at: [-175.2, -21.13] };
    expect(labelFor(labasa, [-179.999, -16.43])).toBe("Field near Labasa, Northern, Fiji");
    expect(labelFor(labasa, [-179.9, -16.5])).toBe("Field near Labasa, Northern, Fiji");
    expect(labelFor(tonga, [-179.999, -16.43])).toBe("Field at 16.43° S, 180.00° W");
  });

  it("[R8] labelFor never returns an empty label: a saved place whose label is blank gets 'Field at …', which passes fieldIssues", () => {
    const blank: Place = { ...places.saved, label: "   " };
    const label = labelFor(blank, indramayu);
    expect(label).toBe("Field at 6.33° S, 108.32° E");
    expect(fieldIssues({ ...inputFixture.field, label })).toEqual([]);
    expect(labelFor({ ...places.saved, label: "  My rice field  " }, indramayu)).toBe("My rice field");
  });

  it("[R8] limits.labelCodePoints is the contract's limit: one code point more is refused", () => {
    expect(fieldIssues({ ...inputFixture.field, label: "🌾".repeat(limits.labelCodePoints) })).toEqual([]);
    expect(fieldIssues({ ...inputFixture.field, label: "🌾".repeat(limits.labelCodePoints + 1) })).not.toEqual([]);
  });

  it("[R8] labelFor cuts to 240 code points (a name of 300 emoji), trims, and the result passes fieldIssues inside a field", () => {
    const field = inputFixture.field;
    const emoji: Place = { kind: "found", name: "🌾".repeat(300), where: "", at: field.lookup };
    const long = labelFor(emoji, field.lookup);
    expect(long.startsWith("Field near 🌾")).toBe(true);
    expect(Array.from(long)).toHaveLength(240);
    expect(fieldIssues({ ...field, label: long })).toEqual([]);

    const spaced: Place = { kind: "found", name: `${"a".repeat(228)}   b`, where: "", at: field.lookup };
    const trimmed = labelFor(spaced, field.lookup);
    expect(trimmed).toBe(`Field near ${"a".repeat(228)}`);
    expect(fieldIssues({ ...field, label: trimmed })).toEqual([]);
  });
});

describe("precision", () => {
  it("[R13] precisionWords: a box from a search names the place and says 'not on your field yet'; from GPS gives the accuracy in metres; moved by a tap says 'the spot you tapped'", () => {
    const onPlace = (place: Place) => precisionWords(outlineOf({ kind: "box", hectares: 1, on: "place" }, place));
    expect(onPlace(places.found)).toBe("From your search: the box is at the middle of Indramayu, not on your field yet.");
    expect(onPlace(places.position)).toBe("The box is at the position you typed, not on your field yet.");
    expect(onPlace(places.gps)).toBe("From your phone’s location, within about 10 m.");
    expect(onPlace({ ...places.gps, accuracyM: 23 })).toBe("From your phone’s location, within about 25 m.");
    expect(onPlace({ ...places.gps, accuracyM: 0.4 })).toBe("From your phone’s location, within about 1 m.");
    expect(onPlace(places.tapped)).toBe("The box is at the spot you tapped.");
    expect(precisionWords(outlineOf({ kind: "box", hectares: 2, on: "tap" }, places.found))).toBe("The box is at the spot you tapped.");
  });

  it("[R13] precisionWords for drawn, typed and saved outlines are the three fixed sentences", () => {
    expect(precisionWords(outlineOf({ kind: "drawn" }, places.found))).toBe("You placed the corners on the map.");
    expect(precisionWords(outlineOf({ kind: "typed" }, null))).toBe("These are the corners you typed.");
    expect(precisionWords(outlineOf({ kind: "typed" }, places.found))).toBe("These are the corners you typed.");
    expect(precisionWords(outlineOf({ kind: "saved" }, places.saved))).toBe("This is the field you marked before.");
  });

  it("[R13][R26] weatherGrid says the grid is much larger than a field and that marking more exactly doesn’t make the records finer", () => {
    expect(weatherGrid).toMatch(/grid much larger than a field/);
    expect(weatherGrid).toMatch(/marking your field more exactly doesn’t make the weather records finer/);
    expect(weatherGrid).toMatch(/NASA/);
  });

  it("[R5][R25] credits.missing names only NASA and no place search; credits.ready names NASA, MapTiler and the search", () => {
    const missing = `${credits.missing.lead} ${credits.missing.privacy}`;
    const ready = `${credits.ready.lead} ${credits.ready.privacy}`;
    expect(missing).toMatch(/NASA/);
    expect(missing).not.toMatch(/MapTiler|search/i);
    expect(ready).toMatch(/NASA/);
    expect(ready).toMatch(/MapTiler/);
    expect(ready).toMatch(/search/);
  });
});

describe("coverage and voice", () => {
  it("every ShapeProblem has typed and on-map words; every SearchFailure, LocateFailure, CoordError, Notice and Note kind has words (the Records and switches are total)", () => {
    const filled = (text: string | undefined) => expect(text?.trim().length ?? 0).toBeGreaterThan(10);
    shapeProblems.forEach(problem => { filled(problemTyped[problem]); filled(problemOnMap[problem]); });
    searchFailures.forEach(failure => filled(searchFailed[failure]));
    locateFailures.forEach(failure => providers.forEach(kind => { filled(locateFailed(failure, kind).title); filled(locateFailed(failure, kind).body); }));
    expect(locateFailed("denied", "missing").steps).toHaveLength(3);
    axes.forEach(axis => coordErrors.forEach(error => filled(coordError[axis][error])));
    everyNotice.forEach(notice => filled(noticeWords(notice)));
    everyNote.forEach(note => surfaces.forEach(surface => filled(noteWords(note, everyOutline[0], surface))));
    expect(new Set(shapeProblems.map(problem => problemTyped[problem])).size).toBe(shapeProblems.length);
  });

  it("[R16] every notice and search failure for something unavailable names a way that still works: a position, the corners, the location or Search again", () => {
    const unavailable = [
      ...searchFailures.map(failure => searchFailed[failure]),
      ...everyNotice.filter(notice => ["no_key", "no_globe", "no_pictures"].includes(notice.kind)).map(noticeWords),
      locateFailed("unsupported", "missing").body,
    ];
    expect(unavailable).toHaveLength(searchFailures.length + 6);
    for (const text of unavailable) expect(text).toMatch(/position|corners|location|Search again/);
  });

  it("[R16][R20] with no key nothing points at a name search: the box is named for a position, and 'We couldn’t find you yet' says to type one", () => {
    expect(searchBox.missing.label).toBe("Position of your farm");
    expect(searchBox.missing.placeholder).toBe("-6.326, 108.32");
    for (const text of Object.values(searchBox.missing)) expect(text).not.toMatch(/village|town|name|Indramayu/i);
    for (const why of ["timeout", "unavailable"] as const) {
      expect(locateFailed(why, "missing").body).toMatch(/close this and type a position\.$/);
      expect(locateFailed(why, "ready").body).toMatch(/close this and search by name\.$/);
    }
  });

  it("[R14] at an end of the box sizes, the drawing points at the corner list, and only a map with corners to drag says drag", () => {
    for (const step of [-1, 1] as const) {
      expect(noteWords({ kind: "size_end", step }, everyOutline[0], "plan")).toMatch(/Type the corners in the list below/);
      expect(noteWords({ kind: "size_end", step }, everyOutline[0], "plan")).not.toMatch(/drag/i);
      expect(noteWords({ kind: "size_end", step }, everyOutline[0], "globe")).toMatch(/Drag a corner/);
    }
  });

  it("[R13] the dot inside the field is explained, and no word claims the dot's weather is the field's", () => {
    expect(weatherDot).toMatch(/^The dot inside your field is the point we use to look up the weather records\.$/);
  });

  it("[R13][R26] no string says the weather is for the field: none matches /your field.s weather|weather (for|at|on) your field/i", () => {
    for (const text of everyWord()) expect(text).not.toMatch(/your field.s weather|weather (for|at|on|of) (your|this) field/i);
  });

  it("no string contains 'will', 'Threefield', a long dash, or a straight apostrophe inside a word", () => {
    const every = everyWord();
    expect(every.length).toBeGreaterThan(200);
    for (const text of every) {
      expect(text).not.toMatch(/\bwill\b/i);
      expect(text).not.toMatch(/threefield/i);
      expect(text).not.toMatch(/[—–]/);
      expect(text).not.toMatch(/\p{L}'\p{L}/u);
    }
    expect(every.some(text => /\p{L}’\p{L}/u.test(text))).toBe(true);
  });

  it("no string names a priority, a pest or a weed (AGENTS.md)", () => {
    for (const text of everyWord()) expect(text).not.toMatch(/priorit|\bpests?\b|weed/i);
  });
});
