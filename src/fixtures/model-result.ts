import { defaultModelingPolicy } from "@/contracts/model";
import { completedSnapshotV3Schema } from "@/contracts/result";
import { completedSnapshotV2Fixture, resultFixtures } from "./results";

const base = completedSnapshotV2Fixture;
const manifest = base.result.details.provenance.manifest;
if (manifest.kind !== "available") throw new Error("The synthetic modeled fixture requires a saved manifest.");

const details = {
  ...resultFixtures.plan.details,
  explanation: "Synthetic result. A calendar fits the historical-weather development model.",
  baseline: { kind: "not_recorded" },
  cohort: {
    kind: "available",
    value: {
      targetSeasons: 2, minimumUsableSeasons: 2, methodVersion: "synthetic-v1",
      seasons: [
        { status: "usable", interval: { start: "2000-07-01", endExclusive: "2001-07-01" } },
        { status: "usable", interval: { start: "2001-07-01", endExclusive: "2002-07-01" } },
      ],
    },
  },
  modeling: {
    modelReleaseVersion: "synthetic-models-v1",
    modelReleaseHash: "a".repeat(64),
    policy: defaultModelingPolicy,
    retainedReplayStarts: ["2000-07-01", "2001-07-01"],
    crops: [{
      cropPurposeId: base.input.cropPurposeIds[0],
      modelId: "synthetic-model",
      modelVersion: "synthetic-v1",
      scientificName: "Synthetic species",
      harvestPurpose: "Synthetic grain harvest",
      cultivarAssumption: "Synthetic reference cultivar for display testing",
      evidenceBasis: "derived_estimate",
      sourceIds: ["synthetic-reference"],
      assumptions: ["Synthetic reference-climate derivation. These are invented parameters."],
      limitations: ["Synthetic fixture only. No agronomic evidence or local validation."],
      turnaroundDays: 1,
      validPlantingDays: 362,
      noncompletionByReplay: [],
    }],
    preparedTrajectories: 730,
    scoredCropDays: 7,
    aggregationVisits: 1,
    workLimitReached: false,
  },
  provenance: {
    ...resultFixtures.plan.details.provenance,
    manifest: {
      kind: "available",
      value: {
        ...manifest.value,
        schemaVersion: 2,
        engineVersion: "thermal-model-v1",
        modelReleaseVersion: "synthetic-models-v1",
        modelReleaseHash: "a".repeat(64),
        configurationHash: "b".repeat(64),
        climateContentHashes: ["c".repeat(64)],
        climateArtifactHashes: ["d".repeat(64)],
        modelingPolicy: defaultModelingPolicy,
      },
    },
  },
};

export const modeledSnapshotFixture = completedSnapshotV3Schema.parse({
  ...base,
  schemaVersion: 3,
  id: "synthetic-modeled-plan",
  catalogue: { ...base.catalogue, entries: base.catalogue.entries.map(entry => ({ ...entry, label: "Synthetic modeled grain" })) },
  result: {
    state: "plan",
    details,
    plan: {
      ...resultFixtures.plan.plan,
      occurrences: resultFixtures.plan.plan.occurrences.map(occurrence => ({
        ...occurrence,
        profileId: "synthetic-model",
        profileVersion: "synthetic-v1",
        modeledTiming: {
          kind: "historical-replay-potential-development",
          modelId: "synthetic-model",
          modelVersion: "synthetic-v1",
          earliestHarvest: "2026-07-03",
          latestHarvest: "2026-07-04",
          reservationPolicy: "latest-completion-all-retained-seasons-v1",
          replays: [
            { replayStart: "2000-07-01", harvestOffset: 2, stageCompletionOffsets: [1, 2, 2, 3] },
            { replayStart: "2001-07-01", harvestOffset: 3, stageCompletionOffsets: [1, 2, 3, 4] },
          ],
        },
      })),
    },
  },
});

export const modeledNoCalendarFitFixture = completedSnapshotV3Schema.parse({
  ...modeledSnapshotFixture,
  id: "synthetic-modeled-noncompletion",
  result: {
    state: "no_calendar_fit",
    proof: {
      kind: "structural_exhaustion",
      horizon: resultFixtures.plan.plan.horizon,
      expandedStates: 0,
      constraints: ["Synthetic crop did not complete in every retained replay within the one-year horizon."],
    },
    details: {
      ...modeledSnapshotFixture.result.details,
      explanation: "Synthetic crop did not reach the modeled development threshold in every retained weather season. No calendar fits this model within one year.",
      modeling: {
        ...modeledSnapshotFixture.result.details.modeling,
        crops: details.modeling.crops.map(crop => ({
          ...crop, validPlantingDays: 0, noncompletionByReplay: [{ replayStart: "2001-07-01", plantingDays: 365 }],
        })),
      },
      search: { ...details.search, structural: "proved_impossible", ranking: "not_started" },
    },
  },
});
