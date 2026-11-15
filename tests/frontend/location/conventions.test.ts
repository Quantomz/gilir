// Node environment. Rules that would otherwise be prose, as failing tests inside `npm run check`
// (encode-lessons-in-structure). Each case reads source files as text and parses them with the installed `typescript`,
// like scripts/check-boundaries.mjs, which cannot make internals unreachable.
import { describe, it } from "vitest";

describe("public surface", () => {
  it.todo("[R17] src/features/location/index.tsx exports exactly FieldPicker, typed with FieldPickerProps from ../ports");
  it.todo("[R17] no file under src/ outside src/features/location imports @/features/location/<path>");
});

describe("outside services stay in one file", () => {
  it.todo("[R4][R17] only src/features/location/provider.ts contains NEXT_PUBLIC_MAPTILER_KEY, maptiler.com, earthdata.nasa.gov or a fetch( call, across the whole of src/");
  it.todo("[R17] no XMLHttpRequest, WebSocket or sendBeacon under src/features/location");
  it.todo("[R2][R17] only globe.ts loads maplibre-gl at run time (a value import or import()); other files import its types, and index.tsx its stylesheet");
  it.todo("[R17] no file under src/features/location imports @/server, @/engine, @/registry, @/fixtures, @/client, pg or a node builtin");
  it.todo("[R25] no console. call and no debugger under src/features/location");
});

describe("layers inside the folder", () => {
  it.todo("outline.ts, coordinates.ts, picker.ts and words.ts import no react and no maplibre-gl, and take only types from provider.ts, globe.ts and views/ (import type)");
  it.todo("only picker.ts calls markOutline, markSaved, moveCorner, insertCorner or removeCorner; views, index.tsx and controller.ts only send actions");
  it.todo("no `as Marked` or `as Corners` outside outline.ts, and no `as BrowserKey` outside provider.ts (the brands stay honest)");
  it.todo("provider.ts and globe.ts import no react");
});

describe("repo rules F2 must not break", () => {
  it.todo("[R9] the only Turf imports are @turf/area and @turf/boolean-point-in-polygon (direct dependencies in package.json), and only outline.ts has them");
  it.todo("[R8] zod appears only in provider.ts, for the provider's wire shape: no field, ring or lookup schema anywhere (the contract's parser is the only one)");
  it.todo("no fixed DOM id: every id= in views/ and index.tsx comes from c.idOf (the lab mounts two pickers)");
  it.todo("no `dark:` class and no hex colour in any .tsx under src/features/location: modes arrive through F1's tokens");
  it.todo("every class defined in location.css starts with fp-, it defines no custom property, and it names no colour except the pin's drop shadow");
  it.todo("package.json, package-lock.json, src/contracts/** and src/features/ports.ts equal their main versions (git show main:path)");
});

describe("every word lives in words.ts", () => {
  it.todo("[R26] no JSX text with a letter, and no aria-label, title, alt or placeholder string literal, in any .tsx under src/features/location");
});
