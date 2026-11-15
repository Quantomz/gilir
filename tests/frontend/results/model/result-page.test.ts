// [Rn] tags are F3's requirement rows, listed in docs/evidence/F3/README.md. `rg "\[R12\]" tests/frontend/results`
// finds every case for a row. TZ is pinned west of UTC, so a calendar date read as local time shows the day before.
process.env.TZ = "America/Los_Angeles";
import { describe, expect, it } from "vitest";
import { completedSnapshotSchema, parseIsoDate } from "@/contracts";
import type { CompletedSnapshot } from "@/contracts";
import type { Block, NoPlanSectionId, PlanSectionId, ResultPage, Section, YearBlock } from "@/features/results/model/blocks";
import { detailsPage } from "@/features/results/model/details-page";
import { resultPage } from "@/features/results/model/result-page";
import { formatIn } from "@/features/results/model/words";
import { syntheticLabel } from "@/fixtures/science";
import { textOf, sectionIds } from "../support/ports";
import { everySnapshot, frozenLabels, shared, variant, variantNames, withLabels } from "../support/variants";

// Type-level guard, checked by tsc in `npm run check`: these sections can never be on a no-plan page. If
// NoPlanSectionId ever admits one of them, this line stops compiling.
export const planOnlySections = ["flagged", "timeline", "ranking", "ready"] as const satisfies readonly Exclude<PlanSectionId, NoPlanSectionId>[];

const format = formatIn("en-GB");
const pageOf = (snapshot: CompletedSnapshot) => resultPage(snapshot, format);

function sectionOf(page: ResultPage, id: string): Section {
  const found = [...page.lead, ...page.more].find(section => section.id === id);
  if (found === undefined) throw new Error(`No ${id} section on this page.`);
  return found;
}

function blocksOf<K extends Block["kind"]>(section: Section, kind: K): Extract<Block, { readonly kind: K }>[] {
  return section.blocks.filter((block): block is Extract<Block, { readonly kind: K }> => block.kind === kind);
}

function yearsOf(page: ResultPage): YearBlock[] {
  return [...page.lead, ...page.more].flatMap(section => blocksOf(section, "year"));
}

/** A section's own words in reading order, through the same walk the word tests use. */
function wordsOf(section: Section): string {
  return textOf({ back: "", eyebrow: "", title: "", lead: "", synthetic: null, sections: [{ ...section, id: "numbers" }] });
}

function changed(base: CompletedSnapshot, result: (given: CompletedSnapshot["result"]) => unknown): CompletedSnapshot {
  return completedSnapshotSchema.parse({ ...base, result: result(base.result) });
}

const noPlanStates = ["insufficient_data", "no_calendar_fit", "search_incomplete", "service_error"] as const;
const noPlanNames = [...noPlanStates, "insights", "structural", "fatal", "no_fit_assessed"];

describe("every branch has its own page", () => {
  it("[R1] every variant parses with completedSnapshotSchema, and all but run_provenance keep provenance.kind synthetic and its label", () => {
    for (const name of variantNames) {
      const snapshot = variant(name);
      expect(completedSnapshotSchema.parse(snapshot)).toEqual(snapshot);
      expect(snapshot.schemaVersion, name).toBe(name.startsWith("labels_") ? 2 : 1);
      const { provenance } = snapshot.result.details;
      if (name === "run_provenance") expect(provenance.kind).toBe("run");
      else expect(provenance).toMatchObject({ kind: "synthetic", label: syntheticLabel });
    }
  });

  it("[R1] each of the six states has its own title and bold status label, with an icon name and words", () => {
    const expected = [
      ["plan", "Keep last year’s rotation", "This order passed every check we could run.", "check"],
      ["plan_with_warnings", "Your plan, with warnings", "With warnings.", "alert"],
      ["insufficient_data", "We can’t make a plan yet", "No plan yet.", "info"],
      ["no_calendar_fit", "Your crops don’t all fit in one year", "No plan.", "calendar"],
      ["search_incomplete", "We couldn’t finish the search", "No plan yet.", "grid"],
      ["service_error", "Something went wrong while making your plan", "No new plan.", "alert"],
    ] as const;
    for (const [state, title, label, icon] of expected) {
      const { head } = pageOf(shared(state));
      expect(head.title).toBe(title);
      expect(head.status.label).toBe(label);
      expect(head.status.icon).toBe(icon);
      expect(head.status.text.length).toBeGreaterThan(0);
    }
    expect(pageOf(variant("skipped")).head.title).toBe("Your plan");
  });

  it("[R1] section ids per state: plan pages lead [flagged?, timeline] and more [ranking, unchecked?, compared, ready?]; insufficient_data, no_calendar_fit, search_incomplete and service_error lead with missing, no_fit, stopped or failed", () => {
    expect(sectionIds(pageOf(shared("plan")))).toEqual({ lead: ["timeline"], more: ["ranking", "compared", "ready"] });
    expect(sectionIds(pageOf(shared("plan_with_warnings")))).toEqual({ lead: ["flagged", "timeline"], more: ["ranking", "compared", "ready"] });
    expect(sectionIds(pageOf(variant("temperature")))).toEqual({ lead: ["flagged", "timeline"], more: ["ranking", "unchecked", "compared", "ready"] });
    expect(sectionIds(pageOf(variant("no_preparation")))).toEqual({ lead: ["timeline"], more: ["ranking", "compared"] });
    expect(sectionIds(pageOf(shared("insufficient_data")))).toEqual({ lead: ["missing"], more: ["compared"] });
    expect(sectionIds(pageOf(variant("insights")))).toEqual({ lead: ["missing"], more: ["notes", "farm", "compared"] });
    expect(sectionIds(pageOf(shared("no_calendar_fit")))).toEqual({ lead: ["no_fit"], more: ["compared"] });
    expect(sectionIds(pageOf(shared("search_incomplete")))).toEqual({ lead: ["stopped"], more: ["compared"] });
    expect(sectionIds(pageOf(shared("service_error")))).toEqual({ lead: ["failed"], more: ["compared"] });
  });

  it("[R2] only plan and plan_with_warnings hold a year block with source plan or baseline; the other four fixtures and the insights, structural, fatal and no_fit_assessed variants hold none", () => {
    const withoutPlan: string[] = [];
    for (const { name, snapshot } of everySnapshot()) {
      const page = pageOf(snapshot);
      const sources = yearsOf(page).map(year => year.source);
      const planned = snapshot.result.state === "plan" || snapshot.result.state === "plan_with_warnings";
      expect(page.kind, name).toBe(planned ? "plan" : "no_plan");
      if (planned) {
        expect(sources, name).toContain("plan");
      } else {
        withoutPlan.push(name);
        expect(sources.filter(source => source !== "reported"), name).toEqual([]);
      }
    }
    expect(withoutPlan.sort()).toEqual([...noPlanNames].sort());
  });

  it("[R2][R18] a no-plan page has no ranking and no ready section, even when details.preparation is not empty", () => {
    const preparation = shared("plan").result.details.preparation;
    for (const name of noPlanStates) {
      const snapshot = changed(shared(name), result => ({ ...result, details: { ...result.details, preparation } }));
      expect(snapshot.result.details.preparation.length).toBeGreaterThan(0);
      const page = pageOf(snapshot);
      const ids = [...page.lead, ...page.more].map(section => section.id);
      for (const planOnly of planOnlySections) expect(ids, name).not.toContain(planOnly);
      expect(textOf(page)).not.toContain(preparation[0].text);
    }
  });

  it("[R3] in plan_with_warnings the flagged section comes before the timeline in lead, with the warning’s own message under its plain head", () => {
    const page = pageOf(shared("plan_with_warnings"));
    expect(page.lead.map(section => section.id)).toEqual(["flagged", "timeline"]);
    const [flags] = blocksOf(sectionOf(page, "flagged"), "items").filter(block => block.look === "flag");
    expect(flags.items).toEqual([
      { icon: "drop", head: "Rain fell short of what synthetic crop needs in past seasons", lines: ["Example rainfall warning."], href: null },
    ]);
  });

  it("[R4] a page holds no function anywhere: structuredClone of every page of every snapshot succeeds", () => {
    for (const { name, snapshot } of everySnapshot()) {
      const page = pageOf(snapshot);
      expect(structuredClone(page), name).toEqual(page);
      const details = detailsPage(snapshot, format);
      expect(structuredClone(details), name).toEqual(details);
    }
  });

  it("[R37] head.synthetic is provenance.label for every fixture and variant, and null for run_provenance", () => {
    for (const { name, snapshot } of everySnapshot()) {
      expect(pageOf(snapshot).head.synthetic, name).toBe(name === "run_provenance" ? null : syntheticLabel);
    }
  });
});

describe("head", () => {
  it("[R11] the plan fixture (baseline assessed and kept) is titled Keep last year’s rotation, its timeline Your rotation, kept, its ranking Why your rotation ranked first", () => {
    const page = pageOf(shared("plan"));
    expect(page.head.title).toBe("Keep last year’s rotation");
    expect(sectionOf(page, "timeline").title).toBe("Your rotation, kept");
    expect(sectionOf(page, "ranking").title).toBe("Why your rotation ranked first");
    const fresh = pageOf(variant("changed"));
    expect([fresh.head.title, sectionOf(fresh, "timeline").title, sectionOf(fresh, "ranking").title]).toEqual([
      "Your plan", "When to plant and harvest", "Why this plan ranked first",
    ]);
  });

  it("[R11] a kept plan_with_warnings is titled Keep last year’s rotation, with warnings", () => {
    const kept = changed(shared("plan_with_warnings"), result => ({
      ...result, details: { ...result.details, baseline: shared("plan").result.details.baseline },
    }));
    const page = pageOf(kept);
    expect(page.head.title).toBe("Keep last year’s rotation, with warnings");
    expect(page.head.status.label).toBe("With warnings.");
    expect(sectionOf(page, "timeline").title).toBe("Your rotation, kept");
  });

  it("[R1] the plan_with_warnings status names the measured size from the tuple: In past seasons, rain fell short of what the crops need in about 5 in 10 weeks.", () => {
    expect(pageOf(shared("plan_with_warnings")).head.status.text).toBe("In past seasons, rain fell short of what the crops need in about 5 in 10 weeks.");
  });

  it("[R1] a warnings plan whose mean_frequency is 0.9 says about 9 in 10 weeks, never in some weeks; the temperature variant names its share in a bad year, never at times", () => {
    const often = changed(shared("plan_with_warnings"), result => {
      if (result.state !== "plan_with_warnings") throw new Error("Expected a warnings plan.");
      const [first, ...rest] = result.plan.rankingTuple.components;
      return { ...result, plan: { ...result.plan, rankingTuple: { components: [{ ...first, value: 0.9 }, ...rest] } } };
    });
    const oftenText = pageOf(often).head.status.text;
    expect(oftenText).toBe("In past seasons, rain fell short of what the crops need in about 9 in 10 weeks.");
    const heatText = pageOf(variant("temperature")).head.status.text;
    expect(heatText).toBe(
      "In past seasons, rain fell short of what the crops need in about 3 in 10 weeks and temperatures went outside the limits for synthetic crop on about 8% of checked days in a bad year.",
    );
    for (const said of [oftenText, heatText]) {
      expect(said).not.toMatch(/some weeks|at times/);
    }
  });

  it("[R32] the no_calendar_fit status says Together they need at least 366 days; your year has 365.", () => {
    expect(pageOf(shared("no_calendar_fit")).head.status.text).toBe("Together they need at least 366 days; your year has 365.");
    expect(pageOf(variant("structural")).head.status.text).toBe("We tried every way to fit them into your year, and none fit.");
  });

  it("[R29] the service_error status uses failureWords for its code (retrieval_failed: We couldn’t get the weather records this time.) and never the failure’s message or code", () => {
    const page = pageOf(shared("service_error"));
    expect(page.head.status.text).toBe("We couldn’t get the weather records this time. It wasn’t anything you did.");
    expect(textOf(page)).not.toContain("Example source did not respond.");
    expect(textOf(page)).not.toContain("retrieval_failed");
    const fatal = pageOf(variant("fatal"));
    expect(fatal.head.status.text).toBe("The plan couldn’t be finished. It wasn’t anything you did.");
    expect(fatal.head.lead).toBeNull();
    expect(textOf(fatal)).not.toMatch(/Example processing failure|processing_failed/);
  });

  it("[R36] the eyebrow is Synthetic example field · Made 30 Jun 2026 (the local day west of UTC); the plan’s facts start Your year: 1 Jul 2026 to 30 Jun 2027", () => {
    const { head } = pageOf(shared("plan"));
    expect(head.eyebrow).toBe("Synthetic example field · Made 30 Jun 2026");
    expect(head.facts[0]).toBe("Your year: 1 Jul 2026 to 30 Jun 2027");
  });

  it("a no-plan head names Field ready: 1 Jul 2026 and computes no year", () => {
    for (const { name, snapshot } of everySnapshot()) {
      const { kind, head } = pageOf(snapshot);
      if (kind === "plan") continue;
      expect(head.facts[0], name).toBe("Field ready: 1 Jul 2026");
      expect(head.facts.join(" "), name).not.toContain("Your year");
      expect(head.lead, name).toBe(snapshot.result.state === "service_error" ? null : snapshot.result.details.explanation);
    }
  });

  it("a version 1 snapshot names crops by readable ids (Maize grain), each crop once, in the order the farmer picked them; the water label is the spec’s", () => {
    expect(pageOf(variant("several_crops")).head.facts.slice(1)).toEqual(["Maize grain, rice paddy and common bean dry", "Rain only"]);
    expect(pageOf(shared("plan")).head.facts.slice(1)).toEqual(["Synthetic crop", "Rain only"]);
    expect(pageOf(variant("context")).head.facts.slice(1)).toEqual(["Synthetic crop", "Rain + water when it’s dry"]);
    const rows = yearsOf(pageOf(variant("several_crops")))[0].rows.filter(row => row.mark !== null);
    expect(rows.map(row => [row.mark, row.head])).toEqual([
      ["1", "Maize grain"], ["2", "Common bean dry"], ["3", "Rice paddy"], ["4", "Maize grain"],
    ]);
  });
});

describe("frozen crop labels", () => {
  const readable = /synthetic crop|synthetic bean|maize grain|rice paddy|common bean dry/i;
  const allText = (snapshot: CompletedSnapshot) => `${textOf(pageOf(snapshot))}\n${textOf(detailsPage(snapshot, format))}`;
  const detailsSection = (snapshot: CompletedSnapshot, id: string) => {
    const found = detailsPage(snapshot, format).sections.find(section => section.id === id);
    if (found === undefined) throw new Error(`No ${id} section in details.`);
    return wordsOf(found);
  };

  it("a version 2 snapshot names its crops by their labels in the head, the year line rows and the answers, as written", () => {
    const several = variant("labels_several");
    expect(pageOf(several).head.facts.slice(1)).toEqual(["Maize (grain), Rice (paddy) and Common bean (dry grain)", "Rain only"]);
    const rows = yearsOf(pageOf(several))[0].rows;
    expect(rows.filter(row => row.mark !== null).map(row => [row.mark, row.head])).toEqual([
      ["1", "Maize (grain)"], ["2", "Common bean (dry grain)"], ["3", "Rice (paddy)"], ["4", "Maize (grain)"],
    ]);
    expect(rows.flatMap(row => row.lines)).toContain("No planned crop: the days after the Maize (grain) harvest.");
    expect(detailsSection(several, "answers")).toContain("Maize (grain), Rice (paddy) and Common bean (dry grain)");
    expect(detailsSection(several, "profiles").split("\n").filter(line => /\(.+\)$/.test(line))).toEqual(["Maize (grain)", "Common bean (dry grain)", "Rice (paddy)"]);
  });

  it("a version 2 snapshot names its crops by their labels in the status, the warnings, the ranking and the checks", () => {
    const page = pageOf(variant("labels_warnings"));
    expect(page.head.status.text).toContain("temperatures went outside the limits for Example grain (dry) on about 8% of checked days in a bad year");
    expect(wordsOf(sectionOf(page, "flagged"))).toContain("Rain fell short of what Example grain (dry) needs in past seasons");
    expect(wordsOf(sectionOf(page, "ranking"))).toContain("Outside the limits: Example grain (dry). Not assessed for Example bean (green).");
    expect(wordsOf(sectionOf(page, "unchecked"))).toContain("Heat and cold limits for Example bean (green)");
  });

  it("a version 2 snapshot names its crops by their labels in the baseline changes; synthetic-old, missing from its catalogue, keeps its readable name there, in last year’s moved line and in its profile", () => {
    const snapshot = variant("labels_changed");
    expect(snapshot.schemaVersion === 2 && snapshot.catalogue.entries.map(entry => entry.id)).toEqual(["synthetic-crop", "synthetic-bean"]);
    const compared = wordsOf(sectionOf(pageOf(snapshot), "compared"));
    for (const line of [
      "Added: Example grain (dry), 1 Mar to 20 Jun 2027.",
      "Not in the new plan: synthetic old, 20 Jun to 15 Aug 2026 in last year’s rotation.",
      "Plant Example bean (green) 75 days later: 15 Nov 2026 instead of 1 Sept 2026.",
      "Example grain (dry) moves from third to first in the order.",
    ]) expect(compared).toContain(line);
    const moved = yearsOf(pageOf(snapshot)).find(year => year.source === "baseline");
    expect(moved?.rows.filter(row => row.mark !== null).map(row => row.head)).toEqual(["Synthetic old", "Example bean (green)", "Example grain (dry)"]);
    expect(detailsSection(snapshot, "profiles").split("\n").filter(line => /^(Example|Synthetic)/.test(line))).toEqual(["Example grain (dry)", "Example bean (green)", "Synthetic old"]);
  });

  it("every fixture and variant made version 2 with every crop labelled names no crop by its readable id, on the page or in details", () => {
    for (const { name, snapshot } of everySnapshot()) {
      const labelled = withLabels(snapshot);
      const text = allText(labelled);
      expect(text, name).not.toMatch(readable);
      const named = Object.values(frozenLabels).filter(label => text.includes(label));
      expect(named.length, `${name} names a crop by its label`).toBeGreaterThan(0);
    }
  });

  it("no result page, in version 1 or with every crop labelled, shows a raw crop id anywhere", () => {
    for (const { name, snapshot } of everySnapshot()) {
      for (const shown of [snapshot, withLabels(snapshot)]) {
        const text = textOf(pageOf(shown));
        const raw = cropIdsIn(shown).filter(id => new RegExp(`(?<![\\w-])${id}(?![\\w-])`).test(text));
        expect(raw, `${name}, version ${shown.schemaVersion}`).toEqual([]);
      }
    }
  });

  it("every version 1 fixture and variant names no crop by a frozen label", () => {
    for (const { name, snapshot } of everySnapshot()) {
      if (snapshot.schemaVersion === 2) continue;
      const text = allText(snapshot);
      for (const label of Object.values(frozenLabels)) expect(text, name).not.toContain(label);
    }
  });
});

function cropIdsIn(snapshot: CompletedSnapshot): string[] {
  const { input, result } = snapshot;
  const { details } = result;
  const history = input.history.kind === "recorded" ? input.history.entries : [];
  return [...new Set([
    ...input.cropPurposeIds,
    ...history.flatMap(entry => (entry.kind === "crop" && entry.crop.kind === "catalogue" ? [entry.crop.cropPurposeId] : [])),
    ...(result.state === "plan" || result.state === "plan_with_warnings" ? result.plan.occurrences.map(occurrence => occurrence.cropPurposeId) : []),
    ...[...details.unassessedChecks, ...(result.state === "insufficient_data" ? result.missing : [])].flatMap(gap => gap.cropPurposeIds),
    ...details.warnings.flatMap(warning => warning.cropPurposeIds),
    ...(snapshot.schemaVersion === 2 ? snapshot.catalogue.entries.map(entry => entry.id) : []),
  ])];
}

describe("warnings and checks", () => {
  it("[R3] flags come first, then Also good to know with the context codes; a plan with context notes only is titled Good to know and has no strictness lead", () => {
    const flagged = sectionOf(pageOf(shared("plan_with_warnings")), "flagged");
    expect(flagged.title).toBe("What we flagged");
    expect(flagged.look).toBe("flagged");
    expect(wordsOf(flagged).split("\n")).toEqual([
      "What we flagged",
      "We flag a crop if, in any past season, even one week had less rain than it needs, or a temperature outside its limits. The check is strict, so most plans have warnings.",
      "Rain fell short of what synthetic crop needs in past seasons",
      "Example rainfall warning.",
      "A warning doesn’t mean the crop fails, and it isn’t a prediction for next season. It shows where past seasons fell short, so you know what to watch.",
      "Also good to know",
      "The search stopped at its limit",
      "Example search stopped at its scoring budget.",
    ]);
    const notes = sectionOf(pageOf(variant("context")), "flagged");
    expect(notes.title).toBe("Good to know");
    expect(notes.look).toBe("card");
    expect(wordsOf(notes)).not.toContain("We flag a crop");
    expect(wordsOf(notes)).not.toContain("Also good to know");
    expect(wordsOf(notes)).toContain("A limit of the growing details for synthetic crop\nExample water check note.");
    expect(wordsOf(notes)).not.toContain("What the water check leaves out");
  });

  it("[R39] a no-plan result shows its warnings under Good to know after the actions: the insights variant’s backup water note, in every no-plan state", () => {
    const insights = pageOf(variant("insights"));
    const notes = sectionOf(insights, "notes");
    expect(insights.more[0]).toBe(notes);
    expect(notes.look).toBe("card");
    expect(wordsOf(notes)).toBe("Good to know\nYour backup water isn’t counted\nExample backup water note.");
    const water = { code: "water_context", message: "Example rain-only note.", cropPurposeIds: [], ruleIds: [], metricIds: [] };
    for (const state of noPlanStates) {
      const page = pageOf(changed(shared(state), result => ({ ...result, details: { ...result.details, warnings: [water] } })));
      expect(wordsOf(sectionOf(page, "notes")), state).toBe("Good to know\nYour backup water isn’t counted\nExample rain-only note.");
      expect(sectionIds(pageOf(shared(state))).more, state).not.toContain("notes");
    }
  });

  it("[R8] on search_incomplete the search-limit warning is not repeated under Good to know, because Where the search stopped says it; other warnings still show", () => {
    const limit = { code: "search_limit", message: "Example limit message.", cropPurposeIds: [], ruleIds: [], metricIds: [] };
    const water = { code: "water_context", message: "Example rain-only note.", cropPurposeIds: [], ruleIds: [], metricIds: [] };
    const withBoth = (state: (typeof noPlanStates)[number]) => pageOf(changed(shared(state), result => ({ ...result, details: { ...result.details, warnings: [limit, water] } })));
    const stopped = withBoth("search_incomplete");
    expect(textOf(stopped)).not.toContain("Example limit message.");
    expect(wordsOf(sectionOf(stopped, "notes"))).toBe("Good to know\nYour backup water isn’t counted\nExample rain-only note.");
    expect(wordsOf(sectionOf(withBoth("insufficient_data"), "notes"))).toContain("The search stopped at its limit\nExample limit message.");
    expect(sectionIds(pageOf(changed(shared("search_incomplete"), result => ({ ...result, details: { ...result.details, warnings: [limit] } })))).more).not.toContain("notes");
  });

  it("[R39] the context variant shows Your backup water isn’t counted as a note, not a flag, and its ranking rows equal the same plan without backup water", () => {
    const page = pageOf(variant("context"));
    const lists = blocksOf(sectionOf(page, "flagged"), "items");
    expect(lists.map(list => list.look)).toEqual(["plain"]);
    expect(lists[0].items.map(item => item.head)).toContain("Your backup water isn’t counted");
    expect(page.head.status.label).toBe("This order passed every check we could run.");
    expect(sectionOf(page, "ranking")).toEqual(sectionOf(pageOf(shared("plan")), "ranking"));
  });

  it("[R8] the warnings fixture shows The search stopped at its limit in flagged and, last in the ranking card, We stopped at our search limit. This is the best plan we found, not proven to be the best.", () => {
    const page = pageOf(shared("plan_with_warnings"));
    expect(wordsOf(sectionOf(page, "flagged"))).toContain("The search stopped at its limit");
    expect(sectionOf(page, "ranking").blocks.at(-1)).toEqual({
      kind: "note", tone: "info", icon: "grid", strong: "We stopped at our search limit.",
      text: "This is the best plan we found, not proven to be the best. We tried planting dates every 7 days.",
    });
    expect(sectionOf(pageOf(shared("plan")), "ranking").blocks.some(block => block.kind === "note" && block.icon === "grid")).toBe(false);
  });

  it("[R8] the limit_plan variant shows the same disclosure on a plan without flags", () => {
    const page = pageOf(variant("limit_plan"));
    expect(page.head.status.label).toBe("This order passed every check we could run.");
    const notes = sectionOf(page, "flagged");
    expect(notes.title).toBe("Good to know");
    expect(wordsOf(notes)).toContain("The search stopped at its limit");
    expect(sectionOf(page, "ranking").blocks.at(-1)).toMatchObject({
      kind: "note", strong: "We stopped at our search limit.", text: expect.stringMatching(/^This is the best plan we found, not proven to be the best\./),
    });
  });

  it("[R9] the temperature variant shows its temperature_rule gap under What we couldn’t check on the main page", () => {
    const page = pageOf(variant("temperature"));
    expect(page.more.map(section => section.id)).toContain("unchecked");
    const unchecked = sectionOf(page, "unchecked");
    expect(unchecked.title).toBe("What we couldn’t check");
    expect(blocksOf(unchecked, "items")[0].items).toEqual([
      { icon: "heat", head: "Heat and cold limits for synthetic bean", lines: ["No temperature limits for this crop in this example."], href: null },
    ]);
  });

  it("[R9] a crop_profile gap reads F3’s own sentence under its head, never the engine’s reason, in each form the engine writes it", () => {
    const ownLine = "We can’t use any yet. They say when to plant it, how long it grows and how much water it needs.";
    const insights = variant("insights");
    expect(wordsOf(sectionOf(pageOf(insights), "missing"))).toContain(`Growing details for synthetic crop in this place\n${ownLine}`);
    expect(wordsOf(sectionOf(pageOf(withLabels(insights)), "missing"))).toContain(`Growing details for Example grain (dry) in this place\n${ownLine}`);
    const engineReasons = [
      "synthetic-crop is not in catalogue example-catalogue-v1.",
      "No released synthetic-crop profile can be confirmed for this location because the climate data its applicability needs is unavailable.",
      "No released synthetic-crop profile applies at this location.",
      "Ambiguous profile precedence for synthetic-crop: synthetic-crop-a, synthetic-crop-b.",
      "A selected crop has no applicable released profile.",
      "Crop profile synthetic-crop-profile (synthetic-v1) was not supplied.",
      "Occupancy of 120 days matches 0 distinct generated stage allocations in profile synthetic-crop-profile.",
    ];
    for (const reason of engineReasons) {
      const gap = { code: "crop_profile", reason, cropPurposeIds: ["synthetic-crop"], sourceIds: [] };
      const snapshot = changed(insights, result => ({ ...result, missing: [gap], details: { ...result.details, unassessedChecks: [gap] } }));
      const text = textOf(pageOf(snapshot));
      expect(text, reason).not.toContain(reason);
      expect(text, reason).not.toMatch(/synthetic-crop/);
      expect(text.split(ownLine), reason).toHaveLength(2);
    }
    const both = { code: "crop_profile", reason: "Example reason.", cropPurposeIds: ["synthetic-crop", "synthetic-bean"], sourceIds: [] };
    const twoCrops = changed(insights, result => ({ ...result, missing: [both] }));
    expect(wordsOf(sectionOf(pageOf(twoCrops), "missing"))).toContain(
      "Growing details for synthetic crop and synthetic bean in this place\nWe can’t use any yet. They say when to plant them, how long they grow and how much water they need.",
    );
  });

  it("[R9] insufficient_data lists its gap once: under What’s missing, not again under What we couldn’t check", () => {
    const page = pageOf(shared("insufficient_data"));
    expect(textOf(page).split("Enough complete past seasons of weather")).toHaveLength(2);
    expect(wordsOf(sectionOf(page, "missing"))).toContain("No complete weather season in this example.");
    expect(sectionIds(page).more).not.toContain("unchecked");
    expect(textOf(pageOf(variant("insights"))).split("Growing details for synthetic crop in this place")).toHaveLength(2);
  });

  it("[R10] a crop with a temperature_rule gap reads Not assessed; the heat row is left out when the result holds neither the metric nor a temperature gap", () => {
    const heatOf = (snapshot: CompletedSnapshot) =>
      blocksOf(sectionOf(pageOf(snapshot), "ranking"), "ranks").flatMap(block => block.ranks).find(rank => rank.question === "Heat and cold");
    expect(heatOf(variant("temperature"))?.explain).toContain("Not assessed for synthetic bean.");
    const unruled = changed(variant("skipped"), result => ({
      ...result,
      details: {
        ...result.details,
        unassessedChecks: [{ code: "temperature_rule", reason: "No temperature limits for this crop in this example.", cropPurposeIds: ["synthetic-crop"], sourceIds: [] }],
      },
    }));
    expect(heatOf(unruled)).toMatchObject({ value: "Not assessed", explain: "Not assessed for synthetic crop." });
    expect(heatOf(shared("plan"))).toBeUndefined();
    expect(textOf(pageOf(shared("plan")))).not.toContain("Heat and cold");
  });
});

describe("ranking", () => {
  const rows = (snapshot: CompletedSnapshot) => {
    const [ranked] = blocksOf(sectionOf(pageOf(snapshot), "ranking"), "ranks").filter(block => block.numbered);
    return ranked.ranks.map(rank => [rank.question, rank.value]);
  };

  it("[R5] four numbered rows in tuple order with the tuple’s values: Never, None, 361 days, 361 days for the plan fixture; About 5 in 10 weeks and About 25% for the warnings fixture", () => {
    expect(rows(shared("plan"))).toEqual([
      ["How often rain fell below what the crops need", "Never"],
      ["How big the shortfall was", "None"],
      ["Days without a planned crop", "361 days"],
      ["Longest stretch without a planned crop", "361 days"],
    ]);
    expect(rows(shared("plan_with_warnings")).map(([, value]) => value)).toEqual(["About 5 in 10 weeks", "About 25%", "361 days", "361 days"]);
    expect(rows(variant("changed")).map(([, value]) => value)).toEqual(["Never", "None", "43 days", "17 days"]);
  });

  it("[R5] the temperature variant shows In a bad year and Heat and cold under Shown, but not used to rank, with the metrics’ own values", () => {
    const ranking = sectionOf(pageOf(variant("temperature")), "ranking");
    const at = ranking.blocks.findIndex(block => block.kind === "subhead" && block.text === "Shown, but not used to rank");
    expect(at).toBeGreaterThan(0);
    const after = ranking.blocks[at + 1];
    if (after.kind !== "ranks") throw new Error("Expected the rows that are not ranked.");
    expect(after.numbered).toBe(false);
    expect(after.ranks.map(rank => [rank.question, rank.value])).toEqual([["In a bad year", "About 18%"], ["Heat and cold", "About 8% of checked days"]]);
  });

  it("[R6] the fixed-order note is present and no text offers a choice of order", () => {
    for (const { name, snapshot } of everySnapshot()) {
      const page = pageOf(snapshot);
      if (page.kind === "plan") {
        expect(blocksOf(sectionOf(page, "ranking"), "note").map(note => note.text), name).toContain(
          "We compare plans in one fixed order: water first, then days without a crop. You don’t choose it.",
        );
      }
      expect(textOf(page), name).not.toMatch(/priorit|(choose|pick|select|change) (the|your|an) order/i);
    }
  });

  it("[R7] the plan fixture’s cohort line reads Checked against 1 past season, July 2000.", () => {
    expect(blocksOf(sectionOf(pageOf(shared("plan")), "ranking"), "text").map(block => block.text)).toContain(
      "Checked against 1 past season, July 2000. From past seasons, not a prediction. Checked with rain alone.",
    );
  });

  it("[R7] an unavailable cohort prints its reason and never 0 seasons", () => {
    const unavailable = changed(shared("plan"), result => ({
      ...result, details: { ...result.details, cohort: { kind: "unavailable", reason: "No cohort in this example." } },
    }));
    const ranking = wordsOf(sectionOf(pageOf(unavailable), "ranking"));
    expect(ranking).toContain("Past seasons: No cohort in this example. From past seasons, not a prediction.");
    const excluded = changed(shared("plan"), result => {
      if (result.details.cohort.kind !== "available") throw new Error("Expected an available cohort.");
      const { value } = result.details.cohort;
      return {
        ...result,
        details: {
          ...result.details,
          cohort: { kind: "available", value: { ...value, seasons: value.seasons.map(season => ({ ...season, status: "excluded", reason: "Too many missing days." })) } },
        },
      };
    });
    expect(wordsOf(sectionOf(pageOf(excluded), "ranking"))).toContain("No complete past season could be used.");
    expect(wordsOf(sectionOf(pageOf(variant("insights")), "farm"))).toContain(
      "Past seasons: A complete cohort was not assessed in this example. From past seasons, not a prediction.",
    );
    for (const snapshot of [unavailable, excluded, variant("insights")]) {
      expect(textOf(pageOf(snapshot))).not.toMatch(/\b0 (past )?seasons?\b/);
    }
  });

  it("[R42] details.explanation is shown in the ranking section as given", () => {
    for (const { name, snapshot } of everySnapshot()) {
      const page = pageOf(snapshot);
      if (page.kind !== "plan") continue;
      expect(sectionOf(page, "ranking").blocks[0], name).toEqual({ kind: "text", look: "body", text: snapshot.result.details.explanation });
    }
  });

  it("[R36] a calendar date inside engine text is shown the reader’s way, and nothing else in the text changes", () => {
    const dated = changed(shared("plan"), result => ({
      ...result, details: { ...result.details, explanation: "Planted on 2026-07-01 in run 2026-13-01." },
    }));
    expect(sectionOf(pageOf(dated), "ranking").blocks[0]).toMatchObject({ text: "Planted on 1 Jul 2026 in run 2026-13-01." });
  });

  it("[R41] every number on a plan page is a value of the snapshot: tuple components, metrics by id, deltas, cohort count; a tuple that disagrees with details.metrics shows the tuple’s values", () => {
    const disagreeing = changed(shared("plan_with_warnings"), result => ({
      ...result,
      details: { ...result.details, metrics: result.details.metrics.map(metric => ({ ...metric, value: { kind: "available", value: 0.9 } })) },
    }));
    expect(rows(disagreeing)[0][1]).toBe("About 5 in 10 weeks");
    expect(pageOf(disagreeing).head.status.text).toContain("about 5 in 10 weeks");
    const compared = wordsOf(sectionOf(pageOf(variant("changed")), "compared"));
    expect(compared).toContain("74 days fewer with this plan (better)");
    expect(compared).toContain("This plan: 0%");
  });
});

describe("compared with last year", () => {
  it("[R11] kept: Last year’s rotation ranked first, so we suggest keeping it., How they compare, and No changes; no second year line", () => {
    const compared = sectionOf(pageOf(shared("plan")), "compared");
    expect(blocksOf(compared, "note")[0]).toMatchObject({ tone: "ok", icon: "check", text: "Last year’s rotation ranked first, so we suggest keeping it." });
    expect(blocksOf(compared, "subhead").map(block => block.text)).toEqual(["How they compare", "Changes from last year"]);
    expect(wordsOf(compared)).toContain("No changes: the same crops, order and dates as last year.");
    expect(blocksOf(compared, "year")).toEqual([]);
  });

  it("[R12] changed: one line each for added, removed, date_shift and order_change in snapshot order, and two year lines, This plan and Last year’s rotation, moved to this year", () => {
    const compared = sectionOf(pageOf(variant("changed")), "compared");
    const changes = blocksOf(compared, "items").at(-1);
    expect(changes?.items.map(item => [item.icon, item.head])).toEqual([
      ["plus", "Added: synthetic crop, 1 Mar to 20 Jun 2027."],
      ["minus", "Not in the new plan: synthetic old, 20 Jun to 15 Aug 2026 in last year’s rotation."],
      ["calendar", `Plant synthetic bean 75 days later: 15 Nov 2026 instead of ${format.day(parseIsoDate("2026-09-01"))}.`],
      ["swap", "Synthetic crop moves from third to first in the order."],
    ]);
    const years = blocksOf(compared, "year");
    expect(years.map(year => [year.source, year.caption])).toEqual([["plan", "This plan"], ["baseline", "Last year’s rotation, moved to this year"]]);
    const [thisPlan, lastYear] = years;
    expect(thisPlan.rows).toEqual([]);
    expect(lastYear.rows.map(row => [row.head, ...row.lines])).toEqual([
      ["Synthetic old", "In the field 20 Jun to 15 Aug 2026 · 57 days"],
      ["No crop", "16 Aug to 31 Aug 2026 · 16 days"],
      ["Synthetic bean", "In the field 1 Sept to 30 Nov 2026 · 91 days"],
      ["No crop", "1 Dec 2026 to 9 Jan 2027 · 40 days"],
      ["Synthetic crop", "In the field 10 Jan to 30 Apr 2027 · 111 days"],
      ["No crop", "1 May to 30 Jun 2027 · 61 days"],
    ]);
    expect(lastYear.bars[0]).toMatchObject({ look: "crop", from: 0, mark: "1" });
  });

  it("[R12] no row under Compared with last year tells the farmer to plant or harvest, and the plan’s rows are said once on the page", () => {
    for (const name of ["changed", "no_recommendation"] as const) {
      const page = pageOf(variant(name));
      const rows = blocksOf(sectionOf(page, "compared"), "year").flatMap(year => year.rows);
      expect(rows.length, name).toBeGreaterThan(0);
      for (const row of rows) expect([row.head, ...row.lines].join(" "), name).not.toMatch(/\b(Plant|Harvest|free again)\b/);
      const planRows = yearsOf(page).filter(year => year.source === "plan").flatMap(year => year.rows);
      expect(planRows, name).toEqual(blocksOf(sectionOf(page, "timeline"), "year")[0].rows);
    }
  });

  it("[R13] plan_with_warnings (not_assessable): its reason, then the reported year with Synthetic unlisted crop (not on our crop list), Field empty, as you said, and Not sure rows, and no number", () => {
    const compared = sectionOf(pageOf(shared("plan_with_warnings")), "compared");
    const said = wordsOf(compared);
    expect(said).toContain("We couldn’t score last year’s rotation:\nThe reported crop has no supported example profile.");
    const [reported] = blocksOf(compared, "year");
    expect(reported.source).toBe("reported");
    expect(reported.rows.map(row => [row.head, row.lines])).toEqual([
      ["Synthetic unlisted crop (not on our crop list)", ["Planted about 1 Jul 2025 · Harvested about 4 Jul 2025"]],
      ["Field empty, as you said", ["5 Jul to 31 Jul 2025 · 27 days"]],
      ["Not sure: nothing recorded", ["1 Aug 2025 to 30 Jun 2026 · 334 days"]],
    ]);
    expect(reported.bars.map(bar => bar.look)).toEqual(["unlisted", "empty", "not_sure"]);
    expect(said).not.toMatch(/How they compare|This plan:|with this plan/);
  });

  it("[R14] skipped: You skipped last year, so we didn’t compare. and nothing else", () => {
    expect(wordsOf(sectionOf(pageOf(variant("skipped")), "compared"))).toBe("Compared with last year\nYou skipped last year, so we didn’t compare.");
  });

  it("[R15] a baseline that is not eligible is shown for comparison only, never as ranked behind the plan, in the engine's shape (recommendation changed) and in no_recommendation", () => {
    const engineShape = variant("no_recommendation");
    const engineBaseline = engineShape.result.details.baseline;
    expect(engineBaseline).toMatchObject({ kind: "assessed", eligible: false, recommendation: "changed" });
    const schemaShape = changed(engineShape, result => ({
      ...result,
      details: { ...result.details, baseline: { ...engineBaseline, recommendation: "no_recommendation" } },
    }));
    for (const snapshot of [engineShape, schemaShape]) {
      const page = pageOf(snapshot);
      expect(page.head.title).toBe("Your plan");
      const compared = sectionOf(page, "compared");
      expect(blocksOf(compared, "note")[0].text).toBe(
        "Last year’s rotation is shown for comparison only. It can’t be the suggestion, because it doesn’t meet every rule for a plan.",
      );
      expect(textOf(page)).not.toContain("ranked ahead");
      expect(blocksOf(compared, "year").map(year => year.source)).toEqual(["plan", "baseline"]);
    }
  });

  it("[R15] a baseline marked kept but not eligible is never titled as kept: Your plan, When to plant and harvest, Why this plan ranked first", () => {
    const keptButIneligible = changed(shared("plan"), result => ({
      ...result,
      details: { ...result.details, baseline: { ...result.details.baseline, eligible: false } },
    }));
    expect(keptButIneligible.result.details.baseline).toMatchObject({ kind: "assessed", eligible: false, recommendation: "kept" });
    const page = pageOf(keptButIneligible);
    expect(page.head.title).toBe("Your plan");
    expect(sectionOf(page, "timeline").title).toBe("When to plant and harvest");
    expect(sectionOf(page, "ranking").title).toBe("Why this plan ranked first");
    expect(textOf(page)).not.toContain("kept");
    expect(detailsPage(keptButIneligible, format).lead).toContain("“Your plan”");
  });

  it("[R16] a delta of 0 reads The same; an unavailable delta reads Not compared: reason; a descriptive delta has no better or worse; no page contains a percentage improvement", () => {
    expect(wordsOf(sectionOf(pageOf(shared("plan")), "compared"))).toContain("Weeks with less rain than the crops need\nThis plan: 0%\nLast year’s rotation: 0%\nThe same");
    const deltas = blocksOf(sectionOf(pageOf(variant("changed")), "compared"), "items")[0];
    expect(deltas.items.map(item => [item.head, item.lines.at(-1)])).toEqual([
      ["Weeks with less rain than the crops need", "Not compared: No usable rain windows for last year in this example."],
      ["Days without a planned crop", "74 days fewer with this plan (better)"],
      ["Crop families", "1 fewer with this plan"],
    ]);
    const higher = changed(variant("changed"), result => {
      if (result.details.baseline.kind !== "assessed") throw new Error("Expected an assessed baseline.");
      return {
        ...result,
        details: {
          ...result.details,
          baseline: { ...result.details.baseline, deltas: [{ metricId: "legume_crop_count", difference: { kind: "available", value: 2 }, unit: "count", direction: "higher_preferred" }] },
        },
      };
    });
    expect(wordsOf(sectionOf(pageOf(higher), "compared"))).toContain("Bean-family plantings\n2 more with this plan (better)");
    for (const { name, snapshot } of everySnapshot()) {
      expect(textOf(pageOf(snapshot)), name).not.toMatch(/improve|\d\s?%\s*(better|worse|fewer|more|lower|higher)/i);
    }
  });

  it("[R17] approximateDates adds so this comparison is approximate too; a baseline that was not scored gets only You said some of last year’s dates are approximate.", () => {
    const estimate = (snapshot: CompletedSnapshot) =>
      blocksOf(sectionOf(pageOf(snapshot), "compared"), "note").find(note => note.strong === "Your dates are estimates.")?.text;
    expect(estimate(shared("plan"))).toBe("You said some of last year’s dates are approximate, so this comparison is approximate too.");
    expect(estimate(shared("plan_with_warnings"))).toBe("You said some of last year’s dates are approximate.");
    expect(estimate(variant("changed"))).toBeUndefined();
  });

  it("[R2][R16] no_fit_assessed: the compared section says there is no new plan to compare with and shows the reported year only, with no delta, change or baseline line", () => {
    const compared = sectionOf(pageOf(variant("no_fit_assessed")), "compared");
    const said = wordsOf(compared);
    expect(said).toContain("There is no new plan to compare last year’s rotation with.");
    expect(blocksOf(compared, "year").map(year => year.source)).toEqual(["reported"]);
    expect(said).not.toMatch(/How they compare|Changes from last year|with this plan|approximate too/);
  });
});

describe("preparation and no-plan reasons", () => {
  it("[R18] Get ready lists details.preparation texts as given; the no_preparation variant has no ready section and no advice text anywhere", () => {
    expect(blocksOf(sectionOf(pageOf(shared("plan")), "ready"), "steps")[0].steps).toEqual(["Example preparation text for layout tests."]);
    const page = pageOf(variant("no_preparation"));
    expect(sectionIds(page).more).not.toContain("ready");
    expect(textOf(page)).not.toMatch(/Get ready|Example preparation/);
  });

  it("[R30] insufficient_data says making the plan again gives the same answer until new data is available; its page never says try again", () => {
    for (const snapshot of [shared("insufficient_data"), variant("insights")]) {
      const page = pageOf(snapshot);
      expect(wordsOf(sectionOf(page, "missing"))).toContain(
        "Making the plan again gives the same answer until new data is available. You can change your answers, for example to other crops.",
      );
      expect(textOf(page)).not.toMatch(/try again/i);
    }
  });

  it("[R31] the insights variant shows its monthly values in What we know about your farm, and its interrupted search as missing data, never a limit", () => {
    const page = pageOf(variant("insights"));
    const farm = sectionOf(page, "farm");
    expect(farm.title).toBe("What we know about your farm");
    const [table] = blocksOf(farm, "table");
    expect(table.columns).toEqual(["Month", "Usual rain", "Dry year", "Wet year", "Mean temperature"]);
    expect(table.rows).toEqual([
      ["July", "180", "90", "260", "28.5"],
      ["August", "210", "120", "300", "28.1"],
      ["September", "240", "150", "330", "27.9"],
    ]);
    expect(table.caption).toBe("Month by month for the area around your field: rain in mm and mean temperature in °C");
    expect(wordsOf(farm)).toContain("Weather records from July 2000 to June 2024.");
    expect(wordsOf(farm)).toContain("Wet days\nJuly 2000 to June 2024: about 55%");
    expect(wordsOf(sectionOf(page, "missing"))).toContain("The comparison of plans stopped part way, because required data was missing.");
    expect(textOf(page)).not.toMatch(/limit/i);
  });

  it("[R21] an unavailable value prints Not available: reason, never 0", () => {
    const reason = "No bad-year value in this example.";
    const missingBadYear = changed(variant("temperature"), result => ({
      ...result,
      details: {
        ...result.details,
        metrics: result.details.metrics.map(metric => (metric.id === "q90_mismatch" ? { ...metric, value: { kind: "unavailable", reason } } : metric)),
      },
    }));
    const badYear = blocksOf(sectionOf(pageOf(missingBadYear), "ranking"), "ranks").flatMap(block => block.ranks).find(rank => rank.question === "In a bad year");
    expect(badYear).toMatchObject({ value: "Not available", explain: reason });
    const monthGone = changed(variant("insights"), result => ({
      ...result,
      details: {
        ...result.details,
        insights: result.details.insights.map(insight => (insight.metric.id === "monthly_rain_p10" && insight.month === 8
          ? { ...insight, metric: { ...insight.metric, value: { kind: "unavailable", reason: "No complete monthly sample." } } }
          : insight)),
      },
    }));
    const [table] = blocksOf(sectionOf(pageOf(monthGone), "farm"), "table");
    expect(table.rows[1]).toEqual(["August", "210", "Not available: No complete monthly sample.", "300", "28.1"]);
  });

  it("[R32] the duration proof shows 366 and 365 as two boxes and the crop’s minimum; the structural variant lists its constraints as given and how many ways were checked", () => {
    const noFit = sectionOf(pageOf(shared("no_calendar_fit")), "no_fit");
    expect(blocksOf(noFit, "versus")[0].sides).toEqual([
      { value: "366", caption: "days your crops need, at least", tone: "warn" },
      { value: "365", caption: "days in your year", tone: "plain" },
    ]);
    expect(wordsOf(noFit)).toContain("Each crop needs at least:\nSynthetic crop: 366 days");
    const structural = sectionOf(pageOf(variant("structural")), "no_fit");
    expect(blocksOf(structural, "versus")).toEqual([]);
    expect(blocksOf(structural, "items")[0].items.map(item => item.head)).toEqual([
      "Example constraint about the first crop.", "Example constraint about the second crop.",
    ]);
    expect(wordsOf(structural)).toContain("We checked 1,234 ways of placing them.");
    for (const section of [noFit, structural]) {
      expect(wordsOf(section)).toContain("Choose fewer crops, or crops that grow faster, then make the plan again.");
    }
  });

  it("[R8][R30] search_incomplete shows We stopped after 10 tries at fitting your crops into your year (our limit is 10), that a stopped search is not proof, and how to try again", () => {
    expect(wordsOf(sectionOf(pageOf(shared("search_incomplete")), "stopped")).split("\n")).toEqual([
      "Where the search stopped",
      "We stopped after 10 tries at fitting your crops into your year (our limit is 10), before we found an order that fits.",
      "A stopped search doesn’t show that your crops can’t fit.",
      "To try again, tap Change my answers, then Make my plan on the last page. You don’t have to change anything.",
    ]);
  });

  it("[R30] a retryable service_error says how to try again through Change my answers; the fatal variant says to change the answers", () => {
    const tryAgain = "To try again, tap Change my answers, then Make my plan on the last page. You don’t have to change anything.";
    expect(wordsOf(sectionOf(pageOf(shared("service_error")), "failed"))).toContain(tryAgain);
    const fatal = wordsOf(sectionOf(pageOf(variant("fatal")), "failed"));
    expect(fatal).toContain("Making the plan again may give the same result. You can change your answers and try.");
    expect(fatal).not.toContain(tryAgain);
  });
});
