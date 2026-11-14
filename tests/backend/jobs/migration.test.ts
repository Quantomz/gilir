import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { migrate } from "../../../scripts/migrate";

describe.skipIf(!process.env.TEST_DATABASE_URL)("PostgreSQL migrations", () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  const schema = "migration_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString });
  let pool: Pool;
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  });
  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  test("concurrent migration commands converge and subsequent commands do nothing", async () => {
    await Promise.all([migrate(pool), migrate(pool)]);
    await migrate(pool);
    const migrations = await pool.query("SELECT name FROM schema_migrations");
    expect(migrations.rows).toContainEqual({ name: "001-jobs.sql" });
    const tables = await pool.query("SELECT count(*)::int AS count FROM jobs");
    expect(tables.rows).toEqual([{ count: 0 }]);
  });
  test("rejects a changed applied migration checksum", async () => {
    await pool.query("UPDATE schema_migrations SET sha256 = 'changed'");
    await expect(migrate(pool)).rejects.toThrow("Applied migration changed: 001-jobs.sql");
  });
});
