import { expect, test } from "vitest";
import { createPlannerClient } from "@/client/planner";
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
