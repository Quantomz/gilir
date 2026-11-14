CREATE TABLE IF NOT EXISTS gilir_climate_snapshots (
  id text PRIMARY KEY,
  content_hash text NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (snapshot->>'kind' = 'provider'),
  CHECK (snapshot->>'id' = id),
  CHECK (snapshot->>'contentHash' = content_hash)
);

CREATE TABLE IF NOT EXISTS gilir_climate_cache (
  cache_key text PRIMARY KEY,
  snapshot_id text NOT NULL REFERENCES gilir_climate_snapshots(id)
);
