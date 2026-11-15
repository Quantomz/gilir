import { describe, expect, it } from "vitest";
import { completedSnapshotSchema } from "@/contracts/result";
import { compose } from "@/client/pdf/compose";
import type { Item, PdfDocument, PlanDocument, StatusDocument, Timeline, TimelineBlock } from "@/client/pdf/model";
import { pdfText } from "@/client/pdf/text";
import { completedSnapshotsByState } from "@/fixtures/results";
import { syntheticLabel } from "@/fixtures/science";
import { britishReader, variant, variantNames } from "./support/variants";

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
    expect(variantNames).toHaveLength(14);
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
      .toContain("Method versions: not recorded. Synthetic example: the run manifest was not recorded.");
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
      items: [{ head: "Heat and cold limits for pumpkin and winter squash and sweet maize sweet corn", lines: ["No synthetic temperature rule applies to these invented crops."] }],
    }]);
  });
});
