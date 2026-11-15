// Node environment. The entry rule and every transition.
import { describe, expect, it } from "vitest";
import { parseCropPurposeId, parseIsoDate } from "@/contracts";
import type { CompletedSnapshot, FarmInput, JobCapability, ServiceFailure } from "@/contracts";
import type { LocalState } from "@/client/storage";
import { inputFixture } from "@/fixtures/input";
import { completedSnapshotFixture, completedSnapshotsByState } from "@/fixtures/results";
import { syntheticRegistryFixture } from "@/fixtures/science";
import { draftOf } from "@/features/onboarding/model/draft";
import type { Draft } from "@/features/onboarding/model/draft";
import {
  activeJobOf,
  backOf,
  clampStep,
  domIdOf,
  issuesFor,
  matchCrops,
  openFlow,
  openingFlow,
  persistedOf,
  stepOf,
  update,
} from "@/features/onboarding/model/flow";
import type { Flow, FocusTarget, Msg, Step } from "@/features/onboarding/model/flow";
import { capability } from "../support/harness";

const catalogue = syntheticRegistryFixture.catalogue;
const listed = parseCropPurposeId("synthetic-crop");
const retired = parseCropPurposeId("retired-crop");
const answers = draftOf(inputFixture);
const other: JobCapability = { jobId: "1f7c2a0e-5b5d-4c3e-8f61-0d9a2b7c4e11", token: "other-token" };
const outage: ServiceFailure = { code: "temporarily_unavailable", message: "Down.", retryable: true };
const expired: ServiceFailure = { code: "not_found", message: "The job was not found.", retryable: false };

const saved = (state: Partial<LocalState>): LocalState => ({ draft: null, step: 1, activeJob: null, snapshot: null, ...state });

function run(flow: Flow, ...msgs: Msg[]) {
  let result = { flow, note: { kind: "none" } as const, focus: null as FocusTarget | null, handOff: null as CompletedSnapshot | null };
  for (const msg of msgs) result = { ...update(result.flow, msg), note: { kind: "none" } };
  return result;
}

function editingAt(step: Step, draft: Draft = answers, extra: Partial<Flow> = {}): Flow {
  return { ...openingFlow, mode: { kind: "editing", step, asked: false, send: { kind: "idle" }, job: null }, editor: { draft, setAside: null }, catalogue: { status: "ready", catalogue }, ...extra };
}

const making = (job: JobCapability = capability): Flow =>
  ({ ...editingAt(4), mode: { kind: "making", job: { capability: job, progress: "queued", reachable: true } } });

describe("openFlow: the entry rule", () => {
  it("[B1][A9] nothing saved (null) and no initialInput opens editing step 1 with an empty draft and no hand-off", () => {
    const { flow, handOff } = openFlow(null, null);
    expect(flow.mode).toEqual({ kind: "editing", step: 1, asked: false, send: { kind: "idle" }, job: null });
    expect(flow.editor).toEqual({ draft: {}, setAside: null });
    expect(handOff).toBeNull();
  });

  it("[B1][C5] a saved activeJob opens making with that capability, whatever else is saved, initialInput included", () => {
    const state = saved({ draft: inputFixture, step: 2, activeJob: capability, snapshot: completedSnapshotFixture });
    for (const initialInput of [null, inputFixture]) {
      const { flow, handOff } = openFlow(state, initialInput);
      expect(flow.mode).toEqual({ kind: "making", job: { capability, progress: "queued", reachable: true } });
      expect(flow.editor.draft).toEqual(answers);
      expect(handOff).toBeNull();
    }
  });

  it("[B1] a saved snapshot, no job, initialInput null: handOff is that snapshot", () => {
    expect(openFlow(saved({ draft: inputFixture, step: 4, snapshot: completedSnapshotFixture }), null).handOff).toBe(completedSnapshotFixture);
  });

  it("[B5][C6] a saved snapshot and initialInput set (Change inputs) with an equal saved draft: no hand-off, step 1 with draftOf(initialInput)", () => {
    const { flow, handOff } = openFlow(saved({ draft: inputFixture, step: 4, snapshot: completedSnapshotFixture }), inputFixture);
    expect(handOff).toBeNull();
    expect(stepOf(flow)).toBe(1);
    expect(flow.editor.draft).toEqual(answers);
    expect(flow.notices.keptNewer).toBe(false);
  });

  it("[C6] a saved draft that differs from initialInput wins at its saved step and sets notices.keptNewer", () => {
    const newer: Partial<FarmInput> = { ...inputFixture, planningStart: parseIsoDate("2027-02-01") };
    const { flow, handOff } = openFlow(saved({ draft: newer, step: 4, snapshot: completedSnapshotFixture }), inputFixture);
    expect(handOff).toBeNull();
    expect(stepOf(flow)).toBe(4);
    expect(flow.editor.draft.planningStart).toBe("2027-02-01");
    expect(flow.notices.keptNewer).toBe(true);
  });

  it("[C6] an empty saved draft with initialInput opens step 1 with draftOf(initialInput)", () => {
    for (const draft of [null, {}]) {
      const { flow } = openFlow(saved({ draft, step: 3 }), inputFixture);
      expect(stepOf(flow)).toBe(1);
      expect(flow.editor.draft).toEqual(answers);
    }
  });

  it("[B1] a saved draft with answers at step 3 and no initialInput opens step 3 with that draft", () => {
    const { flow, handOff } = openFlow(saved({ draft: { water: "unsure", cropPurposeIds: [listed] }, step: 3 }), null);
    expect(stepOf(flow)).toBe(3);
    expect(flow.editor.draft).toEqual({ water: "unsure", cropPurposeIds: [listed] });
    expect(handOff).toBeNull();
  });

  it("[C4] a saved step of 0, 7 or NaN opens step 1", () => {
    for (const step of [0, 7, Number.NaN, 2.5, -1]) {
      expect(stepOf(openFlow(saved({ draft: { water: "unsure" }, step }), null).flow)).toBe(1);
      expect(clampStep(step)).toBe(1);
    }
  });

  it("earlierPlan is the saved snapshot in every row", () => {
    const rows: [LocalState, FarmInput | null][] = [
      [saved({ activeJob: capability, snapshot: completedSnapshotFixture }), null],
      [saved({ snapshot: completedSnapshotFixture }), null],
      [saved({ snapshot: completedSnapshotFixture, draft: inputFixture }), inputFixture],
      [saved({ snapshot: completedSnapshotFixture, draft: { water: "unsure" }, step: 3 }), inputFixture],
      [saved({ snapshot: completedSnapshotFixture, draft: { water: "unsure" } }), null],
    ];
    for (const [state, initialInput] of rows) expect(openFlow(state, initialInput).flow.earlierPlan).toBe(completedSnapshotFixture);
    expect(openFlow(null, null).flow.earlierPlan).toBeNull();
  });

  it("a saved draft is repaired on open: an unusable year is dropped and entries are sorted", () => {
    const history = inputFixture.history.kind === "recorded" ? inputFixture.history : null;
    if (history === null) throw new Error("fixture has recorded history");
    const late = { ...history.entries[0], id: "late", planted: parseIsoDate("2026-01-01"), harvested: parseIsoDate("2026-02-01") };
    const draft: Partial<FarmInput> = { water: "unsure", planningStart: parseIsoDate("9999-01-01"), history: { ...history, entries: [late, history.entries[0]] } };
    const opened = openFlow(saved({ draft, step: 4 }), null).flow.editor.draft;
    expect(opened.planningStart).toBeUndefined();
    expect(opened.history?.kind === "recorded" && opened.history.entries.map(entry => entry.id)).toEqual(["synthetic-previous", "late"]);
  });
});

describe("update", () => {
  it("opened outside the opening mode returns the same flow (Strict Mode runs the open effect twice)", () => {
    const first = update(openingFlow, { kind: "opened", saved: null, initialInput: inputFixture });
    const second = update(first.flow, { kind: "opened", saved: saved({ snapshot: completedSnapshotFixture }), initialInput: null });
    expect(second.flow).toBe(first.flow);
    expect(second.handOff).toBeNull();
  });

  it("opened keeps a storage failure and a crop list that arrived while opening", () => {
    const early = run(openingFlow, { kind: "storage", health: "failing" }, { kind: "catalogue", state: { status: "loading" } });
    const opened = update(early.flow, { kind: "opened", saved: null, initialInput: null });
    expect(opened.flow.notices.storageFailing).toBe(true);
    expect(opened.flow.catalogue).toEqual({ status: "loading" });
    expect(opened.focus).toBeNull();
  });

  it("[D3] next on page 1 without a field sets asked and asks to focus the page control; with a field it goes to step 2 and focuses the title", () => {
    const blocked = update(editingAt(1, {}), { kind: "next" });
    expect(blocked.flow.mode).toMatchObject({ kind: "editing", step: 1, asked: true });
    expect(blocked.focus).toEqual({ kind: "pageControl", page: 1 });
    const marked = update(blocked.flow, { kind: "edit", edit: { kind: "field", field: inputFixture.field } });
    expect(marked.flow.mode).toMatchObject({ asked: false });
    const moved = update(marked.flow, { kind: "next" });
    expect(moved.flow.mode).toMatchObject({ kind: "editing", step: 2, asked: false });
    expect(moved.focus).toEqual({ kind: "title" });
  });

  it("[E3] next on page 2 needs a loaded list holding a picked crop", () => {
    const loading = editingAt(2, { cropPurposeIds: [listed] }, { catalogue: { status: "loading" } });
    expect(update(loading, { kind: "next" }).focus).toEqual({ kind: "pageControl", page: 2 });
    expect(stepOf(update(editingAt(2, { cropPurposeIds: [listed] }), { kind: "next" }).flow)).toBe(3);
    expect(update(editingAt(4), { kind: "next" }).flow).toEqual(editingAt(4));
  });

  it("go(2) from step 1 changes only the step and asks to focus the title", () => {
    const before = editingAt(1);
    const result = update(before, { kind: "go", step: 2, focus: null });
    expect(result.flow).toEqual({ ...before, mode: { ...before.mode, step: 2 } });
    expect(result.flow.editor).toBe(before.editor);
    expect(result.focus).toEqual({ kind: "title" });
    expect(update(before, { kind: "go", step: 4, focus: { kind: "planningStart" } }).focus).toEqual({ kind: "planningStart" });
  });

  it("blocked sets check and asks to focus the summary on page 4", () => {
    const result = update(editingAt(4, {}), { kind: "blocked" });
    expect(result.flow.check).toBe(true);
    expect(result.focus).toEqual({ kind: "summary" });
    expect(issuesFor(result.flow, "all").map(issue => issue.kind)).toEqual(["field_missing", "crops_missing", "water_missing", "date_missing", "history_missing"]);
    expect(issuesFor(result.flow, 4).map(issue => issue.kind)).toEqual(["date_missing", "history_missing"]);
  });

  it("[J1] submitted accepted moves to making with progress queued and clears pinned issues", () => {
    const invalid = update(editingAt(4), { kind: "submitted", submission: { kind: "invalid", issues: [{ path: [], message: "Bad body." }] }, draftAtSend: answers });
    const sending = update(invalid.flow, { kind: "sending" });
    expect(sending.flow.mode).toMatchObject({ send: { kind: "sending" } });
    const accepted = update(sending.flow, { kind: "submitted", submission: { kind: "accepted", capability }, draftAtSend: answers });
    expect(accepted.flow.mode).toEqual({ kind: "making", job: { capability, progress: "queued", reachable: true } });
    expect(accepted.flow.serverIssues).toEqual([]);
    expect(accepted.flow.check).toBe(false);
    expect(accepted.focus).toEqual({ kind: "title" });
    expect(update(accepted.flow, { kind: "submitted", submission: { kind: "accepted", capability }, draftAtSend: answers }).flow).toBe(accepted.flow);
  });

  it("[J3] submitted invalid with [\"cropPurposeIds\",0] pins the issue and moves to step 2, focusing the crops issue", () => {
    const sent: Draft = { ...answers, cropPurposeIds: [retired] };
    const result = update(editingAt(4, sent), { kind: "submitted", submission: { kind: "invalid", issues: [{ path: ["cropPurposeIds", 0], message: "Not in the catalogue." }] }, draftAtSend: sent });
    expect(result.flow.mode).toMatchObject({ kind: "editing", step: 2, send: { kind: "idle" } });
    expect(result.flow.serverIssues).toHaveLength(1);
    expect(issuesFor(result.flow, 2)).toEqual([{ kind: "crop_not_listed", page: 2, path: ["cropPurposeIds", 0], entryId: null, cropId: retired }]);
    expect(result.focus).toEqual({ kind: "pageIssues", page: 2 });
    expect(result.flow.editor.draft).toBe(sent);
  });

  it("[I3] submitted invalid with only a path [] issue stays on step 4 and lists it in the summary", () => {
    const result = update(editingAt(4), { kind: "submitted", submission: { kind: "invalid", issues: [{ path: [], message: "Malformed JSON." }] }, draftAtSend: answers });
    expect(stepOf(result.flow)).toBe(4);
    expect(result.focus).toEqual({ kind: "summary" });
    expect(issuesFor(result.flow, "all").map(issue => [issue.kind, issue.page])).toEqual([["unreadable", null]]);
    expect(issuesFor(result.flow, 4)).toEqual([]);
  });

  it("[J4] submitted unavailable stays on step 4 with send unavailable and asks to focus the submit panel", () => {
    const result = update(editingAt(4), { kind: "submitted", submission: { kind: "unavailable", failure: outage }, draftAtSend: answers });
    expect(result.flow.mode).toEqual({ kind: "editing", step: 4, asked: false, send: { kind: "unavailable", failure: outage }, job: null });
    expect(result.focus).toEqual({ kind: "submitPanel" });
    const away = update(result.flow, { kind: "go", step: 3, focus: null });
    expect(away.flow.mode).toMatchObject({ send: { kind: "idle" } });
  });

  it("progress, reachable and jobFailed for another jobId are ignored (late answers after Cancel)", () => {
    const flow = making();
    for (const msg of [
      { kind: "progress", jobId: other.jobId, progress: "fetching" },
      { kind: "reachable", jobId: other.jobId, reachable: false },
      { kind: "jobFailed", jobId: other.jobId, failure: expired },
      { kind: "jobDone", jobId: other.jobId },
    ] as const) expect(update(flow, msg).flow).toBe(flow);
    const cancelled = update(flow, { kind: "cancel" }).flow;
    expect(update(cancelled, { kind: "progress", jobId: capability.jobId, progress: "calculating" }).flow).toBe(cancelled);
  });

  it("progress and reachable for the tracked job update Making", () => {
    const result = run(making(), { kind: "progress", jobId: capability.jobId, progress: "fetching" }, { kind: "reachable", jobId: capability.jobId, reachable: false });
    expect(result.flow.mode).toEqual({ kind: "making", job: { capability, progress: "fetching", reachable: false } });
  });

  it("[K5] jobFailed moves to failed and focuses the title", () => {
    const result = update(making(), { kind: "jobFailed", jobId: capability.jobId, failure: expired });
    expect(result.flow.mode).toEqual({ kind: "failed", failure: expired });
    expect(result.focus).toEqual({ kind: "title" });
    expect(activeJobOf(result.flow)).toBeNull();
    const back = update(result.flow, { kind: "changeAnswers" });
    expect(back.flow.mode).toEqual({ kind: "editing", step: 4, asked: false, send: { kind: "idle" }, job: null });
    expect(back.flow.editor).toBe(result.flow.editor);
  });

  it("jobDone returns a host that keeps Onboarding mounted to page 4 with no job", () => {
    const result = update(making(), { kind: "jobDone", jobId: capability.jobId });
    expect(result.flow.mode).toEqual({ kind: "editing", step: 4, asked: false, send: { kind: "idle" }, job: null });
  });

  it("cancel returns to step 4 with no job; the draft is the same object", () => {
    const flow = making();
    const result = update(flow, { kind: "cancel" });
    expect(result.flow.mode).toEqual({ kind: "editing", step: 4, asked: false, send: { kind: "idle" }, job: null });
    expect(result.flow.editor.draft).toBe(flow.editor.draft);
    expect(persistedOf(result.flow)?.activeJob).toBeNull();
  });

  it("showMaking from page 4 with a background job returns to making with that job", () => {
    const left = update(making(), { kind: "go", step: 4, focus: null });
    expect(left.flow.mode).toMatchObject({ kind: "editing", step: 4, job: { capability } });
    const back = update(left.flow, { kind: "showMaking" });
    expect(back.flow.mode).toEqual({ kind: "making", job: { capability, progress: "queued", reachable: true } });
    expect(back.focus).toEqual({ kind: "title" });
    expect(update(editingAt(4), { kind: "showMaking" }).flow).toEqual(editingAt(4));
  });

  it("a catalogue message stores the state; the first entry to step 2 or 4 leaves it idle for the controller to load", () => {
    const fresh = { ...editingAt(1, {}), catalogue: { status: "idle" } } as const;
    const two = update(fresh, { kind: "go", step: 2, focus: null });
    expect(two.flow.catalogue).toEqual({ status: "idle" });
    const loading = update(two.flow, { kind: "catalogue", state: { status: "loading" } });
    expect(loading.flow.catalogue).toEqual({ status: "loading" });
    const ready = update(loading.flow, { kind: "catalogue", state: { status: "ready", catalogue } });
    expect(ready.flow.catalogue).toEqual({ status: "ready", catalogue });
  });

  it("[B3] storage failing sets notices.storageFailing; dismiss clears it and a later failure does not bring it back this visit", () => {
    const failing = update(editingAt(1), { kind: "storage", health: "failing" });
    expect(failing.flow.notices.storageFailing).toBe(true);
    expect(update(failing.flow, { kind: "storage", health: "working" }).flow).toBe(failing.flow);
    const dismissed = update(failing.flow, { kind: "dismiss", notice: "storageFailing" });
    expect(dismissed.flow.notices.storageFailing).toBe(false);
    expect(update(dismissed.flow, { kind: "storage", health: "failing" }).flow.notices.storageFailing).toBe(false);
  });

  it("an edit closes the sheet it finished, keeps a refused date sheet open, and says where focus goes", () => {
    const flow = editingAt(4, { ...answers, history: undefined }, { sheet: { kind: "add", within: null } });
    const added = update(flow, { kind: "edit", edit: { kind: "addCrop", crop: { kind: "catalogue", cropPurposeId: listed }, within: null } });
    expect(added.flow.sheet).toBeNull();
    expect(added.note).toEqual({ kind: "entryAdded", entryId: "crop-1" });
    expect(added.focus).toEqual({ kind: "editDates", entryId: "crop-1" });

    const returnTo: FocusTarget = { kind: "handle", entryId: "crop-1", end: "end" };
    const open = { ...added.flow, sheet: { kind: "dates", entryId: "crop-1", end: "harvested", returnTo } } as const;
    const planted = parseIsoDate("2025-08-01");
    const refused = update(open, { kind: "edit", edit: { kind: "saveDates", entryId: "crop-1", dates: { planted, harvested: parseIsoDate("2025-07-20"), approximate: true } } });
    expect(refused.flow.sheet).toBe(open.sheet);
    expect(refused.note).toEqual({ kind: "datesRefused", problem: { kind: "order" } });
    const savedDates = update(open, { kind: "edit", edit: { kind: "saveDates", entryId: "crop-1", dates: { planted, harvested: parseIsoDate("2025-09-01"), approximate: false } } });
    expect(savedDates.flow.sheet).toBeNull();
    expect(savedDates.focus).toEqual(returnTo);

    const removed = update(savedDates.flow, { kind: "edit", edit: { kind: "removeEntry", entryId: "crop-1" } });
    expect(removed.focus).toEqual({ kind: "addCrop" });
    if (removed.note.kind !== "entryRemoved") throw new Error("expected entryRemoved");
    const undone = update(removed.flow, { kind: "edit", edit: removed.note.undo });
    expect(undone.focus).toEqual({ kind: "editDates", entryId: "crop-1" });
  });

  it("an action that needs the date first sets asked on page 4 and focuses the date input", () => {
    const result = update(editingAt(4, { water: "unsure" }), { kind: "edit", edit: { kind: "alternative", choice: "empty" } });
    expect(result.flow.mode).toMatchObject({ step: 4, asked: true });
    expect(result.focus).toEqual({ kind: "planningStart" });
    const dated = update(result.flow, { kind: "edit", edit: { kind: "planningStart", date: inputFixture.planningStart } });
    expect(dated.flow.mode).toMatchObject({ asked: false });
  });

  it("undoing a crop removal focuses that crop's card", () => {
    const removed = update(editingAt(2), { kind: "edit", edit: { kind: "toggleCrop", id: listed } });
    expect(removed.focus).toBeNull();
    if (removed.note.kind !== "cropRemoved") throw new Error("expected cropRemoved");
    expect(update(removed.flow, { kind: "edit", edit: removed.note.undo }).focus).toEqual({ kind: "crop", id: listed });
  });

  it("edits are ignored while opening, so a late answer cannot be overwritten by the saved one", () => {
    expect(update(openingFlow, { kind: "edit", edit: { kind: "water", water: "unsure" } }).flow).toBe(openingFlow);
  });
});

describe("the crop filter", () => {
  const entries = [
    { id: parseCropPurposeId("common-bean-dry"), label: "Common bean (dry grain)", purpose: "food" },
    { id: parseCropPurposeId("sweet-maize"), label: "Sweet maize (sweet corn)", purpose: "food" },
    { id: parseCropPurposeId("groundnut"), label: "Groundnut (peanut)", purpose: "food" },
    { id: parseCropPurposeId("cafe"), label: "Café", purpose: "food" },
  ] as const;

  it("matchCrops keeps the crops whose label holds every typed word, ignoring case and accents, in list order", () => {
    const labels = (text: string) => matchCrops(entries, text).map(entry => entry.label);
    expect(labels("CORN")).toEqual(["Sweet maize (sweet corn)"]);
    expect(labels("dry bean")).toEqual(["Common bean (dry grain)"]);
    expect(labels("pea")).toEqual(["Groundnut (peanut)"]);
    expect(labels("cafe")).toEqual(["Café"]);
    expect(labels("  ")).toHaveLength(4);
    expect(labels("rice")).toEqual([]);
  });

  it("filterCrops keeps the words as typed on page 2, and leaving page 2 clears them", () => {
    const typed = update(editingAt(2), { kind: "filterCrops", text: "Bean " });
    expect(typed.flow.cropFilter).toBe("Bean ");
    expect(update(typed.flow, { kind: "go", step: 2, focus: null }).flow.cropFilter).toBe("Bean ");
    expect(update(typed.flow, { kind: "go", step: 1, focus: null }).flow.cropFilter).toBe("");
    const next = update(typed.flow, { kind: "next" }).flow;
    expect(stepOf(next)).toBe(3);
    expect(next.cropFilter).toBe("");
  });
});

describe("backOf: one Back for the in-app button and the phone", () => {
  it("an open sheet closes first", () => {
    const flow = editingAt(4, answers, { sheet: { kind: "add", within: null } });
    expect(backOf(flow)).toEqual({ kind: "sheet", sheet: null });
    expect(update(flow, { kind: "sheet", sheet: null }).focus).toEqual({ kind: "addCrop" });
  });

  it("[C1] step 3 goes to step 2 with every answer kept", () => {
    const flow = editingAt(3);
    const msg = backOf(flow);
    expect(msg).toEqual({ kind: "go", step: 2, focus: null });
    if (msg === null) throw new Error("expected a Back message");
    expect(update(flow, msg).flow.editor).toBe(flow.editor);
    expect(backOf(editingAt(4))).toEqual({ kind: "go", step: 3, focus: null });
    expect(backOf(editingAt(2))).toEqual({ kind: "go", step: 1, focus: null });
  });

  it("making goes to step 4 with the job still tracked (page 4 shows See how it’s going)", () => {
    const msg = backOf(making());
    if (msg === null) throw new Error("expected a Back message");
    const back = update(making(), msg).flow;
    expect(back.mode).toMatchObject({ kind: "editing", step: 4, job: { capability } });
    expect(activeJobOf(back)).toEqual(capability);
  });

  it("failed goes to step 4", () => {
    const failed: Flow = { ...editingAt(4), mode: { kind: "failed", failure: expired } };
    const msg = backOf(failed);
    expect(msg).toEqual({ kind: "changeAnswers" });
    if (msg === null) throw new Error("expected a Back message");
    expect(stepOf(update(failed, msg).flow)).toBe(4);
  });

  it("step 1 returns null: the browser leaves", () => {
    expect(backOf(editingAt(1))).toBeNull();
    expect(backOf(openingFlow)).toBeNull();
  });
});

describe("derived values", () => {
  it("[C5] activeJobOf is the making job, the background job on page 4, else null", () => {
    expect(activeJobOf(making())).toEqual(capability);
    expect(activeJobOf(update(making(), { kind: "go", step: 4, focus: null }).flow)).toEqual(capability);
    expect(activeJobOf(editingAt(4))).toBeNull();
    expect(activeJobOf(openingFlow)).toBeNull();
  });

  it("[C2] persistedOf is null while opening, so nothing is saved before the saved state is read", () => {
    expect(persistedOf(openingFlow)).toBeNull();
    expect(persistedOf(editingAt(2))).toEqual({ draft: answers, step: 2, activeJob: null });
  });

  it("[J2] persistedOf in making has step 4 and the capability", () => {
    expect(persistedOf(making())).toEqual({ draft: answers, step: 4, activeJob: capability });
  });

  it("issuesFor shows a pinned server issue only while the part it was about is unchanged", () => {
    const sent: Draft = { ...answers, cropPurposeIds: [retired] };
    const pinned = update(editingAt(4, sent), { kind: "submitted", submission: { kind: "invalid", issues: [{ path: ["cropPurposeIds", 0], message: "No." }] }, draftAtSend: sent }).flow;
    const unchecked = { ...pinned, check: false, catalogue: { status: "idle" } } as const;
    expect(issuesFor(unchecked, 2).map(issue => issue.kind)).toEqual(["crop_not_listed"]);
    const changed = update(unchecked, { kind: "edit", edit: { kind: "toggleCrop", id: listed } }).flow;
    expect(issuesFor(changed, "all")).toEqual([]);
  });

  it("domIdOf gives distinct, valid ids for entry ids containing spaces and quotes", () => {
    const entryIds = ["crop-1", "crop 1", "crop_1", "crop\"1", "crop'1", "crop_20_1", "Ä", "crop-1 "];
    const targets: FocusTarget[] = entryIds.flatMap(entryId => [
      { kind: "editDates", entryId },
      { kind: "handle", entryId, end: "start" },
      { kind: "handle", entryId, end: "end" },
      { kind: "unsure", entryId },
      { kind: "crop", id: entryId },
    ] as const);
    const fixed: FocusTarget[] = [
      { kind: "title" }, { kind: "summary" }, { kind: "submitPanel" }, { kind: "pageIssues", page: 2 }, { kind: "pageControl", page: 1 },
      { kind: "planningStart" }, { kind: "addCrop" }, { kind: "alternative", choice: "skipped" }, { kind: "alternative", choice: "empty" },
    ];
    const ids = [...targets, ...fixed].map(domIdOf);
    expect(new Set(ids).size).toBe(ids.length);
    for (const domId of ids) expect(domId).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
    expect(domIdOf({ kind: "title" })).toBe("main-title");
    expect(domIdOf({ kind: "editDates", entryId: "crop-1" })).toBe("ly-edit-crop-1");
  });

  it("a service_error snapshot opens like any other saved plan", () => {
    const snapshot = completedSnapshotsByState.service_error;
    expect(openFlow(saved({ snapshot }), null).handOff).toBe(snapshot);
  });
});
