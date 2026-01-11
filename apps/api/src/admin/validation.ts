import { BadRequestException } from '@nestjs/common';

export const VALID_STATUSES = [
  'queued',
  'in_progress',
  'done',
  'failed',
] as const;
export const VALID_FAILURE_TYPES = ['retryable', 'permanent'] as const;

export type RequeueRequestBody = {
  actor: string;
  reason: string;
};

export function clampLimit(limit: unknown): number {
  if (limit === undefined || limit === null) {
    return 50;
  }
  const num = Number(limit);
  if (isNaN(num) || num < 1) {
    throw new BadRequestException('limit must be a number between 1 and 200');
  }
  return Math.min(Math.max(1, Math.floor(num)), 200);
}

export function validateStatus(status: unknown): void {
  if (status !== undefined && status !== null) {
    if (
      typeof status !== 'string' ||
      !(VALID_STATUSES as readonly string[]).includes(status)
    ) {
      throw new BadRequestException(
        `status must be one of: ${VALID_STATUSES.join(', ')}`,
      );
    }
  }
}

export function validateFailureType(failureType: unknown): void {
  if (failureType !== undefined && failureType !== null) {
    if (
      typeof failureType !== 'string' ||
      !(VALID_FAILURE_TYPES as readonly string[]).includes(failureType)
    ) {
      throw new BadRequestException(
        `failure_type must be one of: ${VALID_FAILURE_TYPES.join(', ')}`,
      );
    }
  }
}

export function validateEventType(eventType: unknown): void {
  if (eventType !== undefined && eventType !== null) {
    if (typeof eventType !== 'string' || eventType.trim() === '') {
      throw new BadRequestException('event_type must be a non-empty string');
    }
  }
}

export function validateExternalEventId(externalEventId: unknown): void {
  if (externalEventId !== undefined && externalEventId !== null) {
    if (typeof externalEventId !== 'string' || externalEventId.trim() === '') {
      throw new BadRequestException(
        'external_event_id must be a non-empty string',
      );
    }
  }
}

export function validateRequeueBody(body: unknown): RequeueRequestBody {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('Body must be a JSON object');
  }

  const { actor, reason } = body as Record<string, unknown>;

  if (typeof actor !== 'string' || actor.trim() === '') {
    throw new BadRequestException('actor must be a non-empty string');
  }

  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new BadRequestException('reason must be a non-empty string');
  }

  return {
    actor: actor.trim(),
    reason: reason.trim(),
  };
}

export function validateJobId(jobId: unknown): void {
  if (jobId !== undefined && jobId !== null) {
    const num = Number(jobId);
    if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
      throw new BadRequestException('job_id must be a positive integer');
    }
  }
}

export function validateAction(action: unknown): void {
  if (action !== undefined && action !== null) {
    if (typeof action !== 'string' || action.trim() === '') {
      throw new BadRequestException('action must be a non-empty string');
    }
  }
}
