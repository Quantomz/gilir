import { beforeAll, describe, expect, it } from "vitest";
import { paperFor, wrap } from "@/client/pdf/layout";
import { renderPdf } from "@/client/pdf/render";
import { pdfText } from "@/client/pdf/text";
import { completedSnapshotSchema } from "@/contracts/result";
import type { CompletedSnapshot } from "@/contracts/result";
import { completedSnapshotsByState } from "@/fixtures/results";
import { syntheticLabel } from "@/fixtures/science";
import { helvetica } from "./support/metrics";
import { readPdf } from "./support/read-pdf";
import type { ReadPage, ReadPdf, TextRun } from "./support/read-pdf";
import { britishReader, variant, variantNames } from "./support/variants";

describe("wrap", () => {
  it("breaks at spaces and never returns a line wider than its width", async () => {
    const measure = await helvetica();
    const text = pdfText("Rain fell short of what synthetic crop and synthetic second crop need in past seasons, so the flag stays.");
    for (const width of [120, 200, 499.28]) {
      const lines = wrap(text, "regular", 14, width, measure);
      expect(lines.length).toBeGreaterThan(1);
      expect(lines.join(" ")).toBe(text);
      for (const line of lines) expect(measure(line, "regular", 14)).toBeLessThanOrEqual(width);
      for (let index = 1; index < lines.length; index++) {
        const firstWord = lines[index].split(" ")[0];
        expect(measure(pdfText(`${lines[index - 1]} ${firstWord}`), "regular", 14), "a line ends only where the next word can't fit").toBeGreaterThan(width);
      }
    }
  });

  it("breaks a 74-character URL, a 64-hex hash and an 80-character crop ID by characters", async () => {
    const measure = await helvetica();
    const tokens = [
      `https://example.org/synthetic/layout/source-01/${"x".repeat(27)}`,
      "3f9a0c1e5b7d2a4c6e8f0a1b3c5d7e9f1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d",
      `synthetic-${"long-crop-purpose-".repeat(4)}`.slice(0, 80),
    ];
    expect(tokens.map(token => token.length)).toEqual([74, 64, 80]);
    for (const token of tokens) {
      for (const face of ["regular", "bold"] as const) {
        const lines = wrap(pdfText(`See ${token} here`), face, 14, 200, measure);
        expect(lines.length).toBeGreaterThan(2);
        expect(lines.join("").replaceAll(" ", "")).toBe(`See${token}here`);
        for (const line of lines) expect(measure(line, face, 14)).toBeLessThanOrEqual(200);
      }
    }
  });

  it("returns no lines for empty text and keeps a no-break space inside its line", async () => {
    const measure = await helvetica();
    expect(wrap(pdfText(""), "regular", 14, 100, measure)).toEqual([]);
    const lines = wrap(pdfText("one two three four"), "regular", 14, 60, measure);
    expect(lines.some(line => line.includes("two three"))).toBe(true);
  });
});

const readers = [britishReader, { locale: "en-US", timeZone: "America/Chicago" }] as const;
const snapshots: readonly (readonly [string, CompletedSnapshot])[] = [
  ...Object.entries(completedSnapshotsByState),
  ...variantNames.map(name => [name, variant(name)] as const),
];
type LaidOut = readonly { readonly name: string; readonly pdf: ReadPdf }[];
let everyFile: LaidOut = [];
beforeAll(async () => {
  everyFile = await Promise.all(snapshots.flatMap(([name, snapshot]) => readers.map(async reader => ({
    name: `${name} ${reader.locale}`,
    pdf: await readPdf(await renderPdf(snapshot, reader)),
  }))));
}, 120_000);
const plans = (files: LaidOut) => files.filter(({ pdf }) => pdf.title?.startsWith("Gilir crop plan"));

const faceOf = (run: TextRun) => (run.font === "/Helvetica-Bold" ? "bold" : "regular");
const isHeading = (run: TextRun) => run.font === "/Helvetica-Bold" && run.size === 17;
function footerIndex(page: ReadPage): number {
  const number = page.runs.findIndex(run => /^Page \d+ of \d+$/.test(run.text));
  return page.runs.findIndex(run => run.y <= page.runs[number].y);
}

describe("nothing is clipped", () => {
  it("every text run starts and ends inside the margins, for every fixture and variant, on A4 and Letter", async () => {
    const measure = await helvetica();
    const files = everyFile;
    expect(files).toHaveLength(2 * (6 + variantNames.length));
    for (const { name, pdf } of files) {
      for (const [index, page] of pdf.pages.entries()) {
        const outside = page.runs.filter(run => run.x < 48 - 0.01 || run.y < 48 - 0.01 || run.y + run.size > page.height - 48 + 0.01
          || run.x + measure(pdfText(run.text), faceOf(run), run.size) > page.width - 48 + 0.01);
        expect(outside, `${name}, page ${index + 1}`).toEqual([]);
      }
    }
  });

  it("a 240-character place name wraps to several lines on page 1", async () => {
    const snapshot = variant("longLabel");
    expect(snapshot.input.field.label.length).toBe(240);
    const page = (await readPdf(await renderPdf(snapshot, britishReader))).pages[0];
    const title = page.runs.findIndex(run => run.size === 24);
    const weather = page.runs.findIndex(run => run.text.startsWith("Weather point"));
    const place = page.runs.slice(title + 1, weather);
    expect(place.length).toBeGreaterThanOrEqual(3);
    expect(place.every(run => run.font === "/Helvetica-Bold" && run.size === 14)).toBe(true);
    expect(place.map(run => run.text).join(" ")).toBe(pdfText(snapshot.input.field.label));
  });

  it("no crop name is drawn inside the Timeline group: bars carry row numbers only, and every bar lies inside the track", async () => {
    const files = plans(everyFile);
    expect(files.length).toBeGreaterThanOrEqual(2 * 10);
    for (const { name, pdf } of files) {
      const runs = pdf.pages.flatMap(page => page.runs);
      const inTimeline = runs.filter(run => run.inTimeline);
      expect(inTimeline.filter(run => !/^(\d{1,3}|\d{4}|[A-Z][a-z]{2,3})$/.test(run.text)), name).toEqual([]);
      const start = runs.findIndex(run => run.text === "When to plant and harvest");
      const end = runs.findIndex(run => run.text === "Why this plan ranked first");
      const rows = runs.slice(start, end).filter(run => /^\d+\.$/.test(run.text) && run.x === 48).map(run => Number.parseInt(run.text, 10));
      const keys = inTimeline.filter(run => /^\d{1,3}$/.test(run.text)).map(run => Number(run.text));
      expect(rows, name).toEqual(rows.map((_, index) => index + 1));
      expect([...keys].sort((a, b) => a - b), name).toEqual(rows);
      for (const page of pdf.pages) {
        for (const box of page.timelineBoxes) {
          expect(box.x, name).toBeGreaterThanOrEqual(48 - 0.01);
          expect(box.x + box.width, name).toBeLessThanOrEqual(page.width - 48 + 0.01);
        }
      }
    }
  });

  it("no tick runs through a row number under the track, even when the year ends in a 7-day bar", async () => {
    const measure = await helvetica();
    for (const { name, pdf } of plans(everyFile)) {
      for (const page of pdf.pages) {
        const numbers = page.runs.filter(run => run.inTimeline && run.font === "/Helvetica-Bold" && /^\d+$/.test(run.text));
        const ticks = page.timelineBoxes.filter(box => box.width <= 1);
        for (const number of numbers) {
          const right = number.x + measure(pdfText(number.text), "bold", number.size);
          const crossing = ticks.filter(tick => tick.x + tick.width > number.x && tick.x < right
            && tick.y < number.y + number.size && tick.y + tick.height > number.y);
          expect(crossing, `${name}: row number ${number.text}`).toEqual([]);
        }
      }
    }
    for (const { name, pdf } of everyFile.filter(file => file.name.startsWith("freeAtYearEnd "))) {
      const page = pdf.pages.find(item => item.marked.includes("Timeline"))!;
      const last = page.runs.filter(run => run.inTimeline && run.font === "/Helvetica-Bold").map(run => Number(run.text));
      expect(Math.max(...last), `${name}: the after-harvest days at the year's end have a row`).toBe(4);
      const lastBar = page.timelineBoxes.filter(box => box.height === 24).reduce((a, b) => (b.x > a.x ? b : a));
      expect(lastBar.width, `${name}: a 7-day bar at the right end`).toBeLessThan(12);
    }
  });

  it("a Vietnamese reader sees month numbers on the timeline, all twelve, because the month names don't fit", async () => {
    const months = async (locale: string) => (await readPdf(await renderPdf(completedSnapshotsByState.plan, { locale, timeZone: "UTC" })))
      .pages.flatMap(page => page.runs).filter(run => run.inTimeline && run.font === "/Helvetica" && !/^\d{4}$/.test(run.text)).map(run => run.text);
    expect(await months("vi-VN")).toEqual(["7", "8", "9", "10", "11", "12", "1", "2", "3", "4", "5", "6"]);
    expect(await months("en-GB")).toEqual(["Jul", "Aug", "Sept", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"]);
  });

  it("body text is 14 pt and no run is under 12 pt", async () => {
    for (const { name, pdf } of everyFile) {
      const runs = pdf.pages.flatMap(page => page.runs);
      expect([...new Set(runs.map(run => run.size))].sort((a, b) => a - b), name).toEqual(expect.arrayContaining([12, 14, 17, 24]));
      expect(runs.filter(run => ![12, 14, 17, 24].includes(run.size)), name).toEqual([]);
      const label = runs.findIndex(run => /^(This order passed every check we could run\.|With warnings\.|No plan yet\.|No plan\.|No new plan\.)$/.test(run.text));
      expect(runs[label + 1], `${name}: the status sentence`).toMatchObject({ font: "/Helvetica", size: 14 });
      for (const row of runs.filter(run => /^Plant .+ · Harvest /.test(run.text))) expect(row, name).toMatchObject({ font: "/Helvetica", size: 14 });
    }
    const plan = await readPdf(await renderPdf(completedSnapshotsByState.plan, britishReader));
    expect(plan.pages.flatMap(page => page.runs).find(run => run.text.startsWith("Plans are compared in one fixed order"))).toMatchObject({ font: "/Helvetica", size: 14 });
  });
});

describe("page breaks", () => {
  it("the last run above a footer is never a section heading", async () => {
    let pages = 0;
    for (const { name, pdf } of everyFile) {
      for (const [index, page] of pdf.pages.entries()) {
        const bodyRuns = page.runs.slice(0, footerIndex(page));
        expect(bodyRuns.length, `${name}, page ${index + 1}`).toBeGreaterThan(0);
        expect(isHeading(bodyRuns[bodyRuns.length - 1]), `${name}, page ${index + 1}`).toBe(false);
        pages++;
      }
    }
    expect(pages).toBeGreaterThan(100);
  });

  it("a bold sub-heading or a line that leads into a list never ends a page, wherever the breaks fall", async () => {
    const note = (index: number) => ({
      code: "water_context", message: `Synthetic note ${index} for this layout test.${" It moves the page breaks.".repeat(index % 4 * 2)}`,
      cropPurposeIds: [], ruleIds: [], metricIds: [],
    });
    const sources = [variant("changedBaseline"), completedSnapshotsByState.plan_with_warnings, completedSnapshotsByState.no_calendar_fit, variant("leapYear")];
    let pages = 0;
    for (const source of sources) {
      for (let extra = 0; extra < 16; extra++) {
        const snapshot = completedSnapshotSchema.parse({
          ...source,
          result: { ...source.result, details: { ...source.result.details, warnings: [...source.result.details.warnings, ...Array.from({ length: extra }, (_, index) => note(index))] } },
        });
        for (const reader of readers) {
          const pdf = await readPdf(await renderPdf(snapshot, reader));
          for (const [index, page] of pdf.pages.entries()) {
            const last = page.runs.slice(0, footerIndex(page)).at(-1)!;
            const where = `${source.id} with ${extra} notes, ${reader.locale}, page ${index + 1}: ${last.text}`;
            expect(last.font === "/Helvetica-Bold" && last.size >= 14, where).toBe(false);
            expect(last.text.endsWith(":"), where).toBe(false);
            pages++;
          }
        }
      }
    }
    expect(pages).toBeGreaterThan(250);
  }, 30_000);

  it("manyWarnings and manySources take several pages; each warning's head and the start of its message share a page", async () => {
    const files = everyFile;
    for (const name of ["manyWarnings", "manySources"]) {
      for (const { pdf } of files.filter(file => file.name.startsWith(`${name} `))) expect(pdf.pages.length, name).toBeGreaterThanOrEqual(4);
    }
    for (const { name, pdf } of files.filter(file => file.name.startsWith("manyWarnings "))) {
      for (let n = 1; n <= 30; n++) {
        const page = pdf.pages.find(item => item.runs.some(run => run.text.startsWith(`Synthetic warning ${n}:`)));
        expect(page, `${name} warning ${n}`).toBeDefined();
        const index = page!.runs.findIndex(run => run.text.startsWith(`Synthetic warning ${n}:`));
        expect(page!.runs[index - 1], `${name} warning ${n}`).toMatchObject({ font: "/Helvetica-Bold", size: 14 });
        expect(page!.runs[index - 1].y - page!.runs[index].y, `${name} warning ${n}`).toBeCloseTo(19.6, 5);
      }
    }
  });

  it("the timeline group is whole on one page, and the status box with it", async () => {
    for (const { name, pdf } of plans(everyFile)) {
      const withTimeline = pdf.pages.filter(page => page.marked.includes("Timeline"));
      expect(withTimeline, name).toHaveLength(1);
      const [page] = withTimeline;
      expect(page.runs.filter(run => run.inTimeline).length, name).toBeGreaterThan(12);
      expect(page.runs.some(run => run.text === "No planned crop" && run.size === 12), `${name}: the legend sits with its drawing`).toBe(true);
    }
    for (const { name, pdf } of everyFile) {
      const first = pdf.pages[0].runs;
      const label = first.findIndex(run => /^(This order passed every check we could run\.|With warnings\.|No plan yet\.|No plan\.|No new plan\.)$/.test(run.text));
      expect(label, name).toBeGreaterThan(-1);
      expect(first[label + 1]?.font, `${name}: the status sentence follows its label on page 1`).toBe("/Helvetica");
    }
  });

  it("the month table repeats its header row on the next page", async () => {
    const months = variant("monthlyInsights");
    const gap = (index: number) => ({ code: "crop_profile", reason: `Synthetic gap ${index} for this layout test.`, cropPurposeIds: ["synthetic-crop"], sourceIds: [] });
    let splits = 0;
    for (let extra = 0; extra < 16; extra++) {
      const snapshot = completedSnapshotSchema.parse({
        ...months,
        result: { ...months.result, details: { ...months.result.details, unassessedChecks: [...months.result.details.unassessedChecks, ...Array.from({ length: extra }, (_, index) => gap(index))] } },
      });
      const pdf = await readPdf(await renderPdf(snapshot, britishReader));
      const holding = pdf.pages.filter(page => page.runs.some(run => run.text === "Usual rain"));
      const rowsOn = (page: ReadPage) => page.runs.filter(run => run.x === 48 && /^[A-Z][a-z]{2,3}$/.test(run.text) && run.font === "/Helvetica").length;
      expect(holding.reduce((sum, page) => sum + rowsOn(page), 0), `with ${extra} more gaps`).toBe(12);
      if (holding.length < 2) continue;
      splits++;
      for (const page of holding.slice(1)) {
        const header = page.runs.slice(0, 5).map(run => run.text);
        expect(header, `with ${extra} more gaps`).toEqual(["Month", "Usual rain", "Dry year", "Wet year", "Mean"]);
        expect(rowsOn(page), `with ${extra} more gaps`).toBeGreaterThan(0);
      }
    }
    expect(splits, "some layouts split the table").toBeGreaterThan(0);
  });

  it("every page ends with the footer and Page n of N, with N the real page count and the synthetic label when there is one", async () => {
    for (const { name, pdf } of everyFile) {
      pdf.pages.forEach((page, index) => {
        const footer = page.runs.slice(footerIndex(page)).map(run => run.text);
        expect(footer, `${name}, page ${index + 1}`).toEqual([
          expect.stringMatching(/^Gilir (crop plan|status report) · Made /), `Page ${index + 1} of ${pdf.pages.length}`, syntheticLabel,
        ]);
      });
    }
    const source = completedSnapshotsByState.plan;
    const synthetic = source.result.details.provenance;
    if (synthetic.kind !== "synthetic") throw new Error("the plan fixture is synthetic");
    const { label: _label, ...provenance } = synthetic;
    const run = completedSnapshotSchema.parse({ ...source, result: { ...source.result, details: { ...source.result.details, provenance: { ...provenance, kind: "run" } } } });
    const pdf = await readPdf(await renderPdf(run, britishReader));
    pdf.pages.forEach((page, index) => {
      expect(page.runs.slice(footerIndex(page)).map(item => item.text)).toEqual(["Gilir crop plan · Made 1 Jul 2026", `Page ${index + 1} of ${pdf.pages.length}`]);
    });
    const head = pdf.pages[0].runs.slice(0, pdf.pages[0].runs.findIndex(item => item.text === "This order passed every check we could run."));
    expect(head.map(item => item.text)).not.toContain(syntheticLabel);
  });

  it("runs come in reading order: y never rises within a page except into the footer", async () => {
    for (const { name, pdf } of everyFile) {
      for (const [index, page] of pdf.pages.entries()) {
        const rises = page.runs.flatMap((run, at) => at > 0 && run.y > page.runs[at - 1].y + 0.01 ? [`${page.runs[at - 1].text} -> ${run.text}`] : []);
        expect(rises, `${name}, page ${index + 1}`).toEqual([]);
        const footer = footerIndex(page);
        expect(page.runs.slice(0, footer).every(run => run.y > page.runs[footer].y), `${name}, page ${index + 1}`).toBe(true);
      }
    }
  });
});

describe("paper", () => {
  it("paperFor: en-US, en-CA, es-MX and fil-PH give Letter; en-GB, de-DE, th-TH, es-419 and a bare en give A4", () => {
    for (const locale of ["en-US", "en-CA", "es-MX", "fil-PH"]) expect(paperFor(locale), locale).toMatchObject({ name: "letter", width: 612, height: 792 });
    for (const locale of ["en-GB", "de-DE", "th-TH", "es-419", "en"]) expect(paperFor(locale), locale).toMatchObject({ name: "a4", width: 595.28, height: 841.89 });
  });

  it("a locale that doesn't parse gets A4 instead of failing the export", () => {
    expect(paperFor("not a locale").name).toBe("a4");
    expect(paperFor("").name).toBe("a4");
  });
});
