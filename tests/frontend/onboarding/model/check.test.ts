// Node environment. Validation at submission and issue routing.
import { describe, expect, it } from "vitest";
import { farmInputSchema, inputLimits, parseCropPurposeId } from "@/contracts";
import type { FarmInput } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { syntheticRegistryFixture } from "@/fixtures/science";
import {
  checkDraft,
  classify,
  liveEntryIssues,
  orderIssues,
  pageOf,
  pin,
  stepComplete,
  stillPinned,
  tidyIssues,
} from "@/features/onboarding/model/check";
import type { PageIssue } from "@/features/onboarding/model/check";
import { addDays } from "@/features/onboarding/model/dates";
import { draftOf } from "@/features/onboarding/model/draft";
import type { Draft } from "@/features/onboarding/model/draft";
import { coverageFor } from "@/features/onboarding/model/timeline";
import type { CropEntry, Entry, FallowEntry } from "@/features/onboarding/model/timeline";
import { farmInputKeys } from "../support/harness";

const catalogue = syntheticRegistryFixture.catalogue;
const listed = parseCropPurposeId("synthetic-crop");
const retired = parseCropPurposeId("retired-crop");
const complete = draftOf(inputFixture);
const coverage = coverageFor(inputFixture.planningStart);
const day = (n: number) => addDays(coverage.start, n);

function crop(id: string, planted: number, harvested: number, label?: string): CropEntry {
  return {
    kind: "crop",
    id,
    crop: label === undefined ? { kind: "catalogue", cropPurposeId: listed } : { kind: "unsupported", label },
    planted: day(planted),
    harvested: day(harvested),
    plantedPrecision: "approximate",
    harvestedPrecision: "approximate",
  };
}

function fallow(id: string, a: number, b: number): FallowEntry {
  return { kind: "fallow", id, start: day(a), endExclusive: day(b) };
}

const withEntries = (entries: readonly Entry[], draft: Draft = complete): Draft =>
  ({ ...draft, history: { kind: "recorded", start: coverage.start, endExclusive: coverage.endExclusive, entries } });

const blockedIssues = (draft: Draft, list = catalogue): readonly PageIssue[] => {
  const check = checkDraft(draft, list);
  if (check.kind !== "blocked") throw new Error("expected blocked");
  return check.issues;
};

const readyInput = (draft: Draft, list: typeof catalogue | null = catalogue): FarmInput => {
  const check = checkDraft(draft, list);
  if (check.kind !== "ready") throw new Error(`expected ready, got ${JSON.stringify(check.issues)}`);
  return check.input;
};

const kinds = (issues: readonly PageIssue[]) => issues.map(issue => issue.kind);

describe("checkDraft", () => {
  it("[I5] an empty draft returns five presence issues on pages 1, 2, 3, 4, 4, and no zod words", () => {
    const issues = blockedIssues({});
    expect(kinds(issues)).toEqual(["field_missing", "crops_missing", "water_missing", "date_missing", "history_missing"]);
    expect(issues.map(issue => issue.page)).toEqual([1, 2, 3, 4, 4]);
    expect(issues.every(issue => !("message" in issue))).toBe(true);
  });

  it("[I5] a draft missing only the date AND holding duplicate crops shows only date_missing first, then crops_duplicate once the date is set", () => {
    const { planningStart: _start, ...noDate } = { ...complete, cropPurposeIds: [listed, listed] };
    expect(kinds(blockedIssues(noDate))).toEqual(["date_missing"]);
    expect(blockedIssues({ ...noDate, planningStart: inputFixture.planningStart })).toEqual([
      { kind: "crops_duplicate", page: 2, path: ["cropPurposeIds"], entryId: null, cropId: null },
    ]);
  });

  it("[I5] with every answer present, a duplicate crop and an overlapping entry are reported together in one check", () => {
    const draft = withEntries([crop("a", 10, 40), crop("b", 30, 60)], { ...complete, cropPurposeIds: [listed, listed] });
    expect(blockedIssues(draft)).toEqual([
      { kind: "crops_duplicate", page: 2, path: ["cropPurposeIds"], entryId: null, cropId: null },
      { kind: "entry_overlap", page: 4, path: ["history", "entries", 1], entryId: "b", cropId: null },
    ]);
  });

  it("[I1] a complete inputFixture draft returns ready with input deep-equal to inputFixture", () => {
    expect(readyInput(complete)).toEqual(inputFixture);
  });

  it("[A4] the ready input has exactly the six FarmInput keys and no priority key", () => {
    const oldDraft: Draft = Object.assign({}, complete, { priority: "water" });
    const input = readyInput(oldDraft);
    expect(Object.keys(input).sort()).toEqual([...farmInputKeys]);
    expect("priority" in input).toBe(false);
  });

  it("[I1] an unsupported label \" Cassava \" is submitted as \"Cassava\" (parsed.data)", () => {
    const input = readyInput(withEntries([crop("a", 10, 40, " Cassava ")]));
    expect(input.history.kind === "recorded" && input.history.entries[0]).toMatchObject({ crop: { kind: "unsupported", label: "Cassava" } });
    expect(Object.isFrozen(input)).toBe(true);
  });

  it("[E5] a picked id missing from the loaded catalogue gives crop_not_listed on page 2 and the id stays in the draft", () => {
    const draft: Draft = { ...complete, cropPurposeIds: [listed, retired] };
    expect(blockedIssues(draft)).toEqual([{ kind: "crop_not_listed", page: 2, path: ["cropPurposeIds", 1], entryId: null, cropId: retired }]);
    expect(draft.cropPurposeIds).toEqual([listed, retired]);
  });

  it("with no catalogue loaded the membership step is skipped (the server checks it)", () => {
    expect(readyInput({ ...complete, cropPurposeIds: [listed, retired] }, null).cropPurposeIds).toEqual([listed, retired]);
  });

  it("[J5] 64 entries with 240-character names stay under inputLimits.payloadBytes; a larger synthetic input gives too_large", () => {
    const many = (label: string) => Array.from({ length: inputLimits.historyEntries }, (_, i) => crop(`crop-${i + 1}`, i * 2, i * 2, label));
    const input = readyInput(withEntries(many("a".repeat(240))));
    expect(new TextEncoder().encode(JSON.stringify(input)).length).toBeLessThan(inputLimits.payloadBytes);

    const [lng, lat] = inputFixture.field.lookup;
    const corners = Array.from({ length: inputLimits.polygonVertices }, (_, i) => {
      const angle = (2 * Math.PI * i) / inputLimits.polygonVertices;
      return [lng + 0.004 * Math.cos(angle), lat + 0.004 * Math.sin(angle)] as const;
    });
    const field = { ...inputFixture.field, ring: [...corners, corners[0]] };
    const large = withEntries(many("穀".repeat(240)), { ...complete, field });
    expect(farmInputSchema.safeParse({ schemaVersion: 1, ...large }).success).toBe(true);
    expect(blockedIssues(large)).toEqual([{ kind: "too_large", page: null, path: [], entryId: null, cropId: null }]);
  });

  it("[H9] two bars with a gap between them submit no fallow entry", () => {
    const input = readyInput(withEntries([crop("a", 0, 10), crop("b", 50, 60)]));
    expect(input.history.kind === "recorded" && input.history.entries.map(entry => entry.kind)).toEqual(["crop", "crop"]);
  });

  it("[I6] an invalid planningStart shows only date_missing on page 4, not a second history_window issue", () => {
    const { planningStart: _start, ...cleared } = withEntries([crop("a", 0, 10)]);
    expect(blockedIssues(cleared)).toEqual([{ kind: "date_missing", page: 4, path: ["planningStart"], entryId: null, cropId: null }]);
    const server = [{ path: ["planningStart"], message: "Invalid date" }, { path: ["history"], message: "History coverage must end at or before the planning start." }];
    expect(kinds(tidyIssues(server.map(issue => classify(issue, complete))))).toEqual(["date_missing"]);
  });

  it("a bar outside its window is flagged while other answers are still missing", () => {
    const draft = withEntries([crop("a", -20, 10)], { planningStart: inputFixture.planningStart });
    expect(kinds(blockedIssues(draft))).toEqual(["field_missing", "crops_missing", "water_missing", "entry_outside"]);
  });
});

describe("stepComplete: the page minimum behind Next", () => {
  it("[D3] page 1 needs a field", () => {
    expect(stepComplete({}, 1, catalogue)).toBe(false);
    expect(stepComplete({ field: inputFixture.field }, 1, null)).toBe(true);
  });

  it("[E3] page 2 needs a ready, non-empty list and at least one picked crop that is on it", () => {
    const picked: Draft = { cropPurposeIds: [listed] };
    expect(stepComplete(picked, 2, null)).toBe(false);
    expect(stepComplete(picked, 2, { version: "v1-empty", entries: [] })).toBe(false);
    expect(stepComplete({ cropPurposeIds: [retired] }, 2, catalogue)).toBe(false);
    expect(stepComplete({}, 2, catalogue)).toBe(false);
    expect(stepComplete({ cropPurposeIds: [retired, listed] }, 2, catalogue)).toBe(true);
  });

  it("page 3 needs a water answer", () => {
    expect(stepComplete({}, 3, catalogue)).toBe(false);
    expect(stepComplete({ water: "unsure" }, 3, catalogue)).toBe(true);
  });
});

describe("classify: paths decide pages and words, never message text", () => {
  const message = "any words at all";
  const draft = withEntries([crop("a", 10, 40), crop("b", 300, 365), fallow("c", 400, 410)], { ...complete, cropPurposeIds: [retired, listed] });

  it("[I3] [] and [\"schemaVersion\"] go to page null (summary only), kind unreadable", () => {
    for (const path of [[], ["schemaVersion"], ["priority"]]) {
      expect(classify({ path, message }, draft)).toEqual({ kind: "unreadable", page: null, path, entryId: null, cropId: null });
    }
  });

  it("[D3] [\"field\",\"ring\"] from the server (self-intersection) goes to page 1 as field_shape", () => {
    expect(classify({ path: ["field", "ring"], message: "Field boundary must not intersect itself." }, draft)).toMatchObject({ kind: "field_shape", page: 1 });
  });

  it("[E5] [\"cropPurposeIds\", 0] from the server goes to page 2 as crop_not_listed with cropId = draft.cropPurposeIds[0]", () => {
    expect(classify({ path: ["cropPurposeIds", 0], message }, draft)).toEqual({ kind: "crop_not_listed", page: 2, path: ["cropPurposeIds", 0], entryId: null, cropId: retired });
  });

  it("[\"cropPurposeIds\"] goes to page 2 as crops_duplicate", () => {
    const duplicated: Draft = { ...complete, cropPurposeIds: [listed, listed] };
    expect(classify({ path: ["cropPurposeIds"], message }, duplicated)).toMatchObject({ kind: "crops_duplicate", page: 2 });
    expect(classify({ path: ["cropPurposeIds"], message }, {})).toMatchObject({ kind: "crops_missing", page: 2 });
  });

  it("[I4] [\"history\",\"entries\",1] on an entry outside the window is entry_outside; on an inside entry it is entry_overlap, with that entry's id", () => {
    expect(classify({ path: ["history", "entries", 1], message }, draft)).toMatchObject({ kind: "entry_outside", page: 4, entryId: "b" });
    expect(classify({ path: ["history", "entries", 0], message }, draft)).toMatchObject({ kind: "entry_overlap", page: 4, entryId: "a" });
    const inverted = withEntries([{ ...crop("z", 50, 40) }]);
    expect(classify({ path: ["history", "entries", 0], message }, inverted)).toMatchObject({ kind: "entry_outside", entryId: "z" });
  });

  it("[\"history\",\"entries\",1,\"id\"] is entry_id and carries the entry's id", () => {
    expect(classify({ path: ["history", "entries", 1, "id"], message }, draft)).toMatchObject({ kind: "entry_id", page: 4, entryId: "b" });
    expect(classify({ path: ["history", "entries", 0, "crop", "label"], message }, draft)).toMatchObject({ kind: "entry_name", entryId: "a" });
  });

  it("an unknown path under a known key is kind other on that key's page, with no developer message", () => {
    expect(classify({ path: ["history", "entries", 0, "plantedPrecision"], message }, draft)).toEqual({
      kind: "other", page: 4, path: ["history", "entries", 0, "plantedPrecision"], entryId: "a", cropId: null,
    });
    expect(classify({ path: ["history", "entries", 9], message }, draft)).toMatchObject({ kind: "other", page: 4, entryId: null });
    expect(classify({ path: ["water", "extra"], message }, draft)).toMatchObject({ kind: "water_missing", page: 3 });
    expect(classify({ path: ["history"], message }, {})).toMatchObject({ kind: "history_missing", page: 4 });
  });

  it("[I4] index i resolves to the i-th entry of the sorted draft, which is the lane order on screen", () => {
    const contained = withEntries([crop("outer", 10, 100), crop("inner", 20, 30)]);
    const contract = farmInputSchema.safeParse({ schemaVersion: 1, ...contained });
    const paths = contract.success ? [] : contract.error.issues.map(issue => issue.path);
    expect(paths).toEqual([["history", "entries", 1]]);
    expect(blockedIssues(contained)).toEqual([{ kind: "entry_overlap", page: 4, path: ["history", "entries", 1], entryId: "inner", cropId: null }]);
  });

  it("[I2] pageOf maps field to 1, cropPurposeIds to 2, water to 3, planningStart and history to 4, anything else to null", () => {
    expect([["field", "ring"], ["cropPurposeIds", 0], ["water"], ["planningStart"], ["history", "entries", 2], [], ["schemaVersion"]].map(pageOf))
      .toEqual([1, 2, 3, 4, 4, null, null]);
  });

  it("orderIssues puts the lowest page first, summary-only issues last, and entries in lane order", () => {
    const issue = (page: PageIssue["page"], path: PageIssue["path"]): PageIssue => ({ kind: "other", page, path, entryId: null, cropId: null });
    const ordered = orderIssues([issue(null, []), issue(4, ["history", "entries", 10]), issue(4, ["history", "entries", 2]), issue(2, ["cropPurposeIds"]), issue(4, ["history"])]);
    expect(ordered.map(item => [item.page, ...item.path])).toEqual([
      [2, "cropPurposeIds"], [4, "history"], [4, "history", "entries", 2], [4, "history", "entries", 10], [null],
    ]);
  });
});

describe("live entry issues", () => {
  it("[I4] liveEntryIssues flags exactly the bars farmInputSchema flags on history.entries.i, by id and kind, before Make my plan", () => {
    const layouts: readonly (readonly Entry[])[] = [
      [crop("a", -5, 10)],
      [crop("a", 300, 365)],
      [fallow("a", 300, 366)],
      [crop("a", 50, 40)],
      [crop("a", 10, 20), crop("b", 21, 30)],
      [crop("a", 10, 20), crop("b", 20, 30)],
      [crop("a", 10, 20), fallow("b", 21, 30), crop("c", 30, 40)],
      [fallow("a", 10, 20), crop("b", 19, 30)],
      [crop("a", 10, 100), crop("b", 20, 30), crop("c", 40, 50)],
      [crop("a", 10, 20), crop("b", 15, 400)],
    ];
    for (const entries of layouts) {
      const draft = withEntries(entries);
      const contract = farmInputSchema.safeParse({ schemaVersion: 1, ...draft });
      const flagged = contract.success ? [] : contract.error.issues.flatMap(issue => (issue.path.length === 3 && typeof issue.path[2] === "number" ? [issue.path[2]] : []));
      const expected = [...new Set(flagged)].sort((p, q) => p - q).map(index => {
        const issue = classify({ path: ["history", "entries", index], message: "" }, draft);
        return [issue.entryId, issue.kind];
      });
      expect(liveEntryIssues(draft).map(issue => [issue.entryId, issue.kind]), JSON.stringify(entries)).toEqual(expected);
    }
    expect(liveEntryIssues({})).toEqual([]);
  });
});

describe("pinned server issues", () => {
  it("[J3] a pinned crops issue disappears once cropPurposeIds changes and stays while only water changes", () => {
    const sent: Draft = { ...complete, cropPurposeIds: [retired] };
    const pinned = pin(classify({ path: ["cropPurposeIds", 0], message: "Not in the current catalogue." }, sent), sent);
    expect(stillPinned(pinned, { ...sent, water: "unsure" })).toBe(true);
    expect(stillPinned(pinned, { ...sent, cropPurposeIds: [listed] })).toBe(false);
  });

  it("a page-null issue disappears after any answer changes", () => {
    const pinned = pin(classify({ path: [], message: "Malformed body." }, complete), complete);
    expect(stillPinned(pinned, complete)).toBe(true);
    expect(stillPinned(pinned, { ...complete, water: "unsure" })).toBe(false);
  });
});
