"use client";
import type { ReactElement } from "react";
import type { ServiceFailure } from "@/contracts";
import type { Controller } from "../controller";
import { formatInstant } from "../model/dates";
import type { Progress, TrackedJob } from "../model/flow";
import { failureWords, makePlan, making, titles } from "../model/words";
import { PlainFrame, Title } from "./frame";
import { Icon, Mark } from "./icons";

const order: readonly Progress[] = ["queued", "fetching", "calculating"];
const ringShare: Readonly<Record<Progress, number>> = { queued: 0.14, fetching: 0.46, calculating: 0.78 };
const ringRadius = 46;
const ringLength = 2 * Math.PI * ringRadius;

/**
 * "Making your plan". The status line says only which step it is on; the visible list is not a live region.
 * Back leaves the request running, and page 4 then offers to come back here.
 */
export function Making(props: { readonly c: Controller; readonly job: TrackedJob }): ReactElement {
  const { c, job } = props;
  const now = order.indexOf(job.progress);
  const place = c.flow.editor.draft.field?.label ?? null;
  return (
    <PlainFrame onBack={c.back}>
      <div className="mk" aria-hidden="true">
        <svg className="mk-ring" viewBox="0 0 100 100">
          <circle className="mk-track" cx="50" cy="50" r={ringRadius} />
          <circle className="mk-bar" cx="50" cy="50" r={ringRadius} strokeDasharray={ringLength} strokeDashoffset={ringLength * (1 - ringShare[job.progress])} />
        </svg>
        <span className="mk-mark"><Mark /></span>
      </div>
      <div className="stack-xs text-center">
        <Title>{titles.making}</Title>
        <p className="muted" data-say="">{making.lead(place)}</p>
      </div>
      {job.reachable ? null : (
        <p className="note note-warn">
          <Icon name="alert" />
          <span>{making.reaching}</span>
        </p>
      )}
      <div className="card track">
        <ol className="tasks" role="list" aria-label={making.stepsLabel}>
          {order.map((progress, i) => {
            const state = i < now ? "done" : i === now ? "now" : "wait";
            return (
              <li className="task" data-state={state} key={progress}>
                <span className="task-ic" aria-hidden="true">
                  {state === "done" ? <Icon name="check" /> : state === "now" ? <span className="spinner" /> : i + 1}
                </span>
                <span className="task-tx">
                  <span className="task-t">{making.steps[progress]}</span>
                  <span className="task-s">{making.status[state]}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <button className="btn btn-quiet justify-self-center" type="button" onClick={c.cancel}>{making.cancel}</button>
    </PlainFrame>
  );
}

/** A request that ended without a plan. It never shows a plan and never calls onCompleted. */
export function Failed(props: { readonly c: Controller; readonly failure: ServiceFailure; readonly sending: boolean }): ReactElement {
  const { c, failure, sending } = props;
  const again = failure.code === "not_found" ? making.makeAgain : failure.retryable ? making.tryAgain : null;
  const earlier = c.flow.earlierPlan;
  return (
    <PlainFrame onBack={c.back}>
      <span className="sys-ic warn"><Icon name="alert" /></span>
      <Title>{failureWords[failure.code].title}</Title>
      <p className="lead" data-say="">{failureWords[failure.code].body}</p>
      <p className="t-s muted">{making.noPlan}</p>
      <div className="stack-s">
        {again ? (
          <button className="btn btn-primary btn-block" type="button" aria-busy={sending} onClick={c.makePlan}>
            {sending ? <span className="spinner" aria-hidden="true" /> : <Icon name="refresh" />}
            {sending ? makePlan.sending : again}
          </button>
        ) : null}
        <button className={again ? "btn btn-block" : "btn btn-primary btn-block"} type="button" onClick={c.changeAnswers}>
          <Icon name="edit" />
          {making.changeAnswers}
        </button>
        {earlier ? (
          <button className="btn btn-quiet" type="button" onClick={c.openEarlierPlan}>
            {making.earlierPlan(formatInstant(earlier.completedAt))}
          </button>
        ) : null}
      </div>
    </PlainFrame>
  );
}
