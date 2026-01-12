import { z } from 'zod';

// Common schemas - using idiomatic Zod patterns
export const limitSchema = z.preprocess(
  (val) => (val === undefined || val === null ? 50 : val),
  z.coerce
    .number()
    .int()
    .min(1, 'limit must be at least 1')
    .max(200, 'limit must be at most 200'),
);

export const statusSchema = z
  .enum(['queued', 'in_progress', 'done', 'failed'])
  .optional();

export const failureTypeSchema = z.enum(['retryable', 'permanent']).optional();

export const eventTypeSchema = z
  .string()
  .trim()
  .min(1, 'event_type must be a non-empty string')
  .optional();

export const externalEventIdSchema = z
  .string()
  .trim()
  .min(1, 'external_event_id must be a non-empty string')
  .optional();

export const jobIdSchema = z.preprocess(
  (val) => (val === undefined || val === null ? undefined : val),
  z.coerce
    .number()
    .int()
    .positive('job_id must be a positive integer')
    .optional(),
);

export const actionSchema = z
  .string()
  .trim()
  .min(1, 'action must be a non-empty string')
  .optional();

export const positiveIntegerSchema = z.coerce
  .number()
  .int()
  .positive('id must be a positive integer');

// Endpoint-specific schemas
export const getJobsQuerySchema = z.object({
  limit: limitSchema,
  status: statusSchema,
  event_type: eventTypeSchema,
  external_event_id: externalEventIdSchema,
  failure_type: failureTypeSchema,
});

export const requeueJobBodySchema = z.object({
  actor: z.string().trim().min(1, 'actor must be a non-empty string'),
  reason: z.string().trim().min(1, 'reason must be a non-empty string'),
});

export const getInterventionsQuerySchema = z.object({
  limit: limitSchema,
  job_id: jobIdSchema,
  action: actionSchema,
});

export const ingestEventBodySchema = z.object({
  event_id: z.string().trim().min(1, 'event_id must be a non-empty string'),
  event_type: z.string().trim().min(1, 'event_type must be a non-empty string'),
  payload: z.record(z.unknown()),
});
