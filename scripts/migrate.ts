import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";

export async function migrate(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(1573428801)");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    const directory = new URL("../migrations/", import.meta.url);
    for (const name of (await readdir(directory)).filter(name => /^\d+[-\w]*\.sql$/.test(name)).sort()) {
      const sql = await readFile(new URL(name, directory), "utf8");
      const hash = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query<{ sha256: string }>("SELECT sha256 FROM schema_migrations WHERE name = $1", [name]);
      if (existing.rows[0]) {
        if (existing.rows[0].sha256 !== hash) throw new Error("Applied migration changed: " + name);
        continue;
      }
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name, sha256) VALUES ($1, $2)", [name, hash]);
      process.stdout.write("Applied " + name + "\n");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to migrate.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try { await migrate(pool); } finally { await pool.end(); }
}
