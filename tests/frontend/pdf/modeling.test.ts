import { afterEach, describe, expect, it, vi } from "vitest";
import { renderPdf } from "@/client/pdf/render";
import { pdfText } from "@/client/pdf/text";
import { modeledNoCalendarFitFixture, modeledSnapshotFixture } from "@/fixtures/model-result";
import { readPdf } from "./support/read-pdf";
import { helvetica } from "./support/metrics";

afterEach(() => vi.unstubAllGlobals());

describe("saved modeled-result PDFs", () => {
  it("exports saved estimates and assumptions with no network or recalculation", async () => {
    const fetch = vi.fn(() => { throw new Error("Offline fixture export"); });
    vi.stubGlobal("fetch", fetch);
    const pdf = await readPdf(await renderPdf(modeledSnapshotFixture, { locale: "en-GB", timeZone: "UTC" }));
    const text = pdf.pages.map(page => page.text).join(" ").replace(/\s+/g, " ");
    for (const expected of [
      "Estimated crop development from historical weather", "Synthetic modeled grain", "Estimated harvest 3 Jul to 4 Jul 2026",
      "4 days set aside", "Earlier modeled harvests can leave waiting time", "Days without a planned crop",
      "Synthetic reference cultivar", "Derived model estimate", "These estimates have not been checked for your area",
      "synthetic-models-v1", "a".repeat(64),
    ]) expect(text).toContain(expected);
    expect(fetch).not.toHaveBeenCalled();
    expect(pdf.active).toEqual({ Annots: 0, URI: 0, JavaScript: 0, Launch: 0, EmbeddedFile: 0 });
    const measure = await helvetica();
    for (const page of pdf.pages) {
      for (const run of page.runs) {
        const width = measure(pdfText(run.text), run.font === "/Helvetica-Bold" ? "bold" : "regular", run.size);
        expect(run.x).toBeGreaterThanOrEqual(0);
        expect(run.x + width).toBeLessThanOrEqual(page.width);
        expect(run.y).toBeGreaterThanOrEqual(0);
        expect(run.y).toBeLessThanOrEqual(page.height);
      }
    }
  });

  it("keeps no-calendar reports model-scoped with the original noncompletion explanation and no calendar", async () => {
    const pdf = await readPdf(await renderPdf(modeledNoCalendarFitFixture, { locale: "en-GB", timeZone: "UTC" }));
    const text = pdf.pages.map(page => page.text).join(" ").replace(/\s+/g, " ");
    expect(text).toContain("No calendar fits this development model");
    expect(text).toContain(modeledNoCalendarFitFixture.result.details.explanation);
    expect(text).not.toContain("Choose fewer crops");
    expect(pdf.pages.flatMap(page => page.marked)).not.toContain("Timeline");
  });
});
