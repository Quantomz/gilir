import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defaultEngineSettings } from "@/contracts/climate";
import { isoDateSchema } from "@/contracts/common";
import type { FrozenRun } from "@/contracts/engine";
import { resultDetailsSchema } from "@/contracts/result";
import { buildClimateCohort } from "@/engine/metrics";
import { frozenRunFixture } from "@/fixtures/science";
import { providerSnapshotSchema } from "@/server/cache/schema";
import { addDays, av } from "./helpers";

const summarySchema = z.object({ planningStart: isoDateSchema, cutoff: isoDateSchema });

describe("captured NASA provider replay", () => {
  for (const location of [{ name: "bangkok", elevationM: 4.48 }, { name: "pretoria", elevationM: 1198.61 }]) {
    it(`builds 25 seasons from ${location.name}'s three committed product snapshots`, () => {
      const directory = new URL(`../../../docs/evidence/B2/${location.name}/`, import.meta.url);
      const climate = z.array(providerSnapshotSchema).length(3).parse(JSON.parse(gunzipSync(readFileSync(new URL("snapshots.json.gz", directory))).toString("utf8")));
      const summary = summarySchema.parse(JSON.parse(readFileSync(new URL("summary.json", directory), "utf8")));
      const run: FrozenRun = {
        ...frozenRunFixture,
        manifest: { ...frozenRunFixture.manifest, dataCutoff: summary.cutoff, climateSnapshotIds: climate.map(snapshot => snapshot.id) },
        climate, settings: defaultEngineSettings,
      };
      const before = structuredClone(run);
      const args = { run, horizon: { start: summary.planningStart, endExclusive: addDays(summary.planningStart, 365) }, lookbackDays: 0 };
      const cohort = buildClimateCohort(args);
      expect(climate.every(snapshot => snapshot.days.length === 9497)).toBe(true);
      expect(cohort.usable).toHaveLength(25);
      expect(cohort.usable.every(season => season.days.length === 365)).toBe(true);
      expect(cohort.elevationM).toEqual(av(location.elevationM));
      expect(cohort.gaps).toEqual([]);
      expect(cohort.insights.length).toBeGreaterThan(0);
      expect(() => resultDetailsSchema.unwrap().shape.cohort.parse(cohort.coverage)).not.toThrow();
      expect(buildClimateCohort({ ...args, run: { ...run, climate: [climate[2], climate[0], climate[1]] } })).toEqual(cohort);
      expect(buildClimateCohort({ ...args, run: { ...run, climate: [...climate].reverse() } })).toEqual(cohort);
      expect(run).toEqual(before);
    });
  }
});
