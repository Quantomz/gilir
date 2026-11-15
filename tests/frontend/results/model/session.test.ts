import { describe, expect, it } from "vitest";
import { storageProblem } from "@/client/storage";
import type { LocalState } from "@/client/storage";
import { completedSnapshotSchema } from "@/contracts";
import { canRun, earlierOf, keptOf, startSession, update } from "@/features/results/model/session";
import type { Session, SessionEvent, Work } from "@/features/results/model/session";
import { savedState } from "../support/ports";
import { shared } from "../support/variants";

const plan = shared("plan");
const error = shared("service_error");
const noPlan = shared("insufficient_data");
const olderError = completedSnapshotSchema.parse({ ...error, id: "synthetic-older-error" });

const refused = storageProblem(new Error("The fake port refused."));
const readOk = (state: LocalState | null): SessionEvent => ({ kind: "read", outcome: { ok: true, state } });
const readFailed: SessionEvent = { kind: "read", outcome: { ok: false, problem: refused } };
const started = (work: Work): SessionEvent => ({ kind: "started", work });
const failedCall = (work: Work, problem = refused): SessionEvent =>
  work === "pdf" ? { kind: "settled", work, outcome: { ok: false } } : { kind: "settled", work, outcome: { ok: false, problem } };

function after(session: Session, ...events: readonly SessionEvent[]): Session {
  return events.reduce(update, session);
}

const savedPlan = savedState(plan);

describe("update", () => {
  it("startSession shows the given result, the result view, storage checking, nothing busy or failed, cue 0", () => {
    const session = startSession(plan);
    expect(session.shown).toBe(plan);
    expect(session).toEqual({ shown: plan, view: "result", stored: { kind: "checking" }, busy: null, failed: null, cue: { n: 0, focus: null, say: null } });
  });

  it("[R25] read ok sets stored to read; read not ok sets not_saving and cues say notSaving; a second read is ignored", () => {
    const read = after(startSession(plan), readOk(savedPlan));
    expect(read.stored).toEqual({ kind: "read", state: savedPlan });
    expect(read.cue).toEqual({ n: 0, focus: null, say: null });
    expect(after(startSession(plan), readOk(null)).stored).toEqual({ kind: "read", state: null });

    const failed = after(startSession(plan), readFailed);
    expect(failed.stored).toEqual({ kind: "not_saving", problem: refused });
    expect(failed.cue).toEqual({ n: 1, focus: null, say: "notSaving" });

    expect(update(read, readFailed)).toBe(read);
    expect(update(failed, readOk(savedPlan))).toBe(failed);
  });

  it("started sets busy and clears failed; a second started while busy returns the same session object", () => {
    const failedPdf = after(startSession(plan), readOk(null), started("pdf"), failedCall("pdf"));
    expect(failedPdf.failed?.work).toBe("pdf");

    const running = update(failedPdf, started("pdf"));
    expect(running.busy).toBe("pdf");
    expect(running.failed).toBeNull();

    expect(update(running, started("save"))).toBe(running);
    expect(update(running, started("pdf"))).toBe(running);
  });

  it("started for a call canRun refuses returns the same session object", () => {
    const checking = startSession(plan);
    expect(update(checking, started("clear"))).toBe(checking);
    expect(update(checking, started("save"))).toBe(checking);

    const nothingSaved = after(startSession(plan), readOk(null));
    expect(update(nothingSaved, started("clear"))).toBe(nothingSaved);
    expect(update(nothingSaved, started("undo"))).toBe(nothingSaved);

    const alreadySaved = after(startSession(plan), readOk(savedPlan));
    expect(update(alreadySaved, started("save"))).toBe(alreadySaved);

    const errorShown = after(startSession(error), readOk(null));
    expect(update(errorShown, started("save"))).toBe(errorShown);
  });

  it("[R23] settled pdf ok clears busy and cues say pdfMade; focus does not move", () => {
    const running = after(startSession(plan), readOk(savedPlan), started("pdf"));
    const made = update(running, { kind: "settled", work: "pdf", outcome: { ok: true } });
    expect(made.busy).toBeNull();
    expect(made.failed).toBeNull();
    expect(made.cue).toEqual({ n: running.cue.n + 1, focus: null, say: "pdfMade" });
  });

  it("[R24] settled pdf not ok sets failed pdf and leaves shown, view and stored as they were", () => {
    const running = after(startSession(plan), readOk(savedPlan), started("pdf"));
    const failed = update(running, failedCall("pdf"));
    expect(failed.busy).toBeNull();
    expect(failed.failed?.work).toBe("pdf");
    expect(failed.shown).toBe(plan);
    expect(failed.view).toBe("result");
    expect(failed.stored).toBe(running.stored);
    expect(failed.cue).toBe(running.cue);
  });

  it("[R25] settled save ok sets stored to the written state and cues focus kept; not ok sets failed save", () => {
    const running = after(startSession(plan), readOk(null), started("save"));
    const written: LocalState = { draft: null, step: 1, activeJob: null, snapshot: plan };
    const saved = update(running, { kind: "settled", work: "save", outcome: { ok: true, state: written } });
    expect(saved.busy).toBeNull();
    expect(saved.stored).toEqual({ kind: "read", state: written });
    expect(saved.cue).toEqual({ n: running.cue.n + 1, focus: "kept", say: null });
    expect(keptOf(saved)).toEqual({ kind: "saved" });

    const failed = update(running, failedCall("save"));
    expect(failed.failed?.work).toBe("save");
    expect(failed.stored).toEqual({ kind: "read", state: null });
    expect(failed.cue).toBe(running.cue);
  });

  it("[R26] settled clear ok sets stored cleared with the undo state and cues focus kept; not ok sets failed clear and stored is unchanged", () => {
    const running = after(startSession(plan), readOk(savedPlan), started("clear"));
    const cleared = update(running, { kind: "settled", work: "clear", outcome: { ok: true, undo: savedPlan, setAside: false } });
    expect(cleared.busy).toBeNull();
    expect(cleared.stored).toEqual({ kind: "cleared", undo: savedPlan, setAside: false });
    expect(cleared.cue).toEqual({ n: running.cue.n + 1, focus: "kept", say: null });
    expect(cleared.shown).toBe(plan);
    expect(keptOf(cleared)).toEqual({ kind: "cleared", setAside: false });
    const alsoSetAside = update(running, { kind: "settled", work: "clear", outcome: { ok: true, undo: savedPlan, setAside: true } });
    expect(keptOf(alsoSetAside)).toEqual({ kind: "cleared", setAside: true });

    const failed = update(running, failedCall("clear"));
    expect(failed.failed?.work).toBe("clear");
    expect(failed.stored).toEqual({ kind: "read", state: savedPlan });
  });

  it("[R26] settled undo ok sets stored to the restored state; not ok sets failed undo and keeps cleared, so Undo can be tried again", () => {
    const cleared = after(startSession(plan), readOk(savedPlan), started("clear"), { kind: "settled", work: "clear", outcome: { ok: true, undo: savedPlan, setAside: false } });
    const running = update(cleared, started("undo"));
    expect(running.busy).toBe("undo");

    const restored = update(running, { kind: "settled", work: "undo", outcome: { ok: true, state: savedPlan, restored: true } });
    expect(restored.stored).toEqual({ kind: "read", state: savedPlan });
    expect(restored.failed).toBeNull();
    expect(restored.cue).toEqual({ n: running.cue.n + 1, focus: "kept", say: null });
    expect(keptOf(restored)).toEqual({ kind: "saved" });

    const failed = update(running, failedCall("undo"));
    expect(failed.failed).toEqual({ kind: "refused", work: "undo", problem: refused });
    expect(failed.stored).toEqual({ kind: "cleared", undo: savedPlan, setAside: false });
    expect(canRun(failed, "undo")).toBe(true);
    expect(update(failed, started("undo")).busy).toBe("undo");
  });

  it("[R26] an Undo that finds something saved since the clear keeps it: stored holds that, the failure says so, Undo is gone and focus goes to the saved line", () => {
    const cleared = after(startSession(plan), readOk(savedPlan), started("clear"), { kind: "settled", work: "clear", outcome: { ok: true, undo: savedPlan, setAside: false } });
    const running = update(cleared, started("undo"));
    const newer = savedState(noPlan);
    const kept = update(running, { kind: "settled", work: "undo", outcome: { ok: true, state: newer, restored: false } });
    expect(kept.stored).toEqual({ kind: "read", state: newer });
    expect(kept.failed).toEqual({ kind: "kept_newer", work: "undo" });
    expect(kept.cue).toEqual({ n: running.cue.n + 1, focus: "kept", say: null });
    expect(canRun(kept, "undo")).toBe(false);
    expect(keptOf(kept)).toEqual({ kind: "not_saved" });
  });

  it("a settled event for a call that is not busy is ignored (a late answer)", () => {
    const idle = after(startSession(plan), readOk(null));
    expect(update(idle, { kind: "settled", work: "pdf", outcome: { ok: true } })).toBe(idle);
    expect(update(idle, failedCall("save"))).toBe(idle);

    const making = update(idle, started("pdf"));
    expect(update(making, { kind: "settled", work: "save", outcome: { ok: true, state: savedPlan } })).toBe(making);
    expect(update(making, { kind: "settled", work: "clear", outcome: { ok: true, undo: null, setAside: false } })).toBe(making);

    const done = update(making, { kind: "settled", work: "pdf", outcome: { ok: true } });
    expect(update(done, { kind: "settled", work: "pdf", outcome: { ok: false } })).toBe(done);
  });

  it("[R34] opened_details and closed_details switch the view and cue focus title, then details_button", () => {
    const result = after(startSession(plan), readOk(null));
    const details = update(result, { kind: "opened_details" });
    expect(details.view).toBe("details");
    expect(details.cue).toEqual({ n: result.cue.n + 1, focus: "title", say: null });
    expect(update(details, { kind: "opened_details" })).toBe(details);

    const back = update(details, { kind: "closed_details" });
    expect(back.view).toBe("result");
    expect(back.cue).toEqual({ n: details.cue.n + 1, focus: "details_button", say: null });
    expect(update(back, { kind: "closed_details" })).toBe(back);
  });

  it("[R28] opened_earlier shows the saved earlier result on the result view, clears failed and cues focus title", () => {
    const withAlert = after(startSession(error), readOk(savedPlan), started("pdf"), failedCall("pdf"));
    expect(withAlert.failed?.work).toBe("pdf");

    const opened = update(withAlert, { kind: "opened_earlier" });
    expect(opened.shown).toBe(plan);
    expect(opened.view).toBe("result");
    expect(opened.failed).toBeNull();
    expect(opened.cue).toEqual({ n: withAlert.cue.n + 1, focus: "title", say: null });
    expect(keptOf(opened)).toEqual({ kind: "saved" });
    expect(update(opened, { kind: "opened_earlier" })).toBe(opened);
  });

  it("[R28] opened_earlier without an earlier result is ignored", () => {
    const sessions = [
      startSession(error),
      after(startSession(error), readFailed),
      after(startSession(error), readOk(null)),
      after(startSession(error), readOk(savedState(olderError))),
      after(startSession(plan), readOk(savedState(noPlan))),
    ];
    for (const session of sessions) expect(update(session, { kind: "opened_earlier" })).toBe(session);
  });

  it("each cue has n one higher than the last", () => {
    const steps: SessionEvent[] = [
      readFailed,
      { kind: "opened_details" },
      { kind: "closed_details" },
      started("pdf"),
      { kind: "settled", work: "pdf", outcome: { ok: true } },
      started("pdf"),
      failedCall("pdf"),
      { kind: "opened_details" },
    ];
    let session = startSession(plan);
    const numbers: number[] = [];
    for (const event of steps) {
      session = update(session, event);
      numbers.push(session.cue.n);
    }
    expect(numbers).toEqual([1, 2, 3, 3, 4, 4, 4, 5]);
  });
});

describe("canRun, earlierOf and keptOf", () => {
  it("[R25] the same snapshot id in storage is saved; another id or nothing is not_saved; a rejected read is not_saving; unread is checking", () => {
    expect(keptOf(startSession(plan))).toEqual({ kind: "checking" });
    expect(keptOf(after(startSession(plan), readFailed))).toEqual({ kind: "not_saving", problem: refused });
    expect(keptOf(after(startSession(plan), readOk(savedPlan)))).toEqual({ kind: "saved" });
    expect(keptOf(after(startSession(plan), readOk(savedState(noPlan))))).toEqual({ kind: "not_saved" });
    expect(keptOf(after(startSession(plan), readOk(savedState(null))))).toEqual({ kind: "not_saved" });
    expect(keptOf(after(startSession(plan), readOk(null)))).toEqual({ kind: "not_saved" });
    expect(keptOf(after(startSession(error), readOk(savedState(error))))).toEqual({ kind: "saved" });
  });

  it("save is runnable only after a read that does not hold the shown result", () => {
    expect(canRun(startSession(plan), "save")).toBe(false);
    expect(canRun(after(startSession(plan), readFailed), "save")).toBe(false);
    expect(canRun(after(startSession(plan), readOk(savedPlan)), "save")).toBe(false);
    expect(canRun(after(startSession(plan), readOk(null)), "save")).toBe(true);
    expect(canRun(after(startSession(plan), readOk(savedState(noPlan))), "save")).toBe(true);
    expect(canRun(after(startSession(noPlan), readOk(savedPlan)), "save")).toBe(true);
  });

  it("[R28] a service_error with an earlier non-error snapshot in storage is earlier, with that snapshot", () => {
    const withPlan = after(startSession(error), readOk(savedPlan));
    expect(earlierOf(withPlan)).toBe(plan);
    expect(keptOf(withPlan)).toEqual({ kind: "earlier", earlier: plan });

    const withNoPlan = after(startSession(error), readOk(savedState(noPlan)));
    expect(earlierOf(withNoPlan)).toBe(noPlan);
    expect(keptOf(withNoPlan)).toEqual({ kind: "earlier", earlier: noPlan });
  });

  it("[R28] a service_error whose storage holds another service_error, or was not read, offers no earlier result", () => {
    const olderErrorSaved = after(startSession(error), readOk(savedState(olderError)));
    expect(earlierOf(olderErrorSaved)).toBeNull();
    expect(keptOf(olderErrorSaved)).toEqual({ kind: "not_saved" });

    expect(earlierOf(startSession(error))).toBeNull();
    expect(earlierOf(after(startSession(error), readFailed))).toBeNull();
    expect(earlierOf(after(startSession(error), readOk(null)))).toBeNull();
    expect(earlierOf(after(startSession(error), readOk(savedState(null))))).toBeNull();
    expect(earlierOf(after(startSession(error), readOk(savedState(error))))).toBeNull();
    expect(earlierOf(after(startSession(plan), readOk(savedState(noPlan))))).toBeNull();
  });

  it("[R28] save is never runnable for a service_error", () => {
    for (const state of [null, savedState(null), savedPlan, savedState(olderError), savedState(error)]) {
      expect(canRun(after(startSession(error), readOk(state)), "save")).toBe(false);
    }
  });

  it("[R24][R25] pdf is runnable in every state, including not_saving", () => {
    const sessions = [
      startSession(plan),
      after(startSession(plan), readFailed),
      after(startSession(plan), readOk(null)),
      after(startSession(plan), readOk(savedPlan)),
      after(startSession(plan), readOk(savedPlan), started("clear"), { kind: "settled", work: "clear", outcome: { ok: true, undo: savedPlan, setAside: false } }),
      after(startSession(error), readFailed),
      after(startSession(noPlan), readOk(null), started("pdf"), failedCall("pdf")),
    ];
    for (const session of sessions) expect(canRun(session, "pdf")).toBe(true);
  });

  it("[R26] clear is runnable only after a read that found a saved state: not while checking, not when not_saving, not when the read found nothing, not right after a clear", () => {
    expect(canRun(startSession(plan), "clear")).toBe(false);
    expect(canRun(after(startSession(plan), readFailed), "clear")).toBe(false);
    expect(canRun(after(startSession(plan), readOk(null)), "clear")).toBe(false);
    const cleared = after(startSession(plan), readOk(savedPlan), started("clear"), { kind: "settled", work: "clear", outcome: { ok: true, undo: savedPlan, setAside: false } });
    expect(canRun(cleared, "clear")).toBe(false);

    expect(canRun(after(startSession(plan), readOk(savedPlan)), "clear")).toBe(true);
    expect(canRun(after(startSession(plan), readOk(savedState(null))), "clear")).toBe(true);
  });

  it("[R26] undo is runnable only after a clear that found a state to put back", () => {
    const read = after(startSession(plan), readOk(savedPlan));
    expect(canRun(startSession(plan), "undo")).toBe(false);
    expect(canRun(read, "undo")).toBe(false);
    expect(canRun(after(startSession(plan), readFailed), "undo")).toBe(false);

    const clearedNothing = after(read, started("clear"), { kind: "settled", work: "clear", outcome: { ok: true, undo: null, setAside: false } });
    expect(canRun(clearedNothing, "undo")).toBe(false);
    const cleared = after(read, started("clear"), { kind: "settled", work: "clear", outcome: { ok: true, undo: savedPlan, setAside: false } });
    expect(canRun(cleared, "undo")).toBe(true);
  });
});
