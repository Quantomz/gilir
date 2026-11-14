import { describe, expect, it } from "vitest";
import { readRegistryRelease, resolveRegistry } from "@/registry";
import { lookupAt, places } from "./support";

const vegetables = readRegistryRelease("fao56-vegetables-2026-11-15");
const previous = readRegistryRelease("fao56-temperature-2026-11-14");

const fao56Table11Stages: Record<string, readonly [number, number, number, number]> = {
  "broccoli-fao56-california-desert-sep": [35, 45, 40, 15],
  "broccoli-fao56-crucifers-mediterranean-apr": [20, 30, 20, 10],
  "brussels-sprouts-fao56-crucifers-mediterranean-apr": [20, 30, 20, 10],
  "cabbage-fao56-california-desert-sep": [40, 60, 50, 15],
  "cabbage-fao56-crucifers-mediterranean-apr": [20, 30, 20, 10],
  "cauliflower-fao56-california-desert-sep": [35, 50, 40, 15],
  "cauliflower-fao56-crucifers-mediterranean-apr": [20, 30, 20, 10],
  "carrot-fao56-california-desert-oct": [30, 50, 90, 30],
  "carrot-fao56-mediterranean-feb-mar": [30, 40, 60, 20],
  "celery-fao56-mediterranean-apr": [25, 40, 45, 15],
  "lettuce-fao56-mediterranean-apr": [20, 30, 15, 10],
  "onion-dry-fao56-california-jan": [20, 35, 110, 45],
  "onion-dry-fao56-mediterranean-apr": [15, 25, 70, 40],
  "onion-green-fao56-california-mar": [30, 55, 55, 40],
  "onion-green-fao56-mediterranean-apr-may": [25, 30, 10, 5],
  "spinach-fao56-mediterranean-apr": [20, 20, 15, 5],
  "radish-fao56-mediterranean-europe-mar-apr": [5, 10, 15, 5],
  "eggplant-fao56-mediterranean-may-jun": [30, 45, 40, 25],
  "sweet-pepper-fao56-europe-mediterranean-apr-jun": [30, 35, 40, 20],
  "tomato-fao56-california-desert-jan": [25, 40, 60, 30],
  "tomato-fao56-california-apr-may": [35, 40, 50, 30],
  "tomato-fao56-mediterranean-apr-may": [30, 40, 45, 30],
  "cantaloupe-fao56-california-jan": [30, 45, 35, 10],
  "pumpkin-winter-squash-fao56-mediterranean-mar-aug": [20, 30, 30, 20],
  "pumpkin-winter-squash-fao56-europe-jun": [25, 35, 35, 25],
  "squash-zucchini-fao56-mediterranean-apr": [25, 35, 25, 15],
  "squash-zucchini-fao56-europe-may-jun": [20, 30, 25, 15],
  "sweet-melon-fao56-california-desert-aug": [15, 40, 65, 15],
  "sweet-melon-fao56-california-mar": [30, 30, 50, 30],
  "sweet-melon-fao56-mediterranean-may": [25, 35, 40, 20],
  "watermelon-fao56-italy-apr": [20, 30, 30, 30],
  "beet-table-fao56-mediterranean-apr-may": [15, 25, 20, 10],
  "green-bean-fao56-egypt-lebanon-aug-sep": [15, 25, 25, 10],
  "green-bean-fao56-california-mediterranean-feb-mar": [20, 30, 30, 10],
  "pea-green-fao56-idaho-apr": [35, 25, 30, 20],
  "pea-green-fao56-mediterranean-mar-apr": [20, 30, 35, 15],
  "pea-green-fao56-europe-may": [15, 25, 35, 15],
  "sweet-maize-fao56-california-desert-jan": [20, 40, 70, 10],
  "sweet-maize-fao56-idaho-apr": [30, 30, 30, 10],
  "sweet-maize-fao56-philippines-mar": [20, 20, 30, 10],
  "sweet-maize-fao56-mediterranean-may-jun": [20, 25, 25, 10],
};

const fao56Table12Kc: Record<string, readonly [number, number, number]> = {
  "broccoli": [0.7, 1.05, 0.95],
  "brussels-sprouts": [0.7, 1.05, 0.95],
  "cabbage": [0.7, 1.05, 0.95],
  "cauliflower": [0.7, 1.05, 0.95],
  "carrot": [0.7, 1.05, 0.95],
  "celery": [0.7, 1.05, 1.0],
  "lettuce": [0.7, 1.0, 0.95],
  "onion-dry": [0.7, 1.05, 0.75],
  "onion-green": [0.7, 1.0, 1.0],
  "spinach": [0.7, 1.0, 0.95],
  "radish": [0.7, 0.9, 0.85],
  "eggplant": [0.6, 1.05, 0.9],
  "sweet-pepper": [0.6, 1.05, 0.9],
  "tomato": [0.6, 1.15, 0.9],
  "cantaloupe": [0.5, 0.85, 0.6],
  "pumpkin-winter-squash": [0.5, 1.0, 0.8],
  "squash-zucchini": [0.5, 0.95, 0.75],
  "sweet-melon": [0.5, 1.05, 0.75],
  "watermelon": [0.4, 1.0, 0.75],
  "beet-table": [0.5, 1.05, 0.95],
  "green-bean": [0.5, 1.05, 0.9],
  "pea-green": [0.5, 1.15, 1.1],
  "sweet-maize": [0.3, 1.15, 1.05],
};

const added = vegetables.profiles.filter(profile => !previous.profiles.some(old => old.id === profile.id));

describe("E1 vegetables and annual fruits release", () => {
  it("adds 23 annual vegetables and fruits on top of the 19 field crops", () => {
    const previousIds = previous.catalogue.entries.map(entry => entry.id);
    const newIds = vegetables.catalogue.entries.map(entry => entry.id).filter(id => !previousIds.includes(id));
    expect(newIds.sort()).toEqual(Object.keys(fao56Table12Kc).sort());
    expect(vegetables.catalogue.entries).toHaveLength(42);
    for (const entry of vegetables.catalogue.entries) expect(entry.purpose).toBe("food");
  });

  it("carries every earlier profile over unchanged", () => {
    for (const old of previous.profiles) {
      expect(vegetables.profiles.find(profile => profile.id === old.id)).toEqual(old);
    }
  });

  it("matches every added stage allocation to its FAO-56 Table 11 row and uses the stage sum as season length", () => {
    expect(Object.fromEntries(added.map(profile => {
      const stages = profile.timing.generatedStageDays;
      return [profile.id, [stages.initial, stages.development, stages.middle, stages.late]];
    }))).toEqual(fao56Table11Stages);
    for (const profile of added) {
      const stages = profile.timing.generatedStageDays;
      const total = stages.initial + stages.development + stages.middle + stages.late;
      expect(profile.timing.publishedDurationDays).toEqual({ kind: "available", value: [total, total] });
    }
  });

  it("matches every added Kc to its FAO-56 Table 12 row with fresh-harvest choices", () => {
    for (const profile of added) {
      expect([profile.kc.initial, profile.kc.middle, profile.kc.end]).toEqual(fao56Table12Kc[profile.cropPurposeId]);
    }
  });

  it("adds only the approved crop-specific temperature rules", () => {
    const rules = Object.fromEntries(added
      .filter(profile => profile.temperatureRules.length > 0)
      .map(profile => [profile.cropPurposeId, profile.temperatureRules.map(rule => `${rule.scope.kind === "stage" ? rule.scope.stage : "whole"} ${rule.variable} ${rule.predicate} ${rule.thresholdC} ${rule.sourceIds.join(",")}`)]));
    expect(rules).toEqual({
      broccoli: ["whole min_c at_or_below -7 luo2011", "middle max_c above 35 luo2011"],
      lettuce: ["whole max_c above 30 qin2020"],
    });
  });

  it("records the first-listed choice where FAO-56 lists several rows for one region", () => {
    const warned = (id: string) => vegetables.profiles.find(profile => profile.id === id)?.warnings.join(" ") ?? "";
    for (const id of [
      "lettuce-fao56-mediterranean-apr", "cantaloupe-fao56-california-jan", "spinach-fao56-mediterranean-apr",
      "squash-zucchini-fao56-mediterranean-apr", "green-bean-fao56-california-mediterranean-feb-mar",
      "brussels-sprouts-fao56-crucifers-mediterranean-apr", "beet-table-fao56-mediterranean-apr-may",
    ]) expect(warned(id)).toContain("releases the first-listed row");
    expect(warned("eggplant-fao56-mediterranean-may-jun")).toContain("prints a 40-day total, which is not used");
    expect(warned("sweet-maize-fao56-idaho-apr")).toContain("prints a 110-day total, which is not used");
  });

  it("keeps both FAO-56 planting months for Mediterranean pumpkin", () => {
    const pumpkin = vegetables.profiles.find(profile => profile.id === "pumpkin-winter-squash-fao56-mediterranean-mar-aug");
    expect(pumpkin?.timing.plantingWindows.map(entry => entry.window)).toEqual([
      { startMonthDay: "03-01", endMonthDayInclusive: "03-31" },
      { startMonthDay: "08-01", endMonthDayInclusive: "08-31" },
    ]);
  });

  it("resolves vegetables by region with one profile per place", () => {
    const at = (crops: readonly string[], place: readonly [number, number]) =>
      resolveRegistry(lookupAt(crops, place), vegetables).profiles.map(profile => profile.id);
    expect(at(["tomato", "lettuce", "broccoli", "watermelon"], places.madridSpain)).toEqual([
      "tomato-fao56-mediterranean-apr-may", "lettuce-fao56-mediterranean-apr", "broccoli-fao56-crucifers-mediterranean-apr",
    ]);
    expect(at(["tomato", "sweet-melon", "onion-dry"], places.fresnoCalifornia)).toEqual([
      "tomato-fao56-california-apr-may", "sweet-melon-fao56-california-mar", "onion-dry-fao56-california-jan",
    ]);
    expect(at(["tomato", "sweet-melon", "carrot"], [-115.5, 32.8])).toEqual([
      "tomato-fao56-california-desert-jan", "sweet-melon-fao56-california-desert-aug", "carrot-fao56-california-desert-oct",
    ]);
    expect(at(["watermelon"], [12.5, 41.9])).toEqual(["watermelon-fao56-italy-apr"]);
    expect(at(["green-bean"], [35.5, 33.9])).toEqual(["green-bean-fao56-egypt-lebanon-aug-sep"]);
    expect(at(["sweet-maize"], [121.0, 14.6])).toEqual(["sweet-maize-fao56-philippines-mar"]);
  });
});
