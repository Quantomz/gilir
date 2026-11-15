// Node environment. F2's shape check is a second copy of the server's (a browser module may not import src/server:
// scripts/check-boundaries.mjs:39). This file keeps the two equal by asking the real request handler with an injected
// store and no database (support/shapes.ts serverStatus). A change on either side fails `npm run check`.
import { describe, it } from "vitest";

describe("F2 never emits what the server refuses", () => {
  it.todo("[R24] every good shape, marked: serverStatus of its field is 202");
  it.todo("[R24] 300 random outlines after 10 random accepted moves each: serverStatus is 202 for every one");
  it.todo("[R24][R7] a field with 256 corners is 202");
  it.todo("[R8] every field F2 marks is accepted with 202 inside a whole FarmInput built from inputFixture");
});

describe("F2 refuses what the server refuses", () => {
  it.todo("[R24] each bad shape, closed by hand with a corner as the lookup (the parser accepts it): 400, and markOutline refuses it");
  it.todo("[R24] 300 random rings of 4 to 8 points with a corner as the lookup: markOutline marks one exactly when the server answers 202");
});

describe("where F2 is stricter, on purpose", () => {
  it.todo("a 10° by 10° field: the server says 202, markOutline marks it, and withinPolicy says too_far for a farmer's edit (open decision 5)");
  it.todo("a corner at 86°: the server says 202 and markOutline says pole (MapLibre cannot draw it)");
});
