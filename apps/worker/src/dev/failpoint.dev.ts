/**
 * Development-only failpoint mechanism.
 * Triggers a simulated transient failure once per worker process.
 * Controlled by WORKER_FAILPOINT=after_claim_once environment variable.
 */

let failpointUsed = false;
const failpointEnabled = process.env.WORKER_FAILPOINT === 'after_claim_once';

/**
 * Checks if the failpoint should trigger now.
 * Returns true only once per process if enabled.
 */
export function shouldFailNow(): boolean {
  if (failpointEnabled && !failpointUsed) {
    failpointUsed = true;
    return true;
  }
  return false;
}

/**
 * Checks if failpoint is enabled (for logging purposes).
 */
export function isFailpointEnabled(): boolean {
  return failpointEnabled;
}
