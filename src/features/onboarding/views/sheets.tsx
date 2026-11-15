"use client";
// Page 4 sheets. The Text size sheet belongs to the top bar, in views/frame.tsx.
// Each holds its own unparsed text until it is valid, then calls c.edit once, so the draft never holds a half date or
// a blank name and the saved history is always whole.
import { useState } from "react";
import type { FormEvent, ReactElement } from "react";
import type { CropPurposeId } from "@/contracts";
import type { Controller } from "../controller";
import { addDays, daysBetween, isoDate } from "../model/dates";
import { datesProblem, nameProblem, recordedEntries, windowOf } from "../model/draft";
import type { DatesInput, DatesProblem } from "../model/draft";
import { domIdOf, matchCrops, readyCatalogue } from "../model/flow";
import type { CatalogueEntry } from "../model/flow";
import { policy } from "../model/policy";
import type { CropEntry, Span } from "../model/timeline";
import { crops, datesProblemWords, entryRangeWords, rangeWords, rotation, sheets } from "../model/words";
import { Sheet } from "./frame";
import { Icon } from "./icons";

/**
 * "Which crop grew here?", or "Which crop grew then?" for a tapped Not sure time. The farmer's own crops first, then
 * the rest of the list (with Find a crop when it is long), then a crop that is not on the list. A typed name equal to
 * a listed label is added from the list. After adding, focus goes to the new bar's Change dates.
 */
export function AddSheet(props: { readonly c: Controller; readonly within: Span | null }): ReactElement {
  const { c, within } = props;
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<DatesProblem | null>(null);
  const [find, setFind] = useState("");
  const state = c.flow.catalogue;
  const entries = readyCatalogue(state)?.entries ?? [];
  const picked = c.flow.editor.draft.cropPurposeIds ?? [];
  const mine = picked.flatMap(id => entries.filter(entry => entry.id === id));
  const others = entries.filter(entry => !picked.includes(entry.id));
  const findable = entries.length >= policy.crops.findFrom;
  const shown = findable ? matchCrops(others, find) : others;
  const first = mine[0]?.id ?? shown[0]?.id;
  const inGap = within !== null;

  const add = (id: CropPurposeId) => c.edit({ kind: "addCrop", crop: { kind: "catalogue", cropPurposeId: id }, within });
  function addNamed(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const refused = nameProblem(name);
    if (refused !== null) {
      setProblem(refused);
      document.getElementById("other-crop")?.focus();
      return;
    }
    c.edit({ kind: "addCrop", crop: { kind: "unsupported", label: name }, within });
  }
  const pick = (entry: CatalogueEntry) => (
    <li key={entry.id}>
      <button className="pick-btn" type="button" data-autofocus={entry.id === first ? "" : undefined} onClick={() => add(entry.id)}>
        <span className="crop-mark"><Icon name="sprout" /></span>
        <span className="pick-t">{entry.label}</span>
      </button>
    </li>
  );

  return (
    <Sheet title={sheets.addTitle(inGap)} returnTo={domIdOf({ kind: "addCrop" })} onClose={() => c.openSheet(null)}>
      <p className="muted">{sheets.addLead(inGap)}</p>
      {state.status === "failed" ? (
        <div className="note note-warn">
          <Icon name="alert" />
          <div className="stack-xs">
            <p>{sheets.listFailed}</p>
            <button className="btn btn-small justify-self-start" type="button" onClick={c.retryCatalogue}>
              <Icon name="refresh" />
              {crops.tryAgain}
            </button>
          </div>
        </div>
      ) : state.status !== "ready" ? (
        <p className="row muted" role="status">
          <span className="spinner" aria-hidden="true" />
          {crops.loading}
        </p>
      ) : null}
      {mine.length > 0 ? (
        <section className="stack-xs" aria-labelledby="add-mine">
          <h3 className="label" id="add-mine">{sheets.yourCrops}</h3>
          <ul className="pick-grid" role="list">{mine.map(pick)}</ul>
        </section>
      ) : null}
      {others.length > 0 ? (
        <section className="stack-xs" aria-labelledby="add-other">
          <h3 className="label" id="add-other">{mine.length > 0 ? sheets.otherCrops : sheets.allCrops}</h3>
          {findable ? (
            <div className="field crop-find">
              <label className="muted" htmlFor="add-find">{crops.filterLabel}</label>
              <div className="input-wrap">
                <Icon name="search" />
                <input
                  id="add-find"
                  type="search"
                  autoComplete="off"
                  enterKeyHint="search"
                  aria-describedby="add-find-count"
                  value={find}
                  onChange={event => setFind(event.target.value)}
                />
              </div>
              <div className="row crop-find-row">
                <p className="crop-find-count" id="add-find-count" aria-live="polite">
                  {find.trim() === "" ? "" : shown.length === 0 ? crops.filterNone(find) : crops.filterCount(shown.length, others.length)}
                </p>
                {find.trim() === "" ? null : (
                  <button
                    className="btn btn-small"
                    type="button"
                    onClick={() => {
                      setFind("");
                      document.getElementById("add-find")?.focus();
                    }}
                  >
                    {crops.filterClear}
                  </button>
                )}
              </div>
            </div>
          ) : null}
          <ul className="pick-grid" role="list">{shown.map(pick)}</ul>
        </section>
      ) : null}
      <form className="stack-xs add-other" onSubmit={addNamed} noValidate>
        <h3 className="label">{sheets.notListedTitle}</h3>
        <div className="field">
          <label className="muted" htmlFor="other-crop">{sheets.nameLabel}</label>
          <div className="search-row">
            <div className="input-wrap">
              <input
                id="other-crop"
                type="text"
                autoComplete="off"
                maxLength={120}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? "other-note other-err" : "other-note"}
                value={name}
                onChange={event => {
                  setName(event.target.value);
                  setProblem(null);
                }}
              />
            </div>
            <button className="btn btn-sub" type="submit">
              <Icon name="plus" />
              {sheets.addThis}
            </button>
          </div>
          {problem ? (
            <p className="error-text" id="other-err">
              <Icon name="alert" />
              <span>{datesProblemWords(problem, c.names)}</span>
            </p>
          ) : null}
          <p className="hint" id="other-note">{sheets.nameHint}</p>
        </div>
      </form>
    </Sheet>
  );
}

/**
 * "Change dates: {crop}". The accessible date control for both ends of a bar, and the keyboard way to move a whole
 * bar. Both dates stay inside the 12 months, and a harvest may not fall on the field-ready date itself. One
 * "approximate" switch sets both precisions. The problem shows softly while typing, then as an alert once Save is tried.
 */
export function DatesSheet(props: {
  readonly c: Controller;
  readonly entryId: string;
  readonly end: "planted" | "harvested";
  readonly returnTo: string;
}): ReactElement | null {
  const { c, entryId } = props;
  const editor = c.flow.editor;
  const entry = recordedEntries(editor.draft).find((other): other is CropEntry => other.id === entryId && other.kind === "crop");
  const [form, setForm] = useState(() => ({
    planted: entry?.planted ?? "",
    harvested: entry?.harvested ?? "",
    approximate: entry === undefined || entry.plantedPrecision === "approximate" || entry.harvestedPrecision === "approximate",
    label: entry?.crop.kind === "unsupported" ? entry.crop.label : "",
  }));
  const [tried, setTried] = useState(false);
  const coverage = windowOf(editor.draft);
  if (entry === undefined || coverage === null) return null;

  const name = c.names.entry(entry);
  const unsupported = entry.crop.kind === "unsupported";
  const last = addDays(coverage.endExclusive, -1);
  const planted = isoDate(form.planted);
  const harvested = isoDate(form.harvested);
  const dates: DatesInput | null = planted !== null && harvested !== null
    ? { planted, harvested, approximate: form.approximate, ...(unsupported ? { label: form.label } : {}) }
    : null;
  const nameIssue = unsupported ? nameProblem(form.label) : null;
  const dateIssue = dates === null ? null : datesProblem(editor, entryId, dates);
  const problem = nameIssue ?? dateIssue;
  const words = problem !== null ? datesProblemWords(problem, c.names)
    : planted === null ? sheets.plantedMissing
    : harvested === null ? sheets.harvestedMissing
    : null;
  const update = (patch: Partial<typeof form>) => setForm(current => ({ ...current, ...patch }));

  function save(): void {
    if (words !== null || dates === null) {
      setTried(true);
      document.getElementById("dates-err")?.focus();
      return;
    }
    c.edit({ kind: "saveDates", entryId, dates });
  }

  return (
    <Sheet title={sheets.datesTitle(name)} returnTo={props.returnTo} onClose={() => c.openSheet(null)}>
      {unsupported ? (
        <div className="field">
          <label className="label" htmlFor="dp-name">{sheets.nameLabel}</label>
          <div className="input-wrap">
            <input id="dp-name" type="text" maxLength={120} value={form.label} onChange={event => update({ label: event.target.value })} />
          </div>
          <p className="hint">{sheets.nameHint}</p>
        </div>
      ) : null}
      <div className="field">
        <label className="label" htmlFor="dp-start">{sheets.planted}</label>
        <div className="input-wrap date-wrap">
          <input
            id="dp-start"
            type="date"
            min={coverage.start}
            max={last}
            value={form.planted}
            data-autofocus={props.end === "planted" ? "" : undefined}
            onChange={event => update({ planted: event.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="dp-end">{sheets.harvested}</label>
        <p className="hint" id="dp-end-h">{sheets.harvestedHint}</p>
        <div className="input-wrap date-wrap">
          <input
            id="dp-end"
            type="date"
            min={coverage.start}
            max={last}
            value={form.harvested}
            aria-describedby="dp-end-h"
            data-autofocus={props.end === "harvested" ? "" : undefined}
            onChange={event => update({ harvested: event.target.value })}
          />
        </div>
      </div>
      <label className="check approx">
        <input type="checkbox" checked={form.approximate} onChange={event => update({ approximate: event.target.checked })} />
        <span>
          <b>{sheets.approximate}</b>
          <br />
          <span className="muted">{sheets.approximateHint}</span>
        </span>
      </label>
      {words !== null ? (
        <p className={tried ? "error-text" : "error-text error-soft"} id="dates-err" tabIndex={-1} role={tried ? "alert" : undefined}>
          <Icon name="alert" />
          <span>{words}</span>
        </p>
      ) : planted !== null && harvested !== null ? (
        <p className="ly-len" aria-live="polite">
          <Icon name="calendar" />
          {sheets.length(daysBetween(planted, harvested) + 1)}
        </p>
      ) : null}
      <button className="btn btn-primary btn-block" type="button" onClick={save}>
        <Icon name="check" />
        {sheets.save}
      </button>
      <button className="btn btn-quiet" type="button" onClick={() => c.edit({ kind: "removeEntry", entryId })}>
        <Icon name="close" />
        {sheets.remove(name)}
      </button>
    </Sheet>
  );
}

/** "Not sure: {range}". Leaving it is fine: it stays unknown. Or mark it empty, or add the crop that grew then. */
export function GapSheet(props: { readonly c: Controller; readonly gap: Span }): ReactElement | null {
  const { c, gap } = props;
  const coverage = windowOf(c.flow.editor.draft);
  if (coverage === null) return null;
  const range = rangeWords(addDays(coverage.start, gap.a), addDays(coverage.start, gap.b - 1));
  return (
    <Sheet title={sheets.gapTitle(range)} returnTo={null} onClose={() => c.openSheet(null)}>
      <p className="muted">{sheets.gapBody(gap.b - gap.a)}</p>
      <button className="btn btn-primary btn-block" type="button" data-autofocus="" onClick={() => c.edit({ kind: "markEmpty", gap })}>
        <Icon name="soil" />
        {rotation.markEmpty}
      </button>
      <button className="btn btn-block" type="button" onClick={() => c.openSheet({ kind: "add", within: gap })}>
        <Icon name="plus" />
        {sheets.cropGrew}
      </button>
    </Sheet>
  );
}

/** "Empty: {range}", ending on the last empty day. Marking it not sure again removes the empty time. */
export function EmptySheet(props: { readonly c: Controller; readonly entryId: string }): ReactElement | null {
  const { c, entryId } = props;
  const entry = recordedEntries(c.flow.editor.draft).find(other => other.id === entryId && other.kind === "fallow");
  if (entry === undefined) return null;
  return (
    <Sheet title={sheets.emptyTitle(entryRangeWords(entry))} returnTo={null} onClose={() => c.openSheet(null)}>
      <p className="muted">{sheets.emptyBody}</p>
      <button className="btn btn-primary btn-block" type="button" data-autofocus="" onClick={() => c.edit({ kind: "removeEntry", entryId })}>
        <Icon name="help" />
        {rotation.markUnsure}
      </button>
    </Sheet>
  );
}
