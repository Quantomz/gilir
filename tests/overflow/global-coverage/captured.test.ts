import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import captured from "../../../docs/evidence/X2/live-2026-11-14/report.json";
import { checkGlobalCoverage } from "../../../scripts/check-global-coverage";

it("replays the four historical NASA captures offline with their recorded summaries and snapshot IDs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gilir-x2-captured-"));
  const network = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    throw new Error("Historical capture replay reached the network");
  });
  try {
    expect(captured).toMatchObject({ mode: "live", source: { kind: "live" }, execution: "complete",
      context: { expectedDays: 9498, settings: { targetSeasons: 25 } } });
    const replay = await checkGlobalCoverage({ mode: "replay",
      input: fileURLToPath(new URL("../../../docs/evidence/X2/live-2026-11-14", import.meta.url)),
      output: join(directory, "replay") });
    expect(replay).toMatchObject({ mode: "replay", source: { kind: "live" }, execution: "complete" });
    expect(replay.context).toEqual(captured.context);
    expect(replay.locations.map(row => row.location.id)).toEqual(["cordoba", "berlin", "quito", "taveuni"]);
    expect(replay.locations.map(row => row.summary)).toEqual(captured.locations.map(row => row.summary));
    for (const row of replay.locations) {
      expect(row.integrity).toEqual({ kind: "verified" });
      assert(row.summary);
      expect(row.summary.preparation.kind).toBe("ready");
      expect(row.summary.cohort).toMatchObject({ usableSeasons: captured.context.settings.targetSeasons,
        meetsMinimumSeasons: true });
      expect(row.summary.products).toHaveLength(3);
      for (const product of row.summary.products) {
        expect(product).toMatchObject({ status: "validated", normalizedPeriod: { days: captured.context.expectedDays } });
      }
    }
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
