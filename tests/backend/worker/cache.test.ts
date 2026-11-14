import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseIsoDate } from "@/contracts";
import type { ClimateCacheKey } from "@/contracts";
import { climateSnapshotFixture } from "@/fixtures/science";
import { createPgClimateCache, climateCacheKeyHash } from "@/server/cache";
import { snapshot } from "./support";

const key: ClimateCacheKey = {
  provider: "test-provider", product: "test-product", productVersion: "test-v1", nativeCellId: "test-cell",
  fields: ["rainMm", "meanC"], start: parseIsoDate("2000-01-01"), endExclusive: parseIsoDate("2001-01-01"), timeStandard: "UTC",
};

describe("climate cache key", () => {
  it("normalizes field order and duplicates while retaining product, cell, version, and interval", () => {
    expect(climateCacheKeyHash(key)).toBe(climateCacheKeyHash({ ...key, fields: ["meanC", "rainMm", "rainMm"] }));
    expect(climateCacheKeyHash(key)).not.toBe(climateCacheKeyHash({ ...key, productVersion: "other" }));
    expect(climateCacheKeyHash(key)).not.toBe(climateCacheKeyHash({ ...key, nativeCellId: "other" }));
    expect(climateCacheKeyHash(key)).not.toBe(climateCacheKeyHash({ ...key, endExclusive: parseIsoDate("2002-01-01") }));
  });
});

const connectionString = process.env.B3_TEST_DATABASE_URL;
describe.skipIf(!connectionString)("PostgreSQL climate cache", () => {
  const pool = new Pool({ connectionString });
  const cache = createPgClimateCache(pool);
  beforeAll(async () => { await pool.query(await readFile(new URL("../../../migrations/002-climate-cache.sql", import.meta.url), "utf8")); });
  beforeEach(async () => { await pool.query("TRUNCATE gilir_climate_cache, gilir_climate_snapshots"); });
  afterAll(async () => { await pool.end(); });

  it("persists a cache entry across independent adapters", async () => {
    expect(await cache.read(key)).toBeNull();
    await cache.put(key, snapshot);
    const otherPool = new Pool({ connectionString });
    try {
      expect(await createPgClimateCache(otherPool).read({ ...key, fields: [...key.fields].reverse() })).toEqual(snapshot);
    } finally { await otherPool.end(); }
  });

  it("allows identical snapshot retries and rejects identity mutation atomically", async () => {
    await Promise.all([cache.put(key, snapshot), cache.put(key, snapshot)]);
    await expect(cache.put(key, { ...snapshot, latitudeDeg: 16 })).rejects.toThrow("immutable");
    expect(await cache.read(key)).toEqual(snapshot);
    expect((await pool.query("SELECT count(*)::int AS count FROM gilir_climate_snapshots")).rows[0]?.count).toBe(1);
  });

  it("keeps immutable snapshots when a native-cell cache mapping advances", async () => {
    await cache.put(key, snapshot);
    const next = { ...snapshot, id: "test-next-snapshot", contentHash: "test-next-content", retrievedAt: "2026-01-02T00:00:00Z" };
    await cache.put(key, next);
    expect(await cache.read(key)).toEqual(next);
    expect((await pool.query("SELECT count(*)::int AS count FROM gilir_climate_snapshots")).rows[0]?.count).toBe(2);
  });

  it("rejects synthetic and malformed provider data", async () => {
    await expect(cache.put(key, climateSnapshotFixture)).rejects.toThrow();
    await cache.put(key, snapshot);
    await pool.query("UPDATE gilir_climate_snapshots SET snapshot = snapshot || '{\"latitudeDeg\":999}'::jsonb");
    await expect(cache.read(key)).rejects.toThrow();
  });
});
