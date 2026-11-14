// Validation at submission, and where each issue shows. Pure.
//
// farmInputSchema is the only validator (src/contracts/input.ts:43-88). F1 never re-declares its rules.
// Two facts shape this module:
//  1. zod runs the superRefine cross checks only when every structural check passed (requirements.md section 3, last
//     rows). So presence is checked per page first. The full parse runs only on a complete draft, and then reports
//     every cross-field issue at once. "Fix these first" never grows after the farmer fixes it.
//  2. Issue paths, not issue messages, decide the page and the words. The two history.entries.i messages are told
//     apart by the entry's own geometry (model/timeline.ts placementOf), never by matching the contract's English.
import { farmInputSchema, inputLimits } from "@/contracts";
import type { Catalogue, CropPurposeId, FarmInput, InputIssue } from "@/contracts";
import type { Draft } from "./draft";
import type { Step } from "./flow";

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

export interface PageIssue {
  readonly kind: IssueKind;
  /** The page that shows it beside its control. Null: only in the "Fix these first" summary. */
  readonly page: Step | null;
  readonly path: readonly (string | number)[];
  /** history.entries.i resolved to the entry's id at check time, so the issue follows the bar if order changes. */
  readonly entryId: string | null;
  /** cropPurposeIds.i resolved to the id. */
  readonly cropId: CropPurposeId | null;
}

/** A server issue stays until the farmer changes the part of the draft it was about (prototype `serverIssuesFor`). */
export interface PinnedIssue extends PageIssue {
  readonly pinnedTo: string;
}

export type Check =
  | { readonly kind: "ready"; readonly input: FarmInput }
  | { readonly kind: "blocked"; readonly issues: readonly PageIssue[] };

/**
 * The submission check.
 *  1. presence per page: field, at least one crop, water, planningStart, history, named unsupported bars.
 *     Missing -> those issues only (plus liveEntryIssues, so bars show their own problem at once).
 *  2. crops on the loaded list: an id the ready catalogue lacks -> crop_not_listed. It is never removed for the farmer
 *     (docs/cards/F1.md:36 "Never drop crops"). Skipped when the catalogue is not loaded: the server checks anyway.
 *  3. farmInputSchema.safeParse(assemble(draft)) -> every issue classified.
 *  4. byte size of JSON.stringify(parsed.data) > inputLimits.payloadBytes -> too_large (saves a 413 round trip).
 * On success `input` is parsed.data: frozen, labels trimmed (src/contracts/input.ts:88, common.ts:5).
 */
export function checkDraft(draft: Draft, catalogue: Catalogue | null): Check {
  throw new Error("not implemented");
  // TODO: uses farmInputSchema and inputLimits (imported above). This is the only file that runs the whole parse.
}

/**
 * Pages 1 to 3: may the farmer continue? Continue is never a disabled button: when this is false, Next shows the
 * page's own "needs" words and moves focus to the missing control.
 *  1: a field is marked. 2: the list is ready and non-empty and at least one picked crop is on it (prototype
 *  app.js:1170, known issue 11). 3: one water answer.
 */
export function stepComplete(draft: Draft, step: 1 | 2 | 3, catalogue: Catalogue | null): boolean {
  throw new Error("not implemented");
}

/** The FarmInput candidate: schemaVersion 1 plus the draft's keys, entries in draft order (I2). No defaults invented. */
export function assemble(draft: Draft): unknown {
  throw new Error("not implemented");
  // TODO: return { schemaVersion: 1, field, cropPurposeIds, water, planningStart, history }; absent keys stay absent
}

/** Turn a contract or server issue into a PageIssue for this draft. Client and server issues share this one table. */
export function classify(issue: InputIssue, draft: Draft): PageIssue {
  throw new Error("not implemented");
  // TODO by path:
  //  []                               -> unreadable, page null
  //  ["schemaVersion"]                -> unreadable, page null
  //  ["field", ...]                   -> field_shape, page 1 (server self-intersection, src/server/jobs/http.ts:114)
  //  ["cropPurposeIds"]               -> crops_duplicate (or crops_missing for a size issue), page 2
  //  ["cropPurposeIds", i]            -> crop_not_listed, cropId = draft.cropPurposeIds[i], page 2 (http.ts:116-119)
  //  ["water"]                        -> water_missing, page 3
  //  ["planningStart"]                -> date_missing, page 4
  //  ["history"]                      -> history_window, page 4 (dropped when planningStart is also flagged, I6 row)
  //  ["history","entries",i,"id"]     -> entry_id, entryId = entries[i].id
  //  ["history","entries",i,"crop",…] -> entry_name
  //  ["history","entries",i]          -> placementOf(entries[i]) outside or inverted ? entry_outside : entry_overlap
  //  anything else under a known key  -> other, on that key's page
}

/** Page of a path: field 1, cropPurposeIds 2, water 3, planningStart and history 4, anything else null. */
export function pageOf(path: readonly (string | number)[]): Step | null {
  const head = path[0];
  if (head === "field") return 1;
  if (head === "cropPurposeIds") return 2;
  if (head === "water") return 3;
  if (head === "planningStart" || head === "history") return 4;
  return null;
}

export function pin(issue: PageIssue, draft: Draft): PinnedIssue {
  throw new Error("not implemented");
  // TODO: pinnedTo = JSON.stringify(draft[path[0]] ?? null); page-null issues pin to the whole draft
}

export function stillPinned(issue: PinnedIssue, draft: Draft): boolean {
  throw new Error("not implemented");
}

/** Issues a lane shows at once, without waiting for Make my plan: outside or inverted bars (geometry only). */
export function liveEntryIssues(draft: Draft): ReadonlyMap<string, "entry_outside"> {
  throw new Error("not implemented");
}

/** Lowest page first, then path order, so "Fix these first" and the first focus are stable. */
export function orderIssues(issues: readonly PageIssue[]): readonly PageIssue[] {
  throw new Error("not implemented");
}
