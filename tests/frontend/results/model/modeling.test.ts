import { describe, expect, it } from "vitest";
import { detailsPage } from "@/features/results/model/details-page";
import { resultPage } from "@/features/results/model/result-page";
import { formatIn } from "@/features/results/model/words";
import { completedSnapshotV3Schema } from "@/contracts/result";
import { modeledNoCalendarFitFixture, modeledSnapshotFixture } from "@/fixtures/model-result";
import { completedSnapshotFixture, completedSnapshotV2Fixture } from "@/fixtures/results";
import { textOf } from "../support/ports";

const format = formatIn("en-GB");

describe("historical-weather development estimates", () => {
  it("shows saved crop labels, the harvest range and the reserved-slot meaning", () => {
    const page = resultPage(modeledSnapshotFixture, format);
    const text = textOf(page);
    expect(text).toContain("Estimated crop development from historical weather");
    expect(text).toContain("Synthetic modeled grain");
    expect(text).toContain("Estimated harvest 3 Jul to 4 Jul 2026");
    expect(text).toContain("4 days set aside");
    expect(text).toContain("An earlier harvest may leave extra waiting time");
    expect(text).toContain("Days without a planned crop");
    expect(text).toContain("actual crop cover");
    expect(text).not.toContain("4 days in the field");
  });

  it("discloses reference assumptions, source basis, missing local checks and frozen identity in details", () => {
    const text = textOf(detailsPage(modeledSnapshotFixture, format));
    for (const expected of [
      "These estimates have not been checked for your area", "frost", "survival", "photoperiod", "soil",
      "Synthetic reference cultivar", "Synthetic grain harvest", "Derived model estimate",
      "synthetic-reference", "synthetic-models-v1", "a".repeat(64), "latest-completion-all-retained-seasons-v1",
    ]) expect(text).toContain(expected);
  });

  it("keeps modeled noncompletion scoped to this model and preserves the engine explanation", () => {
    const page = resultPage(modeledNoCalendarFitFixture, format);
    const text = textOf(page);
    expect(page.head.title).toBe("No calendar fits this development model");
    expect(text).toContain(modeledNoCalendarFitFixture.result.details.explanation);
    expect(text).not.toContain("Choose fewer crops, or crops that grow faster");
    expect(text).not.toContain("Nothing you chose can follow");
    expect(textOf(detailsPage(modeledNoCalendarFitFixture, format))).toContain("365 planting dates did not complete");
  });

  it("preserves a model-data gap as missing evidence with its exact reason", () => {
    const reason = "Daily temperature observations are missing for a retained historical weather season.";
    const missing = [{ code: "climate", reason, cropPurposeIds: modeledSnapshotFixture.input.cropPurposeIds, sourceIds: [] }];
    const snapshot = completedSnapshotV3Schema.parse({
      ...modeledSnapshotFixture,
      result: {
        state: "insufficient_data", missing,
        details: { ...modeledSnapshotFixture.result.details, explanation: reason, unassessedChecks: missing },
      },
    });
    const page = resultPage(snapshot, format);
    expect(page.kind).toBe("no_plan");
    expect(textOf(page)).toContain(reason);
    expect(textOf(page)).not.toContain("No calendar fits this development model");
    expect([...page.lead, ...page.more].flatMap(section => section.blocks).some(block => block.kind === "year")).toBe(false);
  });

  it("keeps old snapshots on their existing wording and date semantics", () => {
    for (const snapshot of [completedSnapshotFixture, completedSnapshotV2Fixture]) {
      const page = resultPage(snapshot, format);
      expect(textOf(page)).toContain("4 days in the field");
      expect(textOf(page)).not.toContain("Estimated crop development from historical weather");
      expect(detailsPage(snapshot, format).sections.map(section => section.id)).not.toContain("modeling");
    }
  });
});
