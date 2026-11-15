"use client";
// The thin shell around the pure flow: one useReducer over model/flow.ts `update`, plus every effect that touches the
// outside world (storage, the crop list, submit, polling, focus, the status line and the phone's Back button).
// Views call the intents below and never call the client, storage or timers themselves.
import { useEffect, useEffectEvent, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { CompletedSnapshot, JobCapability, Submission } from "@/contracts";
import type { OnboardingProps } from "../ports";
import { checkDraft } from "./model/check";
import type { PageIssue } from "./model/check";
import type { DraftEdit, EditNote } from "./model/draft";
import { activeJobOf, backOf, domIdOf, issuesFor, openingFlow, persistedOf, readyCatalogue, update } from "./model/flow";
import type { FocusTarget, Flow, Msg, Notices, Sheet, Step } from "./model/flow";
import { policy } from "./model/policy";
import { making, namesFrom, noteWords, shell } from "./model/words";
import type { CropNames } from "./model/words";
import { failureOf, unreachable, watchJob, withTimeout } from "./services/job";
import type { JobEvent } from "./services/job";
import { createSavedPlans } from "./services/saved";

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
  /** For a drag that ended: say the bar's new dates or why it stopped. */
  announce(text: string): void;
}

interface State {
  readonly flow: Flow;
  /** What the last message asked for once it is committed. `seq` makes each request a new object. */
  readonly outbox: { readonly seq: number; readonly focus: FocusTarget | null; readonly handOff: CompletedSnapshot | null };
  readonly said: string;
  readonly toast: Toast | null;
}

type Action = Msg | { readonly kind: "toastGone" } | { readonly kind: "say"; readonly text: string };

const opening: State = { flow: openingFlow, outbox: { seq: 0, focus: null, handOff: null }, said: "", toast: null };

function reduce(state: State, action: Action): State {
  if (action.kind === "toastGone") return state.toast === null ? state : { ...state, toast: null };
  if (action.kind === "say") return { ...state, said: action.text };
  const next = update(state.flow, action);
  if (next.flow === state.flow && next.focus === null && next.handOff === null && next.note.kind === "none") return state;
  const seq = state.outbox.seq + 1;
  const outbox = { seq, focus: next.focus, handOff: next.handOff };
  const words = noteWords(next.note, namesFrom(readyCatalogue(next.flow.catalogue), next.flow.editor.draft));
  if (words === null) return { ...state, flow: next.flow, outbox, said: makingSaid(state.flow, next.flow) ?? state.said };
  if (words.polite) return { ...state, flow: next.flow, outbox, said: words.text };
  return { flow: next.flow, outbox, said: shell.toastSaid(words.text, words.undo), toast: { id: seq, text: words.text, undo: undoOf(next.note) } };
}

/** Making's one sentence: the step it is on, or that the service cannot be reached. Null when nothing changed. */
function makingSaid(before: Flow, after: Flow): string | null {
  if (after.mode.kind !== "making") return null;
  const job = after.mode.job;
  const was = before.mode.kind === "making" ? before.mode.job : null;
  if (was !== null && was.progress === job.progress && was.reachable === job.reachable) return null;
  return job.reachable ? making.announce(job.progress) : making.reaching;
}

function undoOf(note: EditNote): DraftEdit | null {
  return "undo" in note ? note.undo : null;
}

export function useOnboardingController(props: OnboardingProps): Controller {
  const { client } = props;
  const [saved] = useState(createSavedPlans);
  const [initialInput] = useState(props.initialInput);
  const [state, dispatch] = useReducer(reduce, opening);
  const { flow, outbox } = state;
  const finished = useRef(new Set<string>());
  const sending = useRef(false);
  const loadingCatalogue = useRef(false);
  const lastWritten = useRef<ReturnType<typeof persistedOf>>(null);
  const onCompleted = useEffectEvent((snapshot: CompletedSnapshot) => props.onCompleted(snapshot));

  useEffect(() => {
    const unsubscribe = saved.onHealth(health => dispatch({ kind: "storage", health }));
    return () => {
      unsubscribe();
    };
  }, [saved]);

  useEffect(() => {
    let live = true;
    void saved.open().then(stored => {
      if (live) dispatch({ kind: "opened", saved: stored, initialInput });
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
    if (last === null) return;
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

  function loadCatalogue(): void {
    if (loadingCatalogue.current) return;
    loadingCatalogue.current = true;
    dispatch({ kind: "catalogue", state: { status: "loading" } });
    withTimeout(Promise.resolve().then(() => client.catalogue()), policy.timeoutMs.catalogue)
      .then(
        catalogue => dispatch({ kind: "catalogue", state: { status: "ready", catalogue } }),
        () => dispatch({ kind: "catalogue", state: { status: "failed" } }),
      )
      .finally(() => {
        loadingCatalogue.current = false;
      });
  }
  const startCatalogue = useEffectEvent(loadCatalogue);
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
    withTimeout(Promise.resolve().then(() => client.submit(check.input)), policy.timeoutMs.submit)
      .catch((error: unknown): Submission => ({ kind: "unavailable", failure: failureOf(error) ?? unreachable }))
      .then(submission => dispatch({ kind: "submitted", submission, draftAtSend }))
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

  const toast = state.toast;
  return {
    flow,
    issues: page => issuesFor(flow, page),
    names: namesFrom(readyCatalogue(flow.catalogue), flow.editor.draft),
    said: state.said,
    toast,
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
      if (flow.earlierPlan !== null) props.onCompleted(flow.earlierPlan);
    },
    retryCatalogue: loadCatalogue,
    undo() {
      dispatch({ kind: "toastGone" });
      if (toast?.undo) dispatch({ kind: "edit", edit: toast.undo });
    },
    dismissToast: () => dispatch({ kind: "toastGone" }),
    dismissNotice: notice => dispatch({ kind: "dismiss", notice }),
    announce: text => dispatch({ kind: "say", text }),
  };
}

const guardKey = "gilirBack";

function markOf(state: unknown): unknown {
  return typeof state === "object" && state !== null ? Reflect.get(state, guardKey) : undefined;
}

/**
 * The phone's Back button does what the in-app Back does, with no URL change, so no step can be deep-linked and no
 * capability reaches a URL. The entry the app opened on is marked "base" and one "guard" entry is pushed over it.
 * Back from the guard lands on the base: if the flow went back a step, the guard is pushed again; on page 1 it did
 * not, so the browser goes back once more and leaves. Any other entry (a #main skip-link entry, the guard itself) is
 * not ours to handle. A remount finds the guard already on top and pushes nothing.
 */
export function usePhoneBack(back: () => boolean, enabled: boolean): void {
  const onBack = useEffectEvent(back);
  useEffect(() => {
    if (!enabled) return;
    if (markOf(history.state) !== "guard") {
      const current: unknown = history.state;
      history.replaceState({ ...(typeof current === "object" ? current : null), [guardKey]: "base" }, "");
      history.pushState({ [guardKey]: "guard" }, "");
    }
    const onPop = (event: PopStateEvent) => {
      if (markOf(event.state) !== "base") return;
      if (onBack()) history.pushState({ [guardKey]: "guard" }, "");
      else history.back();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [enabled]);
}
