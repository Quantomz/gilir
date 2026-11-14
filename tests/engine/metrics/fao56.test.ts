import { describe, expect, it } from "vitest";
import type { WeatherField } from "@/contracts/climate";
import {
  actualVapourPressureKpa, clearSkyRadiationMj, dayOfYear, extraterrestrialRadiationMj,
  meanSaturationVapourPressureKpa, netLongwaveRadiationMj, psychrometricConstantKpaPerC,
  referenceEt0Mm, saturationVapourPressureKpa, slopeKpaPerC,
} from "@/engine/metrics/fao56";
import { av, day, missing } from "./helpers";

// Reference values: FAO Irrigation and Drainage Paper 56, chapter 3 worked examples.
// https://www.fao.org/4/X0490E/x0490e07.htm and https://www.fao.org/4/X0490E/x0490e08.htm
// FAO prints values to 2-3 significant decimals, so tolerances below follow the printed precision.

describe("FAO-56 meteorological conversions", () => {
  it("FAO Example 3: saturation vapour pressure at 24.5 and 15 degC, mean es = 2.39 kPa", () => {
    expect(saturationVapourPressureKpa(24.5)).toBeCloseTo(3.075, 3);
    expect(saturationVapourPressureKpa(15)).toBeCloseTo(1.705, 3);
    expect(meanSaturationVapourPressureKpa(24.5, 15)).toBeCloseTo(2.39, 2);
  });

  it("FAO Example 2: psychrometric constant at 81.8 kPa is 0.054 kPa/degC", () => {
    expect(psychrometricConstantKpaPerC(81.8)).toBeCloseTo(0.054, 3);
  });

  it("FAO Example 18 intermediate: slope of the vapour pressure curve at 16.9 degC is 0.122 kPa/degC", () => {
    expect(slopeKpaPerC(16.9)).toBeCloseTo(0.122, 3);
  });

  it("uses the spec's mean-RH approximation: ea = RHmean/100 * es", () => {
    const es = meanSaturationVapourPressureKpa(21.5, 12.3);
    expect(actualVapourPressureKpa(70.52, 21.5, 12.3)).toBeCloseTo(0.7052 * es, 10);
    expect(actualVapourPressureKpa(70.52, 21.5, 12.3)).toBeCloseTo(1.409, 3);
  });

  it("FAO Example 8: extraterrestrial radiation at 20 degS on 3 September (day 246) is 32.2 MJ/m2/day", () => {
    expect(extraterrestrialRadiationMj(-20, 246)).toBeCloseTo(32.2, 1);
  });

  it("FAO Example 18 intermediate: clear-sky radiation for Ra 41.09 at 100 m is 30.90 MJ/m2/day", () => {
    expect(clearSkyRadiationMj(41.09, 100)).toBeCloseTo(30.90, 2);
  });

  it("FAO Example 11: net longwave radiation is 3.5 MJ/m2/day", () => {
    expect(netLongwaveRadiationMj({ tmaxC: 25.1, tminC: 19.1, eaKpa: 2.1, rsMj: 14.5, rsoMj: 18.8 })).toBeCloseTo(3.5, 1);
  });

  it("counts day of year from real UTC dates, including leap years", () => {
    expect(dayOfYear("2026-07-06")).toBe(187);
    expect(dayOfYear("2026-01-01")).toBe(1);
    expect(dayOfYear("2024-12-31")).toBe(366);
    expect(dayOfYear("2024-03-01")).toBe(61);
  });
});

describe("FAO-56 Penman-Monteith reference evaporation", () => {
  // FAO Example 18, Brussels 6 July: lat 50 deg 48' N, 100 m, Tmax 21.5, Tmin 12.3, Tmean 16.9,
  // u2 2.078 m/s, Rs 22.07 MJ/m2/day, P 100.1 kPa. ea 1.409 kPa comes from RHmax/RHmin in FAO; the spec's
  // RHmean method reproduces it with RHmean = 70.52%. FAO result: ET0 = 3.9 mm/day.
  const brussels = day("2026-07-06", {
    maxC: 21.5, minC: 12.3, meanC: 16.9, humidityPct: 70.52, wind2mMs: 2.078,
    solarMjM2Day: 22.07, pressureKpa: 100.1, rainMm: 0,
  });

  it("FAO Example 18 (Brussels): ET0 = 3.9 mm/day within 0.05 mm/day", () => {
    const et0 = referenceEt0Mm(brussels, { latitudeDeg: 50.8, elevationM: av(100) });
    expect(et0.kind).toBe("available");
    if (et0.kind === "available") expect(Math.abs(et0.value - 3.9)).toBeLessThanOrEqual(0.05);
  });

  it("clamps a valid negative result to zero (cold, humid, dark day)", () => {
    const winter = day("2026-12-21", {
      maxC: -5, minC: -15, meanC: -10, humidityPct: 95, wind2mMs: 0.5, solarMjM2Day: 1, pressureKpa: 101.3,
    });
    expect(referenceEt0Mm(winter, { latitudeDeg: 60, elevationM: av(0) })).toEqual({ kind: "available", value: 0 });
  });

  const required: WeatherField[] = ["meanC", "minC", "maxC", "humidityPct", "wind2mMs", "solarMjM2Day", "pressureKpa"];
  it.each(required)("returns unavailable, never 0, when %s is missing", field => {
    const result = referenceEt0Mm(day("2026-07-06", { [field]: missing() }), { latitudeDeg: 15, elevationM: av(30) });
    expect(result.kind).toBe("unavailable");
  });

  it("does not need rainfall: missing rain leaves ET0 available", () => {
    const result = referenceEt0Mm(day("2026-07-06", { rainMm: missing() }), { latitudeDeg: 15, elevationM: av(30) });
    expect(result.kind).toBe("available");
  });

  it("returns unavailable when site elevation is unavailable", () => {
    const result = referenceEt0Mm(day("2026-07-06"), { latitudeDeg: 15, elevationM: missing("No elevation.") });
    expect(result.kind).toBe("unavailable");
  });

  it.each([
    ["humidity above 100%", { humidityPct: 150 }],
    ["negative humidity", { humidityPct: -1 }],
    ["negative wind", { wind2mMs: -1 }],
    ["negative solar radiation", { solarMjM2Day: -1 }],
    ["daily minimum above daily maximum", { minC: 31, maxC: 30 }],
  ])("treats physically invalid input (%s) as unavailable, not zero", (_label, overrides) => {
    const result = referenceEt0Mm(day("2026-07-06", overrides), { latitudeDeg: 15, elevationM: av(30) });
    expect(result.kind).toBe("unavailable");
  });

  it("is deterministic: the same day gives an identical result", () => {
    const site = { latitudeDeg: 50.8, elevationM: av(100) };
    expect(referenceEt0Mm(brussels, site)).toEqual(referenceEt0Mm(brussels, site));
  });
});
