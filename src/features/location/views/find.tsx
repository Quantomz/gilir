"use client";
// Finding a place: the search box, "Use my location", and the chosen place with "Mark my field".
// The search box and the location panel keep their short-lived state here. The picker only hears the place they
// produce, through `pick`.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactElement } from "react";
import { classifyQuery, coordsText } from "../coordinates";
import type { Axis, CoordError } from "../coordinates";
import type { Controller } from "../controller";
import { locateOnce } from "../locate";
import { listShown } from "../picker";
import type { FoundPlace, LocateFailure } from "../picker";
import { searchPlaces } from "../provider";
import type { SearchAnswer } from "../provider";
import { coordError, find, locate, locateFailed, search, searchBox, searchFailed } from "../words";
import { Icon } from "./parts";

export function FindPanel(props: { readonly c: Controller }): ReactElement {
  const { c } = props;
  return (
    <div className="stack-s">
      <SearchBox c={c} />
      <LocatePanel c={c} />
      {c.picker.surface.kind === "globe" ? <p className="muted fp-small">{find.tapHint}</p> : null}
      {listShown(c.picker) ? null : (
        <button className="btn btn-quiet fp-self-start" type="button" ref={c.focusRef("list_opener")} onClick={() => c.send({ kind: "list", open: true })}>
          <Icon name="edit" />
          {find.typeCorners}
        </button>
      )}
    </div>
  );
}

type SearchState =
  | { readonly kind: "idle" }
  | { readonly kind: "short" }
  | { readonly kind: "sending" }
  | { readonly kind: "answered"; readonly answer: SearchAnswer }
  | { readonly kind: "no_key" }
  | { readonly kind: "unclear_position" }
  | { readonly kind: "bad_position"; readonly axis: Axis; readonly error: CoordError };

/**
 * Nothing is sent while the farmer types: a keystroke changes only this component's text. A typed position becomes a
 * place at once, with no request, so it works with no key. A name is sent on Search or Enter only, and a late answer
 * to an older search is dropped by its sequence number.
 */
function SearchBox(props: { readonly c: Controller }): ReactElement {
  const { c } = props;
  const [text, setText] = useState("");
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const latest = useRef(0);
  const running = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const searchTarget = c.focusRef("search");
  const inputRef = useCallback((element: HTMLInputElement | null) => {
    input.current = element;
    searchTarget(element);
  }, [searchTarget]);

  const stop = useCallback(() => {
    latest.current += 1;
    running.current?.abort();
    running.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    stop();
    const query = classifyQuery(text);
    switch (query.kind) {
      case "short":
      case "unclear_position":
        setState({ kind: query.kind });
        return;
      case "bad_position":
        setState({ kind: "bad_position", axis: query.axis, error: query.error });
        return;
      case "position":
        setState({ kind: "idle" });
        c.send({ kind: "pick", place: { kind: "position", at: query.at } });
        return;
      case "name": {
        if (c.provider.kind !== "ready") {
          setState({ kind: "no_key" });
          return;
        }
        const seq = latest.current;
        const request = new AbortController();
        running.current = request;
        setState({ kind: "sending" });
        void searchPlaces(c.provider.key, query.text, request.signal).then(answer => {
          if (seq !== latest.current) return;
          running.current = null;
          setState({ kind: "answered", answer });
        });
      }
    }
  }

  function choose(place: FoundPlace): void {
    setText(place.name);
    setState({ kind: "idle" });
    c.send({ kind: "pick", place });
  }

  function clear(): void {
    stop();
    setText("");
    setState({ kind: "idle" });
    input.current?.focus();
  }

  const places = state.kind === "answered" && state.answer.kind === "found" ? state.answer.places : null;
  const line = lineOf(state, c.picker.surface.kind === "globe");
  const said = state.kind === "sending" ? search.searching : places ? search.found(places.length) : "";
  const box = searchBox[c.provider.kind];
  const failed = (state.kind === "answered" && state.answer.kind === "failed") || state.kind === "no_key" || state.kind === "bad_position" || state.kind === "unclear_position";
  return (
    <form className="fp-search stack-xs" role="search" aria-label={box.form} noValidate onSubmit={submit}>
      <label className="label" htmlFor={c.idOf("search")}>{box.label}</label>
      <div className="search-row">
        <div className="input-wrap">
          <Icon name="search" />
          <input
            id={c.idOf("search")}
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={c.idOf("search-hint")}
            placeholder={box.placeholder}
            value={text}
            onChange={event => setText(event.target.value)}
          />
          {text ? (
            <button className="fp-clear" type="button" aria-label={search.clear} onClick={clear}>
              <Icon name="close" />
            </button>
          ) : null}
        </div>
        <button className="btn btn-sub fp-search-go" type="submit" aria-busy={state.kind === "sending"}>
          {state.kind === "sending" ? <span className="spinner" aria-hidden="true" /> : <Icon name="search" />}
          {search.go}
        </button>
      </div>
      <p id={c.idOf("search-hint")} className="muted fp-small">{box.hint}</p>
      {places ? (
        <ul id={c.idOf("results")} className="fp-results" aria-label={search.list}>
          {places.map((place, index) => (
            <li key={`${index}-${place.name}`}>
              <button className="fp-result" type="button" onClick={() => choose(place)}>
                <Icon name="pin" />
                <span>
                  <b>{place.name}</b>
                  {place.where ? <>{" "}<span>{place.where}</span></> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className={line ? (failed ? "error-text error-soft" : "muted") : "sr"} role="status">
        {line && failed ? <Icon name="alert" /> : null}
        {line ? <span>{line}</span> : said}
      </p>
    </form>
  );
}

function lineOf(state: SearchState, globe: boolean): string | null {
  switch (state.kind) {
    case "idle":
    case "sending":
      return null;
    case "short":
      return search.short;
    case "no_key":
      return search.noKeyName;
    case "unclear_position":
      return search.unclearPosition;
    case "bad_position":
      return coordError[state.axis][state.error];
    case "answered":
      switch (state.answer.kind) {
        case "found": return null;
        case "none": return globe ? search.none : search.nonePlan;
        case "failed": return searchFailed[state.answer.why];
      }
  }
}

type Locate =
  | { readonly kind: "idle" }
  | { readonly kind: "asking" }
  | { readonly kind: "finding" }
  | { readonly kind: "failed"; readonly why: LocateFailure };

/**
 * "Use my location" explains first and asks the phone only on "Find my location". A fix puts the box straight on it,
 * as "Mark my field" would, so focus moves to the marking heading.
 */
function LocatePanel(props: { readonly c: Controller }): ReactElement {
  const { c } = props;
  const [state, setState] = useState<Locate>({ kind: "idle" });
  const run = useRef(0);
  const opener = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => {
    run.current += 1;
  }, []);
  useEffect(() => {
    if (state.kind === "asking" || state.kind === "failed") title.current?.focus();
  }, [state.kind]);

  async function findMe(): Promise<void> {
    const mine = ++run.current;
    setState({ kind: "finding" });
    const outcome = await locateOnce();
    if (mine !== run.current) return;
    if (outcome.kind === "failed") {
      setState({ kind: "failed", why: outcome.why });
      return;
    }
    setState({ kind: "idle" });
    c.send({ kind: "pick", place: outcome.place });
    c.send({ kind: "mark" });
  }

  function close(): void {
    run.current += 1;
    setState({ kind: "idle" });
    opener.current?.focus();
  }

  const open = state.kind !== "idle";
  const failure = state.kind === "failed" ? locateFailed(state.why, c.provider.kind) : null;
  const finding = state.kind === "finding";
  return (
    <div className="stack-s">
      <button
        ref={opener}
        className="btn btn-sub btn-block fp-way"
        type="button"
        aria-expanded={open}
        aria-controls={open ? c.idOf("locate") : undefined}
        onClick={() => (open ? close() : setState({ kind: "asking" }))}
      >
        <Icon name="locate" />
        {find.useLocation}
      </button>
      {open ? (
        <section id={c.idOf("locate")} className="fp-locate" aria-labelledby={`${c.idOf("locate")}-title`}>
          <div className="sheet-head">
            <h3 id={`${c.idOf("locate")}-title`} className="sheet-title" tabIndex={-1} ref={title}>{failure ? failure.title : locate.title}</h3>
            <button className="btn btn-small btn-close" type="button" onClick={close}>
              <Icon name="close" />
              {locate.close}
            </button>
          </div>
          {failure ? (
            <div className="stack-xs">
              <p>{failure.body}</p>
              {failure.steps.length > 0 ? (
                <>
                  <p className="label">{locate.turnOn}</p>
                  <ol className="fp-steps">{failure.steps.map(step => <li key={step}>{step}</li>)}</ol>
                </>
              ) : null}
            </div>
          ) : (
            <div className="fp-prime">
              <span className="fp-prime-ic"><Icon name="locate" /></span>
              <div className="stack-xs">
                <p className="t-l"><b>{locate.stand}</b></p>
                <p className="muted">{locate.allow}</p>
              </div>
            </div>
          )}
          {state.kind === "failed" && state.why === "unsupported" ? null : (
            <button className="btn btn-primary btn-block" type="button" aria-busy={finding} onClick={() => void findMe()}>
              {finding ? <span className="spinner" aria-hidden="true" /> : <Icon name={failure ? "refresh" : "locate"} />}
              {finding ? locate.finding : failure ? locate.tryAgain : locate.go}
            </button>
          )}
          <p className="sr" role="status">{finding ? locate.findingSaid : ""}</p>
        </section>
      ) : null}
    </div>
  );
}

/**
 * The chosen place and "Mark my field". Not .btn-primary: F1's dock holds the page's one primary button. After a search
 * row or a typed position, focus moves here. After a tap on the globe the button only comes into view, so the page
 * moves as little as it can under the farmer's finger.
 */
export function PlaceCard(props: { readonly c: Controller }): ReactElement | null {
  const { c } = props;
  const { picker } = c;
  const candidate = picker.stage === "finding" ? picker.candidate : null;
  const button = useRef<HTMLButtonElement>(null);
  const chosen = picker.note?.kind === "place" && picker.note.place === candidate ? candidate : null;
  useEffect(() => {
    if (!chosen || !button.current) return;
    if (chosen.kind === "tapped") {
      button.current.scrollIntoView({ block: "nearest" });
      return;
    }
    if (chosen.kind !== "found" && chosen.kind !== "position") return;
    button.current.focus({ preventScroll: true });
    // Aligned to the bottom, just above F1's dock, the map and its pin stay in view above the button.
    button.current.scrollIntoView({ block: "end" });
  }, [chosen]);
  if (candidate === null) return null;
  const [name, where] = candidate.kind === "found" ? [candidate.name, candidate.where]
    : candidate.kind === "saved" ? [candidate.label, ""]
    : [coordsText(candidate.at, 3), ""];
  return (
    <div className="stack-s">
      <div className="fp-place">
        <span className="fp-pinic"><Icon name="pin" /></span>
        <p className="fp-place-tx">
          <b>{name}</b>
          {where ? <>{" "}<span className="muted">{where}</span></> : null}
        </p>
      </div>
      <button ref={button} className="btn btn-block fp-go" type="button" onClick={() => c.send({ kind: "mark" })}>
        {find.markField}
        <Icon name="arrow" />
      </button>
    </div>
  );
}
