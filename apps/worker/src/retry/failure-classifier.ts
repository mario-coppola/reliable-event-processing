/**
 * Classifies a failure as either 'retryable' or 'permanent'.
 * This is a technical classification only - business logic is handled elsewhere.
 */
export function classifyFailure(error: unknown): 'retryable' | 'permanent' {
  // Conservative classification: most errors are retryable
  // Only mark as permanent if it's clearly a business/validation error
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Permanent: malformed data, validation errors
    if (
      message.includes('malformed') ||
      message.includes('missing') ||
      message.includes('invalid') ||
      message.includes('not found') ||
      message.includes('event_ledger entry not found')
    ) {
      return 'permanent';
    }
  }
  // Default: retryable (network errors, DB errors, timeouts, etc.)
  return 'retryable';
}
