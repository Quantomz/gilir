// The flow around the answers: which screen shows, the crop list, the job, issues, notices, the open sheet. Pure.
//
// One `Flow` value, changed only by `update(flow, msg)`. Everything else is derived from it:
//  - LocalState.activeJob is `activeJobOf(flow)` and LocalState.step is `stepOf(flow)`, never separate fields.
//  - The issues on a page are `issuesFor(flow, page)`: recomputed from the draft each render, plus pinned server
//    issues that still apply, so they cannot go stale.
// The controller runs the async parts (storage, catalogue, submit, polling) and feeds their results back as messages.
// `update` returns what the controller must do next as data: a note to say, a focus to move, a saved plan to hand off.
import type { Catalogue, CompletedSnapshot, FarmInput, JobCapability, ServiceFailure, Submission } from "@/contracts";
import type { LocalState } from "@/client/storage";
import { checkDraft, classify, pin, stillPinned, stepComplete, tidyIssues } from "./check";
import type { PageIssue, PinnedIssue } from "./check";
import { applyEdit, draftOf, emptyEditor, hasAnswers, historyMode, normalizeDraft, recordedEntries, sameAnswers } from "./draft";
import type { Draft, DraftEdit, EditNote, Editor } from "./draft";
import type { Span } from "./timeline";

/** One-based. LocalState.step has no defined base. Making is 4. */
export type Step = 1 | 2 | 3 | 4;
export type Progress = "queued" | "fetching" | "calculating";

export interface TrackedJob {
  readonly capability: JobCapability;
  readonly progress: Progress;
  /** False after policy.poll.unreachableAfter retryable read failures in a row. Making says it keeps trying. */
  readonly reachable: boolean;
}

export type Send =
  | { readonly kind: "idle" }
  | { readonly kind: "sending" }
  | { readonly kind: "unavailable"; readonly failure: ServiceFailure }; // the planner could not take the request

/**
 * What the farmer sees. "Making always has a job" is a type, not a check.
 * `editing.job` is a request still running after the farmer left Making with Back: page 4 shows
 * "A plan is being made from your answers. See how it’s going". It is polled only while Making shows.
 * `editing.asked` is true after Next was pressed on a page whose own minimum is missing (Next is never disabled), and
 * on page 4 after an action that needs the field-ready date first.
 */
export type Mode =
  | { readonly kind: "opening" }
  | { readonly kind: "editing"; readonly step: Step; readonly asked: boolean; readonly send: Send; readonly job: TrackedJob | null }
  | { readonly kind: "making"; readonly job: TrackedJob }
  | { readonly kind: "failed"; readonly failure: ServiceFailure };

type Editing = Extract<Mode, { readonly kind: "editing" }>;

/** The crop list lives in the Flow, loaded the first time page 2 or 4 opens. */
export type CatalogueState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly catalogue: Catalogue }
  | { readonly status: "failed" };

export type CatalogueEntry = Catalogue["entries"][number];

/** One quiet, dismissible line each. Never blocks input. */
export interface Notices {
  /** A load or save failed this visit. */
  readonly storageFailing: boolean;
  /** Change inputs found newer, different answers saved, and kept them. */
  readonly keptNewer: boolean;
}

/** The page 4 sheets. (The Text size sheet belongs to the top bar's Tools, so it also works on F3's Results screen.) */
export type Sheet =
  | { readonly kind: "add"; readonly within: Span | null }                            // Which crop grew here?
  | { readonly kind: "dates"; readonly entryId: string; readonly end: "planted" | "harvested"; readonly returnTo: FocusTarget }
  | { readonly kind: "gap"; readonly gap: Span }                                      // Not sure: {range}
  | { readonly kind: "empty"; readonly entryId: string };                             // Empty: {range}

/** Every control focus can be sent to. One list. Views take their DOM ids from `domIdOf`. */
export type FocusTarget =
  | { readonly kind: "title" }
  | { readonly kind: "summary" }                    // "Fix these first"
  | { readonly kind: "submitPanel" }
  | { readonly kind: "pageIssues"; readonly page: Step }
  | { readonly kind: "pageControl"; readonly page: 1 | 2 | 3 } // the control a blocked Next points at
  | { readonly kind: "planningStart" }
  | { readonly kind: "addCrop" }
  | { readonly kind: "alternative"; readonly choice: "empty" | "skipped" }
  | { readonly kind: "editDates"; readonly entryId: string }
  | { readonly kind: "handle"; readonly entryId: string; readonly end: "start" | "end" }
  | { readonly kind: "unsure"; readonly entryId: string }   // "Mark as not sure" on an empty time
  | { readonly kind: "crop"; readonly id: string };

export interface Flow {
  readonly mode: Mode;
  readonly editor: Editor;
  readonly catalogue: CatalogueState;
  /** Show the checker's issues on every page. Turns on at the first blocked "Make my plan". */
  readonly check: boolean;
  readonly serverIssues: readonly PinnedIssue[];
  readonly sheet: Sheet | null;
  /** The snapshot saved before this visit, for "Open my earlier plan" on the failed screen. */
  readonly earlierPlan: CompletedSnapshot | null;
  readonly notices: Notices;
  /** Notices the farmer closed. They stay closed for the rest of the visit. */
  readonly dismissed: readonly (keyof Notices)[];
  /** The words typed in "Find a crop" on page 2, as typed. Cleared when the farmer leaves page 2. */
  readonly cropFilter: string;
}

export type Msg =
  | { readonly kind: "opened"; readonly saved: LocalState | null; readonly initialInput: FarmInput | null }
  | { readonly kind: "catalogue"; readonly state: CatalogueState }
  | { readonly kind: "storage"; readonly health: "working" | "failing" }
  | { readonly kind: "dismiss"; readonly notice: keyof Notices }
  | { readonly kind: "edit"; readonly edit: DraftEdit }
  | { readonly kind: "filterCrops"; readonly text: string }                // "Find a crop" on page 2
  | { readonly kind: "next" }                                         // Next on pages 1 to 3
  | { readonly kind: "go"; readonly step: Step; readonly focus: FocusTarget | null } // Back, "Fix on page N"
  | { readonly kind: "sheet"; readonly sheet: Sheet | null }
  | { readonly kind: "blocked" }                                      // checkDraft said no: show issues
  | { readonly kind: "sending" }
  | { readonly kind: "submitted"; readonly submission: Submission; readonly draftAtSend: Draft }
  | { readonly kind: "progress"; readonly jobId: string; readonly progress: Progress }
  | { readonly kind: "reachable"; readonly jobId: string; readonly reachable: boolean }
  | { readonly kind: "jobFailed"; readonly jobId: string; readonly failure: ServiceFailure }
  | { readonly kind: "jobDone"; readonly jobId: string }              // completed and handed to onCompleted
  | { readonly kind: "showMaking" }                                   // "See how it’s going"
  | { readonly kind: "cancel" }                                       // Cancel on Making
  | { readonly kind: "changeAnswers" };                               // failed screen -> page 4

/** What `update` asks the controller to do after the commit. Effects as data, so the reducer stays pure. */
export interface Update {
  readonly flow: Flow;
  readonly note: EditNote;
  readonly focus: FocusTarget | null;
  /** Set only by "opened" when the entry rule finds a saved plan: the controller calls onCompleted once. */
  readonly handOff: CompletedSnapshot | null;
}

/** The flow before storage answers. Renders the Opening screen, which is also the prerendered HTML of "/". */
export const openingFlow: Flow = {
  mode: { kind: "opening" },
  editor: emptyEditor,
  catalogue: { status: "idle" },
  check: false,
  serverIssues: [],
  sheet: null,
  earlierPlan: null,
  notices: { storageFailing: false, keptNewer: false },
  dismissed: [],
  cropFilter: "",
};

const quiet: EditNote = { kind: "none" };
const title: FocusTarget = { kind: "title" };
const idle: Send = { kind: "idle" };
const nextStep: Record<1 | 2 | 3, Step> = { 1: 2, 2: 3, 3: 4 };
const previousStep: Record<2 | 3 | 4, Step> = { 2: 1, 3: 2, 4: 3 };

/**
 * The entry rule. Pure, so every row is a table test.
 *  1. saved.activeJob                          -> making (progress "queued" until the first read), whatever else is saved
 *  2. saved.snapshot && initialInput === null  -> handOff = snapshot (the controller calls onCompleted once)
 *  3. initialInput !== null (Change inputs, the fixture lab):
 *       a saved draft with answers that differ  -> that draft at its saved step, notices.keptNewer
 *       otherwise                               -> step 1 with draftOf(initialInput)
 *  4. a saved draft with answers               -> that draft at clampStep(saved.step)
 *  5. otherwise (nothing saved, or load threw) -> step 1, empty
 * earlierPlan is saved.snapshot in every row.
 */
export function openFlow(saved: LocalState | null, initialInput: FarmInput | null): {
  readonly flow: Flow;
  readonly handOff: CompletedSnapshot | null;
} {
  const savedDraft = saved?.draft ? normalizeDraft(saved.draft) : {};
  const savedStep = clampStep(saved?.step ?? 1);
  const base: Flow = { ...openingFlow, earlierPlan: saved?.snapshot ?? null };
  const editing = (draft: Draft, step: Step, keptNewer = false): Flow =>
    ({ ...base, mode: { kind: "editing", step, asked: false, send: idle, job: null }, editor: { draft, setAside: null }, notices: { ...base.notices, keptNewer } });

  if (saved?.activeJob) {
    const draft = hasAnswers(savedDraft) || initialInput === null ? savedDraft : draftOf(initialInput);
    const job: TrackedJob = { capability: saved.activeJob, progress: "queued", reachable: true };
    return { flow: { ...base, mode: { kind: "making", job }, editor: { draft, setAside: null } }, handOff: null };
  }
  if (saved?.snapshot && initialInput === null) return { flow: editing(savedDraft, savedStep), handOff: saved.snapshot };
  if (initialInput !== null) {
    const seeded = draftOf(initialInput);
    const newer = hasAnswers(savedDraft) && !sameAnswers(savedDraft, seeded);
    return { flow: newer ? editing(savedDraft, savedStep, true) : editing(seeded, 1), handOff: null };
  }
  return { flow: hasAnswers(savedDraft) ? editing(savedDraft, savedStep) : editing({}, 1), handOff: null };
}

/**
 * The one transition function. Idempotent where it matters: "opened" outside the opening mode, a second "submitted"
 * for a job already tracked, or a "progress" / "reachable" / "jobFailed" / "jobDone" for another jobId returns the
 * flow unchanged (Strict Mode double effects, late answers after Cancel).
 */
export function update(flow: Flow, msg: Msg): Update {
  const out = (next: Flow, focus: FocusTarget | null = null, note: EditNote = quiet, handOff: CompletedSnapshot | null = null): Update =>
    ({ flow: next, note, focus, handOff });
  const same = out(flow);
  const mode = flow.mode;
  const editingAt = (step: Step, job: TrackedJob | null, send: Send = idle): Editing =>
    ({ kind: "editing", step, asked: false, send, job });
  const forJob = (jobId: string) => mode.kind === "making" && mode.job.capability.jobId === jobId;

  switch (msg.kind) {
    case "opened": {
      if (mode.kind !== "opening") return same;
      const opened = openFlow(msg.saved, msg.initialInput);
      const notices = { ...opened.flow.notices, storageFailing: flow.notices.storageFailing };
      return out({ ...opened.flow, catalogue: flow.catalogue, notices, dismissed: flow.dismissed }, null, quiet, opened.handOff);
    }

    case "catalogue":
      return out({ ...flow, catalogue: msg.state });

    case "storage":
      if (msg.health === "working" || flow.notices.storageFailing || flow.dismissed.includes("storageFailing")) return same;
      return out({ ...flow, notices: { ...flow.notices, storageFailing: true } });

    case "dismiss": {
      const dismissed = flow.dismissed.includes(msg.notice) ? flow.dismissed : [...flow.dismissed, msg.notice];
      return out({ ...flow, notices: { ...flow.notices, [msg.notice]: false }, dismissed });
    }

    case "filterCrops":
      return out({ ...flow, cropFilter: msg.text });

    case "edit": {
      if (mode.kind !== "editing") return same;
      const result = applyEdit(flow.editor, msg.edit, readyCatalogue(flow.catalogue));
      const refused = result.note.kind === "datesRefused";
      const sheet = finishesSheet(msg.edit) && !refused ? null : flow.sheet;
      const focus = focusAfterEdit(msg.edit, flow.editor, result.editor, result.note, flow.sheet);
      return out({ ...flow, mode: { ...mode, asked: result.note.kind === "needDate" }, editor: result.editor, sheet }, focus, result.note);
    }

    case "next": {
      if (mode.kind !== "editing" || mode.step === 4) return same;
      if (!stepComplete(flow.editor.draft, mode.step, readyCatalogue(flow.catalogue))) {
        return out({ ...flow, mode: { ...mode, asked: true } }, { kind: "pageControl", page: mode.step });
      }
      return out(onStep(flow, { ...mode, step: nextStep[mode.step], asked: false }), title);
    }

    case "go": {
      const focus = msg.focus ?? title;
      if (mode.kind === "editing") {
        const send = msg.step === 4 || mode.send.kind !== "unavailable" ? mode.send : idle;
        return out(onStep(flow, { ...mode, step: msg.step, asked: false, send }), focus);
      }
      if (mode.kind === "making") return out(onStep(flow, editingAt(msg.step, mode.job)), focus);
      if (mode.kind === "failed") return out(onStep(flow, editingAt(msg.step, null)), focus);
      return same;
    }

    case "sheet":
      return out({ ...flow, sheet: msg.sheet }, msg.sheet === null ? focusAfterClose(flow.sheet) : null);

    case "blocked":
      if (mode.kind === "editing") {
        return out({ ...flow, check: true }, mode.step === 4 ? { kind: "summary" } : { kind: "pageIssues", page: mode.step });
      }
      if (mode.kind === "failed") return out(onStep({ ...flow, check: true }, editingAt(4, null)), { kind: "summary" });
      return same;

    case "sending":
      return mode.kind === "editing" ? out({ ...flow, mode: { ...mode, send: { kind: "sending" } } }) : same;

    case "submitted": {
      const submission = msg.submission;
      if (submission.kind === "accepted") {
        if (forJob(submission.capability.jobId)) return same;
        const job: TrackedJob = { capability: submission.capability, progress: "queued", reachable: true };
        return out({ ...flow, mode: { kind: "making", job }, check: false, serverIssues: [], sheet: null, cropFilter: "" }, title);
      }
      if (submission.kind === "invalid") {
        const serverIssues = submission.issues.map(issue => pin(classify(issue, msg.draftAtSend), msg.draftAtSend));
        const step = tidyIssues(serverIssues)[0]?.page ?? 4;
        const focus: FocusTarget = step === 4 ? { kind: "summary" } : { kind: "pageIssues", page: step };
        return out(onStep({ ...flow, check: true, serverIssues }, editingAt(step, null)), focus);
      }
      return out(onStep(flow, editingAt(4, null, { kind: "unavailable", failure: submission.failure })), { kind: "submitPanel" });
    }

    case "progress":
      if (!forJob(msg.jobId) || mode.kind !== "making") return same;
      return out({ ...flow, mode: { kind: "making", job: { ...mode.job, progress: msg.progress } } });

    case "reachable":
      if (!forJob(msg.jobId) || mode.kind !== "making" || mode.job.reachable === msg.reachable) return same;
      return out({ ...flow, mode: { kind: "making", job: { ...mode.job, reachable: msg.reachable } } });

    case "jobFailed":
      if (!forJob(msg.jobId)) return same;
      return out({ ...flow, mode: { kind: "failed", failure: msg.failure }, sheet: null }, title);

    case "jobDone":
      if (forJob(msg.jobId)) return out(onStep(flow, editingAt(4, null)), title);
      if (mode.kind === "editing" && mode.job?.capability.jobId === msg.jobId) return out({ ...flow, mode: { ...mode, job: null } });
      return same;

    case "showMaking":
      if (mode.kind !== "editing" || mode.job === null) return same;
      return out({ ...flow, mode: { kind: "making", job: mode.job }, sheet: null }, title);

    case "cancel":
      return mode.kind === "making" ? out(onStep(flow, editingAt(4, null)), title) : same;

    case "changeAnswers":
      return mode.kind === "failed" ? out(onStep(flow, editingAt(4, null)), title) : same;
  }
}

/** Back, from the in-app Back and from the phone's Back button alike. Null: leave the app (page 1). */
export function backOf(flow: Flow): Msg | null {
  if (flow.sheet !== null) return { kind: "sheet", sheet: null };
  const mode = flow.mode;
  if (mode.kind === "making") return { kind: "go", step: 4, focus: null };
  if (mode.kind === "failed") return { kind: "changeAnswers" };
  if (mode.kind === "editing" && mode.step !== 1) return { kind: "go", step: previousStep[mode.step], focus: null };
  return null;
}

export function activeJobOf(flow: Flow): JobCapability | null {
  const mode = flow.mode;
  if (mode.kind === "making") return mode.job.capability;
  if (mode.kind === "editing") return mode.job?.capability ?? null;
  return null;
}

export function stepOf(flow: Flow): Step {
  const mode = flow.mode;
  if (mode.kind === "editing") return mode.step;
  return mode.kind === "opening" ? 1 : 4;
}

/** What F1 writes to LocalState. Null while opening, so nothing is written before the saved state is read. */
export function persistedOf(flow: Flow): Pick<LocalState, "draft" | "step" | "activeJob"> | null {
  if (flow.mode.kind === "opening") return null;
  return { draft: flow.editor.draft, step: stepOf(flow), activeJob: activeJobOf(flow) };
}

export function readyCatalogue(state: CatalogueState): Catalogue | null {
  return state.status === "ready" ? state.catalogue : null;
}

/** Issues to show on `page`, or in the summary when page is "all": checker issues when flow.check, plus pinned ones. */
export function issuesFor(flow: Flow, page: Step | "all"): readonly PageIssue[] {
  const draft = flow.editor.draft;
  const check = flow.check ? checkDraft(draft, readyCatalogue(flow.catalogue)) : null;
  const checked = check?.kind === "blocked" ? check.issues : [];
  const all = tidyIssues([...checked, ...flow.serverIssues.filter(issue => stillPinned(issue, draft))]);
  return page === "all" ? all : all.filter(issue => issue.page === page);
}

/**
 * The crops "Find a crop" keeps, in list order. Every typed word must appear in the label, ignoring case and accents,
 * so "corn" finds "Sweet maize (sweet corn)" and "dry bean" finds "Common bean (dry grain)". No words keeps them all.
 */
export function matchCrops(entries: readonly CatalogueEntry[], text: string): readonly CatalogueEntry[] {
  const words = plain(text).split(/[^\p{L}\p{N}]+/u).filter(word => word !== "");
  if (words.length === 0) return entries;
  return entries.filter(entry => {
    const label = plain(entry.label);
    return words.every(word => label.includes(word));
  });
}

export function clampStep(raw: number): Step {
  return raw === 2 ? 2 : raw === 3 ? 3 : raw === 4 ? 4 : 1;
}

/** DOM id for a focus target. Entry and crop ids are data, so they are encoded, not pasted. */
export function domIdOf(target: FocusTarget): string {
  switch (target.kind) {
    case "title": return "main-title";
    case "summary": return "err-sum";
    case "submitPanel": return "submit-fail";
    case "pageIssues": return `issues-p${target.page}`;
    case "pageControl": return `control-p${target.page}`;
    case "planningStart": return "ready-date";
    case "addCrop": return "ly-add";
    case "alternative": return `ly-alt-${target.choice}`;
    case "editDates": return `ly-edit-${encodeId(target.entryId)}`;
    case "handle": return `ly-h-${encodeId(target.entryId)}-${target.end}`;
    case "unsure": return `ly-unsure-${encodeId(target.entryId)}`;
    case "crop": return `c-${encodeId(target.id)}`;
  }
}

/** Keeps letters, digits and "-"; every other character becomes _hex_, so two different ids never share a DOM id. */
function encodeId(id: string): string {
  return [...id].map(char => (/^[A-Za-z0-9-]$/.test(char) ? char : `_${(char.codePointAt(0) ?? 0).toString(16)}_`)).join("");
}

function plain(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
}

/** Every page change closes the open sheet and forgets the crop search once the farmer leaves page 2. */
function onStep(flow: Flow, mode: Editing): Flow {
  return { ...flow, mode, sheet: null, cropFilter: mode.step === 2 ? flow.cropFilter : "" };
}

function finishesSheet(edit: DraftEdit): boolean {
  return edit.kind === "addCrop" || edit.kind === "saveDates" || edit.kind === "markEmpty" || edit.kind === "removeEntry";
}

function focusAfterClose(sheet: Sheet | null): FocusTarget | null {
  if (sheet?.kind === "dates") return sheet.returnTo;
  return sheet?.kind === "add" ? { kind: "addCrop" } : null;
}

/** Where focus goes after an edit, so it never drops to the page when the pressed control disappears. */
function focusAfterEdit(edit: DraftEdit, before: Editor, after: Editor, note: EditNote, sheet: Sheet | null): FocusTarget | null {
  switch (note.kind) {
    case "entryAdded":
    case "listedInstead":
      return { kind: "editDates", entryId: note.entryId };
    case "entryRemoved":
    case "markedUnsure":
      return { kind: "addCrop" };
    case "markedEmpty":
      return historyMode(after.draft) === "empty" ? { kind: "alternative", choice: "empty" } : { kind: "unsure", entryId: note.entry.id };
    case "datesSaved":
      return sheet?.kind === "dates" ? sheet.returnTo : { kind: "editDates", entryId: note.entryId };
    case "needDate":
      return { kind: "planningStart" };
    case "cropRemoved":
      return edit.kind === "removeCrop" ? title : null;
  }
  if (edit.kind === "restoreCrops") {
    const restored = edit.ids.find(id => !(before.draft.cropPurposeIds ?? []).includes(id));
    return restored === undefined ? null : { kind: "crop", id: restored };
  }
  if (edit.kind === "alternative") {
    return historyMode(after.draft) === edit.choice ? { kind: "alternative", choice: edit.choice } : { kind: "addCrop" };
  }
  if (edit.kind !== "restoreHistory") return null;
  const mode = historyMode(after.draft);
  if (mode === "empty" || mode === "skipped") return { kind: "alternative", choice: mode };
  const known = new Set(recordedEntries(before.draft).map(entry => entry.id));
  const back = recordedEntries(after.draft).find(entry => !known.has(entry.id));
  if (back === undefined) return { kind: "addCrop" };
  return back.kind === "crop" ? { kind: "editDates", entryId: back.id } : { kind: "unsure", entryId: back.id };
}
