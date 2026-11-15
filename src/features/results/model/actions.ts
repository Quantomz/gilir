import type { IconName, ResultPage, Tone } from "./blocks";
import { canRun, earlierOf, keptOf } from "./session";
import type { ActionId, Cue, Failure, Session, Work } from "./session";
import { actions, failures, kept, nounOf, pdfMade, undoKeptNewer } from "./words";
import type { Noun } from "./words";
import type { Format } from "./words";

export interface ActionButton {
  readonly id: ActionId;
  readonly icon: IconName;
  readonly label: string;
  /** "primary": the main action, first in the list. "quiet": Clear saved data. "inline": inside the saved line. */
  readonly look: "primary" | "plain" | "quiet" | "inline";
  /** This button's call is running: aria-busy, and a second tap does nothing. */
  readonly busy: boolean;
  /** Another call is running: aria-disabled, never the disabled attribute, so focus stays where it is. */
  readonly waiting: boolean;
}

export interface ActionsCard {
  readonly title: string;
  /** Null while storage has not answered. */
  readonly kept: { readonly tone: Tone; readonly icon: IconName; readonly text: string; readonly button: ActionButton | null } | null;
  readonly alert: string | null;
  readonly buttons: readonly ActionButton[];
}

/**
 * The first one that shows is the main action. Without a plan that is Change my answers, because Results has no retry
 * port and changing the answers is how a farmer tries again.
 */
const buttonOrder: Record<ResultPage["kind"], readonly ActionId[]> = {
  plan: ["pdf", "details", "change", "clear"],
  no_plan: ["change", "earlier", "pdf", "details", "clear"],
};

const icons: Record<ActionId, IconName> = {
  pdf: "download",
  details: "info",
  change: "edit",
  earlier: "plan",
  clear: "close",
  save: "save",
  undo: "undo",
};

export function actionsCard(session: Session, kind: ResultPage["kind"], format: Format): ActionsCard {
  const noun = nounOf(session.shown);
  const earlier = earlierOf(session);
  const button = (id: ActionId, label: string, look: ActionButton["look"]): ActionButton => {
    const busy = session.busy === id;
    return {
      id,
      icon: icons[id],
      label: busy && isWork(id) ? actions.busy[id] : label,
      look,
      busy,
      waiting: isWork(id) && session.busy !== null && !busy,
    };
  };
  const listed = buttonOrder[kind].flatMap((id): { readonly id: ActionId; readonly label: string }[] => {
    if (id === "earlier") return earlier === null ? [] : [{ id, label: actions.openEarlier(nounOf(earlier)) }];
    if (id === "clear" && !canRun(session, id)) return [];
    return [{ id, label: actions.labels[id] }];
  });
  const offer = (work: "save" | "undo") => (canRun(session, work) ? button(work, actions.labels[work], "inline") : null);
  return {
    title: actions.title,
    kept: keptLine(session, format, offer),
    alert: session.failed === null ? null : alertOf(session.failed, noun),
    buttons: listed.map(({ id, label }, index) => button(id, label, id === "clear" ? "quiet" : index === 0 ? "primary" : "plain")),
  };
}

function keptLine(session: Session, format: Format, offer: (work: "save" | "undo") => ActionButton | null): ActionsCard["kept"] {
  const noun = nounOf(session.shown);
  const now = keptOf(session);
  switch (now.kind) {
    case "checking":
      return null;
    case "saved":
      return { tone: "ok", icon: "check", text: kept.saved[noun], button: null };
    case "not_saved":
      return { tone: "info", icon: "info", text: kept.notSaved(noun), button: offer("save") };
    case "not_saving":
      return { tone: "warn", icon: "alert", text: kept.notSaving(noun, now.problem), button: null };
    case "earlier":
      return { tone: "info", icon: "info", text: kept.earlier(nounOf(now.earlier), format.madeOn(now.earlier.completedAt)), button: null };
    case "cleared":
      return { tone: "info", icon: "info", text: kept.cleared(noun, now.setAside), button: offer("undo") };
  }
}

function alertOf(failure: Failure, noun: Noun): string {
  return failure.kind === "kept_newer" ? undoKeptNewer : failures[failure.work](noun, failure.problem);
}

export function spoken(session: Session, say: NonNullable<Cue["say"]>): string {
  if (say === "pdfMade") return pdfMade;
  const now = keptOf(session);
  return now.kind === "not_saving" ? kept.notSaving(nounOf(session.shown), now.problem) : "";
}

function isWork(id: ActionId): id is Work {
  return id === "pdf" || id === "save" || id === "clear" || id === "undo";
}
