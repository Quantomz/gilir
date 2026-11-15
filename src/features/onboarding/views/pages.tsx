"use client";
// Pages 1 to 3: one question and one primary button each. Page 4 is views/rotation.tsx.
// Next is never a disabled button, because a disabled control cannot be focused or say why. Pressed before the page
// is answered, it says what is missing in the dock and focuses the control that needs it.
import { Children } from "react";
import type { ReactElement, ReactNode } from "react";
import { waterAnswerSchema } from "@/contracts";
import type { CropPurposeId, WaterAnswer } from "@/contracts";
import { FieldPicker } from "@/features/location";
import type { Controller } from "../controller";
import { stepComplete } from "../model/check";
import type { PageIssue } from "../model/check";
import { domIdOf, matchCrops, readyCatalogue } from "../model/flow";
import type { CatalogueEntry } from "../model/flow";
import { policy } from "../model/policy";
import { crops, farm, issueWords, listWords, next, sheets, titles, water, waterLabels } from "../model/words";
import { StepFrame } from "./frame";
import { Icon } from "./icons";
import type { IconName } from "./icons";
import { CropFinder, IssueText } from "./parts";

/** The F2 slot with exactly its two props. The slot never emits null, so a marked field is replaced, never cleared. */
function FieldSlot(props: { readonly c: Controller }): ReactElement {
  const { c } = props;
  return <FieldPicker value={c.flow.editor.draft.field ?? null} onChange={field => c.edit({ kind: "field", field })} />;
}

/** Page 1, "Where is your farm?". Search, the globe and the field box are F2's, inside the slot. */
export function FieldPage(props: { readonly c: Controller }): ReactElement {
  const { c } = props;
  return (
    <StepFrame
      step={1}
      title={titles.farm}
      onBack={null}
      width="wide"
      dock={<NextDock c={c} step={1} needs={farm.needField} />}
    >
      <IssueList c={c} page={1} />
      <section id={domIdOf({ kind: "pageControl", page: 1 })} tabIndex={-1} aria-labelledby={domIdOf({ kind: "title" })}>
        <FieldSlot c={c} />
      </section>
    </StepFrame>
  );
}

/**
 * Page 2, "Which crops do you want to grow?". Each card is a real checkbox under a text card: no pictures, because
 * the list holds only a name and a purpose. A long list gets "Find a crop", which never hides a crop already picked.
 * A picked crop the list no longer has stays picked, with its own Remove, until the farmer removes it.
 */
export function CropsPage(props: { readonly c: Controller }): ReactElement {
  const { c } = props;
  const state = c.flow.catalogue;
  const entries = readyCatalogue(state)?.entries ?? [];
  const listed = new Set<string>(entries.map(entry => entry.id));
  const picked = c.flow.editor.draft.cropPurposeIds ?? [];
  const unlisted = state.status === "ready" ? picked.filter(id => !listed.has(id)) : [];
  const offered = state.status === "ready" && entries.length > 0;
  const hidesUnlisted = (issue: PageIssue) => issue.kind === "crop_not_listed" && issue.cropId !== null && unlisted.includes(issue.cropId);
  return (
    <StepFrame
      step={2}
      title={titles.crops}
      lead={crops.lead}
      onBack={c.back}
      width="wide"
      dock={offered ? <CropsDock c={c} picked={picked.filter(id => listed.has(id))} /> : null}
    >
      <IssueList c={c} page={2} omit={hidesUnlisted}>
        {unlisted.map(id => (
          <div className="note note-warn cat-state" key={id}>
            <Icon name="alert" />
            <div className="stack-xs">
              <p>{crops.notListed(c.names.crop(id))}</p>
              <button className="btn btn-small justify-self-start" type="button" onClick={() => c.edit({ kind: "removeCrop", id })}>
                {crops.removeNotListed(c.names.crop(id))}
              </button>
            </div>
          </div>
        ))}
      </IssueList>
      {state.status === "failed" ? (
        <div className="note note-warn cat-state" role="alert">
          <Icon name="alert" />
          <div className="stack-s">
            <p className="banner-t">{crops.failedTitle}</p>
            <p>{crops.failedBody}</p>
            <button className="btn btn-primary justify-self-start" type="button" onClick={c.retryCatalogue}>
              <Icon name="refresh" />
              {crops.tryAgain}
            </button>
          </div>
        </div>
      ) : state.status === "ready" && entries.length === 0 ? (
        <div className="note cat-state">
          <Icon name="info" />
          <div className="stack-xs">
            <p className="banner-t">{crops.emptyTitle}</p>
            <p>{crops.emptyBody}</p>
          </div>
        </div>
      ) : state.status === "ready" ? (
        <CropList c={c} entries={entries} picked={picked} />
      ) : (
        <div className="stack-s" role="status">
          <p className="row muted">
            <span className="spinner" aria-hidden="true" />
            {crops.loading}
          </p>
          <ul className="crop-grid" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map(n => <li className="skel crop-skel" key={n} />)}
          </ul>
        </div>
      )}
    </StepFrame>
  );
}

function CropList(props: { readonly c: Controller; readonly entries: readonly CatalogueEntry[]; readonly picked: readonly CropPurposeId[] }): ReactElement {
  const { c, entries, picked } = props;
  const text = c.flow.cropFilter;
  const matched = new Set<string>(matchCrops(entries, text).map(entry => entry.id));
  const shown = entries.filter(entry => matched.has(entry.id) || picked.includes(entry.id));
  const findable = entries.length >= policy.crops.findFrom;
  return (
    <>
      {findable ? (
        <CropFinder id="crop-find" text={text} onChange={c.filterCrops} matched={matched.size} shown={shown.length} total={entries.length} withHint />
      ) : null}
      <ul className="crop-grid" role="list" id={domIdOf({ kind: "pageControl", page: 2 })} tabIndex={-1} aria-label={sheets.allCrops}>
        {shown.map(entry => (
          <CropCard key={entry.id} entry={entry} on={picked.includes(entry.id)} onToggle={() => c.edit({ kind: "toggleCrop", id: entry.id })} />
        ))}
      </ul>
    </>
  );
}

function CropCard(props: { readonly entry: CatalogueEntry; readonly on: boolean; readonly onToggle: () => void }): ReactElement {
  const { entry } = props;
  const id = domIdOf({ kind: "crop", id: entry.id });
  return (
    <li className="crop">
      <input type="checkbox" id={id} checked={props.on} onChange={props.onToggle} aria-labelledby={`${id}-n`} aria-describedby={`${id}-d`} />
      <label className="crop-box" htmlFor={id}>
        <span className="crop-badge" aria-hidden="true"><Icon name="check" /></span>
        <span className="crop-mark"><Icon name="sprout" /></span>
        <span className="crop-name" id={`${id}-n`}>{entry.label}</span>
        <span className={entry.purpose === "cover" ? "crop-purpose crop-cover" : "crop-purpose"} id={`${id}-d`}>{crops.purpose[entry.purpose]}</span>
        <span className="crop-picked" aria-hidden="true">
          <Icon name="check" />
          {crops.picked}
        </span>
      </label>
    </li>
  );
}

function CropsDock(props: { readonly c: Controller; readonly picked: readonly CropPurposeId[] }): ReactElement {
  const { c, picked } = props;
  return (
    <NextDock c={c} step={2} needs={crops.needOne}>
      <p className={picked.length > 0 ? "pick-count pick-line" : "pick-count"} aria-live="polite">
        <b className="num">{crops.count(picked.length)}</b>
        {picked.length > 0 ? (
          <>: {listWords(picked.map(id => c.names.crop(id).toLocaleLowerCase()))}.</>
        ) : (
          <>
            . <span className="muted">{crops.tapToPick}</span>
          </>
        )}
      </p>
    </NextDock>
  );
}

const waterIcons: Readonly<Record<WaterAnswer, IconName>> = { rain_only: "rain", rain_plus_backup: "can", unsure: "help" };

/** Page 3, "Where does your water come from?". Three radio cards. Choosing one writes only the water answer. */
export function WaterPage(props: { readonly c: Controller }): ReactElement {
  const { c } = props;
  const chosen = c.flow.editor.draft.water;
  return (
    <StepFrame step={3} title={titles.water} lead={water.lead} onBack={c.back} dock={<NextDock c={c} step={3} needs={water.needOne} />}>
      <IssueList c={c} page={3} />
      <fieldset className="choices" id={domIdOf({ kind: "pageControl", page: 3 })} tabIndex={-1}>
        <legend className="sr">{titles.water}</legend>
        {waterAnswerSchema.options.map(answer => (
          <label className="choice" key={answer}>
            <input
              type="radio"
              name="water"
              value={answer}
              checked={chosen === answer}
              onChange={() => c.edit({ kind: "water", water: answer })}
              aria-labelledby={`water-${answer}-t`}
              aria-describedby={`water-${answer}-d`}
            />
            <span className="choice-box" data-say="">
              <span className={answer === "rain_only" ? "choice-ic choice-ic-water" : "choice-ic"}>
                <Icon name={waterIcons[answer]} />
              </span>
              <span className="choice-tx">
                <span className="choice-t" id={`water-${answer}-t`}>{waterLabels[answer].label}</span>
                <span className="choice-d" id={`water-${answer}-d`}>{waterLabels[answer].detail}</span>
              </span>
              <span className="tick"><Icon name="check" /></span>
            </span>
          </label>
        ))}
      </fieldset>
    </StepFrame>
  );
}

/** The dock of pages 1 to 3: the page's own words, what is missing once Next was pressed too early, then Next. */
function NextDock(props: { readonly c: Controller; readonly step: 1 | 2 | 3; readonly needs: string; readonly children?: ReactNode }): ReactElement {
  const { c, step } = props;
  const mode = c.flow.mode;
  const missing = mode.kind === "editing" && mode.asked && !stepComplete(c.flow.editor.draft, step, readyCatalogue(c.flow.catalogue));
  return (
    <>
      {props.children}
      {missing ? <IssueText role="alert">{props.needs}</IssueText> : null}
      <button className="btn btn-primary btn-block" type="button" onClick={c.next}>
        {next[step]}
        <Icon name="arrow" />
      </button>
    </>
  );
}

/**
 * A page's issues beside its control, once Make my plan found them or the planner sent them back. `children` are
 * notes that stand in for omitted issues; they share the box "Fix on page N" focuses.
 */
function IssueList(props: {
  readonly c: Controller;
  readonly page: 1 | 2 | 3;
  readonly omit?: (issue: PageIssue) => boolean;
  readonly children?: ReactNode;
}): ReactElement | null {
  const { c, page, omit } = props;
  const issues = c.issues(page).filter(issue => !omit?.(issue));
  const notes = Children.toArray(props.children);
  if (issues.length === 0 && notes.length === 0) return null;
  return (
    <div className="issues" id={domIdOf({ kind: "pageIssues", page })} tabIndex={-1}>
      {issues.map(issue => <IssueText key={`${issue.kind} ${issue.path.join(".")}`}>{issueWords(issue, c.names)}</IssueText>)}
      {notes}
    </div>
  );
}
