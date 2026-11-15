"use client";
import { useRef } from "react";
import type { ReactElement, ReactNode, Ref } from "react";
import { crops } from "../model/words";
import { Icon } from "./icons";

export function IssueText(props: {
  readonly children: ReactNode;
  readonly id?: string;
  readonly className?: string;
  readonly role?: "alert";
  readonly tabIndex?: number;
  readonly ref?: Ref<HTMLParagraphElement>;
}): ReactElement {
  return (
    <p ref={props.ref} className={props.className ? `error-text ${props.className}` : "error-text"} id={props.id} role={props.role} tabIndex={props.tabIndex}>
      <Icon name="alert" />
      <span>{props.children}</span>
    </p>
  );
}

/** "Find a crop": a search box, a polite count of what it kept, and Show all crops while it holds words. */
export function CropFinder(props: {
  readonly id: string;
  readonly text: string;
  readonly onChange: (text: string) => void;
  /** Crops the words matched, crops on screen, and crops in the whole list. */
  readonly matched: number;
  readonly shown: number;
  readonly total: number;
  readonly withHint: boolean;
}): ReactElement {
  const { id, text } = props;
  const input = useRef<HTMLInputElement>(null);
  const filtering = text.trim() !== "";
  const described = props.withHint ? `${id}-hint ${id}-count` : `${id}-count`;
  return (
    <div className="field crop-find">
      <label className={props.withHint ? "label" : "muted"} htmlFor={id}>{crops.filterLabel}</label>
      {props.withHint ? <p className="hint" id={`${id}-hint`}>{crops.filterHint}</p> : null}
      <div className="input-wrap">
        <Icon name="search" />
        <input
          ref={input}
          id={id}
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          aria-describedby={described}
          value={text}
          onChange={event => props.onChange(event.target.value)}
        />
      </div>
      <div className="row crop-find-row">
        <p className="crop-find-count" id={`${id}-count`} aria-live="polite">
          {!filtering ? "" : props.matched === 0 ? crops.filterNone(text) : crops.filterCount(props.shown, props.total)}
        </p>
        {filtering ? (
          <button
            className="btn btn-small"
            type="button"
            onClick={() => {
              props.onChange("");
              input.current?.focus();
            }}
          >
            {crops.filterClear}
          </button>
        ) : null}
      </div>
    </div>
  );
}
