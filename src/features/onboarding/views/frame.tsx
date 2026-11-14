"use client";
// The Terrace frame shared by every F1 screen and by the shell's Results screen.
// Landmarks: <header class="topbar"> (banner), then <main id="main"> holding the title, the page and the dock.
// The dock sits INSIDE <main> as role="region" "Next step" (known issue 21). The skip link lives in src/app/layout.tsx
// and targets #main. The fixture lab wraps Onboarding in its own <main> (src/app/dev/fixtures/fixture-lab.tsx:13), so
// the lab, and only the lab, shows a nested main (tradeoff in rationale.md).
// Classes are the prototype's, ported into src/features/onboarding/terrace.css (@layer components).
import { Component } from "react";
import type { ReactElement, ReactNode } from "react";
import type { Notices, Step } from "../model/flow";

/**
 * Public (re-exported by index.tsx). The frame page.tsx wraps F3's Results in: the top bar with the brand, Text size and
 * Listen, then <main id="main" tabIndex={-1} class="page">. No Back: Results offers Change inputs itself.
 * `focusOnMount` moves focus to #main when the plan replaces the inputs, so focus never drops to <body>
 * (graft from candidate 2).
 */
export function AppFrame(props: { readonly children: ReactNode; readonly focusOnMount?: boolean }): ReactElement {
  throw new Error("not implemented");
}

/** One input page: top bar (Back unless page 1, else the brand), step head, title, the page, the dock. */
export function StepFrame(props: {
  readonly step: Step;
  readonly title: string;
  readonly lead?: string;
  readonly onBack: (() => void) | null;
  readonly dock: ReactNode;
  readonly wide?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  throw new Error("not implemented");
  // TODO markup:
  //  <div class="view">
  //    <TopBar onBack={onBack} />
  //    <main id="main" class="page step-main" tabIndex={-1}>
  //      <div class={wide ? "wide stack" : "col stack"}>
  //        <StepHead step={step} />
  //        <div class="stack-xs"><Title>{title}</Title>{lead && <p class="lead" data-say>{lead}</p>}</div>
  //        {children}
  //      </div>
  //      <div class="dock" role="region" aria-label="Next step"><div class="dock-in">{dock}</div></div>
  //    </main>
  //  </div>
}

/** The frame of the screens that are not input pages: Opening, Making, Failed. Same top bar, same main. */
export function PlainFrame(props: { readonly onBack: (() => void) | null; readonly children: ReactNode }): ReactElement {
  throw new Error("not implemented");
}

/** Back (round button with the word, 48px), or the brand mark and "Gilir" on page 1. Then the tools. */
export function TopBar(props: { readonly onBack: (() => void) | null }): ReactElement {
  throw new Error("not implemented");
}

/**
 * "Text size" (opens TextSheet, aria-haspopup="dialog") and "Listen"/"Stop" (aria-pressed), each at least 48px, each an
 * icon with a visible word. Self-contained: it owns the TextSheet's open state, so AppFrame (outside Onboarding's
 * controller) has the same tools. Listen is not rendered when services/reading.ts canSpeak() is false. It reads every
 * [data-say] in #main and stops when the screen changes. Shown at every width (known issue 5).
 */
export function Tools(): ReactElement {
  throw new Error("not implemented");
}

/** "Step N of 4 · {name}" (read), then the four-segment bar and labels (aria-hidden; labels from 720px). */
export function StepHead(props: { readonly step: Step }): ReactElement {
  throw new Error("not implemented");
}

/** <h1 id="main-title" class="screen-title" tabIndex={-1} data-say>. Focused on every screen change after the first. */
export function Title(props: { readonly children: ReactNode }): ReactElement {
  throw new Error("not implemented");
}

/** The one polite live region of the flow, always mounted: drag results, toasts, Making's step sentence. */
export function StatusLine(props: { readonly said: string }): ReactElement {
  throw new Error("not implemented");
  // TODO: <p class="sr" role="status" aria-live="polite">{said}</p>
}

/** Toast under the top bar: 7 s, or 15 s with Undo; the timer pauses on hover and focus (known issue 16). */
export function ToastBar(props: { readonly text: string; readonly onUndo: (() => void) | null; readonly onDone: () => void }): ReactElement {
  throw new Error("not implemented");
}

/**
 * The quiet bars above the top bar, role="status", each with "Got it": storage not saving (spec.md:423), kept newer
 * answers (Change inputs), and offline (online/offline events). They never block input.
 */
export function StatusBars(props: { readonly notices: Notices; readonly onDismiss: (notice: keyof Notices) => void }): ReactElement {
  throw new Error("not implemented");
}

/** "Opening Gilir…" with skeleton cards, role="status", while storage answers. Also the server-rendered HTML of "/". */
export function Opening(): ReactElement {
  throw new Error("not implemented");
}

/**
 * A modal sheet: role="dialog", aria-modal, aria-labelledby its title; bottom sheet on phones, centred from 720px.
 * Focus goes to [data-autofocus] or the first control; Tab wraps; Escape and the scrim close it; on close focus returns
 * to `returnTo` (a DOM id from domIdOf, so a sheet opened from a handle returns to that handle, known issue 20) or to
 * the control that opened it. Not <dialog>.showModal (missing in jsdom, gotcha 31).
 */
export function Sheet(props: {
  readonly title: string;
  readonly returnTo: string | null;
  readonly onClose: () => void;
  readonly children: ReactNode;
}): ReactElement {
  throw new Error("not implemented");
}

/** Error boundary around the flow (prototype `Broken`). "Open Gilir again" reloads; saved answers are not cleared. */
export class Broken extends Component<{ readonly children: ReactNode }, { readonly failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    throw new Error("not implemented");
  }
}
