import { inputFixture } from "@/fixtures/input";
import { frozenRunFixture } from "@/fixtures/science";
import { resultFixtures } from "@/fixtures/results";
import { parsePlanResult } from "@/contracts/result";
import { hashNormalizedInput } from "@/server/jobs";

export const frozenJobRunFixture = {
  ...frozenRunFixture,
  manifest: { ...frozenRunFixture.manifest, normalizedInputHash: hashNormalizedInput(inputFixture) },
};

export const completedJobResultFixture = parsePlanResult({
  ...resultFixtures.insufficient_data,
  details: {
    ...resultFixtures.insufficient_data.details,
    provenance: {
      ...resultFixtures.insufficient_data.details.provenance,
      manifest: { kind: "available", value: frozenJobRunFixture.manifest },
    },
  },
});
