// Node environment. The entry rule and every transition (src/features/onboarding/model/flow.ts).
import { describe, it } from "vitest";

describe("openFlow: the entry rule", () => {
  it.todo("[B1][A9] nothing saved (null) and no initialInput opens editing step 1 with an empty draft and no hand-off");
  it.todo("[B1][C5] a saved activeJob opens making with that capability, whatever else is saved, initialInput included");
  it.todo("[B1] a saved snapshot, no job, initialInput null: handOff is that snapshot");
  it.todo("[B5][C6] a saved snapshot and initialInput set (Change inputs) with an equal saved draft: no hand-off, step 1 with draftOf(initialInput)");
  it.todo("[C6] a saved draft that differs from initialInput wins at its saved step and sets notices.keptNewer (known issue 3)");
  it.todo("[C6] an empty saved draft with initialInput opens step 1 with draftOf(initialInput)");
  it.todo("[B1] a saved draft with answers at step 3 and no initialInput opens step 3 with that draft");
  it.todo("[C4] a saved step of 0, 7 or NaN opens step 1");
  it.todo("earlierPlan is the saved snapshot in every row");
});

describe("update", () => {
  it.todo("opened outside the opening mode returns the same flow (Strict Mode runs the open effect twice)");
  it.todo("[D3] next on page 1 without a field sets asked and asks to focus the page control; with a field it goes to step 2 and focuses the title");
  it.todo("go(2) from step 1 changes only the step and asks to focus the title");
  it.todo("blocked sets check and asks to focus the summary on page 4");
  it.todo("[J1] submitted accepted moves to making with progress queued and clears pinned issues");
  it.todo("[J3] submitted invalid with [\"cropPurposeIds\",0] pins the issue and moves to step 2, focusing the crops issue");
  it.todo("[I3] submitted invalid with only a path [] issue stays on step 4 and lists it in the summary");
  it.todo("[J4] submitted unavailable stays on step 4 with send unavailable and asks to focus the submit panel");
  it.todo("progress, reachable and jobFailed for another jobId are ignored (late answers after Cancel)");
  it.todo("[K5] jobFailed moves to failed and focuses the title (known issue 17)");
  it.todo("cancel returns to step 4 with no job; the draft is the same object");
  it.todo("showMaking from page 4 with a background job returns to making with that job");
  it.todo("a catalogue message stores the state; the first entry to step 2 or 4 leaves it idle for the controller to load");
  it.todo("[B3] storage failing sets notices.storageFailing; dismiss clears it and a later failure does not bring it back this visit");
});

describe("backOf: one Back for the in-app button and the phone", () => {
  it.todo("an open sheet closes first");
  it.todo("[C1] step 3 goes to step 2 with every answer kept");
  it.todo("making goes to step 4 with the job still tracked (page 4 shows See how it’s going)");
  it.todo("failed goes to step 4");
  it.todo("step 1 returns null: the browser leaves");
});

describe("derived values", () => {
  it.todo("[C5] activeJobOf is the making job, the background job on page 4, else null");
  it.todo("[C2] persistedOf is null while opening, so nothing is saved before the saved state is read");
  it.todo("[J2] persistedOf in making has step 4 and the capability");
  it.todo("domIdOf gives distinct, valid ids for entry ids containing spaces and quotes");
});
