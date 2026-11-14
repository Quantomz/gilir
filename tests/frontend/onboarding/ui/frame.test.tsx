// @vitest-environment jsdom
// The Terrace frame: top bar, tools, notices, focus and landmarks.
import { describe, it } from "vitest";

describe("frame", () => {
  it.todo("[L3] focus moves to the h1 on every page change after the first paint, and not on first paint");
  it.todo("every F1 screen has one <main id=\"main\">, and the dock with the primary button is inside it as region Next step (known issue 21)");
  it.todo("[B3] a failing storage shows one quiet This browser isn’t saving your answers line (role status) with Got it; Next still works");
  it.todo("[C6] Change inputs over newer answers shows We kept the answers you changed after that plan was made.");
  it.todo("the toast with Undo stays 15 s, pauses while focused or hovered, and Undo focuses the restored control (known issue 16)");
  it.todo("an offline event shows the offline line; an online event hides it");
});

describe("tools", () => {
  it.todo("[L6] Text size offers Normal, Large and Largest and High contrast; choosing Largest sets --scale 1.36 and .big-text on <html> and writes gilir.reading");
  it.todo("[L6] Listen is absent when speechSynthesis is missing (jsdom) and speaks the [data-say] texts in #main when a stub is present");
  it.todo("a blocked localStorage (getItem throws) leaves Normal size and no crash");
  it.todo("the reading head script built from readingKey and textScale sets the same attributes as applyReading");
});
