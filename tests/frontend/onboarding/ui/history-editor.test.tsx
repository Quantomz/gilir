// @vitest-environment jsdom
// Page 4: the date, the history editor by keyboard and date sheets, validation and submission. Drag runs in
// Playwright (lab.spec.ts), because jsdom has no layout and no setPointerCapture (grounding.md gotcha 31).
import { describe, it } from "vitest";

describe("the field-ready date", () => {
  it.todo("[G2] a fresh page 4 has an empty date input and the timeline waits for a date");
  it.todo("[G1] Make my plan with no date shows Choose the date your field is ready on page 4 and does not submit");
  it.todo("[G3] a 2028-02-29 date shows Your plan covers 29 February 2028 to 27 February 2029");
  it.todo("[G4] a past date shows This date has passed. Is the year right? and still submits");
});

describe("bars by keyboard and date sheets", () => {
  it.todo("[H4] ArrowRight on the harvest handle adds one day: aria-valuenow, aria-valuetext and the lane text change together");
  it.todo("[H4] ArrowLeft on the planting handle moves planting one day earlier; PageUp and PageDown move a week; Home and End reach the window edges");
  it.todo("[H5] Enter on a handle opens Change dates with that end's input focused; Escape closes it and focus returns to that handle (known issue 20)");
  it.todo("[H6] These dates are approximate is on for a new bar; turning it off and saving submits both precisions as exact");
  it.todo("[H3] Add a crop places a 90-day bar and focuses its Change dates; Remove in the sheet removes it with Undo and focuses Add a crop");
  it.todo("[H8] A crop not on our list named Cassava is submitted as { kind: \"unsupported\", label: \"Cassava\" }; a blank name says Type the name of the crop.");
  it.todo("[H10] The field was empty then on a Not sure time submits a fallow entry; Mark as not sure removes it");
  it.todo("[H1] I don’t remember is aria-pressed and the submitted history is exactly { kind: \"skipped\" }");
  it.todo("[H13] saving overlapping dates says This overlaps your … One crop at a time and keeps the sheet open");
  it.todo("[I4] an overlapping bar shows its issue in its own lane at once, without Make my plan");
  it.todo("every pointer action has a button twin: overview gap, empty time and crop segment each match a list button");
});

describe("Make my plan", () => {
  it.todo("[I2] an incomplete draft shows Fix these first with Fix on page N links; a link opens that page and focuses the control");
  it.todo("[I3] a server issue with path [] is listed in Fix these first with no link");
  it.todo("[J1] accepted opens Making; invalid stays on the pages; unavailable stays on page 4");
  it.todo("[J4] each unavailable code shows its farmer title and body, no raw code, and one Make my plan button");
  it.todo("[J6] a double click submits once: the button is aria-busy and says Sending your answers… while sending");
  it.todo("[J3] a rejected submission (invalid, cropPurposeIds 0) opens page 2 with the issue, never calls onCompleted, and keeps every answer");
});
