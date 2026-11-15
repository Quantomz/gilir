// Node environment. Farmer-facing words.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { farmInputSchema, parseCropPurposeId, parseIsoDate, serviceFailureSchema } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { syntheticRegistryFixture } from "@/fixtures/science";
import type { IssueKind, PageIssue } from "@/features/onboarding/model/check";
import { formatDay } from "@/features/onboarding/model/dates";
import type { Draft } from "@/features/onboarding/model/draft";
import type { CropEntry, FallowEntry } from "@/features/onboarding/model/timeline";
import {
  crops,
  datesProblemWords,
  failureWords,
  issueWords,
  listWords,
  making,
  namesFrom,
  noteWords,
  water,
  waterLabels,
} from "@/features/onboarding/model/words";

const source = readFileSync("src/features/onboarding/model/words.ts", "utf8");
const listed = parseCropPurposeId("synthetic-crop");
const short = (raw: string) => formatDay(parseIsoDate(raw), "short");

const maize: CropEntry = {
  kind: "crop", id: "crop-1", crop: { kind: "catalogue", cropPurposeId: listed },
  planted: parseIsoDate("2025-07-10"), harvested: parseIsoDate("2025-10-07"), plantedPrecision: "approximate", harvestedPrecision: "exact",
};
const teff: CropEntry = { ...maize, id: "crop-2", crop: { kind: "unsupported", label: "Teff" }, planted: parseIsoDate("2025-12-01"), harvested: parseIsoDate("2026-01-15") };
const empty: FallowEntry = { kind: "fallow", id: "empty-3", start: parseIsoDate("2025-10-08"), endExclusive: parseIsoDate("2025-11-01") };
const draft: Draft = {
  ...inputFixture,
  history: { kind: "recorded", start: parseIsoDate("2025-07-01"), endExclusive: parseIsoDate("2026-07-01"), entries: [maize, empty, teff] },
};
const names = namesFrom(syntheticRegistryFixture.catalogue, draft);

const issue = (kind: IssueKind, extra: Partial<PageIssue> = {}): PageIssue => ({ kind, page: 4, path: [], entryId: null, cropId: null, ...extra });
const everyIssue: Record<IssueKind, PageIssue> = {
  field_missing: issue("field_missing", { page: 1 }),
  field_shape: issue("field_shape", { page: 1 }),
  crops_missing: issue("crops_missing", { page: 2 }),
  crops_duplicate: issue("crops_duplicate", { page: 2 }),
  crop_not_listed: issue("crop_not_listed", { page: 2, cropId: parseCropPurposeId("retired-crop") }),
  water_missing: issue("water_missing", { page: 3 }),
  date_missing: issue("date_missing"),
  history_missing: issue("history_missing"),
  history_window: issue("history_window"),
  entry_outside: issue("entry_outside", { entryId: "crop-2" }),
  entry_overlap: issue("entry_overlap", { entryId: "crop-1" }),
  entry_id: issue("entry_id", { entryId: "crop-1" }),
  entry_name: issue("entry_name", { entryId: "crop-2" }),
  too_large: issue("too_large", { page: null }),
  unreadable: issue("unreadable", { page: null }),
  other: issue("other", { page: 3 }),
};

/** Every message the contract and zod give for some broken inputs. */
function contractMessages(): string[] {
  const broken: unknown[] = [
    {},
    { ...inputFixture, cropPurposeIds: [listed, listed] },
    { ...inputFixture, field: { ...inputFixture.field, ring: inputFixture.field.ring.slice(0, 4) } },
    { ...inputFixture, history: { ...draft.history, entries: [maize, { ...maize, id: "crop-1", planted: parseIsoDate("2025-07-12") }] } },
    { ...inputFixture, planningStart: "2026-02-30", water: "pump" },
  ];
  return broken.flatMap(raw => {
    const parsed = farmInputSchema.safeParse(raw);
    return parsed.success ? [] : parsed.error.issues.map(found => found.message);
  });
}

describe("words", () => {
  it("issueWords has words for every IssueKind and never returns a contract or zod message", () => {
    const messages = contractMessages();
    expect(messages.length).toBeGreaterThan(5);
    const said = Object.values(everyIssue).map(found => issueWords(found, names));
    expect(new Set(said).size).toBe(said.length);
    for (const words of said) {
      expect(words.length).toBeGreaterThan(10);
      expect(messages).not.toContain(words);
      expect(words).not.toMatch(/expected|invalid|undefined|null|_/i);
    }
    expect(issueWords(everyIssue.crop_not_listed, names)).toBe("Retired crop is not on the current crop list. Remove it, then pick again.");
    expect(issueWords(everyIssue.entry_overlap, names)).toBe("Synthetic crop overlaps another entry. One crop at a time: change the dates.");
    expect(issueWords(everyIssue.entry_outside, names)).toBe("Teff is outside the 12 months shown. Change its dates or remove it.");
    const backwards: CropEntry = { ...teff, harvested: parseIsoDate("2025-11-01") };
    const inverted = namesFrom(null, { history: { kind: "recorded", start: parseIsoDate("2025-07-01"), endExclusive: parseIsoDate("2026-07-01"), entries: [backwards] } });
    expect(issueWords(everyIssue.entry_outside, inverted)).toBe("Teff ends before it starts. Change its dates.");
    expect(issueWords(everyIssue.history_missing, names)).toBe("Add last year’s crops, or tap “My field was empty all year” or “I don’t remember”.");
  });

  it("[J4] failureWords has a title and body for every ServiceFailure code and none contains the raw code text", () => {
    for (const code of serviceFailureSchema.unwrap().shape.code.options) {
      const { title, body } = failureWords[code];
      expect(title.length).toBeGreaterThan(10);
      expect(body.length).toBeGreaterThan(10);
      expect(`${title} ${body}`).not.toContain(code);
      expect(`${title} ${body}`).not.toMatch(/_|TF-|helpline/);
    }
  });

  it("[A5] no word anywhere in words.ts contains priority, pest or weed or Threefield", () => {
    expect(source).not.toMatch(/priorit|pest|weed|threefield/i);
    expect(source).not.toMatch(/\bwill\b/i);
  });

  it("[K8] making.steps.calculating is \"Comparing orders and planting dates\" (no \"every\")", () => {
    expect(making.steps.calculating).toBe("Comparing orders and planting dates");
    expect(Object.values(making.steps).join(" ")).not.toMatch(/\bevery\b/i);
  });

  it("[F1] waterLabels are Rain only, Rain + water when it’s dry, I’m not sure (spec wording, typographic apostrophes)", () => {
    expect([waterLabels.rain_only.label, waterLabels.rain_plus_backup.label, waterLabels.unsure.label]).toEqual(["Rain only", "Rain + water when it’s dry", "I’m not sure"]);
    expect(Object.keys(waterLabels)).toEqual(["rain_only", "rain_plus_backup", "unsure"]);
  });

  it("[F3] the water lead says the plan uses rain alone and backup water does not change it", () => {
    expect(water.lead).toBe("We plan with rain alone. Water from other sources is extra protection and doesn’t change the plan.");
  });

  it("[K2] making.announce gives one sentence per state: Step 1 of 3, Step 2 of 3, Step 3 of 3", () => {
    expect([making.announce("queued"), making.announce("fetching"), making.announce("calculating")]).toEqual([
      "Step 1 of 3: Waiting for a free place in line.",
      "Step 2 of 3: Getting NASA weather records for your area.",
      "Step 3 of 3: Comparing orders and planting dates.",
    ]);
  });

  it("no word contains a long dash character", () => {
    expect(source).not.toMatch(/[\u2013\u2014]/);
  });

  it("apostrophes are typographic everywhere a farmer reads them", () => {
    const strings = [...source.matchAll(/"([^"\n]*)"|`([^`\n]*)`/g)].map(match => match[1] ?? match[2]);
    expect(strings.filter(text => /[a-z]'[a-z]/i.test(text))).toEqual([]);
  });
});

describe("edit notes", () => {
  it("a removal is a toast with Undo; a new bar and a stopped drag are said politely, naming the bar", () => {
    expect(noteWords({ kind: "cropRemoved", id: listed, undo: { kind: "restoreCrops", ids: [listed] } }, names))
      .toEqual({ text: "Synthetic crop removed", undo: true, polite: false });
    expect(noteWords({ kind: "entryAdded", entryId: "crop-1" }, names))
      .toEqual({ text: `Synthetic crop added. Planted about ${short("2025-07-10")}, harvested ${short("2025-10-07")}.`, undo: false, polite: true });
    expect(noteWords({ kind: "stepped", entryId: "crop-1", stop: { kind: "overlap", with: teff } }, names))
      .toEqual({ text: "Synthetic crop can’t overlap teff. One crop at a time.", undo: false, polite: true });
    expect(noteWords({ kind: "stepped", entryId: "crop-2", stop: { kind: "overlap", with: empty } }, names)?.text).toBe("Teff can’t overlap the empty time.");
    expect(noteWords({ kind: "stepped", entryId: "crop-1", stop: { kind: "edge" } }, names)?.text).toBe("Synthetic crop stays inside the 12 months shown.");
    expect(noteWords({ kind: "stepped", entryId: "crop-1", stop: null }, names)).toBeNull();
  });

  it("empty times read with their last empty day, and Undo toasts say what changed", () => {
    const undo = { kind: "restoreHistory", history: null } as const;
    expect(noteWords({ kind: "markedEmpty", entry: empty, undo }, names)?.text).toBe(`Marked as empty: ${short("2025-10-08")} to ${short("2025-10-31")}`);
    expect(noteWords({ kind: "markedUnsure", entry: empty, undo }, names)?.text).toBe(`Marked as not sure again: ${short("2025-10-08")} to ${short("2025-10-31")}`);
    expect(noteWords({ kind: "setAside", choice: "skipped", undo }, names)).toEqual({ text: "Last year’s entries are set aside", undo: true, polite: false });
    expect(noteWords({ kind: "setAside", choice: "empty", undo }, names)?.text).toBe("Marked as empty all year");
    expect(noteWords({ kind: "yearFull" }, names)).toEqual({ text: "The 12 months are full. Change the dates of a crop first.", undo: false, polite: false });
    expect(noteWords({ kind: "cropLimit" }, names)?.text).toBe("You can pick up to 12 crops. Remove one first.");
    expect(noteWords({ kind: "entryLimit" }, names)?.text).toBe("You can add up to 64 entries. Remove one first.");
    expect(noteWords({ kind: "listedInstead", id: listed, entryId: "crop-1" }, names)?.text).toBe("Synthetic crop is on our list, so it was added from the list.");
    expect(noteWords({ kind: "needDate" }, names)).toBeNull();
  });

  it("the date sheet's problems name the other bar and its days", () => {
    expect(datesProblemWords({ kind: "overlap", with: maize }, names))
      .toBe(`This overlaps your synthetic crop (${short("2025-07-10")} to ${short("2025-10-07")}). One crop at a time: choose other dates.`);
    expect(datesProblemWords({ kind: "overlap", with: empty }, names)).toMatch(/^This overlaps the empty time \(/);
    expect(datesProblemWords({ kind: "window", first: parseIsoDate("2025-07-01"), last: parseIsoDate("2026-06-30") }, names))
      .toBe(`Choose dates from ${short("2025-07-01")} to ${short("2026-06-30")}.`);
    expect(datesProblemWords({ kind: "nameLong" }, names)).toBe("Use a shorter name, up to 80 letters.");
  });
});

describe("names and lists", () => {
  it("a crop missing from the list reads as its id in words, and an empty time has a name", () => {
    const unloaded = namesFrom(null, draft);
    expect(unloaded.crop("sweet-maize")).toBe("Sweet maize");
    expect(unloaded.crop(null)).toBe("A crop");
    expect(unloaded.entry(empty)).toBe("The empty time");
    expect(unloaded.entryById("missing")).toBeNull();
  });

  it("listWords joins with commas and a final and", () => {
    expect([listWords([]), listWords(["rice"]), listWords(["rice", "maize"]), listWords(["rice", "maize", "beans"])])
      .toEqual(["", "rice", "rice and maize", "rice, maize and beans"]);
  });

  it("the crop filter words say how many crops show and when nothing matches", () => {
    expect(crops.filterCount(3, 40)).toBe("3 of 40 crops shown");
    expect(crops.filterNone(" rice ")).toBe("No crop on the list matches “rice”.");
  });
});
