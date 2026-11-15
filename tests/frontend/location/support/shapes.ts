// The shape corpus and the two outside judges. Test support only: tests are outside `src`, so they may import
// src/server and src/fixtures (scripts/check-boundaries.mjs scans src only). Synthetic shapes: never farm evidence.
// Every shape is an OPEN list of wire-space [lng, lat] corners, as a farmer would type them.
// The judges are the contract's own parser and the server's own request handler, never F2's code, so a test can
// fail when F2 is wrong (test-behavior-not-implementation).
import { farmInputSchema } from "@/contracts";
import type { FarmInput, LngLat } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { createPlanApi } from "@/server/jobs/http";

type Field = FarmInput["field"];
type Ring = readonly LngLat[];

/** Shapes F2 must mark, with a lookup strictly inside. */
export const good = {
  /** inputFixture.field's ring without the closing point: about 119 ha at 100° E, 15° N. */
  square: inputFixture.field.ring.slice(0, -1),
  /** An L. Its centroid is inside. @turf/point-on-feature returns a corner for it (grounding 2.6). */
  l: [[0, 0], [0.02, 0], [0.02, 0.01], [0.01, 0.01], [0.01, 0.02], [0, 0.02]],
  /** A U opening north. Its centroid is in the gap, outside the field. */
  u: [[0, 0], [0.03, 0], [0.03, 0.03], [0.02, 0.03], [0.02, 0.01], [0.01, 0.01], [0.01, 0.03], [0, 0.03]],
  /** A C opening east. Its centroid is in the gap, outside the field. */
  c: [[0, 0], [0.03, 0], [0.03, 0.01], [0.01, 0.01], [0.01, 0.02], [0.03, 0.02], [0.03, 0.03], [0, 0.03]],
  /** An L whose arm is about 2 m wide: the lookup must survive rounding to 6 decimals. */
  thinArm: [[0, 0], [0.01, 0], [0.01, 0.000018], [0.000018, 0.000018], [0.000018, 0.01], [0, 0.01]],
  /** Fiji, across 180°, near Labasa: about 2.37 km². Wrapped, as the contract stores it. */
  fiji: [[179.99, -16.8], [-179.99, -16.8], [-179.99, -16.79], [179.99, -16.79]],
  /** The same field typed the other way round, starting on the east side. */
  fijiClockwise: [[-179.99, -16.79], [-179.99, -16.8], [179.99, -16.8], [179.99, -16.79]],
  /** Far south (Tierra del Fuego) and far north (Iceland): no country allowlist, no hemisphere default. */
  south: [[-68.31, -54.81], [-68.3, -54.81], [-68.3, -54.8], [-68.31, -54.8]],
  north: [[-21.95, 64.14], [-21.94, 64.14], [-21.94, 64.145], [-21.95, 64.145]],
  /** A straight extra corner on a side, as "Add a corner" makes one. The server accepts it (grounding 2.5). */
  straightExtraCorner: [[0, 0], [0.01, 0], [0.02, 0], [0.02, 0.01], [0, 0.01]],
} as const satisfies Record<string, Ring>;

/** Shapes the contract accepts or not, but the server refuses, with the problem F2 must name. */
export const bad = {
  bowTie: { corners: [[0, 0], [0.02, 0.02], [0.02, 0], [0, 0.01]], problem: "crossing" },
  spike: { corners: [[0, 0], [0.02, 0], [0.01, 0], [0.01, 0.01]], problem: "crossing" },
  repeated: { corners: [[0, 0], [0.01, 0], [0.01, 0], [0.01, 0.01]], problem: "repeated" },
  pole: { corners: [[0, 89.99], [0.01, 89.99], [0.01, 90], [0, 90]], problem: "pole" },
  halfWorld: { corners: [[0, 0], [180, 0], [180, 1], [0, 1]], problem: "too_far" },
} as const satisfies Record<string, { readonly corners: Ring; readonly problem: string }>;

/** Shapes the contract and the server accept, but F2 refuses for a farmer's edit (withinPolicy), and too few corners. */
export const policy = {
  tooFar: { corners: [[10, 10], [20, 10], [20, 20], [10, 20]], problem: "too_far" },
  tiny: { corners: [[0, 0], [0.00001, 0], [0.00001, 0.00001], [0, 0.00001]], problem: "tiny" },
  two: { corners: [[0, 0], [0.01, 0]], problem: "too_few" },
} as const satisfies Record<string, { readonly corners: Ring; readonly problem: string }>;

/** `corners` points on a circle of about 500 m. circle(256) is the most the contract allows. */
export function circle(corners: number, centre: LngLat = [36.07, -0.3]): Ring {
  return Array.from({ length: corners }, (_, index) => {
    const angle = (2 * Math.PI * index) / corners;
    return [centre[0] + 0.0045 * Math.cos(angle), centre[1] + 0.0045 * Math.sin(angle)] as const;
  });
}

const placeholder = {
  schemaVersion: 1,
  cropPurposeIds: ["placeholder"],
  water: "rain_only",
  planningStart: "2026-01-01",
  history: { kind: "skipped" },
} as const;

/** The shared parser's verdict on a field alone (grounding 2.4). Empty means the contract accepts it. */
export function fieldIssues(field: unknown): readonly string[] {
  const parsed = farmInputSchema.safeParse({ ...placeholder, field });
  if (parsed.success) return [];
  return parsed.error.issues.filter(issue => issue.path[0] === "field").map(issue => `${issue.path.join(".")}: ${issue.message}`);
}

/**
 * The server's verdict (src/server/jobs/http.ts:114) through the real request handler, with an injected store and a
 * synthetic registry: no database. 202 means accepted; 400 on ["field", "ring"] means unsupported geometry.
 */
export async function serverStatus(field: Field): Promise<number> {
  const store = { create: async () => ({ jobId: "00000000-0000-4000-8000-000000000000", token: "test" }) } as never;
  const readRegistry = () => ({
    kind: "released",
    identity: { catalogueVersion: "test", ruleVersion: "test" },
    catalogue: { version: "test", entries: [{ id: "placeholder" }] },
  }) as never;
  const api = createPlanApi({ store, readRegistry, dataCutoff: "2026-11-01" });
  const response = await api(new Request("http://test.invalid/api/plans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...placeholder, field }),
  }));
  return response.status;
}

/** Strictly inside an open ring of [lng, lat], by even-odd ray casting after unwrapping next to corner 0, with the boundary excluded. Independent of Turf and of F2. */
export function strictlyInside(point: LngLat, ring: Ring): boolean {
  const unwrap = (lng: number, near: number) => lng + 360 * Math.round((near - lng) / 360);
  const corners: [number, number][] = [];
  for (const [lng, lat] of ring) corners.push([unwrap(lng, corners.at(-1)?.[0] ?? ring[0][0]), lat]);
  const x = unwrap(point[0], corners[0][0]);
  const y = point[1];
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const [ax, ay] = corners[j];
    const [bx, by] = corners[i];
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (cross === 0 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return false;
    if ((ay > y) !== (by > y) && x < ax + (bx - ax) * (y - ay) / (by - ay)) inside = !inside;
  }
  return inside;
}
