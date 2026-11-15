// @vitest-environment jsdom
// The corner list: the keyboard and screen-reader way to do everything the map does (spec.md:50), and the coordinate
// entry. Rendered through <FieldPicker>, so the list is tested with the picker it talks to. No key, no WebGL.
import { afterEach, describe, it } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

describe("typing corners", () => {
  it.todo("[R15] each input is named by its legend and label: 'Corner 1' group, 'Latitude' and 'Longitude' textboxes");
  it.todo("[R15] inputs are type=text with inputmode=decimal and are described by the hint until they have an error");
  it.todo("[R15] 'Use these corners' with an empty latitude shows 'Type the latitude.' under it, sets aria-invalid, and focuses that input");
  it.todo("[R15] several bad numbers all show at once and focus goes to the first in reading order");
  it.todo("[R15] '6.326 S' and '108,32' are accepted as typed");
  it.todo("nothing calls onChange while typing: only 'Use these corners' does");
});

describe("the shape", () => {
  it.todo("[R24] a bow-tie shows 'Two sides cross. Type the corners in order, going around the field.' as role=alert, focused, and onChange is not called");
  it.todo("[R12] the U shape's 8 corners are accepted; the emitted lookup passes fieldIssues and is strictly inside (support strictlyInside)");
  it.todo("[R11] the Fiji corners (179.99 and -179.99) are accepted; the emitted ring keeps longitudes in [-180, 180]; the drawing shows one small rectangle; 'About 237 hectares'");
  it.todo("corners 10° apart show 'These corners are more than 20 km apart. Check the numbers.'");
  it.todo("a latitude of 89 shows the pole sentence");
  it.todo("after a refusal, fixing the number and pressing again clears the alert and emits");
});

describe("adding and removing", () => {
  it.todo("[R15] the list starts with 4 empty rows with nothing marked, a 1 ha box's corners around a chosen place, or the field's corners");
  it.todo("[R15] 'Add a corner' appends 'Corner 5' and moves focus to its latitude");
  it.todo("[R15] 'Remove corner 2' removes that row, renumbers the rest and keeps focus in the list");
  it.todo("[R15] with 3 rows there is no Remove button");
  it.todo("[R7] at 256 rows 'Add a corner' answers 'A field can have up to 256 corners.' and adds nothing");
});

describe("in step with the picker", () => {
  it.todo("[R15] after 'Use these corners' the heading has focus and the live region says 'Your field now has the 5 corners you typed.'");
  it.todo("[R15] Close returns focus to the button that opened the list");
  it.todo("a new value from the parent re-seeds the rows; text the farmer is typing is not lost on an unrelated re-render");
  it.todo("with the flat plan the list has no Close button and stays open");
});
