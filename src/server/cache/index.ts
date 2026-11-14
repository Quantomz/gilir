import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import type { ClimateCache, ClimateCacheKey } from "@/contracts/climate";
import { climateCacheKeySchema, providerSnapshotSchema } from "./schema";

const rowSchema = z.strictObject({ snapshot: z.unknown() });

export function climateCacheKeyHash(key: ClimateCacheKey): string {
  const parsed = climateCacheKeySchema.parse(key);
  const canonical = { ...parsed, fields: [...new Set(parsed.fields)].sort() };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function createPgClimateCache(pool: Pool): ClimateCache {
  return {
    async read(key) {
      const result = await pool.query(
        `SELECT snapshots.snapshot FROM gilir_climate_cache AS cache
         JOIN gilir_climate_snapshots AS snapshots ON snapshots.id = cache.snapshot_id
         WHERE cache.cache_key = $1`,
        [climateCacheKeyHash(key)],
      );
      if (result.rows.length === 0) return null;
      return providerSnapshotSchema.parse(rowSchema.parse(result.rows[0]).snapshot);
    },
    async put(key, snapshot) {
      const cacheKey = climateCacheKeyHash(key);
      const parsed = providerSnapshotSchema.parse(snapshot);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const immutable = await client.query(
          `INSERT INTO gilir_climate_snapshots (id, content_hash, snapshot) VALUES ($1, $2, $3::jsonb)
           ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
           WHERE gilir_climate_snapshots.content_hash = EXCLUDED.content_hash
             AND gilir_climate_snapshots.snapshot = EXCLUDED.snapshot
           RETURNING id`,
          [parsed.id, parsed.contentHash, JSON.stringify(parsed)],
        );
        if (immutable.rowCount !== 1) throw new Error("Climate snapshot identity already has different immutable data.");
        await client.query(
          `INSERT INTO gilir_climate_cache (cache_key, snapshot_id) VALUES ($1, $2)
           ON CONFLICT (cache_key) DO UPDATE SET snapshot_id = EXCLUDED.snapshot_id`,
          [cacheKey, parsed.id],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
