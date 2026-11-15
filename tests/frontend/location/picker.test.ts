// The state machine alone: update(picker, action) and what it hands back. No React, no map, no fetch. Every emitted
// field is judged by the contract's parser, the server's request handler and an independent strict-inside test.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LngLat } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { cornersOfRows, rowsOfPoints } from "@/features/location/coordinates";
import { cornersFrom, withinPolicy } from "@/features/location/outline";
import type { Field } from "@/features/location/outline";
import { fieldOf, listShown, noticesOf, openPicker, phaseOf, sceneOf, update } from "@/features/location/picker";
import type { Action, Outline, Picker, Place, Step } from "@/features/location/picker";
import { bad, circle, fieldIssues, good, policy, randomPolygon, randomSource, serverStatus, strictlyInside } from "./support/shapes";

type Ring = readonly LngLat[];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const indramayu: Place = { kind: "found", name: "Indramayu", where: "West Java, Indonesia", at: [108.32, -6.3271] };
const chile: Place = { kind: "position", at: [-70.6, -33.4] };
const pick = (place: Place): Action => ({ kind: "pick", place });
const typed = (points: Ring): Action => ({ kind: "typed", corners: cornersFrom(points) });
const adopt = (field: Field | null): Action => ({ kind: "adopt", field });
const MARK: Action = { kind: "mark" };
const AGAIN: Action = { kind: "again" };
const BACK: Action = { kind: "back" };
const INSERT: Action = { kind: "insert" };

function play(start: Picker, actions: readonly Action[]): Step[] {
  const steps: Step[] = [];
  let picker = start;
  for (const action of actions) {
    const step = update(picker, action);
    steps.push(step);
    picker = step.picker;
  }
  return steps;
}

const last = (start: Picker, ...actions: Action[]): Step => play(start, actions).at(-1) as Step;

function outlineOf(picker: Picker): Outline {
  if (picker.stage !== "marking") throw new Error(`expected marking, got ${picker.stage}`);
  return picker.outline;
}

const cornersOf = (picker: Picker) => outlineOf(picker).marked.corners;
const boxed = () => last(openPicker(null), pick(indramayu), MARK).picker;
const ringOf = (field: Field): Ring => field.ring.slice(0, -1);
const fieldWith = (corners: Ring, lookup: LngLat, label = "Saved field"): Field => ({ ring: [...corners, corners[0]], lookup, label });
const within = (value: number, expected: number, fraction: number) => Math.abs(value - expected) <= expected * fraction;

/** What an accepted farmer edit must hand the parent: the outline on screen, accepted by every outside judge. */
async function expectAcceptedEmit(step: Step): Promise<void> {
  expect(step.emit).not.toBeNull();
  const field = step.emit as Field;
  expect(field).toEqual(fieldOf(outlineOf(step.picker)));
  expect(fieldIssues(field)).toEqual([]);
  expect(strictlyInside(field.lookup, ringOf(field))).toBe(true);
  expect(await serverStatus(field)).toBe(202);
}

describe("opening", () => {
  it("[R20] openPicker(null): finding, nothing marked, no candidate, surface starting, look world, no note", () => {
    const picker = openPicker(null);
    expect(picker).toMatchObject({ stage: "finding", outline: null, candidate: null, surface: { kind: "starting" }, note: null, listOpen: false });
    expect(picker.look.at).toBe("world");
    expect(phaseOf(picker)).toBe("finding");
  });

  it("[R23] openPicker(inputFixture.field): marking the fixture, made saved, its own label and lookup, look field", () => {
    const picker = openPicker(inputFixture.field);
    const outline = outlineOf(picker);
    expect(outline.made).toEqual({ kind: "saved" });
    expect(outline.label).toBe(inputFixture.field.label);
    expect(outline.marked.lookup).toEqual(inputFixture.field.lookup);
    expect(outline.place).toEqual({ kind: "saved", label: inputFixture.field.label, at: inputFixture.field.lookup });
    expect(picker.look.at).toBe("field");
    expect(picker.note).toBeNull();
  });

  it("[R23] fieldOf(openPicker(inputFixture.field).outline) is sameField with inputFixture.field (nothing re-rounded)", () => {
    const field = fieldOf(outlineOf(openPicker(inputFixture.field)));
    expect(field).toEqual(inputFixture.field);
    field.ring.forEach((point, i) => expect(point).toEqual(inputFixture.field.ring[i]));
  });

  it("a value F2 cannot draw (a bow-tie the parser accepts): finding, candidate { saved } at its lookup, note saved_unusable", () => {
    const bowTie = fieldWith(bad.bowTie.corners, bad.bowTie.corners[0], "Field by the canal");
    expect(fieldIssues(bowTie)).toEqual([]);
    const picker = openPicker(bowTie);
    expect(picker.stage).toBe("finding");
    expect(picker.outline).toBeNull();
    expect(picker.stage === "finding" && picker.candidate).toEqual({ kind: "saved", label: "Field by the canal", at: bowTie.lookup });
    expect(picker.note).toEqual({ kind: "saved_unusable", problem: "crossing" });
    expect(noticesOf(picker, true)).toEqual([{ kind: "saved_unusable", problem: "crossing" }]);

    const marked = last(picker, MARK);
    expect(outlineOf(marked.picker).marked.lookup).toEqual(bowTie.lookup);
    expect(outlineOf(marked.picker).label).toBe("Field by the canal");
  });

  it("a saved field 30 km across opens marked: F2's size policy never refuses a saved value", () => {
    const wide = fieldWith([[36, -0.3], [36.27, -0.3], [36.27, -0.29], [36, -0.29]], [36.135, -0.295]);
    expect(fieldIssues(wide)).toEqual([]);
    const outline = outlineOf(openPicker(wide));
    expect(withinPolicy(outline.marked)).toBe("too_far");
    expect(fieldOf(outline)).toEqual(wide);
  });
});

describe("P1 marking always holds a valid outline", () => {
  it("[R7] move to a spot that makes two sides cross: the same Outline object, note refused { map, crossing }, emit null", () => {
    const before = boxed();
    const [[w, s], , [e, n]] = cornersOf(before);
    const step = update(before, { kind: "move", corner: 2, to: [(w + e) / 2, s - (n - s)] });
    expect(step.picker.outline).toBe(before.outline);
    expect(step.picker.note).toEqual({ kind: "refused", from: "map", problem: "crossing", corner: null });
    expect(step.emit).toBeNull();
    expect(noticesOf(step.picker, true)).toEqual([{ kind: "refused", problem: "crossing" }]);
  });

  it("[R7] remove with 3 corners: refused too_few, the outline unchanged", () => {
    const triangle = last(openPicker(null), typed([[108.32, -6.33], [108.33, -6.33], [108.325, -6.32]])).picker;
    const step = update(triangle, { kind: "remove", corner: 0 });
    expect(step.picker.outline).toBe(triangle.outline);
    expect(step.picker.note).toMatchObject({ kind: "refused", from: "map", problem: "too_few" });
    expect(step.emit).toBeNull();
  });

  it("[R7] insert at 256 corners: refused too_many", () => {
    const full = last(openPicker(null), typed(circle(256))).picker;
    expect(cornersOf(full)).toHaveLength(256);
    const step = update(full, INSERT);
    expect(step.picker.outline).toBe(full.outline);
    expect(step.picker.note).toMatchObject({ kind: "refused", problem: "too_many" });
    expect(step.emit).toBeNull();
  });

  it("[R15] typed(bow-tie): note refused { typed, crossing }, focus problem, the outline unchanged", () => {
    const before = last(boxed(), { kind: "list", open: true }).picker;
    const step = update(before, typed(bad.bowTie.corners));
    expect(step.picker.note).toEqual({ kind: "refused", from: "typed", problem: "crossing", corner: null });
    expect(step.focus).toBe("problem");
    expect(step.picker.outline).toBe(before.outline);
    expect(step.picker.listOpen).toBe(true);
    expect(step.emit).toBeNull();
    expect(noticesOf(step.picker, true)).toEqual([]);
  });

  it("typed(corners 10° apart): refused too_far; a move that stretches the field past 20 km: refused too_far", () => {
    const tooFar = update(openPicker(null), typed(policy.tooFar.corners));
    expect(tooFar.picker.note).toMatchObject({ kind: "refused", from: "typed", problem: "too_far" });
    expect(tooFar.picker.stage).toBe("finding");

    const before = boxed();
    const [, , [e, n]] = cornersOf(before);
    const stretched = update(before, { kind: "move", corner: 2, to: [e, n + 0.2] });
    expect(stretched.picker.note).toMatchObject({ kind: "refused", from: "map", problem: "too_far" });
    expect(stretched.picker.outline).toBe(before.outline);

    expect(update(openPicker(null), typed(policy.tiny.corners)).picker.note).toMatchObject({ problem: "tiny" });
  });

  it("mark at latitude 89: refused pole, still finding", () => {
    const step = last(openPicker(null), pick({ kind: "position", at: [0, 89] }), MARK);
    expect(step.picker.stage).toBe("finding");
    expect(step.picker.note).toMatchObject({ kind: "refused", from: "map", problem: "pole" });
    expect(step.emit).toBeNull();
  });

  it("the next farmer action of any kind clears the refusal; a surface or pictures report keeps it", () => {
    const onGlobe = last(boxed(), { kind: "surface", surface: { kind: "globe", pictures: "loading" } }).picker;
    const [[w, s], , [e, n]] = cornersOf(onGlobe);
    const refused = update(onGlobe, { kind: "move", corner: 2, to: [(w + e) / 2, s - (n - s)] }).picker;
    expect(refused.note?.kind).toBe("refused");

    const farmerActions: Action[] = [
      { kind: "select", corner: 0 },
      { kind: "tap", at: [108.321, -6.327] },
      { kind: "move", corner: 0, to: [w - 0.0001, s] },
      INSERT,
      { kind: "remove", corner: 0 },
      { kind: "resize", step: 1 },
      typed(good.l),
      { kind: "list", open: true },
      AGAIN,
    ];
    for (const action of farmerActions) {
      const step = update(refused, action);
      expect(step.picker, action.kind).not.toBe(refused);
      expect(step.picker.note?.kind ?? null, action.kind).not.toBe("refused");
    }
    expect(update(refused, { kind: "pictures", state: "shown" }).picker.note).toBe(refused.note);
    expect(update(refused, { kind: "surface", surface: { kind: "plan", why: "lost" } }).picker.note).toBe(refused.note);
  });
});

describe("actions that do not apply", () => {
  it("an action that does not apply in the current stage, or changes nothing, returns the same picker", () => {
    const empty = openPicker(null);
    const marking = boxed();
    const drawn = last(marking, INSERT, { kind: "select", corner: null }).picker;
    const listed = last(marking, { kind: "list", open: true }).picker;
    const cases: readonly (readonly [Picker, Action])[] = [
      [marking, pick(chile)],
      [marking, MARK],
      [marking, BACK],
      [empty, AGAIN],
      [empty, BACK],
      [empty, { kind: "resize", step: 1 }],
      [empty, { kind: "select", corner: 1 }],
      [empty, { kind: "move", corner: 1, to: [0, 0] }],
      [empty, INSERT],
      [empty, { kind: "remove", corner: 1 }],
      [empty, { kind: "pictures", state: "shown" }],
      [drawn, { kind: "resize", step: 1 }],
      [drawn, { kind: "tap", at: [0.5, 0.5] }],
      [drawn, { kind: "select", corner: null }],
      [drawn, { kind: "move", corner: 9, to: [0, 0] }],
      [drawn, { kind: "remove", corner: -1 }],
      [listed, { kind: "list", open: true }],
      [empty, { kind: "surface", surface: { kind: "starting" } }],
    ];
    for (const [picker, action] of cases) {
      expect(update(picker, action), `${picker.stage} ${action.kind}`).toEqual({ picker, emit: null, focus: null });
      expect(update(picker, action).picker).toBe(picker);
    }
    const chosen = update(marking, { kind: "select", corner: 2 }).picker;
    expect(update(chosen, { kind: "select", corner: 2 }).picker).toBe(chosen);
  });

  it("choosing a corner that does not exist chooses none", () => {
    const chosen = update(boxed(), { kind: "select", corner: 1 }).picker;
    for (const corner of [4, -1, 1.5, Number.NaN]) {
      const step = update(chosen, { kind: "select", corner });
      expect(step.picker.stage === "marking" && step.picker.selected, String(corner)).toBeNull();
    }
  });
});

describe("P2 only the farmer's accepted edits emit", () => {
  it("[R8] mark, a tap on a box, resize, move, insert, remove and typed each emit fieldOf(outline), and fieldIssues of it is empty", async () => {
    const found = last(openPicker(null), pick(indramayu)).picker;
    const marked = update(found, MARK);
    await expectAcceptedEmit(marked);
    const tapped = update(marked.picker, { kind: "tap", at: [108.323, -6.326] });
    await expectAcceptedEmit(tapped);
    const resized = update(tapped.picker, { kind: "resize", step: 1 });
    await expectAcceptedEmit(resized);
    const [[w, s]] = cornersOf(resized.picker);
    const moved = update(resized.picker, { kind: "move", corner: 0, to: [w - 0.0003, s - 0.0002] });
    await expectAcceptedEmit(moved);
    const inserted = update(moved.picker, INSERT);
    await expectAcceptedEmit(inserted);
    const removed = update(inserted.picker, { kind: "remove", corner: 1 });
    await expectAcceptedEmit(removed);
    const retyped = update(removed.picker, typed(good.c));
    await expectAcceptedEmit(retyped);
  });

  it("adopt, pick, a tap while finding, select, list, surface, pictures, again and back emit null", () => {
    const silent: Action[] = [
      adopt(null),
      pick(indramayu),
      { kind: "tap", at: [108.33, -6.33] },
      { kind: "list", open: true },
      { kind: "list", open: false },
      { kind: "surface", surface: { kind: "globe", pictures: "loading" } },
      { kind: "pictures", state: "shown" },
    ];
    const finding = play(openPicker(null), silent);
    finding.forEach((step, i) => expect(step.emit, silent[i].kind).toBeNull());
    const marking = play(boxed(), [{ kind: "select", corner: 1 }, AGAIN, BACK, { kind: "pictures", state: "failed" }]);
    marking.forEach(step => expect(step.emit).toBeNull());
    expect(update(openPicker(null), adopt(inputFixture.field)).emit).toBeNull();
    expect(update(boxed(), adopt(inputFixture.field)).emit).toBeNull();
  });

  it("[R8] a refused edit emits null", () => {
    const box = boxed();
    const [[w, s], , [e, n]] = cornersOf(box);
    const refusals: Action[] = [
      { kind: "move", corner: 2, to: [(w + e) / 2, s - (n - s)] },
      { kind: "move", corner: 2, to: [e, n + 0.2] },
      typed(bad.bowTie.corners),
      typed(bad.repeated.corners),
      typed(bad.pole.corners),
      typed(policy.two.corners),
    ];
    for (const action of refusals) {
      const step = update(box, action);
      expect(step.picker.note?.kind, action.kind).toBe("refused");
      expect(step.emit).toBeNull();
      expect(step.picker.outline).toBe(box.outline);
    }
  });

  it("typed corners equal to the field already held emit null (no duplicate onChange)", () => {
    const first = update(openPicker(null), typed(good.u));
    expect(first.emit).not.toBeNull();
    const again = update(first.picker, typed(good.u));
    expect(again.emit).toBeNull();
    const rows = cornersOfRows(rowsOfPoints(ringOf(first.emit as Field)));
    if (!rows.ok) throw new Error("the held field's rows should parse");
    expect(update(first.picker, { kind: "typed", corners: rows.corners }).emit).toBeNull();
  });

  it("[R12] typed(the U) emits a field whose lookup is strictly inside (support strictlyInside)", async () => {
    for (const shape of [good.u, good.c, good.l, good.thinArm]) {
      await expectAcceptedEmit(update(openPicker(null), typed(shape)));
    }
  });

  it("[R11] typed(fiji) emits ring longitudes in [-180, 180] and a lookup the parser accepts", async () => {
    for (const shape of [good.fiji, good.fijiClockwise]) {
      const step = update(openPicker(null), typed(shape));
      await expectAcceptedEmit(step);
      const field = step.emit as Field;
      for (const [lng] of [...field.ring, field.lookup]) {
        expect(lng).toBeGreaterThanOrEqual(-180);
        expect(lng).toBeLessThanOrEqual(180);
      }
      expect(field.ring.at(-1)).toBe(field.ring[0]);
    }
  });
});

describe("P3 adopt", () => {
  it("[R23] adopt(field) while finding with nothing marked: marking that field, made saved, emit null", () => {
    const step = update(openPicker(null), adopt(inputFixture.field));
    expect(outlineOf(step.picker).made).toEqual({ kind: "saved" });
    expect(fieldOf(outlineOf(step.picker))).toEqual(inputFixture.field);
    expect(step.emit).toBeNull();
  });

  it("[R23] adopt of the field just emitted returns the same picker object (no echo)", () => {
    const marked = update(last(openPicker(null), pick(indramayu)).picker, MARK);
    const echo = update(marked.picker, adopt(marked.emit));
    expect(echo.picker).toBe(marked.picker);
    expect(echo.emit).toBeNull();
    expect(echo.focus).toBeNull();
    const opened = openPicker(inputFixture.field);
    expect(update(opened, adopt(inputFixture.field)).picker).toBe(opened);
    const empty = openPicker(null);
    expect(update(empty, adopt(null)).picker).toBe(empty);
  });

  it("adopt of an equal field in a new object (a JSON round trip) returns the same picker object", () => {
    const marked = update(update(openPicker(null), typed(good.fiji)).picker, { kind: "resize", step: 1 });
    const copy = JSON.parse(JSON.stringify(fieldOf(outlineOf(marked.picker)))) as Field;
    expect(update(marked.picker, adopt(copy)).picker).toBe(marked.picker);
  });

  it("adopt(null) while marking: finding, nothing marked, emit null", () => {
    const step = update(boxed(), adopt(null));
    expect(step.picker).toMatchObject({ stage: "finding", outline: null, candidate: null });
    expect(step.picker.look.at).toBe("world");
    expect(step.emit).toBeNull();
  });

  it("adopt of a different field replaces the outline, keeps surface and listOpen, and moves the look to the field", () => {
    const before = last(boxed(), { kind: "surface", surface: { kind: "globe", pictures: "shown" } }, { kind: "list", open: true }).picker;
    const step = update(before, adopt(inputFixture.field));
    expect(fieldOf(outlineOf(step.picker))).toEqual(inputFixture.field);
    expect(step.picker.surface).toBe(before.surface);
    expect(step.picker.listOpen).toBe(true);
    expect(step.picker.look).toEqual({ seq: before.look.seq + 1, at: "field" });
    expect(step.emit).toBeNull();
  });
});

describe("P4 the held field survives Search again", () => {
  it("again from a box: finding, the same Outline object, candidate null, emit null", () => {
    const box = boxed();
    const step = update(box, AGAIN);
    expect(step.picker).toMatchObject({ stage: "finding", candidate: null });
    expect(step.picker.outline).toBe(box.outline);
    expect(step.emit).toBeNull();
  });

  it("noticesOf after again holds still_marked with the outline's label", () => {
    const box = boxed();
    const finding = update(box, AGAIN).picker;
    expect(noticesOf(finding, true)).toEqual([{ kind: "still_marked", label: "Field near Indramayu, West Java, Indonesia" }]);
    expect(noticesOf(box, true)).toEqual([]);
  });

  it("back returns to marking with that same Outline object, so Smaller and Bigger still work on it, and emits null", () => {
    const box = boxed();
    const back = last(box, AGAIN, pick(chile), BACK);
    expect(back.picker.outline).toBe(box.outline);
    expect(back.emit).toBeNull();
    expect(phaseOf(back.picker)).toBe("box");
    const bigger = update(back.picker, { kind: "resize", step: 1 });
    expect(outlineOf(bigger.picker).made).toMatchObject({ kind: "box", hectares: 2 });
    expect(bigger.emit).not.toBeNull();
  });

  it("pick then mark replaces it: one emit, with a box at the new place", () => {
    const steps = play(boxed(), [AGAIN, pick(chile), MARK]);
    expect(steps.filter(step => step.emit !== null)).toHaveLength(1);
    const emitted = steps[2].emit as Field;
    expect(emitted.lookup).toEqual([-70.6, -33.4]);
    expect(strictlyInside(chile.at, ringOf(emitted))).toBe(true);
  });

  it("pick alone does not change the outline: the parent keeps the old field until Mark my field", () => {
    const box = boxed();
    const step = last(box, AGAIN, pick(chile));
    expect(step.picker.outline).toBe(box.outline);
    expect(step.emit).toBeNull();
    expect(noticesOf(step.picker, true)).toContainEqual({ kind: "still_marked", label: outlineOf(box).label });
  });
});

describe("finding to marking", () => {
  it("[R1] pick { position at [-70.6, -33.4] } then mark: a 1 ha box around that point, label 'Field at 33.40° S, 70.60° W'", () => {
    const step = last(openPicker(null), pick(chile), MARK);
    const outline = outlineOf(step.picker);
    expect(outline.marked.lookup).toEqual([-70.6, -33.4]);
    expect(outline.label).toBe("Field at 33.40° S, 70.60° W");
    expect(outline.made).toEqual({ kind: "box", hectares: 1, on: "place" });
    expect(within(outline.marked.areaM2, 10_000, 0.03)).toBe(true);
  });

  it("mark with a found place: label 'Field near Indramayu, West Java, Indonesia', made box on place, focus heading", () => {
    const step = last(openPicker(null), pick(indramayu), MARK);
    const outline = outlineOf(step.picker);
    expect(outline.label).toBe("Field near Indramayu, West Java, Indonesia");
    expect(outline.made).toEqual({ kind: "box", hectares: 1, on: "place" });
    expect(outline.place).toBe(indramayu);
    expect(outline.marked.lookup).toEqual(indramayu.at);
    expect(step.focus).toBe("heading");
  });

  it("[R3] a tap while finding sets a tapped candidate; mark then puts the box on it", () => {
    const tapped = update(openPicker(null), { kind: "tap", at: [36.07, -0.3] });
    expect(tapped.picker.stage === "finding" && tapped.picker.candidate).toEqual({ kind: "tapped", at: [36.07, -0.3] });
    expect(sceneOf(tapped.picker).pin).toEqual([36.07, -0.3]);
    const marked = update(tapped.picker, MARK);
    expect(outlineOf(marked.picker).marked.lookup).toEqual([36.07, -0.3]);
  });

  it("a GPS place (pick then mark): the box's lookup is the fix itself", () => {
    const fix: Place = { kind: "gps", at: [108.28137, -6.40213], accuracyM: 9.6 };
    const step = last(openPicker(null), pick(fix), MARK);
    expect(step.emit?.lookup).toEqual([108.28137, -6.40213]);
    expect(outlineOf(step.picker).place).toBe(fix);
  });

  it("mark with no candidate changes nothing", () => {
    const empty = openPicker(null);
    const step = update(empty, MARK);
    expect(step).toEqual({ picker: empty, emit: null, focus: null });
    expect(step.picker).toBe(empty);
    const held = update(boxed(), AGAIN).picker;
    expect(update(held, MARK).picker).toBe(held);
  });
});

describe("the box and the corners", () => {
  it("a tap while marking a box moves the box to the tap, keeps its size and place, sets made.on tap, and emits", () => {
    const box = last(boxed(), { kind: "resize", step: 1 }).picker;
    const step = update(box, { kind: "tap", at: [108.33, -6.32] });
    const outline = outlineOf(step.picker);
    expect(outline.marked.lookup).toEqual([108.33, -6.32]);
    expect(outline.made).toEqual({ kind: "box", hectares: 2, on: "tap" });
    expect(outline.place).toBe(indramayu);
    expect(step.emit).toEqual(fieldOf(outline));
  });

  it("a tap that moves the box more than 30 km from a found place names the field by its coordinates", () => {
    const near = update(boxed(), { kind: "tap", at: [108.4, -6.3] });
    expect(outlineOf(near.picker).label).toBe("Field near Indramayu, West Java, Indonesia");
    const far = update(boxed(), { kind: "tap", at: [108.7, -6.3] });
    expect(outlineOf(far.picker).label).toBe("Field at 6.30° S, 108.70° E");
    expect(far.emit?.label).toBe("Field at 6.30° S, 108.70° E");
  });

  it("typed corners near the chosen place are named after it, also when it is a place from before", () => {
    const fromFinding = last(openPicker(null), pick(indramayu), typed(rowsAround([108.33, -6.33])));
    expect(outlineOf(fromFinding.picker).label).toBe("Field near Indramayu, West Java, Indonesia");
    expect(outlineOf(fromFinding.picker).place).toBe(indramayu);
    const fromBox = update(boxed(), typed(rowsAround([108.34, -6.34])));
    expect(outlineOf(fromBox.picker).label).toBe("Field near Indramayu, West Java, Indonesia");
    const fromSaved = update(openPicker(inputFixture.field), typed(rowsAround([100.004, 15.004])));
    expect(outlineOf(fromSaved.picker).label).toBe(inputFixture.field.label);
    const held = last(boxed(), AGAIN, typed(rowsAround([108.33, -6.33])));
    expect(outlineOf(held.picker).label).toBe("Field near Indramayu, West Java, Indonesia");
  });

  it("the chosen corner stays chosen through a drag and a resize, and remove clears it, so Add a corner never reads a corner that is gone", () => {
    const box = last(boxed(), { kind: "select", corner: 3 }).picker;
    const resized = update(box, { kind: "resize", step: 1 }).picker;
    expect(resized.stage === "marking" && resized.selected).toBe(3);
    const [[w, s]] = cornersOf(resized);
    const dragged = update(resized, { kind: "move", corner: 0, to: [w - 0.0003, s] }).picker;
    expect(dragged.stage === "marking" && dragged.selected).toBe(3);
    const removed = update(dragged, { kind: "remove", corner: 0 }).picker;
    expect(removed.stage === "marking" && removed.selected).toBeNull();
    const added = update(removed, INSERT);
    expect(cornersOf(added.picker)).toHaveLength(4);
    expect(cornersOf(added.picker).flat().every(Number.isFinite)).toBe(true);
    const lastChosen = last(boxed(), INSERT, { kind: "select", corner: 4 }, { kind: "remove", corner: 0 }, INSERT);
    expect(cornersOf(lastChosen.picker)).toHaveLength(5);
    expect(cornersOf(lastChosen.picker).flat().every(Number.isFinite)).toBe(true);
  });

  it("a tap while marking drawn, typed or saved corners only clears the selection", () => {
    const box = boxed();
    const [[w, s]] = cornersOf(box);
    const pickers = [
      last(box, { kind: "move", corner: 0, to: [w - 0.0002, s] }).picker,
      last(openPicker(null), typed(good.u)).picker,
      openPicker(inputFixture.field),
    ];
    for (const picker of pickers) {
      const selected = update(picker, { kind: "select", corner: 1 }).picker;
      expect(selected.stage === "marking" && selected.selected).toBe(1);
      const step = update(selected, { kind: "tap", at: [0.5, 0.5] });
      expect(step.picker.stage === "marking" && step.picker.selected).toBeNull();
      expect(step.picker.outline).toBe(picker.outline);
      expect(step.emit).toBeNull();
    }
  });

  it("resize(+1) from 1 ha gives 2 ha around the same lookup; at 50 ha it sets note size_end(+1) and emits null", () => {
    const box = boxed();
    const bigger = update(box, { kind: "resize", step: 1 });
    expect(outlineOf(bigger.picker).made).toMatchObject({ hectares: 2 });
    expect(outlineOf(bigger.picker).marked.lookup).toEqual(outlineOf(box).marked.lookup);
    expect(within(outlineOf(bigger.picker).marked.areaM2, 2 * outlineOf(box).marked.areaM2, 0.001)).toBe(true);

    const largest = play(box, Array.from({ length: 6 }, () => ({ kind: "resize", step: 1 }) as const)).at(-1) as Step;
    expect(outlineOf(largest.picker).made).toMatchObject({ hectares: 50 });
    const end = update(largest.picker, { kind: "resize", step: 1 });
    expect(end.picker.note).toEqual({ kind: "size_end", step: 1 });
    expect(end.picker.outline).toBe(largest.picker.outline);
    expect(end.emit).toBeNull();

    const smallest = play(box, Array.from({ length: 3 }, () => ({ kind: "resize", step: -1 }) as const)).at(-1) as Step;
    expect(outlineOf(smallest.picker).made).toMatchObject({ hectares: 0.1 });
    expect(update(smallest.picker, { kind: "resize", step: -1 }).picker.note).toEqual({ kind: "size_end", step: -1 });
  });

  it("move, insert and remove turn made into drawn; phaseOf goes from box to corners", () => {
    const box = boxed();
    expect(phaseOf(box)).toBe("box");
    const [[w, s]] = cornersOf(box);
    for (const action of [{ kind: "move", corner: 0, to: [w - 0.0002, s] }, INSERT, { kind: "remove", corner: 3 }] as Action[]) {
      const step = update(box, action);
      expect(outlineOf(step.picker).made, action.kind).toEqual({ kind: "drawn" });
      expect(phaseOf(step.picker)).toBe("corners");
      expect(sceneOf(step.picker).boxFollowsTap).toBe(false);
    }
    expect(update(box, { kind: "resize", step: 1 }).picker.outline?.made.kind).toBe("box");
  });

  it("insert with corner 2 selected adds corner 3 and selects it; with none selected it splits the longest side", () => {
    const box = boxed();
    const before = cornersOf(box);
    const chosen = last(box, { kind: "select", corner: 1 }, INSERT).picker;
    const after = cornersOf(chosen);
    expect(after).toHaveLength(5);
    expect(chosen.stage === "marking" && chosen.selected).toBe(2);
    expect(after[2][0]).toBeCloseTo((before[1][0] + before[2][0]) / 2, 6);
    expect(after[2][1]).toBeCloseTo((before[1][1] + before[2][1]) / 2, 6);

    const trapezoid = last(openPicker(null), typed([[0, 0], [0.004, 0], [0.003, 0.001], [0.001, 0.001]])).picker;
    const split = update(trapezoid, INSERT).picker;
    expect(split.stage === "marking" && split.selected).toBe(1);
    expect(cornersOf(split)[1]).toEqual([0.002, 0]);
  });

  it("a single-corner edit and a resize keep the label; a new box and typed corners relabel", () => {
    const box = boxed();
    const label = outlineOf(box).label;
    const [[w, s]] = cornersOf(box);
    const kept = play(box, [{ kind: "resize", step: 1 }, { kind: "move", corner: 0, to: [w - 0.0004, s] }, INSERT, { kind: "remove", corner: 0 }]);
    kept.forEach(step => expect(outlineOf(step.picker).label).toBe(label));

    const retyped = update(box, typed(rowsAround(chile.at)));
    expect(outlineOf(retyped.picker).label).toBe("Field at 33.40° S, 70.60° W");
    const remarked = last(box, AGAIN, pick(chile), MARK);
    expect(outlineOf(remarked.picker).label).toBe("Field at 33.40° S, 70.60° W");
  });

  it("typed with the list open closes it; with the plan surface listShown stays true", () => {
    const open = last(boxed(), { kind: "list", open: true }).picker;
    expect(listShown(open)).toBe(true);
    const closed = update(open, typed(good.l)).picker;
    expect(closed.listOpen).toBe(false);
    expect(listShown(closed)).toBe(false);

    const plan = last(boxed(), { kind: "surface", surface: { kind: "plan", why: "no_webgl" } }).picker;
    expect(listShown(plan)).toBe(true);
    expect(listShown(update(plan, typed(good.l)).picker)).toBe(true);
  });
});

/** A small square around a point, as typed rows would give it. */
function rowsAround([lng, lat]: LngLat): Ring {
  const d = 0.0005;
  return [[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d]];
}

describe("P5 the camera", () => {
  const script: readonly (readonly [Action, "rises" | "stays"])[] = [
    [adopt(inputFixture.field), "rises"],
    [adopt(null), "rises"],
    [pick(indramayu), "rises"],
    [{ kind: "tap", at: [108.33, -6.33] }, "rises"],
    [MARK, "rises"],
    [{ kind: "tap", at: [108.331, -6.331] }, "stays"],
    [{ kind: "resize", step: 1 }, "rises"],
    [{ kind: "list", open: true }, "stays"],
    [{ kind: "surface", surface: { kind: "globe", pictures: "loading" } }, "stays"],
    [{ kind: "pictures", state: "shown" }, "stays"],
    [{ kind: "select", corner: 1 }, "stays"],
    [AGAIN, "stays"],
    [BACK, "rises"],
    [{ kind: "move", corner: 1, to: [108.3325, -6.3315] }, "stays"],
    [INSERT, "stays"],
    [{ kind: "remove", corner: 0 }, "stays"],
    [typed(good.u), "rises"],
  ];

  it("look.seq rises on adopt, pick, a tap while finding, mark, back, resize and typed", () => {
    const steps = play(openPicker(null), script.map(([action]) => action));
    let before = openPicker(null);
    steps.forEach((step, i) => {
      const [action, expected] = script[i];
      expect(step.picker, `${i} ${action.kind}`).not.toBe(before);
      if (expected === "rises") expect(step.picker.look.seq, `${i} ${action.kind}`).toBe(before.look.seq + 1);
      before = step.picker;
    });
  });

  it("look.seq stays on select, move, insert, remove, a tap on a box, list, surface, pictures and again", () => {
    const steps = play(openPicker(null), script.map(([action]) => action));
    let before = openPicker(null);
    steps.forEach((step, i) => {
      const [action, expected] = script[i];
      if (expected === "stays") expect(step.picker.look, `${i} ${action.kind}`).toBe(before.look);
      before = step.picker;
    });
    expect(script.filter(([, expected]) => expected === "stays")).toHaveLength(9);
  });
});

describe("focus", () => {
  it("[R15] finding to marking focuses heading; marking to finding focuses search", () => {
    const [, marked, again, back] = play(openPicker(null), [pick(indramayu), MARK, AGAIN, BACK]);
    expect(marked.focus).toBe("heading");
    expect(again.focus).toBe("search");
    expect(back.focus).toBe("heading");
    expect(update(openPicker(null), typed(good.l)).focus).toBe("heading");
  });

  it("[R15] list(true) focuses list; list(false) focuses list_opener; typed accepted focuses heading; typed refused focuses problem", () => {
    const [opened, closed] = play(boxed(), [{ kind: "list", open: true }, { kind: "list", open: false }]);
    expect(opened.focus).toBe("list");
    expect(closed.focus).toBe("list_opener");
    expect(update(opened.picker, typed(good.u)).focus).toBe("heading");
    expect(update(opened.picker, typed(bad.bowTie.corners)).focus).toBe("problem");
    expect(update(opened.picker, { kind: "list", open: true }).focus).toBeNull();
    expect(update(boxed(), { kind: "resize", step: 1 }).focus).toBeNull();
  });

  it("adopt never moves focus", () => {
    expect(update(openPicker(null), adopt(inputFixture.field)).focus).toBeNull();
    expect(update(boxed(), adopt(null)).focus).toBeNull();
    expect(update(boxed(), adopt(inputFixture.field)).focus).toBeNull();
  });
});

describe("surfaces and notices", () => {
  it("[R14] surface plan no_webgl: noticesOf holds no_globe no_webgl, and listShown is true", () => {
    const plan = update(openPicker(null), { kind: "surface", surface: { kind: "plan", why: "no_webgl" } }).picker;
    expect(noticesOf(plan, true)).toEqual([{ kind: "no_globe", why: "no_webgl" }]);
    expect(listShown(plan)).toBe(true);
    expect(plan.listOpen).toBe(false);
  });

  it("[R14] a globe report after a plan is dropped: the plan stays for the visit", () => {
    const plan = last(openPicker(null), { kind: "surface", surface: { kind: "plan", why: "lost" } }).picker;
    const step = update(plan, { kind: "surface", surface: { kind: "globe", pictures: "loading" } });
    expect(step.picker).toBe(plan);
    expect(update(plan, { kind: "pictures", state: "shown" }).picker).toBe(plan);
    expect(update(plan, { kind: "surface", surface: { kind: "starting" } }).picker.surface).toEqual({ kind: "plan", why: "lost" });
  });

  it("[R16] noticesOf(picker, false) holds no_key; pictures failed holds no_pictures; both orders are stable, no_key first", () => {
    const onGlobe = last(boxed(), { kind: "surface", surface: { kind: "globe", pictures: "loading" } }).picker;
    expect(noticesOf(onGlobe, false)).toEqual([{ kind: "no_key" }]);
    expect(noticesOf(onGlobe, true)).toEqual([]);
    const [[w, s], , [e, n]] = cornersOf(onGlobe);
    const cross: Action = { kind: "move", corner: 2, to: [(w + e) / 2, s - (n - s)] };
    const failed: Action = { kind: "pictures", state: "failed" };
    const first = last(onGlobe, failed, cross).picker;
    const second = last(onGlobe, cross, failed).picker;
    const expected = [{ kind: "no_key" }, { kind: "no_pictures" }, { kind: "refused", problem: "crossing" }];
    expect(noticesOf(first, false)).toEqual(expected);
    expect(noticesOf(second, false)).toEqual(expected);
    expect(noticesOf(update(first, AGAIN).picker, false)).toEqual([
      { kind: "no_key" }, { kind: "no_pictures" }, { kind: "still_marked", label: "Field near Indramayu, West Java, Indonesia" },
    ]);
  });

  it("sceneOf: the pin only while finding with a candidate; handles only while marking; a field still marked stays drawn while finding; boxFollowsTap only for a box", () => {
    expect(sceneOf(openPicker(null))).toMatchObject({ pin: null, outline: null, handles: false, selected: null, boxFollowsTap: false });
    const found = last(openPicker(null), pick(indramayu)).picker;
    expect(sceneOf(found)).toMatchObject({ pin: indramayu.at, outline: null, handles: false });
    const box = update(found, MARK).picker;
    expect(sceneOf(box)).toMatchObject({ pin: null, outline: outlineOf(box).marked, handles: true, boxFollowsTap: true, look: box.look });
    expect(sceneOf(update(box, { kind: "select", corner: 2 }).picker).selected).toBe(2);
    const again = update(box, AGAIN).picker;
    expect(sceneOf(again)).toMatchObject({ pin: null, outline: outlineOf(box).marked, handles: false, boxFollowsTap: false, look: box.look });
    expect(sceneOf(last(again, pick(indramayu)).picker)).toMatchObject({ pin: indramayu.at, outline: outlineOf(box).marked, handles: false });
    expect(sceneOf(openPicker(inputFixture.field)).boxFollowsTap).toBe(false);
  });

  it("phaseOf: finding, box, corners", () => {
    expect(phaseOf(openPicker(null))).toBe("finding");
    expect(phaseOf(boxed())).toBe("box");
    expect(phaseOf(openPicker(inputFixture.field))).toBe("corners");
    expect(phaseOf(update(openPicker(null), typed(good.l)).picker)).toBe("corners");
  });
});

describe("P6 no action reads the key, a URL or the map", () => {
  it("the same actions give the same steps with and without a key, and nothing calls fetch", () => {
    const fetch = vi.fn(() => Promise.reject(new Error("no network in the picker")));
    vi.stubGlobal("fetch", fetch);
    const actions: Action[] = [pick(indramayu), MARK, { kind: "resize", step: 1 }, AGAIN, pick(chile), MARK, typed(good.fiji), { kind: "list", open: true }];
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "pw-dummy-key");
    const keyed = play(openPicker(null), actions);
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "");
    const keyless = play(openPicker(null), actions);
    expect(keyless).toEqual(keyed);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("the parent's view over seeded random runs", () => {
  /** One random farmer action that fits what is on screen, often one that must be refused. */
  function randomAction(picker: Picker, random: () => number, home: LngLat): Action {
    const near = (at: LngLat, degrees: number): LngLat => [at[0] + (random() - 0.5) * degrees, at[1] + (random() - 0.5) * degrees];
    const corners = picker.stage === "marking" ? picker.outline.marked.corners : null;
    const size = corners ? Math.max(...corners.map(([lng]) => lng)) - Math.min(...corners.map(([lng]) => lng)) : 0.001;
    const somewhere = () => (random() < 0.9 ? near(home, 0.05) : ([home[0], 88 + random()] as const));
    const shapes: Ring[] = [good.u, good.fiji, good.thinArm, bad.bowTie.corners, policy.tooFar.corners, randomPolygon(random), rowsAround(near(home, 0.05))];
    const index = (count: number) => Math.floor(random() * (count + 1)) - (random() < 0.1 ? 1 : 0);
    const choices: (() => Action)[] = [
      () => {
        const at = somewhere();
        const places: Place[] = [{ ...indramayu, at }, { kind: "position", at }, { kind: "gps", at, accuracyM: 12 }];
        return pick(places[Math.floor(random() * places.length)]);
      },
      () => ({ kind: "tap", at: corners ? near(corners[0], size * 3) : somewhere() }),
      () => MARK,
      () => BACK,
      () => AGAIN,
      () => ({ kind: "resize", step: random() < 0.5 ? -1 : 1 }),
      () => ({ kind: "select", corner: random() < 0.2 ? null : index(corners?.length ?? 4) }),
      () => {
        const corner = index(corners?.length ?? 4);
        const from = corners?.[Math.max(0, Math.min(corner, corners.length - 1))] ?? home;
        return { kind: "move", corner, to: near(from, size * (random() < 0.8 ? 1.5 : 400)) };
      },
      () => INSERT,
      () => ({ kind: "remove", corner: index(corners?.length ?? 4) }),
      () => typed(shapes[Math.floor(random() * shapes.length)]),
      () => ({ kind: "list", open: random() < 0.5 }),
      () => ({ kind: "surface", surface: random() < 0.8 ? { kind: "globe", pictures: "loading" } : { kind: "plan", why: "lost" } }),
      () => ({ kind: "pictures", state: random() < 0.5 ? "shown" : "failed" }),
    ];
    return choices[Math.floor(random() * choices.length)]();
  }

  it("[R8][R23] the parent always holds the field on screen, gets each change once, every emit passes the parser, the server and the inside test, and handing it back changes nothing", async () => {
    const homes: readonly LngLat[] = [[108.32, -6.33], [179.995, -16.8], [-68.3, -54.8]];
    const emitted: Field[] = [];
    let refusals = 0;
    for (const [run, home] of homes.entries()) {
      const random = randomSource(run + 11);
      const start = run === 1 ? null : inputFixture.field;
      let picker = openPicker(start);
      let parent: Field | null = start;
      for (let i = 0; i < 400; i++) {
        const action = randomAction(picker, random, home);
        const step = update(picker, action);
        if (step.picker.note !== picker.note && step.picker.note?.kind === "refused") {
          refusals += 1;
          expect(step.picker.outline).toBe(picker.outline);
        }
        if (step.emit) {
          expect(JSON.stringify(step.emit)).not.toBe(JSON.stringify(parent));
          expect(fieldIssues(step.emit)).toEqual([]);
          expect(strictlyInside(step.emit.lookup, ringOf(step.emit))).toBe(true);
          parent = step.emit;
          emitted.push(step.emit);
          const echo = update(step.picker, adopt(JSON.parse(JSON.stringify(step.emit)) as Field));
          expect(echo.picker).toBe(step.picker);
          expect(echo.emit).toBeNull();
        }
        if (step.picker.outline) expect(fieldOf(step.picker.outline)).toEqual(parent);
        if (step.picker.stage === "marking") expect(fieldIssues(fieldOf(step.picker.outline))).toEqual([]);
        picker = step.picker;
      }
    }
    expect(emitted.length).toBeGreaterThan(100);
    expect(refusals).toBeGreaterThan(50);
    const statuses = await Promise.all(emitted.map(field => serverStatus(field)));
    expect(statuses.filter(status => status !== 202)).toEqual([]);
  });
});
