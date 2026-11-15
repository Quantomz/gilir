// @vitest-environment jsdom
// The whole slot in jsdom with the real maplibre-gl and no mock of it: jsdom has no WebGL2, so `new Map` throws
// GPUInitializationError and the picker shows its flat plan (grounding section 6). That makes this file the test of
// "no WebGL" (docs/cards/F2.md:34) by nature. NEXT_PUBLIC_MAPTILER_KEY is unset unless a case stubs it.
// fetch and navigator.geolocation are stubbed per case; ResizeObserver and matchMedia in beforeEach. The repo's vitest
// has no globals, so afterEach calls cleanup(). A test observes only the screen, the calls to onChange and the calls
// to fetch. Every emitted field is judged by support/shapes.ts fieldIssues.
import { afterEach, describe, it } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

describe("with no key and no WebGL", () => {
  it.todo("[R14][R16][R20] render(<FieldPicker value={null} onChange>) shows two explanations, no globe on this phone and no search by name on this site, and the drawing");
  it.todo("[R16][R20] the search box is still there and its hint asks for a position; the corner list is open without a press; 'Use my location' is there");
  it.todo("[R20] nothing calls fetch and nothing calls onChange on mount");
  it.todo("[R20] typing '-6.326, 108.32' and Enter chooses a place with no fetch; 'Mark my field' calls onChange once with a 1 ha field that passes fieldIssues, lookup [108.32, -6.326]");
  it.todo("[R15][R8] keyboard only: Tab to Corner 1 latitude, type 3 corners, press Use these corners: onChange once with a field that passes fieldIssues; the drawing shows 3 numbered corners");
  it.todo("[R5] the credits line shows 'NASA EOSDIS GIBS' without a press");
  it.todo("the root has data-surface='plan', and once marked data-lookup equals the emitted lookup");
});

describe("the value prop", () => {
  it.todo("[R23] mounting with inputFixture.field shows 'Fit the corners to your field', the 4 rows with the fixture's numbers, 'About 119 hectares', and calls onChange 0 times");
  it.todo("[R23] a value that arrives after mount (rerender from null) is drawn and calls onChange 0 times");
  it.todo("[R23] a parent that hands every emitted field straight back (useState) sees exactly one onChange per accepted edit");
  it.todo("a parent that hands back a deep copy of the emitted field also sees no second onChange");
  it.todo("rerender with null after a field returns to the search box");
  it.todo("a value the picker cannot draw shows 'We couldn’t draw the field you saved. …', offers 'Mark my field' at its place, and does not call onChange");
  it.todo("[R17] two pickers in one document have no duplicate id (document.querySelectorAll('[id]'))");
});

describe("search with a key (vi.stubEnv, fetch stubbed)", () => {
  it.todo("[R6] typing 12 letters calls fetch 0 times");
  it.todo("[R6][R4] pressing Enter calls fetch once, with a URL on api.maptiler.com that has autocomplete=false and the stubbed key");
  it.todo("[R6] pressing the Search button does the same; one letter shows 'Type at least 2 letters, then Search.' and calls fetch 0 times");
  it.todo("results show as buttons 'Indramayu' with 'West Java, Indonesia'; the status line says '2 places found. Choose one from the list.'");
  it.todo("choosing a row shows the place card and 'Mark my field'; pressing it calls onChange with a 1 ha field labelled 'Field near Indramayu, West Java, Indonesia'");
  it.todo("[R16] a 403 shows 'The place search isn’t working on this site right now. …' and a typed position still marks a field");
  it.todo("[R16] a rejected fetch shows 'We couldn’t reach the place search. …'; pressing Search again calls fetch again");
  it.todo("[R16] a 429 shows 'The place search is busy. Wait a moment, then press Search again.'");
  it.todo("no result shows 'No place found. Try the nearest town, or type a position.' (no globe to tap in jsdom)");
  it.todo("a slow first answer arriving after a second search does not replace the second's results");
  it.todo("[R5] the credits line shows '© MapTiler' and '© OpenStreetMap contributors' as links, without a press");
  it.todo("unmounting during a search aborts it and nothing is set afterwards");
});

describe("use my location (navigator.geolocation stubbed)", () => {
  it.todo("'Use my location' opens the explanation with 'Find my location' and moves focus to its heading; nothing is asked of the phone yet");
  it.todo("[R13] 'Find my location' with a fix: onChange gets a 1 ha field whose lookup is the fix, and the note reads 'From your phone’s location, within about 10 m.'");
  it.todo("[R25] with a fix, fetch is never called: the position goes to no service");
  it.todo("[R16] denied shows 'Your location is turned off' with the three steps and 'Try again'");
  it.todo("[R16] with no navigator.geolocation it shows 'This phone can’t share its location here'");
});

describe("marking", () => {
  it.todo("[R13][R26] the note under the tools states how the outline was made and the weather grid sentence, for a searched box, typed corners and a saved field");
  it.todo("[R10] 'Your field is marked: about 1 hectare, 4 corners.' is visible text, and the live region says it after each accepted edit");
  it.todo("'Search again' moves focus to the search box, calls onChange 0 times, and shows 'Your field is still marked: …' with 'Back to my field'");
  it.todo("'Back to my field' shows the same box again, with Smaller and Bigger, and calls onChange 0 times");
  it.todo("Bigger at 50 ha stays enabled and answers 'This is the biggest box. Drag a corner to make your field bigger.'");
  it.todo("[R15] focus moves to the slot's heading when marking starts, and not on first mount");
  it.todo("[R15] every button and input in the slot has an accessible name (getAllByRole) in each of the three phases");
});
