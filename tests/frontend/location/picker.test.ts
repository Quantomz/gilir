// Node environment. The state machine alone: update(picker, action) and what it hands back. No React, no map, no
// fetch. Each invariant P1 to P6 in src/features/location/picker.ts has its cases here. Every emitted field is judged
// by support/shapes.ts fieldIssues, not by F2's code.
import { describe, it } from "vitest";

describe("opening", () => {
  it.todo("[R20] openPicker(null): finding, nothing marked, no candidate, surface starting, look world, no note");
  it.todo("[R23] openPicker(inputFixture.field): marking the fixture, made saved, its own label and lookup, look field");
  it.todo("[R23] fieldOf(openPicker(inputFixture.field).outline) is sameField with inputFixture.field (nothing re-rounded)");
  it.todo("a value F2 cannot draw (a bow-tie the parser accepts): finding, candidate { saved } at its lookup, note saved_unusable");
  it.todo("a saved field 30 km across opens marked: F2's size policy never refuses a saved value");
});

describe("P1 marking always holds a valid outline", () => {
  it.todo("[R7] move to a spot that makes two sides cross: the same Outline object, note refused { map, crossing }, emit null");
  it.todo("[R7] remove with 3 corners: refused too_few, the outline unchanged");
  it.todo("[R7] insert at 256 corners: refused too_many");
  it.todo("[R15] typed(bow-tie): note refused { typed, crossing }, focus problem, the outline unchanged");
  it.todo("typed(corners 10° apart): refused too_far; a move that stretches the field past 20 km: refused too_far");
  it.todo("mark at latitude 89: refused pole, still finding");
  it.todo("the next applied action of any kind clears the refusal");
});

describe("P2 only the farmer's accepted edits emit", () => {
  it.todo("[R8] mark, a tap on a box, resize, move, insert, remove and typed each emit fieldOf(outline), and fieldIssues of it is empty");
  it.todo("adopt, pick, a tap while finding, select, list, surface, pictures, again and back emit null");
  it.todo("[R8] a refused edit emits null");
  it.todo("typed corners equal to the field already held emit null (no duplicate onChange)");
  it.todo("[R12] typed(the U) emits a field whose lookup is strictly inside (support strictlyInside)");
  it.todo("[R11] typed(fiji) emits ring longitudes in [-180, 180] and a lookup the parser accepts");
});

describe("P3 adopt", () => {
  it.todo("[R23] adopt(field) while finding with nothing marked: marking that field, made saved, emit null");
  it.todo("[R23] adopt of the field just emitted returns the same picker object (no echo)");
  it.todo("adopt of an equal field in a new object (a JSON round trip) returns the same picker object");
  it.todo("adopt(null) while marking: finding, nothing marked, emit null");
  it.todo("adopt of a different field replaces the outline, keeps surface and listOpen, and moves the look to the field");
});

describe("P4 the held field survives Search again", () => {
  it.todo("again from a box: finding, the same Outline object, candidate null, emit null");
  it.todo("noticesOf after again holds still_marked with the outline's label");
  it.todo("back returns to marking with that same Outline object, so Smaller and Bigger still work on it, and emits null");
  it.todo("pick then mark replaces it: one emit, with a box at the new place");
  it.todo("pick alone does not change the outline: the parent keeps the old field until Mark my field");
});

describe("finding to marking", () => {
  it.todo("[R1] pick { position at [-70.6, -33.4] } then mark: a 1 ha box around that point, label 'Field at 33.40° S, 70.60° W'");
  it.todo("mark with a found place: label 'Field near Indramayu, West Java, Indonesia', made box on place, focus heading");
  it.todo("[R3] a tap while finding sets a tapped candidate; mark then puts the box on it");
  it.todo("a GPS place (pick then mark): the box's lookup is the fix itself");
  it.todo("mark with no candidate changes nothing");
});

describe("the box and the corners", () => {
  it.todo("a tap while marking a box moves the box to the tap, keeps its size and place, sets made.on tap, and emits");
  it.todo("a tap while marking drawn, typed or saved corners only clears the selection");
  it.todo("resize(+1) from 1 ha gives 2 ha around the same lookup; at 50 ha it sets note size_end(+1) and emits null");
  it.todo("move, insert and remove turn made into drawn; phaseOf goes from box to corners");
  it.todo("insert with corner 2 selected adds corner 3 and selects it; with none selected it splits the longest side");
  it.todo("a single-corner edit and a resize keep the label; a new box and typed corners relabel");
  it.todo("typed with the list open closes it; with the plan surface listShown stays true");
});

describe("P5 the camera", () => {
  it.todo("look.seq rises on adopt, pick, a tap while finding, mark, back, resize and typed");
  it.todo("look.seq stays on select, move, insert, remove, a tap on a box, list, surface, pictures and again");
});

describe("focus", () => {
  it.todo("[R15] finding to marking focuses heading; marking to finding focuses search");
  it.todo("[R15] list(true) focuses list; list(false) focuses list_opener; typed accepted focuses heading; typed refused focuses problem");
  it.todo("adopt never moves focus");
});

describe("surfaces and notices", () => {
  it.todo("[R14] surface plan no_webgl: noticesOf holds no_globe no_webgl, and listShown is true");
  it.todo("[R14] a globe report after a plan is dropped: the plan stays for the visit");
  it.todo("[R16] noticesOf(picker, false) holds no_key; pictures failed holds no_pictures; both orders are stable, no_key first");
  it.todo("sceneOf: the pin only while finding with a candidate; the outline only while marking; boxFollowsTap only for a box");
  it.todo("phaseOf: finding, box, corners");
});
