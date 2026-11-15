import type { ClimateSnapshot, WeatherField } from "@/contracts/climate";

type Weather = Record<WeatherField, number>;
const fields: readonly WeatherField[] = ["rainMm", "meanC", "minC", "maxC", "humidityPct", "wind2mMs", "solarMjM2Day", "pressureKpa"];

const dayMs = 86_400_000;
const toDay = (iso: string) => Date.parse(iso + "T00:00:00Z") / dayMs;
export const addDays = (iso: string, n: number) => new Date((toDay(iso) + n) * dayMs).toISOString().slice(0, 10);
export const daysFrom = (from: string, to: string) => toDay(to) - toDay(from);
const dayOfYear = (iso: string) => daysFrom(iso.slice(0, 4) + "-01-01", iso) + 1;

export function mergedWeather(snapshots: readonly ClimateSnapshot[], date: string): Weather {
  const merged: Partial<Weather> = {};
  for (const snapshot of snapshots) {
    const day = snapshot.days.find(d => d.date === date);
    for (const f of fields) {
      const v = day?.[f];
      if (v?.kind === "available") merged[f] = v.value;
    }
  }
  const missing = fields.filter(f => merged[f] === undefined);
  const { rainMm, meanC, minC, maxC, humidityPct, wind2mMs, solarMjM2Day, pressureKpa } = merged;
  if (rainMm === undefined || meanC === undefined || minC === undefined || maxC === undefined || humidityPct === undefined
    || wind2mMs === undefined || solarMjM2Day === undefined || pressureKpa === undefined) throw new Error(`${date} lacks ${missing.join(", ")}`);
  return { rainMm, meanC, minC, maxC, humidityPct, wind2mMs, solarMjM2Day, pressureKpa };
}

export function fao56Et0(w: Weather, date: string, latitudeDeg: number, elevationM: number): number {
  const e0 = (t: number) => 0.6108 * Math.exp(17.27 * t / (t + 237.3));
  const es = (e0(w.maxC) + e0(w.minC)) / 2;
  const ea = w.humidityPct / 100 * es;
  const slope = 4098 * e0(w.meanC) / (w.meanC + 237.3) ** 2;
  const gamma = 0.665e-3 * w.pressureKpa;
  const j = dayOfYear(date);
  const phi = latitudeDeg * Math.PI / 180;
  const dr = 1 + 0.033 * Math.cos(2 * Math.PI * j / 365);
  const decl = 0.409 * Math.sin(2 * Math.PI * j / 365 - 1.39);
  const ws = Math.acos(-Math.tan(phi) * Math.tan(decl));
  const ra = 24 * 60 / Math.PI * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.sin(ws));
  const rso = (0.75 + 2e-5 * elevationM) * ra;
  const rns = (1 - 0.23) * w.solarMjM2Day;
  const rnl = 4.903e-9 * ((w.maxC + 273.16) ** 4 + (w.minC + 273.16) ** 4) / 2
    * (0.34 - 0.14 * Math.sqrt(ea)) * (1.35 * Math.min(w.solarMjM2Day / rso, 1) - 0.35);
  const rn = rns - rnl;
  const et0 = (0.408 * slope * rn + gamma * 900 / (w.meanC + 273) * w.wind2mMs * (es - ea)) / (slope + gamma * (1 + 0.34 * w.wind2mMs));
  return Math.max(0, et0);
}

export interface KcCurve {
  readonly stages: { readonly initial: number; readonly development: number; readonly middle: number; readonly late: number };
  readonly kc: { readonly initial: number; readonly middle: number; readonly end: number };
}

export function fao56Kc({ stages, kc }: KcCurve, day: number): number {
  const devEnd = stages.initial + stages.development;
  const midEnd = devEnd + stages.middle;
  if (day <= stages.initial) return kc.initial;
  if (day <= devEnd) return kc.initial + (day - stages.initial) / stages.development * (kc.middle - kc.initial);
  if (day <= midEnd) return kc.middle;
  return kc.middle + (day - midEnd) / stages.late * (kc.end - kc.middle);
}

export interface WindowExample {
  readonly start: string;
  readonly demandMm: number;
  readonly rainMm: number;
  readonly shortfall: number;
}

export function occurrenceWindows(input: {
  readonly snapshots: readonly ClimateSnapshot[];
  readonly firstDate: string;
  readonly curve: KcCurve;
  readonly latitudeDeg: number;
  readonly elevationM: number;
  readonly windowDays: number;
}) {
  const { stages } = input.curve;
  const length = stages.initial + stages.development + stages.middle + stages.late;
  const daily = Array.from({ length }, (_, k) => {
    const date = addDays(input.firstDate, k);
    const w = mergedWeather(input.snapshots, date);
    const et0 = fao56Et0(w, date, input.latitudeDeg, input.elevationM);
    return { date, et0, etc: fao56Kc(input.curve, k + 1) * et0, rain: w.rainMm };
  });
  const windows: WindowExample[] = [];
  for (let s = 0; s + input.windowDays <= length; s++) {
    const slice = daily.slice(s, s + input.windowDays);
    const demandMm = slice.reduce((a, d) => a + d.etc, 0);
    const rainMm = slice.reduce((a, d) => a + d.rain, 0);
    if (demandMm > 0) windows.push({ start: slice[0].date, demandMm, rainMm, shortfall: Math.max(0, demandMm - rainMm) / demandMm });
  }
  return {
    daily,
    windows,
    frequency: windows.filter(w => w.shortfall > 0).length / windows.length,
    mismatch: windows.reduce((a, w) => a + w.shortfall, 0) / windows.length,
  };
}
