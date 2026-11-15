import type { JobState, PlannerClient } from "@/contracts/jobs";
import { jobFixtures } from "./results";
import { syntheticRegistryFixture } from "./science";

export function makeFixtureClient(state: JobState = jobFixtures.completed): PlannerClient {
  const capability = { jobId: "00000000-0000-4000-8000-000000000001", token: "synthetic-local-fixture-token" };
  const matches = (provided: typeof capability) => provided.jobId === capability.jobId && provided.token === capability.token;
  let exists = false;
  return {
    async catalogue() { return syntheticRegistryFixture.catalogue; },
    async submit() {
      exists = true;
      return { kind: "accepted", capability };
    },
    async read(provided) {
      if (!exists || !matches(provided)) {
        return { state: "failed", failure: { code: "not_found", message: "No matching synthetic job.", retryable: false } };
      }
      return state;
    },
    async remove(provided) {
      if (matches(provided)) exists = false;
    },
  };
}

export const fixtureClient = makeFixtureClient();
