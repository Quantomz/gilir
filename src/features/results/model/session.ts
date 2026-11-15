import type { LocalState, StorageReason } from "@/client/storage";
import type { CompletedSnapshot } from "@/contracts";

export type Work = "pdf" | "save" | "clear" | "undo";

export type ActionId = Work | "details" | "change" | "earlier";

export type Stored =
  /** The read made when the screen opened has not answered. The saved line says nothing yet. */
  | { readonly kind: "checking" }
  /** That read rejected, for F4's `problem`. F3 claims nothing, offers no Save or Clear, and never writes. */
  | { readonly kind: "not_saving"; readonly problem: Problem }
  /** What storage holds now. Null is nothing saved. */
  | { readonly kind: "read"; readonly state: LocalState | null }
  /**
   * The farmer cleared the saved data. `undo` is the state to put back, or null when the clear found nothing.
   * `setAside`: the clear also removed data F4 had set aside as unreadable, which Undo cannot put back.
   */
  | { readonly kind: "cleared"; readonly undo: LocalState | null; readonly setAside: boolean };

export type FocusTarget =
  /** The h1 of the screen now showing, after a change of screen. */
  | "title"
  /** The View details button, when the farmer comes back from details. */
  | "details_button"
  /** The saved line, when the button that had focus is gone (Save, Undo, Clear saved data). Never Undo itself, so a
   * second Enter on Clear cannot undo it. */
  | "kept";

/** One thing to do after an event is drawn. `n` grows by one per cue, so the same cue twice still fires. */
export interface Cue {
  readonly n: number;
  readonly focus: FocusTarget | null;
  /** What the polite status line says (actions.ts `spoken`), when focus does not move. */
  readonly say: "pdfMade" | "notSaving" | null;
}

/** Why a storage call failed, as F4's storageProblem reads the error: its reason and F4's words for it. */
export interface Problem {
  readonly reason: StorageReason;
  readonly text: string;
}

/** Why the last call did not do what the farmer asked. */
export type Failure =
  /** A port refused. `problem` is F4's reading for a storage call, null for the PDF. */
  | { readonly kind: "refused"; readonly work: Work; readonly problem: Problem | null }
  /** Undo found something saved since the clear. It kept that and put nothing back. */
  | { readonly kind: "kept_newer"; readonly work: "undo" };

export interface Session {
  /** The result on screen: the one page.tsx gave, or the earlier saved one after the farmer opened it. */
  readonly shown: CompletedSnapshot;
  readonly view: "result" | "details";
  readonly stored: Stored;
  readonly busy: Work | null;
  readonly failed: Failure | null;
  readonly cue: Cue;
}

export type Read = { readonly ok: true; readonly state: LocalState | null } | { readonly ok: false; readonly problem: Problem };
export type Wrote = { readonly ok: true; readonly state: LocalState } | { readonly ok: false; readonly problem: Problem };
export type Cleared =
  | { readonly ok: true; readonly undo: LocalState | null; readonly setAside: boolean }
  | { readonly ok: false; readonly problem: Problem };
/** `state` is what storage holds now. `restored` is false when that was saved since the clear and nothing was written. */
export type Undone =
  | { readonly ok: true; readonly state: LocalState; readonly restored: boolean }
  | { readonly ok: false; readonly problem: Problem };
export type Made = { readonly ok: boolean };

export type Settled =
  | { readonly work: "pdf"; readonly outcome: Made }
  | { readonly work: "save"; readonly outcome: Wrote }
  | { readonly work: "undo"; readonly outcome: Undone }
  | { readonly work: "clear"; readonly outcome: Cleared };

export type SessionEvent =
  | { readonly kind: "read"; readonly outcome: Read }
  | { readonly kind: "started"; readonly work: Work }
  | ({ readonly kind: "settled" } & Settled)
  | { readonly kind: "opened_earlier" }
  | { readonly kind: "opened_details" }
  | { readonly kind: "closed_details" };

export function startSession(given: CompletedSnapshot): Session {
  return { shown: given, view: "result", stored: { kind: "checking" }, busy: null, failed: null, cue: { n: 0, focus: null, say: null } };
}

/**
 * An event that does not fit returns `session` itself, so a double tap, a late answer and Strict Mode's second effect
 * change nothing and React skips the render.
 */
export function update(session: Session, event: SessionEvent): Session {
  switch (event.kind) {
    case "read":
      if (session.stored.kind !== "checking") return session;
      return event.outcome.ok
        ? { ...session, stored: { kind: "read", state: event.outcome.state } }
        : { ...session, stored: { kind: "not_saving", problem: event.outcome.problem }, cue: cue(session, null, "notSaving") };
    case "started":
      if (session.busy !== null || !canRun(session, event.work)) return session;
      return { ...session, busy: event.work, failed: null };
    case "settled":
      return session.busy === event.work ? settle({ ...session, busy: null }, event) : session;
    case "opened_earlier": {
      const earlier = earlierOf(session);
      if (earlier === null) return session;
      return { ...session, shown: earlier, view: "result", failed: null, cue: cue(session, "title", null) };
    }
    case "opened_details":
      return session.view === "result" ? { ...session, view: "details", cue: cue(session, "title", null) } : session;
    case "closed_details":
      return session.view === "details" ? { ...session, view: "result", cue: cue(session, "details_button", null) } : session;
  }
}

function settle(idle: Session, settled: Settled): Session {
  const failed = (problem: Problem | null): Session => ({ ...idle, failed: { kind: "refused", work: settled.work, problem } });
  switch (settled.work) {
    case "pdf":
      return settled.outcome.ok ? { ...idle, cue: cue(idle, null, "pdfMade") } : failed(null);
    case "save":
      return settled.outcome.ok
        ? { ...idle, stored: { kind: "read", state: settled.outcome.state }, cue: cue(idle, "kept", null) }
        : failed(settled.outcome.problem);
    case "undo": {
      const { outcome } = settled;
      if (!outcome.ok) return failed(outcome.problem);
      const kept: Session = { ...idle, stored: { kind: "read", state: outcome.state }, cue: cue(idle, "kept", null) };
      return outcome.restored ? kept : { ...kept, failed: { kind: "kept_newer", work: "undo" } };
    }
    case "clear":
      return settled.outcome.ok
        ? { ...idle, stored: { kind: "cleared", undo: settled.outcome.undo, setAside: settled.outcome.setAside }, cue: cue(idle, "kept", null) }
        : failed(settled.outcome.problem);
  }
}

function cue(session: Session, focus: FocusTarget | null, say: Cue["say"]): Cue {
  return { n: session.cue.n + 1, focus, say };
}

/**
 * A service_error is never saved from here, so it can never replace an earlier plan: the spec section 8 rule keeps its
 * one owner, F1's keepSnapshot. Clear needs a read, because its failure says "It is still on this device".
 */
export function canRun(session: Session, work: Work): boolean {
  const { shown, stored } = session;
  switch (work) {
    case "pdf":
      return true;
    case "save":
      return stored.kind === "read" && stored.state?.snapshot?.id !== shown.id && shown.result.state !== "service_error";
    case "clear":
      return stored.kind === "read" && stored.state !== null;
    case "undo":
      return stored.kind === "cleared" && stored.undo !== null;
  }
}

/** The earlier saved result to offer beside a service_error (spec.md section 8). Null while storage is unread. */
export function earlierOf(session: Session): CompletedSnapshot | null {
  const { shown, stored } = session;
  if (shown.result.state !== "service_error" || stored.kind !== "read") return null;
  const saved = stored.state?.snapshot ?? null;
  return saved !== null && saved.id !== shown.id && saved.result.state !== "service_error" ? saved : null;
}

export type Kept =
  | { readonly kind: "checking" }
  | { readonly kind: "not_saving"; readonly problem: Problem }
  | { readonly kind: "saved" }
  /** Storage was read and holds nothing, or another result that is not an earlier plan beside a service_error. */
  | { readonly kind: "not_saved" }
  | { readonly kind: "earlier"; readonly earlier: CompletedSnapshot }
  | { readonly kind: "cleared"; readonly setAside: boolean };

export function keptOf(session: Session): Kept {
  const { shown, stored } = session;
  switch (stored.kind) {
    case "checking":
      return { kind: "checking" };
    case "not_saving":
      return { kind: "not_saving", problem: stored.problem };
    case "cleared":
      return { kind: "cleared", setAside: stored.setAside };
    case "read": {
      if (stored.state?.snapshot?.id === shown.id) return { kind: "saved" };
      const earlier = earlierOf(session);
      return earlier === null ? { kind: "not_saved" } : { kind: "earlier", earlier };
    }
  }
}
