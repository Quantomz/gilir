"use client";
// Small shared pieces. F1's Sheet, StatusLine and icons are internal to F1 (its index exports only Onboarding and
// AppFrame), so F2 has its own.
import type { ReactElement } from "react";
import type { Controller } from "../controller";

export type IconName = "search" | "close" | "locate" | "pin" | "edit" | "plus" | "minus" | "arrow" | "check" | "alert";

/** <span class="i" aria-hidden="true"><svg …/></span>: the prototype's stroke icons, inline (no sprite, no request). */
export function Icon(props: { readonly name: IconName }): ReactElement {
  throw new Error("not implemented");
}

/**
 * The visible explanations, noticesOf(c.picker, c.provider.kind === "ready"), each with noticeWords:
 *   no_key, no_globe, no_pictures   -> <p class="note" role="status"> with an alert icon
 *   refused, saved_unusable         -> <p class="note note-warn" role="alert">
 *   still_marked                    -> <p class="note"> plus <button class="btn btn-sub">Back to my field</button> (send back)
 * Every notice names a way that still works. Colour is never the only signal: each has an icon and words.
 */
export function Notices(props: { readonly c: Controller }): ReactElement | null {
  throw new Error("not implemented");
}

/**
 * <p class="sr" role="status" aria-live="polite">{note ? noteWords(note, outline) : ""}</p>. Always mounted, so a
 * screen reader hears each change of text (the prototype's toasts were inserted with their text and often missed).
 */
export function LiveRegion(props: { readonly c: Controller }): ReactElement {
  throw new Error("not implemented");
}
