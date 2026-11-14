import { describe, expect, it } from "vitest";
import type { ClimateProduct, ClimateSnapshot, WeatherField } from "@/contracts/climate";
import { defaultEngineSettings } from "@/contracts/climate";
import { parseIsoDate } from "@/contracts/common";
import type { CohortInput } from "@/contracts/engine";
import { buildClimateCohort } from "@/engine/metrics";
import { av, cohortInput, history, missing, snapshot, value } from "./helpers";

const fields: readonly WeatherField[] = ["rainMm", "meanC", "minC", "maxC", "humidityPct", "wind2mMs", "solarMjM2Day", "pressureKpa"];
const units: Record<WeatherField, ClimateProduct["fields"][number]["canonicalUnit"]> = {
  rainMm: "mm/day", meanC: "degC", minC: "degC", maxC: "degC", humidityPct: "%", wind2mMs: "m/s", solarMjM2Day: "MJ/m²/day", pressureKpa: "kPa",
};
const weather = history("2022-07-01", "2026-07-01", () => ({ rainMm: 2, meanC: 20 }));
const settings = { ...defaultEngineSettings, targetSeasons: 3, minimumUsableSeasons: 3 };

function productSnapshot(id: string, owned: readonly WeatherField[], elevation: number): ClimateSnapshot {
  return {
    ...snapshot(weather, "2026-07-01", elevation),
    kind: "provider",
    id,
    products: [{
      provider: "Synthetic provider fixture", product: id, cellId: `${id}-cell`, gridDegrees: [1, 1],
      stream: { kind: "unavailable", reason: "Synthetic fixture." },
      version: { kind: "unavailable", reason: "Synthetic fixture." },
      timeStandard: "UTC", sourceUrl: "https://example.org/synthetic-climate", missingDatesByField: [],
      fields: owned.map(field => ({ field, providerField: field, originalUnit: units[field], canonicalUnit: units[field], conversionVersion: "synthetic-v1" })),
    }],
    days: weather.map(day => ({
      ...day,
      ...Object.fromEntries(fields.filter(field => !owned.includes(field)).map(field => [field, missing(`Not produced by ${id}.`)])),
    })),
  };
}

const meteorology = productSnapshot("meteorology", ["meanC", "minC", "maxC", "humidityPct", "wind2mMs", "pressureKpa"], 11);
const solar = productSnapshot("solar", ["solarMjM2Day"], 999);
const rain = productSnapshot("rain", ["rainMm"], 22);
const snapshots = [meteorology, solar, rain];

function input(climate: readonly ClimateSnapshot[] = snapshots): CohortInput {
  const base = cohortInput({ days: weather, cutoff: "2026-07-01", horizonStart: "2026-07-01", horizonDays: 365, settings });
  return { ...base, run: { ...base.run, climate } };
}

function exclusions(cohort: ReturnType<typeof buildClimateCohort>): string[] {
  if (cohort.coverage.kind !== "available") throw new Error("Expected available coverage.");
  return cohort.coverage.value.seasons.flatMap(season => season.status === "excluded" ? [season.reason] : []);
}

describe("declared climate product composition", () => {
  it("joins three partial snapshots by UTC date, selects meteorology elevation and preserves the frozen evidence", () => {
    const args = input();
    const before = structuredClone(args);
    const cohort = buildClimateCohort(args);
    expect(cohort.usable).toHaveLength(3);
    for (const season of cohort.usable) {
      expect(season.days).toEqual(weather.filter(day => day.date >= season.interval.start && day.date < season.interval.endExclusive));
    }
    expect(cohort.applicabilityClimate.meanAnnualPrecipitationMm).toEqual(av(730));
    expect(cohort.applicabilityClimate.meanAnnualTemperatureC).toEqual(av(20));
    expect(cohort.elevationM).toEqual(av(11));
    expect(cohort.gaps).toEqual([]);
    expect(args).toEqual(before);
    expect(buildClimateCohort(input([rain, solar, meteorology]))).toEqual(cohort);
  });

  it("uses declared owners even when other products contain conflicting available placeholders", () => {
    const conflicting = solar.days.map(day => ({ ...day, rainMm: av(900), meanC: av(-70) }));
    expect(buildClimateCohort(input([meteorology, { ...solar, days: conflicting }, rain]))).toEqual(buildClimateCohort(input()));
  });

  it("counts repeated field declarations within one snapshot as one owner", () => {
    expect(buildClimateCohort(input([{ ...meteorology, products: [...meteorology.products, ...meteorology.products] }, solar, rain])).usable).toHaveLength(3);
  });

  it("makes absent field ownership explicit and includes every contributing snapshot in the climate gap", () => {
    const cohort = buildClimateCohort(input([rain, meteorology]));
    expect(cohort.usable).toEqual([]);
    expect(exclusions(cohort).every(reason => reason.includes("solarMjM2Day"))).toBe(true);
    expect(cohort.gaps).toContainEqual(expect.objectContaining({ code: "climate", sourceIds: ["meteorology", "rain"] }));
  });

  it("retains available rain and temperature insights when solar evidence blocks the ranking cohort", () => {
    const cohort = buildClimateCohort(input([meteorology, rain]));
    expect(cohort.usable).toEqual([]);
    const july = cohort.insights.filter(insight => insight.month === 7).map(insight => insight.metric);
    expect(value(july, "monthly_rain_median")).toBe(62);
    expect(value(july, "monthly_mean_temperature")).toBe(20);
    expect(value(july, "wet_day_frequency")).toBe(1);
    expect(july.every(metric => metric.methodVersion === "climate-insight-v2")).toBe(true);
    expect(july.find(metric => metric.id === "monthly_rain_median")?.denominator).toEqual({ kind: "available", value: { count: 3, unit: "seasons" } });
    const spells = cohort.insights.filter(insight => insight.metric.id === "longest_dry_spell");
    expect(spells).toHaveLength(3);
    expect(spells.every(insight => insight.metric.value.kind === "available" && insight.metric.value.value === 0)).toBe(true);
  });

  it("uses independent monthly rain and temperature denominators when one observation is missing", () => {
    const missingRain = { ...rain, days: rain.days.map(day => day.date === "2024-07-03" ? { ...day, rainMm: missing() } : day) };
    const rainGap = buildClimateCohort(input([meteorology, solar, missingRain]));
    const rainJuly = rainGap.insights.filter(insight => insight.month === 7).map(insight => insight.metric);
    expect(rainJuly.find(metric => metric.id === "monthly_rain_median")?.denominator).toEqual({ kind: "available", value: { count: 2, unit: "seasons" } });
    expect(rainJuly.find(metric => metric.id === "monthly_mean_temperature")?.denominator).toEqual({ kind: "available", value: { count: 93, unit: "days" } });
    expect(value(rainGap.insights.filter(insight => insight.month === 8).map(insight => insight.metric), "monthly_rain_median")).toBe(62);
    expect(rainGap.insights.filter(insight => insight.metric.id === "longest_dry_spell")).toHaveLength(2);

    const missingTemperature = { ...meteorology, days: meteorology.days.map(day => day.date === "2024-07-03" ? { ...day, meanC: missing() } : day) };
    const temperatureGap = buildClimateCohort(input([missingTemperature, solar, rain]));
    const temperatureJuly = temperatureGap.insights.filter(insight => insight.month === 7).map(insight => insight.metric);
    expect(temperatureJuly.find(metric => metric.id === "monthly_rain_median")?.denominator).toEqual({ kind: "available", value: { count: 3, unit: "seasons" } });
    expect(temperatureJuly.find(metric => metric.id === "monthly_mean_temperature")?.denominator).toEqual({ kind: "available", value: { count: 62, unit: "days" } });
    expect(temperatureGap.insights.filter(insight => insight.metric.id === "longest_dry_spell")).toHaveLength(3);
  });

  it("counts a complete July assembled across adjacent July-15 replay periods once", () => {
    const args = input([meteorology, rain]);
    const cohort = buildClimateCohort({ ...args, horizon: { start: parseIsoDate("2026-07-15"), endExclusive: parseIsoDate("2027-07-15") } });
    expect(cohort.usable).toEqual([]);
    const july = cohort.insights.filter(insight => insight.month === 7).map(insight => insight.metric);
    expect(value(july, "monthly_rain_median")).toBe(62);
    expect(value(july, "monthly_mean_temperature")).toBe(20);
    expect(july.find(metric => metric.id === "monthly_rain_median")?.denominator).toEqual({ kind: "available", value: { count: 1, unit: "seasons" } });
  });

  it("rejects competing owners even when their observations agree", () => {
    const competing = { ...solar, id: "another-solar" };
    const cohort = buildClimateCohort(input([...snapshots, competing]));
    expect(cohort.usable).toEqual([]);
    expect(exclusions(cohort).every(reason => reason.includes("solarMjM2Day") && reason.includes("another-solar") && reason.includes("solar"))).toBe(true);
    expect(buildClimateCohort(input([competing, rain, solar, meteorology]))).toEqual(cohort);
  });

  it("excludes a season missing an owned date even when another snapshot has a complete value", () => {
    const incomplete = { ...rain, days: rain.days.filter(day => day.date !== "2024-07-03") };
    const spare = { ...solar, days: solar.days.map(day => ({ ...day, rainMm: av(100) })) };
    const cohort = buildClimateCohort(input([meteorology, spare, incomplete]));
    expect(cohort.usable.map(season => season.interval.start)).toEqual(["2025-07-01", "2023-07-01"]);
    expect(exclusions(cohort)).toEqual([expect.stringMatching(/rainMm.*2024-07-03.*rain|rain.*2024-07-03.*rainMm/)]);
    expect(cohort.gaps[0].sourceIds).toEqual(["meteorology", "rain", "solar"]);
  });

  it("preserves an owner's unavailable observation and its reason without borrowing another product's value", () => {
    const incomplete = { ...rain, days: rain.days.map(day => day.date === "2024-07-03" ? { ...day, rainMm: missing("Rain quality mask rejected this observation.") } : day) };
    const spare = { ...solar, days: solar.days.map(day => ({ ...day, rainMm: av(100) })) };
    const cohort = buildClimateCohort(input([meteorology, spare, incomplete]));
    expect(cohort.usable).toHaveLength(2);
    expect(exclusions(cohort)[0]).toContain("Rain quality mask rejected this observation.");
  });

  it("preserves unavailable meteorology elevation while retaining complete weather and insights", () => {
    const reason = "Meteorology elevation was not supplied.";
    const elevationM = missing(reason);
    const cohort = buildClimateCohort(input([{ ...meteorology, elevationM }, solar, rain]));
    expect(cohort.usable).toHaveLength(3);
    expect(cohort.insights.length).toBeGreaterThan(0);
    expect(cohort.elevationM).toEqual(elevationM);
    expect(cohort.gaps).toContainEqual(expect.objectContaining({ code: "climate", reason: expect.stringContaining(reason) }));
  });

  it("returns unavailable elevation for missing or ambiguous mean-temperature ownership", () => {
    for (const climate of [[solar, rain], [...snapshots, { ...meteorology, id: "second-meteorology" }]]) {
      const cohort = buildClimateCohort(input(climate));
      expect(cohort.elevationM.kind).toBe("unavailable");
      expect(cohort.gaps.some(gap => gap.code === "climate")).toBe(true);
    }
  });

  it("keeps the explicit one-synthetic-snapshot exception and returns elevation evidence for an empty run", () => {
    const synthetic = buildClimateCohort(input([snapshot(weather, "2026-07-01", 31)]));
    expect(synthetic.usable).toHaveLength(3);
    expect(synthetic.elevationM).toEqual(av(31));
    const empty = buildClimateCohort(input([]));
    expect(empty.coverage.kind).toBe("unavailable");
    expect(empty.elevationM.kind).toBe("unavailable");
    expect(empty.gaps.some(gap => gap.code === "climate")).toBe(true);
  });

  it("requires declarations for provider snapshots and for multiple metadata-free synthetic snapshots", () => {
    const synthetic = snapshot(weather, "2026-07-01");
    for (const climate of [[{ ...synthetic, kind: "provider" } satisfies ClimateSnapshot], [synthetic, { ...synthetic, id: "second-synthetic" }]]) {
      expect(buildClimateCohort(input(climate)).usable).toHaveLength(0);
    }
  });

  it("uses the frozen manifest cutoff even when snapshot cutoffs permit newer seasons", () => {
    const args = input([snapshot(weather, "2026-07-01")]);
    const cohort = buildClimateCohort({ ...args, run: { ...args.run, manifest: { ...args.run.manifest, dataCutoff: parseIsoDate("2024-07-01") } } });
    expect(cohort.usable.map(season => season.interval.start)).toEqual(["2023-07-01", "2022-07-01"]);
  });

  it("records composition, elevation selection and frozen-cutoff replay method versions", () => {
    const cohort = buildClimateCohort(input());
    if (cohort.coverage.kind !== "available") throw new Error("Expected available coverage.");
    expect(cohort.coverage.value.methodVersion).toContain("replay-v2");
    expect(cohort.coverage.value.methodVersion).toContain("declared-field-composition-v1");
    expect(cohort.coverage.value.methodVersion).toContain("elevation-meanC-owner-v1");
    expect(cohort.coverage.value.methodVersion).toContain("annual-applicability-v1");
  });
});
