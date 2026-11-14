import { describe, expect, expectTypeOf, it } from "vitest";
import {
  defaultEngineSettings, parsePlanResult, rankingDecimalPlacesSchema,
} from "@/contracts";
import type {
  CalendarSearchInput, ClimateCohort, ExplanationInput, RankingDecision, RankingInput, RankingResult, RegistryLookup,
} from "@/contracts";
import { resultFixtures } from "@/fixtures/results";
import { climateCohortFixture } from "@/fixtures/science";

describe("E3 shared engine ports", () => {
  it.each([0, 6, 12])("accepts ranking precision %s", precision => {
    expect(rankingDecimalPlacesSchema.parse(precision)).toBe(precision);
  });

  it.each([-1, 13, 0.5, NaN, Infinity, "6", undefined])("rejects invalid ranking precision %s", precision => {
    expect(rankingDecimalPlacesSchema.safeParse(precision).success).toBe(false);
  });

  it("versions independent grid and scoring safety limits", () => {
    expect(defaultEngineSettings.version).toBe("v2");
    expect(defaultEngineSettings.gridExpansionLimit).toBe(2_000_000);
    expect(defaultEngineSettings.scoredCandidateLimit).toBe(100_000);
  });

  it("round-trips separate grid progress and permits zero budgets", () => {
    const search = {
      ...resultFixtures.plan.details.search,
      gridExpandedStates: 0, gridExpansionLimit: 0,
      scoredCandidates: 0, scoredCandidateLimit: 0,
    };
    const result = { ...resultFixtures.plan, details: { ...resultFixtures.plan.details, search } };
    expect(parsePlanResult(JSON.parse(JSON.stringify(result))).details.search).toEqual(search);
  });

  it.each(["gridExpandedStates", "gridExpansionLimit"])("requires the strict %s field", field => {
    const search = Object.fromEntries(Object.entries(resultFixtures.plan.details.search).filter(([key]) => key !== field));
    const result = { ...resultFixtures.plan, details: { ...resultFixtures.plan.details, search } };
    expect(() => parsePlanResult(result)).toThrow();
  });

  it.each([-1, 0.5, NaN, Infinity])("rejects invalid grid counts %s", value => {
    for (const field of ["gridExpandedStates", "gridExpansionLimit"]) {
      const search = { ...resultFixtures.plan.details.search, [field]: value };
      const result = { ...resultFixtures.plan, details: { ...resultFixtures.plan.details, search } };
      expect(() => parsePlanResult(result)).toThrow();
    }
  });

  it("preserves unavailable annual applicability evidence in the synthetic cohort", () => {
    expect(climateCohortFixture.applicabilityClimate).toEqual({
      meanAnnualTemperatureC: { kind: "unavailable", reason: "Synthetic replay has no complete annual temperature evidence." },
      meanAnnualPrecipitationMm: { kind: "unavailable", reason: "Synthetic replay has no complete annual precipitation evidence." },
    });
  });

  it("requires complete port inputs and metric-specific decision units", () => {
    expectTypeOf<Pick<RankingInput, "rankingDecimalPlaces">>().toEqualTypeOf<{ readonly rankingDecimalPlaces: number }>();
    expectTypeOf<CalendarSearchInput["initialPredecessor"]>().toEqualTypeOf<RegistryLookup["cropPurposeIds"][number] | null>();
    expectTypeOf<ClimateCohort["applicabilityClimate"]>().toEqualTypeOf<RegistryLookup["climate"]>();
    expectTypeOf<ExplanationInput["decision"]>().toEqualTypeOf<RankingDecision | null>();
    expectTypeOf<Extract<RankingResult, { kind: "selected" }>["decision"]>().toEqualTypeOf<RankingDecision>();
    expectTypeOf<Exclude<RankingDecision, { kind: "only_candidate" }>["comparedCalendarKey"]>().toEqualTypeOf<string>();
    expectTypeOf<Extract<RankingDecision, { kind: "metric"; metricId: "mean_frequency" }>["unit"]>().toEqualTypeOf<"fraction">();
    expectTypeOf<Extract<RankingDecision, { kind: "metric"; metricId: "unplanted_days" }>["unit"]>().toEqualTypeOf<"days">();
  });
});
