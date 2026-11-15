"use client";
// Page 4, "Your rotation": the field-ready date first, then last year's 12 months, then the two alternatives.
import type { ReactElement } from "react";
import type { Controller } from "../controller";
import type { PageIssue } from "../model/check";
import { isoDate, planLastDay, todayLocal } from "../model/dates";
import { historyMode, recordedEntries, windowOf } from "../model/draft";
import type { FocusTarget, Step } from "../model/flow";
import type { Coverage, CropEntry, Entry, Span } from "../model/timeline";
import { dateWords, entryWords, failureWords, issueWords, makePlan, rotation, titles } from "../model/words";
import { StepFrame } from "./frame";
import { Icon } from "./icons";
import type { IconName } from "./icons";

const alternatives: readonly { readonly choice: "empty" | "skipped"; readonly icon: IconName; readonly words: { readonly title: string; readonly detail: string } }[] = [
  { choice: "empty", icon: "soil", words: rotation.altEmpty },
  { choice: "skipped", icon: "help", words: rotation.altSkip },
];

export function RotationPage(props: { readonly c: Controller }): ReactElement {
  const { c } = props;
  const mode = c.flow.mode;
  const draft = c.flow.editor.draft;
  const send = mode.kind === "editing" ? mode.send : { kind: "idle" as const };
  const failure = send.kind === "unavailable" ? send.failure : null;
  const sending = send.kind === "sending";
  const all = c.issues("all");
  const here = c.issues(4);
  const dateIssue = here.find(issue => issue.kind === "date_missing");
  const needDate = mode.kind === "editing" && mode.asked && draft.planningStart === undefined;
  const coverage = windowOf(draft);
  const history = historyMode(draft);
  const start = draft.planningStart;
  const dateNote = dateIssue ? issueWords(dateIssue, c.names) : needDate ? rotation.needDate : null;

  const dock = (
    <>
      {failure ? (
        <p className="error-text">
          <Icon name="alert" />
          <span>{rotation.dockFailure}</span>
        </p>
      ) : null}
      {c.flow.check && all.length > 0 ? (
        <p className="error-text">
          <Icon name="alert" />
          <span>{rotation.dockIssues(all.length)}</span>
        </p>
      ) : null}
      <button className="btn btn-primary btn-block" type="button" aria-busy={sending} onClick={c.makePlan}>
        {sending ? <span className="spinner" aria-hidden="true" /> : <Icon name="sparkle" />}
        {sending ? makePlan.sending : makePlan.idle}
      </button>
    </>
  );

  return (
    <StepFrame step={4} title={titles.rotation} lead={rotation.lead} onBack={c.back} width="timeline" dock={dock}>
      {c.flow.check && all.length > 0 ? <Summary c={c} issues={all} /> : null}
      {failure ? (
        <div className="note note-warn submit-panel">
          <Icon name="alert" />
          <div className="stack-xs">
            <p className="banner-t" id="submit-fail" tabIndex={-1}>{failureWords[failure.code].title}</p>
            <p>{failureWords[failure.code].body}</p>
            {failure.retryable ? <p>{rotation.tapAgain}</p> : null}
          </div>
        </div>
      ) : null}
      {mode.kind === "editing" && mode.job !== null ? (
        <p className="note note-water">
          <Icon name="info" />
          <span>
            {rotation.jobRunning}{" "}
            <button className="btn-link" type="button" onClick={c.showMaking}>{rotation.seeJob}</button>
          </span>
        </p>
      ) : null}
      <section className="card stack-s ly-ready" aria-labelledby="ready-l">
        <h2 className="section-t">
          <label id="ready-l" htmlFor="ready-date">{rotation.dateLabel}</label>
        </h2>
        <p className="muted" id="ready-hint" data-say="">{rotation.dateHint}</p>
        <div className="input-wrap date-wrap">
          <input
            id="ready-date"
            type="date"
            required
            aria-describedby={dateNote ? "ready-hint ready-err" : "ready-hint"}
            aria-invalid={dateNote ? true : undefined}
            value={start ?? ""}
            onChange={event => c.edit({ kind: "planningStart", date: isoDate(event.target.value) })}
          />
        </div>
        {dateNote ? (
          <p className="error-text" id="ready-err">
            <Icon name="alert" />
            <span>{dateNote}</span>
          </p>
        ) : null}
        {start !== undefined && start < todayLocal() ? (
          <p className="hint-note" data-say="">
            <Icon name="info" />
            <span>{rotation.pastDate}</span>
          </p>
        ) : null}
        {start !== undefined ? (
          <p className="ly-window" aria-live="polite" data-say="">
            <Icon name="calendar" />
            <span>{rotation.window(dateWords(start), dateWords(planLastDay(start)))}</span>
          </p>
        ) : null}
      </section>
      <section className="card ly-card" aria-labelledby="ly-t">
        <h2 className="section-t" id="ly-t" data-say="">{rotation.historyTitle}</h2>
        {coverage === null ? (
          <p className="ly-wait" data-say="">
            <Icon name="calendar" />
            <span>{rotation.waitForDate}</span>
          </p>
        ) : history === "empty" || history === "skipped" ? (
          <div className="ly-off" data-say="">
            <span className="ly-off-ic"><Icon name={history === "empty" ? "soil" : "help"} /></span>
            <p><b>{history === "empty" ? rotation.emptyAllYear : rotation.skipped}</b></p>
            <button className="btn btn-quiet" type="button" onClick={() => c.edit({ kind: "alternative", choice: history })}>
              {c.flow.editor.setAside ? rotation.showAgain : rotation.addInstead}
            </button>
          </div>
        ) : (
          <HistoryEditor c={c} coverage={coverage} />
        )}
      </section>
      <div className="ly-or">
        <p className="label" id="ly-or-t">{rotation.or}</p>
        <div className="ly-alts" role="group" aria-labelledby="ly-or-t">
          {alternatives.map(alternative => (
            <button
              className="ly-alt"
              id={`ly-alt-${alternative.choice}`}
              key={alternative.choice}
              type="button"
              aria-pressed={history === alternative.choice}
              onClick={() => c.edit({ kind: "alternative", choice: alternative.choice })}
            >
              <span className="choice-ic"><Icon name={alternative.icon} /></span>
              <span className="choice-tx">
                <span className="choice-t">{alternative.words.title}</span>
                <span className="choice-d">{alternative.words.detail}</span>
              </span>
              <span className="tick"><Icon name="check" /></span>
            </button>
          ))}
        </div>
        <p className="muted t-s" data-say="">{rotation.skipNote}</p>
      </div>
    </StepFrame>
  );
}

/** "Fix these first": a link per issue on another page, the control's focus for one on this page, words alone otherwise. */
function Summary(props: { readonly c: Controller; readonly issues: readonly PageIssue[] }): ReactElement {
  const { c } = props;
  return (
    <section className="err-sum" id="err-sum" tabIndex={-1} aria-labelledby="err-sum-t">
      <h2 className="err-sum-t" id="err-sum-t">
        <Icon name="alert" />
        {rotation.fixFirst}
      </h2>
      <ul role="list">
        {props.issues.map(issue => {
          const words = issueWords(issue, c.names);
          const page = issue.page;
          return (
            <li key={`${issue.kind} ${issue.path.join(".")}`}>
              {page === null ? (
                <p>{words}</p>
              ) : (
                <button className="btn-link" type="button" onClick={() => c.go(page, focusOf(issue, page))}>
                  {page === 4 ? rotation.fixHere(words) : rotation.fixOnPage(page, words)}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function focusOf(issue: PageIssue, page: Step): FocusTarget {
  if (page !== 4) return { kind: "pageIssues", page };
  if (issue.kind === "date_missing") return { kind: "planningStart" };
  return issue.entryId === null ? { kind: "alternative", choice: "skipped" } : { kind: "editDates", entryId: issue.entryId };
}

/** Last year's crops, one lane each, in planting order. */
export function HistoryEditor(props: { readonly c: Controller; readonly coverage: Coverage }): ReactElement {
  const entries = recordedEntries(props.c.flow.editor.draft).filter((entry): entry is CropEntry => entry.kind === "crop");
  if (entries.length === 0) return <p className="ly-empty muted" data-say="">{rotation.noBars}</p>;
  return (
    <ol className="ly-rows" role="list">
      {entries.map(entry => (
        <li className="ly-row" key={entry.id}>
          <p className="ly-name">
            <b>{props.c.names.entry(entry)}</b>
            <span className="ly-dates">{entryWords(entry)}</span>
            {entry.crop.kind === "unsupported" ? <span className="muted t-s">{rotation.notOnList}</span> : null}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** One end of a crop bar, a slider with keys and a drag. */
export function Handle(props: {
  readonly c: Controller;
  readonly entry: CropEntry;
  readonly end: "start" | "end";
  readonly coverage: Coverage;
  readonly track: () => DOMRect | null;
}): ReactElement {
  throw new Error("not implemented");
}

/** The bar body: drag to move the whole bar. The date sheet is its keyboard twin. */
export function Bar(props: { readonly c: Controller; readonly entry: Entry; readonly coverage: Coverage; readonly visible: Span }): ReactElement {
  throw new Error("not implemented");
}
