// The flow around the answers: which screen shows, the crop list, the job, issues, notices, the open sheet. Pure.
//
// Single source of truth: one `Flow` value, changed only by `update(flow, msg)`. Everything else is derived from it:
//  - LocalState.activeJob is `activeJobOf(flow)`, never a separate field (no "activeJob" and "job" pair to sync).
//  - LocalState.step is `stepOf(flow)`.
//  - The issues on a page are `issuesFor(flow, page)`: recomputed from the draft each render, plus pinned server
//    issues that still apply. They are never stored, so they cannot go stale.
// The controller (controller.ts) runs the async parts (storage, catalogue, submit, polling) and feeds their results
// back as messages. `update` returns what the controller must do next as data: a note to say, a focus to move, and a
// saved plan to hand off.
import type { Catalogue, CompletedSnapshot, FarmInput, JobCapability, ServiceFailure, Submission } from "@/contracts";
import type { LocalState } from "@/client/storage";
import type { PageIssue, PinnedIssue } from "./check";
import type { Draft, DraftEdit, EditNote, Editor } from "./draft";
import type { Span } from "./timeline";

/** One-based, as the prototype stores it. LocalState.step has no defined base (src/client/storage.ts:4). Making is 4. */
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
 * `editing.asked` is true after Next was pressed on a page whose own minimum is missing (Next is never disabled).
 */
export type Mode =
  | { readonly kind: "opening" }
  | { readonly kind: "editing"; readonly step: Step; readonly asked: boolean; readonly send: Send; readonly job: TrackedJob | null }
  | { readonly kind: "making"; readonly job: TrackedJob }
  | { readonly kind: "failed"; readonly failure: ServiceFailure };

/** The crop list lives in the Flow (graft from candidates 2 and 3), loaded the first time page 2 or 4 opens. */
export type CatalogueState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly catalogue: Catalogue }
  | { readonly status: "failed" };

/** One quiet, dismissible line each. Never blocks input. */
export interface Notices {
  /** A load or save failed this visit (spec.md:423). Today every localPlans call rejects (src/client/storage.ts:14-16). */
  readonly storageFailing: boolean;
  /** Change inputs found newer, different answers saved, and kept them (graft from candidate 3; prototype results.js changeAnswers). */
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
}

export type Msg =
  | { readonly kind: "opened"; readonly saved: LocalState | null; readonly initialInput: FarmInput | null }
  | { readonly kind: "catalogue"; readonly state: CatalogueState }
  | { readonly kind: "storage"; readonly health: "working" | "failing" }
  | { readonly kind: "dismiss"; readonly notice: keyof Notices }
  | { readonly kind: "edit"; readonly edit: DraftEdit }
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
  editor: { draft: {}, setAside: null },
  catalogue: { status: "idle" },
  check: false,
  serverIssues: [],
  sheet: null,
  earlierPlan: null,
  notices: { storageFailing: false, keptNewer: false },
};

/**
 * The entry rule. Pure, so every row is a table test (tests/frontend/onboarding/model/flow.test.ts).
 *  1. saved.activeJob                          -> making (progress "queued" until the first read), whatever else is saved
 *  2. saved.snapshot && initialInput === null  -> handOff = snapshot (the controller calls onCompleted once)
 *  3. initialInput !== null (Change inputs, the fixture lab):
 *       a saved draft with answers that differ  -> that draft at its saved step, notices.keptNewer (known issue 3)
 *       otherwise                               -> step 1 with draftOf(initialInput)
 *  4. a saved draft with answers               -> that draft at clampStep(saved.step)
 *  5. otherwise (nothing saved, or load threw) -> step 1, empty
 * earlierPlan is saved.snapshot in every row.
 */
export function openFlow(saved: LocalState | null, initialInput: FarmInput | null): {
  readonly flow: Flow;
  readonly handOff: CompletedSnapshot | null;
} {
  throw new Error("not implemented");
}

/**
 * The one transition function. Idempotent where it matters: "opened" outside the opening mode, a second "submitted"
 * for a job already tracked, or a "progress" / "reachable" / "jobFailed" / "jobDone" for another jobId returns the
 * flow unchanged (Strict Mode double effects, late answers after Cancel).
 */
export function update(flow: Flow, msg: Msg): Update {
  throw new Error("not implemented");
  // TODO, by msg.kind:
  //  opened      -> ignore unless opening. openFlow(...): flow, handOff
  //  catalogue   -> catalogue = msg.state
  //  storage     -> notices.storageFailing ||= health === "failing"
  //  dismiss     -> notices[msg.notice] = false
  //  edit        -> applyEdit(flow.editor, msg.edit, readyCatalogue(flow.catalogue)); asked = false;
  //                 close the sheet the edit finished (add, dates, gap, empty); a refused saveDates keeps it open
  //  next        -> stepComplete(draft, step, catalogue) ? step + 1, focus title : asked = true, focus pageControl
  //  go          -> editing.step = msg.step; sheet = null; send.unavailable kept only on step 4; focus msg.focus ?? title
  //  blocked     -> check = true; focus summary (on page 4) or the page's issues
  //  sending     -> editing.send = sending (the controller also holds a ref, so a double click submits once)
  //  submitted   -> accepted:    mode making { capability, progress: "queued", reachable: true }; check = false; serverIssues = []
  //                 invalid:     serverIssues = issues.map(i => pin(classify(i, draftAtSend), draftAtSend)); check = true;
  //                              step = lowest page with an issue (4 when only page-null issues); focus that issue
  //                 unavailable: editing step 4, send unavailable(failure); focus submitPanel
  //  progress    -> making.job.progress (same jobId only)
  //  reachable   -> making.job.reachable (same jobId only)
  //  jobFailed   -> mode failed(failure) (same jobId only); focus title (known issue 17)
  //  jobDone     -> editing step 4, job null (only a host that keeps Onboarding mounted sees this, like the fixture lab)
  //  showMaking  -> editing.job ? making(editing.job) : unchanged
  //  cancel      -> editing step 4, job null; focus title
  //  changeAnswers -> editing step 4, job null; focus title
}

/** Back, from the in-app Back and from the phone's Back button alike. Null: leave the app (page 1). */
export function backOf(flow: Flow): Msg | null {
  throw new Error("not implemented");
  // TODO: sheet open -> close it; making -> leave Making with the job running (editing 4, job kept);
  //       failed -> changeAnswers; editing step > 1 -> go(step - 1); step 1 or opening -> null
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

/** The loaded list, or null while idle, loading or failed. */
export function readyCatalogue(state: CatalogueState): Catalogue | null {
  return state.status === "ready" ? state.catalogue : null;
}

/** Issues to show on `page`, or in the summary when page is "all": checker issues when flow.check, plus pinned ones. */
export function issuesFor(flow: Flow, page: Step | "all"): readonly PageIssue[] {
  throw new Error("not implemented");
}

/** A saved step outside 1 to 4 (0, 7, NaN) opens page 1. */
export function clampStep(raw: number): Step {
  return raw === 2 ? 2 : raw === 3 ? 3 : raw === 4 ? 4 : 1;
}

/** DOM id for a focus target. Entry ids are farmer data (any label), so they are encoded, not pasted. */
export function domIdOf(target: FocusTarget): string {
  throw new Error("not implemented");
  // TODO: "main-title", "err-sum", "submit-fail", "issues-p2", "control-p1", "ready-date", "ly-add", "ly-alt-skipped",
  //       "ly-edit-" + enc(id), "ly-h-" + enc(id) + "-start", "ly-unsure-" + enc(id), "c-" + enc(id)
}
