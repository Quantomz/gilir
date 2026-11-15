import { expect, test } from "vitest";
import { createPlannerClient } from "@/client/planner";
import { completedSnapshotFixture, completedSnapshotV2Fixture } from "@/fixtures/results";
import { inputFixture } from "@/fixtures/input";

test("a transport failure never substitutes a synthetic result", async () => {
  const client = createPlannerClient({ fetch: async () => { throw new TypeError("Network unavailable"); } });
  expect(await client.submit(inputFixture)).toMatchObject({ kind: "unavailable", failure: { code: "temporarily_unavailable" } });
  await expect(client.catalogue()).rejects.toMatchObject({ failure: { code: "temporarily_unavailable" } });
  await expect(client.read({ jobId: "job", token: "token" })).rejects.toMatchObject({ failure: { code: "temporarily_unavailable" } });
  await expect(client.remove({ jobId: "job", token: "token" })).rejects.toMatchObject({ failure: { code: "temporarily_unavailable" } });
});

test("a malformed HTTP success cannot become an accepted submission", async () => {
  const client = createPlannerClient({ fetch: async () => Response.json({ kind: "accepted", capability: { jobId: "bad", token: "bad" } }, { status: 202 }) });
  expect(await client.submit(inputFixture)).toMatchObject({ kind: "unavailable" });
});

for (const snapshot of [completedSnapshotFixture, completedSnapshotV2Fixture]) {
  test(`the HTTP client reads snapshot version ${snapshot.schemaVersion} unchanged`, async () => {
    const client = createPlannerClient({ fetch: async () => Response.json({ state: "completed", snapshot }) });
    expect(await client.read({ jobId: "00000000-0000-4000-8000-000000000001", token: "test-token" })).toEqual({ state: "completed", snapshot });
  });
}
