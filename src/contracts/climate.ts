import type { EvidenceValue, IsoDate } from "./common";

export interface DailyWeather {
  readonly date: IsoDate;
  readonly rainMm: EvidenceValue<number>;
  readonly meanC: EvidenceValue<number>;
  readonly minC: EvidenceValue<number>;
  readonly maxC: EvidenceValue<number>;
  readonly humidityPct: EvidenceValue<number>;
  readonly wind2mMs: EvidenceValue<number>;
  readonly solarMjM2Day: EvidenceValue<number>;
  readonly pressureKpa: EvidenceValue<number>;
}

export type WeatherField = Exclude<keyof DailyWeather, "date">;
export type ClimateUnit = "mm/day" | "degC" | "%" | "m/s" | "MJ/m²/day" | "kPa";

export interface ClimateProduct {
  readonly provider: string;
  readonly product: string;
  readonly stream: EvidenceValue<string>;
  readonly version: EvidenceValue<string>;
  readonly cellId: string;
  readonly gridDegrees: readonly [latitudeDeg: number, longitudeDeg: number];
  readonly fields: readonly {
    readonly field: WeatherField;
    readonly providerField: string;
    readonly originalUnit: string;
    readonly canonicalUnit: ClimateUnit;
    readonly conversionVersion: string;
  }[];
  readonly timeStandard: "UTC";
  readonly sourceUrl: string;
  readonly missingDatesByField: readonly { readonly field: WeatherField; readonly dates: readonly IsoDate[] }[];
}

interface ClimateSnapshotData {
  readonly id: string;
  readonly contentHash: string;
  readonly cutoff: IsoDate;
  readonly retrievedAt: string;
  readonly latitudeDeg: number;
  readonly elevationM: EvidenceValue<number>;
  readonly products: readonly ClimateProduct[];
  readonly days: readonly DailyWeather[];
}

export type ClimateSnapshot = ClimateSnapshotData & (
  | { readonly kind: "provider" }
  | { readonly kind: "synthetic"; readonly label: string }
);

export interface ClimateCacheKey {
  readonly provider: string;
  readonly product: string;
  readonly productVersion: string;
  readonly nativeCellId: string;
  readonly fields: readonly WeatherField[];
  readonly start: IsoDate;
  readonly endExclusive: IsoDate;
  readonly timeStandard: "UTC";
}

export interface ClimateCache {
  read(key: ClimateCacheKey): Promise<ClimateSnapshot | null>;
  put(key: ClimateCacheKey, snapshot: ClimateSnapshot): Promise<void>;
}

export const defaultEngineSettings = {
  version: "v1",
  targetSeasons: 25,
  minimumUsableSeasons: 15,
  structuralExpansionLimit: 2_000_000,
  scoredCandidateLimit: 100_000,
  searchGridStepDays: 7,
  mismatchWindowDays: 7,
  dryDayThresholdMm: 1,
  rankingDecimalPlaces: 6,
  adverseQuantile: 0.9,
} satisfies EngineSettings;

export interface EngineSettings {
  readonly version: string;
  readonly targetSeasons: number;
  readonly minimumUsableSeasons: number;
  readonly structuralExpansionLimit: number;
  readonly scoredCandidateLimit: number;
  readonly searchGridStepDays: number;
  readonly mismatchWindowDays: number;
  readonly dryDayThresholdMm: number;
  readonly rankingDecimalPlaces: number;
  readonly adverseQuantile: number;
}
