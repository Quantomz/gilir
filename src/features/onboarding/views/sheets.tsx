"use client";
// Page 4 sheets and the Text size sheet. Each holds its own unparsed text until it is valid, then calls c.edit once,
// so the draft never holds a half date or a blank name and the saved history is always whole.
import type { ReactElement } from "react";
import type { Controller } from "../controller";
import type { Span } from "../model/timeline";

/**
 * "Which crop grew here?" / "Which crop grew then?". Buttons for "Your crops" (picked on page 2) then "Other crops",
 * then a form "A crop not on our list": "Name of the crop" (maxLength 120; 1 to policy.history.nameMaxChars letters
 * after trim, an F1 reading limit; the contract allows 240), "Add this crop". A name equal to a listed label
 * (case-insensitive) is added from the list. Catalogue failed: "We couldn’t load the crop list. You can still add a
 * crop by name below." + Try again. returnTo "ly-add". After adding, focus goes to the new bar's "Change dates".
 */
export function AddSheet(props: { readonly c: Controller; readonly within: Span | null }): ReactElement {
  throw new Error("not implemented");
}

/**
 * "Change dates: {crop}". The accessible date control for both ends of a bar (spec.md:46), and the keyboard way to
 * move a whole bar. Name field for an unsupported crop; "Planted"; "Harvested" + "The last day the crop was in the
 * field."; both min = window start, max = endExclusive - 1 (a crop may not be harvested on planningStart,
 * src/contracts/input.ts:75); "These dates are approximate" checkbox (sets both precisions; on for new bars;
 * shown on when either restored flag is approximate); "{n} days in the field." (polite) or the datesProblem words
 * (soft until Save is tried, then role="alert" and focused); "Save dates"; "Remove {crop}".
 * Autofocus goes to the end that opened it. returnTo is that handle or "Change dates" (known issue 20).
 */
export function DatesSheet(props: {
  readonly c: Controller;
  readonly entryId: string;
  readonly end: "planted" | "harvested";
  readonly returnTo: string;
}): ReactElement {
  throw new Error("not implemented");
}

/** "Not sure: {range}": "{n} days. If you don’t know…", "The field was empty then" (autofocus), "A crop grew then". */
export function GapSheet(props: { readonly c: Controller; readonly gap: Span }): ReactElement {
  throw new Error("not implemented");
}

/** "Empty: {range}": "You said the field was empty then…", "Mark as not sure" (autofocus). The range ends on the last empty day. */
export function EmptySheet(props: { readonly c: Controller; readonly entryId: string }): ReactElement {
  throw new Error("not implemented");
}

/**
 * "Text size": radio group Normal / Large / Largest with an "Aa" sample and the sentence that shows the size;
 * a role="switch" checkbox "High contrast" / "Black text on white, thicker edges"; "Done" (autofocus).
 * Applies at once through services/reading.ts applyReading. No "More settings" link: F1 has no Settings page
 * (open decision in rationale.md).
 */
export function TextSheet(props: { readonly onClose: () => void }): ReactElement {
  throw new Error("not implemented");
}
