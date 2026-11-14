// Node environment. Every way the answers change (src/features/onboarding/model/draft.ts applyEdit) and its invariants.
import { describe, it } from "vitest";

describe("invariants after any edit sequence", () => {
  it.todo("[C3] each present key parses with farmInputSchema.unwrap().shape[key] for 200 seeded random edit sequences: the draft is always a real Partial<FarmInput>");
  it.todo("[C3] a recorded history always has start < endExclusive, and endExclusive === planningStart when the date is set (I1)");
  it.todo("entries are sorted by start day after add, step, saveDates and markEmpty (I2)");
  it.todo("[H11] entry ids stay distinct after add, add, remove the middle, add (I3)");
  it.todo("[E4] cropPurposeIds is absent or 1 to 12 distinct ids (I4)");
});

describe("water", () => {
  it.todo("[F2] each of rain_only, rain_plus_backup and unsure changes only the water key: every other key is the same object (I6)");
});

describe("crops", () => {
  it.todo("toggling a picked crop removes it and returns cropRemoved with an Undo that restores the old order");
  it.todo("[E4] a 13th pick is refused: draft unchanged, note cropLimit");
  it.todo("removing the last crop deletes the key instead of storing []");
  it.todo("[E5] removeCrop removes an id the catalogue lacks; no other edit removes an id without a farmer action");
});

describe("field-ready date", () => {
  it.todo("setting a date with no history leaves history absent and sets planningStart");
  it.todo("[C3] clearing the date deletes planningStart and keeps the recorded history with its old window (known issue 24)");
  it.todo("[H15] changing the date by a month moves the window and keeps every entry; an entry now outside is kept, not dropped");
});

describe("history entries", () => {
  it.todo("addCrop before a date is impossible: needDate note, draft unchanged");
  it.todo("[H3] addCrop places a 90-day bar with both precisions approximate and returns entryAdded with its id");
  it.todo("[H8] addCrop with a listed crop stores { kind: \"catalogue\", cropPurposeId }; with a typed name stores { kind: \"unsupported\", label }");
  it.todo("[H8] addCrop with an unsupported name equal to a listed label (any case) adds the listed crop: listedInstead");
  it.todo("[H12] the 65th entry is refused with entryLimit and the draft is unchanged (inputLimits.historyEntries)");
  it.todo("saveDates with harvest before planting is refused with { kind: \"order\" } and changes nothing");
  it.todo("[H13] saveDates that overlaps a crop is refused with { kind: \"overlap\", with } (datesProblem and applyEdit agree)");
  it.todo("[H6] saveDates with approximate false writes both precisions as exact; true writes both approximate");
  it.todo("[H8] saveDates on an unsupported crop with a blank name is refused with { kind: \"name\" }");
  it.todo("[H10] markEmpty writes one fallow entry exactly over the gap; no other edit writes a fallow (spec.md:48)");
  it.todo("[H16] an unsupported entry never gains a cropPurposeId, whatever is edited afterwards");
  it.todo("removing the last entry deletes history (I5) and Undo restores it");
});

describe("alternatives", () => {
  it.todo("[H1] \"I don’t remember\" stores exactly { kind: \"skipped\" } and sets recorded bars aside with Undo");
  it.todo("\"My field was empty all year\" stores one fallow over the whole window; without a date it returns needDate");
  it.todo("pressing the active alternative again restores the set-aside bars");
  it.todo("[H1] skipped and empty all year are different values (spec.md:48)");
});

describe("seeding and repair", () => {
  it.todo("[C6] draftOf(inputFixture) has every answer and no schemaVersion");
  it.todo("normalizeDraft re-derives the window from planningStart, sorts entries, and never drops a crop or an entry");
  it.todo("normalizeDraft is idempotent");
  it.todo("sameAnswers ignores key order and treats draftOf(snapshot.input) and the submitted draft as equal");
});
