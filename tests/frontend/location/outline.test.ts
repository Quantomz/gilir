// Node environment. The outline's rules, judged by the two outside judges in support/shapes.ts (the contract's parser
// and an independent strict-inside test), never by F2's own code. Requirement ids are the rows R1 to R26 of the F2
// grounding report (ground/repo-and-requirements.md section 1). Reference: design/probe/outline-probe.test.ts ran these
// rules against the real parser and the real request handler (23 of 23 passed).
import { describe, it } from "vitest";

describe("drawing space and wire space", () => {
  it.todo("[R11] wrapLng keeps -180 and 180 as they are and wraps 180.01 to -179.99, -180.5 to 179.5 and 540 to 180 or -180");
  it.todo("[R11] round6 turns MapLibre's 180.00000000000182 into 180, and round6(wrapLng(x)) is in [-180, 180] for any x");
  it.todo("[R11] cornersFrom(fiji) reads 179.99, 180.01, 180.01, 179.99: every corner within 180° of the one before");
  it.todo("[R11] cornersFrom gives the same shape whichever side of 180° the list starts on, up to a whole turn");
  it.todo("[R23] cornersOfRing drops the closing point, and cornersOfRing(markOutline(x).ring) equals cornersFrom(x) for every good shape");
  it.todo("boxAround(at, 1) is about 10,000 m² and 100 m a side, counter-clockwise from the south-west, with `at` in its middle");
  it.todo("[R11] boxAround([179.9995, -16.8], 1) straddles 180° and marks");
});

describe("markOutline accepts", () => {
  it.todo("[R8] every good shape: the ring is closed with the identical first tuple, every longitude is in [-180, 180], and fieldIssues of the field is empty");
  it.todo("[R8][R12] the lookup is STRICTLY inside for the square, L, U, C and thin arm (support strictlyInside), and it is no corner");
  it.todo("[R12] for the U and the C the centroid is outside, so the lookup comes from a latitude band and lies inside the field");
  it.todo("[R12] the thin L arm, about 2 m wide, still gets a strictly inside lookup after rounding to 6 decimals");
  it.todo("[R11] for fiji and fijiClockwise the lookup's longitude is within 0.01° of ±180, never near 0 (the far side of the planet)");
  it.todo("[R11][R10] fiji's areaM2 is about 2.37 km² (within 2%), not 42,611 km²; the square's is about 119 ha");
  it.todo("[R7] circle(256) marks with a 257-point ring; circle(257) is too_many");
  it.todo("[R1] the far-south and far-north shapes mark");
  it.todo("keep: a box around [108.32, -6.326] has exactly [108.32, -6.326] as its lookup; a keep point on a side or outside is replaced by a chosen one");
});

describe("markOutline refuses", () => {
  it.todo("[R24] each bad shape with its named problem: bow-tie and spike crossing, repeated, pole, half-world too_far");
  it.todo("[R7] two corners are too_few");
  it.todo("three corners in a line are refused (crossing or no_inside), never marked");
  it.todo("the refusal names the corner for pole and repeated, and null otherwise");
  it.todo("the order holds: a bow-tie with a corner at 89° is pole, not crossing");
});

describe("markSaved", () => {
  it.todo("[R23] inputFixture.field: ring, lookup and label are kept exactly (sameField with the value is true)");
  it.todo("[R23] a saved lookup on a side, which the contract accepts, is kept as given rather than moved");
  it.todo("[R24] a saved bow-tie the parser accepts is refused crossing, not drawn");
  it.todo("a saved field 30 km across marks: F2's size policy is never applied to a saved value");
});

describe("withinPolicy", () => {
  it.todo("policy.tooFar marks (the contract and the server accept it) and withinPolicy says too_far");
  it.todo("policy.tiny marks and withinPolicy says tiny; the square and fiji give null");
});

describe("edits", () => {
  it.todo("[R7] moveCorner changes one corner only; a target of -179.995 lands at 180.005 beside a 179.99 neighbour");
  it.todo("moveCorner clamps latitude to ±85");
  it.todo("[R7] insertCorner(null) puts the new corner in the middle of the longest side; the outline still marks with the same area");
  it.todo("[R7] insertCorner(2) puts it between corners 3 and 4 and returns index 3");
  it.todo("[R7] removeCorner drops one corner; removing the inner corner of the L leaves a field that marks");
  it.todo("stepSize walks boxSizes and returns null below 0.1 and above 50");
  it.todo("[R23] sameField is true for a field and its JSON round trip, and false when one lookup digit or the label differs");
});

describe("properties", () => {
  it.todo("[R8][R24] 300 random simple polygons (3 to 30 corners, any longitude), each through 10 random moves: every marked outline passes fieldIssues and support strictlyInside");
  it.todo("[R11] the same polygon shifted by 360° or started at another corner gives the same area and a lookup inside both");
});

describe("the flat plan", () => {
  it.todo("[R14] planOf keeps north up and equal scale: a 100 m by 50 m field draws twice as wide as tall");
  it.todo("[R14] every corner and the lookup fall inside the given width and height with the margin");
  it.todo("[R14] the scale bar is a round number of metres and between 15% and 40% of the width");
  it.todo("[R11] fiji's plan is one small rectangle, not a strip across the drawing");
});
