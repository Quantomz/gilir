process.env.TZ = "America/Los_Angeles";
import { describe, expect, it } from "vitest";
import { storageProblem } from "@/client/storage";
import type { LocalState } from "@/client/storage";
import { completedSnapshotSchema } from "@/contracts";
import type { CompletedSnapshot } from "@/contracts";
import { actionsCard, spoken } from "@/features/results/model/actions";
import type { ActionButton, ActionsCard } from "@/features/results/model/actions";
import type { ResultPage } from "@/features/results/model/blocks";
import { startSession, update } from "@/features/results/model/session";
import type { Problem, Session, SessionEvent, Work } from "@/features/results/model/session";
import { formatIn } from "@/features/results/model/words";
import { savedState } from "../support/ports";
import { everySnapshot, shared } from "../support/variants";

const format = formatIn("en-GB");
const plan = shared("plan");
const noPlan = shared("insufficient_data");
const error = shared("service_error");
const earlierPlan = completedSnapshotSchema.parse({ ...plan, id: "synthetic-earlier-plan", completedAt: "2026-05-20T15:00:00Z" });

const refused = storageProblem(new Error("The fake port refused."));
const full = storageProblem(new DOMException("", "QuotaExceededError"));
const newer = storageProblem(new DOMException("", "VersionError"));
const readOk = (state: LocalState | null): SessionEvent => ({ kind: "read", outcome: { ok: true, state } });
const readRefused = (problem: Problem): SessionEvent => ({ kind: "read", outcome: { ok: false, problem } });
const readFailed = readRefused(refused);
const started = (work: Work): SessionEvent => ({ kind: "started", work });
const failedCall = (work: Work, problem = refused): SessionEvent =>
  work === "pdf" ? { kind: "settled", work, outcome: { ok: false } } : { kind: "settled", work, outcome: { ok: false, problem } };
const clearedOk = (undo: LocalState | null, setAside = false): SessionEvent => ({ kind: "settled", work: "clear", outcome: { ok: true, undo, setAside } });

function at(shown: CompletedSnapshot, ...events: readonly SessionEvent[]): Session {
  return events.reduce(update, startSession(shown));
}

function kindOf(snapshot: CompletedSnapshot): ResultPage["kind"] {
  return snapshot.result.state === "plan" || snapshot.result.state === "plan_with_warnings" ? "plan" : "no_plan";
}

function card(session: Session): ActionsCard {
  return actionsCard(session, kindOf(session.shown), format);
}

const listed = (buttons: readonly ActionButton[]) => buttons.map(({ id, label, look }) => [id, label, look]);

function allText(of: ActionsCard): readonly string[] {
  const buttons = [...of.buttons, ...(of.kept?.button ? [of.kept.button] : [])];
  return [of.title, of.kept?.text ?? "", of.alert ?? "", ...buttons.map(button => button.label)];
}

describe("actionsCard", () => {
  it("[R34] a plan lists Download PDF (primary), View details, Change my answers, then Clear saved data (quiet) when something is saved", () => {
    const saved = card(at(plan, readOk(savedState(plan))));
    expect(saved.title).toBe("What you can do");
    expect(listed(saved.buttons)).toEqual([
      ["pdf", "Download PDF", "primary"],
      ["details", "View details", "plain"],
      ["change", "Change my answers", "plain"],
      ["clear", "Clear saved data", "quiet"],
    ]);
    expect(saved.buttons.map(button => button.icon)).toEqual(["download", "info", "edit", "close"]);

    expect(listed(card(at(plan, readOk(null))).buttons)).toEqual([
      ["pdf", "Download PDF", "primary"],
      ["details", "View details", "plain"],
      ["change", "Change my answers", "plain"],
    ]);
    expect(listed(card(at(shared("plan_with_warnings"), readOk(null))).buttons).map(([id]) => id)).toEqual(["pdf", "details", "change"]);
  });

  it("[R30][R34] a no-plan result lists Change my answers (primary) first, then Download PDF, View details, Clear saved data", () => {
    for (const shown of [noPlan, shared("search_incomplete"), shared("no_calendar_fit"), error]) {
      expect(listed(card(at(shown, readOk(savedState(shown)))).buttons)).toEqual([
        ["change", "Change my answers", "primary"],
        ["pdf", "Download PDF", "plain"],
        ["details", "View details", "plain"],
        ["clear", "Clear saved data", "quiet"],
      ]);
    }
  });

  it("[R28] a service_error with an earlier plan adds Open my earlier plan after Change my answers, and the saved line names its original date", () => {
    const withEarlier = card(at(error, readOk(savedState(earlierPlan))));
    expect(listed(withEarlier.buttons)).toEqual([
      ["change", "Change my answers", "primary"],
      ["earlier", "Open my earlier plan", "plain"],
      ["pdf", "Download PDF", "plain"],
      ["details", "View details", "plain"],
      ["clear", "Clear saved data", "quiet"],
    ]);
    expect(withEarlier.buttons[1]?.icon).toBe("plan");
    expect(withEarlier.kept).toEqual({
      tone: "info",
      icon: "info",
      text: "This result isn’t saved. Your earlier plan, made 20 May 2026, is still saved on this device.",
      button: null,
    });

    expect(card(at(error, readOk(null))).buttons.map(button => button.id)).not.toContain("earlier");
    expect(card(at(error)).buttons.map(button => button.id)).not.toContain("earlier");
  });

  it("[R28] an earlier saved result that has no plan is called a result, never a plan", () => {
    const withEarlier = card(at(error, readOk(savedState(noPlan))));
    expect(withEarlier.buttons.find(button => button.id === "earlier")?.label).toBe("Open my earlier result");
    expect(withEarlier.kept?.text).toBe("This result isn’t saved. Your earlier result, made 30 Jun 2026, is still saved on this device.");
    expect(allText(withEarlier).join("\n")).not.toContain("earlier plan");
  });

  it("[R25] the saved line reads Saved on this device., This plan isn’t saved on this device. with Save on this device, or the not-saving note with the PDF advice and no Save or Clear", () => {
    expect(card(at(plan)).kept).toBeNull();

    expect(card(at(plan, readOk(savedState(plan)))).kept).toEqual({ tone: "ok", icon: "check", text: "Saved on this device.", button: null });

    const notSaved = card(at(plan, readOk(savedState(noPlan))));
    expect(notSaved.kept?.text).toBe("This plan isn’t saved on this device.");
    expect(notSaved.kept?.tone).toBe("info");
    expect(notSaved.kept?.button).toEqual({ id: "save", icon: "save", label: "Save on this device", look: "inline", busy: false, waiting: false });

    const notSaving = card(at(plan, readFailed));
    expect(notSaving.kept).toEqual({
      tone: "warn",
      icon: "alert",
      text: "This browser isn’t saving here, so this plan stays only while this page is open. Download the PDF to keep a copy.",
      button: null,
    });
    expect(notSaving.buttons.map(button => button.id)).toEqual(["pdf", "details", "change"]);
  });

  it("[R25] a read refused by a newer Gilir or a full device names it in F4’s words, then what happens to this result; the polite line says the same words", () => {
    const stays = "stays here while this page is open. Download the PDF to keep a copy.";
    const cases: readonly [Problem, CompletedSnapshot, string][] = [
      [newer, plan, `${newer.text} This plan ${stays}`],
      [full, noPlan, `${full.text} This result ${stays}`],
      [refused, plan, "This browser isn’t saving here, so this plan stays only while this page is open. Download the PDF to keep a copy."],
    ];
    expect(newer.text).toBe("Gilir has a newer version. Close this page and open Gilir again to see what you saved.");
    for (const [problem, shown, words] of cases) {
      const session = at(shown, readRefused(problem));
      expect(card(session).kept).toEqual({ tone: "warn", icon: "alert", text: words, button: null });
      expect(card(session).buttons.map(button => button.id)).not.toContain("clear");
      expect(session.cue.say).toBe("notSaving");
      expect(spoken(session, "notSaving")).toBe(words);
    }
    expect(spoken(at(plan, readOk(null)), "pdfMade")).toBe("The PDF was made. Look in your downloads.");
  });

  it("[R25] a saved no-plan result reads This result is saved on this device.", () => {
    expect(card(at(noPlan, readOk(savedState(noPlan)))).kept?.text).toBe("This result is saved on this device.");
    expect(card(at(noPlan, readOk(null))).kept?.text).toBe("This result isn’t saved on this device.");
    expect(card(at(error, readOk(null))).kept).toEqual({ tone: "info", icon: "info", text: "This result isn’t saved on this device.", button: null });
  });

  it("[R26] after a clear the line reads Your saved answers and plan are cleared. … with Undo, and Clear saved data is gone", () => {
    const cleared = card(at(plan, readOk(savedState(plan)), started("clear"), clearedOk(savedState(plan))));
    expect(cleared.kept).toEqual({
      tone: "info",
      icon: "info",
      text: "Your saved answers and plan are cleared. This plan stays on this page until you leave it.",
      button: { id: "undo", icon: "undo", label: "Undo", look: "inline", busy: false, waiting: false },
    });
    expect(cleared.buttons.map(button => button.id)).toEqual(["pdf", "details", "change"]);

    const clearedNothing = card(at(noPlan, readOk(savedState(null)), started("clear"), clearedOk(null)));
    expect(clearedNothing.kept?.text).toBe("Your saved answers and plan are cleared. This result stays on this page until you leave it.");
    expect(clearedNothing.kept?.button).toBeNull();
  });

  it("[R26] a clear that also removed data this version could not open says so, and that Undo can’t bring it back", () => {
    const cleared = card(at(plan, readOk(savedState(plan)), started("clear"), clearedOk(savedState(plan), true)));
    expect(cleared.kept?.text).toBe(
      "Your saved answers and plan are cleared. This plan stays on this page until you leave it. Saved data this version of Gilir couldn’t open was cleared too. Undo can’t bring that back.",
    );
    expect(cleared.kept?.button?.label).toBe("Undo");
  });

  it("[R26] an Undo that finds something saved since the clear alerts that it was kept and nothing was put back; the saved line then reads what is stored", () => {
    const cleared = at(plan, readOk(savedState(plan)), started("clear"), clearedOk(savedState(plan)), started("undo"));
    const kept = card(update(cleared, { kind: "settled", work: "undo", outcome: { ok: true, state: savedState(noPlan), restored: false } }));
    expect(kept.alert).toBe("Something was saved on this device after you cleared it. We kept it, so your earlier answers and plan were not put back.");
    expect(kept.kept?.text).toBe("This plan isn’t saved on this device.");
    expect(kept.kept?.button?.id).toBe("save");
    const keptThis = card(update(cleared, { kind: "settled", work: "undo", outcome: { ok: true, state: savedState(plan), restored: false } }));
    expect(keptThis.kept?.text).toBe("Saved on this device.");
  });

  it("[R24] a failed call shows its words from words.failures as the one alert; a new attempt removes it", () => {
    const failures: readonly [Session, string][] = [
      [at(plan, readOk(null), started("pdf"), failedCall("pdf")), "We couldn’t make the PDF. Your plan is still here on this page. You can try again."],
      [at(noPlan, readOk(null), started("pdf"), failedCall("pdf")), "We couldn’t make the PDF. Your result is still here on this page. You can try again."],
      [at(plan, readOk(null), started("save"), failedCall("save")), "We couldn’t save this on this device. It stays here while this page is open. Download the PDF to keep a copy."],
      [at(plan, readOk(savedState(plan)), started("clear"), failedCall("clear")), "We couldn’t clear the saved data. It is still on this device."],
      [at(plan, readOk(savedState(plan)), started("clear"), clearedOk(savedState(plan)), started("undo"), failedCall("undo")), "We couldn’t put your saved answers and plan back."],
    ];
    for (const [session, words] of failures) {
      expect(card(session).alert).toBe(words);
      expect(card(update(session, started(session.failed?.work ?? "pdf"))).alert).toBeNull();
    }
    expect(card(at(plan, readOk(null))).alert).toBeNull();
  });

  it("[R25][R26] a full device or a newer Gilir is named in F4’s words, with F3’s sentence on what happens next; refused storage, and a full device on a clear, keep F3’s own words", () => {
    expect([full.reason, newer.reason, refused.reason]).toEqual(["full", "newer", "unavailable"]);
    const saved = (problem: typeof full) => card(at(plan, readOk(null), started("save"), failedCall("save", problem))).alert;
    const cleared = (problem: typeof full) => card(at(plan, readOk(savedState(plan)), started("clear"), failedCall("clear", problem))).alert;
    const undone = (problem: typeof full) =>
      card(at(noPlan, readOk(savedState(plan)), started("clear"), clearedOk(savedState(plan)), started("undo"), failedCall("undo", problem))).alert;

    expect(saved(full)).toBe(`${full.text} This plan stays here while this page is open. Download the PDF to keep a copy.`);
    expect(saved(newer)).toBe(`${newer.text} This plan stays here while this page is open. Download the PDF to keep a copy.`);
    expect(saved(refused)).toBe("We couldn’t save this on this device. It stays here while this page is open. Download the PDF to keep a copy.");
    expect(saved(refused)).not.toContain(refused.text);
    expect(cleared(newer)).toBe(`We couldn’t clear the saved data. It is still on this device. ${newer.text}`);
    expect(cleared(refused)).toBe("We couldn’t clear the saved data. It is still on this device.");
    expect(cleared(full)).toBe("We couldn’t clear the saved data. It is still on this device.");
    expect(undone(full)).toBe(`We couldn’t put your saved answers and plan back. ${full.text}`);
    expect(undone(refused)).toBe("We couldn’t put your saved answers and plan back.");
    expect(full.text).toBe("This device has no room left to save Gilir.");
  });

  it("a busy button carries its pending words and busy; the other port buttons are waiting; View details and Change my answers are neither", () => {
    const making = card(at(plan, readOk(savedState(plan)), started("pdf")));
    expect(making.buttons.map(({ id, label, busy, waiting }) => [id, label, busy, waiting])).toEqual([
      ["pdf", "Making the PDF…", true, false],
      ["details", "View details", false, false],
      ["change", "Change my answers", false, false],
      ["clear", "Clear saved data", false, true],
    ]);

    const saving = card(at(plan, readOk(null), started("save")));
    expect(saving.kept?.button).toMatchObject({ id: "save", label: "Saving…", busy: true, waiting: false });
    expect(saving.buttons.find(button => button.id === "pdf")).toMatchObject({ label: "Download PDF", busy: false, waiting: true });

    const clearing = card(at(plan, readOk(savedState(plan)), started("clear")));
    expect(clearing.buttons.find(button => button.id === "clear")).toMatchObject({ label: "Clearing…", busy: true, waiting: false });

    const restoring = card(at(plan, readOk(savedState(plan)), started("clear"), clearedOk(savedState(plan)), started("undo")));
    expect(restoring.kept?.button).toMatchObject({ id: "undo", label: "Putting it back…", busy: true, waiting: false });
    expect(restoring.buttons.find(button => button.id === "pdf")).toMatchObject({ busy: false, waiting: true });

    const errorMaking = card(at(error, readOk(savedState(earlierPlan)), started("pdf")));
    expect(errorMaking.buttons.find(button => button.id === "earlier")).toMatchObject({ busy: false, waiting: false });
  });

  it("[R24] no label, line or alert contains a thrown message", () => {
    const thrown = ["Error", "Local storage failed", "fake port", "refused"];
    for (const { snapshot } of everySnapshot()) {
      const sessions = [
        at(snapshot),
        at(snapshot, readFailed, started("pdf"), failedCall("pdf")),
        at(snapshot, readOk(null), started("save"), failedCall("save")),
        at(snapshot, readOk(savedState(snapshot)), started("clear"), failedCall("clear")),
        at(snapshot, readOk(savedState(snapshot)), started("clear"), clearedOk(savedState(snapshot)), started("undo"), failedCall("undo")),
        at(snapshot, readOk(savedState(earlierPlan))),
      ];
      for (const session of sessions) {
        const text = allText(card(session)).join("\n");
        for (const words of thrown) expect(text, `${snapshot.id}`).not.toContain(words);
      }
    }
  });
});
