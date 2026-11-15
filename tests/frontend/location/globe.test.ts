// The globe's two pure parts: the built-in style it starts from, and the zoom that fits a field on the map.
import { describe, expect, it } from "vitest";
import { baseStyle, zoomToFit } from "@/features/location/globe";
import type { Palette } from "@/features/location/globe";

const palette: Palette = { ocean: "rgb(1, 2, 3)", grid: "rgb(4, 5, 6)", sky: "rgb(7, 8, 9)", edge: "white", under: "black", fill: "green", pin: "orange", mode: "day" };

/** How many map pixels `spanM` metres cover at `zoom`, on MapLibre's 512 px world. */
const pixelsAcross = (spanM: number, latitude: number, zoom: number) => (spanM * 512 * 2 ** zoom) / (40_075_016.686 * Math.cos((latitude * Math.PI) / 180));

describe("baseStyle", () => {
  it("[R2][R20] is a globe that needs no network and no key: no URL, no sprite, no glyphs", () => {
    const style = baseStyle(palette);
    expect(style.projection).toEqual({ type: "globe" });
    expect(style.sprite).toBeUndefined();
    expect(style.glyphs).toBeUndefined();
    expect(JSON.stringify(style)).not.toMatch(/https?:|\{key\}|maptiler|earthdata/i);
    expect(Object.values(style.sources).every(source => source.type === "geojson")).toBe(true);
  });

  it("dark mode turns the atmosphere down", () => {
    const blend = (mode: Palette["mode"]) => JSON.stringify(baseStyle({ ...palette, mode }).sky?.["atmosphere-blend"]);
    expect(blend("dark")).not.toBe(blend("day"));
  });
});

describe("zoomToFit", () => {
  it("[R3] a field from 50 m to 20 km across fills about 42% of the map's short side, at the equator and at 60°", () => {
    for (const latitude of [0, -6.3, 60]) {
      for (const spanM of [50, 100, 1_000, 20_000]) {
        const share = pixelsAcross(spanM, latitude, zoomToFit(spanM, latitude, 400)) / 400;
        expect(share, `${spanM} m at ${latitude}°`).toBeCloseTo(0.42, 5);
      }
    }
  });

  it("stays between zoom 3 and 19, so a tiny field never zooms past the pictures and a huge one keeps the globe", () => {
    expect(zoomToFit(0.5, 0, 400)).toBe(19);
    expect(zoomToFit(5_000_000, 0, 400)).toBe(3);
  });
});
