// Validation at submission, and where each issue shows. Pure.
//
// farmInputSchema is the only validator; F1 never re-declares its rules. Two facts shape this module:
//  1. zod runs the cross checks only when every structural check passed. So presence is checked per page first, and
//     the full parse runs only on a complete draft, where it reports every cross-field issue at once. "Fix these
//     first" never grows after the farmer fixes it.
//  2. Issue paths, not issue messages, decide the page and the words. The two history.entries.i messages are told
//     apart by the entry's own geometry, never by matching the contract's English.
import { farmInputSchema, inputLimits } from "@/contracts";
import type { Catalogue, CropPurposeId, FarmInput, InputIssue } from "@/contracts";
import { windowOf } from "./draft";
import type { Draft } from "./draft";
import type { Step } from "./flow";
import { placementOf, spanOf } from "./timeline";

export type IssueKind =
  | "field_missing"     // page 1, no field yet
  | "field_shape"       // page 1, ring or lookup (client: not closed, lookup outside; server: self-intersection)
  | "crops_missing"     // page 2, nothing picked
  | "crops_duplicate"   // page 2, ["cropPurposeIds"] "Select each crop only once."
  | "crop_not_listed"   // page 2, ["cropPurposeIds", i]: not on the loaded list (client) or the current catalogue (server)
  | "water_missing"     // page 3
  | "date_missing"      // page 4
  | "history_missing"   // page 4, no bars, no "empty all year", no "I don't remember"
  | "history_window"    // page 4, ["history"]: the window does not end at the field-ready date
  | "entry_outside"     // page 4, ["history","entries",i]: outside the 12 months, or ends before it starts
  | "entry_overlap"     // page 4, ["history","entries",i]: overlaps the entry before it
  | "entry_id"          // page 4, ["history","entries",i,"id"]
  | "entry_name"        // page 4, ["history","entries",i,"crop","label"]: a blank unsupported name
  | "too_large"         // no page: the request is over inputLimits.payloadBytes
  | "unreadable"        // no page: path [] (bad body or unknown key) or schemaVersion
  | "other";            // a path the table does not know: the page's own sentence, never a developer message

export type IssuePath = readonly (string | number)[];

export interface PageIssue {
  readonly kind: IssueKind;
  /** The page that shows it beside its control. Null: only in the "Fix these first" summary. */
  readonly page: Step | null;
  readonly path: IssuePath;
  /** history.entries.i resolved to the entry's id at check time, so the issue follows the bar if order changes. */
  readonly entryId: string | null;
  /** cropPurposeIds.i resolved to the id. */
  readonly cropId: CropPurposeId | null;
}

/** A server issue stays until the farmer changes the part of the draft it was about. */
export interface PinnedIssue extends PageIssue {
  readonly pinnedTo: string;
}

export type Check =
  | { readonly kind: "ready"; readonly input: FarmInput }
  | { readonly kind: "blocked"; readonly issues: readonly PageIssue[] };

/**
 * The submission check.
 *  1. Presence per page, plus the client-only checks that need no parse: picked crops missing from the loaded list
 *     (never removed for the farmer; skipped while the list is not loaded, because the server checks it anyway) and
 *     bars outside their window.
 *  2. farmInputSchema.safeParse(assemble(draft)), every issue classified.
 *  3. The request's UTF-8 size against inputLimits.payloadBytes, which saves a 413 round trip.
 * On success `input` is parsed.data: frozen, with labels trimmed.
 */
export function checkDraft(draft: Draft, catalogue: Catalogue | null): Check {
  const presence = presenceIssues(draft);
  const known = [...membershipIssues(draft, catalogue), ...liveIssues(draft)];
  if (presence.length > 0) return blocked([...presence, ...known]);

  const parsed = farmInputSchema.safeParse(assemble(draft));
  if (!parsed.success) {
    return blocked([...known, ...parsed.error.issues.map(issue => classify({ path: issuePath(issue.path), message: issue.message }, draft))]);
  }
  if (known.length > 0) return blocked(known);
  if (new TextEncoder().encode(JSON.stringify(parsed.data)).length > inputLimits.payloadBytes) {
    return blocked([{ kind: "too_large", page: null, path: [], entryId: null, cropId: null }]);
  }
  return { kind: "ready", input: parsed.data };
}

/**
 * Pages 1 to 3: may the farmer continue? Next is never a disabled button: when this is false, Next shows the page's
 * own "needs" words and moves focus to the missing control.
 *  1: a field is marked. 2: the list is ready and non-empty and at least one picked crop is on it. 3: one water answer.
 */
export function stepComplete(draft: Draft, step: 1 | 2 | 3, catalogue: Catalogue | null): boolean {
  if (step === 1) return draft.field !== undefined;
  if (step === 3) return draft.water !== undefined;
  const listed = new Set(catalogue?.entries.map(entry => entry.id) ?? []);
  return (draft.cropPurposeIds ?? []).some(id => listed.has(id));
}

/** The value farmInputSchema parses: schemaVersion 1 plus the draft's answers, entries in draft order. No defaults invented. */
export function assemble(draft: Draft): unknown {
  const { field, cropPurposeIds, water, planningStart, history } = draft;
  return { schemaVersion: 1, field, cropPurposeIds, water, planningStart, history };
}

/** Turn a contract or server issue into a PageIssue for this draft. Client and server issues share this one table. */
export function classify(issue: InputIssue, draft: Draft): PageIssue {
  const path = issue.path;
  const page = pageOf(path);
  const make = (kind: IssueKind, ids: { entryId?: string | null; cropId?: CropPurposeId | null } = {}): PageIssue =>
    ({ kind, page: kind === "unreadable" ? null : page, path, entryId: ids.entryId ?? null, cropId: ids.cropId ?? null });

  switch (path[0]) {
    case "field":
      return make("field_shape");
    case "cropPurposeIds": {
      const ids = draft.cropPurposeIds ?? [];
      if (typeof path[1] === "number") return make("crop_not_listed", { cropId: ids[path[1]] ?? null });
      if (path.length > 1) return make("other");
      if (ids.length === 0) return make("crops_missing");
      return make(new Set(ids).size === ids.length ? "other" : "crops_duplicate");
    }
    case "water":
      return make("water_missing");
    case "planningStart":
      return make("date_missing");
    case "history":
      return classifyHistory(path, draft, make);
    default:
      return make("unreadable");
  }
}

function classifyHistory(
  path: IssuePath,
  draft: Draft,
  make: (kind: IssueKind, ids?: { entryId?: string | null }) => PageIssue,
): PageIssue {
  const history = draft.history;
  if (path.length === 1) return make(history?.kind === "recorded" ? "history_window" : "history_missing");
  const index = path[2];
  if (path[1] !== "entries" || typeof index !== "number" || history?.kind !== "recorded") return make("other");
  const entry = history.entries[index];
  if (entry === undefined) return make("other");
  const ids = { entryId: entry.id };
  if (path.length === 3) {
    const window = windowOf(draft);
    const placed = window === null ? null : placementOf(entry, window);
    return make(placed !== null && (placed.outside || placed.inverted) ? "entry_outside" : "entry_overlap", ids);
  }
  if (path[3] === "id") return make("entry_id", ids);
  if (path[3] === "crop") return make("entry_name", ids);
  return make("other", ids);
}

/** Page of a path: field 1, cropPurposeIds 2, water 3, planningStart and history 4, anything else null. */
export function pageOf(path: IssuePath): Step | null {
  const head = path[0];
  if (head === "field") return 1;
  if (head === "cropPurposeIds") return 2;
  if (head === "water") return 3;
  if (head === "planningStart" || head === "history") return 4;
  return null;
}

export function pin(issue: PageIssue, draft: Draft): PinnedIssue {
  return { ...issue, pinnedTo: pinOf(issue, draft) };
}

export function stillPinned(issue: PinnedIssue, draft: Draft): boolean {
  return pinOf(issue, draft) === issue.pinnedTo;
}

/** Issues a lane shows at once, without waiting for Make my plan: bars outside, inverted or overlapping. */
export function liveEntryIssues(draft: Draft): readonly PageIssue[] {
  return liveIssues(draft);
}

/** Lowest page first (summary-only issues last), then path order, so "Fix these first" and the first focus are stable. */
export function orderIssues(issues: readonly PageIssue[]): readonly PageIssue[] {
  return [...issues].sort((p, q) => (p.page ?? 5) - (q.page ?? 5) || comparePaths(p.path, q.path));
}

/**
 * One list from client and server issues: each kind and path once, ordered. The contract also flags ["history"] when
 * planningStart is wrong, and only the date is the farmer's to fix, so the window issue waits for the date.
 */
export function tidyIssues(issues: readonly PageIssue[]): readonly PageIssue[] {
  const seen = new Set<string>();
  const dateWrong = issues.some(issue => issue.kind === "date_missing");
  return orderIssues(issues.filter(issue => {
    const key = `${issue.kind} ${JSON.stringify(issue.path)}`;
    if (seen.has(key) || (dateWrong && issue.kind === "history_window")) return false;
    seen.add(key);
    return true;
  }));
}

function presenceIssues(draft: Draft): PageIssue[] {
  const issue = (kind: IssueKind, page: Step, path: IssuePath, entryId: string | null = null): PageIssue =>
    ({ kind, page, path, entryId, cropId: null });
  const issues: PageIssue[] = [];
  if (draft.field === undefined) issues.push(issue("field_missing", 1, ["field"]));
  if ((draft.cropPurposeIds ?? []).length === 0) issues.push(issue("crops_missing", 2, ["cropPurposeIds"]));
  if (draft.water === undefined) issues.push(issue("water_missing", 3, ["water"]));
  if (draft.planningStart === undefined) issues.push(issue("date_missing", 4, ["planningStart"]));
  if (draft.history === undefined) issues.push(issue("history_missing", 4, ["history"]));
  if (draft.history?.kind === "recorded") {
    draft.history.entries.forEach((entry, i) => {
      if (entry.kind === "crop" && entry.crop.kind === "unsupported" && entry.crop.label.trim() === "") {
        issues.push(issue("entry_name", 4, ["history", "entries", i, "crop", "label"], entry.id));
      }
    });
  }
  return issues;
}

function membershipIssues(draft: Draft, catalogue: Catalogue | null): PageIssue[] {
  if (catalogue === null) return [];
  const listed = new Set(catalogue.entries.map(entry => entry.id));
  return (draft.cropPurposeIds ?? []).flatMap((id, i) =>
    listed.has(id) ? [] : [{ kind: "crop_not_listed", page: 2, path: ["cropPurposeIds", i], entryId: null, cropId: id } as const]);
}

/**
 * Entries are kept in start order (draft invariant I2), the order farmInputSchema compares them in, and like the schema
 * an overlap is judged against the entry just before. With half-open spans its rule is one test: a.start < before.end.
 */
function liveIssues(draft: Draft): PageIssue[] {
  const window = windowOf(draft);
  if (window === null || draft.history?.kind !== "recorded") return [];
  const entries = draft.history.entries;
  return entries.flatMap((entry, i) => {
    const placed = placementOf(entry, window);
    const before = entries[i - 1];
    const kind: IssueKind | null = placed.outside || placed.inverted ? "entry_outside"
      : before !== undefined && spanOf(entry, window).a < spanOf(before, window).b ? "entry_overlap"
      : null;
    return kind === null ? [] : [{ kind, page: 4, path: ["history", "entries", i], entryId: entry.id, cropId: null } as const];
  });
}

function blocked(issues: readonly PageIssue[]): Check {
  return { kind: "blocked", issues: tidyIssues(issues) };
}

function pinOf(issue: PageIssue, draft: Draft): string {
  const head = issue.path[0];
  if (issue.page === null) return JSON.stringify(assemble(draft));
  const part = head === "field" ? draft.field
    : head === "cropPurposeIds" ? draft.cropPurposeIds
    : head === "water" ? draft.water
    : head === "planningStart" ? draft.planningStart
    : draft.history;
  return JSON.stringify(part ?? null);
}

function issuePath(path: readonly PropertyKey[]): IssuePath {
  return path.flatMap(part => (typeof part === "symbol" ? [] : [part]));
}

/** Answers in the order their controls appear, so the date comes before last year's bars on page 4. */
const controlOrder = ["field", "cropPurposeIds", "water", "planningStart", "history"];

function comparePaths(p: IssuePath, q: IssuePath): number {
  const rank = (path: IssuePath) => {
    const index = controlOrder.indexOf(String(path[0]));
    return index === -1 ? controlOrder.length : index;
  };
  if (rank(p) !== rank(q)) return rank(p) - rank(q);
  for (let i = 0; i < Math.min(p.length, q.length); i++) {
    const a = p[i];
    const b = q[i];
    if (a === b) continue;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a) < String(b) ? -1 : 1;
  }
  return p.length - q.length;
}
