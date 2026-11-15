import { describe, expect, it } from "vitest";
import { parseCropPurposeId, parseIsoDate } from "@/contracts/common";
import type { CropPurposeId } from "@/contracts/common";
import { completedSnapshotSchema } from "@/contracts/result";
import type { CompletedSnapshot } from "@/contracts/result";
import { compose } from "@/client/pdf/compose";
import type { Item, PdfDocument, PlanDocument, StatusDocument, Timeline, TimelineBlock } from "@/client/pdf/model";
import { pdfText } from "@/client/pdf/text";
import { findCalendar } from "@/engine";
import { completedSnapshotsByState } from "@/fixtures/results";
import { syntheticLabel } from "@/fixtures/science";
import { readRegistryRelease, resolveRegistry } from "@/registry";
import { britishReader, frozen, savedLabels, unfrozen, variant, variantNames } from "./support/variants";

function calendarOf(doc: PdfDocument): { readonly timeline: Timeline; readonly rows: readonly Item[] } {
  if (doc.kind !== "plan") throw new Error("a status report has no calendar");
  for (const section of doc.sections) {
    const drawing = section.blocks.find((block): block is TimelineBlock => block.kind === "timeline");
    const rows = section.blocks.find(block => block.kind === "list" && block.marker === "number");
    if (drawing && rows?.kind === "list") return { timeline: drawing.timeline, rows: rows.items };
  }
  throw new Error("no calendar section");
}

function expectWholeYear(timeline: Timeline): void {
  let next = 0;
  for (const bar of timeline.bars) {
    expect(bar.from).toBe(next);
    expect(bar.days).toBeGreaterThan(0);
    next = bar.from + bar.days;
  }
  expect(next).toBe(timeline.days);
}

function textOf(doc: PdfDocument): string[] {
  const lines: string[] = [doc.title, doc.head.brand, doc.head.title, doc.head.place, ...doc.head.lines];
  if (doc.head.synthetic) lines.push(doc.head.synthetic);
  lines.push(doc.head.status.label, doc.head.status.text);
  for (const section of doc.sections) {
    lines.push(section.heading);
    for (const block of section.blocks) {
      if (block.kind === "text") lines.push(block.text);
      else if (block.kind === "list") for (const item of block.items) lines.push(...(item.head ? [item.head] : []), ...item.lines);
      else if (block.kind === "table") lines.push(block.columns.join(" "), ...block.rows.map(row => row.join(" ")));
      else lines.push(...block.timeline.months.flatMap(month => month.label ?? []), ...block.timeline.legend.map(entry => entry.label));
    }
  }
  return [...lines, ...doc.closing, doc.footer.left];
}

const plan = () => compose(completedSnapshotsByState.plan, britishReader);
const composed = (state: keyof typeof completedSnapshotsByState) => compose(completedSnapshotsByState[state], britishReader);
const noPlanStates = ["insufficient_data", "no_calendar_fit", "search_incomplete", "service_error"] as const;
const statusReport = "This is a status report. No calendar is shown, because no plan was made.";

describe("a status report can't hold a calendar", () => {
  it("a TimelineBlock in a StatusDocument section is a type error (an @ts-expect-error line that breaks the typecheck the day it compiles)", () => {
    const drawing: TimelineBlock = { kind: "timeline", timeline: { days: 365, months: [], years: [], bars: [], legend: [] } };
    const heading = pdfText("When to plant and harvest");
    // @ts-expect-error A status report's sections hold text, lists and tables only.
    const status: StatusDocument["sections"][number] = { heading, blocks: [drawing] };
    const planSection: PlanDocument["sections"][number] = { heading, blocks: [drawing] };
    expect([status.blocks.length, planSection.blocks.length]).toEqual([1, 1]);
  });

  it("compose returns kind status_report for each of the four no-plan fixtures and kind plan for the two plan fixtures", () => {
    expect(composed("plan").kind).toBe("plan");
    expect(composed("plan_with_warnings").kind).toBe("plan");
    for (const state of noPlanStates) expect(composed(state).kind, state).toBe("status_report");
  });

  it("each no-plan fixture says it is a status report, under the section that says why, with no planting rows, ranking or Get ready", () => {
    const why = { insufficient_data: "What’s missing", no_calendar_fit: "Why they don’t fit", search_incomplete: "Where the search stopped", service_error: "What happened" };
    for (const state of noPlanStates) {
      const doc = composed(state);
      expect(doc.sections[0].heading, state).toBe(why[state]);
      expect(doc.sections[0].blocks.at(-1), state).toEqual({ kind: "text", style: "small", text: statusReport });
      const text = textOf(doc);
      expect(text.filter(line => /^Plant .* · Harvest /.test(line)), state).toEqual([]);
      expect(text, state).not.toContain("Why this plan ranked first");
      expect(text, state).not.toContain("Get ready");
      expect(text, state).not.toContain("When to plant and harvest");
    }
    expect(textOf(plan())).not.toContain(statusReport);
  });
});

describe("what each state says", () => {
  it("the head carries the state's title and its status label word", () => {
    const heads = Object.fromEntries((["plan", "plan_with_warnings", ...noPlanStates] as const).map(state => [state, composed(state).head]));
    expect(Object.values(heads).map(head => [head.title, head.status.label])).toEqual([
      ["Keep last year’s rotation", "This order passed every check we could run."],
      ["Your plan, with warnings", "With warnings."],
      ["We can’t make a plan yet", "No plan yet."],
      ["Your crops don’t all fit in one year", "No plan."],
      ["We couldn’t finish the search", "No plan yet."],
      ["Something went wrong while making your plan", "No new plan."],
    ]);
    expect(heads.plan_with_warnings.status.text).toBe("In past seasons, rain fell short of what the crops need in about 5 in 10 weeks.");
    expect(heads.no_calendar_fit.status.text).toBe("Together they need at least 366 days; your year has 365.");
  });

  it("every warning keeps its risk words: a flag sits under What we flagged before the calendar, a note under Good to know, each head followed by the snapshot's own message", () => {
    const text = textOf(composed("plan_with_warnings"));
    const flagged = text.indexOf("What we flagged");
    const head = text.indexOf("Rain fell short of what synthetic crop needs in past seasons");
    expect(flagged).toBeGreaterThan(-1);
    expect(text[head + 1]).toBe("Example rainfall warning.");
    expect(head).toBeGreaterThan(flagged);
    expect(head).toBeLessThan(text.indexOf("When to plant and harvest"));
    const note = text.indexOf("The search stopped at its limit");
    expect(text[note + 1]).toBe("Example search stopped at its scoring budget.");
    expect(note).toBeGreaterThan(text.indexOf("Good to know"));
  });

  it("the search limit is disclosed: a plan whose ranking stopped says it is not proven best, and a stopped search says it proves nothing", () => {
    const limited = textOf(composed("plan_with_warnings"));
    expect(limited).toContain("We stopped at our search limit.");
    expect(limited).toContain("This is the best plan we found, not proven to be the best.");
    expect(textOf(plan())).not.toContain("We stopped at our search limit.");
    const stopped = textOf(composed("search_incomplete"));
    expect(stopped).toContain("We stopped after 10 tries at fitting your crops into your year (our limit is 10), before we found an order that fits.");
    expect(stopped).toContain("A stopped search doesn’t show that your crops can’t fit. You can try again, or change your answers.");
  });

  it("service_error: the service's message and No new plan was made., never the failure code", () => {
    const text = textOf(composed("service_error"));
    expect(text).toContain("Example source did not respond.");
    expect(text).toContain("No new plan was made. It wasn’t anything you did.");
    expect(text.join(" ")).not.toMatch(/retrieval_failed|retryable/);
  });

  it("insufficient_data: What’s missing lists result.missing once, and What we couldn’t check leaves out the same gaps", () => {
    const text = textOf(composed("insufficient_data"));
    expect(text.filter(line => line === "Enough complete past seasons of weather")).toHaveLength(1);
    expect(text).not.toContain("What we couldn’t check");
  });

  it("no_calendar_fit: the days needed against the days in the year, and each crop's minimum", () => {
    expect(textOf(composed("no_calendar_fit"))).toContain("Synthetic crop: at least 366 days");
  });

  it("the estimate line says this comparison is approximate too only when a comparison was made", () => {
    const assessed = textOf(plan());
    const notAssessed = textOf(composed("plan_with_warnings"));
    expect(assessed).toContain("Your dates are estimates. You said some of last year’s dates are approximate, so this comparison is approximate too.");
    expect(notAssessed).toContain("Your dates are estimates. You said some of last year’s dates are approximate.");
    expect(notAssessed.join(" ")).not.toContain("approximate too");
  });

  it("not_assessable prints the reasons, then last year as rows in words, with the unlisted crop named as typed", () => {
    const text = textOf(composed("plan_with_warnings"));
    const from = text.indexOf("What you told us about last year (not scored)");
    expect(text.slice(from + 1, from + 7)).toEqual([
      "Synthetic unlisted crop (not on our crop list)", "Planted about 1 Jul 2025 · Harvested about 4 Jul 2025",
      "Field empty, as you said", "5 Jul to 31 Jul 2025 · 27 days",
      "Not sure: nothing recorded", "1 Aug 2025 to 30 Jun 2026 · 334 days",
    ]);
  });

  it("made and synthetic: every document says when the snapshot was made and that its values are synthetic", () => {
    for (const state of ["plan", ...noPlanStates] as const) {
      const doc = composed(state);
      expect(doc.head.lines[1], state).toBe("Made 1 Jul 2026 · Your year: 1 Jul 2026 to 30 Jun 2027");
      expect(doc.footer.synthetic, state).toBe("Synthetic test data only. Values are invented and are not farm advice.");
      expect(doc.title, state).not.toContain("Synthetic example field");
    }
  });
});

describe("the timeline's days", () => {
  it("bars never overlap, stay inside [0, days) and cover every day once; days is 365 for the plan fixture's year", () => {
    const { timeline } = calendarOf(plan());
    expect(timeline.days).toBe(365);
    expectWholeYear(timeline);
  });

  it("a no_crop row after a harvest starts the day after the harvest, and its days equal the tuple's longest_unplanted_gap (361 in the plan fixture)", () => {
    const { timeline, rows } = calendarOf(plan());
    expect(timeline.bars.map(bar => [bar.look, bar.from, bar.days])).toEqual([["crop", 0, 4], ["after_harvest", 4, 1], ["no_crop", 5, 360]]);
    expect(rows.map(row => row.head)).toEqual(["Synthetic crop", "No planned crop"]);
    expect(rows[0].lines).toEqual(["Plant 1 Jul 2026 · Harvest 4 Jul 2026", "4 days in the field. The field is free again on 6 Jul 2026."]);
    expect(rows[1].lines[0]).toBe("5 Jul 2026 to 30 Jun 2027 · 361 days");
    expect(completedSnapshotsByState.plan.result.state === "plan" && completedSnapshotsByState.plan.result.plan.rankingTuple.components[3].value).toBe(361);
  });

  it("every bar with a key points at an existing numbered row, and an after_harvest bar told inside a no_crop row carries that row's number", () => {
    const { timeline, rows } = calendarOf(plan());
    for (const bar of timeline.bars) {
      expect(bar.key).not.toBeNull();
      expect(rows[(bar.key ?? 0) - 1], `bar at day ${bar.from}`).toBeDefined();
    }
    const [, afterHarvest, noCrop] = timeline.bars;
    expect(afterHarvest.key).toBe(noCrop.key);
    expect(rows[(noCrop.key ?? 0) - 1].head).toBe("No planned crop");
  });

  it("days is 366 across 29 February from a mid-month start, and each no-crop row after a harvest is as long as the stretch the ranking counts (leapYear variant)", () => {
    const snapshot = variant("leapYear");
    const { timeline, rows } = calendarOf(compose(snapshot, britishReader));
    expect(timeline.days).toBe(366);
    expectWholeYear(timeline);
    expect(timeline.months.map(month => [month.days, month.label === null])).toEqual([[16, true], [31, false], [30, false], [31, false],
      [31, false], [29, false], [31, false], [30, false], [31, false], [30, false], [31, false], [31, false], [14, true]]);
    const longest = snapshot.result.state === "plan" ? snapshot.result.plan.rankingTuple.components[3].value : -1;
    expect(rows.at(-1)?.lines[0]).toBe(`1 Jul to 14 Sept 2028 · ${longest} days`);
  });

  it("14 plantings of 12 crops each get a numbered row with the crop's name, and bars carry only numbers (manyCrops variant)", () => {
    const { timeline, rows } = calendarOf(compose(variant("manyCrops"), britishReader));
    expectWholeYear(timeline);
    const cropBars = timeline.bars.filter(bar => bar.look === "crop");
    expect(cropBars).toHaveLength(14);
    expect(cropBars.map(bar => rows[(bar.key ?? 0) - 1].head)).toEqual([
      "Pumpkin and winter squash", "Sweet maize sweet corn", "Common bean dry grain", "Rice paddy wet season", "Groundnut peanut",
      "Mung bean", "Sorghum grain", "Pearl millet", "Cassava root", "Sweet potato", "Soybean dry grain", "Cowpea dry grain",
      "Pumpkin and winter squash", "Sweet maize sweet corn",
    ]);
    for (const bar of timeline.bars) expect(Object.keys(bar).sort()).toEqual(["days", "from", "key", "look"]);
  });

  it("a month with fewer than 20 days on the line has no label, and a year label sits at the first month of each calendar year with room", () => {
    const { timeline } = calendarOf(plan());
    expect(timeline.months.map(month => [month.from, month.days])).toEqual([[0, 31], [31, 31], [62, 30], [92, 31], [123, 30], [153, 31],
      [184, 31], [215, 28], [243, 31], [274, 30], [304, 31], [335, 30]]);
    expect(timeline.months.every(month => month.label !== null)).toBe(true);
    expect([timeline.months[0].label, timeline.months[6].label]).toEqual(["Jul", "Jan"]);
    expect(timeline.years).toEqual([{ from: 0, label: "2026" }, { from: 184, label: "2027" }]);
  });
});

describe("the variants: what the fixtures can't show", () => {
  const readers = [britishReader, { locale: "th-TH", timeZone: "Asia/Bangkok" }, { locale: "en-US", timeZone: "America/Chicago" }];

  it("each variant parses with completedSnapshotSchema and stays labelled synthetic with the fixture label", () => {
    expect(variantNames).toHaveLength(15);
    for (const name of variantNames) {
      const snapshot = variant(name);
      expect(completedSnapshotSchema.safeParse(snapshot).success, name).toBe(true);
      expect(snapshot.result.details.provenance, name).toMatchObject({ kind: "synthetic", label: syntheticLabel });
    }
  });

  it("every fixture and variant composes for readers in three locales, and every string it holds is already printable", () => {
    const snapshots = [...Object.values(completedSnapshotsByState), ...variantNames.map(variant)];
    for (const snapshot of snapshots) {
      for (const reader of readers) {
        const unprintable = textOf(compose(snapshot, reader)).filter(line => pdfText(line) !== line);
        expect(unprintable, `${snapshot.id} ${reader.locale}`).toEqual([]);
      }
    }
  });

  it("manyWarnings: each of the 30 messages follows its farmer head with its dates in the reader's form; flags before the calendar, notes under Good to know", () => {
    const snapshot = variant("manyWarnings");
    const text = textOf(compose(snapshot, britishReader));
    const flagged = text.indexOf("What we flagged");
    const notes = text.indexOf("Good to know");
    const calendar = text.indexOf("When to plant and harvest");
    expect(flagged).toBeLessThan(notes);
    expect(notes).toBeLessThan(calendar);
    snapshot.result.details.warnings.forEach((warning, index) => {
      const message = `Synthetic warning ${index + 1}: in the invented season from 15 Jul 2026 to 30 Sept 2026 an invented value crossed an invented limit, so this long message wraps across several lines of the page.`;
      const at = text.indexOf(message);
      expect(at, `warning ${index + 1}`).toBeGreaterThan(-1);
      expect(text[at - 1].length, `warning ${index + 1} head`).toBeGreaterThan(10);
      const flag = ["rainfall_mismatch", "temperature_exposure", "environmental_rule", "rotation_rule"].includes(warning.code);
      expect(flag ? at > flagged && at < notes : at > notes && at < calendar, `warning ${index + 1} section`).toBe(true);
    });
    expect(text).toContain("Rain fell short of what synthetic crop, synthetic second crop and synthetic third crop need in past seasons");
    expect(compose(snapshot, britishReader).head.status.text).toBe("In past seasons, rain fell short of what the crops need in about 7 in 10 weeks, "
      + "temperatures went outside the limits for synthetic crop, synthetic second crop and synthetic third crop on about 82% of checked days in a bad year, "
      + "a published rule flagged synthetic crop, synthetic second crop and synthetic third crop and a crop order rule flagged the plan.");
  });

  it("a Cyrillic place prints Your field, the place-name note and the coordinates; a 240-character label keeps its letters; a Thai unlisted crop prints A crop not on our list", () => {
    const cyrillic = compose(variant("cyrillicLabel"), britishReader).head;
    expect(cyrillic.place).toBe("Your field");
    expect(cyrillic.lines).toContain("The place name uses letters this file can’t show.");
    expect(cyrillic.lines[0]).toBe("Weather point 15.005° N, 100.005° E");
    const long = compose(variant("longLabel"), britishReader).head;
    expect(long.place.startsWith("Synthetic field near Lódz by the long invented river road")).toBe(true);
    expect(long.place.length).toBeGreaterThan(200);
    expect(long.lines).not.toContain("The place name uses letters this file can’t show.");
    const thai = textOf(compose(variant("thaiUnlistedCrop"), britishReader));
    const crop = thai.indexOf("A crop not on our list");
    expect(thai.slice(crop, crop + 3)).toEqual(["A crop not on our list", "Planted about 1 Jul 2025 · Harvested about 4 Jul 2025", "A crop name uses letters this file can’t show."]);
  });

  it("no_calendar_fit by structural exhaustion lists its constraints as the engine wrote them, and how many ways were checked", () => {
    const text = textOf(compose(variant("structuralProof"), britishReader));
    expect(text).toContain("Synthetic crop must be planted between 1 Nov 2026 and 30 Nov 2026 in this invented example.");
    expect(text).toContain("Each invented crop needs at least 200 days in the field.");
    expect(text).toContain("We checked 48,213 ways of placing them.");
    expect(text).toContain(statusReport);
  });

  it("changedBaseline: the verdict, every delta read as it is with Not compared for the unavailable one, and all four change kinds", () => {
    const text = textOf(compose(variant("changedBaseline"), britishReader));
    const from = text.indexOf("Compared with last year");
    expect(text.slice(from, text.indexOf("Get ready"))).toEqual([
      "Compared with last year",
      "The new plan ranked ahead of last year’s rotation.",
      "How they compare",
      "Weeks with less rain than the crops need", "This plan: 50%", "Last year’s rotation: 60%", "Lower with this plan (better)",
      "Days without a planned crop", "This plan: 145 days", "Last year’s rotation: 157 days", "12 days fewer with this plan (better)",
      "Crop families", "This plan: 3", "Last year’s rotation: 2", "1 more with this plan",
      "Shortfall in a bad year", "This plan: 30%", "Last year’s rotation: Not available", "Not compared: One or both comparison values are unavailable.",
      "Bean-family plantings", "This plan: 1", "Last year’s rotation: 1", "The same",
      "Changes from last year",
      "Last year’s dates are moved forward to this year to compare them.",
      "Added: synthetic third crop, 6 Jan to 6 Mar 2027.",
      "Not in the new plan: synthetic old crop, 1 Mar to 9 Apr 2027 in last year’s rotation.",
      "Plant synthetic crop 7 days later: 1 Jul 2026 instead of 24 Jun 2026.",
      "Plant synthetic second crop on the same day, 16 Oct 2026; harvest 24 Dec 2026 instead of 19 Dec 2026.",
      "Synthetic second crop moves from first to second in the order.",
    ]);
  });

  it("the cohort line counts usable seasons, each excluded season prints with its reason, and a missing manifest says so", () => {
    const text = textOf(compose(variant("excludedSeasons"), britishReader));
    expect(text).toContain("Checked against 3 past seasons, Jul 2001 to Jun 2005.");
    expect(text).toContain("Not used: Jul 2002 to Jun 2003. Synthetic gap: 12 days of rain records are missing in this invented season.");
    expect(text).toContain("Engine synthetic-engine, settings synthetic-settings, crop list synthetic-catalogue, rules synthetic-rules, records before 1 Jan 2026.");
    expect(textOf(compose(variant("manifestUnavailable"), britishReader)))
      .toContain("Engine and data versions: not recorded. Synthetic example: the run manifest was not recorded.");
  });

  it("manySources: every source title, section and URL, every climate cell and every weather record ID, as text", () => {
    const snapshot = variant("manySources");
    const text = textOf(compose(snapshot, britishReader)).join("\n");
    const { provenance } = snapshot.result.details;
    for (const source of provenance.sources) {
      expect(text).toContain(source.title);
      expect(text).toContain(source.section.slice(0, -1));
      expect(text).toContain(source.url);
    }
    for (const product of provenance.climateProducts) expect(text).toContain(`grid cell ${product.cellId} (0.5° by 0.625°)`);
    if (provenance.manifest.kind !== "available") throw new Error("manySources keeps its manifest");
    for (const id of provenance.manifest.value.climateSnapshotIds) expect(text).toContain(id);
  });

  it("insufficient_data with monthly insights: a 12-row month table from the planning month, with Not available where a month has no value", () => {
    const doc = compose(variant("monthlyInsights"), britishReader);
    const farm = doc.sections.find(section => section.heading === "What we know about your farm");
    const table = farm?.blocks.find(block => block.kind === "table");
    if (table?.kind !== "table") throw new Error("no month table");
    expect(table.columns).toEqual(["Month", "Usual rain", "Dry year", "Wet year", "Mean temperature"]);
    expect(table.rows).toHaveLength(12);
    expect(table.rows[0]).toEqual(["Jul", "125", "47", "235", "22"]);
    expect(table.rows[8]).toEqual(["Mar", "65", "23", "135", "Not available"]);
    expect(textOf(doc)).toContain("Past seasons: A complete cohort was not assessed in this example. Monthly rain from 2001 to 2020.");
    expect(textOf(compose(completedSnapshotsByState.insufficient_data, britishReader))).not.toContain("What we know about your farm");
  });

  it("manyUnassessed: What’s missing lists the 12 crops once each, and What we couldn’t check keeps only the gap it didn’t list", () => {
    const doc = compose(variant("manyUnassessed"), britishReader);
    const [missing, ...rest] = doc.sections;
    const list = missing.blocks[0];
    expect(list.kind === "list" && list.items.map(item => item.head)).toHaveLength(12);
    const unchecked = rest.find(section => section.heading === "What we couldn’t check");
    expect(unchecked?.blocks).toEqual([{
      kind: "list", marker: "bullet",
      items: [{ head: "Heat and cold limits for pumpkin and winter squash; sweet maize sweet corn", lines: ["No synthetic temperature rule applies to these invented crops."] }],
    }]);
  });
});

type Snapshot = typeof completedSnapshotsByState.plan;
type Recommendation = "kept" | "changed" | "no_recommendation";

function withDetails(snapshot: Snapshot, details: object, input: object = {}): Snapshot {
  return completedSnapshotSchema.parse({
    ...snapshot,
    input: { ...snapshot.input, ...input },
    result: { ...snapshot.result, details: { ...snapshot.result.details, ...details } },
  });
}

const assessedPlanBaseline = completedSnapshotsByState.plan.result.details.baseline;
function withVerdict(snapshot: Snapshot, recommendation: Recommendation, eligible: boolean): Snapshot {
  const own = snapshot.result.details.baseline;
  const baseline = own.kind === "assessed" ? own : { ...assessedPlanBaseline, deltas: [], changes: [] };
  return withDetails(snapshot, { baseline: { ...baseline, recommendation, eligible } });
}

const sourcesOf = (doc: PdfDocument) => {
  const section = doc.sections.find(candidate => candidate.heading === "Sources, period and versions");
  return section?.blocks.flatMap(block => (block.kind === "text" ? [block.text] : [])) ?? [];
};

describe("each sentence is true of the result it prints", () => {
  const comparisonOnly = "Last year’s rotation is shown for comparison only. It can’t be the suggestion, because it doesn’t meet every rule for a plan.";
  const noNewPlan = "Last year’s rotation is shown for comparison only. No new plan was made to compare it with.";

  it("a last-year rotation the engine never ranked (eligible false, changed) is shown for comparison only, never as outranked", () => {
    const unranked = textOf(compose(withVerdict(variant("changedBaseline"), "changed", false), britishReader));
    expect(unranked).toContain(comparisonOnly);
    expect(unranked.join(" ")).not.toContain("ranked ahead");
    expect(textOf(compose(variant("changedBaseline"), britishReader))).toContain("The new plan ranked ahead of last year’s rotation.");
  });

  it("in each of the four no-plan states an eligible rotation is shown because no plan was made, and an ineligible one because it doesn’t meet every rule", () => {
    for (const state of noPlanStates) {
      const eligible = textOf(compose(withVerdict(completedSnapshotsByState[state], "no_recommendation", true), britishReader));
      expect(eligible, state).toContain(noNewPlan);
      expect(eligible.join(" "), state).not.toContain("doesn’t meet every rule");
      const ineligible = textOf(compose(withVerdict(completedSnapshotsByState[state], "no_recommendation", false), britishReader));
      expect(ineligible, state).toContain(comparisonOnly);
    }
  });

  it("the water note's head matches the farmer's answer: backup water isn’t counted, or only rain is counted for I’m not sure", () => {
    const water = (answer: "rain_plus_backup" | "unsure", message: string) => {
      const note = { code: "water_context", message, cropPurposeIds: [], ruleIds: [], metricIds: [] };
      const text = textOf(compose(withDetails(completedSnapshotsByState.plan, { warnings: [note] }, { water: answer }), britishReader));
      return text[text.indexOf(message) - 1];
    };
    expect(water("rain_plus_backup", "Reported backup water may provide additional protection. No backup supply was assumed in calculations or ranking."))
      .toBe("Your backup water isn’t counted");
    expect(water("unsure", "Water availability is uncertain. Every calculation assumes rainfall alone.")).toBe("Only rain is counted");
  });

  it("a 29 February 2028 start ends the year on 27 Feb 2029 on each no-plan report, as the engine's year does", () => {
    for (const state of ["insufficient_data", "no_calendar_fit", "search_incomplete", "service_error"] as const) {
      const doc = compose(withDetails(completedSnapshotsByState[state], {}, { planningStart: "2028-02-29" }), britishReader);
      expect(doc.head.lines[1], state).toBe("Made 1 Jul 2026 · Your year: 29 Feb 2028 to 27 Feb 2029");
    }
    const ordinary = compose(withDetails(completedSnapshotsByState.no_calendar_fit, {}, { planningStart: "2027-03-01" }), britishReader);
    expect(ordinary.head.lines[1]).toBe("Made 1 Jul 2026 · Your year: 1 Mar 2027 to 29 Feb 2028");
  });

  it("a mean temperature of -0.3 °C prints as 0 in the month table, never -0", () => {
    const source = variant("monthlyInsights");
    const insights = source.result.details.insights.map(insight =>
      insight.month === 7 && insight.metric.id === "monthly_mean_temperature"
        ? { ...insight, metric: { ...insight.metric, value: { kind: "available", value: -0.3 } } } : insight);
    const doc = compose(withDetails(source, { insights }), britishReader);
    const table = doc.sections.flatMap(section => section.blocks).find(block => block.kind === "table");
    if (table?.kind !== "table") throw new Error("no month table");
    expect(table.rows[0]).toEqual(["Jul", "125", "47", "235", "0"]);
  });

  it("page 1 says why there is no plan once: the status box's sentence is not repeated by the section under it", () => {
    for (const snapshot of [completedSnapshotsByState.no_calendar_fit, variant("structuralProof"), completedSnapshotsByState.service_error]) {
      const doc = compose(snapshot, britishReader);
      expect(textOf(doc).filter(line => line === doc.head.status.text), snapshot.id).toHaveLength(1);
    }
    const fit = compose(completedSnapshotsByState.no_calendar_fit, britishReader);
    expect(fit.head.status.text).toBe("Together they need at least 366 days; your year has 365.");
    expect(textOf(fit)).toContain("Synthetic crop: at least 366 days");
    const failed = compose(completedSnapshotsByState.service_error, britishReader);
    expect(failed.head.status.text).toBe("Example source did not respond.");
    expect(textOf(failed)).toContain("No new plan was made. It wasn’t anything you did.");
  });

  it("Sources, period and versions names each calculation method once: the metrics' methods, and in a status report the month table's too", () => {
    const metric = (id: string, methodVersion: string) => ({ ...completedSnapshotsByState.plan.result.details.metrics[0], id, methodVersion });
    const plan = withDetails(completedSnapshotsByState.plan, {
      metrics: [metric("mean_frequency", "rain-demand-window-v2"), metric("unplanted_days", "schedule-occupancy-v1"), metric("q90_mismatch", "rain-demand-window-v2")],
      insights: [{ ...completedSnapshotsByState.plan.result.details.insights[0], metric: metric("monthly_rain_median", "climate-insight-v2") }],
    });
    expect(sourcesOf(compose(plan, britishReader))).toContain("Calculation methods: rain-demand-window-v2; schedule-occupancy-v1.");
    const source = variant("monthlyInsights");
    const report = withDetails(source, {
      insights: source.result.details.insights.map(insight => ({ ...insight, metric: { ...insight.metric, methodVersion: "climate-insight-v2" } })),
    });
    expect(sourcesOf(compose(report, britishReader))).toContain("Calculation methods: synthetic-v1; climate-insight-v2.");
    expect(sourcesOf(compose(completedSnapshotsByState.plan, britishReader))).toContain("Calculation methods: synthetic-v1.");
  });
});

describe("a crop's name", () => {
  const saved = variant("frozenLabels");
  const insufficient = completedSnapshotsByState.insufficient_data;
  const history = insufficient.input.history.kind === "recorded" ? insufficient.input.history : null;
  const gaps = insufficient.result.state === "insufficient_data" ? insufficient.result.missing : [];
  const savedStatus = frozen(completedSnapshotSchema.parse({
    ...insufficient,
    input: {
      ...insufficient.input,
      history: history && { ...history, entries: [...history.entries, {
        kind: "crop", id: "synthetic-retired", crop: { kind: "catalogue", cropPurposeId: "synthetic-retired-crop" },
        planted: "2025-08-01", harvested: "2025-09-30", plantedPrecision: "exact", harvestedPrecision: "exact",
      }] },
    },
    result: {
      ...insufficient.result,
      missing: [...gaps, { code: "crop_profile", reason: "No synthetic profile applies here.", cropPurposeIds: ["synthetic-crop"], sourceIds: [] }],
    },
  }), { "synthetic-crop": savedLabels["synthetic-crop"] });
  const idNames = /synthetic (second |third )?crop\b/i;

  it("version 2: the label saved with the snapshot names each crop, as written, in the answers, status, flags, calendar, heat, changes, gaps and profiles", () => {
    const doc = compose(saved, britishReader);
    const text = textOf(doc);
    expect(doc.head.lines).toContain("Crops: Synthetic bean (dry grain), Synthetic maize (grain) and Synthetic oats (grain) · Water: Rain only · Last year: 1 crop");
    expect(doc.head.status.text).toContain("temperatures went outside the limits for Synthetic maize (grain) on about 20% of checked days");
    expect(calendarOf(doc).rows.map(row => row.head)).toEqual([
      "Synthetic bean (dry grain)", "No planned crop", "Synthetic maize (grain)", "No planned crop", "Synthetic oats (grain)", "No planned crop",
    ]);
    expect(text).toEqual(expect.arrayContaining([
      "Rain fell short of what Synthetic bean (dry grain) needs in past seasons",
      "Temperatures went outside the limits for Synthetic maize (grain)",
      "The first 7 days are the time after the Synthetic oats (grain) harvest, before the field is free.",
      "Outside the limits in past seasons: Synthetic maize (grain).",
      "No checked day outside the limits for Synthetic bean (dry grain).",
      "Not assessed for Synthetic oats (grain).",
      "Added: Synthetic oats (grain), 6 Jan to 6 Mar 2027.",
      "Plant Synthetic bean (dry grain) 7 days later: 1 Jul 2026 instead of 24 Jun 2026.",
      "Plant Synthetic maize (grain) on the same day, 16 Oct 2026; harvest 24 Dec 2026 instead of 19 Dec 2026.",
      "Synthetic maize (grain) moves from first to second in the order.",
      "Heat and cold limits for Synthetic oats (grain)",
      "Crop profiles: Synthetic bean (dry grain) synthetic-synthetic-crop-profile synthetic-v1; Synthetic maize (grain) synthetic-synthetic-second-crop-profile synthetic-v1; Synthetic oats (grain) synthetic-synthetic-third-crop-profile synthetic-v1.",
    ]));
    expect(text.filter(line => idNames.test(line))).toEqual([]);
  });

  it("version 2 status reports: the duration proof, What’s missing and last year’s rows name the crop by its saved label", () => {
    const tooLong = textOf(compose(frozen(completedSnapshotsByState.no_calendar_fit, { "synthetic-crop": savedLabels["synthetic-crop"] }), britishReader));
    expect(tooLong).toContain("Synthetic bean (dry grain): at least 366 days");
    const missing = textOf(compose(savedStatus, britishReader));
    expect(missing).toContain("Growing details for Synthetic bean (dry grain) in this place");
    const lastYear = missing.slice(missing.indexOf("What you told us about last year (not scored)"));
    expect(lastYear.slice(1, 3)).toEqual(["Synthetic bean (dry grain)", "Planted about 1 Jul 2025 · Harvested about 4 Jul 2025"]);
    expect([...tooLong, ...missing].filter(line => idNames.test(line))).toEqual([]);
  });

  it("version 1: a snapshot saved without a catalogue names the same crops from their IDs", () => {
    const doc = compose(unfrozen(saved), britishReader);
    const text = textOf(doc);
    expect(doc.head.lines).toContain("Crops: Synthetic crop, synthetic second crop and synthetic third crop · Water: Rain only · Last year: 1 crop");
    expect(calendarOf(doc).rows.map(row => row.head).filter(head => head !== "No planned crop")).toEqual(["Synthetic crop", "Synthetic second crop", "Synthetic third crop"]);
    expect(text).toContain("Synthetic second crop moves from first to second in the order.");
    expect(text.filter(line => /\((dry )?grain\)/.test(line))).toEqual([]);
  });

  it("an ID the saved catalogue doesn’t hold is named from its ID: the removed old crop, and a crop from last year", () => {
    expect(textOf(compose(saved, britishReader))).toContain("Not in the new plan: synthetic old crop, 1 Mar to 9 Apr 2027 in last year’s rotation.");
    const missing = textOf(compose(savedStatus, britishReader));
    const lastYear = missing.slice(missing.indexOf("What you told us about last year (not scored)"));
    expect(lastYear).toContain("Synthetic retired crop");
    expect(lastYear[lastYear.indexOf("Synthetic retired crop") + 1]).toBe("Planted 1 Aug 2025 · Harvested 30 Sept 2025");
  });

  it("a saved label with a letter the fonts can’t draw is replaced whole by the name made from the ID, never printed as ?", () => {
    const doc = compose(frozen(completedSnapshotsByState.plan, { "synthetic-crop": "ถั่ว synthetic" }), britishReader);
    expect(calendarOf(doc).rows[0]?.head).toBe("Synthetic crop");
    expect(doc.head.lines).toContain("Crops: Synthetic crop · Water: Rain only · Last year: 1 crop");
    expect(textOf(doc).filter(line => /\?{2}|\? synthetic/.test(line))).toEqual([]);
  });
});

describe("a no-plan report says only what it shows", () => {
  const scoredRotation = (approximateDates: boolean) => {
    const base = completedSnapshotsByState.plan.result.details.metrics[0];
    const metrics = [
      { ...base, id: "mean_frequency", value: { kind: "available", value: 0.948 } },
      { ...base, id: "unplanted_days", unit: "days", value: { kind: "available", value: 215 } },
      { ...base, id: "q90_temperature_exposure", value: { kind: "unavailable", reason: "No crop has an assessable temperature rule." } },
    ];
    return withDetails(completedSnapshotsByState.no_calendar_fit, {
      baseline: { ...assessedPlanBaseline, recommendation: "no_recommendation", eligible: false, approximateDates, metrics, deltas: [], changes: [] },
    });
  };

  it("a no-plan report with last year’s rotation scored shows its numbers in past seasons and the rows you gave, and calls only those numbers approximate", () => {
    const text = textOf(compose(scoredRotation(true), britishReader));
    const from = text.indexOf("Compared with last year");
    expect(text.slice(from, from + 12)).toEqual([
      "Compared with last year",
      "Last year’s rotation is shown for comparison only. It can’t be the suggestion, because it doesn’t meet every rule for a plan.",
      "Your dates are estimates. You said some of last year’s dates are approximate, so these numbers are approximate too.",
      "Last year’s rotation in past seasons",
      "Weeks with less rain than the crops need", "95%",
      "Days without a planned crop", "215 days",
      "Checked days outside temperature limits in a bad year", "Not available", "No crop has an assessable temperature rule.",
      "What you told us about last year",
    ]);
    expect(text[from + 12]).toBe("Synthetic crop");
    const said = text.join(" ");
    for (const untrue of ["How they compare", "No numbers to compare.", "this comparison is approximate", "(not scored)"]) expect(said).not.toContain(untrue);
    expect(textOf(compose(scoredRotation(false), britishReader)).join(" ")).not.toContain("Your dates are estimates.");
  });

  it("a no-plan report gives the past seasons of weather it holds and never says it checked anything against them; a plan says Checked against", () => {
    const cohort = variant("excludedSeasons").result.details.cohort;
    for (const state of noPlanStates) {
      const doc = compose(withDetails(completedSnapshotsByState[state], { cohort }), britishReader);
      expect(sourcesOf(doc)[0], state).toBe("Weather from 3 past seasons, Jul 2001 to Jun 2005.");
      expect(textOf(doc).join(" "), state).not.toContain("Checked against");
    }
    const months = variant("monthlyInsights");
    const farm = textOf(compose(withDetails(months, { cohort }), britishReader));
    expect(farm[farm.indexOf("What we know about your farm") + 1]).toBe("Weather from 3 past seasons, Jul 2001 to Jun 2005. Monthly rain from 2001 to 2020.");
    expect(sourcesOf(compose(variant("excludedSeasons"), britishReader))[0]).toBe("Checked against 3 past seasons, Jul 2001 to Jun 2005.");
  });
});

describe("real registry and engine text", () => {
  const registry = readRegistryRelease();
  const bangkok = {
    lookup: [100.5, 14] as const,
    climate: { meanAnnualTemperatureC: { kind: "available", value: 28 }, meanAnnualPrecipitationMm: { kind: "available", value: 1400 } },
  } as const;
  const ids = (...list: readonly string[]) => list.map(parseCropPurposeId);
  const gapsFor = (crops: readonly CropPurposeId[]) => resolveRegistry({ cropPurposeIds: crops, ...bangkok }, registry).gaps;
  const labelsOf = (crops: readonly CropPurposeId[]) => Object.fromEntries(crops.map(id => {
    const entry = registry.catalogue.entries.find(candidate => candidate.id === id);
    if (!entry) throw new Error(`${id} is not in the released catalogue`);
    return [id, entry.label];
  }));
  const rawIds = (text: readonly string[], crops: readonly string[]) => text.filter(line => crops.some(id => line.includes(id)));

  function missing(crops: readonly CropPurposeId[], unchecked: readonly CropPurposeId[] = [], changes: object = {}): CompletedSnapshot {
    const source = completedSnapshotsByState.insufficient_data;
    const gaps = gapsFor(crops);
    return completedSnapshotSchema.parse({
      ...source,
      input: { ...source.input, cropPurposeIds: crops },
      result: { ...source.result, missing: gaps, details: { ...source.result.details, unassessedChecks: [...gaps, ...gapsFor(unchecked)], ...changes } },
    });
  }

  it("a gap the registry gives names the crop, as the head above it does, never by its ID: in What’s missing and in What we couldn’t check", () => {
    const selected = ids("common-bean-dry", "brussels-sprouts");
    const fromHistory = ids("squash-zucchini");
    expect(gapsFor(selected).map(gap => gap.reason)).toEqual(selected.map(id => `No released ${id} profile applies at this location.`));
    const saved = textOf(compose(frozen(missing(selected, fromHistory), labelsOf([...selected, ...fromHistory])), britishReader));
    for (const [head, reason] of [
      ["Growing details for Common bean (dry grain) in this place", "No released Common bean (dry grain) profile applies at this location."],
      ["Growing details for Brussels sprouts in this place", "No released Brussels sprouts profile applies at this location."],
      ["Growing details for Squash and zucchini in this place", "No released Squash and zucchini profile applies at this location."],
    ]) expect(saved[saved.indexOf(head) + 1], head).toBe(reason);
    expect(saved.indexOf("Growing details for Squash and zucchini in this place")).toBeGreaterThan(saved.indexOf("What we couldn’t check"));
    expect(rawIds(saved, [...selected, ...fromHistory])).toEqual([]);

    const notListed = ids("common-bean-dry", "teff-grain");
    const fromIds = textOf(compose(missing(notListed), britishReader));
    expect(fromIds).toContain("No released common bean dry profile applies at this location.");
    expect(fromIds).toContain(`Teff grain is not in catalogue ${registry.catalogue.version}.`);
    expect(rawIds(fromIds, notListed)).toEqual([]);
  });

  it("a crop ID inside a longer ID, such as a profile ID, is left as it is", () => {
    const crop = parseCropPurposeId("common-bean-dry");
    const reason = "Ambiguous profile precedence for common-bean-dry: common-bean-dry-fao56-a, common-bean-dry-fao56-b.";
    const source = missing([crop]);
    const doc = compose(frozen(completedSnapshotSchema.parse({
      ...source, result: { ...source.result, missing: [{ code: "crop_profile", reason, cropPurposeIds: [crop], sourceIds: [] }] },
    }), labelsOf([crop])), britishReader);
    expect(textOf(doc)).toContain("Ambiguous profile precedence for Common bean (dry grain): common-bean-dry-fao56-a, common-bean-dry-fao56-b.");
  });

  it("saved labels print as written, and a crop list holding a name with and in it is split by semicolons", () => {
    const crops = ids("pumpkin-winter-squash", "squash-zucchini", "brussels-sprouts");
    const heat = { code: "temperature_exposure", message: "In some replay seasons, daily temperatures passed a crop's temperature limit during its sensitive period.",
      cropPurposeIds: crops.slice(0, 2), ruleIds: [], metricIds: [] };
    const doc = compose(frozen(missing(crops, [], { warnings: [heat] }), labelsOf(crops)), britishReader);
    const text = textOf(doc);
    expect(doc.head.lines[2]).toBe("Crops: Pumpkin and winter squash; Squash and zucchini; Brussels sprouts · Water: Rain only · Last year: 1 crop");
    expect(text).toContain("Temperatures went outside the limits for Pumpkin and winter squash; Squash and zucchini");
    expect(text.filter(line => line.includes("brussels sprouts"))).toEqual([]);
  });

  it("a crop profile note is headed by words true of any note, such as one about which FAO-56 row was read", () => {
    const note = registry.profiles.flatMap(profile => profile.warnings).find(warning => !/water|rain/i.test(warning));
    if (note === undefined) throw new Error("the release has no profile note about anything but water");
    const crop = parseCropPurposeId("synthetic-crop");
    const doc = (cropPurposeIds: readonly CropPurposeId[]) => textOf(compose(withDetails(completedSnapshotsByState.plan, {
      warnings: [{ code: "profile_limitation", message: note, cropPurposeIds, ruleIds: [], metricIds: [] }],
    }), britishReader));
    const named = doc([crop]);
    expect(named[named.indexOf(note) - 1]).toBe("About the growing details for synthetic crop");
    const unnamed = doc([]);
    expect(unnamed[unnamed.indexOf(note) - 1]).toBe("About the growing details we used");
    expect([...named, ...unnamed].join(" ")).not.toContain("water check");
  });

  describe("a no-fit report’s advice follows its proof", () => {
    const rice = parseCropPurposeId("rice-paddy");
    const soybean = parseCropPurposeId("soybean-grain");
    const rule = { id: "synthetic-rule", version: "synthetic-rule-v1", target: "synthetic-crop", sourceIds: [] };

    function proofFor(crops: readonly CropPurposeId[], start: string) {
      const found = findCalendar({
        horizon: { start: parseIsoDate(start), endExclusive: parseIsoDate(`${Number(start.slice(0, 4)) + 1}${start.slice(4)}`) },
        cropPurposeIds: crops, profiles: resolveRegistry({ cropPurposeIds: crops, ...bangkok }, registry).profiles,
        hardConstraints: [], initialPredecessor: null, eligibleBaseline: null, expansionLimit: 2_000_000,
      });
      if (found.kind !== "proved_impossible") throw new Error(`${crops.join(", ")} fit from ${start}`);
      return found.proof;
    }

    function noFit(crops: readonly CropPurposeId[], start: string, proof: object, rules: readonly object[] = []): string[] {
      const source = completedSnapshotsByState.no_calendar_fit;
      const details = source.result.details;
      return textOf(compose(completedSnapshotSchema.parse({
        ...source,
        input: { ...source.input, cropPurposeIds: crops, planningStart: start },
        result: { ...source.result, proof, details: { ...details, provenance: { ...details.provenance, rules } } },
      }), britishReader));
    }

    it("one rice crop from 15 Jan 2027: its December planting time and the start date are the reason, and the advice is another date or crop, never fewer or faster crops", () => {
      const proof = proofFor([rice], "2027-01-15");
      expect(proof.kind).toBe("structural_exhaustion");
      const text = noFit([rice], "2027-01-15", proof);
      expect(text).toContain("The time of year when your crop can be planted leaves no way to fit it into one year from your start date, 15 Jan 2027. "
        + "Try another start date or another crop, then make the plan again.");
      expect(text.join(" ")).not.toMatch(/fewer crops|grow faster/);
    });

    it("rice and soybean from 15 Jan 2027: the planting times, and the follow rules when the run had any, with fewer crops among the choices", () => {
      const proof = proofFor([rice, soybean], "2027-01-15");
      expect(noFit([rice, soybean], "2027-01-15", proof)).toContain("The times of year when your crops can be planted leave no way to fit them all into one year "
        + "from your start date, 15 Jan 2027. Try another start date, other crops or fewer crops, then make the plan again.");
      expect(noFit([rice, soybean], "2027-01-15", proof, [rule])).toContain("The times of year when your crops can be planted, and the rules about which crop "
        + "may follow which, leave no way to fit them all into one year from your start date, 15 Jan 2027. Try another start date, other crops or fewer crops, "
        + "then make the plan again.");
    });

    it("a duration proof asks for faster crops, and for fewer only when more than one was chosen", () => {
      const one = textOf(compose(completedSnapshotsByState.no_calendar_fit, britishReader));
      expect(one).toContain("Choose a crop that grows faster, then make the plan again.");
      expect(one.join(" ")).not.toContain("fewer crops");
      const proof = { kind: "duration_lower_bound", horizonDays: 365, mandatoryMinimumDays: 400,
        minimumByCrop: [{ cropPurposeId: rice, minimumDays: 160 }, { cropPurposeId: soybean, minimumDays: 240 }] };
      expect(noFit([rice, soybean], "2026-07-01", proof)).toContain("Choose fewer crops, or crops that grow faster, then make the plan again.");
    });
  });
});
