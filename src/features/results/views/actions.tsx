"use client";
// A waiting button has aria-disabled, never `disabled`, so it keeps focus and a screen reader can still find it.
// The alert is one <div role="alert"> kept in the document, so a failure is announced when its text appears. It
// appears above the buttons, so the button that kept focus is brought back into view.
// The saved line is not a live region: a change that moves focus there is read by the move itself.
import { useEffect, useId, useRef } from "react";
import type { ReactElement, RefObject } from "react";
import type { ActionButton, ActionsCard } from "../model/actions";
import type { ActionId } from "../model/session";
import { Icon } from "./icons";

const buttonLooks: Record<ActionButton["look"], string> = {
  primary: "btn btn-block btn-primary",
  plain: "btn btn-block",
  quiet: "btn btn-quiet rs-clear",
  inline: "btn btn-small rs-inline",
};

export function Actions(props: {
  readonly card: ActionsCard;
  readonly onAct: (id: ActionId) => void;
  readonly detailsButtonRef: RefObject<HTMLButtonElement | null>;
  readonly keptRef: RefObject<HTMLParagraphElement | null>;
}): ReactElement {
  const { card, onAct, detailsButtonRef, keptRef } = props;
  const titleId = useId();
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const focused = document.activeElement;
    if (card.alert !== null && focused instanceof HTMLElement && section.current?.contains(focused)) focused.scrollIntoView({ block: "nearest" });
  }, [card.alert]);
  const draw = (button: ActionButton): ReactElement => (
    <button
      key={button.id}
      ref={button.id === "details" ? detailsButtonRef : undefined}
      type="button"
      className={buttonLooks[button.look]}
      aria-busy={button.busy || undefined}
      aria-disabled={button.waiting || undefined}
      onClick={() => onAct(button.id)}
    >
      <Icon name={button.icon} />
      {button.label}
    </button>
  );
  return (
    <section ref={section} className="card rs-card rs-actions" aria-labelledby={titleId}>
      <h2 id={titleId} className="section-t rs-h2" data-say="">{card.title}</h2>
      {card.kept === null ? null : (
        <p ref={keptRef} tabIndex={-1} className={`rs-st rs-st-${card.kept.tone}`} data-say="">
          <Icon name={card.kept.icon} />
          <span>{card.kept.text}</span>
          {card.kept.button === null ? null : draw(card.kept.button)}
        </p>
      )}
      <div className={card.alert === null ? "rs-alert" : "rs-alert note note-warn"} role="alert">
        {card.alert === null ? null : (
          <>
            <Icon name="alert" />
            <span data-say="">{card.alert}</span>
          </>
        )}
      </div>
      <div className="rs-act-btns">{card.buttons.map(draw)}</div>
    </section>
  );
}
