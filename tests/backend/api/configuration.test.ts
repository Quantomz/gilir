import { expect, test, vi } from "vitest";
import { planApi } from "@/server/jobs/http";
import { jobStore } from "@/server/jobs";
import { inputFixture } from "@/fixtures/input";
import { frozenRunFixture, syntheticRegistryFixture } from "@/fixtures/science";

test("the production store and route report missing database configuration explicitly", async () => {
  vi.stubEnv("DATABASE_URL", undefined);
  try {
    await expect(jobStore.create({ input: inputFixture, registry: syntheticRegistryFixture.identity, cutoff: frozenRunFixture.manifest.dataCutoff, createdAt: new Date().toISOString() })).rejects.toThrow("DATABASE_URL is not configured.");
    const response = await planApi(new Request("http://localhost/api/plans/00000000-0000-0000-0000-000000000000", { headers: { Authorization: "Bearer wrong-token" } }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "not_configured" } });
  } finally { vi.unstubAllEnvs(); }
});
