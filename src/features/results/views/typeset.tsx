"use client";
import { useId } from "react";
import type { ReactElement, RefObject } from "react";
import type { Bar, Block, DetailsPage, Head, Item, ItemsBlock, NoteBlock, RanksBlock, Section, TableBlock, TextBlock, YearBlock } from "../model/blocks";
import { Icon } from "./icons";

/** The h1 is the "title" focus anchor: tabIndex -1, so a script can focus it but Tab passes it by. */
export function HeadView(props: { readonly head: Head; readonly titleRef: RefObject<HTMLHeadingElement | null> }): ReactElement {
  const { head } = props;
  return (
    <div className="rs-head">
      <p className="rs-eyebrow" data-say="">{head.eyebrow}</p>
      <h1 ref={props.titleRef} className="screen-title rs-title" tabIndex={-1} data-say="">{head.title}</h1>
      <p className={`rs-status rs-tone-${head.status.tone}`} data-say="">
        <Icon name={head.status.icon} />
        <span>
          <b>{head.status.label}</b> {head.status.text}
        </span>
      </p>
      <p className="rs-for" data-say="">
        {head.facts.map((fact, index) => <span key={index}>{fact}</span>)}
      </p>
      {head.synthetic === null ? null : <Synthetic text={head.synthetic} big={false} />}
    </div>
  );
}

export function SectionView(props: { readonly section: Section }): ReactElement {
  const { section } = props;
  const titleId = useId();
  return (
    <section className={section.look === "flagged" ? "card rs-card rs-flagged" : "card rs-card"} aria-labelledby={titleId}>
      <h2 id={titleId} className="section-t rs-h2" data-say="">{section.title}</h2>
      {section.blocks.map((block, index) => <BlockView key={index} block={block} />)}
    </section>
  );
}

/** Back to the result sits above and below, because the details screen is long. */
export function DetailsView(props: {
  readonly page: DetailsPage;
  readonly titleRef: RefObject<HTMLHeadingElement | null>;
  readonly onBack: () => void;
}): ReactElement {
  const { page, onBack } = props;
  const back = (
    <div className="rs-back">
      <button type="button" className="btn btn-sub" onClick={onBack}>
        <Icon name="back" />
        {page.back}
      </button>
    </div>
  );
  return (
    <div className="rs-details stack">
      {back}
      <div className="rs-head">
        <p className="rs-eyebrow" data-say="">{page.eyebrow}</p>
        <h1 ref={props.titleRef} className="screen-title rs-title" tabIndex={-1} data-say="">{page.title}</h1>
        <p className="lead rs-intro" data-say="">{page.lead}</p>
        {page.synthetic === null ? null : <Synthetic text={page.synthetic} big />}
      </div>
      {page.sections.map(section => <SectionView key={section.id} section={section} />)}
      {back}
    </div>
  );
}

function Synthetic(props: { readonly text: string; readonly big: boolean }): ReactElement {
  return (
    <p className={props.big ? "rs-synthetic rs-synthetic-big" : "rs-synthetic"} data-say="">
      <Icon name="info" />
      <b>{props.text}</b>
    </p>
  );
}

const textLooks: Record<TextBlock["look"], string | undefined> = { body: undefined, muted: "muted", big: "rs-big" };

function BlockView(props: { readonly block: Block }): ReactElement {
  const { block } = props;
  switch (block.kind) {
    case "text":
      return <p className={textLooks[block.look]} data-say="">{block.text}</p>;
    case "note":
      return <NoteView block={block} />;
    case "subhead":
      return <h3 className="rs-h3" data-say="">{block.text}</h3>;
    case "items":
      return <ItemsView block={block} />;
    case "steps":
      return (
        <ol className="rs-prep" role="list">
          {block.steps.map((step, index) => (
            <li key={index} data-say="">
              <span className="rs-prep-n" aria-hidden="true">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      );
    case "ranks":
      return <RanksView block={block} />;
    case "versus":
      return (
        <div className="rs-vs" data-say="">
          {block.sides.map((side, index) => (
            <p key={index} className={side.tone === "warn" ? "rs-vs-side rs-vs-warn" : "rs-vs-side"}>
              <span className="rs-vs-n">{side.value}</span>
              <span>{side.caption}</span>
            </p>
          ))}
        </div>
      );
    case "year":
      return <YearView block={block} />;
    case "facts":
      return (
        <dl className="rs-kv">
          {block.facts.map((fact, index) => (
            <div key={index} data-say="">
              <dt>{fact.name}</dt>
              <dd className={fact.code ? "rs-mono" : undefined}>{fact.value}</dd>
            </div>
          ))}
        </dl>
      );
    case "table":
      return <TableView block={block} />;
    default:
      return absurd(block);
  }
}

/** A note without a bold start is bold all through: the fixed-order box and the verdicts read as one statement. */
function NoteView(props: { readonly block: NoteBlock }): ReactElement {
  const { block } = props;
  return (
    <p className={`note rs-note rs-note-${block.tone}${block.strong === null ? " rs-note-bold" : ""}`} data-say="">
      <Icon name={block.icon} />
      <span>
        {block.strong === null ? null : <><b>{block.strong}</b> </>}
        {block.text}
      </span>
    </p>
  );
}

function ItemsView(props: { readonly block: ItemsBlock }): ReactElement {
  const { block } = props;
  return (
    <ul className={block.look === "flag" ? "rs-list rs-list-flag" : "rs-list"} role="list">
      {block.items.map((item, index) => (
        <li key={index} className="rs-li" data-say="">
          {item.icon === null ? <span className="rs-li-dot" aria-hidden="true" /> : <span className="rs-li-ic"><Icon name={item.icon} /></span>}
          <span className="rs-li-tx">
            <ItemHead item={item} />
            {item.lines.map((line, lineIndex) => <span key={lineIndex}>{line}</span>)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A link opens in a new tab so the unsaved result stays. The model gives an href only for http and https. */
function ItemHead(props: { readonly item: Item }): ReactElement {
  const { head, href } = props.item;
  if (href === null) return <b>{head}</b>;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {head}
    </a>
  );
}

function RanksView(props: { readonly block: RanksBlock }): ReactElement {
  const { block } = props;
  const List = block.numbered ? "ol" : "ul";
  return (
    <List className={block.numbered ? "rs-rank" : "rs-rank rs-rank-extra"} role="list">
      {block.ranks.map((rank, index) => {
        const marker = block.numbered ? index + 1 : rank.icon === null ? null : <Icon name={rank.icon} />;
        return (
          <li key={index} className={marker === null ? "rs-ri rs-ri-plain" : "rs-ri"} data-say="">
            {marker === null ? null : <span className="rs-ri-n" aria-hidden="true">{marker}</span>}
            <span className="rs-ri-tx">
              <span className="rs-ri-q">{rank.question}</span>
              <span className="rs-ri-v">{rank.value}</span>
              {rank.explain === "" ? null : <span className="rs-ri-d">{rank.explain}</span>}
            </span>
          </li>
        );
      })}
    </List>
  );
}

/**
 * The explicit roles keep the table a table for screen readers after results.css turns its rows into blocks. Each
 * body row is one [data-say] and each cell names its column, because Listen reads only [data-say] text.
 */
function TableView(props: { readonly block: TableBlock }): ReactElement {
  const { caption, columns, rows } = props.block;
  return (
    <div className="rs-tbl-wrap">
      <table className="rs-table" role="table">
        <caption data-say="">{caption}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((column, index) => <th key={index} scope="col" role="columnheader">{column}</th>)}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} role="row" data-say="">
              {row.map((cell, index) =>
                index === 0
                  ? <th key={index} scope="row" role="rowheader">{cell}</th>
                  : <td key={index} role="cell"><span className="rs-cell-l">{columns[index]}: </span>{cell}</td>,
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A month shorter than this share of the year (about 16 days) is too narrow for its label. */
const tickRoom = 0.045;

/** The picture is aria-hidden and inert; `rows` say the same in words, so a screen reader and Listen lose nothing. */
function YearView(props: { readonly block: YearBlock }): ReactElement {
  const { caption, ticks, bars, legend, rows } = props.block;
  return (
    <div className="rs-year">
      {caption === null ? null : <p className="rs-track-l" data-say="">{caption}</p>}
      <div className="rs-track" aria-hidden="true">
        <div className="rs-axis">
          {ticks.map((tick, index) => {
            const end = ticks[index + 1]?.at ?? 1;
            return (
              <span key={index} className="rs-tick" style={{ left: percent(tick.at), width: percent(end - tick.at) }}>
                {end - tick.at < tickRoom ? null : (
                  <>
                    <span className="rs-tick-n">{tick.narrow}</span>
                    <span className="rs-tick-l">{tick.label}</span>
                  </>
                )}
              </span>
            );
          })}
        </div>
        <div className="rs-lane">
          {ticks.map((tick, index) => <i key={index} className="rs-gl" style={{ left: percent(tick.at) }} />)}
          {bars.map((bar, index) => (
            <span key={index} className={`rs-bar rs-look-${bar.look}`} style={{ left: percent(bar.from), width: percent(bar.to - bar.from) }} />
          ))}
          {bars.map((bar, index) => (bar.mark === null ? null : (
            <span key={`mark-${index}`} className="rs-mark" style={{ left: markLeft(bar) }}>{bar.mark}</span>
          )))}
        </div>
        {legend.length === 0 ? null : (
          <p className="rs-legend">
            {legend.map(entry => (
              <span key={entry.look}>
                <i className={`rs-key rs-look-${entry.look}`} />
                {entry.label}
              </span>
            ))}
          </p>
        )}
      </div>
      {rows.length === 0 ? null : (
        <ol className="rs-steps" role="list">
          {rows.map((row, index) => (
            <li key={index} className={row.mark === null ? "rs-step rs-step-gap" : "rs-step"} data-say="">
              <span className="rs-step-n">{row.mark ?? <Icon name="calendar" />}</span>
              <span className="rs-step-tx">
                <b className="rs-step-t">{row.head}</b>
                {row.lines.map((line, lineIndex) => <span key={lineIndex} className="rs-step-d">{line}</span>)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function percent(share: number): string {
  return `${(share * 100).toFixed(3)}%`;
}

/** The disc's left edge: centred on its bar, and clamped so a bar at the year's edge keeps its whole disc. */
function markLeft(bar: Bar): string {
  return `clamp(0px, ${percent((bar.from + bar.to) / 2)} - var(--rs-mark) / 2, 100% - var(--rs-mark))`;
}

function absurd(value: never): never {
  throw new Error(`Unknown block: ${JSON.stringify(value)}`);
}
