CREATE TABLE IF NOT EXISTS job_intervention_audit (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES jobs(id),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_intervention_audit_job_id_created_at
  ON job_intervention_audit (job_id, created_at DESC);
