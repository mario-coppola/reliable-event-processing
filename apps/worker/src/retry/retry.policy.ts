import type { FailureType } from '../jobs/job.types';

export const RETRY_DELAY_MS = 5000;

/**
 * Determines if a job should be retried based on attempts, max attempts, and failure type.
 */
export function shouldRetry(
  attempts: number,
  maxAttempts: number,
  failureType: FailureType,
): boolean {
  return failureType === 'retryable' && attempts < maxAttempts;
}
