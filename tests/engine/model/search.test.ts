import { describe, expect, it } from "vitest";
import { defaultModelingPolicy } from "@/contracts/model";
import { prepareCropSeasons } from "@/engine/model/domain";
import { enumerateModelGrid, findModelCalendar } from "@/engine/model/search";
import { addDays } from "@/engine/metrics/dates";
import { setup } from "./fixtures";

function domain() {
  const { run, registry, cohort } = setup(12, [20]);
  const result = prepareCropSeasons({ run, release: registry.modelRelease, cohort,
    horizon: { start: run.input.planningStart, endExclusive: addDays(run.input.planningStart, 12) }, policy: defaultModelingPolicy });
  if (result.kind !== "ready") throw new Error("Expected test domain.");
  return result.domain;
}
describe("model reservation search", () => {
  it("returns a daily witness and preserves exact expansion-limit semantics", () => {
    const input = { domain: domain(), rules: [], initialPredecessor: null };
    expect(findModelCalendar({ ...input, expansionLimit: 0 }).kind).toBe("limit_reached");
    const result = findModelCalendar({ ...input, expansionLimit: 1 });
    expect(result.kind).toBe("witness");
    expect(result.expandedStates).toBe(1);
    if (result.kind === "witness") expect(result.sequence[0].availableOffset).toBe(4);
  });
  it("permits repeats and earliest-availability dates outside the weekly grid", () => {
    const input = { domain: domain(), rules: [], initialPredecessor: null, expansionLimit: 1000 };
    const generator = enumerateModelGrid(input, 7);
    const dates: number[][] = [];
    let end;
    while (true) {
      const next = generator.next();
      if (next.done) { end = next.value; break; }
      dates.push(next.value.sequence.map(item => item.plantedOffset));
    }
    expect(end.kind).toBe("grid_complete");
    expect(dates).toContainEqual([0, 4, 8]);
    expect(dates.some(sequence => sequence.length === 1)).toBe(true);
  });
  it("keeps every selected crop mandatory with variable thermal durations", () => {
    const { run, registry, cohort } = setup(12, [20]);
    const selected = registry.modelRelease.models.slice(0, 2);
    const input = { ...run, input: { ...run.input, cropPurposeIds: selected.map(model => model.cropPurposeId) } };
    const result = prepareCropSeasons({ run: input, release: registry.modelRelease, cohort,
      horizon: { start: run.input.planningStart, endExclusive: addDays(run.input.planningStart, 12) }, policy: defaultModelingPolicy });
    if (result.kind !== "ready") throw new Error("Expected test domain.");
    const witness = findModelCalendar({ domain: result.domain, rules: [], initialPredecessor: null, expansionLimit: 1000 });
    expect(witness.kind).toBe("witness");
    if (witness.kind === "witness") expect(new Set(witness.sequence.map(item => item.occurrence.cropPurposeId))).toEqual(new Set(input.input.cropPurposeIds));
  });
});
