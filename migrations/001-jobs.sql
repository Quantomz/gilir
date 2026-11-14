CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY,
  token_hash bytea NOT NULL CHECK (octet_length(token_hash) = 32),
  input jsonb NOT NULL,
  input_hash text NOT NULL,
  registry jsonb NOT NULL,
  cutoff date NOT NULL,
  created_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'fetching', 'calculating', 'completed', 'failed')),
  lease_owner text,
  lease_id uuid,
  lease_expires_at timestamptz,
  frozen_run jsonb,
  snapshot jsonb,
  failure jsonb,
  terminal_at timestamptz,
  CHECK (
    (state IN ('fetching', 'calculating') AND lease_owner IS NOT NULL AND lease_id IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (state NOT IN ('fetching', 'calculating') AND lease_owner IS NULL AND lease_id IS NULL AND lease_expires_at IS NULL)
  ),
  CHECK (state <> 'calculating' OR frozen_run IS NOT NULL),
  CHECK ((state = 'completed') = (snapshot IS NOT NULL)),
  CHECK ((state = 'failed') = (failure IS NOT NULL)),
  CHECK ((state IN ('completed', 'failed')) = (terminal_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS jobs_claimable ON jobs (created_at, id) WHERE state IN ('queued', 'fetching', 'calculating');
CREATE INDEX IF NOT EXISTS jobs_terminal_expiry ON jobs (terminal_at) WHERE state IN ('completed', 'failed');

CREATE OR REPLACE FUNCTION preserve_job_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW.input, NEW.input_hash, NEW.registry, NEW.cutoff, NEW.token_hash, NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id, OLD.input, OLD.input_hash, OLD.registry, OLD.cutoff, OLD.token_hash, OLD.created_at) THEN
    RAISE EXCEPTION 'Job identity is immutable';
  END IF;
  IF OLD.frozen_run IS NOT NULL AND NEW.frozen_run IS DISTINCT FROM OLD.frozen_run THEN
    RAISE EXCEPTION 'Frozen run is immutable';
  END IF;
  IF OLD.state IN ('completed', 'failed') THEN
    RAISE EXCEPTION 'Terminal jobs are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_immutable_identity ON jobs;
CREATE TRIGGER jobs_immutable_identity BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION preserve_job_identity();
