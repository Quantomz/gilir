"use client";
// F1's Sheet, StatusLine and icons are internal to F1 (its index exports only Onboarding and AppFrame), so F2 has its own.
import type { ReactElement } from "react";
import type { Controller } from "../controller";
import { noticesOf } from "../picker";
import type { Notice } from "../picker";
import { find, noteWords, noticeWords } from "../words";

const paths = {
  alert: <><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5M12 17.5v.1" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  edit: <><path d="M4 20h4l11-11-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.1" /></>,
  locate: <><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="1.8" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" /></>,
  minus: <path d="M5 12h14" />,
  pin: <><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4.5V11h-6.5" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20" /></>,
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof paths;

/** Every icon sits beside a written word, so each is hidden from assistive technology. */
export function Icon(props: { readonly name: IconName }): ReactElement {
  return (
    <span className="i" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" focusable="false">
        {paths[props.name]}
      </svg>
    </span>
  );
}

/** Every explanation that applies now. Each names a way that still works, with an icon and words, never colour alone. */
export function Notices(props: { readonly c: Controller }): ReactElement | null {
  const { c } = props;
  const notices = noticesOf(c.picker, c.provider.kind === "ready");
  if (notices.length === 0) return null;
  return <div className="stack-xs">{notices.map(notice => <NoticeLine key={notice.kind} c={c} notice={notice} />)}</div>;
}

function NoticeLine(props: { readonly c: Controller; readonly notice: Notice }): ReactElement {
  const { c, notice } = props;
  const words = noticeWords(notice);
  switch (notice.kind) {
    case "refused":
    case "saved_unusable":
      return <p className="note note-warn fp-notice" role="alert"><Icon name="alert" /><span>{words}</span></p>;
    case "still_marked":
      return (
        <div className="note fp-notice">
          <Icon name="info" />
          <div className="stack-xs">
            <p>{words}</p>
            <button className="btn btn-sub fp-self-start" type="button" onClick={() => c.send({ kind: "back" })}>{find.backToField}</button>
          </div>
        </div>
      );
    case "no_key":
    case "no_globe":
    case "no_pictures":
      return <p className="note fp-notice" role="status"><Icon name="alert" /><span>{words}</span></p>;
  }
}

/**
 * Always mounted, so a screen reader hears each change of text. A refusal is announced where it shows (role="alert"),
 * so it is left out here instead of being said twice.
 */
export function LiveRegion(props: { readonly c: Controller }): ReactElement {
  const { note, outline } = props.c.picker;
  const said = note === null || note.kind === "refused" || note.kind === "saved_unusable" ? "" : noteWords(note, outline);
  return <p className="sr" role="status" aria-live="polite">{said}</p>;
}
