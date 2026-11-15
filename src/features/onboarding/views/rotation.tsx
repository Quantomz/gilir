"use client";
// Page 4, "Your rotation": the field-ready date first, then last year's 12 months, then the two alternatives.
// Every way to change a bar (drag, keys, the date sheet) is one edit through the controller, so none can reach a
// state another cannot. Pointer-only parts (the overview strip, the bar body) are hidden from assistive technology,
// and each of their actions has a button below.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactElement, RefObject } from "react";
import type { Controller } from "../controller";
import { liveEntryIssues } from "../model/check";
import type { PageIssue } from "../model/check";
import { addDays, formatDay, isoDate, monthName, planLastDay, todayLocal } from "../model/dates";
import { historyMode, recordedEntries, windowOf } from "../model/draft";
import { domIdOf } from "../model/flow";
import type { FocusTarget, Step } from "../model/flow";
import { policy } from "../model/policy";
import { dragDay, gapsOf, monthBands, placementOf, spanOf } from "../model/timeline";
import type { Coverage, CropEntry, End, Entry, FallowEntry, Span } from "../model/timeline";
import { barWords, dateWords, entryRangeWords, failureWords, issueWords, makePlan, rangeWords, rotation, titles } from "../model/words";
import { StepFrame } from "./frame";
import { Icon } from "./icons";
import type { IconName } from "./icons";
import { IssueText } from "./parts";

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
  const historyIssues = here.filter(issue => issue.entryId === null && issue.path[0] === "history");
  const needDate = mode.kind === "editing" && mode.asked && draft.planningStart === undefined;
  const coverage = windowOf(draft);
  const history = historyMode(draft);
  const off = history === "empty" || history === "skipped";
  const start = draft.planningStart;
  const dateNote = dateIssue ? issueWords(dateIssue, c.names) : needDate ? rotation.needDate : null;
  const [typed, setTyped] = useState<string | null>(null);

  const dock = (
    <>
      {failure ? <IssueText>{rotation.dockFailure}</IssueText> : null}
      {c.flow.check && all.length > 0 ? <IssueText>{rotation.dockIssues(all.length)}</IssueText> : null}
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
            <p className="banner-t" id={domIdOf({ kind: "submitPanel" })} tabIndex={-1}>{failureWords[failure.code].title}</p>
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
          <label id="ready-l" htmlFor={domIdOf({ kind: "planningStart" })}>{rotation.dateLabel}</label>
        </h2>
        <p className="muted" id="ready-hint" data-say="">{rotation.dateHint}</p>
        <div className="input-wrap date-wrap">
          <input
            id={domIdOf({ kind: "planningStart" })}
            type="date"
            required
            aria-describedby={dateNote ? "ready-hint ready-err" : "ready-hint"}
            aria-invalid={dateNote ? true : undefined}
            min="0001-01-01"
            max="9998-12-31"
            value={typed ?? start ?? ""}
            onChange={event => {
              const raw = event.target.value;
              const date = isoDate(raw);
              // Text that is not a date yet stays in the input, as in the date sheet, so one stray digit never clears it.
              if (date === null && (raw !== "" || event.target.validity.badInput)) {
                setTyped(raw);
                return;
              }
              setTyped(null);
              c.edit({ kind: "planningStart", date });
            }}
          />
        </div>
        {dateNote ? <IssueText id="ready-err">{dateNote}</IssueText> : null}
        {start !== undefined && start < todayLocal() ? (
          <p className="hint-note" data-say="">
            <Icon name="info" />
            <span>{rotation.pastDate}</span>
          </p>
        ) : null}
        {start !== undefined ? (
          <p className="ly-window" aria-live="polite" data-say="">
            <Icon name="calendar" />
            <span>
              {rotation.window.lead} <b>{dateWords(start)}</b> {rotation.window.to} <b>{dateWords(planLastDay(start))}</b>
            </span>
          </p>
        ) : null}
      </section>
      <section className="card ly-card" aria-labelledby="ly-t">
        <div className="stack-xs">
          <h2 className="section-t" id="ly-t" data-say="">{rotation.historyTitle}</h2>
          {coverage !== null && !off ? (
            <p className="muted" data-say="">
              {rotation.historyHelp(dateWords(coverage.start), dateWords(addDays(coverage.endExclusive, -1)))}
            </p>
          ) : null}
        </div>
        {coverage === null ? (
          <p className="ly-wait" data-say="">
            <Icon name="calendar" />
            <span>{rotation.waitForDate}</span>
          </p>
        ) : off ? (
          <div className="ly-off" data-say="">
            <span className="ly-off-ic"><Icon name={history === "empty" ? "soil" : "help"} /></span>
            <p>
              {history === "empty" ? <b>{rotation.emptyAllYear}</b> : <><b>{rotation.skipped.lead}</b> {rotation.skipped.rest}</>}
            </p>
            <button className="btn btn-quiet" type="button" onClick={() => c.edit({ kind: "alternative", choice: history })}>
              {c.flow.editor.setAside ? rotation.showAgain : rotation.addInstead}
            </button>
          </div>
        ) : (
          <HistoryEditor c={c} coverage={coverage} />
        )}
        {historyIssues.length > 0 ? (
          <div className="issues">
            {historyIssues.map(issue => <IssueText key={`${issue.kind} ${issue.path.join(".")}`}>{issueWords(issue, c.names)}</IssueText>)}
          </div>
        ) : null}
      </section>
      <div className="ly-or">
        <p className="label" id="ly-or-t">{rotation.or}</p>
        <div className="ly-alts" role="group" aria-labelledby="ly-or-t">
          {alternatives.map(alternative => (
            <button
              className="ly-alt"
              id={domIdOf({ kind: "alternative", choice: alternative.choice })}
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
    <section className="err-sum" id={domIdOf({ kind: "summary" })} tabIndex={-1} aria-labelledby="err-sum-t">
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
                <button className="btn-link" type="button" onClick={() => c.go(page, focusOf(c, issue, page))}>
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

/** The control that fixes an issue. A history issue with no bar goes to Add a crop while the timeline shows. */
function focusOf(c: Controller, issue: PageIssue, page: Step): FocusTarget {
  if (page !== 4) return { kind: "pageIssues", page };
  if (issue.kind === "date_missing" || issue.kind === "history_window") return { kind: "planningStart" };
  const entry = c.names.entryById(issue.entryId);
  if (entry !== null) return entry.kind === "crop" ? { kind: "editDates", entryId: entry.id } : { kind: "unsure", entryId: entry.id };
  const draft = c.flow.editor.draft;
  const mode = historyMode(draft);
  return windowOf(draft) !== null && (mode === "recorded" || mode === "none") ? { kind: "addCrop" } : { kind: "alternative", choice: "skipped" };
}

function HistoryEditor(props: { readonly c: Controller; readonly coverage: Coverage }): ReactElement {
  const { c, coverage } = props;
  const entries = recordedEntries(c.flow.editor.draft);
  const crops = entries.filter((entry): entry is CropEntry => entry.kind === "crop");
  const issues = new Map<string, PageIssue>();
  for (const issue of [...c.issues(4), ...liveEntryIssues(c.flow.editor.draft)]) {
    if (issue.entryId !== null && !issues.has(issue.entryId)) issues.set(issue.entryId, issue);
  }
  return (
    <>
      <Overview c={c} coverage={coverage} entries={entries} />
      {crops.length > 0 ? (
        <ol className="ly-rows" role="list" aria-label={rotation.lanes}>
          {crops.map(entry => <Lane key={entry.id} c={c} entry={entry} coverage={coverage} issue={issues.get(entry.id) ?? null} />)}
        </ol>
      ) : (
        <p className="ly-empty muted" data-say="">
          {rotation.noBars.before} <b>{rotation.addCrop}</b> {rotation.noBars.after}
        </p>
      )}
      <p className="sr" id="ly-keys">{rotation.keys}</p>
      <button className="btn ly-add" id={domIdOf({ kind: "addCrop" })} type="button" onClick={() => c.openSheet({ kind: "add", within: null })}>
        <Icon name="plus" />
        {rotation.addCrop}
      </button>
      <Spots c={c} coverage={coverage} entries={entries} issues={issues} />
    </>
  );
}

function Lane(props: { readonly c: Controller; readonly entry: CropEntry; readonly coverage: Coverage; readonly issue: PageIssue | null }): ReactElement {
  const { c, entry, coverage } = props;
  const track = useRef<HTMLDivElement>(null);
  const trackBox = () => track.current?.getBoundingClientRect() ?? null;
  const name = c.names.entry(entry);
  const visible = placementOf(entry, coverage).visible;
  const unsupported = entry.crop.kind === "unsupported";
  return (
    <li className="ly-row">
      <div className="ly-head" data-say="">
        <span className={unsupported ? "ly-art ly-art-other" : "ly-art"}><Icon name="sprout" /></span>
        <p className="ly-name">
          <b>{name}</b>
          <span className="ly-dates">{barWords(entry)}</span>
          {unsupported ? (
            <span className="ly-note">
              <Icon name="info" />
              {rotation.notOnList}
            </span>
          ) : null}
        </p>
      </div>
      <div className="ly-track" ref={track}>
        <span className="ly-grid" aria-hidden="true">
          {monthBands(coverage).slice(1).map(band => <i key={band.span.a} style={{ left: percent(band.span.a, coverage.days) }} />)}
        </span>
        {visible ? <Bar c={c} entry={entry} coverage={coverage} visible={visible} track={trackBox} /> : null}
        <Handle c={c} entry={entry} end="start" coverage={coverage} track={trackBox} />
        <Handle c={c} entry={entry} end="end" coverage={coverage} track={trackBox} />
      </div>
      {props.issue ? <IssueText className="ly-issue">{issueWords(props.issue, c.names)}</IssueText> : null}
      <button
        className="btn btn-small ly-edit"
        id={domIdOf({ kind: "editDates", entryId: entry.id })}
        type="button"
        onClick={() => openDates(c, entry.id)}
      >
        <Icon name="edit" />
        {rotation.changeDates}{" "}
        <span className="sr">{rotation.changeDatesFor(name)}</span>
      </button>
    </li>
  );
}

const keySteps: ReadonlyMap<string, number> = new Map([["ArrowRight", 1], ["ArrowUp", 1], ["ArrowLeft", -1], ["ArrowDown", -1], ["PageUp", 7], ["PageDown", -7]]);

/** One end of a crop bar, a slider with keys and a drag. A tap, Enter or Space opens the date sheet for that end. */
function Handle(props: {
  readonly c: Controller;
  readonly entry: CropEntry;
  readonly end: "start" | "end";
  readonly coverage: Coverage;
  readonly track: () => DOMRect | null;
}): ReactElement {
  const { c, entry, end, coverage } = props;
  const span = spanOf(entry, coverage);
  const day = end === "start" ? span.a : span.b - 1;
  const own: FocusTarget = { kind: "handle", entryId: entry.id, end };
  const openDates = () => c.openSheet({ kind: "dates", entryId: entry.id, end: end === "start" ? "planted" : "harvested", returnTo: own });
  const drag = useDrag(c, entry, end, coverage, props.track, openDates);
  const name = c.names.entry(entry);
  const date = end === "start" ? entry.planted : entry.harvested;
  const approximate = (end === "start" ? entry.plantedPrecision : entry.harvestedPrecision) === "approximate";

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDates();
      return;
    }
    const step = keySteps.get(event.key);
    const target = event.key === "Home" ? 0 : event.key === "End" ? coverage.days - 1 : step === undefined ? null : day + step;
    if (target === null) return;
    event.preventDefault();
    c.edit({ kind: "step", entryId: entry.id, end, targetDay: target });
  }

  return (
    <span
      className={end === "start" ? "ly-h ly-h-plant" : "ly-h ly-h-harvest"}
      id={domIdOf(own)}
      role="slider"
      tabIndex={0}
      aria-label={end === "start" ? rotation.handlePlant(name) : rotation.handleHarvest(name)}
      aria-valuemin={0}
      aria-valuemax={coverage.days - 1}
      aria-valuenow={Math.max(0, Math.min(coverage.days - 1, day))}
      aria-valuetext={rotation.handleValue(rotation.about(formatDay(date, "long"), approximate), Math.max(0, span.b - span.a))}
      aria-describedby="ly-keys"
      style={{ left: percent(end === "start" ? span.a : span.b, coverage.days) }}
      onKeyDown={onKeyDown}
      {...drag}
    >
      <i />
    </span>
  );
}

/** The bar body: drag to move the whole bar, tap to change its dates. "Change dates" is its keyboard twin. */
function Bar(props: {
  readonly c: Controller;
  readonly entry: CropEntry;
  readonly coverage: Coverage;
  readonly visible: Span;
  readonly track: () => DOMRect | null;
}): ReactElement {
  const { c, entry, coverage, visible } = props;
  const placed = placementOf(entry, coverage);
  const drag = useDrag(c, entry, "move", coverage, props.track, () => openDates(c, entry.id));
  const classes = ["ly-bar", entry.crop.kind === "unsupported" ? "ly-bar-other" : "", placed.cutStart ? "ly-cut-l" : "", placed.cutEnd ? "ly-cut-r" : ""];
  return (
    <span className={classes.filter(Boolean).join(" ")} aria-hidden="true" style={placeSpan(visible, coverage.days)} {...drag}>
      {(visible.b - visible.a) / coverage.days > room.barArtShare ? <span className="ly-bar-art"><Icon name="sprout" /></span> : null}
    </span>
  );
}

/**
 * Pointer handlers for one end or the whole bar. Each move asks the controller to step toward the day under the
 * pointer, so a drag stops at the same edges, overlaps and one-day minimum as the keys. Travel under
 * policy.history.dragThresholdPx is a tap.
 */
function useDrag(c: Controller, entry: Entry, end: End, coverage: Coverage, track: () => DOMRect | null, onTap: () => void) {
  const drag = useRef<{ readonly x0: number; readonly from: number; readonly width: number; moved: boolean; target: number } | null>(null);
  const span = spanOf(entry, coverage);
  const from = end === "end" ? span.b - 1 : span.a;
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      const box = track();
      if (event.button !== 0 || box === null) return;
      event.preventDefault();
      drag.current = { x0: event.clientX, from, width: box.width, moved: false, target: from };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      if (end !== "move") event.currentTarget.focus({ preventScroll: true });
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const held = drag.current;
      if (held === null) return;
      const travel = event.clientX - held.x0;
      if (!held.moved && Math.abs(travel) < policy.history.dragThresholdPx) return;
      held.moved = true;
      const target = dragDay(held.from, travel, held.width, coverage.days);
      if (target === held.target) return;
      held.target = target;
      c.edit({ kind: "step", entryId: entry.id, end, targetDay: target });
    },
    onPointerUp() {
      const held = drag.current;
      drag.current = null;
      if (held === null) return;
      if (held.moved) c.dropped(entry.id, end, held.target);
      else onTap();
    },
    onPointerCancel() {
      drag.current = null;
    },
  };
}

/**
 * The room a label or a mark needs before it is drawn. Widths are in the month row's em, so they grow with Text
 * size and a label is left out rather than clipped against its neighbour. Month labels are judged on a 28-day month
 * first, so a row shows a label for every whole month or for none, never one with gaps.
 */
const room = {
  monthNameEm: 1.9,
  monthLetterEm: 0.8,
  monthLetterMinDays: 9,
  shortestMonthDays: 28,
  unsureEm: 4.7,
  emptyEm: 3.9,
  cropArtEm: 1.7,
  /** A crop bar draws its sprout when it covers more than this share of the year. */
  barArtShare: 0.07,
  /** The first year label is left out when the next year starts within this share of the strip. */
  firstYearShare: 0.22,
} as const;

/**
 * The whole 12 months on one line: months, years, crops, empty times and Not sure gaps. Pointer users tap a gap, an
 * empty time or a crop here. The same actions are buttons in the lanes and the list below.
 */
function Overview(props: { readonly c: Controller; readonly coverage: Coverage; readonly entries: readonly Entry[] }): ReactElement {
  const { c, coverage, entries } = props;
  const strip = useRef<HTMLDivElement>(null);
  const months = useRef<HTMLDivElement>(null);
  const { width, em } = useStripSize(strip, months);
  const days = coverage.days;
  const emPerDay = width > 0 && em > 0 ? width / em / days : 0;
  const fits = (span: Span, ems: number) => (span.b - span.a) * emPerDay >= ems;
  const everyMonth = (ems: number) => room.shortestMonthDays * emPerDay >= ems;
  const bands = monthBands(coverage);
  const years = bands.filter((band, i) => i === 0 || band.month0 === 0);
  const shownYears = years.length > 1 && (years[1]?.span.a ?? days) < days * room.firstYearShare ? years.slice(1) : years;
  const monthLabel = (span: Span, month0: number) => {
    if (everyMonth(room.monthNameEm) && fits(span, room.monthNameEm)) return monthName(month0, "short");
    const letter = everyMonth(room.monthLetterEm) && fits(span, room.monthLetterEm) && span.b - span.a >= room.monthLetterMinDays;
    return letter ? monthName(month0, "narrow") : "";
  };
  return (
    <div className="ly-over" aria-hidden="true">
      <div className="ly-mon" ref={months}>
        {bands.map(band => <span key={band.span.a} style={placeSpan(band.span, days)}>{monthLabel(band.span, band.month0)}</span>)}
      </div>
      <div className="ly-yr">
        {shownYears.map(band => <span key={band.span.a} style={{ left: percent(band.span.a, days) }}>{band.year}</span>)}
      </div>
      <div className="ly-otrack" ref={strip}>
        {bands.slice(1).map(band => (
          <i key={band.span.a} className={band.month0 === 0 ? "ly-mline ly-yline" : "ly-mline"} style={{ left: percent(band.span.a, days) }} />
        ))}
        {gapsOf(entries, coverage).map(gap => (
          <span key={`gap ${gap.a}`} className="ly-seg ly-seg-gap" style={placeSpan(gap, days)} onClick={() => c.openSheet({ kind: "gap", gap })}>
            {fits(gap, room.unsureEm) ? <b>{rotation.unsure}</b> : null}
          </span>
        ))}
        {entries.map(entry => {
          const visible = placementOf(entry, coverage).visible;
          if (visible === null) return null;
          if (entry.kind === "fallow") {
            return (
              <span key={entry.id} className="ly-seg ly-seg-empty" style={placeSpan(visible, days)} onClick={() => c.openSheet({ kind: "empty", entryId: entry.id })}>
                {fits(visible, room.emptyEm) ? <b>{rotation.empty}</b> : null}
              </span>
            );
          }
          return (
            <span
              key={entry.id}
              className={entry.crop.kind === "unsupported" ? "ly-seg ly-seg-crop ly-seg-other" : "ly-seg ly-seg-crop"}
              style={placeSpan(visible, days)}
              onClick={() => openDates(c, entry.id)}
            >
              {fits(visible, room.cropArtEm) ? <span className="ly-bar-art"><Icon name="sprout" /></span> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

type Spot = { readonly kind: "unsure"; readonly gap: Span } | { readonly kind: "empty"; readonly entry: FallowEntry };

/** Not sure and empty times in order through the year. A Not sure time stays unknown until the farmer marks it. */
function Spots(props: {
  readonly c: Controller;
  readonly coverage: Coverage;
  readonly entries: readonly Entry[];
  readonly issues: ReadonlyMap<string, PageIssue>;
}): ReactElement | null {
  const { c, coverage, entries } = props;
  const startOf = (spot: Spot) => (spot.kind === "unsure" ? spot.gap.a : spanOf(spot.entry, coverage).a);
  const spots: Spot[] = [
    ...gapsOf(entries, coverage).map(gap => ({ kind: "unsure", gap }) as const),
    ...entries.flatMap(entry => (entry.kind === "fallow" ? [{ kind: "empty", entry } as const] : [])),
  ].sort((p, q) => startOf(p) - startOf(q));
  if (spots.length === 0) return null;
  return (
    <div className="stack-xs">
      <h3 className="label">{rotation.spotsTitle}</h3>
      <ul className="ly-spots" role="list">
        {spots.map(spot => {
          if (spot.kind === "unsure") {
            const { gap } = spot;
            const range = rangeWords(addDays(coverage.start, gap.a), addDays(coverage.start, gap.b - 1));
            return (
              <li className="ly-spot" key={`gap ${gap.a}`}>
                <span className="spot-key spot-unsure" aria-hidden="true" />
                <p>
                  <b>{rotation.unsure}</b>
                  <span>{rotation.spotLine(gap.a === 0 && gap.b === coverage.days ? rotation.wholeYear : range, gap.b - gap.a)}</span>
                </p>
                <button className="btn btn-small" type="button" onClick={() => c.edit({ kind: "markEmpty", gap })}>
                  {rotation.markEmpty}
                  <span className="sr">{rotation.spotFor(range)}</span>
                </button>
              </li>
            );
          }
          const { entry } = spot;
          const range = entryRangeWords(entry);
          const issue = props.issues.get(entry.id);
          return (
            <li className="ly-spot" key={entry.id}>
              <span className="spot-key spot-empty" aria-hidden="true" />
              <p>
                <b>{rotation.empty}</b>
                <span>{range}</span>
              </p>
              {issue ? <IssueText className="ly-issue">{issueWords(issue, c.names)}</IssueText> : null}
              <button
                className="btn btn-small btn-quiet"
                id={domIdOf({ kind: "unsure", entryId: entry.id })}
                type="button"
                onClick={() => c.edit({ kind: "removeEntry", entryId: entry.id })}
              >
                {rotation.markUnsure}
                <span className="sr">{rotation.spotFor(range)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The strip's width and the month row's font size, kept current. Zero until measured. The month row is watched too
 * because a Text size change can leave the strip's width alone and still change its row's height.
 */
function useStripSize(strip: RefObject<HTMLElement | null>, months: RefObject<HTMLElement | null>): { readonly width: number; readonly em: number } {
  const [size, setSize] = useState({ width: 0, em: 0 });
  useEffect(() => {
    const track = strip.current;
    const row = months.current;
    if (!track || !row) return;
    const measure = () => {
      const next = { width: track.getBoundingClientRect().width, em: parseFloat(getComputedStyle(row).fontSize) || 0 };
      setSize(last => (last.width === next.width && last.em === next.em ? last : next));
    };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(track);
    observer?.observe(row);
    return () => observer?.disconnect();
  }, [strip, months]);
  return size;
}

/** The date sheet from its planting date. Closing it returns focus to the lane's Change dates. */
function openDates(c: Controller, entryId: string): void {
  c.openSheet({ kind: "dates", entryId, end: "planted", returnTo: { kind: "editDates", entryId } });
}

function percent(day: number, days: number): string {
  return `${((Math.max(0, Math.min(days, day)) / days) * 100).toFixed(3)}%`;
}

function placeSpan(span: Span, days: number): CSSProperties {
  return { left: percent(span.a, days), width: `${(((span.b - span.a) / days) * 100).toFixed(3)}%` };
}
