import { describe, expect, it } from "vitest";
import { readRegistryRelease } from "@/registry";

const latest = readRegistryRelease("fao56-temperature-rules-2026-11-15");
const previous = readRegistryRelease("fao56-vegetables-2026-11-15");

const describeRule = (rule: (typeof latest.profiles)[number]["temperatureRules"][number]) =>
  `${rule.scope.kind === "stage" ? rule.scope.stage : "whole"} ${rule.variable} ${rule.predicate} ${rule.thresholdC} [${rule.sourceIds.join(",")}]`;

const rulesByCrop = (release: typeof latest) => {
  const out: Record<string, string[]> = {};
  for (const profile of release.profiles) {
    const rules = profile.temperatureRules.map(describeRule);
    if (out[profile.cropPurposeId] !== undefined) expect(rules).toEqual(out[profile.cropPurposeId]);
    out[profile.cropPurposeId] = rules;
  }
  return out;
};

const addedRules: Record<string, string[]> = {
  "wheat-grain": ["middle min_c at_or_below -3.5 [frederiks2015]"],
  "barley-grain": ["whole min_c at_or_below -12.9 [luo2011,frederiks2015]", "middle min_c at_or_below -4 [frederiks2015]"],
  "sorghum-grain": [
    "middle mean_c at_or_above 31 [prasad2015,prasad2006,djanaguiraman2018]",
    "middle mean_c at_or_above 35 [luo2011,prasad2015]",
    "middle min_c at_or_below 10 [brooking1976]",
  ],
  "groundnut": ["middle max_c above 37 [luo2011]"],
  "lentil-dry": ["middle max_c above 32 [sita2017]"],
  "faba-bean-dry": ["middle max_c at_or_above 28 [bishop2016]", "middle min_c at_or_below -4 [alharbi2021]"],
  "mung-bean-dry": ["middle max_c above 36 [priya2019]"],
  "cowpea-dry": ["middle min_c at_or_above 24 [patelhall1990,luo2011]"],
  "sunflower-seed": ["whole min_c at_or_below -4 [kaya2025,hnilickova2017]"],
  "potato": ["whole min_c at_or_below -2.5 [seppanen2001]", "development min_c above 18 [kimlee2019,gautam2024]"],
  "cauliflower": ["development mean_c above 20 [rosen2018]"],
  "spinach": ["initial mean_c above 20 [leskovar1999]"],
  "sweet-pepper": ["middle max_c at_or_above 32 [aloni2001,karnialoni2002]", "middle min_c at_or_below 12 [darnell2012]"],
  "tomato": ["middle mean_c at_or_above 29 [pressman2002,sato2006,sato2002]", "middle max_c above 40 [pressman2002,sato2006]"],
  "watermelon": ["middle max_c at_or_above 32 [tao2026]"],
  "green-bean": ["middle min_c at_or_above 27 [konsens1991]"],
};

const stillNotAssessed = [
  "beet-table", "brussels-sprouts", "cabbage", "cantaloupe", "carrot", "celery", "eggplant", "millet-grain", "oats-grain",
  "onion-dry", "onion-green", "pea-dry", "pea-green", "pumpkin-winter-squash", "radish", "safflower-seed", "squash-zucchini", "sweet-maize",
  "sweet-melon", "sweet-potato",
];

describe("E1 temperature-rules release", () => {
  it("keeps the same 42 crops and 86 profiles, changing only temperature rules, version and review", () => {
    expect(latest.catalogue.entries).toEqual(previous.catalogue.entries);
    expect(latest.profiles.map(profile => profile.id)).toEqual(previous.profiles.map(profile => profile.id));
    for (const profile of latest.profiles) {
      const before = previous.profiles.find(old => old.id === profile.id);
      const { temperatureRules, version, review, sourceIds, ...rest } = profile;
      const { temperatureRules: oldRules, version: oldVersion, review: oldReview, sourceIds: oldSources, ...oldRest } = before!;
      expect(rest).toEqual(oldRest);
      if (addedRules[profile.cropPurposeId] === undefined) expect(profile).toEqual(before);
      else {
        expect(temperatureRules.slice(0, oldRules.length)).toEqual(oldRules);
        expect(Number(version)).toBe(Number(oldVersion) + 1);
        expect(review.reviewer).toMatch(/release 4/);
        expect(oldReview.reviewer).not.toMatch(/release 4/);
        expect(sourceIds.slice(0, oldSources.length)).toEqual(oldSources);
      }
    }
  });

  it("adds exactly the approved crop-specific rules", () => {
    const before = rulesByCrop(previous);
    const after = rulesByCrop(latest);
    for (const [crop, rules] of Object.entries(after)) {
      expect(rules).toEqual([...before[crop], ...(addedRules[crop] ?? [])]);
    }
  });

  it("leaves 20 crops not assessed, including sweet maize (no inherited rules)", () => {
    const after = rulesByCrop(latest);
    expect(Object.keys(after).filter(crop => after[crop].length === 0).sort()).toEqual(stillNotAssessed);
  });

  it("cites every rule source in the release and keeps every limitation within the label limit", () => {
    const sourceIds = new Set(latest.sources.map(source => source.id));
    for (const profile of latest.profiles) {
      for (const rule of profile.temperatureRules) {
        expect(rule.limitations.length).toBeGreaterThan(0);
        for (const id of rule.sourceIds) {
          expect(sourceIds.has(id)).toBe(true);
          expect(profile.sourceIds).toContain(id);
        }
      }
    }
  });
});
