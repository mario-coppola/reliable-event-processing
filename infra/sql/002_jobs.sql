CREATE TABLE IF NOT EXISTS jobs (
  id BIGSERIAL PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued',
  event_ledger_id BIGINT NOT NULL REFERENCES event_ledger(id),
  event_type TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);