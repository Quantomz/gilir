// Node environment. The words as data: complete, in the product's voice, and never claiming too much.
import { describe, it } from "vitest";

describe("numbers into words", () => {
  it.todo("[R10] areaText: 10,000 m² 'About 1 hectare'; 2,500 'About a quarter hectare'; 5,000 'About half a hectare'; 1,194,276 'About 119 hectares'; 2,367,388 'About 237 hectares'");
  it.todo("[R10] areaText never prints m² and never more than two decimals");
  it.todo("acrossText: 100 m '100 m across'; 62 m '60 m across'; 144 m '140 m across'; 1,540 m '1.5 km across'");
  it.todo("placeLine: a found place by name and where; a saved place by its label; a typed, tapped or GPS place as '6.327° S, 108.320° E'");
});

describe("the field label", () => {
  it.todo("labelFor: 'Field near Indramayu, West Java, Indonesia' when the found place is within 30 km of the lookup");
  it.todo("labelFor: 'Field at 6.33° S, 108.32° E' with no place, a typed, tapped or GPS place, or a found place 40 km away");
  it.todo("labelFor keeps a saved place's own label within 30 km, so retyping one corner of a saved field keeps its name");
  it.todo("[R11] labelFor measures the 30 km the short way across 180°: a lookup at -179.999 is near a place at 179.999 (Labasa, never Tonga)");
  it.todo("[R8] labelFor cuts to 240 code points (a name of 300 emoji), trims, and the result passes fieldIssues inside a field");
});

describe("precision", () => {
  it.todo("[R13] precisionWords: a box from a search names the place and says 'not on your field yet'; from GPS gives the accuracy in metres; moved by a tap says 'the spot you tapped'");
  it.todo("[R13] precisionWords for drawn, typed and saved outlines are the three fixed sentences");
  it.todo("[R13][R26] weatherGrid says the grid is much larger than a field and that marking more exactly doesn’t make the records finer");
  it.todo("[R5][R25] credits.missing names only NASA and no place search; credits.ready names NASA, MapTiler and the search");
});

describe("coverage and voice", () => {
  it.todo("every ShapeProblem has typed and on-map words; every SearchFailure, LocateFailure, CoordError, Notice and Note kind has words (the Records and switches are total)");
  it.todo("[R16] every notice and search failure for something unavailable names a way that still works: a position, the corners, the location or Search again");
  it.todo("[R13][R26] no string says the weather is for the field: none matches /your field.s weather|weather (for|at|on) your field/i");
  it.todo("no string contains 'will', 'Threefield', a long dash, or a straight apostrophe inside a word");
  it.todo("no string names a priority, a pest or a weed (AGENTS.md)");
});
