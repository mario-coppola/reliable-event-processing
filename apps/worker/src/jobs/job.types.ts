export type JobStatus = 'queued' | 'in_progress' | 'done' | 'failed';

export type FailureType = 'retryable' | 'permanent';

export type Job = {
  id: number;
  status: JobStatus;
  event_ledger_id: number;
  event_type: string;
  external_event_id: string;
  created_at: Date;
  attempts: number;
  max_attempts: number;
  available_at: Date;
};

export type JobRetryState = {
  attempts: number;
  max_attempts: number;
};
