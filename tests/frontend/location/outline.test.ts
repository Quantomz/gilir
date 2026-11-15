// The outline's rules, judged by the contract's parser, an independent strict-inside test and Turf's own area, never
// by F2's own code. Requirement ids in brackets are the F2 requirement rows.
import { describe, expect, it } from "vitest";
import area from "@turf/area";
import type { LngLat } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import {
  boxAround, cornersFrom, cornersOfRing, insertCorner, markOutline, markSaved, moveCorner, planOf, removeCorner, round6,
  sameField, stepSize, withinPolicy, wrapLng,
} from "@/features/location/outline";
import type { Field, Marked, MarkResult } from "@/features/location/outline";
import { bad, circle, fieldIssues, good, policy, randomPolygon, randomSource, strictlyInside } from "./support/shapes";

type Ring = readonly LngLat[];

const choose = { kind: "choose" } as const;

function mark(points: Ring): Marked {
  const result = markOutline(cornersFrom(points), choose);
  if (!result.ok) throw new Error(`expected a field, got ${result.problem}`);
  return result.marked;
}

const problemOf = (result: MarkResult) => (result.ok ? "ok" : result.problem);
const fieldOf = (marked: Marked, label = "Field near Labasa"): Field => ({ ring: marked.ring, lookup: marked.lookup, label });
const rotate = <T>(list: readonly T[], by: number) => [...list.slice(by), ...list.slice(0, by)];

/** Great-circle metres, independent of F2's flat approximation. */
function haversine(a: LngLat, b: LngLat): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((b[1] - a[1]) * rad) / 2) ** 2
    + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(((b[0] - a[0]) * rad) / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.sqrt(h));
}

const turfArea = (corners: Ring) => area({ type: "Polygon", coordinates: [[...corners, corners[0]].map(([x, y]) => [x, y])] });
const within = (value: number, expected: number, fraction: number) => Math.abs(value - expected) <= Math.abs(expected) * fraction;

describe("drawing space and wire space", () => {
  it("[R11] wrapLng keeps -180 and 180 as they are and wraps 180.01 to -179.99, -180.5 to 179.5 and 540 to 180 or -180", () => {
    expect(wrapLng(-180)).toBe(-180);
    expect(wrapLng(180)).toBe(180);
    expect(wrapLng(180.01)).toBeCloseTo(-179.99, 9);
    expect(wrapLng(-180.5)).toBeCloseTo(179.5, 9);
    expect([180, -180]).toContain(wrapLng(540));
  });

  it("[R11] round6 turns MapLibre's 180.00000000000182 into 180, and round6(wrapLng(x)) is in [-180, 180] for any x", () => {
    expect(round6(180.00000000000182)).toBe(180);
    const random = randomSource(3);
    const xs = [179.9999996, 180.0000004, -180.0000004, -179.9999996, 359.9999996, 540, -540, 1e9 + 0.3, -1e9 - 0.3];
    for (let i = 0; i < 1000; i++) xs.push((random() - 0.5) * 4000);
    for (const x of xs) {
      const wire = round6(wrapLng(x));
      expect(wire).toBeGreaterThanOrEqual(-180);
      expect(wire).toBeLessThanOrEqual(180);
    }
  });

  it("[R11] cornersFrom(fiji) reads 179.99, 180.01, 180.01, 179.99: every corner within 180° of the one before", () => {
    const corners = cornersFrom(good.fiji);
    expect(corners.map(([lng]) => lng)).toEqual([179.99, 180.01, 180.01, 179.99]);
    expect(corners.map(([, lat]) => lat)).toEqual(good.fiji.map(([, lat]) => lat));
    corners.forEach(([lng], i) => {
      if (i > 0) expect(Math.abs(lng - corners[i - 1][0])).toBeLessThanOrEqual(180);
    });
  });

  it("[R11] cornersFrom gives the same shape whichever side of 180° the list starts on, up to a whole turn", () => {
    const reference = cornersFrom(good.fiji);
    for (let start = 1; start < good.fiji.length; start++) {
      const corners = cornersFrom(rotate(good.fiji, start));
      const expected = rotate(reference, start);
      const turn = Math.round((corners[0][0] - expected[0][0]) / 360) * 360;
      expect(Math.abs(turn) % 360).toBe(0);
      expect(corners[0][0]).toBeGreaterThanOrEqual(-180);
      expect(corners[0][0]).toBeLessThanOrEqual(180);
      corners.forEach(([lng, lat], i) => {
        expect(lng - turn).toBeCloseTo(expected[i][0], 9);
        expect(lat).toBe(expected[i][1]);
      });
    }
  });

  it("[R23] cornersOfRing drops the closing point, and cornersOfRing(markOutline(x).ring) equals cornersFrom(x) for every good shape", () => {
    expect(cornersOfRing(inputFixture.field.ring)).toEqual(good.square);
    for (const points of Object.values(good)) {
      expect(cornersOfRing(mark(points).ring)).toEqual(cornersFrom(points));
    }
  });

  it("boxAround(at, 1) is about 10,000 m² and 100 m a side, counter-clockwise from the south-west, with `at` in its middle", () => {
    const at: LngLat = [108.32, -6.326];
    const box = boxAround(at, 1);
    expect(box).toHaveLength(4);
    expect(within(turfArea(box), 10_000, 0.01)).toBe(true);
    box.forEach((corner, i) => expect(within(haversine(corner, box[(i + 1) % 4]), 100, 0.01)).toBe(true));
    const [southWest, southEast, northEast, northWest] = box;
    expect(southWest[0]).toBeLessThan(at[0]);
    expect(southWest[1]).toBeLessThan(at[1]);
    expect(southEast[0]).toBeGreaterThan(at[0]);
    expect(southEast[1]).toBe(southWest[1]);
    expect(northEast[0]).toBe(southEast[0]);
    expect(northEast[1]).toBeGreaterThan(at[1]);
    expect(northWest[0]).toBe(southWest[0]);
    const middle = [box.reduce((sum, [x]) => sum + x, 0) / 4, box.reduce((sum, [, y]) => sum + y, 0) / 4];
    expect(middle[0]).toBeCloseTo(at[0], 6);
    expect(middle[1]).toBeCloseTo(at[1], 6);
  });

  it("[R11] boxAround([179.9998, -16.8], 1) and boxAround([-179.9998, -16.8], 1) straddle 180° and mark", () => {
    for (const at of [[179.9998, -16.8], [-179.9998, -16.8]] as LngLat[]) {
      const box = boxAround(at, 1);
      const turned = box.map(([lng]) => lng + 360 * Math.round((180 - lng) / 360));
      expect(Math.min(...turned)).toBeLessThan(180);
      expect(Math.max(...turned)).toBeGreaterThan(180);
      expect(within(turfArea(box), 10_000, 0.01)).toBe(true);
      const result = markOutline(box, { kind: "keep", at });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.marked.ring.some(([lng]) => lng < 0)).toBe(true);
      expect(result.marked.ring.some(([lng]) => lng > 0)).toBe(true);
      expect(fieldIssues(fieldOf(result.marked))).toEqual([]);
    }
  });
});

describe("markOutline accepts", () => {
  it("[R8] every good shape: the ring is closed with the identical first tuple, every longitude is in [-180, 180], and fieldIssues of the field is empty", () => {
    for (const points of Object.values(good)) {
      const marked = mark(points);
      expect(marked.ring).toHaveLength(points.length + 1);
      expect(marked.ring.at(-1)).toBe(marked.ring[0]);
      for (const [lng] of [...marked.ring, marked.lookup]) {
        expect(lng).toBeGreaterThanOrEqual(-180);
        expect(lng).toBeLessThanOrEqual(180);
      }
      expect(fieldIssues(fieldOf(marked))).toEqual([]);
    }
  });

  it("[R8][R12] the lookup is STRICTLY inside for the square, L, U, C and thin arm (support strictlyInside), and it is no corner", () => {
    for (const points of [good.square, good.l, good.u, good.c, good.thinArm]) {
      const { lookup } = mark(points);
      expect(strictlyInside(lookup, points)).toBe(true);
      expect(points.some(([lng, lat]) => lng === lookup[0] && lat === lookup[1])).toBe(false);
    }
  });

  it("[R12] for the U and the C the centroid is outside, so the lookup comes from a latitude band and lies inside the field", () => {
    for (const points of [good.u, good.c]) {
      let twice = 0, x = 0, y = 0;
      points.forEach(([px, py], i) => {
        const [qx, qy] = points[(i + 1) % points.length];
        const f = px * qy - qx * py;
        twice += f; x += (px + qx) * f; y += (py + qy) * f;
      });
      expect(strictlyInside([x / (3 * twice), y / (3 * twice)], points)).toBe(false);
      expect(strictlyInside(mark(points).lookup, points)).toBe(true);
    }
  });

  it("[R12] the thin L arm, about 2 m wide, still gets a strictly inside lookup after rounding to 6 decimals", () => {
    const { lookup } = mark(good.thinArm);
    expect(lookup.map(value => round6(value))).toEqual([...lookup]);
    expect(strictlyInside(lookup, good.thinArm)).toBe(true);
  });

  it("[R11] for fiji and fijiClockwise the lookup's longitude is within 0.01° of ±180, never near 0 (the far side of the planet)", () => {
    for (const points of [good.fiji, good.fijiClockwise]) {
      const { lookup } = mark(points);
      expect(Math.abs(Math.abs(lookup[0]) - 180)).toBeLessThanOrEqual(0.01);
      expect(strictlyInside(lookup, points)).toBe(true);
    }
  });

  it("[R11][R10] fiji's areaM2 is about 2.37 km² (within 2%), not 42,611 km²; the square's is about 119 ha", () => {
    for (const points of [good.fiji, good.fijiClockwise]) expect(within(mark(points).areaM2, 2_370_000, 0.02)).toBe(true);
    expect(within(mark(good.square).areaM2, 1_190_000, 0.01)).toBe(true);
  });

  it("[R7] circle(256) marks with a 257-point ring; circle(257) is too_many", () => {
    const marked = mark(circle(256));
    expect(marked.ring).toHaveLength(257);
    expect(fieldIssues(fieldOf(marked))).toEqual([]);
    expect(problemOf(markOutline(cornersFrom(circle(257)), choose))).toBe("too_many");
  });

  it("[R1] the far-south and far-north shapes mark", () => {
    for (const points of [good.south, good.north]) {
      const marked = mark(points);
      expect(strictlyInside(marked.lookup, points)).toBe(true);
      expect(fieldIssues(fieldOf(marked))).toEqual([]);
    }
  });

  it("keep: a box around [108.32, -6.326] has exactly [108.32, -6.326] as its lookup, also astride 180°; a keep point on a side or outside is replaced by a chosen one", () => {
    const places: LngLat[] = [[108.32, -6.326], [179.9998, -16.8], [-179.9998, -16.8], [180, -16.8], [-180, -16.8], [-21.945, 64.1425]];
    for (const at of places) {
      for (const hectares of [0.1, 1, 50] as const) {
        const box = markOutline(boxAround(at, hectares), { kind: "keep", at });
        expect(box.ok && box.marked.lookup).toEqual(at);
        if (box.ok) expect(fieldIssues(fieldOf(box.marked))).toEqual([]);
      }
    }
    const corners = cornersFrom(good.square);
    for (const keep of [[100.005, 15], [101, 16]] as LngLat[]) {
      const result = markOutline(corners, { kind: "keep", at: keep });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.marked.lookup).not.toEqual(keep);
      expect(strictlyInside(result.marked.lookup, good.square)).toBe(true);
    }
  });
});

describe("markOutline refuses", () => {
  it("[R24] each bad shape with its named problem: bow-tie and spike crossing, repeated, pole, half-world too_far", () => {
    for (const { corners, problem } of Object.values(bad)) {
      expect(problemOf(markOutline(cornersFrom(corners), choose))).toBe(problem);
    }
  });

  it("[R7] two corners are too_few", () => {
    expect(problemOf(markOutline(cornersFrom(policy.two.corners), choose))).toBe("too_few");
  });

  it("three corners in a line are refused (crossing or no_inside), never marked", () => {
    for (const line of [[[0, 0], [0.01, 0], [0.02, 0]], [[0, 0], [0.01, 0.01], [0.02, 0.02]], [[0.02, 0], [0, 0], [0.01, 0]]] as LngLat[][]) {
      expect(["crossing", "no_inside"]).toContain(problemOf(markOutline(cornersFrom(line), choose)));
    }
  });

  it("the refusal names the corner for pole and repeated, and null otherwise", () => {
    const pole = markOutline(cornersFrom([[0, 80], [0.01, 80], [0.01, 86], [0, 84]]), choose);
    expect(!pole.ok && [pole.problem, pole.corner]).toEqual(["pole", 2]);
    const repeated = markOutline(cornersFrom(bad.repeated.corners), choose);
    expect(!repeated.ok && repeated.problem).toBe("repeated");
    expect([1, 2]).toContain(!repeated.ok && repeated.corner);
    for (const corners of [bad.bowTie.corners, bad.spike.corners, bad.halfWorld.corners, policy.two.corners]) {
      const result = markOutline(cornersFrom(corners), choose);
      expect(!result.ok && result.corner).toBeNull();
    }
  });

  it("the order holds: a bow-tie with a corner at 89° is pole, not crossing", () => {
    const high = bad.bowTie.corners.map(([lng, lat]) => [lng, lat + 88.98] as const);
    expect(problemOf(markOutline(cornersFrom(high), choose))).toBe("pole");
    expect(problemOf(markOutline(cornersFrom(bad.bowTie.corners), choose))).toBe("crossing");
  });
});

describe("markSaved", () => {
  it("[R23] inputFixture.field: ring, lookup and label are kept exactly (sameField with the value is true)", () => {
    const result = markSaved(inputFixture.field);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.marked.ring).toEqual(inputFixture.field.ring);
    expect(result.marked.lookup).toEqual(inputFixture.field.lookup);
    expect(sameField(fieldOf(result.marked, inputFixture.field.label), inputFixture.field)).toBe(true);
  });

  it("[R23] a saved lookup on a side, which the contract accepts, is kept as given rather than moved", () => {
    const onSide: Field = { ...inputFixture.field, lookup: [100.005, 15] };
    expect(fieldIssues(onSide)).toEqual([]);
    const result = markSaved(onSide);
    expect(result.ok && result.marked.lookup).toEqual([100.005, 15]);
  });

  it("[R24] a saved bow-tie the parser accepts is refused crossing, not drawn", () => {
    const bowTie: Field = { ring: [...bad.bowTie.corners, bad.bowTie.corners[0]], lookup: [0.015, 0.012], label: "Saved" };
    expect(fieldIssues(bowTie)).toEqual([]);
    expect(problemOf(markSaved(bowTie))).toBe("crossing");
  });

  it("a saved field 30 km across marks: F2's size policy is never applied to a saved value", () => {
    const corners: LngLat[] = [[30, 0], [30.3, 0], [30.3, 0.3], [30, 0.3]];
    const wide: Field = { ring: [...corners, corners[0]], lookup: [30.15, 0.15], label: "Saved" };
    expect(fieldIssues(wide)).toEqual([]);
    const result = markSaved(wide);
    expect(result.ok).toBe(true);
    if (result.ok) expect(withinPolicy(result.marked)).toBe("too_far");
  });
});

describe("withinPolicy", () => {
  it("policy.tooFar marks (the contract and the server accept it) and withinPolicy says too_far", () => {
    const marked = mark(policy.tooFar.corners);
    expect(fieldIssues(fieldOf(marked))).toEqual([]);
    expect(withinPolicy(marked)).toBe("too_far");
  });

  it("policy.tiny marks and withinPolicy says tiny; the square and fiji give null", () => {
    expect(withinPolicy(mark(policy.tiny.corners))).toBe("tiny");
    expect(withinPolicy(mark(good.square))).toBeNull();
    expect(withinPolicy(mark(good.fiji))).toBeNull();
  });
});

describe("edits", () => {
  it("[R7] moveCorner changes one corner only; a target of -179.995 lands at 180.005 beside a 179.99 neighbour", () => {
    const fiji = cornersFrom(good.fiji);
    const moved = moveCorner(fiji, 1, [-179.995, -16.8]);
    expect(moved).toEqual([fiji[0], [180.005, -16.8], fiji[2], fiji[3]]);
    expect(markOutline(moved, choose).ok).toBe(true);
    const square = cornersFrom(good.square);
    const dragged = moveCorner(square, 2, [100.012, 15.012]);
    expect(dragged).toEqual([square[0], square[1], [100.012, 15.012], square[3]]);
  });

  it("moveCorner clamps latitude to ±85", () => {
    const square = cornersFrom(good.square);
    expect(moveCorner(square, 2, [100.01, 88])[2]).toEqual([100.01, 85]);
    expect(moveCorner(square, 0, [100, -88])[0]).toEqual([100, -85]);
  });

  it("[R7] insertCorner(null) puts the new corner in the middle of the longest side; the outline still marks with the same area", () => {
    const corners = cornersFrom([[0, 60], [0.02, 60], [0.02, 60.014], [0, 60.012]]);
    const sides = corners.map((corner, i) => haversine(corner, corners[(i + 1) % corners.length]));
    expect(sides.indexOf(Math.max(...sides))).toBe(1);
    const { corners: inserted, index } = insertCorner(corners, null);
    expect(index).toBe(2);
    expect(inserted).toHaveLength(5);
    expect(inserted[2][0]).toBeCloseTo(0.02, 6);
    expect(inserted[2][1]).toBeCloseTo(60.007, 6);
    expect(inserted.filter((_, i) => i !== 2)).toEqual([...corners]);
    expect(within(mark(inserted).areaM2, mark(corners).areaM2, 0.001)).toBe(true);
  });

  it("[R7] insertCorner(2) puts it between corners 3 and 4 and returns index 3", () => {
    const square = cornersFrom(good.square);
    const { corners, index } = insertCorner(square, 2);
    expect(index).toBe(3);
    expect(corners).toEqual([square[0], square[1], square[2], [100.005, 15.01], square[3]]);
    expect(markOutline(corners, choose).ok).toBe(true);
  });

  it("[R7] removeCorner drops one corner; removing the inner corner of the L leaves a field that marks", () => {
    const l = cornersFrom(good.l);
    const removed = removeCorner(l, 3);
    expect(removed).toEqual(l.filter((_, i) => i !== 3));
    const marked = mark(removed);
    expect(strictlyInside(marked.lookup, removed)).toBe(true);
    expect(fieldIssues(fieldOf(marked))).toEqual([]);
  });

  it("stepSize walks boxSizes and returns null below 0.1 and above 50", () => {
    const up = [0.1];
    for (let size = stepSize(0.1, 1); size !== null; size = stepSize(size, 1)) up.push(size);
    expect(up).toEqual([0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 20, 50]);
    expect(stepSize(1, -1)).toBe(0.5);
    expect(stepSize(0.1, -1)).toBeNull();
    expect(stepSize(50, 1)).toBeNull();
  });

  it("[R23] sameField is true for a field and its JSON round trip, and false when one lookup digit or the label differs", () => {
    const field = inputFixture.field;
    expect(sameField(field, JSON.parse(JSON.stringify(field)) as Field)).toBe(true);
    expect(sameField(field, { ...field, lookup: [100.005, 15.006] })).toBe(false);
    expect(sameField(field, { ...field, label: "Another field" })).toBe(false);
    expect(sameField(field, null)).toBe(false);
    expect(sameField(null, null)).toBe(true);
  });
});

describe("properties", () => {
  it("[R8][R24] 300 random simple polygons (3 to 30 corners, any longitude), each through 10 random moves: every marked outline passes fieldIssues and support strictlyInside", () => {
    const random = randomSource(7);
    let marked = 0;
    let edits = 0;
    for (let k = 0; k < 300; k++) {
      const points = randomPolygon(random);
      const first = markOutline(cornersFrom(points), choose);
      if (!first.ok) continue;
      marked++;
      let outline = first.marked;
      expect(fieldIssues(fieldOf(outline))).toEqual([]);
      expect(strictlyInside(outline.lookup, points)).toBe(true);
      for (let e = 0; e < 10; e++) {
        const corner = Math.floor(random() * outline.corners.length);
        const [lng, lat] = outline.corners[corner];
        const to: LngLat = [wrapLng(lng + (random() - 0.5) * 0.01), lat + (random() - 0.5) * 0.01];
        const edit = markOutline(moveCorner(outline.corners, corner, to), { kind: "keep", at: outline.lookup });
        if (!edit.ok) continue;
        edits++;
        outline = edit.marked;
        expect(fieldIssues(fieldOf(outline))).toEqual([]);
        expect(strictlyInside(outline.lookup, outline.ring.slice(0, -1))).toBe(true);
      }
    }
    expect(marked).toBeGreaterThan(250);
    expect(edits).toBeGreaterThan(2000);
  });

  it("[R11] the same polygon shifted by 360° or started at another corner gives the same area and a lookup inside both", () => {
    const random = randomSource(13);
    const corpus: Ring[] = [...Object.values(good), ...Array.from({ length: 50 }, () => randomPolygon(random))];
    for (const points of corpus) {
      const reference = markOutline(cornersFrom(points), choose);
      if (!reference.ok) continue;
      const shifted = points.map(([lng, lat]) => [lng + 360, lat] as const);
      const started = rotate(points, Math.floor(points.length / 2));
      for (const variant of [shifted, started]) {
        const marked = mark(variant);
        expect(within(marked.areaM2, reference.marked.areaM2, 1e-6)).toBe(true);
        expect(strictlyInside(marked.lookup, points)).toBe(true);
        expect(strictlyInside(reference.marked.lookup, variant)).toBe(true);
      }
    }
  });
});

describe("the flat plan", () => {
  const sizes = [[360, 280], [1280, 448], [200, 400]] as const;

  it("[R14] planOf keeps north up and equal scale: a 100 m by 50 m field draws twice as wide as tall", () => {
    const field: Ring = [[0, 0], [0.0009, 0], [0.0009, 0.00045], [0, 0.00045]];
    expect(within(haversine(field[0], field[1]) / haversine(field[1], field[2]), 2, 0.02)).toBe(true);
    for (const [width, height] of sizes) {
      const plan = planOf(mark(field), width, height);
      const [southWest, southEast, northEast] = plan.corners;
      expect(southEast.x).toBeGreaterThan(southWest.x);
      expect(northEast.y).toBeLessThan(southEast.y);
      expect(northEast.x).toBeCloseTo(southEast.x, 6);
      expect(within((southEast.x - southWest.x) / (southEast.y - northEast.y), 2, 0.02)).toBe(true);
    }
  });

  it("[R14] every corner and the lookup fall inside the given width and height with the margin", () => {
    for (const points of Object.values(good)) {
      for (const [width, height] of sizes) {
        const plan = planOf(mark(points), width, height);
        for (const { x, y } of [...plan.corners, plan.lookup]) {
          expect(x).toBeGreaterThanOrEqual(24);
          expect(x).toBeLessThanOrEqual(width - 24);
          expect(y).toBeGreaterThanOrEqual(24);
          expect(y).toBeLessThanOrEqual(height - 24);
        }
        expect(plan.path.startsWith("M ")).toBe(true);
        expect(plan.path.endsWith(" Z")).toBe(true);
        expect(plan.path.match(/[ML] /g)).toHaveLength(points.length);
      }
    }
  });

  it("[R14] the scale bar is a round number of metres and between 15% and 40% of the width", () => {
    const random = randomSource(5);
    const corpus: Ring[] = [...Object.values(good), ...Array.from({ length: 30 }, () => randomPolygon(random))];
    for (const points of corpus) {
      const result = markOutline(cornersFrom(points), choose);
      if (!result.ok) continue;
      for (const [width, height] of sizes) {
        const plan = planOf(result.marked, width, height);
        const decade = 10 ** Math.floor(Math.log10(plan.barM) + 1e-9);
        expect([1, 2, 5].some(step => within(plan.barM, step * decade, 1e-9))).toBe(true);
        expect(plan.barPx / width).toBeGreaterThanOrEqual(0.15);
        expect(plan.barPx / width).toBeLessThanOrEqual(0.4);
        const [a, b] = [plan.corners[0], plan.corners[1]];
        const pixelsPerMetre = Math.hypot(b.x - a.x, b.y - a.y) / haversine(points[0], points[1]);
        expect(within(plan.barPx / plan.barM, pixelsPerMetre, 0.02)).toBe(true);
      }
    }
  });

  it("[R11] fiji's plan is one small rectangle, not a strip across the drawing", () => {
    for (const points of [good.fiji, good.fijiClockwise]) {
      const plan = planOf(mark(points), 360, 280);
      const xs = plan.corners.map(({ x }) => x);
      const ys = plan.corners.map(({ y }) => y);
      const [wide, tall] = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
      const expected = haversine([179.99, -16.795], [-179.99, -16.795]) / haversine([179.99, -16.8], [179.99, -16.79]);
      expect(within(wide / tall, expected, 0.02)).toBe(true);
      expect(new Set(xs.map(x => x.toFixed(3))).size).toBe(2);
      expect(plan.lookup.x).toBeGreaterThan(Math.min(...xs));
      expect(plan.lookup.x).toBeLessThan(Math.max(...xs));
    }
  });
});
