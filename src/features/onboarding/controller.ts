"use client";
// The thin shell around the pure flow: one useReducer over model/flow.ts `update`, plus every effect that touches the
// outside world (storage, the crop list, submit, polling, focus, the status line and the phone's Back button).
// Views call the intents below and never call the client, storage or timers themselves.
import { useEffect, useEffectEvent, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { CompletedSnapshot, JobCapability, Submission } from "@/contracts";
import type { OnboardingProps } from "../ports";
import { usePhoneBack } from "./back";
import { checkDraft } from "./model/check";
import type { PageIssue } from "./model/check";
import { recordedEntries, windowOf } from "./model/draft";
import type { DraftEdit, EditNote } from "./model/draft";
import { activeJobOf, backOf, domIdOf, issuesFor, openingFlow, persistedOf, readyCatalogue, stepOf, update } from "./model/flow";
import type { FocusTarget, Flow, Msg, Notices, Sheet, Shown, Step } from "./model/flow";
import { policy } from "./model/policy";
import { stepEntry } from "./model/timeline";
import type { End } from "./model/timeline";
import { dropWords, making, namesFrom, noteWords, shell, stopWords } from "./model/words";
import type { CropNames } from "./model/words";
import { failureOf, unreachable, watchJob, withTimeout } from "./services/job";
import type { JobEvent } from "./services/job";
import { createSavedPlans, f4Storage, storageLine } from "./services/saved";

/** A note under the top bar. `id` restarts its timer when a new note replaces one with the same words. */
export interface Toast {
  readonly id: number;
  readonly text: string;
  /** The edit Undo makes. It goes through the same reducer as every other edit. */
  readonly undo: DraftEdit | null;
}

export interface Controller {
  readonly flow: Flow;
  /** Issues for a page, or "all" for the summary. */
  issues(page: Step | "all"): readonly PageIssue[];
  /** Crop names from the loaded list and the current answers. */
  readonly names: CropNames;
  /** Words for the one polite status line. */
  readonly said: string;
  readonly toast: Toast | null;

  edit(edit: DraftEdit): void;
  /** Next on pages 1 to 3: moves on when the page is complete, else says what is missing and focuses it. */
  next(): void;
  /** In-app Back and phone Back. False on page 1, where Back leaves the app. */
  back(): boolean;
  /** "Fix on page N" and "On this page" in the summary. No page minimum is checked. */
  go(step: Step, focus: FocusTarget | null): void;
  openSheet(sheet: Sheet | null): void;
  filterCrops(text: string): void;
  /** Make my plan on page 4, and Try again or Make my plan again on the failed screen. One submit path. */
  makePlan(): void;
  cancel(): void;
  changeAnswers(): void;
  showMaking(): void;
  openEarlierPlan(): void;
  retryCatalogue(): void;
  undo(): void;
  dismissToast(): void;
  dismissNotice(notice: keyof Notices): void;
  /** A drag that ended on `targetDay`: says why the bar stopped short, if it did, then its dates. */
  dropped(entryId: string, end: End, targetDay: number): void;
}

interface State {
  readonly flow: Flow;
  /** What the last message asked for once it is committed. `seq` makes each request a new object. */
  readonly outbox: { readonly seq: number; readonly focus: FocusTarget | null; readonly handOff: CompletedSnapshot | null };
  readonly said: string;
  readonly toast: Toast | null;
}

type Drop = { readonly kind: "dropped"; readonly entryId: string; readonly end: End; readonly targetDay: number };
type Action = Msg | Drop | { readonly kind: "toastGone" } | { readonly kind: "undo" };

const opening: State = { flow: openingFlow, outbox: { seq: 0, focus: null, handOff: null }, said: "", toast: null };

function reduce(state: State, action: Action): State {
  if (action.kind === "toastGone") return state.toast === null ? state : { ...state, toast: null };
  if (action.kind === "undo") return undone(state);
  if (action.kind === "dropped") return dropped(state, action);
  const next = update(state.flow, action);
  if (next.flow === state.flow && next.focus === null && next.handOff === null && next.note.kind === "none") return state;
  const seq = state.outbox.seq + 1;
  const outbox = { seq, focus: next.focus, handOff: next.handOff };
  // Undo puts back the answers as they were before the note, so the note goes once they change again or the page does.
  const samePage = next.flow.mode.kind === "editing" && state.flow.mode.kind === "editing" && next.flow.mode.step === state.flow.mode.step;
  const toast = samePage && next.flow.editor === state.flow.editor ? state.toast : null;
  const words = noteWords(next.note, namesFrom(readyCatalogue(next.flow.catalogue), next.flow.editor.draft));
  if (words === null) {
    const making = makingSaid(state.flow, next.flow);
    return { ...state, flow: next.flow, outbox, toast, said: making === null ? state.said : fresh(state.said, making) };
  }
  if (words.polite) return { ...state, flow: next.flow, outbox, toast, said: fresh(state.said, words.text) };
  const said = fresh(state.said, shell.toastSaid(words.text, words.undo));
  return { flow: next.flow, outbox, said, toast: { id: seq, text: words.text, undo: undoOf(next.note) } };
}

function undone(state: State): State {
  const toast = state.toast;
  if (toast === null || toast.undo === null) return { ...state, toast: null };
  const next = reduce({ ...state, toast: null }, { kind: "edit", edit: toast.undo });
  return { ...next, said: fresh(next.said, shell.undone(toast.text)) };
}

/** A live region speaks only when its text changes, so a sentence said twice in a row gets a trailing no-break space. */
function fresh(before: string, text: string): string {
  return before === text ? `${text}\u00a0` : text;
}

/** Making's one sentence: the step it is on, or that the service cannot be reached. Null when nothing changed. */
function makingSaid(before: Flow, after: Flow): string | null {
  if (after.mode.kind !== "making") return null;
  const job = after.mode.job;
  const was = before.mode.kind === "making" ? before.mode.job : null;
  if (was !== null && was.progress === job.progress && was.reachable === job.reachable) return null;
  return job.reachable ? making.announce(job.progress) : making.reaching;
}

/**
 * A drag ended. The status line says why the bar stopped short, if it did, then its dates. A stop also shows as a
 * note, because a handle that will not move says nothing to the eye, unless a note still offers Undo. Read from the
 * flow the reducer holds, because a view's closure can be one pointer event behind.
 */
function dropped(state: State, drop: Drop): State {
  const draft = state.flow.editor.draft;
  const coverage = windowOf(draft);
  const entries = recordedEntries(draft);
  const entry = entries.find(other => other.id === drop.entryId);
  if (coverage === null || entry === undefined) return state;
  const { stop } = stepEntry(entries, entry.id, drop.end, drop.targetDay, coverage);
  const names = namesFrom(readyCatalogue(state.flow.catalogue), draft);
  const said = fresh(state.said, dropWords(entry, stop, names));
  if (stop === null) return { ...state, said };
  const seq = state.outbox.seq + 1;
  const toast = state.toast?.undo ? state.toast : { id: seq, text: stopWords(stop, entry, names), undo: null };
  return { ...state, outbox: { seq, focus: null, handOff: null }, said, toast };
}

/**
 * Jobs whose plan this page load handed over. A job whose finishing save was refused stays saved, so a reload can still
 * fetch its plan, but Change inputs must not reopen it and bounce back to Results.
 */
const handedOver = new Set<string>();

/** Results unmounts Onboarding, so the answers it showed at the last hand-off live here until the next open takes them. */
let shownAtHandOff: Shown | null = null;

function handOver(flow: Flow, snapshot: CompletedSnapshot, onCompleted: (snapshot: CompletedSnapshot) => void): void {
  shownAtHandOff = { draft: flow.editor.draft, step: stepOf(flow) };
  onCompleted(snapshot);
}

function undoOf(note: EditNote): DraftEdit | null {
  return "undo" in note ? note.undo : null;
}

export function useOnboardingController(props: OnboardingProps): Controller {
  const { client } = props;
  const [saved] = useState(() => createSavedPlans(f4Storage, policy.save.debounceMs, storageLine));
  const [initialInput] = useState(props.initialInput);
  const [state, dispatch] = useReducer(reduce, opening);
  const { flow, outbox } = state;
  const finished = useRef(new Set<string>());
  const sending = useRef(false);
  const loadingCatalogue = useRef(false);
  const lastWritten = useRef<ReturnType<typeof persistedOf>>(null);
  const onCompleted = useEffectEvent((snapshot: CompletedSnapshot) => handOver(flow, snapshot, props.onCompleted));

  useEffect(() => {
    let live = true;
    void saved.open().then(stored => {
      if (!live) return;
      // Only Results hands back an initialInput within a page load.
      const shown = initialInput === null ? null : shownAtHandOff;
      shownAtHandOff = null;
      const handed = initialInput !== null && stored !== null && stored.activeJob !== null && handedOver.has(stored.activeJob.jobId);
      const opened = stored !== null && handed ? { ...stored, activeJob: null } : stored;
      dispatch({ kind: "opened", saved: opened, initialInput, shown, focusTitle: document.activeElement?.id === domIdOf({ kind: "title" }) });
    });
    return () => {
      live = false;
    };
  }, [saved, initialInput]);

  // A saved plan opens Results before the restored page is painted.
  useLayoutEffect(() => {
    if (outbox.handOff !== null) onCompleted(outbox.handOff);
  }, [outbox]);

  useEffect(() => {
    const target = outbox.focus;
    if (target === null) return;
    const element = document.getElementById(domIdOf(target));
    if (target.kind === "title") document.documentElement.scrollTop = 0;
    element?.focus({ preventScroll: target.kind === "title" });
  }, [outbox]);

  const persisted = persistedOf(flow);
  useEffect(() => {
    if (persisted === null) return;
    const last = lastWritten.current;
    lastWritten.current = persisted;
    // Change inputs can open answers that storage does not hold (after a refused save, or beside a draft from before a
    // failed open). Writing them at once keeps a reload from bringing the stale ones back.
    if (last === null) {
      if (initialInput !== null) saved.write(persisted, "now");
      return;
    }
    const urgent = last.step !== persisted.step || last.activeJob !== persisted.activeJob;
    if (urgent || last.draft !== persisted.draft) saved.write(persisted, urgent ? "now" : "soon");
    // The three fields are the whole value; `persisted` itself is a new object on every render.
  }, [persisted?.draft, persisted?.step, persisted?.activeJob]);

  useEffect(() => {
    const flush = () => void saved.flush();
    const hidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
      flush();
    };
  }, [saved]);

  function loadCatalogue(retried: boolean): void {
    if (loadingCatalogue.current) return;
    loadingCatalogue.current = true;
    dispatch({ kind: "catalogue", state: { status: "loading" }, retried });
    withTimeout(() => client.catalogue(), policy.timeoutMs.catalogue)
      .then(
        catalogue => dispatch({ kind: "catalogue", state: { status: "ready", catalogue }, retried }),
        () => dispatch({ kind: "catalogue", state: { status: "failed" }, retried }),
      )
      .finally(() => {
        loadingCatalogue.current = false;
      });
  }
  const startCatalogue = useEffectEvent(() => loadCatalogue(false));
  const needsCatalogue = flow.catalogue.status === "idle" && outbox.handOff === null
    && flow.mode.kind === "editing" && (flow.mode.step === 2 || flow.mode.step === 4);
  useEffect(() => {
    if (needsCatalogue) startCatalogue();
  }, [needsCatalogue]);

  const watched = flow.mode.kind === "making" ? flow.mode.job.capability : null;
  const onJobEvent = useEffectEvent((capability: JobCapability, event: JobEvent) => {
    const jobId = capability.jobId;
    switch (event.kind) {
      case "progress":
        return dispatch({ kind: "progress", jobId, progress: event.progress });
      case "reachable":
        return dispatch({ kind: "reachable", jobId, reachable: event.reachable });
      case "failed":
        if (event.failure.code !== "not_found") removeQuietly(capability);
        return dispatch({ kind: "jobFailed", jobId, failure: event.failure });
      case "completed":
        return void finish(capability, event.snapshot);
    }
  });
  useEffect(() => {
    if (watched === null) return;
    return watchJob(client, watched, event => onJobEvent(watched, event));
  }, [client, watched]);

  async function finish(capability: JobCapability, snapshot: CompletedSnapshot): Promise<void> {
    const { written } = await saved.finish(snapshot);
    if (written) removeQuietly(capability);
    dispatch({ kind: "jobDone", jobId: capability.jobId });
    if (finished.current.has(capability.jobId)) return;
    finished.current.add(capability.jobId);
    handedOver.add(capability.jobId);
    onCompleted(snapshot);
  }

  function removeQuietly(capability: JobCapability): void {
    void Promise.resolve()
      .then(() => client.remove(capability))
      .catch(() => undefined);
  }

  function makePlan(): void {
    if (sending.current) return;
    const check = checkDraft(flow.editor.draft, readyCatalogue(flow.catalogue));
    if (check.kind === "blocked") {
      dispatch({ kind: "blocked" });
      return;
    }
    sending.current = true;
    dispatch({ kind: "sending" });
    const earlier = activeJobOf(flow);
    if (earlier !== null) removeQuietly(earlier);
    const draftAtSend = flow.editor.draft;
    withTimeout(() => client.submit(check.input), policy.timeoutMs.submit)
      .catch((error: unknown): Submission => ({ kind: "unavailable", failure: failureOf(error) ?? unreachable }))
      .then(submission => {
        if (submission.kind === "accepted") finished.current.delete(submission.capability.jobId);
        dispatch({ kind: "submitted", submission, draftAtSend });
      })
      .finally(() => {
        sending.current = false;
      });
  }

  function back(): boolean {
    const msg = backOf(flow);
    if (msg === null) return false;
    dispatch(msg);
    return true;
  }

  usePhoneBack(back, flow.mode.kind !== "opening");

  return {
    flow,
    issues: page => issuesFor(flow, page),
    names: namesFrom(readyCatalogue(flow.catalogue), flow.editor.draft),
    said: state.said,
    toast: state.toast,
    edit: edit => dispatch({ kind: "edit", edit }),
    next: () => dispatch({ kind: "next" }),
    back,
    go: (step, focus) => dispatch({ kind: "go", step, focus }),
    openSheet: sheet => dispatch({ kind: "sheet", sheet }),
    filterCrops: text => dispatch({ kind: "filterCrops", text }),
    makePlan,
    cancel() {
      if (flow.mode.kind !== "making") return;
      removeQuietly(flow.mode.job.capability);
      dispatch({ kind: "cancel" });
    },
    changeAnswers: () => dispatch({ kind: "changeAnswers" }),
    showMaking: () => dispatch({ kind: "showMaking" }),
    openEarlierPlan() {
      if (flow.earlierPlan !== null) handOver(flow, flow.earlierPlan, props.onCompleted);
    },
    retryCatalogue: () => loadCatalogue(true),
    undo: () => dispatch({ kind: "undo" }),
    dismissToast: () => dispatch({ kind: "toastGone" }),
    dismissNotice: notice => dispatch({ kind: "dismiss", notice }),
    dropped: (entryId, end, targetDay) => dispatch({ kind: "dropped", entryId, end, targetDay }),
  };
}
