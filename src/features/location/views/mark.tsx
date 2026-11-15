"use client";
// Marking the field: the heading and lead, the tools under the map, the corner list and the precision note.
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactElement } from "react";
import { cornersOfRows, rowsOfPoints } from "../coordinates";
import type { Axis, CornerRow, RowError } from "../coordinates";
import type { Controller } from "../controller";
import { boxAround, limits } from "../outline";
import { listShown, phaseOf } from "../picker";
import type { Picker } from "../picker";
import { acrossText, areaText, coordError, heading, lead, list, mark, noteWords, precisionWords, problemTyped, weatherGrid } from "../words";
import { Icon } from "./parts";

export function MarkHead(props: { readonly c: Controller }): ReactElement | null {
  const { c } = props;
  const { picker } = c;
  const phase = phaseOf(picker);
  if (picker.stage !== "marking" || phase === "finding") return null;
  return (
    <div className="stack-s">
      <div className="stack-xs">
        <h2 className="section-t" id={c.idOf("heading")} tabIndex={-1} ref={c.focusRef("heading")}>{heading[phase]}</h2>
        <p className="muted">{picker.surface.kind === "plan" ? lead.plan : lead[phase]}</p>
      </div>
      <div className="fp-place-line">
        <p>
          <Icon name="pin" />
          <span>{picker.outline.label}</span>
        </p>
        <div className="fp-acts">
          <button className="btn btn-quiet btn-small" type="button" onClick={() => c.send({ kind: "again" })}>{mark.searchAgain}</button>
          {listShown(picker) ? null : (
            <button className="btn btn-quiet btn-small" type="button" ref={c.focusRef("list_opener")} onClick={() => c.send({ kind: "list", open: true })}>
              {mark.typeCorners}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The status in words, then the box's size buttons or the corner buttons. At an end of the sizes the button still
 * answers, in words, because a disabled button cannot be focused or say why. With the flat plan the corner list has
 * its own Add and Remove.
 */
export function MarkTools(props: { readonly c: Controller }): ReactElement | null {
  const { c } = props;
  const { picker } = c;
  const add = useRef<HTMLButtonElement>(null);
  if (picker.stage !== "marking") return null;
  const { outline, selected, note } = picker;
  const { made, marked } = outline;
  const sideM = made.kind === "box" ? Math.sqrt(made.hectares * 10_000) : 0;
  return (
    <div className="stack-s">
      <p className="fp-status">
        <Icon name="check" />
        <span>{mark.status(marked.areaM2, marked.corners.length)}</span>
      </p>
      {made.kind === "box" ? (
        <div className="fp-size">
          <button className="btn btn-sub" type="button" onClick={() => c.send({ kind: "resize", step: -1 })}>
            <Icon name="minus" />
            {mark.smaller}
          </button>
          <p className="fp-size-read">
            <b>{areaText(made.hectares * 10_000)}</b>
            <span className="muted">{acrossText(sideM)}</span>
          </p>
          <button className="btn btn-sub" type="button" onClick={() => c.send({ kind: "resize", step: 1 })}>
            <Icon name="plus" />
            {mark.bigger}
          </button>
        </div>
      ) : picker.surface.kind === "plan" ? null : (
        <div className="fp-tools">
          <button ref={add} className="btn btn-sub" type="button" onClick={() => c.send({ kind: "insert" })}>
            <Icon name="plus" />
            {mark.addCorner}
          </button>
          {selected === null ? <p className="muted fp-choose">{mark.chooseCorner}</p> : (
            <button
              className="btn btn-sub"
              type="button"
              onClick={() => {
                c.send({ kind: "remove", corner: selected });
                add.current?.focus();
              }}
            >
              <Icon name="minus" />
              {mark.removeCorner(selected + 1)}
            </button>
          )}
        </div>
      )}
      {note?.kind === "size_end" ? <p className="muted">{noteWords(note, outline)}</p> : null}
    </div>
  );
}

/** Where the outline came from, then why marking it more exactly does not make the weather finer. No grid cell is drawn. */
export function Precision(props: { readonly c: Controller }): ReactElement | null {
  const { picker } = props.c;
  if (picker.stage !== "marking") return null;
  return (
    <div className="note fp-notice">
      <Icon name="info" />
      <div className="stack-xs">
        <p>{precisionWords(picker.outline)}</p>
        <p>{weatherGrid}</p>
      </div>
    </div>
  );
}

/** The object the rows were seeded from. A new one means the field changed outside the list, so the rows follow it. */
function seedOf(picker: Picker): object | null {
  if (picker.stage === "marking") return picker.outline.marked;
  return picker.candidate ?? picker.outline?.marked ?? null;
}

function rowsOf(picker: Picker): readonly CornerRow[] {
  if (picker.stage === "finding" && picker.candidate) return rowsOfPoints(boxAround(picker.candidate.at, 1));
  const marked = picker.outline?.marked;
  if (marked) return rowsOfPoints(marked.ring.slice(0, -1));
  return Array.from({ length: 4 }, () => ({ latitude: "", longitude: "" }));
}

const axes: readonly Axis[] = ["latitude", "longitude"];

/**
 * The keyboard and screen-reader way to do everything the map does, and the coordinate entry. A section in the page,
 * not a modal, so the farmer sees the drawing while typing. Rows are text, so a half-typed number survives a
 * re-render. They are parsed only on "Use these corners", and the picker alone judges the shape.
 */
export function CornerList(props: { readonly c: Controller }): ReactElement {
  const { c } = props;
  const { picker } = c;
  const seed = seedOf(picker);
  const [seededFrom, setSeededFrom] = useState(seed);
  const [rows, setRows] = useState(() => rowsOf(picker));
  const [errors, setErrors] = useState<readonly RowError[]>([]);
  const [full, setFull] = useState(false);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const focusNext = useRef<{ readonly row: number; readonly axis: Axis } | null>(null);

  if (seededFrom !== seed) {
    setSeededFrom(seed);
    setRows(rowsOf(picker));
    setErrors([]);
    setFull(false);
  }

  useEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    focusNext.current = null;
    inputs.current.get(`${target.row}-${target.axis}`)?.focus();
  }, [rows, errors]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFull(false);
    const result = cornersOfRows(rows);
    if (!result.ok) {
      focusNext.current = result.errors[0];
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    c.send({ kind: "typed", corners: result.corners });
  }

  function add(): void {
    if (rows.length >= limits.corners) {
      setFull(true);
      return;
    }
    focusNext.current = { row: rows.length, axis: "latitude" };
    setRows([...rows, { latitude: "", longitude: "" }]);
  }

  function remove(index: number): void {
    focusNext.current = { row: Math.min(index, rows.length - 2), axis: "latitude" };
    setRows(rows.filter((_, row) => row !== index));
    setErrors([]);
    setFull(false);
  }

  function type(index: number, axis: Axis, text: string): void {
    setRows(rows.map((row, i) => (i === index ? { ...row, [axis]: text } : row)));
  }

  const plan = picker.surface.kind === "plan";
  const note = picker.note;
  const problem = note?.kind === "refused" && note.from === "typed" && errors.length === 0 ? note.problem : null;
  return (
    <section className="fp-list" aria-labelledby={c.idOf("list")}>
      <div className="sheet-head">
        <h3 className="sheet-title" id={c.idOf("list")} tabIndex={-1} ref={c.focusRef("list")}>{list.title}</h3>
        {plan ? null : (
          <button className="btn btn-small btn-close" type="button" onClick={() => c.send({ kind: "list", open: false })}>
            <Icon name="close" />
            {list.close}
          </button>
        )}
      </div>
      <p className="muted" id={c.idOf("list-hint")}>{list.hint}</p>
      <form className="stack-s" noValidate onSubmit={submit}>
        {rows.map((row, index) => (
          <fieldset className="fp-corner" key={index}>
            <legend className="label">{list.corner(index + 1)}</legend>
            <div className="fp-corner-in">
              {axes.map(axis => {
                const id = `${c.idOf("list")}-${index}-${axis}`;
                const error = errors.find(entry => entry.row === index && entry.axis === axis);
                return (
                  <div className="field" key={axis} data-invalid={error ? "" : undefined}>
                    <label className="fp-axis" htmlFor={id}>{list[axis]}</label>
                    <div className="input-wrap">
                      <input
                        id={id}
                        ref={element => {
                          if (element) inputs.current.set(`${index}-${axis}`, element);
                          else inputs.current.delete(`${index}-${axis}`);
                        }}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `${id}-error` : c.idOf("list-hint")}
                        value={row[axis]}
                        onChange={event => type(index, axis, event.target.value)}
                      />
                    </div>
                    {error ? (
                      <p className="error-text" id={`${id}-error`}>
                        <Icon name="alert" />
                        <span>{coordError[axis][error.error]}</span>
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {rows.length > limits.minCorners ? (
              <button className="btn btn-quiet btn-small fp-self-start" type="button" onClick={() => remove(index)}>{list.remove(index + 1)}</button>
            ) : null}
          </fieldset>
        ))}
        <button className="btn btn-sub fp-self-start" type="button" onClick={add}>
          <Icon name="plus" />
          {list.add}
        </button>
        <p className={full ? "hint" : "sr"} role="status">{full ? list.atMost : ""}</p>
        {problem ? (
          <p className="error-text" id={c.idOf("problem")} role="alert" tabIndex={-1} ref={c.focusRef("problem")}>
            <Icon name="alert" />
            <span>{problemTyped[problem]}</span>
          </p>
        ) : null}
        <button className="btn btn-primary btn-block" type="submit">
          <Icon name="check" />
          {list.use}
        </button>
      </form>
    </section>
  );
}
