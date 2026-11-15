process.env.TZ = "America/Los_Angeles";
import { describe, expect, it } from "vitest";
import { completedSnapshotSchema } from "@/contracts";
import type { CompletedSnapshot } from "@/contracts";
import type { Block, DetailsPage, Section } from "@/features/results/model/blocks";
import { detailsPage } from "@/features/results/model/details-page";
import { resultPage } from "@/features/results/model/result-page";
import { definitions, disclaimers, formatIn } from "@/features/results/model/words";
import { frozenRunFixture, syntheticLabel } from "@/fixtures/science";
import { textOf } from "../support/ports";
import { everySnapshot, shared, variant } from "../support/variants";

const format = formatIn("en-GB");
const detailsOf = (snapshot: CompletedSnapshot) => detailsPage(snapshot, format);

function sectionOf(page: DetailsPage, id: string): Section {
  const found = page.sections.find(section => section.id === id);
  if (found === undefined) throw new Error(`No ${id} section on this page.`);
  return found;
}

function blocksOf<K extends Block["kind"]>(section: Section, kind: K): Extract<Block, { readonly kind: K }>[] {
  return section.blocks.filter((block): block is Extract<Block, { readonly kind: K }> => block.kind === kind);
}

/** Every name and value pair of a section, in order. */
function factsOf(section: Section): [string, string][] {
  return blocksOf(section, "facts").flatMap(block => block.facts.map((fact): [string, string] => [fact.name, fact.value]));
}

function wordsOf(section: Section): string {
  return textOf({ back: "", eyebrow: "", title: "", lead: "", synthetic: null, sections: [{ ...section, id: "numbers" }] });
}

function changed(base: CompletedSnapshot, result: (given: CompletedSnapshot["result"]) => unknown): CompletedSnapshot {
  return completedSnapshotSchema.parse({ ...base, result: result(base.result) });
}

describe("View details: how this result was made", () => {
  it("[R19] the plan fixture shows profile synthetic-profile version synthetic-v1, the synthetic assumption and the manifest versions of frozenRunFixture", () => {
    const page = detailsOf(shared("plan"));
    expect(blocksOf(sectionOf(page, "profiles"), "items")[0].items).toEqual([
      { icon: null, head: "Synthetic crop", lines: ["Profile synthetic-profile, version synthetic-v1.", "Sources: none recorded, so these values are not reviewed."], href: null },
    ]);
    expect(blocksOf(sectionOf(page, "assumptions"), "items")[0].items.map(item => item.head)).toEqual([syntheticLabel]);
    const { manifest } = frozenRunFixture;
    expect(factsOf(sectionOf(page, "versions"))).toEqual([
      ["Engine", manifest.engineVersion],
      ["Settings", manifest.configurationVersion],
      ["Crop list", manifest.catalogueVersion],
      ["Rules", manifest.ruleVersion],
      ["Data cutoff", "Records before 1 Jan 2026"],
      ["Weather records used", "synthetic-weather"],
      ["Answers fingerprint", manifest.normalizedInputHash],
    ]);
  });

  it("[R19] each metric shows its name and id, value with unit, denominator (Out of 1 season), basis (Estimated) and method version synthetic-v1, with Sources None recorded", () => {
    const numbers = sectionOf(detailsOf(shared("plan")), "numbers");
    const at = numbers.blocks.findIndex(block => block.kind === "subhead" && block.text === "How often rain fell below what the crops need (ranked first)");
    expect(at).toBeGreaterThan(0);
    expect(numbers.blocks[at + 1]).toEqual({ kind: "text", look: "big", text: "0 (0%)" });
    expect(numbers.blocks[at + 2]).toMatchObject({
      kind: "facts",
      facts: [
        { name: "In the result", value: "Synthetic historical rainfall mismatch frequency (mean_frequency)" },
        { name: "Out of", value: "1 season" },
        { name: "Kind of value", value: "Estimated" },
        { name: "Method version", value: "synthetic-v1" },
        { name: "Sources", value: "None recorded" },
      ],
    });
    const values = (snapshot: CompletedSnapshot) => blocksOf(sectionOf(detailsOf(snapshot), "numbers"), "text").filter(block => block.look === "big").map(block => block.text);
    expect(values(shared("plan_with_warnings"))).toEqual(["0.5 (about 50%)"]);
    expect(values(variant("temperature"))).toEqual(["0.3 (about 30%)", "0.18 (about 18%)", "0.08 (about 8%)"]);
  });

  it("[R20] the four tuple components are listed in tuple order with their exact values (mean_frequency = 0 … longest_unplanted_gap = 361 days); a no-plan result says No plan was ranked, so there is no ranking score.", () => {
    const tuple = (snapshot: CompletedSnapshot) => factsOf(sectionOf(detailsOf(snapshot), "numbers")).filter(([, value]) => value.includes(" = "));
    expect(tuple(shared("plan"))).toEqual([
      ["How often rain fell below what the crops need", "mean_frequency = 0"],
      ["How big the shortfall was", "mean_mismatch = 0"],
      ["Days without a planned crop", "unplanted_days = 361 days"],
      ["Longest stretch without a planned crop", "longest_unplanted_gap = 361 days"],
    ]);
    expect(tuple(shared("plan_with_warnings")).map(([, value]) => value)).toEqual([
      "mean_frequency = 0.5", "mean_mismatch = 0.25", "unplanted_days = 361 days", "longest_unplanted_gap = 361 days",
    ]);
    for (const state of ["insufficient_data", "no_calendar_fit", "search_incomplete", "service_error"] as const) {
      const numbers = sectionOf(detailsOf(shared(state)), "numbers");
      expect(numbers.title).toBe("The numbers in this result");
      expect(wordsOf(numbers)).toContain("No plan was ranked, so there is no ranking score.");
      expect(tuple(shared(state))).toEqual([]);
    }
  });

  it("[R20] run_provenance shows each source with its section and dates, and each climate product’s cell size (0.5° of latitude by 0.625° of longitude) and missing days per field", () => {
    const page = detailsOf(variant("run_provenance"));
    const sources = sectionOf(page, "sources");
    expect(blocksOf(sources, "items")[0].items.map(item => [item.head, item.lines])).toEqual([
      ["Example crop water guide", ["Table 2", "Published 1 May 2020.", "Taken on 15 Jan 2026."]],
      ["Example unsafe address", ["Section 1", "Publication date: No publication date in this example.", "Taken on 15 Jan 2026."]],
    ]);
    expect(factsOf(sources)).toEqual([
      ["Grid cell", "example-cell"],
      ["Cell size", "0.5° of latitude by 0.625° of longitude"],
      ["Version", "v1"],
      ["Rain stream", "Not recorded: No stream name in this example."],
      ["Time standard", "UTC"],
      ["Units", "precipitation: mm/day, used as mm"],
      ["Missing days", "precipitation: 3 days"],
      ["Address", "https://example.org/weather"],
    ]);
    expect(wordsOf(sources)).toContain("A weather grid cell is much larger than a field.");
    expect(wordsOf(sectionOf(page, "profiles"))).toContain("Sources: Example crop water guide.\nRule example-rule (version v1) for synthetic-crop\nSources: Example crop water guide.");
  });

  it("[R20] run_provenance links only its https source; its javascript: source shows as plain text with no href", () => {
    const hrefs = (snapshot: CompletedSnapshot) => blocksOf(sectionOf(detailsOf(snapshot), "sources"), "items").flatMap(block => block.items.map(item => item.href));
    expect(hrefs(variant("run_provenance"))).toEqual(["https://example.org/guide", null]);
    const addresses = ["http://example.org/plain", "data:text/html,hello", "ftp://example.org/file", "mailto:someone@example.org", "JAVASCRIPT:alert(1)"];
    const schemes = changed(variant("run_provenance"), result => {
      const { provenance } = result.details;
      const [source] = provenance.sources;
      return {
        ...result,
        details: { ...result.details, provenance: { ...provenance, sources: addresses.map((url, index) => ({ ...source, id: `source-${index}`, url })) } },
      };
    });
    expect(hrefs(schemes)).toEqual(["http://example.org/plain", null, null, null, null]);
  });

  it("[R20] search coverage reads N of up to M for the three counters; no_calendar_fit with 0 structural tries says why no search was needed, never 0 of up to", () => {
    const coverage = (snapshot: CompletedSnapshot) => factsOf(sectionOf(detailsOf(snapshot), "coverage"));
    expect(coverage(shared("plan"))).toEqual([
      ["Finding an order that fits", "Found an order that fits: 1 of up to 10 tries"],
      ["Comparing plans", "Compared every planting date on the grid"],
      ["Partial plans opened", "1 of up to 10"],
      ["Plans scored", "0 of up to 10, besides the first order that fit and last year’s rotation"],
      ["Planting dates tried", "Every 7 days from the day your field is ready, plus last year’s planting dates and the first free day after each crop"],
    ]);
    const noFit = detailsOf(shared("no_calendar_fit"));
    expect(coverage(shared("no_calendar_fit"))).toEqual([
      ["Finding an order that fits", "Your crops’ shortest times already add up to more than your year, so no search was needed"],
      ["Comparing plans", "Not started"],
    ]);
    expect(textOf(noFit)).not.toContain("0 of up to");
    expect(coverage(variant("structural"))[0]).toEqual(["Finding an order that fits", "Showed that no order fits: 1,234 of up to 2,000,000 tries"]);
    expect(coverage(shared("search_incomplete"))[0]).toEqual(["Finding an order that fits", "Stopped at its limit: 10 of up to 10 tries"]);
    const fitsAlready = changed(shared("plan"), result => ({
      ...result, details: { ...result.details, search: { ...result.details.search, structuralExpandedStates: 0 } },
    }));
    expect(coverage(fitsAlready)[0]).toEqual(["Finding an order that fits", "Last year’s rotation already fits, so no search was needed"]);
    expect(blocksOf(sectionOf(detailsOf(shared("plan_with_warnings")), "coverage"), "note")[0]).toMatchObject({ strong: "We stopped at our search limit." });
    expect(blocksOf(sectionOf(detailsOf(shared("plan")), "coverage"), "note")).toEqual([]);
  });

  it("[R20] How the numbers are worked out lists the eight definitions and the screening disclaimer", () => {
    const section = sectionOf(detailsOf(shared("plan")), "definitions");
    expect(factsOf(section).map(([name]) => name)).toEqual([
      "7-day window", "D, the crop’s need", "P, rain", "r, the shortfall", "F, how often", "M, how much", "Q90, a bad year", "Dry and wet days",
    ]);
    expect(factsOf(section)).toEqual(definitions.map(([name, value]) => [name, value]));
    expect(wordsOf(section)).toContain(disclaimers[1]);
  });

  it("[R21] an unavailable metric value and denominator read Not available: No usable windows in this example.", () => {
    const numbers = sectionOf(detailsOf(shared("insufficient_data")), "numbers");
    expect(blocksOf(numbers, "text").filter(block => block.look === "big").map(block => block.text)).toEqual(["Not available: No usable windows in this example."]);
    expect(factsOf(numbers)).toContainEqual(["Out of", "Not available: No usable windows in this example."]);
    expect(wordsOf(numbers)).not.toMatch(/\b0 (\(|seasons?\b)/);
  });

  it("[R36] the made time is the local day and time and no raw ISO timestamp is on the page", () => {
    expect(wordsOf(sectionOf(detailsOf(shared("plan")), "versions"))).toContain("Result synthetic-plan, made 30 June 2026, 17:00. Schema version 1.");
    for (const { name, snapshot } of everySnapshot()) {
      expect(textOf(detailsOf(snapshot)), name).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });

  it("[R37] the synthetic label opens the page and names Gilir, never Threefield", () => {
    for (const { name, snapshot } of everySnapshot()) {
      const page = detailsOf(snapshot);
      expect(page.synthetic, name).toBe(name === "run_provenance" ? null : `${syntheticLabel} Use it to see how Gilir works, not to decide what to plant.`);
      expect(page.eyebrow, name).toBe("Synthetic example field · Made 30 Jun 2026");
      expect(textOf(page), name).not.toMatch(/Threefield/i);
    }
    expect(detailsOf(shared("plan")).lead).toBe(
      "Sources, calculations and assumptions behind “Keep last year’s rotation”. Everything here comes from the saved result; nothing is worked out again.",
    );
  });

  it("[R29] the service_error page holds the service’s message and code here, under What the service reported, and only here", () => {
    const page = detailsOf(shared("service_error"));
    expect(wordsOf(sectionOf(page, "numbers"))).toContain("What the service reported: Example source did not respond. (retrieval_failed)");
    expect(textOf(page).split("Example source did not respond.")).toHaveLength(2);
    expect(textOf(resultPage(shared("service_error"), format))).not.toContain("Example source did not respond.");
    expect(wordsOf(sectionOf(detailsOf(variant("fatal")), "numbers"))).toContain("What the service reported: Example processing failure. (processing_failed)");
    for (const { name, snapshot } of everySnapshot()) {
      if (snapshot.result.state !== "service_error") expect(textOf(detailsOf(snapshot)), name).not.toContain("What the service reported");
    }
  });

  it("[R18] each preparation step shows its sources, or that none are recorded", () => {
    expect(wordsOf(sectionOf(detailsOf(shared("plan")), "assumptions"))).toContain(
      "Where the Get ready steps come from\nExample preparation text for layout tests.\nSources: none recorded.",
    );
    const sourced = changed(variant("run_provenance"), result => ({
      ...result,
      details: { ...result.details, preparation: result.details.preparation.map(step => ({ ...step, sourceIds: ["example-guide"] })) },
    }));
    expect(wordsOf(sectionOf(detailsOf(sourced), "assumptions"))).toContain("Example preparation text for layout tests.\nSources: Example crop water guide.");
    expect(wordsOf(sectionOf(detailsOf(variant("no_preparation")), "assumptions"))).not.toContain("Get ready");
    expect(wordsOf(sectionOf(detailsOf(shared("plan")), "assumptions"))).toContain(disclaimers[0]);
  });

  it("the sections come in the builders’ order, each id once, and each has a non-empty title", () => {
    for (const { name, snapshot } of everySnapshot()) {
      const page = detailsOf(snapshot);
      expect(page.sections.map(section => section.id), name).toEqual([
        "numbers", "definitions", "months", "seasons", "sources", "profiles", "coverage", "assumptions", "versions", "answers",
      ]);
      for (const section of page.sections) expect(section.title.length, `${name} ${section.id}`).toBeGreaterThan(0);
      expect([page.title, page.back], name).toEqual(["How this result was made", "Back to the result"]);
    }
  });

  it("rain and temperature by month show the insights as a table and the other insights by name; past seasons name their count, period and target", () => {
    const insights = detailsOf(variant("insights"));
    const months = sectionOf(insights, "months");
    expect(blocksOf(months, "table")[0].rows[0]).toEqual(["July", "180", "90", "260", "28.5"]);
    expect(wordsOf(months)).toContain("Other numbers on record\nWet days\nJuly 2000 to June 2024: about 55%");
    const usualRain = factsOf(months).slice(0, 6);
    expect(usualRain).toEqual([
      ["In the result", "Synthetic monthly median rainfall (monthly_rain_median)"],
      ["Period", "July 2000 to June 2024"],
      ["Out of", "1 season"],
      ["Kind of value", "Measured"],
      ["Method version", "synthetic-v1"],
      ["Sources", "None recorded"],
    ]);
    expect(blocksOf(months, "subhead").map(block => block.text)).toEqual([
      "Other numbers on record", "Usual rain", "Dry year", "Wet year", "Mean temperature", "Wet days",
    ]);
    const asTheEngineEmits = detailsOf(changed(variant("insights"), result => ({ ...result, details: { ...result.details, metrics: [] } })));
    expect(wordsOf(sectionOf(asTheEngineEmits, "numbers"))).toBe(
      "The numbers in this result\nNo plan was ranked, so there is no ranking score.\nThe numbers on record for this result are under Rain and temperature by month.",
    );
    const uneven = changed(variant("insights"), result => ({
      ...result,
      details: {
        ...result.details,
        insights: result.details.insights.map(insight => (insight.metric.id === "monthly_rain_median" && insight.month === 8
          ? { ...insight, metric: { ...insight.metric, denominator: { kind: "available", value: { count: 23, unit: "seasons" } } } }
          : insight)),
      },
    }));
    expect(factsOf(sectionOf(detailsOf(uneven), "months"))).toContainEqual(["Out of", "July: 1 season; August: 23 seasons; September: 1 season"]);
    expect(wordsOf(sectionOf(detailsOf(shared("no_calendar_fit")), "months"))).toContain("No monthly rain or temperature numbers are on record for this result.");
    const seasons = sectionOf(detailsOf(shared("plan")), "seasons");
    expect(wordsOf(seasons)).toContain(
      "Checked against 1 past season, July 2000. The target is 1 season, and at least 1 must be complete. Each season starts on your field-ready day in a past year and runs for your plan’s length. Method synthetic-v1.",
    );
    expect(blocksOf(seasons, "table")[0].rows).toEqual([["July 2000", "Used", "No data", "No data", "No data"]]);
    expect(wordsOf(sectionOf(insights, "seasons"))).toBe("Past seasons used\nPast seasons: A complete cohort was not assessed in this example.");
  });

  it("[R19] past seasons show each crop’s own F, M and X per season, with units and what each is out of, so the crop behind a season’s number can be seen", () => {
    const seasons = sectionOf(detailsOf(variant("temperature")), "seasons");
    const [, ...perCrop] = blocksOf(seasons, "table");
    expect(wordsOf(seasons)).toContain(
      "Each crop’s own numbers\nThe table above keeps the highest number among your crops for each season. These tables show each crop’s own numbers, so you can see which crop it came from.",
    );
    expect(perCrop.map(table => [table.caption, table.columns, table.rows])).toEqual([
      [
        "Synthetic crop, in the field 1 Jul to 4 Jul 2026, in each past season",
        ["Season", "Short weeks (F)", "Shortfall (M)", "Heat or cold (X)"],
        [["July 2000", "0%, over 1 window", "0%, over 1 window", "about 25%, over 4 days"]],
      ],
      [
        "Synthetic bean, in the field 1 Aug to 29 Oct 2026, in each past season",
        ["Season", "Short weeks (F)", "Shortfall (M)", "Heat or cold (X)"],
        [["July 2000", "about 30%, over 84 windows", "about 10%, over 84 windows", "Not available: No temperature limits for this crop in this example."]],
      ],
    ]);
    const labelled = blocksOf(sectionOf(detailsOf(variant("labels_warnings")), "seasons"), "table").slice(1).map(table => table.caption);
    expect(labelled).toEqual([
      "Example grain (dry), in the field 1 Jul to 4 Jul 2026, in each past season",
      "Example bean (green), in the field 1 Aug to 29 Oct 2026, in each past season",
    ]);
    for (const snapshot of [shared("plan"), shared("insufficient_data"), shared("no_calendar_fit")]) {
      expect(blocksOf(sectionOf(detailsOf(snapshot), "seasons"), "table").length, snapshot.id).toBeLessThanOrEqual(1);
      expect(wordsOf(sectionOf(detailsOf(snapshot), "seasons")), snapshot.id).not.toContain("Each crop’s own numbers");
    }
  });

  it("Your answers name the field and its weather point, the crops, the water answer, the field-ready day and last year", () => {
    expect(factsOf(sectionOf(detailsOf(shared("plan")), "answers"))).toEqual([
      ["Field", "Synthetic example field, weather point 15.005° N, 100.005° E"],
      ["Field corners", "4"],
      ["Crops", "Synthetic crop"],
      ["Water", "Rain only"],
      ["Field ready", "1 Jul 2026"],
      ["Last year", "1 crop"],
    ]);
    const lastYear = (snapshot: CompletedSnapshot) => factsOf(sectionOf(detailsOf(snapshot), "answers")).at(-1);
    expect(lastYear(shared("plan_with_warnings"))).toEqual(["Last year", "1 crop and 1 empty time"]);
    expect(lastYear(variant("skipped"))).toEqual(["Last year", "Skipped"]);
  });
});
