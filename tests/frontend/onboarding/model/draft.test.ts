// Node environment. Every way the answers change, and the invariants every change keeps.
import { describe, expect, it } from "vitest";
import { farmInputSchema, inputLimits, parseCropPurposeId, parseIsoDate } from "@/contracts";
import type { CropPurposeId } from "@/contracts";
import { completedSnapshotFixture } from "@/fixtures/results";
import { inputFixture } from "@/fixtures/input";
import { addDays, addYears } from "@/features/onboarding/model/dates";
import {
  applyEdit,
  datesProblem,
  draftOf,
  emptyEditor,
  hasAnswers,
  historyMode,
  normalizeDraft,
  sameAnswers,
  windowOf,
} from "@/features/onboarding/model/draft";
import type { Draft, DraftEdit, Editor, EditResult } from "@/features/onboarding/model/draft";
import { coverageFor, gapsOf, spanOf } from "@/features/onboarding/model/timeline";
import type { CropEntry, Entry, FallowEntry, RecordedHistory } from "@/features/onboarding/model/timeline";
import { catalogueOf } from "../support/harness";

const catalogue = catalogueOf(14);
const id = (n: number) => parseCropPurposeId(`crop-${n}`);
const start = inputFixture.planningStart;
const coverage = coverageFor(start);
const day = (n: number) => addDays(coverage.start, n);

function apply(editor: Editor, ...edits: DraftEdit[]): EditResult {
  let result: EditResult = { editor, note: { kind: "none" } };
  for (const edit of edits) result = applyEdit(result.editor, edit, catalogue);
  return result;
}

const at = (draft: Draft): Editor => ({ draft, setAside: null });

function crop(entryId: string, planted: number, harvested: number, ref: CropEntry["crop"] = { kind: "catalogue", cropPurposeId: id(1) }): CropEntry {
  return { kind: "crop", id: entryId, crop: ref, planted: day(planted), harvested: day(harvested), plantedPrecision: "exact", harvestedPrecision: "exact" };
}

function fallow(entryId: string, a: number, b: number): FallowEntry {
  return { kind: "fallow", id: entryId, start: day(a), endExclusive: day(b) };
}

function recorded(entries: readonly Entry[]): RecordedHistory {
  return { kind: "recorded", start: coverage.start, endExclusive: coverage.endExclusive, entries };
}

const withHistory = (entries: readonly Entry[]): Draft => ({ planningStart: start, history: recorded(entries) });
const entriesOf = (draft: Draft) => (draft.history?.kind === "recorded" ? draft.history.entries : []);
const startOf = (entry: Entry) => (entry.kind === "crop" ? entry.planted : entry.start);

// A seeded generator, so a failing sequence can be replayed.
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dates = ["2026-07-01", "2026-08-01", "2028-02-29", "2027-03-01"].map(parseIsoDate);
const names = ["Cassava", "  cassava  ", "", "Crop 2", "x".repeat(81), "Teff"];

function randomEdit(next: () => number, editor: Editor, seenHistories: readonly (RecordedHistory | null)[]): DraftEdit {
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
  const entries = entriesOf(editor.draft);
  const entryId = () => (entries.length > 0 && next() < 0.9 ? pick(entries).id : "missing-entry");
  const window = editor.draft.planningStart ? coverageFor(editor.draft.planningStart) : coverage;
  const someDay = () => addDays(window.start, Math.floor(next() * 420) - 30);
  const span = () => {
    const gaps = gapsOf(entries, window);
    if (gaps.length > 0 && next() < 0.8) return pick(gaps);
    const a = Math.floor(next() * 380) - 10;
    return { a, b: a + 1 + Math.floor(next() * 60) };
  };
  const kinds = ["field", "toggleCrop", "removeCrop", "restoreCrops", "water", "planningStart", "addCrop", "addCrop", "addCrop",
    "step", "step", "saveDates", "markEmpty", "removeEntry", "alternative", "restoreHistory"] as const;
  switch (pick(kinds)) {
    case "field": return { kind: "field", field: inputFixture.field };
    case "toggleCrop": return { kind: "toggleCrop", id: id(1 + Math.floor(next() * 14)) };
    case "removeCrop": return { kind: "removeCrop", id: id(1 + Math.floor(next() * 14)) };
    case "restoreCrops": return { kind: "restoreCrops", ids: Array.from({ length: Math.floor(next() * 16) }, () => id(1 + Math.floor(next() * 14))) };
    case "water": return { kind: "water", water: pick(["rain_only", "rain_plus_backup", "unsure"] as const) };
    case "planningStart": return { kind: "planningStart", date: next() < 0.15 ? null : pick(dates) };
    case "addCrop": return {
      kind: "addCrop",
      crop: next() < 0.5 ? { kind: "catalogue", cropPurposeId: id(1 + Math.floor(next() * 3)) } : { kind: "unsupported", label: pick(names) },
      within: next() < 0.4 ? span() : null,
    };
    case "step": return { kind: "step", entryId: entryId(), end: pick(["start", "end", "move"] as const), targetDay: Math.floor(next() * 460) - 50 };
    case "saveDates": {
      const planted = someDay();
      return { kind: "saveDates", entryId: entryId(), dates: { planted, harvested: addDays(planted, Math.floor(next() * 90) - 5), approximate: next() < 0.5, label: pick(names) } };
    }
    case "markEmpty": return { kind: "markEmpty", gap: span() };
    case "removeEntry": return { kind: "removeEntry", entryId: entryId() };
    case "alternative": return { kind: "alternative", choice: pick(["empty", "skipped"] as const) };
    case "restoreHistory": return { kind: "restoreHistory", history: pick([...seenHistories, null]) };
  }
}

interface Visit {
  readonly before: Editor;
  readonly edit: DraftEdit;
  readonly after: Editor;
}

const steps: Visit[] = [];
for (let seed = 1; seed <= 200; seed++) {
  const next = random(seed);
  const seen: RecordedHistory[] = [];
  let editor: Editor = seed % 2 === 0 ? at(draftOf(inputFixture)) : emptyEditor;
  for (let n = 0; n < 40; n++) {
    const edit = randomEdit(next, editor, seen);
    const after = applyEdit(editor, edit, catalogue).editor;
    steps.push({ before: editor, edit, after });
    if (after.draft.history?.kind === "recorded") seen.push(after.draft.history);
    editor = after;
  }
}
const drafts = steps.map(step => step.after.draft);

describe("invariants after any edit sequence", () => {
  it("[C3] each present key parses with farmInputSchema.unwrap().shape[key] for 200 seeded random edit sequences: the draft is always a real Partial<FarmInput>", () => {
    const shape = farmInputSchema.unwrap().shape;
    for (const draft of drafts) {
      expect(Object.keys(draft).every(key => key in shape && key !== "schemaVersion")).toBe(true);
      if (draft.field) expect(shape.field.safeParse(draft.field).success).toBe(true);
      if (draft.cropPurposeIds) expect(shape.cropPurposeIds.safeParse(draft.cropPurposeIds).success).toBe(true);
      if (draft.water) expect(shape.water.safeParse(draft.water).success).toBe(true);
      if (draft.planningStart) expect(shape.planningStart.safeParse(draft.planningStart).success).toBe(true);
      if (draft.history) expect(shape.history.safeParse(draft.history).success, JSON.stringify(draft.history)).toBe(true);
    }
    expect(drafts.some(draft => entriesOf(draft).length > 3)).toBe(true);
    expect(drafts.some(draft => draft.history?.kind === "skipped")).toBe(true);
  });

  it("[C3] a recorded history always has start < endExclusive, and endExclusive === planningStart when the date is set (I1)", () => {
    for (const draft of drafts) {
      if (draft.history?.kind !== "recorded") continue;
      expect(draft.history.start < draft.history.endExclusive).toBe(true);
      if (draft.planningStart) {
        expect(draft.history.endExclusive).toBe(draft.planningStart);
        expect(draft.history.start).toBe(addYears(draft.planningStart, -1));
      }
    }
  });

  it("entries are sorted by start day after add, step, saveDates and markEmpty (I2)", () => {
    for (const draft of drafts) {
      const entries = entriesOf(draft);
      entries.slice(1).forEach((entry, i) => {
        const before = entries[i];
        expect(startOf(before) < startOf(entry) || (startOf(before) === startOf(entry) && before.id < entry.id)).toBe(true);
      });
    }
  });

  it("[H11] entry ids stay distinct after add, add, remove the middle, add (I3)", () => {
    const listed = { kind: "catalogue", cropPurposeId: id(1) } as const;
    const two = apply(at({ planningStart: start }), { kind: "addCrop", crop: listed, within: null }, { kind: "addCrop", crop: listed, within: null }, { kind: "addCrop", crop: listed, within: null });
    const middle = entriesOf(two.editor.draft)[1].id;
    const after = apply(two.editor, { kind: "removeEntry", entryId: middle }, { kind: "addCrop", crop: listed, within: null });
    const ids = entriesOf(after.editor.draft).map(entry => entry.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    for (const draft of drafts) {
      const all = entriesOf(draft).map(entry => entry.id);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it("[E4] cropPurposeIds is absent or 1 to 12 distinct ids (I4)", () => {
    for (const draft of drafts) {
      if (draft.cropPurposeIds === undefined) continue;
      expect(draft.cropPurposeIds.length).toBeGreaterThanOrEqual(1);
      expect(draft.cropPurposeIds.length).toBeLessThanOrEqual(inputLimits.selectedCrops);
      expect(new Set(draft.cropPurposeIds).size).toBe(draft.cropPurposeIds.length);
    }
    expect(drafts.some(draft => draft.cropPurposeIds?.length === inputLimits.selectedCrops)).toBe(true);
  });

  it("a recorded history never has zero entries (I5)", () => {
    for (const draft of drafts) if (draft.history?.kind === "recorded") expect(draft.history.entries.length).toBeGreaterThan(0);
  });
});

describe("water", () => {
  it("[F2] each of rain_only, rain_plus_backup and unsure changes only the water key: every other key is the same object (I6)", () => {
    const before = draftOf(inputFixture);
    for (const water of ["rain_only", "rain_plus_backup", "unsure"] as const) {
      const after = apply(at(before), { kind: "water", water }).editor.draft;
      expect(after.water).toBe(water);
      expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
      for (const key of ["field", "cropPurposeIds", "planningStart", "history"] as const) expect(after[key]).toBe(before[key]);
    }
  });
});

describe("crops", () => {
  const three = at({ cropPurposeIds: [id(1), id(2), id(3)] });

  it("toggling a picked crop removes it and returns cropRemoved with an Undo that restores the old order", () => {
    const removed = apply(three, { kind: "toggleCrop", id: id(2) });
    expect(removed.editor.draft.cropPurposeIds).toEqual([id(1), id(3)]);
    expect(removed.note).toEqual({ kind: "cropRemoved", id: id(2), undo: { kind: "restoreCrops", ids: [id(1), id(2), id(3)] } });
    if (removed.note.kind !== "cropRemoved") throw new Error("expected cropRemoved");
    expect(apply(removed.editor, removed.note.undo).editor.draft.cropPurposeIds).toEqual([id(1), id(2), id(3)]);
  });

  it("[E4] a 13th pick is refused: draft unchanged, note cropLimit", () => {
    const twelve = at({ cropPurposeIds: Array.from({ length: 12 }, (_, i) => id(i + 1)) });
    const refused = applyEdit(twelve, { kind: "toggleCrop", id: id(13) }, catalogue);
    expect(refused.editor).toBe(twelve);
    expect(refused.note).toEqual({ kind: "cropLimit" });
  });

  it("removing the last crop deletes the key instead of storing []", () => {
    const after = apply(at({ water: "unsure", cropPurposeIds: [id(1)] }), { kind: "toggleCrop", id: id(1) }).editor.draft;
    expect("cropPurposeIds" in after).toBe(false);
    expect(after).toEqual({ water: "unsure" });
  });

  it("[E5] removeCrop removes an id the catalogue lacks; no other edit removes an id without a farmer action", () => {
    const gone = parseCropPurposeId("retired-crop");
    const before = at({ ...draftOf(inputFixture), cropPurposeIds: [id(1), gone] });
    const others: DraftEdit[] = [
      { kind: "water", water: "unsure" },
      { kind: "planningStart", date: parseIsoDate("2026-09-01") },
      { kind: "addCrop", crop: { kind: "catalogue", cropPurposeId: gone }, within: null },
      { kind: "alternative", choice: "skipped" },
      { kind: "removeCrop", id: id(9) },
      { kind: "field", field: inputFixture.field },
    ];
    expect(apply(before, ...others).editor.draft.cropPurposeIds).toEqual([id(1), gone]);
    const removed = apply(before, { kind: "removeCrop", id: gone });
    expect(removed.editor.draft.cropPurposeIds).toEqual([id(1)]);
    expect(removed.note).toMatchObject({ kind: "cropRemoved", id: gone });

    for (const step of steps) {
      const lost = (step.before.draft.cropPurposeIds ?? []).filter(cropId => !(step.after.draft.cropPurposeIds ?? []).includes(cropId));
      if (lost.length === 0) continue;
      expect(["toggleCrop", "removeCrop", "restoreCrops"]).toContain(step.edit.kind);
    }
  });
});

describe("field-ready date", () => {
  it("setting a date with no history leaves history absent and sets planningStart", () => {
    const after = apply(emptyEditor, { kind: "planningStart", date: parseIsoDate("2027-03-01") }).editor.draft;
    expect(after).toEqual({ planningStart: "2027-03-01" });
  });

  it("[C3] clearing the date deletes planningStart and keeps the recorded history with its old window", () => {
    const before = draftOf(inputFixture);
    const after = apply(at(before), { kind: "planningStart", date: null }).editor.draft;
    expect("planningStart" in after).toBe(false);
    expect(after.history).toBe(before.history);
    expect(windowOf(after)).toEqual(coverage);
  });

  it("[H15] changing the date by a month moves the window and keeps every entry; an entry now outside is kept, not dropped", () => {
    const entries = [crop("crop-1", 2, 20), fallow("empty-1", 100, 120)];
    const after = apply(at(withHistory(entries)), { kind: "planningStart", date: parseIsoDate("2026-08-01") }).editor.draft;
    expect(after.history).toEqual({ kind: "recorded", start: "2025-08-01", endExclusive: "2026-08-01", entries });
  });

  it("a date in year 0000 or 9999 counts as cleared, so the window maths never leaves the four-digit years", () => {
    for (const raw of ["0000-06-01", "9999-06-01"]) {
      const after = apply(at(draftOf(inputFixture)), { kind: "planningStart", date: parseIsoDate(raw) }).editor.draft;
      expect(after.planningStart).toBeUndefined();
    }
  });
});

describe("history entries", () => {
  const listed = { kind: "catalogue", cropPurposeId: id(2) } as const;

  it("addCrop before a date is impossible: needDate note, draft unchanged", () => {
    const editor = at({ water: "rain_only" });
    const result = applyEdit(editor, { kind: "addCrop", crop: listed, within: null }, catalogue);
    expect(result.editor).toBe(editor);
    expect(result.note).toEqual({ kind: "needDate" });
  });

  it("[H3] addCrop places a 90-day bar with both precisions approximate and returns entryAdded with its id", () => {
    const result = apply(at({ planningStart: start }), { kind: "addCrop", crop: listed, within: null });
    expect(result.editor.draft.history).toEqual(recorded([{
      kind: "crop", id: "crop-1", crop: listed, planted: day(0), harvested: day(89), plantedPrecision: "approximate", harvestedPrecision: "approximate",
    }]));
    expect(result.note).toEqual({ kind: "entryAdded", entryId: "crop-1" });
  });

  it("[H8] addCrop with a listed crop stores { kind: \"catalogue\", cropPurposeId }; with a typed name stores { kind: \"unsupported\", label }", () => {
    const result = apply(at({ planningStart: start }),
      { kind: "addCrop", crop: listed, within: null },
      { kind: "addCrop", crop: { kind: "unsupported", label: "  Teff   grass " }, within: null });
    expect(entriesOf(result.editor.draft).map(entry => entry.kind === "crop" && entry.crop)).toEqual([listed, { kind: "unsupported", label: "Teff grass" }]);
  });

  it("[H8] addCrop with an unsupported name equal to a listed label (any case) adds the listed crop: listedInstead", () => {
    const result = apply(at({ planningStart: start }), { kind: "addCrop", crop: { kind: "unsupported", label: " crop 3 " }, within: null });
    expect(entriesOf(result.editor.draft)[0]).toMatchObject({ crop: { kind: "catalogue", cropPurposeId: id(3) } });
    expect(result.note).toEqual({ kind: "listedInstead", id: id(3), entryId: "crop-1" });
  });

  it("addCrop refuses a blank or an 81-letter typed name and changes nothing", () => {
    const editor = at({ planningStart: start });
    expect(applyEdit(editor, { kind: "addCrop", crop: { kind: "unsupported", label: "   " }, within: null }, catalogue))
      .toEqual({ editor, note: { kind: "datesRefused", problem: { kind: "name" } } });
    expect(applyEdit(editor, { kind: "addCrop", crop: { kind: "unsupported", label: "é".repeat(81) }, within: null }, catalogue))
      .toEqual({ editor, note: { kind: "datesRefused", problem: { kind: "nameLong" } } });
    expect(apply(editor, { kind: "addCrop", crop: { kind: "unsupported", label: "é".repeat(80) }, within: null }).note.kind).toBe("entryAdded");
  });

  it("addCrop into a tapped gap uses it, and a stale tap that now overlaps a bar falls back to free days", () => {
    const editor = at(withHistory([crop("crop-1", 10, 40)]));
    const tapped = apply(editor, { kind: "addCrop", crop: listed, within: { a: 100, b: 130 } }).editor.draft;
    expect(entriesOf(tapped)[1]).toMatchObject({ planted: day(100), harvested: day(129) });
    const stale = apply(editor, { kind: "addCrop", crop: listed, within: { a: 30, b: 60 } }).editor.draft;
    expect(entriesOf(stale)[1]).toMatchObject({ planted: day(41), harvested: day(130) });
  });

  it("[H12] the 65th entry is refused with entryLimit and the draft is unchanged (inputLimits.historyEntries)", () => {
    const full = at(withHistory(Array.from({ length: inputLimits.historyEntries }, (_, i) => crop(`crop-${i + 1}`, i * 2, i * 2))));
    const result = applyEdit(full, { kind: "addCrop", crop: listed, within: null }, catalogue);
    expect(result.editor).toBe(full);
    expect(result.note).toEqual({ kind: "entryLimit" });
  });

  const one = at(withHistory([crop("crop-1", 10, 40), crop("crop-2", 60, 90)]));
  const datesFor = (planted: number, harvested: number, approximate = true) => ({ planted: day(planted), harvested: day(harvested), approximate });

  it("saveDates with harvest before planting is refused with { kind: \"order\" } and changes nothing", () => {
    const result = applyEdit(one, { kind: "saveDates", entryId: "crop-1", dates: datesFor(30, 20) }, catalogue);
    expect(result).toEqual({ editor: one, note: { kind: "datesRefused", problem: { kind: "order" } } });
  });

  it("saveDates outside the 12 months is refused with the window's first and last day", () => {
    const result = applyEdit(one, { kind: "saveDates", entryId: "crop-1", dates: datesFor(300, 365) }, catalogue);
    expect(result.note).toEqual({ kind: "datesRefused", problem: { kind: "window", first: coverage.start, last: addDays(coverage.endExclusive, -1) } });
  });

  it("[H13] saveDates that overlaps a crop is refused with { kind: \"overlap\", with } (datesProblem and applyEdit agree)", () => {
    const dates = datesFor(30, 60);
    const problem = datesProblem(one, "crop-1", dates);
    expect(problem).toEqual({ kind: "overlap", with: entriesOf(one.draft)[1] });
    expect(applyEdit(one, { kind: "saveDates", entryId: "crop-1", dates }, catalogue)).toEqual({ editor: one, note: { kind: "datesRefused", problem } });
    expect(datesProblem(one, "crop-1", datesFor(30, 59))).toBeNull();
    for (const step of steps) {
      if (step.edit.kind !== "saveDates") continue;
      const refused = datesProblem(step.before, step.edit.entryId, step.edit.dates) !== null;
      if (refused) expect(step.after).toBe(step.before);
    }
  });

  it("[H6] saveDates with approximate false writes both precisions as exact; true writes both approximate", () => {
    const exact = apply(one, { kind: "saveDates", entryId: "crop-1", dates: datesFor(5, 45, false) });
    expect(entriesOf(exact.editor.draft)[0]).toMatchObject({ planted: day(5), harvested: day(45), plantedPrecision: "exact", harvestedPrecision: "exact" });
    expect(exact.note).toEqual({ kind: "datesSaved", entryId: "crop-1" });
    const about = apply(exact.editor, { kind: "saveDates", entryId: "crop-1", dates: datesFor(5, 45, true) });
    expect(entriesOf(about.editor.draft)[0]).toMatchObject({ plantedPrecision: "approximate", harvestedPrecision: "approximate" });
  });

  it("saveDates that moves a bar past another re-sorts the entries", () => {
    const moved = apply(one, { kind: "saveDates", entryId: "crop-1", dates: datesFor(200, 220) }).editor.draft;
    expect(entriesOf(moved).map(entry => entry.id)).toEqual(["crop-2", "crop-1"]);
  });

  it("[H8] saveDates on an unsupported crop with a blank name is refused with { kind: \"name\" }", () => {
    const editor = at(withHistory([crop("crop-1", 10, 40, { kind: "unsupported", label: "Teff" })]));
    const result = applyEdit(editor, { kind: "saveDates", entryId: "crop-1", dates: { ...datesFor(10, 40), label: "  " } }, catalogue);
    expect(result).toEqual({ editor, note: { kind: "datesRefused", problem: { kind: "name" } } });
    const renamed = apply(editor, { kind: "saveDates", entryId: "crop-1", dates: { ...datesFor(10, 40), label: " Red  teff " } }).editor.draft;
    expect(entriesOf(renamed)[0]).toMatchObject({ crop: { kind: "unsupported", label: "Red teff" } });
  });

  it("[H10] markEmpty writes one fallow entry exactly over the gap; no other edit writes a fallow", () => {
    const result = apply(at(withHistory([crop("crop-1", 10, 40)])), { kind: "markEmpty", gap: { a: 41, b: 70 } });
    expect(entriesOf(result.editor.draft)).toEqual([crop("crop-1", 10, 40), fallow("empty-2", 41, 70)]);
    expect(result.note).toMatchObject({ kind: "markedEmpty", entry: fallow("empty-2", 41, 70) });
    expect(spanOf(entriesOf(result.editor.draft)[1], coverage)).toEqual({ a: 41, b: 70 });

    const fallowIds = (draft: Draft) => new Set(entriesOf(draft).flatMap(entry => (entry.kind === "fallow" ? [entry.id] : [])));
    let written = 0;
    for (const step of steps) {
      const before = fallowIds(step.before.draft);
      if ([...fallowIds(step.after.draft)].every(fallowId => before.has(fallowId))) continue;
      written += 1;
      expect(["markEmpty", "alternative", "restoreHistory"], JSON.stringify(step.edit)).toContain(step.edit.kind);
    }
    expect(written).toBeGreaterThan(20);
  });

  it("markEmpty refuses a stale gap that now overlaps a bar or leaves the 12 months, and changes nothing", () => {
    const editor = at(withHistory([crop("crop-1", 10, 40)]));
    for (const gap of [{ a: 30, b: 60 }, { a: -5, b: 5 }, { a: 300, b: 400 }, { a: 50, b: 50 }]) {
      expect(applyEdit(editor, { kind: "markEmpty", gap }, catalogue)).toEqual({ editor, note: { kind: "none" } });
    }
  });

  it("[H16] an unsupported entry never gains a cropPurposeId, whatever is edited afterwards", () => {
    let checked = 0;
    for (const step of steps) {
      if (step.edit.kind === "restoreHistory") continue;
      const after = new Map(entriesOf(step.after.draft).map(entry => [entry.id, entry]));
      for (const entry of entriesOf(step.before.draft)) {
        if (entry.kind !== "crop" || entry.crop.kind !== "unsupported") continue;
        const later = after.get(entry.id);
        if (later === undefined) continue;
        checked += 1;
        expect(later.kind === "crop" && later.crop.kind).toBe("unsupported");
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("removing the last entry deletes history (I5) and Undo restores it", () => {
    const editor = at(withHistory([crop("crop-1", 10, 40)]));
    const removed = apply(editor, { kind: "removeEntry", entryId: "crop-1" });
    expect("history" in removed.editor.draft).toBe(false);
    expect(removed.note).toMatchObject({ kind: "entryRemoved", entry: crop("crop-1", 10, 40) });
    if (removed.note.kind !== "entryRemoved") throw new Error("expected entryRemoved");
    expect(apply(removed.editor, removed.note.undo).editor.draft.history).toEqual(editor.draft.history);
  });

  it("removing an empty time says markedUnsure, so the gap is Not sure again", () => {
    const result = apply(at(withHistory([crop("crop-1", 10, 40), fallow("empty-1", 41, 70)])), { kind: "removeEntry", entryId: "empty-1" });
    expect(entriesOf(result.editor.draft)).toEqual([crop("crop-1", 10, 40)]);
    expect(result.note).toMatchObject({ kind: "markedUnsure", entry: fallow("empty-1", 41, 70) });
  });

  it("step moves a bar by one shared rule and reports why it stopped", () => {
    const result = apply(one, { kind: "step", entryId: "crop-1", end: "end", targetDay: 70 });
    expect(entriesOf(result.editor.draft)[0]).toMatchObject({ harvested: day(59) });
    expect(result.note).toEqual({ kind: "stepped", entryId: "crop-1", stop: { kind: "overlap", with: entriesOf(one.draft)[1] } });
    const still = applyEdit(one, { kind: "step", entryId: "crop-1", end: "start", targetDay: 10 }, catalogue);
    expect(still.editor).toBe(one);
  });
});

describe("alternatives", () => {
  const bars = at(withHistory([crop("crop-1", 10, 40)]));

  it("[H1] \"I don’t remember\" stores exactly { kind: \"skipped\" } and sets recorded bars aside with Undo", () => {
    const result = apply(bars, { kind: "alternative", choice: "skipped" });
    expect(result.editor.draft.history).toEqual({ kind: "skipped" });
    expect(result.editor.setAside).toBe(bars.draft.history);
    expect(result.note).toEqual({ kind: "setAside", choice: "skipped", undo: { kind: "restoreHistory", history: bars.draft.history } });
    if (result.note.kind !== "setAside") throw new Error("expected setAside");
    const undone = apply(result.editor, result.note.undo).editor;
    expect(undone).toEqual(bars);
  });

  it("\"My field was empty all year\" stores one fallow over the whole window; without a date it returns needDate", () => {
    const empty = apply(at({ planningStart: start }), { kind: "alternative", choice: "empty" });
    expect(empty.editor.draft.history).toEqual(recorded([fallow("empty-1", 0, coverage.days)]));
    expect(historyMode(empty.editor.draft)).toBe("empty");
    const noDate = at({ water: "unsure" });
    expect(applyEdit(noDate, { kind: "alternative", choice: "empty" }, catalogue)).toEqual({ editor: noDate, note: { kind: "needDate" } });
  });

  it("pressing the active alternative again restores the set-aside bars", () => {
    const skipped = apply(bars, { kind: "alternative", choice: "skipped" }, { kind: "alternative", choice: "empty" });
    expect(historyMode(skipped.editor.draft)).toBe("empty");
    const back = apply(skipped.editor, { kind: "alternative", choice: "empty" }).editor;
    expect(back).toEqual(bars);
    const nothing = apply(at({ planningStart: start }), { kind: "alternative", choice: "skipped" }, { kind: "alternative", choice: "skipped" });
    expect(nothing.editor.draft).toEqual({ planningStart: start });
  });

  it("set-aside bars come back in the window of a date changed meanwhile", () => {
    const later = parseIsoDate("2026-08-01");
    const back = apply(bars, { kind: "alternative", choice: "skipped" }, { kind: "planningStart", date: later }, { kind: "alternative", choice: "skipped" });
    expect(back.editor.draft.history).toEqual({ ...bars.draft.history, start: "2025-08-01", endExclusive: later });
  });

  it("[H1] skipped and empty all year are different values", () => {
    const skipped = apply(at({ planningStart: start }), { kind: "alternative", choice: "skipped" }).editor.draft;
    const empty = apply(at({ planningStart: start }), { kind: "alternative", choice: "empty" }).editor.draft;
    expect(skipped.history).not.toEqual(empty.history);
    expect([historyMode(skipped), historyMode(empty), historyMode({}), historyMode(bars.draft)]).toEqual(["skipped", "empty", "none", "recorded"]);
  });
});

describe("seeding and repair", () => {
  it("[C6] draftOf(inputFixture) has every answer and no schemaVersion", () => {
    const draft = draftOf(inputFixture);
    expect(Object.keys(draft).sort()).toEqual(["cropPurposeIds", "field", "history", "planningStart", "water"]);
    const { schemaVersion: _version, ...answers } = inputFixture;
    expect(draft).toEqual(answers);
    expect(hasAnswers(draft)).toBe(true);
    expect([hasAnswers({}), hasAnswers(null), hasAnswers(undefined)]).toEqual([false, false, false]);
  });

  it("normalizeDraft re-derives the window from planningStart, sorts entries, and never drops a crop or an entry", () => {
    const later = crop("crop-2", 200, 220);
    const earlier = fallow("empty-1", 5, 9);
    const stale: RecordedHistory = { kind: "recorded", start: parseIsoDate("2020-01-01"), endExclusive: parseIsoDate("2021-01-01"), entries: [later, earlier] };
    const crops: CropPurposeId[] = [id(4), parseCropPurposeId("retired-crop"), id(4), id(1)];
    const repaired = normalizeDraft({ schemaVersion: 1, planningStart: start, history: stale, cropPurposeIds: crops });
    expect(repaired).toEqual({ planningStart: start, cropPurposeIds: [id(4), parseCropPurposeId("retired-crop"), id(1)], history: recorded([earlier, later]) });
    expect(normalizeDraft({ history: { ...stale, entries: [] }, cropPurposeIds: [] })).toEqual({});
    expect(normalizeDraft({ planningStart: parseIsoDate("9999-01-01"), water: "unsure" })).toEqual({ water: "unsure" });
  });

  it("normalizeDraft is idempotent", () => {
    for (const draft of [...drafts.slice(0, 2000), draftOf(inputFixture)]) {
      const once = normalizeDraft(draft);
      expect(normalizeDraft(once)).toEqual(once);
    }
  });

  it("sameAnswers ignores key order and treats draftOf(snapshot.input) and the submitted draft as equal", () => {
    const submitted = draftOf(inputFixture);
    const reordered: Draft = { history: submitted.history, water: submitted.water, planningStart: submitted.planningStart, field: submitted.field, cropPurposeIds: submitted.cropPurposeIds };
    expect(sameAnswers(draftOf(completedSnapshotFixture.input), reordered)).toBe(true);
    expect(sameAnswers(submitted, { ...submitted, water: "unsure" })).toBe(false);
    expect(sameAnswers(submitted, { ...submitted, planningStart: parseIsoDate("2026-07-02") })).toBe(false);
  });
});
