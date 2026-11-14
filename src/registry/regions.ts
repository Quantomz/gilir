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
} as const;
