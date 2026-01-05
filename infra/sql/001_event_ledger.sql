CREATE TABLE IF NOT EXISTS event_ledger (
  id BIGSERIAL PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL,
  external_event_id TEXT NULL,
  raw_payload JSONB NOT NULL
);

-- Indexes for inspection only (not deduplication)
CREATE INDEX IF NOT EXISTS idx_event_ledger_received_at
  ON event_ledger (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_ledger_event_type
  ON event_ledger (event_type);