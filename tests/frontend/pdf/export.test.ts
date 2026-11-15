import { PDFDocument, PDFString } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportPdf, preparePdf } from "@/client/pdf";
import { renderPdf } from "@/client/pdf/render";
import type { Reader } from "@/client/pdf/text";
import { localPlans } from "@/client/storage";
import { completedSnapshotSchema } from "@/contracts/result";
import type { CompletedSnapshot } from "@/contracts/result";
import { completedSnapshotsByState } from "@/fixtures/results";
import { syntheticLabel } from "@/fixtures/science";
import { readPdf } from "./support/read-pdf";
import type { ReadPage, ReadPdf } from "./support/read-pdf";
import { britishReader, variant, variantNames } from "./support/variants";

const states = ["plan", "plan_with_warnings", "insufficient_data", "no_calendar_fit", "search_incomplete", "service_error"] as const;
type State = (typeof states)[number];
const noPlanStates = ["insufficient_data", "no_calendar_fit", "search_incomplete", "service_error"] as const;
const statusReport = "This is a status report. No calendar is shown, because no plan was made.";

const read = async (snapshot: CompletedSnapshot, reader: Reader = britishReader) => readPdf(await renderPdf(snapshot, reader));
const fixtures = new Map<State, Promise<ReadPdf>>();
function fixture(state: State): Promise<ReadPdf> {
  if (!fixtures.has(state)) fixtures.set(state, read(completedSnapshotsByState[state]));
  return fixtures.get(state)!;
}

function body(page: ReadPage) {
  const number = page.runs.find(run => /^Page \d+ of \d+$/.test(run.text));
  if (!number) throw new Error("a page without its page number");
  return page.runs.filter(run => run.y > number.y);
}

const prose = (pdf: ReadPdf, pages = pdf.pages) => pages.flatMap(page => body(page).map(run => run.text)).join(" ");
const withoutSpaces = (text: string) => text.replace(/\s+/g, "");
const occurrences = (text: string, part: string) => text.split(part).length - 1;
const englishDay = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

function edited(state: State, change: { readonly input?: object; readonly details?: object; readonly result?: object }): CompletedSnapshot {
  const source = completedSnapshotsByState[state];
  return completedSnapshotSchema.parse({
    ...source,
    input: { ...source.input, ...change.input },
    result: { ...source.result, ...change.result, details: { ...source.result.details, ...change.details } },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the file", () => {
  it("each of the six completedSnapshotsByState gives a Blob of type application/pdf that starts %PDF- and loads with at least one page", async () => {
    for (const state of states) {
      const blob = await renderPdf(completedSnapshotsByState[state], britishReader);
      expect(blob, state).toBeInstanceOf(Blob);
      expect(blob.type, state).toBe("application/pdf");
      expect(new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer()), state).toBe("%PDF-");
      expect((await readPdf(blob)).pages.length, state).toBeGreaterThanOrEqual(1);
    }
  });

  it("no fetch and no localPlans call during an export; it works with fetch stubbed to throw and storage rejecting", async () => {
    const fetch = vi.fn(() => { throw new Error("no network in this test"); });
    vi.stubGlobal("fetch", fetch);
    const refused = () => Promise.reject(new DOMException("", "SecurityError"));
    const storage = [vi.spyOn(localPlans, "load").mockImplementation(refused), vi.spyOn(localPlans, "save").mockImplementation(refused),
      vi.spyOn(localPlans, "clear").mockImplementation(refused)];
    await expect(localPlans.load()).rejects.toThrow();
    storage[0].mockClear();
    const blob = await exportPdf(completedSnapshotsByState.plan_with_warnings);
    expect(blob.type).toBe("application/pdf");
    expect(prose(await readPdf(blob))).toContain("Your plan, with warnings");
    expect(fetch).not.toHaveBeenCalled();
    for (const spy of storage) expect(spy).not.toHaveBeenCalled();
  });

  it("no /Annots, /URI, /JavaScript, /Launch or /EmbeddedFile; fonts are Helvetica and Helvetica-Bold, none embedded", async () => {
    const files = [...states.map(fixture), read(variant("manySources")), read(variant("manyWarnings"))];
    for (const pdf of await Promise.all(files)) {
      expect(pdf.active).toEqual({ Annots: 0, URI: 0, JavaScript: 0, Launch: 0, EmbeddedFile: 0 });
      expect(pdf.fonts).toEqual(["/Helvetica", "/Helvetica-Bold"]);
      expect(pdf.embeddedFontFiles).toBe(0);
    }
  });

  it("the reader does see a link: one annotation with a /URI action counts as such", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const link = doc.context.register(doc.context.obj({
      Type: "Annot", Subtype: "Link", Rect: [0, 0, 10, 10], A: { S: "URI", URI: PDFString.of("https://example.org") },
    }));
    page.node.addAnnot(link);
    const pdf = await readPdf(new Blob([(await doc.save()).slice()], { type: "application/pdf" }));
    expect(pdf.active.Annots).toBe(1);
    expect(pdf.active.URI).toBeGreaterThan(0);
  });

  it("each page sets a font once per change, so a page has two font resources, not one per text run", async () => {
    for (const pdf of await Promise.all([fixture("plan"), fixture("plan_with_warnings"), read(variant("manyWarnings"))])) {
      expect(pdf.pages.map(page => page.fontResources)).toEqual(pdf.pages.map(() => 2));
      expect(pdf.pages.some(page => new Set(page.runs.map(run => run.font)).size === 2)).toBe(true);
    }
  });

  it("two exports of one snapshot and reader are byte-identical; Creator and Producer say Gilir; no pdf-lib URL and no CreationDate", async () => {
    for (const state of ["plan", "insufficient_data"] as const) {
      const [first, second] = await Promise.all([1, 2].map(async () => new Uint8Array(await (await renderPdf(completedSnapshotsByState[state], britishReader)).arrayBuffer())));
      expect(first).toEqual(second);
      const pdf = await fixture(state);
      expect([pdf.creator, pdf.producer]).toEqual(["Gilir", "Gilir"]);
      expect(pdf.created).toBeUndefined();
      expect(pdf.modified).toBeUndefined();
      expect([pdf.title, pdf.subject, pdf.creator, pdf.producer].join(" ")).not.toMatch(/pdf-lib|github/i);
    }
  });

  it("the file title holds no place name and the language is en", async () => {
    for (const snapshot of [completedSnapshotsByState.plan, completedSnapshotsByState.insufficient_data, variant("longLabel"), variant("cyrillicLabel")]) {
      const pdf = await read(snapshot);
      expect(pdf.title).toMatch(/^Gilir (crop plan|status report), made 1 Jul 2026$/);
      for (const field of [pdf.title, pdf.subject]) {
        expect(field).not.toContain(snapshot.input.field.label.slice(0, 12));
        expect(field).not.toContain("Synthetic example field");
      }
      expect(pdf.language).toBe("en");
    }
  });

  it("a Łódź label with a th-TH reader, a Cyrillic label, and every variant export without throwing", async () => {
    const lodz = edited("plan", { input: { field: { ...completedSnapshotsByState.plan.input.field, label: "Pole koło Łodzi, Łódź" } } });
    const thai = await read(lodz, { locale: "th-TH", timeZone: "Asia/Bangkok" });
    expect(prose(thai, thai.pages.slice(0, 1))).toContain("Pole kolo Lodzi, Lódz Weather point 15.005° N, 100.005° E Made 1 Jul 2026");
    expect((await read(variant("cyrillicLabel"))).pages.length).toBeGreaterThan(0);
    for (const name of variantNames) {
      for (const reader of [britishReader, { locale: "en-US", timeZone: "America/Chicago" }, { locale: "ja-JP", timeZone: "Asia/Tokyo" }]) {
        await expect(renderPdf(variant(name), reader), `${name} ${reader.locale}`).resolves.toBeInstanceOf(Blob);
      }
    }
  });
});

describe("what each state prints", () => {
  it("/Timeline marked content appears once in plan and plan_with_warnings and never in the four no-plan states", async () => {
    const timelines = async (state: State) => (await fixture(state)).pages.flatMap(page => page.marked).filter(tag => tag === "Timeline").length;
    expect(await timelines("plan")).toBe(1);
    expect(await timelines("plan_with_warnings")).toBe(1);
    for (const state of noPlanStates) expect(await timelines(state), state).toBe(0);
    for (const name of ["monthlyInsights", "structuralProof"] as const) {
      expect((await read(variant(name))).pages.flatMap(page => page.marked), name).toEqual([]);
    }
  });

  it("every no-plan file says: This is a status report. No calendar is shown, because no plan was made.", async () => {
    for (const state of noPlanStates) expect(occurrences(prose(await fixture(state)), statusReport), state).toBe(1);
    for (const state of ["plan", "plan_with_warnings"] as const) expect(prose(await fixture(state)), state).not.toContain(statusReport);
  });

  it("no no-plan file has a Plant … · Harvest … row, a ranking row or Get ready", async () => {
    const planRows = /Plant \d+ \S+ \d{4} · Harvest/;
    const plan = prose(await fixture("plan"));
    expect(plan).toMatch(planRows);
    expect(plan).toContain("Why this plan ranked first");
    expect(plan).toContain("Get ready");
    for (const state of noPlanStates) {
      const text = prose(await fixture(state));
      expect(text, state).not.toMatch(planRows);
      expect(text, state).not.toMatch(/Why this plan ranked first|How often rain fell below what the crops need|Longest stretch without a planned crop|Get ready/);
    }
  });

  it("page 1 holds the state's title and its status label: With warnings. / No plan yet. / No plan. / No new plan.", async () => {
    const expected: Record<State, readonly [string, string]> = {
      plan: ["Keep last year’s rotation", "This order passed every check we could run."],
      plan_with_warnings: ["Your plan, with warnings", "With warnings."],
      insufficient_data: ["We can’t make a plan yet", "No plan yet."],
      no_calendar_fit: ["Your crops don’t all fit in one year", "No plan."],
      search_incomplete: ["We couldn’t finish the search", "No plan yet."],
      service_error: ["Something went wrong while making your plan", "No new plan."],
    };
    for (const state of states) {
      const pdf = await fixture(state);
      const first = prose(pdf, pdf.pages.slice(0, 1));
      const [title, label] = expected[state];
      expect(first, state).toContain(`Gilir · A crop plan from past seasons ${title} Synthetic example field`);
      expect(pdf.pages[0].runs.find(run => run.text === label), state).toMatchObject({ font: "/Helvetica-Bold", size: 14 });
    }
  });

  it("plan_with_warnings: What we flagged comes before When to plant and harvest, and every warning message follows its farmer head", async () => {
    const text = prose(await fixture("plan_with_warnings"));
    expect(text.indexOf("What we flagged")).toBeGreaterThan(-1);
    expect(text.indexOf("What we flagged")).toBeLessThan(text.indexOf("When to plant and harvest"));
    expect(text).toContain("What we flagged We flag a crop if, in any past season, even one week had less rain than it needs");
    expect(text).toContain("• Rain fell short of what synthetic crop needs in past seasons Example rainfall warning.");
    expect(text).toContain("Good to know • The search stopped at its limit Example search stopped at its scoring budget.");

    const many = await read(variant("manyWarnings"));
    const manyText = prose(many);
    for (let n = 1; n <= 30; n++) {
      const message = `Synthetic warning ${n}: in the invented season from ${englishDay("2026-07-15")} to ${englishDay("2026-09-30")} an invented value crossed an invented limit, so this long message wraps across several lines of the page.`;
      expect(occurrences(manyText, message), `warning ${n}`).toBe(1);
      const page = many.pages.find(item => item.runs.some(run => run.text.startsWith(`Synthetic warning ${n}:`)))!;
      const index = page.runs.findIndex(run => run.text.startsWith(`Synthetic warning ${n}:`));
      expect(page.runs[index - 1], `warning ${n} has a bold head just before it`).toMatchObject({ font: "/Helvetica-Bold", size: 14 });
    }
    expect(manyText.indexOf("What we flagged")).toBeLessThan(manyText.indexOf("When to plant and harvest"));
    expect(manyText.indexOf("Good to know")).toBeLessThan(manyText.indexOf("When to plant and harvest"));
  });

  it("notes (profile_limitation, search_limit, water_context, approximate_history) print under Good to know in every state", async () => {
    const notes = [
      ["profile_limitation", "What the checks leave out"],
      ["search_limit", "The search stopped at its limit"],
      ["water_context", "Your backup water isn’t counted"],
      ["approximate_history", "Your dates for last year are estimates"],
    ] as const;
    const added = notes.map(([code], index) => ({ code, message: `Synthetic note ${index + 1} for this layout test.`, cropPurposeIds: [], ruleIds: [], metricIds: [] }));
    for (const state of states) {
      const warnings = [...completedSnapshotsByState[state].result.details.warnings, ...added];
      const text = prose(await read(edited(state, { input: { water: "rain_plus_backup" }, details: { warnings } })));
      const notesAt = text.indexOf("Good to know");
      expect(notesAt, state).toBeGreaterThan(-1);
      notes.forEach(([, head], index) => {
        const at = text.indexOf(`• ${head} Synthetic note ${index + 1} for this layout test.`);
        expect(at, `${state} ${head}`).toBeGreaterThan(notesAt);
      });
      if (state !== "plan_with_warnings") expect(text, state).not.toContain("What we flagged");
    }
  });

  it("the four ranking rows read the tuple as it is (plan fixture: 361 days twice), then Shown, but not used to rank", async () => {
    const text = prose(await fixture("plan"));
    const rows = [
      "1. How often rain fell below what the crops need Never",
      "2. How big the shortfall was None",
      "3. Days without a planned crop 361 days Of the 365 days in your year",
      "4. Longest stretch without a planned crop 361 days",
      "Shown, but not used to rank • In a bad year Not available • Heat and cold Not available",
    ];
    const at = rows.map(row => text.indexOf(row));
    expect(at.every(index => index > -1), JSON.stringify(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("plan_with_warnings: About 5 in 10 weeks and About 25% from the tuple, never recalculated", async () => {
    const text = prose(await fixture("plan_with_warnings"));
    expect(text).toContain("How often rain fell below what the crops need About 5 in 10 weeks");
    expect(text).toContain("How big the shortfall was About 25%");
    expect(text).toContain("rain fell short of what the crops need in about 5 in 10 weeks.");
  });

  it("baseline not_recorded, not_assessable (the reasons, then the reported history as rows in words) and assessed (verdict, deltas, all four change kinds)", async () => {
    expect(prose(await read(variant("excludedSeasons")))).toContain("Compared with last year You skipped last year, so we didn’t compare.");
    expect(prose(await read(edited("insufficient_data", { details: { baseline: { kind: "not_recorded" } } })))).not.toContain("Compared with last year");

    expect(prose(await fixture("plan_with_warnings"))).toContain([
      "Compared with last year We couldn’t score last year’s rotation: • The reported crop has no supported example profile.",
      "Your dates are estimates. You said some of last year’s dates are approximate.",
      "What you told us about last year (not scored)",
      "Synthetic unlisted crop (not on our crop list) Planted about 1 Jul 2025 · Harvested about 4 Jul 2025",
      "Field empty, as you said 5 Jul to 31 Jul 2025 · 27 days",
      "Not sure: nothing recorded 1 Aug 2025 to 30 Jun 2026 · 334 days",
    ].join(" "));

    const changed = prose(await read(variant("changedBaseline")));
    for (const part of [
      "Compared with last year The new plan ranked ahead of last year’s rotation.",
      "Weeks with less rain than the crops need This plan: 50% Last year’s rotation: 60% Lower with this plan (better)",
      "Days without a planned crop This plan: 145 days Last year’s rotation: 157 days 12 days fewer with this plan (better)",
      "Crop families This plan: 3 Last year’s rotation: 2 1 more with this plan",
      "Bean-family plantings This plan: 1 Last year’s rotation: 1 The same",
      "Added: synthetic third crop, 6 Jan to 6 Mar 2027.",
      "Not in the new plan: synthetic old crop, 1 Mar to 9 Apr 2027 in last year’s rotation.",
      "Plant synthetic crop 7 days later: 1 Jul 2026 instead of 24 Jun 2026.",
      "Plant synthetic second crop on the same day, 16 Oct 2026; harvest 24 Dec 2026 instead of 19 Dec 2026.",
      "Synthetic second crop moves from first to second in the order.",
    ]) expect(changed).toContain(part);
  });

  it("baseline assessed and kept titles the plan Keep last year’s rotation", async () => {
    const pdf = await fixture("plan");
    expect(prose(pdf, pdf.pages.slice(0, 1))).toContain("Keep last year’s rotation");
    expect(prose(pdf)).toContain("Compared with last year Last year’s rotation ranked first, so we suggest keeping it.");
    const changed = await read(variant("changedBaseline"));
    expect(prose(changed, changed.pages.slice(0, 1))).toContain("Your plan Synthetic example field");
    expect(prose(changed)).not.toContain("Keep last year’s rotation");
  });

  it("No changes is said only for a kept rotation; a status report lists no changes from last year", async () => {
    expect(prose(await fixture("plan"))).toContain("Changes from last year No changes: the same crops, order and dates as last year.");
    const changed = variant("changedBaseline");
    const assessed = changed.result.details.baseline;
    if (assessed.kind !== "assessed") throw new Error("changedBaseline is assessed");

    const sameDates = prose(await read(completedSnapshotSchema.parse({
      ...changed, result: { ...changed.result, details: { ...changed.result.details, baseline: { ...assessed, changes: [] } } },
    })));
    expect(sameDates).toContain("The new plan ranked ahead of last year’s rotation.");
    expect(sameDates).toContain("Changes from last year We can’t list the changes one by one.");
    expect(sameDates).not.toContain("No changes");

    const unranked = { ...assessed, recommendation: "no_recommendation", eligible: false, deltas: [], changes: [] };
    for (const state of noPlanStates) {
      const text = prose(await read(edited(state, { details: { baseline: unranked } })));
      expect(text, state).toContain([
        "Compared with last year",
        "Last year’s rotation is shown for comparison only. It can’t be the suggestion, because it doesn’t meet every rule for a plan.",
        "How they compare No numbers to compare.",
      ].join(" "));
      expect(text, state).not.toContain("Changes from last year");
      expect(text, state).not.toContain("No changes");
      expect(text, state).not.toContain("We can’t list the changes");
    }
  });

  it("the estimate line says this comparison is approximate too only when a comparison was made", async () => {
    expect(prose(await fixture("plan"))).toContain("You said some of last year’s dates are approximate, so this comparison is approximate too.");
    const notScored = prose(await fixture("plan_with_warnings"));
    expect(notScored).toContain("You said some of last year’s dates are approximate.");
    expect(notScored).not.toContain("approximate too");
  });

  it("each preparation text under Get ready, in plan files only", async () => {
    const steps = [
      { templateId: "synthetic-step-1", text: "Synthetic step one: clear the invented field before 2026-06-20.", sourceIds: [] },
      { templateId: "synthetic-step-2", text: "Synthetic step two for this layout test.", sourceIds: [] },
    ];
    expect(prose(await read(edited("plan", { details: { preparation: steps } }))))
      .toContain(`Get ready 1. Synthetic step one: clear the invented field before ${englishDay("2026-06-20")}. 2. Synthetic step two for this layout test.`);
    const noPlan = prose(await read(edited("insufficient_data", { details: { preparation: steps } })));
    expect(noPlan).not.toContain("Get ready");
    expect(noPlan).not.toContain("Synthetic step");
  });

  it("the cohort line with usable and excluded seasons, the data cutoff, the manifest versions, or Engine and data versions: not recorded with its reason", async () => {
    const plan = prose(await fixture("plan"));
    expect(plan).toContain("Sources, period and versions Checked against 1 past season, Jul 2000. Past seasons chosen with method synthetic-v1.");
    expect(plan).toContain("Engine synthetic-engine, settings synthetic-settings, crop list synthetic-catalogue, rules synthetic-rules, records before 1 Jan 2026.");
    const excluded = prose(await read(variant("excludedSeasons")));
    expect(excluded).toContain("Checked against 3 past seasons, Jul 2001 to Jun 2005.");
    expect(excluded).toContain("Not used: Jul 2002 to Jun 2003. Synthetic gap: 12 days of rain records are missing in this invented season.");
    expect(excluded).toContain("Not used: Jul 2005 to Jun 2006. Synthetic gap: the invented temperature records stop early.");
    const missing = prose(await read(variant("manifestUnavailable")));
    expect(missing).toContain("Engine and data versions: not recorded. Synthetic example: the run manifest was not recorded.");
    expect(missing).not.toContain("records before");
    expect(prose(await fixture("insufficient_data"))).toContain("Past seasons: A complete cohort was not assessed in this example.");
  });

  it("every source title, section and URL as text; every climate product's provider, product, cell, grid size, version and URL; profiles and rules with versions; every assumption", async () => {
    const snapshot = variant("manySources");
    const text = withoutSpaces(prose(await read(snapshot)));
    const { provenance } = snapshot.result.details;
    expect(provenance.sources).toHaveLength(20);
    for (const source of provenance.sources) expect(text).toContain(withoutSpaces(`${source.title}. ${source.section} ${source.url}`));
    for (const product of provenance.climateProducts) {
      expect(text).toContain(withoutSpaces(`${product.provider}, ${product.product}, grid cell ${product.cellId} (0.5° by 0.625°), much larger than a field. Version synthetic-v1. ${product.sourceUrl}`));
    }
    const unversioned = { ...provenance.climateProducts[0], version: { kind: "unavailable", reason: "The provider reports no release version" } };
    const plain = withoutSpaces(prose(await read(completedSnapshotSchema.parse({
      ...snapshot, result: { ...snapshot.result, details: { ...snapshot.result.details, provenance: { ...provenance, climateProducts: [unversioned] } } },
    }))));
    expect(plain).toContain(withoutSpaces(`much larger than a field. Version not recorded: The provider reports no release version. ${unversioned.sourceUrl}`));
    if (provenance.manifest.kind !== "available") throw new Error("manySources keeps its manifest");
    expect(text).toContain(withoutSpaces(`Weather records: ${provenance.manifest.value.climateSnapshotIds.join(", ")}.`));

    const assumptions = ["Synthetic assumption one for this layout test.", "Synthetic assumption two, from 2026-07-15."];
    const rules = [{ id: "synthetic-rule", version: "synthetic-rule-v2", target: "synthetic-crop", sourceIds: [] }];
    const plan = completedSnapshotsByState.plan.result.details.provenance;
    const more = prose(await read(edited("plan", { details: { assumptions, provenance: { ...plan, rules } } })));
    expect(more).toContain("Crop profiles: Synthetic crop synthetic-profile synthetic-v1.");
    expect(more).toContain("Rules: synthetic-rule synthetic-rule-v2.");
    expect(more).toContain(`Assumptions • Synthetic assumption one for this layout test. • Synthetic assumption two, from ${englishDay("2026-07-15")}.`);
  });

  it("insufficient_data: a crop the engine reports twice under one code is one item with both reasons", async () => {
    const crops = ["synthetic-crop", "synthetic-second-crop"];
    const missing = [
      ...crops.map(crop => ({ code: "crop_profile", reason: `No synthetic ${crop} profile applies here.`, cropPurposeIds: [crop], sourceIds: [] })),
      ...crops.map(crop => ({ code: "crop_profile", reason: "A selected crop has no applicable profile.", cropPurposeIds: [crop], sourceIds: [] })),
    ];
    const text = prose(await read(edited("insufficient_data", { input: { cropPurposeIds: crops }, details: { unassessedChecks: missing }, result: { missing } })));
    expect(text).toContain([
      "What’s missing",
      "• Growing details for synthetic crop in this place No synthetic synthetic-crop profile applies here. A selected crop has no applicable profile.",
      "• Growing details for synthetic second crop in this place No synthetic synthetic-second-crop profile applies here. A selected crop has no applicable profile.",
      "Making the plan again",
    ].join(" "));
    expect(occurrences(text, "Growing details for")).toBe(2);
  });

  it("insufficient_data: What’s missing lists result.missing once, and What we couldn’t check leaves out the same gaps", async () => {
    const text = prose(await fixture("insufficient_data"));
    expect(text).toContain("What’s missing • Enough complete past seasons of weather No complete weather season in this example.");
    expect(occurrences(text, "No complete weather season in this example.")).toBe(1);
    expect(text).not.toContain("What we couldn’t check");
  });

  it("insufficient_data with monthly insights: a 12-row month table from the planning month", async () => {
    const pdf = await read(variant("monthlyInsights"));
    const text = prose(pdf);
    const month = (n: number) => new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, n - 1, 15)));
    expect(text).toContain("What we know about your farm");
    expect(text).toContain("Month Usual rain Dry year Wet year Mean temperature");
    const order = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
    const rows = order.map(n => `${month(n)} ${20 + 15 * n} ${5 + 6 * n} ${60 + 25 * n} ${n === 3 ? "Not available" : Math.round(18 + n * 0.6)}`);
    const at = rows.map(row => text.indexOf(row));
    expect(at.every(index => index > -1), JSON.stringify(rows)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("no_calendar_fit: 366 days needed against 365 in the year and each crop's minimum; a structural proof lists its constraints", async () => {
    const text = prose(await fixture("no_calendar_fit"));
    expect(text).toContain("No plan. Together they need at least 366 days; your year has 365. Why they don’t fit Each crop needs at least: • Synthetic crop: at least 366 days");
    const proof = prose(await read(variant("structuralProof")));
    expect(proof).toContain("What stops them:");
    expect(proof).toContain(`• Synthetic crop must be planted between ${englishDay("2026-11-01")} and ${englishDay("2026-11-30")} in this invented example.`);
    expect(proof).toContain("• Synthetic second crop cannot follow synthetic crop in this invented example.");
    expect(proof).toContain("• Each invented crop needs at least 200 days in the field.");
    expect(proof).toContain("We checked 48,213 ways of placing them.");
  });

  it("search_incomplete: where the search stopped in numbers, and A stopped search doesn’t show that your crops can’t fit.", async () => {
    const text = prose(await fixture("search_incomplete"));
    expect(text).toContain("Where the search stopped We stopped after 10 tries at fitting your crops into your year (our limit is 10), before we found an order that fits.");
    expect(text).toContain("A stopped search doesn’t show that your crops can’t fit.");
  });

  it("service_error: the error message and No new plan was made.; no failure code such as retrieval_failed anywhere in the file", async () => {
    const pdf = await fixture("service_error");
    expect(prose(pdf)).toContain("No new plan. Example source did not respond. What happened No new plan was made.");
    expect(pdf.pages.map(page => page.text).join("\n")).not.toMatch(/retrieval_failed|retryable/);
    expect([pdf.title, pdf.subject].join(" ")).not.toContain("retrieval_failed");
  });

  it("a plan whose ranking stopped at its limit says it is the best plan found, not proven to be the best", async () => {
    expect(prose(await fixture("plan_with_warnings"))).toContain("We stopped at our search limit. This is the best plan we found, not proven to be the best.");
    expect(prose(await fixture("plan"))).not.toContain("not proven to be the best");
  });

  it("How this was worked out prints details.explanation as the engine wrote it, once, with its ISO dates in the reader's form", async () => {
    const explanation = "Synthetic result: from 2026-07-15 the invented order ranks first in this layout test.";
    const text = prose(await read(edited("plan", { details: { explanation } })));
    const shown = `Synthetic result: from ${englishDay("2026-07-15")} the invented order ranks first in this layout test.`;
    expect(text).toContain(`How this was worked out ${shown}`);
    expect(occurrences(text, shown)).toBe(1);
    expect(text).not.toContain("2026-07-15");
  });
});

describe("values are read, never invented", () => {
  it("an unavailable metric or delta prints Not available or Not compared: <reason>, never 0 or 0%", async () => {
    const plan = prose(await fixture("plan"));
    expect(plan).toContain("In a bad year Not available");
    expect(plan).not.toMatch(/In a bad year (0|None)/);
    const changed = prose(await read(variant("changedBaseline")));
    expect(changed).toContain("Shortfall in a bad year This plan: 30% Last year’s rotation: Not available Not compared: One or both comparison values are unavailable.");
    expect(changed).not.toContain("Last year’s rotation: 0%");
    const months = prose(await read(variant("monthlyInsights")));
    expect(months).toMatch(/Mar 65 23 135 Not available/);
  });

  it("the no-crop row after the harvest and the longest-stretch ranking row both say 361 days in the plan fixture", async () => {
    const text = prose(await fixture("plan"));
    expect(text).toContain("2. No planned crop 5 Jul 2026 to 30 Jun 2027 · 361 days The first day is the time after the synthetic crop harvest");
    expect(text).toContain("Longest stretch without a planned crop 361 days");
  });

  it("Made <date> is completedAt in the reader's zone, whatever the export time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2031-03-04T05:06:07Z"));
    const west = await read(completedSnapshotsByState.plan, { locale: "en-GB", timeZone: "America/Los_Angeles" });
    const east = await read(completedSnapshotsByState.plan, { locale: "en-GB", timeZone: "Pacific/Auckland" });
    expect(prose(west)).toContain("Made 30 Jun 2026 · Your year: 1 Jul 2026 to 30 Jun 2027");
    expect(west.title).toBe("Gilir crop plan, made 30 Jun 2026");
    expect(west.pages.every(page => page.runs.some(run => run.text === "Gilir crop plan · Made 30 Jun 2026"))).toBe(true);
    expect(prose(east)).toContain("Made 1 Jul 2026 · Your year");
    expect(west.pages.map(page => page.text).join(" ")).not.toContain("2031");
  });

  it("the water label and Checked with rain alone: backup water is not counted.", async () => {
    const rainOnly = prose(await fixture("plan"));
    expect(rainOnly).toContain("Water: Rain only");
    expect(rainOnly).toContain("Checked with rain alone: backup water is not counted.");
    const backup = prose(await read(edited("plan", { input: { water: "rain_plus_backup" } })));
    expect(backup).toContain("Water: Rain + water when it’s dry");
    expect(backup).toContain("Checked with rain alone: backup water is not counted.");
    expect(backup).toContain("How often rain fell below what the crops need Never");
  });

  it("a synthetic snapshot prints provenance.label on page 1 and in every page footer", async () => {
    for (const state of states) {
      const pdf = await fixture(state);
      expect(prose(pdf, pdf.pages.slice(0, 1)), state).toContain(syntheticLabel);
      for (const page of pdf.pages) {
        const footer = page.runs.filter(run => !body(page).includes(run)).map(run => run.text).join(" ");
        expect(footer, state).toContain(syntheticLabel);
      }
    }
  });

  it("a Cyrillic place label prints Your field, the coordinates and the place-name note; an unlisted crop named in Thai prints A crop not on our list", async () => {
    const cyrillic = await read(variant("cyrillicLabel"));
    const first = prose(cyrillic, cyrillic.pages.slice(0, 1));
    expect(first).toContain("Your field Weather point 15.005° N, 100.005° E");
    expect(first).toContain("The place name uses letters this file can’t show.");
    expect(cyrillic.pages.map(page => page.text).join(" ")).not.toContain("?");
    const thai = prose(await read(variant("thaiUnlistedCrop")));
    expect(thai).toContain("A crop not on our list Planted about 1 Jul 2025 · Harvested about 4 Jul 2025 A crop name uses letters this file can’t show.");
  });
});

describe("paper and preparePdf", () => {
  it("A4 for an en-GB reader and Letter for en-US, read from the page size", async () => {
    const a4 = await read(completedSnapshotsByState.plan, britishReader);
    const letter = await read(completedSnapshotsByState.plan, { locale: "en-US", timeZone: "America/New_York" });
    for (const page of a4.pages) expect([page.width, page.height]).toEqual([595.28, 841.89]);
    for (const page of letter.pages) expect([page.width, page.height]).toEqual([612, 792]);
  });

  it("exportPdf reads the browser's language at export time: Letter and US dates for en-US, A4 for en-GB", async () => {
    vi.stubGlobal("navigator", { language: "en-US" });
    const us = await readPdf(await exportPdf(completedSnapshotsByState.plan));
    expect([us.pages[0].width, us.pages[0].height]).toEqual([612, 792]);
    expect(prose(us)).toMatch(/Made (Jul 1|Jun 30), 2026/);
    vi.stubGlobal("navigator", { language: "en-GB" });
    const gb = await readPdf(await exportPdf(completedSnapshotsByState.plan));
    expect([gb.pages[0].width, gb.pages[0].height]).toEqual([595.28, 841.89]);
  });

  it("preparePdf returns nothing and never throws, in node and when called twice", async () => {
    expect(preparePdf()).toBeUndefined();
    vi.stubGlobal("window", {});
    expect(preparePdf()).toBeUndefined();
    expect(preparePdf()).toBeUndefined();
    expect((await exportPdf(completedSnapshotsByState.insufficient_data)).type).toBe("application/pdf");
  });

  it("after the PDF code fails to load once (offline before preparePdf), the next export loads it again and returns a PDF", async () => {
    vi.resetModules();
    let offline = true;
    vi.doMock("@/client/pdf/render", async (importOriginal: () => Promise<object>) => {
      if (offline) throw new TypeError("Failed to fetch dynamically imported module");
      return importOriginal();
    });
    try {
      const fresh = await import("@/client/pdf");
      await expect(fresh.exportPdf(completedSnapshotsByState.plan)).rejects.toThrow();
      offline = false;
      const blob = await fresh.exportPdf(completedSnapshotsByState.plan);
      expect(blob.type).toBe("application/pdf");
      expect(prose(await readPdf(blob))).toContain("Keep last year’s rotation");
    } finally {
      vi.doUnmock("@/client/pdf/render");
      vi.resetModules();
    }
  });
});
