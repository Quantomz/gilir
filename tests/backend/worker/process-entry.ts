import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { farmInputSchema, rankingDecimalPlacesSchema, runManifestSchema } from "@/contracts";
import type { FrozenRun } from "@/contracts";
import { providerSnapshotSchema } from "@/server/cache/schema";
import { runWorkerLoop, runWorkerOnce } from "@/server/runtime";
import { dependencies, MemoryJobs, resultForRun } from "./support";

const storedRun: z.ZodType<FrozenRun> = z.strictObject({
  input: farmInputSchema,
  manifest: runManifestSchema,
  climate: z.array(providerSnapshotSchema),
  settings: z.strictObject({
    version: z.string(), targetSeasons: z.number(), minimumUsableSeasons: z.number(), structuralExpansionLimit: z.number(), gridExpansionLimit: z.number(),
    scoredCandidateLimit: z.number(), searchGridStepDays: z.number(), mismatchWindowDays: z.number(), dryDayThresholdMm: z.number(),
    rankingDecimalPlaces: rankingDecimalPlacesSchema, adverseQuantile: z.number(),
  }),
});

const [mode, path] = z.tuple([z.enum(["freeze", "replay", "drain"]), z.string()]).parse(process.argv.slice(2));
const jobs = new MemoryJobs();
if (mode === "freeze") {
  jobs.freeze = async (_lease, run) => {
    await writeFile(path, JSON.stringify(run));
    process.stdout.write("frozen_before_crash\n");
    process.exit(23);
  };
  await runWorkerOnce(dependencies(jobs));
}
if (mode === "replay") {
  jobs.frozenRun = storedRun.parse(JSON.parse(await readFile(path, "utf8")));
  const result = await runWorkerOnce({
    ...dependencies(jobs),
    prepareClimate: async () => { throw new Error("A replay must use frozen inputs."); },
    calculate: run => {
      if (run.manifest.climateSnapshotIds[0] !== "test-provider-shaped-snapshot") throw new Error("Frozen snapshot changed.");
      return resultForRun(run);
    },
  });
  process.stdout.write(JSON.stringify({ kind: result.kind, state: jobs.state.state }) + "\n");
}
if (mode === "drain") {
  const stopping = new AbortController();
  process.once("SIGTERM", () => { stopping.abort(); });
  await runWorkerLoop({
    dependencies: {
      ...dependencies(jobs),
      executeCalculation: async run => {
        process.stdout.write("calculation_started\n");
        await delay(250);
        return resultForRun(run);
      },
    },
    signal: stopping.signal,
    pollMilliseconds: 1000,
    onTick: result => { process.stdout.write(JSON.stringify({ kind: result.kind, state: jobs.state.state }) + "\n"); },
  });
}
