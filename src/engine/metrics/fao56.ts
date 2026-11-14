import type { DailyWeather, WeatherField } from "@/contracts/climate";
import type { EvidenceValue } from "@/contracts/common";
import { dayOfYear } from "./dates";
import { available, unavailable } from "./evidence";

export { dayOfYear };

const SOLAR_CONSTANT_MJ_PER_MIN = 0.082;
const STEFAN_BOLTZMANN_MJ = 4.903e-9;
const KELVIN = 273.16;

export const saturationVapourPressureKpa = (tC: number): number => 0.6108 * Math.exp((17.27 * tC) / (tC + 237.3));
export const meanSaturationVapourPressureKpa = (tmaxC: number, tminC: number): number =>
  (saturationVapourPressureKpa(tmaxC) + saturationVapourPressureKpa(tminC)) / 2;
export const actualVapourPressureKpa = (rhMeanPct: number, tmaxC: number, tminC: number): number =>
  (rhMeanPct / 100) * meanSaturationVapourPressureKpa(tmaxC, tminC);
export const slopeKpaPerC = (tC: number): number => (4098 * saturationVapourPressureKpa(tC)) / (tC + 237.3) ** 2;
export const psychrometricConstantKpaPerC = (pressureKpa: number): number => 0.000665 * pressureKpa;

export function extraterrestrialRadiationMj(latitudeDeg: number, day: number): number {
  const phi = (latitudeDeg * Math.PI) / 180;
  const angle = (2 * Math.PI * day) / 365;
  const dr = 1 + 0.033 * Math.cos(angle);
  const delta = 0.409 * Math.sin(angle - 1.39);
  const ws = Math.acos(Math.min(1, Math.max(-1, -Math.tan(phi) * Math.tan(delta))));
  return ((24 * 60) / Math.PI) * SOLAR_CONSTANT_MJ_PER_MIN * dr
    * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
}

export const clearSkyRadiationMj = (raMj: number, elevationM: number): number => (0.75 + 2e-5 * elevationM) * raMj;

export function netLongwaveRadiationMj(input: {
  readonly tmaxC: number; readonly tminC: number; readonly eaKpa: number; readonly rsMj: number; readonly rsoMj: number;
}): number {
  const { tmaxC, tminC, eaKpa, rsMj, rsoMj } = input;
  // With no clear-sky radiation (polar night) the cloudiness ratio is undefined; treat the sky as clear.
  const relative = rsoMj > 0 ? Math.min(rsMj / rsoMj, 1) : 1;
  const sigmaT4 = (STEFAN_BOLTZMANN_MJ * ((tmaxC + KELVIN) ** 4 + (tminC + KELVIN) ** 4)) / 2;
  return sigmaT4 * (0.34 - 0.14 * Math.sqrt(eaKpa)) * (1.35 * relative - 0.35);
}

const et0Fields = ["meanC", "minC", "maxC", "humidityPct", "wind2mMs", "solarMjM2Day", "pressureKpa"] as const satisfies readonly WeatherField[];
type Et0Inputs = Record<(typeof et0Fields)[number], number>;

function invalidReason(w: Et0Inputs): string | null {
  if (w.humidityPct < 0 || w.humidityPct > 100) return "Relative humidity is outside 0-100%.";
  if (w.wind2mMs < 0) return "Wind speed is negative.";
  if (w.solarMjM2Day < 0) return "Solar radiation is negative.";
  if (w.pressureKpa <= 0) return "Air pressure is not positive.";
  if (w.minC > w.maxC) return "Daily minimum temperature exceeds the maximum.";
  return null;
}

/** FAO-56 Penman-Monteith daily ET0 (mm/day), G = 0, mean-RH humidity approximation. */
export function referenceEt0Mm(
  day: DailyWeather,
  site: { readonly latitudeDeg: number; readonly elevationM: EvidenceValue<number> },
): EvidenceValue<number> {
  if (site.elevationM.kind !== "available") return unavailable(`Site elevation unavailable: ${site.elevationM.reason}`.slice(0, 240));
  const w = {} as Et0Inputs;
  for (const field of et0Fields) {
    const v = day[field];
    if (v.kind !== "available") return unavailable(`ET0 needs ${field} on ${day.date}.`);
    w[field] = v.value;
  }
  const invalid = invalidReason(w);
  if (invalid) return unavailable(`${invalid} (${day.date})`);

  const es = meanSaturationVapourPressureKpa(w.maxC, w.minC);
  const ea = (w.humidityPct / 100) * es;
  const delta = slopeKpaPerC(w.meanC);
  const gamma = psychrometricConstantKpaPerC(w.pressureKpa);
  const ra = extraterrestrialRadiationMj(site.latitudeDeg, dayOfYear(day.date));
  const rso = clearSkyRadiationMj(ra, site.elevationM.value);
  const rn = 0.77 * w.solarMjM2Day
    - netLongwaveRadiationMj({ tmaxC: w.maxC, tminC: w.minC, eaKpa: ea, rsMj: w.solarMjM2Day, rsoMj: rso });
  const et0 = (0.408 * delta * rn + gamma * (900 / (w.meanC + 273)) * w.wind2mMs * (es - ea))
    / (delta + gamma * (1 + 0.34 * w.wind2mMs));
  return available(Math.max(0, et0));
}
