import { z } from 'zod';

// Common schemas
export const limitSchema: z.ZodType<number, z.ZodTypeDef, unknown> = z
  .union([z.string(), z.number(), z.undefined()])
  .transform((val): number => {
    if (val === undefined || val === null) {
      return 50;
    }
    const num = typeof val === 'string' ? Number(val) : val;
    if (isNaN(num) || num < 1) {
      throw new z.ZodError([
        {
          code: 'custom',
          message: 'limit must be a number between 1 and 200',
          path: ['limit'],
        },
      ]);
    }
    return Math.min(Math.max(1, Math.floor(num)), 200);
  });

export const statusSchema = z
  .enum(['queued', 'in_progress', 'done', 'failed'])
  .optional();

export const failureTypeSchema = z.enum(['retryable', 'permanent']).optional();

export const eventTypeSchema = z
  .string()
  .min(1, 'event_type must be a non-empty string')
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, 'event_type must be a non-empty string')
  .optional();

export const externalEventIdSchema = z
  .string()
  .min(1, 'external_event_id must be a non-empty string')
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, 'external_event_id must be a non-empty string')
  .optional();

export const jobIdSchema: z.ZodType<number | undefined, z.ZodTypeDef, unknown> =
  z
    .union([z.string(), z.number(), z.undefined()])
    .transform((val): number | undefined => {
      if (val === undefined || val === null) {
        return undefined;
      }
      const num = typeof val === 'string' ? Number(val) : val;
      if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
        throw new z.ZodError([
          {
            code: 'custom',
            message: 'job_id must be a positive integer',
            path: ['job_id'],
          },
        ]);
      }
      return num;
    })
    .optional();

export const actionSchema = z
  .string()
  .min(1, 'action must be a non-empty string')
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, 'action must be a non-empty string')
  .optional();

export const positiveIntegerSchema: z.ZodType<number, z.ZodTypeDef, unknown> = z
  .union([z.string(), z.number()])
  .transform((val): number => {
    const num = typeof val === 'string' ? Number(val) : val;
    if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
      throw new z.ZodError([
        {
          code: 'custom',
          message: 'id must be a positive integer',
          path: [],
        },
      ]);
    }
    return num;
  });

// Endpoint-specific schemas
export const getJobsQuerySchema = z.object({
  limit: limitSchema,
  status: statusSchema,
  event_type: eventTypeSchema,
  external_event_id: externalEventIdSchema,
  failure_type: failureTypeSchema,
});

export const requeueJobBodySchema = z.object({
  actor: z
    .string()
    .min(1, 'actor must be a non-empty string')
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'actor must be a non-empty string'),
  reason: z
    .string()
    .min(1, 'reason must be a non-empty string')
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'reason must be a non-empty string'),
});

export const getInterventionsQuerySchema = z.object({
  limit: limitSchema,
  job_id: jobIdSchema,
  action: actionSchema,
});

export const ingestEventBodySchema = z.object({
  event_id: z
    .string()
    .min(1, 'event_id must be a non-empty string')
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'event_id must be a non-empty string'),
  event_type: z
    .string()
    .min(1, 'event_type must be a non-empty string')
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'event_type must be a non-empty string'),
  payload: z.record(z.unknown()),
});
