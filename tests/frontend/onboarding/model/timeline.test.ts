// Node environment. The history editor's geometry, checked against the contract's own farmInputSchema.
import { afterEach, describe, expect, it, vi } from "vitest";
import { farmInputSchema, parseIsoDate } from "@/contracts";
import type { IsoDate } from "@/contracts";
import { inputFixture } from "@/fixtures/input";
import { addDays, daysBetween } from "@/features/onboarding/model/dates";
import { policy } from "@/features/onboarding/model/policy";
import {
  coverageFor,
  dayAtPointer,
  gapsOf,
  isEmptyAllYear,
  monthBands,
  moveWindow,
  nextEntryId,
  placeNew,
  placementOf,
  spanOf,
  stepEntry,
} from "@/features/onboarding/model/timeline";
import type { CropEntry, End, Entry, FallowEntry, RecordedHistory } from "@/features/onboarding/model/timeline";

afterEach(() => {
  vi.unstubAllGlobals();
});

// inputFixture's field-ready date is 2026-07-01, so its 12 months are [2025-07-01, 2026-07-01), 365 days.
const coverage = coverageFor(inputFixture.planningStart);
const day = (n: number) => addDays(coverage.start, n);
const dayOf = (date: IsoDate) => daysBetween(coverage.start, date);

function crop(id: string, planted: number, harvested: number): CropEntry {
  return {
    kind: "crop",
    id,
    crop: { kind: "unsupported", label: "Cassava" },
    planted: day(planted),
    harvested: day(harvested),
    plantedPrecision: "exact",
    harvestedPrecision: "exact",
  };
}

function fallow(id: string, start: number, endExclusive: number): FallowEntry {
  return { kind: "fallow", id, start: day(start), endExclusive: day(endExclusive) };
}

function recorded(entries: readonly Entry[]): RecordedHistory {
  return { kind: "recorded", start: coverage.start, endExclusive: coverage.endExclusive, entries };
}

/** The issue paths farmInputSchema reports for this history on an otherwise valid FarmInput. */
function contractIssues(entries: readonly Entry[]): string[] {
  const parsed = farmInputSchema.safeParse({ ...inputFixture, history: recorded(entries) });
  return parsed.success ? [] : parsed.error.issues.map(issue => issue.path.join("."));
}

/** The dates a one-day step of one end should produce, written straight from the contract's date fields. */
function shifted(entry: Entry, end: End, by: number): Entry {
  const moves = (part: "first" | "last") => end === "move" || (part === "first" ? end === "start" : end === "end");
  if (entry.kind === "crop") {
    return {
      ...entry,
      planted: moves("first") ? addDays(entry.planted, by) : entry.planted,
      harvested: moves("last") ? addDays(entry.harvested, by) : entry.harvested,
    };
  }
  return {
    ...entry,
    start: moves("first") ? addDays(entry.start, by) : entry.start,
    endExclusive: moves("last") ? addDays(entry.endExclusive, by) : entry.endExclusive,
  };
}

const byId = (entries: readonly Entry[]) => [...entries].sort((p, q) => (p.id < q.id ? -1 : 1));

describe("coverage and spans", () => {
  it("[H2] coverageFor(2027-03-01) is [2026-03-01, 2027-03-01) with 365 days", () => {
    expect(coverageFor(parseIsoDate("2027-03-01"))).toEqual({ start: "2026-03-01", endExclusive: "2027-03-01", days: 365 });
  });

  it("[H2] coverageFor(2028-02-29) starts 2027-02-28 and has 366 days", () => {
    expect(coverageFor(parseIsoDate("2028-02-29"))).toEqual({ start: "2027-02-28", endExclusive: "2028-02-29", days: 366 });
  });

  it("[H7] a crop planted and harvested on day 0 spans [0, 1): a same-day harvest is one day in the field", () => {
    expect(spanOf(crop("crop-1", 0, 0), coverage)).toEqual({ a: 0, b: 1 });
    expect(placementOf(crop("crop-1", 0, 0), coverage)).toMatchObject({ outside: false, inverted: false });
  });

  it("a fallow [2025-07-05, 2025-08-01) spans [4, 31): the exclusive end is not a day of the field", () => {
    const empty: FallowEntry = {
      kind: "fallow",
      id: "empty-1",
      start: parseIsoDate("2025-07-05"),
      endExclusive: parseIsoDate("2025-08-01"),
    };
    expect(spanOf(empty, coverage)).toEqual({ a: 4, b: 31 });
  });

  it("[H14] placementOf flags a crop harvested on planningStart as outside, and draws it cut at the window's end", () => {
    expect(placementOf(crop("crop-1", 300, 365), coverage)).toEqual({
      visible: { a: 300, b: 365 },
      cutStart: false,
      cutEnd: true,
      outside: true,
      inverted: false,
    });
    expect(placementOf(crop("crop-1", 300, 364), coverage)).toMatchObject({ outside: false, cutEnd: false });
    expect(placementOf(fallow("empty-1", 300, 365), coverage)).toMatchObject({ outside: false, cutEnd: false });
    expect(placementOf(crop("crop-1", -20, -5), coverage)).toMatchObject({ visible: null, outside: true });
  });
});

describe("agreement with the contract", () => {
  const layouts: readonly { name: string; entries: readonly Entry[]; outside: number[]; overlap: number[] }[] = [
    { name: "crop then crop on the harvest day", entries: [crop("a", 10, 20), crop("b", 20, 30)], outside: [], overlap: [1] },
    { name: "crop then crop the next day", entries: [crop("a", 10, 20), crop("b", 21, 30)], outside: [], overlap: [] },
    { name: "fallow then crop on its exclusive end", entries: [fallow("a", 10, 20), crop("b", 20, 30)], outside: [], overlap: [] },
    { name: "crop then fallow on the harvest day", entries: [crop("a", 10, 20), fallow("b", 20, 30)], outside: [], overlap: [1] },
    { name: "harvest on endExclusive", entries: [crop("a", 300, 365)], outside: [0], overlap: [] },
    { name: "one-day bar", entries: [crop("a", 0, 0)], outside: [], overlap: [] },
    { name: "contained bar", entries: [crop("a", 10, 100), crop("b", 20, 30)], outside: [], overlap: [1] },
    { name: "outside start", entries: [crop("a", -5, 10)], outside: [0], overlap: [] },
    { name: "outside end", entries: [fallow("a", 300, 366)], outside: [0], overlap: [] },
  ];

  it("[H13] for nine touching layouts (crop then crop same day, next day; fallow then crop same day; crop then fallow same day; harvest on endExclusive; one-day bar; contained bar; outside start; outside end) placementOf, span overlap and stepEntry limits agree with farmInputSchema's history.entries issues", () => {
    for (const layout of layouts) {
      const flagged = [...layout.outside, ...layout.overlap].sort();
      expect(contractIssues(layout.entries), layout.name).toEqual(flagged.map(i => `history.entries.${i}`));

      const outside = layout.entries.flatMap((entry, i) => {
        const placed = placementOf(entry, coverage);
        return placed.outside || placed.inverted ? [i] : [];
      });
      expect(outside, layout.name).toEqual(layout.outside);

      const spans = layout.entries.map(entry => spanOf(entry, coverage));
      const overlap = spans.flatMap((span, i) =>
        spans.slice(0, i).some(earlier => Math.max(span.a, earlier.a) < Math.min(span.b, earlier.b)) ? [i] : []);
      expect(overlap, layout.name).toEqual(layout.overlap);

      if (flagged.length > 0) continue;
      for (const entry of layout.entries) {
        for (const end of ["start", "end", "move"] as const) {
          for (const by of [-1, 1]) {
            const from = end === "end"
              ? entry.kind === "crop" ? dayOf(entry.harvested) : dayOf(entry.endExclusive) - 1
              : dayOf(entry.kind === "crop" ? entry.planted : entry.start);
            const wanted = layout.entries.map(other => (other === entry ? shifted(entry, end, by) : other));
            const accepted = contractIssues(wanted).length === 0;
            const result = stepEntry(layout.entries, entry.id, end, from + by, coverage);
            const label = `${layout.name}: ${entry.id} ${end} ${by}`;
            expect(result.entries !== layout.entries, label).toBe(accepted);
            if (accepted) expect(byId(result.entries), label).toEqual(byId(wanted));
            else expect(result.stop, label).not.toBeNull();
          }
        }
      }
    }
  });
});

describe("gapsOf: gaps stay unknown and are derived", () => {
  it("[H9] no entries gives one gap over the whole window", () => {
    expect(gapsOf([], coverage)).toEqual([{ a: 0, b: 365 }]);
  });

  it("[H9] crop [10, 40) and fallow [40, 60) leave gaps [0, 10) and [60, N)", () => {
    expect(gapsOf([crop("crop-1", 10, 39), fallow("empty-1", 40, 60)], coverage)).toEqual([{ a: 0, b: 10 }, { a: 60, b: 365 }]);
  });

  it("[H9] a crop harvested on day 39 and a crop planted on day 40 leave no gap between them", () => {
    expect(gapsOf([crop("crop-2", 40, 80), crop("crop-1", 10, 39)], coverage)).toEqual([{ a: 0, b: 10 }, { a: 81, b: 365 }]);
  });
});

describe("stepEntry: drag and keyboard share one rule", () => {
  it("[H4] moving the end handle +1 day adds a day to harvested and keeps planted", () => {
    const { entries, stop } = stepEntry([crop("crop-1", 10, 20)], "crop-1", "end", 21, coverage);
    expect(entries).toEqual([crop("crop-1", 10, 21)]);
    expect(stop).toBeNull();
  });

  it("[H4] moving the start handle past the end stops with { kind: \"short\" } and keeps one day", () => {
    const { entries, stop } = stepEntry([crop("crop-1", 10, 20)], "crop-1", "start", 30, coverage);
    expect(entries).toEqual([crop("crop-1", 20, 20)]);
    expect(stop).toEqual({ kind: "short" });
  });

  it("[H14] moving the end handle onto planningStart stops with { kind: \"edge\" } at endExclusive - 1", () => {
    const { entries, stop } = stepEntry([crop("crop-1", 300, 360)], "crop-1", "end", 365, coverage);
    expect(entries).toEqual([crop("crop-1", 300, 364)]);
    expect(entries[0]).toMatchObject({ harvested: addDays(coverage.endExclusive, -1) });
    expect(stop).toEqual({ kind: "edge" });
  });

  it("[H13] moving into the next crop stops one day before it with { kind: \"overlap\", with: thatCrop }", () => {
    const next = crop("crop-2", 30, 40);
    const { entries, stop } = stepEntry([crop("crop-1", 10, 20), next], "crop-1", "end", 35, coverage);
    expect(entries).toEqual([crop("crop-1", 10, 29), next]);
    expect(stop).toEqual({ kind: "overlap", with: next });
  });

  it("[H13] a crop may end the day before a fallow starts, and a crop may start on a fallow's exclusive end", () => {
    const empty = fallow("empty-1", 50, 60);
    const before = stepEntry([crop("crop-1", 10, 20), empty], "crop-1", "end", 55, coverage);
    expect(before.entries).toEqual([crop("crop-1", 10, 49), empty]);
    expect(before.stop).toEqual({ kind: "overlap", with: empty });

    const after = stepEntry([empty, crop("crop-2", 70, 80)], "crop-2", "start", 40, coverage);
    expect(after.entries).toEqual([empty, crop("crop-2", 60, 80)]);
    expect(after.stop).toEqual({ kind: "overlap", with: empty });
  });

  it("[H3] moving the whole bar keeps its length and stops at the window edge", () => {
    const right = stepEntry([crop("crop-1", 10, 20)], "crop-1", "move", 400, coverage);
    expect(right.entries).toEqual([crop("crop-1", 354, 364)]);
    expect(right.stop).toEqual({ kind: "edge" });

    const left = stepEntry([crop("crop-1", 10, 20)], "crop-1", "move", -50, coverage);
    expect(left.entries).toEqual([crop("crop-1", 0, 10)]);
    expect(left.stop).toEqual({ kind: "edge" });
  });

  it("[H15] a bar already outside the window may move back in but never further out", () => {
    const outside = [crop("crop-1", -10, 5)];
    const back = stepEntry(outside, "crop-1", "move", -7, coverage);
    expect(back.entries).toEqual([crop("crop-1", -7, 8)]);
    expect(back.stop).toBeNull();

    for (const [end, target] of [["move", -11], ["start", -11]] as const) {
      const further = stepEntry(outside, "crop-1", end, target, coverage);
      expect(further.entries).toBe(outside);
      expect(further.stop).toEqual({ kind: "edge" });
    }
  });

  it("stepping to the current day returns the same entries array and no stop (idempotent)", () => {
    const entries = [crop("crop-1", 10, 20), fallow("empty-1", 30, 40)];
    for (const [id, end, target] of [["crop-1", "start", 10], ["crop-1", "end", 20], ["crop-1", "move", 10], ["empty-1", "end", 39]] as const) {
      const result = stepEntry(entries, id, end, target, coverage);
      expect(result.entries).toBe(entries);
      expect(result.stop).toBeNull();
    }
  });

  it("after a move the entries are still sorted by start day (draft invariant I2)", () => {
    const inside = crop("crop-2", 20, 30);
    const { entries } = stepEntry([crop("crop-1", 10, 100), inside], "crop-1", "start", 25, coverage);
    expect(entries).toEqual([inside, crop("crop-1", 25, 100)]);
  });
});

describe("placeNew", () => {
  it("[H3] an empty year places a 90-day crop at day 0 (policy.history.newCropDays)", () => {
    expect(placeNew([], coverage, policy.history.newCropDays, null)).toEqual({ a: 0, b: 90 });
  });

  it("[H3] with a crop at [0, 100) the next crop goes at day 100", () => {
    expect(placeNew([crop("crop-1", 0, 99)], coverage, 90, null)).toEqual({ a: 100, b: 190 });
  });

  it("[H3] a tapped gap [200, 230) places the crop inside it, clipped to 30 days", () => {
    expect(placeNew([], coverage, 90, { a: 200, b: 230 })).toEqual({ a: 200, b: 230 });
  });

  it("[H3] a year with only a 5-day gap returns null (the year is full); a 7-day gap is used", () => {
    expect(placeNew([crop("crop-1", 0, 359)], coverage, 90, null)).toBeNull();
    expect(placeNew([crop("crop-1", 0, 357)], coverage, 90, null)).toEqual({ a: 358, b: 365 });
  });
});

describe("moveWindow", () => {
  const later = parseIsoDate("2026-08-01");

  it("[H15] a new planningStart moves start and endExclusive and keeps every entry unchanged", () => {
    const entries = [crop("crop-1", 10, 20), fallow("empty-1", 100, 120)];
    const moved = moveWindow(recorded(entries), later);
    expect(moved).toEqual({ kind: "recorded", start: "2025-08-01", endExclusive: "2026-08-01", entries });
    expect(placementOf(entries[0], coverageFor(later)).outside).toBe(true);
  });

  it("[H15] a whole-year empty record follows the new window", () => {
    const moved = moveWindow(recorded([fallow("empty-1", 0, 365)]), later);
    expect(moved).toEqual({
      kind: "recorded",
      start: "2025-08-01",
      endExclusive: "2026-08-01",
      entries: [{ kind: "fallow", id: "empty-1", start: "2025-08-01", endExclusive: "2026-08-01" }],
    });
    expect(moved.kind === "recorded" && isEmptyAllYear(moved)).toBe(true);
  });

  it("[H1] a skipped history is returned unchanged", () => {
    const skipped = { kind: "skipped" } as const;
    expect(moveWindow(skipped, later)).toBe(skipped);
  });
});

describe("month bands", () => {
  it("a window starting on the 1st has 12 bands; one starting mid-month has 13 that tile the year", () => {
    const march = monthBands(coverageFor(parseIsoDate("2027-03-01")));
    expect(march).toHaveLength(12);
    expect(march[0]).toEqual({ span: { a: 0, b: 31 }, month0: 2, year: 2026 });
    expect(march.at(-1)).toEqual({ span: { a: 337, b: 365 }, month0: 1, year: 2027 });

    const july = monthBands(coverageFor(parseIsoDate("2026-07-15")));
    expect(july).toHaveLength(13);
    expect(july[0]).toEqual({ span: { a: 0, b: 17 }, month0: 6, year: 2025 });
    expect(july.at(-1)).toEqual({ span: { a: 351, b: 365 }, month0: 6, year: 2026 });
    expect(july.every((band, i) => band.span.a === (i === 0 ? 0 : july[i - 1].span.b))).toBe(true);
  });
});

describe("pointer to day", () => {
  it("[H4] dayAtPointer maps the track's left edge to day 0, its right edge to day N - 1, and clamps outside the track", () => {
    const track = { left: 100, width: 730 };
    expect(dayAtPointer(100, track, 365)).toBe(0);
    expect(dayAtPointer(100 + 2 * 10, track, 365)).toBe(10);
    expect(dayAtPointer(830, track, 365)).toBe(364);
    expect(dayAtPointer(40, track, 365)).toBe(0);
    expect(dayAtPointer(2000, track, 365)).toBe(364);
  });

  it("nextEntryId gives crop-N and empty-N one above the largest N in use, with no crypto.randomUUID", () => {
    vi.stubGlobal("crypto", {});
    const entries = [crop("crop-2", 10, 20), fallow("empty-5", 30, 40), crop("synthetic-previous", 50, 60)];
    expect(nextEntryId(entries, "crop")).toBe("crop-6");
    expect(nextEntryId(entries, "empty")).toBe("empty-6");
    expect(nextEntryId([], "crop")).toBe("crop-1");
    expect(nextEntryId([crop("synthetic-previous", 0, 1)], "empty")).toBe("empty-1");
  });
});
