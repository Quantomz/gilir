export interface RegionBounds {
  readonly westDeg: number;
  readonly eastDeg: number;
  readonly southDeg: number;
  readonly northDeg: number;
}

const box = (westDeg: number, eastDeg: number, southDeg: number, northDeg: number): RegionBounds =>
  ({ westDeg, eastDeg, southDeg, northDeg });

export const regionBoxNote =
  "Region rectangle is an approximate bounding box drawn around the place named in FAO-56 Table 11; it is not a published boundary.";

export const regions = {
  idaho: box(-117.3, -111.0, 42.0, 49.0),
  california: box(-124.5, -114.1, 32.5, 42.0),
  spain: box(-9.4, 3.4, 36.0, 43.8),
  nigeria: box(2.6, 14.7, 4.2, 13.9),
  pakistan: box(60.8, 77.9, 23.6, 37.1),
  india: box(68.1, 97.4, 6.7, 35.5),
  centralIndia: box(74.0, 84.5, 18.0, 26.9),
  eastAfrica: box(28.8, 48.0, -11.8, 15.0),
  mediterranean: box(-10.0, 37.0, 30.0, 46.0),
  latitude35To45North: box(-180, 180, 35.0, 45.0),
  tropics: box(-180, 180, -23.44, 23.44),
  westAfrica: box(-17.6, 15.9, 4.0, 27.3),
  europe: box(-10.5, 40.0, 35.0, 71.2),
  japanHonshuKyushuShikoku: box(129.5, 142.1, 30.9, 41.6),
  japanHokkaido: box(139.3, 145.9, 41.3, 45.6),
  centralUsa: box(-104.1, -87.5, 35.0, 49.0),
  contiguousUsa: box(-124.8, -66.9, 24.5, 49.4),
  californiaDesert: box(-116.6, -114.1, 32.5, 34.3),
  italy: box(6.6, 18.6, 36.6, 47.1),
  philippines: box(116.9, 126.6, 4.6, 21.1),
  egypt: box(24.7, 36.9, 22.0, 31.7),
  lebanon: box(35.1, 36.7, 33.05, 34.7),
} as const;
