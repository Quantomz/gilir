import { completedSnapshotSchema, completedSnapshotV2Schema } from "@/contracts/result";
import type { CompletedSnapshot } from "@/contracts/result";
import { completedSnapshotsByState } from "@/fixtures/results";
import { syntheticLabel } from "@/fixtures/science";

export type VariantName =
  | "manyCrops"            // 12 crops with repeats, the longest catalogue-like names, bars narrower than their numbers
  | "leapYear"             // a 366-day horizon from the 15th of a month, across 29 February
  | "freeAtYearEnd"        // the last crop frees the field on the year's last day: a 7-day bar at the right edge
  | "manyWarnings"         // 30 warnings across every code, several per crop, long messages with ISO dates inside
  | "manySources"          // 20 sources with 236-character sections, 74-character URLs, 64-hex snapshot IDs
  | "longLabel"            // a 240-character field label with Łódź and an emoji
  | "cyrillicLabel"        // a field label in Cyrillic: the Your field fallback
  | "thaiUnlistedCrop"     // an unsupported history crop named in Thai: A crop not on our list
  | "structuralProof"      // no_calendar_fit by structural_exhaustion with its constraints
  | "changedBaseline"      // assessed and changed, all four change kinds, deltas available and unavailable
  | "excludedSeasons"      // a cohort with excluded seasons and their reasons
  | "monthlyInsights"      // insufficient_data with twelve months of the four monthly insight series
  | "manifestUnavailable"  // provenance.manifest unavailable with its reason
  | "manyUnassessed"       // one crop_profile gap per crop for 12 crops, as the Pretoria probe run had
  | "frozenLabels";        // version 2: three crops named by saved labels unlike their IDs, in warnings, heat, gaps,
                           // changes and profiles; the removed old crop is not in that saved catalogue

export const variantNames: readonly VariantName[] = [
  "manyCrops", "leapYear", "freeAtYearEnd", "manyWarnings", "manySources", "longLabel", "cyrillicLabel", "thaiUnlistedCrop",
  "structuralProof", "changedBaseline", "excludedSeasons", "monthlyInsights", "manifestUnavailable", "manyUnassessed",
  "frozenLabels",
];

export const britishReader = { locale: "en-GB", timeZone: "UTC" } as const;

export function variant(name: VariantName): CompletedSnapshot {
  return completedSnapshotSchema.parse(builders[name]());
}

export function frozen(snapshot: CompletedSnapshot, labels: Readonly<Record<string, string>>): CompletedSnapshot {
  const manifest = snapshot.result.details.provenance.manifest;
  if (manifest.kind !== "available") return never("an available run manifest");
  const entries = Object.entries(labels).map(([id, label]) => ({ id, label, purpose: "food" }));
  return completedSnapshotV2Schema.parse({ ...snapshot, schemaVersion: 2, catalogue: { version: manifest.value.catalogueVersion, entries } });
}

export function unfrozen(snapshot: CompletedSnapshot): CompletedSnapshot {
  if (snapshot.schemaVersion !== 2) return never("a version 2 snapshot");
  const { catalogue: _catalogue, ...rest } = snapshot;
  return completedSnapshotSchema.parse({ ...rest, schemaVersion: 1 });
}

export const savedLabels: Readonly<Record<string, string>> = {
  "synthetic-crop": "Synthetic bean (dry grain)",
  "synthetic-second-crop": "Synthetic maize (grain)",
  "synthetic-third-crop": "Synthetic oats (grain)",
};

const base = completedSnapshotsByState;
const planFixture = base.plan.result.state === "plan" ? base.plan.result : never("plan fixture");
const warningsFixture = base.plan_with_warnings.result.state === "plan_with_warnings" ? base.plan_with_warnings.result : never("warnings fixture");
const seasonMetrics = planFixture.plan.occurrences[0].seasonMetrics;

function never(what: string): never {
  throw new Error(`unexpected ${what}`);
}

function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

interface Planting {
  readonly crop: string;
  readonly planted: string;
  readonly days: number;
  readonly turnaround: number;
}

function occurrence({ crop, planted, days, turnaround }: Planting) {
  const lastOccupied = addDays(planted, days - 1);
  return {
    cropPurposeId: crop, profileId: `synthetic-${crop}-profile`, profileVersion: "synthetic-v1",
    planted, lastOccupied, fieldAvailable: addDays(lastOccupied, 1 + turnaround), seasonMetrics,
  };
}

/** Plantings in order, each starting `gap` days after the previous field is free. */
function plantings(start: string, list: readonly (readonly [crop: string, days: number, gap: number])[], turnaround = 2): Planting[] {
  let next = start;
  return list.map(([crop, days, gap]) => {
    const planted = addDays(next, gap);
    next = addDays(planted, days + turnaround);
    return { crop, planted, days, turnaround };
  });
}

/** A plan with a tuple that matches its own calendar: unplanted days count the days after each harvest. */
function planOf(horizon: { readonly start: string; readonly endExclusive: string }, list: readonly Planting[], frequency: number, mismatch: number) {
  const occurrences = list.map(occurrence);
  let cursor = horizon.start;
  let unplanted = 0;
  let longest = 0;
  for (const item of [...occurrences, null]) {
    const until = item ? item.planted : horizon.endExclusive;
    const gap = Math.max(daysBetween(cursor, until), 0);
    unplanted += gap;
    longest = Math.max(longest, gap);
    if (item) cursor = addDays(item.lastOccupied, 1);
  }
  return {
    horizon,
    occurrences,
    rankingTuple: {
      components: [
        { metricId: "mean_frequency", value: frequency, unit: "fraction" },
        { metricId: "mean_mismatch", value: mismatch, unit: "fraction" },
        { metricId: "unplanted_days", value: unplanted, unit: "days" },
        { metricId: "longest_unplanted_gap", value: longest, unit: "days" },
      ],
    },
  };
}

function metric(id: string, value: number | null, unit: string, reason = "Synthetic example: no value.") {
  return {
    id, label: `Synthetic ${id.replaceAll("_", " ")}`,
    value: value === null ? { kind: "unavailable", reason } : { kind: "available", value },
    unit, basis: "estimated", methodVersion: "synthetic-v1", sourceIds: [],
    denominator: { kind: "available", value: { count: 20, unit: "seasons" } }, assumptions: [syntheticLabel],
  };
}

const profiles = (crops: readonly string[]) =>
  crops.map(crop => ({ id: `synthetic-${crop}-profile`, version: "synthetic-v1", cropPurposeId: crop, sourceIds: [] }));

const twelveCrops = [
  "pumpkin-and-winter-squash", "sweet-maize-sweet-corn", "common-bean-dry-grain", "rice-paddy-wet-season",
  "groundnut-peanut", "mung-bean", "sorghum-grain", "pearl-millet", "cassava-root", "sweet-potato",
  "soybean-dry-grain", "cowpea-dry-grain",
];
const threeCrops = ["synthetic-crop", "synthetic-second-crop", "synthetic-third-crop"];
const year2026 = { start: "2026-07-01", endExclusive: "2027-07-01" };
const threeCropPlan = (frequency: number, mismatch: number) =>
  planOf(year2026, plantings("2026-07-01", [[threeCrops[0], 90, 0], [threeCrops[1], 70, 10], [threeCrops[2], 60, 5]], 7), frequency, mismatch);

function planSnapshot(id: string, changes: { input?: object; plan?: object; details?: object; state?: "plan" | "plan_with_warnings" }) {
  const { state = "plan" } = changes;
  const source = state === "plan" ? base.plan : base.plan_with_warnings;
  const result = state === "plan" ? planFixture : warningsFixture;
  return {
    ...source, id: `synthetic-variant-${id}`,
    input: { ...source.input, ...changes.input },
    result: {
      ...result,
      plan: changes.plan ?? result.plan,
      details: { ...result.details, baseline: { kind: "not_recorded" }, ...changes.details },
    },
  };
}

function hex(seed: number): string {
  let out = "";
  for (let i = 0; i < 64; i++) out += ((seed * 7 + i * 13) % 16).toString(16);
  return out;
}

const filler = (text: string, length: number) => (text.repeat(Math.ceil(length / text.length))).slice(0, length - 1) + ".";

const builders: Record<VariantName, () => unknown> = {
  manyCrops: () => {
    const durations = [3, 20, 25, 4, 30, 18, 22, 5, 26, 15, 28, 3, 21, 19];
    const crops = [...twelveCrops, twelveCrops[0], twelveCrops[1]];
    const list = plantings("2026-07-01", crops.map((crop, index) => [crop, durations[index], index % 4 === 3 ? 5 : 0] as const));
    return planSnapshot("many-crops", {
      input: { cropPurposeIds: twelveCrops, history: { kind: "skipped" } },
      plan: planOf(year2026, list, 0.2, 0.05),
      details: { provenance: { ...planFixture.details.provenance, profiles: profiles(twelveCrops) } },
    });
  },

  leapYear: () => {
    const horizon = { start: "2027-09-15", endExclusive: "2028-09-15" };
    const list = plantings("2027-09-15", [[threeCrops[0], 118, 0], [threeCrops[1], 132, 30]], 10);
    return {
      ...planSnapshot("leap-year", {
        input: { cropPurposeIds: threeCrops.slice(0, 2), planningStart: horizon.start, history: { kind: "skipped" } },
        plan: planOf(horizon, list, 0.1, 0.02),
      }),
      completedAt: "2027-09-01T08:00:00Z",
    };
  },

  freeAtYearEnd: () => {
    const crops = threeCrops.slice(0, 2);
    const last = { crop: crops[1], days: 120, turnaround: 7 };
    const list = [
      { crop: crops[0], planted: "2026-07-01", days: 150, turnaround: 7 },
      { ...last, planted: addDays(year2026.endExclusive, -(last.days + last.turnaround)) },
    ];
    return planSnapshot("free-at-year-end", {
      input: { cropPurposeIds: crops, history: { kind: "skipped" } },
      plan: planOf(year2026, list, 0.3, 0.1),
    });
  },

  manyWarnings: () => {
    const codes = ["rainfall_mismatch", "temperature_exposure", "environmental_rule", "rotation_rule",
      "profile_limitation", "search_limit", "water_context", "approximate_history"] as const;
    const warnings = Array.from({ length: 30 }, (_, index) => ({
      code: codes[index % codes.length],
      message: `Synthetic warning ${index + 1}: in the invented season from 2026-07-15 to 2026-09-30 an invented value crossed an invented limit, so this long message wraps across several lines of the page.`,
      cropPurposeIds: threeCrops.slice(0, 1 + (index % 3)),
      ruleIds: [], metricIds: [],
    }));
    return planSnapshot("many-warnings", {
      state: "plan_with_warnings",
      input: { cropPurposeIds: threeCrops },
      plan: threeCropPlan(0.7, 0.4),
      details: { warnings, metrics: [metric("q90_temperature_exposure", 0.82, "fraction"), metric("q90_mismatch", 0.55, "fraction")] },
    });
  },

  manySources: () => {
    const sources = Array.from({ length: 20 }, (_, index) => {
      const url = `https://example.org/synthetic/layout/source-${String(index + 1).padStart(2, "0")}/`;
      return {
        id: `synthetic-source-${index + 1}`,
        title: `Synthetic source ${index + 1}, an invented reference title for layout tests`,
        url: url + "x".repeat(74 - url.length),
        section: filler(`Invented section ${index + 1} with a long description that only tests wrapping and page breaks `, 236),
        publishedOn: index % 2 ? { kind: "available", value: "2024-03-01" } : { kind: "unavailable", reason: "Synthetic example: no publication date." },
        extractedOn: "2026-01-01",
      };
    });
    const snapshotIds = [1, 2, 3].map(seed => `power-${hex(seed)}`);
    const climateProducts = snapshotIds.map((_, index) => ({
      provider: "Synthetic provider", product: `Synthetic daily product ${index + 1}`,
      version: { kind: "available", value: "synthetic-v1" }, stream: { kind: "unavailable", reason: "Synthetic example." },
      cellId: `synthetic-cell-${hex(index + 7)}`, gridDegrees: [0.5, 0.625], timeStandard: "UTC",
      sourceUrl: "https://example.org/synthetic/climate", unitsByField: [], missingDayCounts: [],
    }));
    const provenance = planFixture.details.provenance;
    return planSnapshot("many-sources", {
      details: {
        provenance: {
          ...provenance, sources, climateProducts,
          manifest: provenance.manifest.kind === "available"
            ? { kind: "available", value: { ...provenance.manifest.value, climateSnapshotIds: snapshotIds } } : provenance.manifest,
        },
      },
    });
  },

  longLabel: () => {
    const label = filler("Synthetic field near Łódź 🌾 by the long invented river road, past the old mill ", 240);
    return planSnapshot("long-label", { input: { field: { ...base.plan.input.field, label } } });
  },

  cyrillicLabel: () => planSnapshot("cyrillic-label", { input: { field: { ...base.plan.input.field, label: "Поле у деревни Берёзовка" } } }),

  thaiUnlistedCrop: () => {
    const history = base.plan_with_warnings.input.history;
    if (history.kind !== "recorded") return never("recorded history");
    const entries = history.entries.map(entry =>
      entry.kind === "crop" && entry.crop.kind === "unsupported" ? { ...entry, crop: { kind: "unsupported", label: "ข้าวเหนียวพันธุ์ท้องถิ่น" } } : entry);
    return planSnapshot("thai-unlisted-crop", {
      state: "plan_with_warnings",
      input: { history: { ...history, entries } },
      details: { baseline: warningsFixture.details.baseline },
    });
  },

  structuralProof: () => {
    const source = base.no_calendar_fit;
    return {
      ...source, id: "synthetic-variant-structural-proof",
      result: {
        ...source.result,
        proof: {
          kind: "structural_exhaustion", horizon: year2026, expandedStates: 48213,
          constraints: [
            "Synthetic crop must be planted between 2026-11-01 and 2026-11-30 in this invented example.",
            "Synthetic second crop cannot follow synthetic crop in this invented example.",
            "Each invented crop needs at least 200 days in the field.",
          ],
        },
      },
    };
  },

  changedBaseline: () => {
    const plan = threeCropPlan(0.5, 0.2);
    const [first, second, third] = plan.occurrences;
    const before = (item: typeof first, shift: number, harvestShift = shift) => ({
      ...item, planted: addDays(item.planted, -shift), lastOccupied: addDays(item.lastOccupied, -harvestShift), fieldAvailable: addDays(item.fieldAvailable, -harvestShift),
    });
    const old = { ...occurrence({ crop: "synthetic-old-crop", planted: "2027-03-01", days: 40, turnaround: 7 }) };
    const strip = ({ seasonMetrics: _, ...item }: typeof first) => item;
    return planSnapshot("changed-baseline", {
      input: { cropPurposeIds: threeCrops },
      plan,
      details: {
        explanation: "Synthetic result: the new plan ranks ahead of the existing rotation in this example.",
        metrics: [metric("mean_frequency", 0.5, "fraction"), metric("unplanted_days", 145, "days"), metric("crop_family_count", 3, "count"),
          metric("q90_mismatch", 0.3, "fraction"), metric("legume_crop_count", 1, "count")],
        baseline: {
          kind: "assessed", recommendation: "changed", eligible: true, approximateDates: false,
          occurrences: [before(second, 0, 5), before(first, 7), old],
          metrics: [metric("mean_frequency", 0.6, "fraction"), metric("unplanted_days", 157, "days"), metric("crop_family_count", 2, "count"),
            metric("q90_mismatch", null, "fraction", "No season has a mismatch value."), metric("legume_crop_count", 1, "count")],
          deltas: [
            { metricId: "mean_frequency", difference: { kind: "available", value: -0.1 }, unit: "fraction", direction: "lower_preferred" },
            { metricId: "unplanted_days", difference: { kind: "available", value: -12 }, unit: "days", direction: "lower_preferred" },
            { metricId: "crop_family_count", difference: { kind: "available", value: 1 }, unit: "count", direction: "descriptive" },
            { metricId: "q90_mismatch", difference: { kind: "unavailable", reason: "One or both comparison values are unavailable." }, unit: "fraction", direction: "descriptive" },
            { metricId: "legume_crop_count", difference: { kind: "available", value: 0 }, unit: "count", direction: "descriptive" },
          ],
          changes: [
            { kind: "added", occurrence: strip(third) },
            { kind: "removed", occurrence: strip(old) },
            { kind: "date_shift", before: strip(before(first, 7)), after: strip(first) },
            { kind: "date_shift", before: strip(before(second, 0, 5)), after: strip(second) },
            { kind: "order_change", cropPurposeId: second.cropPurposeId, beforeIndex: 0, afterIndex: 1 },
          ],
        },
      },
    });
  },

  excludedSeasons: () => {
    const season = (year: number) => ({ start: `${year}-07-01`, endExclusive: `${year + 1}-07-01` });
    return planSnapshot("excluded-seasons", {
      details: {
        cohort: {
          kind: "available",
          value: {
            targetSeasons: 5, minimumUsableSeasons: 3, methodVersion: "synthetic-cohort-v1",
            seasons: [
              { status: "usable", interval: season(2001) },
              { status: "excluded", interval: season(2002), reason: "Synthetic gap: 12 days of rain records are missing in this invented season." },
              { status: "usable", interval: season(2003) },
              { status: "usable", interval: season(2004) },
              { status: "excluded", interval: season(2005), reason: "Synthetic gap: the invented temperature records stop early." },
            ],
          },
        },
      },
    });
  },

  monthlyInsights: () => {
    const source = base.insufficient_data;
    const period = { kind: "available", value: { start: "2001-01-01", endExclusive: "2021-01-01" } };
    const insights = Array.from({ length: 12 }, (_, index) => index + 1).flatMap(month => [
      { metric: metric("monthly_rain_median", 20 + 15 * month, "mm"), period, month },
      { metric: metric("monthly_rain_p10", 5 + 6 * month, "mm"), period, month },
      { metric: metric("monthly_rain_p90", 60 + 25 * month, "mm"), period, month },
      { metric: month === 3 ? metric("monthly_mean_temperature", null, "degC", "No complete monthly temperature sample.")
        : metric("monthly_mean_temperature", 18 + month * 0.6, "degC"), period, month },
    ]);
    return {
      ...source, id: "synthetic-variant-monthly-insights",
      result: { ...source.result, details: { ...source.result.details, insights: [...insights, { metric: metric("longest_dry_spell", 41, "days"), period, month: null }] } },
    };
  },

  manifestUnavailable: () => planSnapshot("manifest-unavailable", {
    details: {
      provenance: { ...planFixture.details.provenance, manifest: { kind: "unavailable", reason: "Synthetic example: the run manifest was not recorded." } },
    },
  }),

  frozenLabels: () => {
    const changed = variant("changedBaseline");
    if (changed.result.state !== "plan") return never("changedBaseline plan");
    const { details } = changed.result;
    const warning = (code: string, crop: string, message: string) => ({ code, message, cropPurposeIds: [crop], ruleIds: [], metricIds: [] });
    return frozen(completedSnapshotSchema.parse({
      ...changed, id: "synthetic-variant-frozen-labels",
      result: {
        ...changed.result, state: "plan_with_warnings",
        details: {
          ...details,
          warnings: [
            warning("rainfall_mismatch", threeCrops[0], "Synthetic rainfall warning for the first crop."),
            warning("temperature_exposure", threeCrops[1], "Synthetic heat warning for the second crop."),
          ],
          unassessedChecks: [{ code: "temperature_rule", reason: "No synthetic temperature rule applies to this invented crop.", cropPurposeIds: [threeCrops[2]], sourceIds: [] }],
          metrics: [...details.metrics, metric("q90_temperature_exposure", 0.2, "fraction")],
          provenance: { ...details.provenance, profiles: profiles(threeCrops) },
        },
      },
    }), savedLabels);
  },

  manyUnassessed: () => {
    const source = base.insufficient_data;
    const missing = twelveCrops.map(crop => ({
      code: "crop_profile", reason: `No synthetic ${crop} profile applies at this invented location.`, cropPurposeIds: [crop], sourceIds: [],
    }));
    const extra = { code: "temperature_rule", reason: "No synthetic temperature rule applies to these invented crops.", cropPurposeIds: twelveCrops.slice(0, 2), sourceIds: [] };
    return {
      ...source, id: "synthetic-variant-many-unassessed",
      input: { ...source.input, cropPurposeIds: twelveCrops },
      result: { ...source.result, missing, details: { ...source.result.details, unassessedChecks: [...missing, extra] } },
    };
  },
};
