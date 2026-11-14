import type { ClimateCacheKey, ClimateUnit, WeatherField } from "@/contracts/climate";

interface FieldDefinition {
  readonly field: WeatherField;
  readonly parameter: string;
  readonly unit: ClimateUnit;
}

export interface ProductDefinition {
  readonly id: string;
  readonly grid: readonly [number, number];
  readonly origin: readonly [number, number];
  readonly counts: readonly [number, number];
  readonly fields: readonly FieldDefinition[];
  readonly allowedSources: readonly string[];
  readonly gridSource: string;
}

export const products: readonly ProductDefinition[] = [
  {
    id: "POWER_METEOROLOGY", grid: [0.5, 0.625], origin: [-90, -180], counts: [361, 576],
    fields: [
      { field: "meanC", parameter: "T2M", unit: "degC" },
      { field: "minC", parameter: "T2M_MIN", unit: "degC" },
      { field: "maxC", parameter: "T2M_MAX", unit: "degC" },
      { field: "humidityPct", parameter: "RH2M", unit: "%" },
      { field: "wind2mMs", parameter: "WS2M", unit: "m/s" },
      { field: "pressureKpa", parameter: "PS", unit: "kPa" },
    ],
    allowedSources: ["MERRA2", "GEOSIT", "GEOS-IT", "GEOS5", "POWER"],
    gridSource: "https://gmao.gsfc.nasa.gov/gmao-products/merra-2/system-characteristics_merra-2/",
  },
  {
    id: "POWER_SOLAR", grid: [1, 1], origin: [-89.5, -179.5], counts: [180, 360],
    fields: [{ field: "solarMjM2Day", parameter: "ALLSKY_SFC_SW_DWN", unit: "MJ/m²/day" }],
    allowedSources: ["SYN1DEG", "SRB", "FLASHFLUX", "POWER"],
    gridSource: "https://ceres.larc.nasa.gov/documents/DPC/DPC_current/pdfs/DPC_SYN1deg-Month_R6V1.pdf",
  },
  {
    id: "POWER_IMERG", grid: [0.1, 0.1], origin: [-89.95, -179.95], counts: [1800, 3600],
    fields: [{ field: "rainMm", parameter: "IMERG_PRECTOT", unit: "mm/day" }],
    allowedSources: ["IMERG", "POWER"],
    gridSource: "https://gpm.nasa.gov/sites/default/files/document_files/IMERG_doc.pdf",
  },
];

export interface NativeCell {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
}

export function nativeCell(product: ProductDefinition, longitude: number, latitude: number): NativeCell {
  const wrappedLongitude = ((longitude + 180) % 360 + 360) % 360 - 180;
  const nearestIndex = (coordinate: number, origin: number, step: number) => Math.floor((coordinate - origin) / step + 0.5 + 1e-9);
  const latIndex = Math.max(0, Math.min(product.counts[0] - 1, nearestIndex(latitude, product.origin[0], product.grid[0])));
  const lonIndex = ((nearestIndex(wrappedLongitude, product.origin[1], product.grid[1]) % product.counts[1]) + product.counts[1]) % product.counts[1];
  return {
    id: `${product.id}:lat${latIndex}:lon${lonIndex}`,
    latitude: Number((product.origin[0] + latIndex * product.grid[0]).toFixed(6)),
    longitude: Number((product.origin[1] + lonIndex * product.grid[1]).toFixed(6)),
  };
}

export const cacheProductVersion = "source-release-unreported;POWER-daily-v2;normalization-v1";

export function sourceUrl(product: ProductDefinition, cell: NativeCell, key: ClimateCacheKey): string {
  const url = new URL("https://power.larc.nasa.gov/api/temporal/daily/point");
  url.search = new URLSearchParams({
    parameters: product.fields.map(({ parameter }) => parameter).join(","),
    community: "AG", longitude: String(cell.longitude), latitude: String(cell.latitude),
    start: key.start.replaceAll("-", ""),
    end: new Date(Date.parse(`${key.endExclusive}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10).replaceAll("-", ""),
    format: "JSON", "time-standard": "UTC",
  }).toString();
  return url.toString();
}
