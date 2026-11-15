// F2's shape check is a second copy of the server's, because a browser module may not import src/server. This file
// keeps the two equal by asking the real request handler, with an injected store and no database. A change on either
// side fails `npm run check`.
import { describe, expect, it } from "vitest";
import type { LngLat } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { cornersFrom, markOutline, moveCorner, withinPolicy, wrapLng } from "@/features/location/outline";
import type { Field, Marked } from "@/features/location/outline";
import { bad, circle, fieldIssues, good, policy, randomPolygon, randomSource, serverStatus, serverStatusOf } from "./support/shapes";

const choose = { kind: "choose" } as const;
const fieldOf = (marked: Marked): Field => ({ ring: marked.ring, lookup: marked.lookup, label: "Field near Labasa" });

function mark(points: readonly LngLat[]): Marked {
  const result = markOutline(cornersFrom(points), choose);
  if (!result.ok) throw new Error(`expected a field, got ${result.problem}`);
  return result.marked;
}

describe("F2 never emits what the server refuses", () => {
  it("[R24] every good shape, marked: serverStatus of its field is 202", async () => {
    for (const points of Object.values(good)) expect(await serverStatus(fieldOf(mark(points)))).toBe(202);
  });

  it("[R24] 300 random outlines after 10 random accepted moves each: serverStatus is 202 for every one", async () => {
    const random = randomSource(7);
    let accepted = 0;
    for (let k = 0; k < 300; k++) {
      const first = markOutline(cornersFrom(randomPolygon(random)), choose);
      if (!first.ok) continue;
      let outline = first.marked;
      expect(await serverStatus(fieldOf(outline))).toBe(202);
      for (let moves = 0, tries = 0; moves < 10 && tries < 100; tries++) {
        const corner = Math.floor(random() * outline.corners.length);
        const [lng, lat] = outline.corners[corner];
        const to: LngLat = [wrapLng(lng + (random() - 0.5) * 0.01), lat + (random() - 0.5) * 0.01];
        const edit = markOutline(moveCorner(outline.corners, corner, to), { kind: "keep", at: outline.lookup });
        if (!edit.ok) continue;
        moves++;
        accepted++;
        outline = edit.marked;
        expect(await serverStatus(fieldOf(outline))).toBe(202);
      }
    }
    expect(accepted).toBeGreaterThan(2500);
  });

  it("[R24][R7] a field with 256 corners is 202", async () => {
    const marked = mark(circle(256));
    expect(marked.ring).toHaveLength(257);
    expect(await serverStatus(fieldOf(marked))).toBe(202);
  });

  it("[R8] every field F2 marks is accepted with 202 inside a whole FarmInput built from inputFixture", async () => {
    expect(await serverStatusOf(inputFixture)).toBe(202);
    for (const points of [...Object.values(good), circle(256)]) {
      expect(await serverStatusOf({ ...inputFixture, field: fieldOf(mark(points)) })).toBe(202);
    }
  });
});

describe("F2 refuses what the server refuses", () => {
  it("[R24] each bad shape, closed by hand with a corner as the lookup (the parser accepts it): 400, and markOutline refuses it", async () => {
    for (const { corners } of Object.values(bad)) {
      const field: Field = { ring: [...corners, corners[0]], lookup: corners[0], label: "Field" };
      expect(fieldIssues(field)).toEqual([]);
      expect(await serverStatus(field)).toBe(400);
      expect(markOutline(cornersFrom(corners), choose).ok).toBe(false);
    }
  });

  it("[R24] 300 random rings of 4 to 8 points with a corner as the lookup: markOutline marks one exactly when the server answers 202", async () => {
    const random = randomSource(11);
    const tally = { agree: 0, serverRefused: 0, serverAccepted: 0 };
    for (let k = 0; k < 300; k++) {
      const count = 4 + Math.floor(random() * 5);
      const points = Array.from({ length: count }, () => [Math.round((30 + random() * 0.01) * 1e6) / 1e6, Math.round((10 + random() * 0.01) * 1e6) / 1e6] as const);
      const field: Field = { ring: [...points, points[0]], lookup: points[0], label: "Field" };
      expect(fieldIssues(field)).toEqual([]);
      const status = await serverStatus(field);
      expect([202, 400]).toContain(status);
      if (status === 202) tally.serverAccepted++;
      else tally.serverRefused++;
      expect({ points, marked: markOutline(cornersFrom(points), choose).ok }).toEqual({ points, marked: status === 202 });
      tally.agree++;
    }
    expect(tally.agree).toBe(300);
    expect(tally.serverRefused).toBeGreaterThan(20);
    expect(tally.serverAccepted).toBeGreaterThan(20);
  });
});

describe("where F2 is stricter, on purpose", () => {
  it("a 10° by 10° field: the server says 202, markOutline marks it, and withinPolicy says too_far for a farmer's edit", async () => {
    const marked = mark(policy.tooFar.corners);
    expect(await serverStatus(fieldOf(marked))).toBe(202);
    expect(withinPolicy(marked)).toBe("too_far");
  });

  it("a corner at 86°: the server says 202 and markOutline says pole (MapLibre cannot draw it)", async () => {
    const corners: LngLat[] = [[0, 85.5], [0.01, 85.5], [0.01, 86], [0, 86]];
    expect(await serverStatus({ ring: [...corners, corners[0]], lookup: [0.005, 85.75], label: "Field" })).toBe(202);
    const result = markOutline(cornersFrom(corners), choose);
    expect(!result.ok && result.problem).toBe("pole");
  });
});
