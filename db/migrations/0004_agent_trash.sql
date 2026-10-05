ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS agents_deleted_at_idx
  ON agents (deleted_at)
  WHERE deleted_at IS NOT NULL;
