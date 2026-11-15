"use client";
// ResultScreen renders inside F1's AppFrame, which owns <main id="main"> and focuses it when Results appears, so
// this screen renders no <main> and moves no focus on first paint. Focus targets are refs, never element ids,
// because the fixture lab mounts seven Results at once.
import { useEffect, useEffectEvent, useMemo, useReducer, useRef, useState } from "react";
import type { ReactElement, RefObject } from "react";
import type { CompletedSnapshot, FarmInput } from "@/contracts";
import { actionsCard, spoken } from "./model/actions";
import type { Section } from "./model/blocks";
import { detailsPage } from "./model/details-page";
import { resultPage } from "./model/result-page";
import { canRun, startSession, update } from "./model/session";
import type { ActionId, Cue, Settled, Work } from "./model/session";
import { formatIn } from "./model/words";
import type { Keeper } from "./services/keeper";
import { Actions } from "./views/actions";
import { DetailsView, HeadView, SectionView } from "./views/typeset";

export interface ResultScreenProps {
  readonly given: CompletedSnapshot;
  readonly onChangeInputs: (input: FarmInput) => void;
  readonly keeper: Keeper;
  /** Tests pass a fixed language. Left out, dates and numbers follow the browser, as F1's do. */
  readonly locale?: string;
}

interface Anchors {
  readonly title: RefObject<HTMLHeadingElement | null>;
  readonly detailsButton: RefObject<HTMLButtonElement | null>;
  readonly kept: RefObject<HTMLParagraphElement | null>;
}

export function ResultScreen(props: ResultScreenProps): ReactElement {
  const { keeper, onChangeInputs } = props;
  const [session, dispatch] = useReducer(update, props.given, startSession);
  const [polite, setPolite] = useState("");
  const anchors: Anchors = { title: useRef(null), detailsButton: useRef(null), kept: useRef(null) };
  const scrolledBeforeDetails = useRef(0);
  // A same-tick double tap reaches act twice before the reducer re-renders, so the call itself is guarded here too.
  const running = useRef<Work | null>(null);
  const format = useMemo(() => formatIn(props.locale), [props.locale]);
  const page = useMemo(() => resultPage(session.shown, format), [session.shown, format]);
  const details = useMemo(() => (session.view === "details" ? detailsPage(session.shown, format) : null), [session.view, session.shown, format]);
  const card = actionsCard(session, page.kind, format);

  // The only effect that touches storage, and it only reads. Strict Mode's second read is ignored by update, and an
  // answer after unmount reaches a reducer React has already dropped.
  useEffect(() => {
    void keeper.read().then(outcome => dispatch({ kind: "read", outcome }));
  }, [keeper]);

  const apply = useEffectEvent((cue: Cue) => {
    if (cue.focus === "title") {
      window.scrollTo({ top: 0 });
      anchors.title.current?.focus({ preventScroll: true });
    }
    if (cue.focus === "details_button") {
      window.scrollTo({ top: scrolledBeforeDetails.current });
      anchors.detailsButton.current?.focus();
    }
    if (cue.focus === "kept") anchors.kept.current?.focus();
    if (cue.say !== null) setPolite(spoken(session, cue.say));
  });
  // update makes a new cue object for every cue, and keeps the same one for every other event.
  useEffect(() => apply(session.cue), [session.cue]);

  // The phone's Back closes details instead of leaving Results. F1's back guard ignores the entry act pushes.
  const detailsOpen = session.view === "details";
  useEffect(() => {
    if (!detailsOpen) return;
    const onPop = () => dispatch({ kind: "closed_details" });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [detailsOpen]);

  function closeDetails(): void {
    const state: unknown = history.state;
    if (typeof state === "object" && state !== null && Reflect.get(state, detailsEntry) === true) {
      history.replaceState({ ...state, [detailsEntry]: false }, "");
      history.back();
    }
    dispatch({ kind: "closed_details" });
  }

  function act(id: ActionId): void {
    if (id === "change") {
      onChangeInputs(session.shown.input);
      return;
    }
    if (id === "details") {
      scrolledBeforeDetails.current = window.scrollY;
      // Pushed here and not in an effect, so Strict Mode's second effect cannot push a second entry.
      history.pushState({ [detailsEntry]: true }, "");
      dispatch({ kind: "opened_details" });
      return;
    }
    if (id === "earlier") {
      dispatch({ kind: "opened_earlier" });
      return;
    }
    run(id);
  }

  function run(work: Work): void {
    const call = callFor(work);
    if (running.current !== null || call === null || !canRun(session, work)) return;
    running.current = work;
    // Emptied while the call runs, so a second "The PDF was made." is a change a screen reader announces again.
    setPolite("");
    dispatch({ kind: "started", work });
    void call().then(settled => {
      running.current = null;
      dispatch({ kind: "settled", ...settled });
    });
  }

  function callFor(work: Work): (() => Promise<Settled>) | null {
    const { shown, stored } = session;
    switch (work) {
      case "pdf":
        return () => keeper.pdf(shown).then(outcome => ({ work, outcome }));
      case "save":
        return () => keeper.save(shown).then(outcome => ({ work, outcome }));
      case "clear":
        return () => keeper.clear().then(outcome => ({ work, outcome }));
      case "undo": {
        if (stored.kind !== "cleared" || stored.undo === null) return null;
        const previous = stored.undo;
        return () => keeper.undo(previous).then(outcome => ({ work, outcome }));
      }
    }
  }

  // The same element in both views, so the live region exists before anything is said into it.
  const statusLine = (
    <p className="sr" role="status" aria-live="polite">
      {polite}
    </p>
  );

  if (details !== null) {
    return (
      <div className="wide rs-screen">
        {statusLine}
        <DetailsView page={details} titleRef={anchors.title} onBack={closeDetails} />
      </div>
    );
  }

  const lead: readonly Section[] = page.lead;
  const more: readonly Section[] = page.more;
  return (
    <div className="wide rs-screen">
      {statusLine}
      <div className="rs-grid">
        <div className="rs-lead stack">
          <HeadView head={page.head} titleRef={anchors.title} />
          {lead.map(section => <SectionView key={section.id} section={section} />)}
        </div>
        <Actions card={card} onAct={act} detailsButtonRef={anchors.detailsButton} keptRef={anchors.kept} />
        <div className="rs-more stack">
          {more.map(section => <SectionView key={section.id} section={section} />)}
        </div>
      </div>
    </div>
  );
}

const detailsEntry = "gilirResultsDetails";
