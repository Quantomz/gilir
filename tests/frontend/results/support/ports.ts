// Fake F4 ports for F3's tests, and helpers over pages. Not a test file. jsdom and node have no IndexedDB, so the real
// localPlans rejects as unavailable there: saved, not saved, earlier plan, cleared and every storage failure are shown
// with these fakes. That is component evidence, named so; results.spec.ts shows the real ports in Chromium.
import type { LocalPlans, LocalState, StorageNotice } from "@/client/storage";
import type { CompletedSnapshot } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import type { Block, DetailsPage, Head, ResultPage, Section } from "@/features/results/model/blocks";

/**
 * How one port method behaves: it works, it never answers, or it rejects. "reject" is a plain Error with developer
 * text, which storageProblem reads as unavailable; "full" and "newer" are the browser errors it reads by name.
 */
export type Play = "work" | "reject" | "full" | "newer" | "hang";

type Call = { readonly kind: "load" } | { readonly kind: "save"; readonly state: LocalState } | { readonly kind: "clear" };

export interface MemoryPlans extends LocalPlans {
  /** Every call in order, with what save was given: the proof of load-before-save and of what was written. */
  readonly calls: readonly Call[];
  /** What a load would return now. */
  held(): LocalState | null;
  /** Change how a method behaves from now on. */
  set(method: "load" | "save" | "clear", play: Play): void;
  /** Hold data set aside as unreadable, as F4 does, until a clear removes it with the state. */
  holdSetAside(): void;
  /** readStorageNotice over this store: a notice while something is set aside, else null. */
  notice(): Promise<StorageNotice | null>;
}

/** F4's notice for a saved plan this version cannot open. */
const setAsideText = "Your saved plan can’t be opened by this version of Gilir. Make the plan again to see it.";

/** Developer text in every fake rejection, so a test can prove a port's own message never reaches the screen. */
export const portMessage = "fake port rejected this call";

function answer<T>(play: Play, work: () => T, port: string): Promise<T> {
  switch (play) {
    case "work":
      return Promise.resolve(work());
    case "reject":
      return Promise.reject(new Error(`${port}: ${portMessage}.`));
    case "full":
      return Promise.reject(new DOMException(`${port}: ${portMessage}.`, "QuotaExceededError"));
    case "newer":
      return Promise.reject(new DOMException(`${port}: ${portMessage}.`, "VersionError"));
    case "hang":
      return new Promise<T>(() => {});
  }
}

/** An in-memory LocalPlans holding `initial`. save replaces the whole state, like the real port. */
export function memoryPlans(initial: LocalState | null): MemoryPlans {
  let held = initial;
  let setAside = false;
  const calls: Call[] = [];
  const plays: Record<"load" | "save" | "clear", Play> = { load: "work", save: "work", clear: "work" };
  return {
    calls,
    held: () => held,
    set: (method, play) => {
      plays[method] = play;
    },
    holdSetAside: () => {
      setAside = true;
    },
    notice: () => Promise.resolve(setAside ? { text: setAsideText, dismiss: () => Promise.resolve() } : null),
    load: () => {
      calls.push({ kind: "load" });
      return answer(plays.load, () => held, "Local storage");
    },
    save: state => {
      calls.push({ kind: "save", state });
      return answer(plays.save, () => {
        held = state;
      }, "Local storage");
    },
    clear: () => {
      calls.push({ kind: "clear" });
      return answer(plays.clear, () => {
        held = null;
        setAside = false;
      }, "Local storage");
    },
  };
}

/** A LocalState as F1 leaves it after a finished job: a draft, step 4, no job, and `snapshot`. */
export function savedState(snapshot: CompletedSnapshot | null): LocalState {
  return { draft: snapshot?.input ?? inputFixture, step: 4, activeJob: null, snapshot };
}

export interface PdfPort {
  exportPdf(snapshot: CompletedSnapshot): Promise<Blob>;
  readonly calls: readonly CompletedSnapshot[];
  set(play: Play): void;
}

/** A fake exportPdf that resolves a small application/pdf Blob. */
export function pdfPort(): PdfPort {
  const calls: CompletedSnapshot[] = [];
  let play: Play = "work";
  return {
    calls,
    set: next => {
      play = next;
    },
    exportPdf: snapshot => {
      calls.push(snapshot);
      return answer(play, () => new Blob(["%PDF-1.7\n%%EOF\n"], { type: "application/pdf" }), "PDF export");
    },
  };
}

/** All farmer text of a page in reading order, for the word tests. No rendering needed. */
export function textOf(page: ResultPage | DetailsPage): string {
  const parts = "kind" in page
    ? [...headText(page.head), ...[...page.lead, ...page.more].flatMap(sectionText)]
    : [page.back, page.eyebrow, page.title, page.lead, page.synthetic, ...page.sections.flatMap(sectionText)];
  return parts.filter((part): part is string => part !== null && part !== "").join("\n");
}

function headText(head: Head): readonly (string | null)[] {
  return [head.eyebrow, head.title, head.status.label, head.status.text, ...head.facts, head.synthetic];
}

function sectionText(section: Section): readonly (string | null)[] {
  return [section.title, ...section.blocks.flatMap(blockText)];
}

function blockText(block: Block): readonly (string | null)[] {
  switch (block.kind) {
    case "text":
    case "subhead":
      return [block.text];
    case "note":
      return [block.strong, block.text];
    case "items":
      return block.items.flatMap(item => [item.head, ...item.lines]);
    case "steps":
      return block.steps;
    case "ranks":
      return block.ranks.flatMap(rank => [rank.question, rank.value, rank.explain]);
    case "versus":
      return block.sides.flatMap(side => [side.value, side.caption]);
    case "year":
      return [
        block.caption,
        ...block.ticks.map(tick => tick.label),
        ...block.bars.map(bar => bar.mark),
        ...block.legend.map(entry => entry.label),
        ...block.rows.flatMap(row => [row.mark, row.head, ...row.lines]),
      ];
    case "facts":
      return block.facts.flatMap(fact => [fact.name, fact.value]);
    case "table":
      return [block.caption, ...block.columns, ...block.rows.flat()];
  }
}

/** The ids of a result page's sections, lead then more, for the per-state table tests. */
export function sectionIds(page: ResultPage): { readonly lead: readonly string[]; readonly more: readonly string[] } {
  return { lead: page.lead.map(section => section.id), more: page.more.map(section => section.id) };
}
