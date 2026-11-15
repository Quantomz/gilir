export type IconName =
  | "check" | "alert" | "info" | "calendar" | "grid" | "drop" | "heat" | "swap" | "rain" | "plus" | "minus"
  | "edit" | "download" | "close" | "plan" | "back" | "undo" | "save";

/** A status always has an icon and words. Tone only picks the token colours, so no meaning rests on colour (spec.md section 2). */
export type Tone = "ok" | "warn" | "info" | "neutral";

export interface Head {
  /** "{field label} · Made {local calendar day of completedAt}". */
  readonly eyebrow: string;
  /** The screen's one h1. */
  readonly title: string;
  readonly status: { readonly tone: Tone; readonly icon: IconName; readonly label: string; readonly text: string };
  /** The "for" line: "Your year: …" (a plan) or "Field ready: …" (no plan), the crops, the water answer. */
  readonly facts: readonly string[];
  /** `provenance.label` when the result is synthetic, shown in bold on the result and on details. */
  readonly synthetic: string | null;
}

/** One card with one h2. `look: "flagged"` draws the warn ring of the flags card. */
export interface Section<Id extends string = string> {
  readonly id: Id;
  readonly title: string;
  readonly look: "card" | "flagged";
  readonly blocks: readonly Block[];
}

export type Block =
  | TextBlock | NoteBlock | SubheadBlock | ItemsBlock | StepsBlock | RanksBlock | VersusBlock | YearBlock | FactsBlock | TableBlock;

export interface TextBlock {
  readonly kind: "text";
  readonly look: "body" | "muted" | "big";
  readonly text: string;
}

export interface NoteBlock {
  readonly kind: "note";
  readonly tone: Tone;
  readonly icon: IconName;
  readonly strong: string | null;
  readonly text: string;
}

/** An h3 inside a card. */
export interface SubheadBlock {
  readonly kind: "subhead";
  readonly text: string;
}

export interface Item {
  /** Null draws a plain bullet. */
  readonly icon: IconName | null;
  readonly head: string;
  readonly lines: readonly string[];
  /** A source's address, only ever http or https (details-page.ts). The link text is the head. */
  readonly href: string | null;
}
export interface ItemsBlock {
  readonly kind: "items";
  readonly look: "plain" | "flag";
  readonly items: readonly Item[];
}

export interface StepsBlock {
  readonly kind: "steps";
  readonly steps: readonly string[];
}

/** A question, its value in large type, and one sentence. Numbered for the four ranking indicators. */
export interface RanksBlock {
  readonly kind: "ranks";
  readonly numbered: boolean;
  readonly ranks: readonly { readonly icon: IconName | null; readonly question: string; readonly value: string; readonly explain: string }[];
}

/** Two large numbers side by side: the days the crops need against the days in the year. */
export interface VersusBlock {
  readonly kind: "versus";
  readonly sides: readonly [VersusSide, VersusSide];
}
export interface VersusSide {
  readonly value: string;
  readonly caption: string;
  readonly tone: "warn" | "plain";
}

/**
 * How a bar is drawn. Crops share one token colour and carry their order number, because the snapshot holds no crop
 * colours. after_harvest is hatched, open is dashed, unlisted is striped: pattern and words, never colour alone.
 */
export type BarLook = "crop" | "after_harvest" | "open" | "unlisted" | "empty" | "not_sure";

/** A stretch of a year line. `from` and `to` are shares of the year, 0 to 1, so the view does no date arithmetic. */
export interface Bar {
  readonly look: BarLook;
  readonly from: number;
  readonly to: number;
  /** The crop's number in `rows`, drawn on the bar, so the picture and the words agree without colour. */
  readonly mark: string | null;
}

/** One stretch of a year line in words: what a screen reader and Listen get. */
export interface YearRow {
  /** The same number the bar shows, or null for a stretch without a crop. */
  readonly mark: string | null;
  /** "Maize grain", "No planned crop", "Synthetic unlisted crop (not on our crop list)". */
  readonly head: string;
  /** "Plant 1 Jul 2026 · Harvest 4 Jul 2026", "4 days in the field. The field is free again on 6 Jul 2026." */
  readonly lines: readonly string[];
}

/**
 * One year as a line. The picture (ticks, bars, legend) is drawn aria-hidden and holds nothing that takes focus or a
 * pointer. `rows` says the same in words.
 *  - "plan": the generated plan (timeline section, and "This plan" in a changed comparison).
 *  - "baseline": last year's rotation as the engine assessed it, moved to this year. Only beside a plan.
 *  - "reported": what the farmer told us about last year, never scored. The only line a no-plan page can hold.
 */
export interface YearBlock {
  readonly kind: "year";
  readonly source: "plan" | "baseline" | "reported";
  /** "This plan", "Last year’s rotation, moved to this year"; null when the card's own text introduces the line. */
  readonly caption: string | null;
  readonly ticks: readonly { readonly at: number; readonly label: string; readonly narrow: string }[];
  readonly bars: readonly Bar[];
  readonly legend: readonly { readonly look: BarLook; readonly label: string }[];
  readonly rows: readonly YearRow[];
}

export interface FactsBlock {
  readonly kind: "facts";
  readonly facts: readonly { readonly name: string; readonly value: string; readonly code: boolean }[];
}

/** A real table with a caption. The first column is the row header. Under 40rem it becomes labelled rows. */
export interface TableBlock {
  readonly kind: "table";
  readonly caption: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/** Sections a plan page can hold. The search-limit note is the last block of "ranking". */
export type PlanSectionId = "flagged" | "timeline" | "ranking" | "unchecked" | "compared" | "ready";
/** "notes" is Good to know: a no-plan result's warnings, all context, so never the flags card. */
export type NoPlanSectionId = "missing" | "no_fit" | "stopped" | "failed" | "notes" | "farm" | "unchecked" | "compared";

/**
 * `lead` is what a farmer must read before acting: the warnings and the timeline, or the reason no plan was made. The
 * actions card sits between `lead` and `more` in the document on every width.
 */
export interface PlanPage {
  readonly kind: "plan";
  readonly head: Head;
  readonly lead: readonly Section<PlanSectionId>[];
  readonly more: readonly Section<PlanSectionId>[];
}
export interface NoPlanPage {
  readonly kind: "no_plan";
  readonly head: Head;
  readonly lead: readonly Section<NoPlanSectionId>[];
  readonly more: readonly Section<NoPlanSectionId>[];
}
export type ResultPage = PlanPage | NoPlanPage;

export type DetailsSectionId =
  | "numbers" | "definitions" | "months" | "seasons" | "sources" | "profiles" | "coverage" | "assumptions" | "versions" | "answers";

export interface DetailsPage {
  /** "Back to the result", drawn as a button above and below the page. */
  readonly back: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly lead: string;
  readonly synthetic: string | null;
  readonly sections: readonly Section<DetailsSectionId>[];
}

export function text(look: TextBlock["look"], value: string): Block {
  return { kind: "text", look, text: value };
}

export function note(tone: Tone, icon: IconName, strong: string | null, value: string): Block {
  return { kind: "note", tone, icon, strong, text: value };
}

export function subhead(value: string): Block {
  return { kind: "subhead", text: value };
}

export function items(list: readonly Item[], look: ItemsBlock["look"] = "plain"): Block {
  return { kind: "items", look, items: list };
}

export function item(head: string, lines: readonly string[], icon: IconName | null = null): Item {
  return { icon, head, lines, href: null };
}
