import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { parseIsoDate } from "@/contracts/common";
import type { FarmInput } from "@/contracts/input";
import { farmInputSchema } from "@/contracts/input";
import type { FrozenRun } from "@/contracts/engine";
import type { JobClaim, JobState, JobStore, LeaseIdentity } from "@/contracts/jobs";
import { completedSnapshotVersionFor, parseCompletedSnapshot, serviceFailureSchema, snapshotCompletionSchema } from "@/contracts/result";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (typeof value === "object" && value !== null) {
    return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ":" + canonicalJson(item)).join(",") + "}";
  }
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError("Cannot hash an undefined input.");
  return json;
}

export function hashNormalizedInput(input: FarmInput): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest();
const validJobId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const activeLease = "id = $1 AND lease_owner = $2 AND lease_id = $3 AND lease_expires_at > $4::timestamptz AND state IN ('fetching', 'calculating')";
const leaseArgs = (lease: LeaseIdentity, now: string) => [lease.jobId, lease.workerId, lease.leaseId, now];

interface ClaimRow {
  id: string;
  lease_id: string;
  lease_owner: string;
  lease_expires_at: Date;
  input: JobClaim["input"];
  registry: JobClaim["registry"];
  cutoff: string;
  frozen_run: FrozenRun | null;
}

export function createPgJobStore(pool: Pool): JobStore {
  return {
    async create({ input, registry, cutoff, createdAt }) {
      const capability = { jobId: randomUUID(), token: randomBytes(32).toString("base64url") };
      await pool.query(
        "INSERT INTO jobs (id, token_hash, input, input_hash, registry, cutoff, created_at) VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6::date, $7::timestamptz)",
        [capability.jobId, tokenHash(capability.token), JSON.stringify(input), hashNormalizedInput(input), JSON.stringify(registry), cutoff, createdAt],
      );
      return capability;
    },
    async get(capability) {
      if (!validJobId(capability.jobId)) return null;
      const result = await pool.query<{ state: JobState["state"]; snapshot: unknown; failure: unknown }>(
        "SELECT state, snapshot, failure FROM jobs WHERE id = $1 AND token_hash = $2", [capability.jobId, tokenHash(capability.token)],
      );
      const row = result.rows[0];
      if (!row) return null;
      if (row.state === "completed") return { state: row.state, snapshot: parseCompletedSnapshot(row.snapshot) };
      if (row.state === "failed") return { state: row.state, failure: serviceFailureSchema.parse(row.failure) };
      return { state: row.state };
    },
    async delete(capability) {
      if (!validJobId(capability.jobId)) return false;
      const result = await pool.query("DELETE FROM jobs WHERE id = $1 AND token_hash = $2", [capability.jobId, tokenHash(capability.token)]);
      return result.rowCount === 1;
    },
    async claim({ workerId, now, leaseSeconds }) {
      if (!Number.isFinite(leaseSeconds) || leaseSeconds <= 0) throw new RangeError("Lease duration must be positive.");
      const result = await pool.query<ClaimRow>(`
        WITH candidate AS (
          SELECT id FROM jobs WHERE state = 'queued'
            OR (state IN ('fetching', 'calculating') AND lease_expires_at <= $1::timestamptz)
          ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE jobs SET state = CASE WHEN frozen_run IS NULL THEN 'fetching' ELSE 'calculating' END,
          lease_owner = $2, lease_id = $3, lease_expires_at = $1::timestamptz + $4 * interval '1 second'
        WHERE id = (SELECT id FROM candidate)
        RETURNING id, lease_owner, lease_id, lease_expires_at, input, registry, cutoff::text, frozen_run`,
      [now, workerId, randomUUID(), leaseSeconds]);
      const row = result.rows[0];
      if (!row) return null;
      return {
        lease: { jobId: row.id, workerId: row.lease_owner, leaseId: row.lease_id },
        leaseExpiresAt: row.lease_expires_at.toISOString(),
        input: farmInputSchema.parse(row.input), registry: row.registry,
        cutoff: parseIsoDate(row.cutoff), frozenRun: row.frozen_run,
      };
    },
    async renew(lease, now, leaseSeconds) {
      if (!Number.isFinite(leaseSeconds) || leaseSeconds <= 0) throw new RangeError("Lease duration must be positive.");
      const result = await pool.query(`UPDATE jobs SET lease_expires_at = $4::timestamptz + $5 * interval '1 second' WHERE ${activeLease}`, [...leaseArgs(lease, now), leaseSeconds]);
      return result.rowCount === 1;
    },
    async freeze(lease, run, now) {
      if (run.manifest.normalizedInputHash !== hashNormalizedInput(run.input)
        || run.manifest.configurationVersion !== run.settings.version
        || canonicalJson(run.manifest.climateSnapshotIds) !== canonicalJson(run.climate.map(snapshot => snapshot.id))
        || run.climate.some(snapshot => snapshot.cutoff !== run.manifest.dataCutoff)) return false;
      const result = await pool.query(`
        UPDATE jobs SET frozen_run = $5::jsonb, state = 'calculating'
        WHERE ${activeLease} AND input = $6::jsonb AND input_hash = $7
          AND registry->>'catalogueVersion' = $8 AND registry->>'ruleVersion' = $9 AND cutoff = $10::date
          AND (frozen_run IS NULL OR frozen_run = $5::jsonb)`,
      [...leaseArgs(lease, now), JSON.stringify(run), JSON.stringify(run.input), run.manifest.normalizedInputHash,
        run.manifest.catalogueVersion, run.manifest.ruleVersion, run.manifest.dataCutoff]);
      return result.rowCount === 1;
    },
    async complete(lease, completion, now) {
      const parsed = snapshotCompletionSchema.safeParse(completion);
      if (!parsed.success) return false;
      const written = await pool.query(`
        UPDATE jobs SET state = 'completed', terminal_at = $4::timestamptz,
          snapshot = jsonb_build_object('schemaVersion', $7::int, 'id', id::text, 'completedAt', $6::text, 'input', input, 'result', $5::jsonb->'result', 'catalogue', $5::jsonb->'catalogue'),
          lease_owner = NULL, lease_id = NULL, lease_expires_at = NULL
        WHERE ${activeLease} AND frozen_run IS NOT NULL AND state = 'calculating'
          AND ($5::jsonb #> '{result,details,provenance,manifest}') = jsonb_build_object('kind', 'available', 'value', frozen_run->'manifest')
          AND ($5::jsonb #>> '{catalogue,version}') = (frozen_run #>> '{manifest,catalogueVersion}')
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(input->'cropPurposeIds') selected(id)
            WHERE NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements($5::jsonb #> '{catalogue,entries}') entry
              WHERE entry->>'id' = selected.id
            )
          )`,
      [...leaseArgs(lease, now), JSON.stringify(parsed.data), new Date(now).toISOString(), completedSnapshotVersionFor(parsed.data.result)]);
      return written.rowCount === 1;
    },
    async fail(lease, failure, now) {
      const result = await pool.query(`
        UPDATE jobs SET state = 'failed', failure = $5::jsonb, terminal_at = $4::timestamptz,
          lease_owner = NULL, lease_id = NULL, lease_expires_at = NULL WHERE ${activeLease}`,
      [...leaseArgs(lease, now), JSON.stringify(failure)]);
      return result.rowCount === 1;
    },
    async purgeExpired(now) {
      const result = await pool.query("DELETE FROM jobs WHERE state IN ('completed', 'failed') AND terminal_at < $1::timestamptz - interval '24 hours'", [now]);
      return result.rowCount ?? 0;
    },
  };
}

export class DatabaseNotConfiguredError extends Error {
  constructor() { super("DATABASE_URL is not configured."); this.name = "DatabaseNotConfiguredError"; }
}

let configuredStore: JobStore | undefined;
function getConfiguredStore(): JobStore {
  if (configuredStore) return configuredStore;
  if (!process.env.DATABASE_URL) throw new DatabaseNotConfiguredError();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, allowExitOnIdle: true });
  pool.on("error", () => { process.stderr.write("Planning database connection lost.\n"); });
  configuredStore = createPgJobStore(pool);
  return configuredStore;
}

export const jobStore: JobStore = {
  create: async args => getConfiguredStore().create(args),
  get: async capability => getConfiguredStore().get(capability),
  delete: async capability => getConfiguredStore().delete(capability),
  claim: async args => getConfiguredStore().claim(args),
  renew: async (...args) => getConfiguredStore().renew(...args),
  freeze: async (...args) => getConfiguredStore().freeze(...args),
  complete: async (...args) => getConfiguredStore().complete(...args),
  fail: async (...args) => getConfiguredStore().fail(...args),
  purgeExpired: async now => getConfiguredStore().purgeExpired(now),
};
