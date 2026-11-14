"use client";
// The thin shell: one useReducer over model/flow.ts `update`, plus the effects that touch the outside world.
// Views call the intent methods below and read derived values. They never call the client, storage or timers.
//
// Effects, each with one trigger:
//  open      mount              saved.open() -> dispatch opened -> outbox.handOff ? onCompleted(handOff) once
//  catalogue step 2 or 4 opens, catalogue idle -> client.catalogue() raced with policy.timeoutMs.catalogue
//  persist   persistedOf(flow) changes -> saved.write(patch, step or activeJob changed ? "now" : "soon")
//  flush     pagehide, visibilitychange hidden, unmount -> saved.flush()
//  health    saved.onHealth -> dispatch storage
//  submit    makePlan()         checkDraft -> blocked | client.submit(input) raced with policy.timeoutMs.submit
//  poll      mode is making     watchJob(client, capability, ...) -> progress | reachable | completed | failed
//  finish    completed event    await saved.finish(snapshot); written ? client.remove(capability) : keep the job;
//                               dispatch jobDone; onCompleted(snapshot) once
//  remove    cancel, failed (not not_found), resubmit over a running job -> client.remove(old), errors ignored
//  outbox    every update        focus domIdOf(outbox.focus) after paint; noteWords(outbox.note) -> toast or `said`
//  phoneBack usePhoneBack(back)
import type { OnboardingProps } from "../ports";
import type { PageIssue } from "./model/check";
import type { DraftEdit } from "./model/draft";
import type { FocusTarget, Flow, Notices, Sheet, Step } from "./model/flow";
import type { CropNames } from "./model/words";

/** A toast: words, and Undo when the edit can be undone. Undo is a DraftEdit, so it goes through the same reducer. */
export interface Toast {
  readonly text: string;
  readonly undo: DraftEdit | null;
}

export interface Controller {
  readonly flow: Flow;
  /** Issues for a page, or "all" for the summary. Derived each render (flow.ts issuesFor). */
  issues(page: Step | "all"): readonly PageIssue[];
  /** Crop names from the loaded list (model/words.ts namesFrom). */
  readonly names: CropNames;
  /** Words for the one polite status line. */
  readonly said: string;
  readonly toast: Toast | null;

  edit(edit: DraftEdit): void;
  /** Next on pages 1 to 3: moves on when the page is complete, else says what is missing and focuses its control. */
  next(): void;
  /** In-app Back and phone Back. Returns false on page 1, where Back leaves the app. */
  back(): boolean;
  /** "Fix on page N" links. No page minimum is checked. */
  go(step: Step, focus?: FocusTarget): void;
  openSheet(sheet: Sheet | null): void;
  /** Make my plan on page 4, and "Try again" / "Make my plan again" on the failed screen. One submit path. */
  makePlan(): void;
  cancel(): void;
  changeAnswers(): void;
  showMaking(): void;
  openEarlierPlan(): void;
  retryCatalogue(): void;
  undo(): void;
  dismissToast(): void;
  dismissNotice(notice: keyof Notices): void;
  /** For a drag that ended: say the bar's new dates or why it stopped. */
  announce(text: string): void;
}

export function useOnboardingController(props: OnboardingProps): Controller {
  throw new Error("not implemented");
  // TODO:
  //  const saved = useState(() => createSavedPlans())[0]    // one queue per mount; the factory does no I/O (Strict Mode)
  //  const [{ flow, outbox }, dispatch] = useReducer(reduce, { flow: openingFlow, outbox: { seq: 0, note: none, focus: null, handOff: null } })
  //     reduce(s, m) { const u = update(s.flow, m); return { flow: u.flow, outbox: { seq: s.outbox.seq + 1, note: u.note, focus: u.focus, handOff: u.handOff } } }
  //  outbox:  useEffect on outbox.seq: focus after paint; words; handOff && !handed.current -> handed.current = true, props.onCompleted(handOff)
  //  open:    useEffect(() => { let live = true; saved.open().then(s => live && dispatch({ kind: "opened", saved: s, initialInput: props.initialInput }));
  //             return () => { live = false } }, [])                   // initialInput is read once, at open
  //  catalogue: useEffect keyed on (step is 2 or 4 or a sheet needs it) && catalogue idle, and on retry
  //  persist: const p = persistedOf(flow); useEffect(() => { if (p) saved.write(p, changedStepOrJob ? "now" : "soon") }, [p])
  //  submit:  makePlan = () => { if (sendingRef.current) return; const c = checkDraft(flow.editor.draft, readyCatalogue(flow.catalogue));
  //             if (c.kind === "blocked") return dispatch({ kind: "blocked" });
  //             sendingRef.current = true; dispatch({ kind: "sending" }); const old = activeJobOf(flow); if (old) removeQuietly(old);
  //             withTimeout(Promise.resolve().then(() => props.client.submit(c.input)), policy.timeoutMs.submit)
  //               .catch(e => ({ kind: "unavailable", failure: failureOf(e) ?? unreachable }))   // a stand-in client may throw
  //               .then(s => dispatch({ kind: "submitted", submission: s, draftAtSend: flow.editor.draft }))
  //               .finally(() => { sendingRef.current = false }) }
  //  poll:    useEffect(() => { if (flow.mode.kind !== "making") return; const cap = flow.mode.job.capability;
  //             return watchJob(props.client, cap, e => e.kind === "completed" ? finish(cap, e.snapshot) : dispatch(...)) },
  //           [flow.mode.kind === "making" ? flow.mode.job.capability.jobId : null])
  //  finish:  const { written } = await saved.finish(snapshot); if (written) removeQuietly(cap);
  //           dispatch({ kind: "jobDone", jobId }); if (!done.has(jobId)) { done.add(jobId); props.onCompleted(snapshot) }
  //  openEarlierPlan: flow.earlierPlan && props.onCompleted(flow.earlierPlan)
  //  phone Back: usePhoneBack(back, flow.mode.kind !== "opening")
}

/**
 * The phone's Back button does what the in-app Back does. One guard history entry is pushed when the flow opens.
 * popstate -> if back() handled it, push the guard again; on page 1 it did not, so call history.back() once more and
 * the browser leaves. Next 16 patches pushState to copy its own __NA tree state into the entry
 * (node_modules/next/dist/client/components/app-router.js:128-140, :286-293), so its popstate handler restores the
 * same tree instead of reloading (app-router.js:61-71). Read from source, not yet run: the Playwright case
 * "[C1] phone Back moves one page back and keeps every answer" gates it (open decision in rationale.md).
 * No URL changes, so no step can be deep-linked and no capability ever reaches a URL (spec.md:421).
 */
export function usePhoneBack(back: () => boolean, enabled: boolean): void {
  throw new Error("not implemented");
}
