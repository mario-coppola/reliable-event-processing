import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  BadRequestException,
  NotFoundException,
  ConflictException,
  HttpCode,
} from '@nestjs/common';
import { logger } from '@pkg/shared';
import { db } from './db';

type JobRow = {
  id: number;
  status: string;
  event_ledger_id: number;
  event_type: string;
  external_event_id: string;
  created_at: Date;
  attempts: number;
  max_attempts: number;
  failure_type: 'retryable' | 'permanent' | null;
  last_error: string | null;
  available_at: Date;
};

type EffectRow = {
  id: number;
  idempotency_key: string;
  subscription_id: string;
  status: string;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
};

type JobRequeueRow = {
  id: number;
  status: string;
  available_at: Date;
};

type JobStatusRow = {
  id: number;
  status: string;
};

type JobInterventionAuditRow = {
  id: number;
  job_id: number;
  action: string;
  actor: string;
  reason: string;
  created_at: Date;
};

type RequeueRequestBody = {
  actor: string;
  reason: string;
};

const VALID_STATUSES = ['queued', 'in_progress', 'done', 'failed'] as const;
const VALID_FAILURE_TYPES = ['retryable', 'permanent'] as const;

function clampLimit(limit: unknown): number {
  if (limit === undefined || limit === null) {
    return 50;
  }
  const num = Number(limit);
  if (isNaN(num) || num < 1) {
    throw new BadRequestException('limit must be a number between 1 and 200');
  }
  return Math.min(Math.max(1, Math.floor(num)), 200);
}

function validateStatus(status: unknown): void {
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

function validateFailureType(failureType: unknown): void {
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

function validateEventType(eventType: unknown): void {
  if (eventType !== undefined && eventType !== null) {
    if (typeof eventType !== 'string' || eventType.trim() === '') {
      throw new BadRequestException('event_type must be a non-empty string');
    }
  }
}

function validateExternalEventId(externalEventId: unknown): void {
  if (externalEventId !== undefined && externalEventId !== null) {
    if (typeof externalEventId !== 'string' || externalEventId.trim() === '') {
      throw new BadRequestException(
        'external_event_id must be a non-empty string',
      );
    }
  }
}

function validateRequeueBody(body: unknown): RequeueRequestBody {
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

function validateJobId(jobId: unknown): void {
  if (jobId !== undefined && jobId !== null) {
    const num = Number(jobId);
    if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
      throw new BadRequestException('job_id must be a positive integer');
    }
  }
}

function validateAction(action: unknown): void {
  if (action !== undefined && action !== null) {
    if (typeof action !== 'string' || action.trim() === '') {
      throw new BadRequestException('action must be a non-empty string');
    }
  }
}

type InterventionRow = {
  audit_id: number;
  audit_job_id: number;
  audit_action: string;
  audit_actor: string;
  audit_reason: string;
  audit_created_at: Date;
  job_id: number;
  job_status: string;
  job_attempts: number;
  job_max_attempts: number;
  job_failure_type: 'retryable' | 'permanent' | null;
  job_last_error: string | null;
  job_available_at: Date;
  job_event_type: string;
  job_external_event_id: string;
  job_event_ledger_id: number;
  job_created_at: Date;
};

@Controller('admin')
export class AdminController {
  @Get('jobs')
  async getJobs(
    @Query('limit') limit?: unknown,
    @Query('status') status?: unknown,
    @Query('event_type') eventType?: unknown,
    @Query('external_event_id') externalEventId?: unknown,
    @Query('failure_type') failureType?: unknown,
  ) {
    const clampedLimit = clampLimit(limit);
    validateStatus(status);
    validateEventType(eventType);
    validateExternalEventId(externalEventId);
    validateFailureType(failureType);

    const client = await db.connect();
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (status !== undefined && status !== null) {
        conditions.push(`status = $${paramIndex}`);
        params.push(status);
        paramIndex++;
      }

      if (eventType !== undefined && eventType !== null) {
        conditions.push(`event_type = $${paramIndex}`);
        params.push(eventType);
        paramIndex++;
      }

      if (externalEventId !== undefined && externalEventId !== null) {
        conditions.push(`external_event_id = $${paramIndex}`);
        params.push(externalEventId);
        paramIndex++;
      }

      if (failureType !== undefined && failureType !== null) {
        conditions.push(`failure_type = $${paramIndex}`);
        params.push(failureType);
        paramIndex++;
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      params.push(clampedLimit);

      const result = await client.query<JobRow>(
        `
        SELECT id, status, event_ledger_id, event_type, external_event_id, created_at,
               attempts, max_attempts, failure_type, last_error, available_at
        FROM jobs
        ${whereClause}
        ORDER BY id DESC
        LIMIT $${paramIndex}
        `,
        params,
      );

      const serverNowResult = await client.query<{ now: Date }>(
        'SELECT NOW() as now',
      );
      const serverNow = serverNowResult.rows[0].now;

      return {
        items: result.rows,
        limit: clampedLimit,
        server_now: serverNow,
      };
    } finally {
      client.release();
    }
  }

  @HttpCode(200)
  @Post('jobs/:id/requeue')
  async requeueJob(@Param('id') id: unknown, @Body() body: unknown) {
    const jobId = Number(id);
    if (isNaN(jobId) || jobId <= 0) {
      throw new BadRequestException('id must be a positive integer');
    }

    const requestBody = validateRequeueBody(body);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Atomic conditional UPDATE
      const updateResult = await client.query<JobRequeueRow>(
        `
        UPDATE jobs
        SET status = 'queued', available_at = NOW()
        WHERE id = $1 AND status = 'failed'
        RETURNING id, status, available_at
        `,
        [jobId],
      );

      if (updateResult.rows.length > 0) {
        const updatedJob = updateResult.rows[0];

        // Insert audit record
        const auditResult = await client.query<JobInterventionAuditRow>(
          `
          INSERT INTO job_intervention_audit (job_id, action, actor, reason)
          VALUES ($1, $2, $3, $4)
          RETURNING id, job_id, action, actor, reason, created_at
          `,
          [jobId, 'manual_requeue', requestBody.actor, requestBody.reason],
        );

        const audit = auditResult.rows[0];
        if (!audit) {
          throw new Error('Audit insert did not return a result');
        }

        await client.query('COMMIT');

        logger.info(
          {
            service: 'api',
            job_id: jobId,
            action: 'manual_requeue',
            actor: requestBody.actor,
          },
          'manual requeue',
        );

        return {
          ok: true,
          id: updatedJob.id,
          status: updatedJob.status,
          available_at: updatedJob.available_at,
          audit: {
            id: audit.id,
            action: audit.action,
            actor: audit.actor,
            reason: audit.reason,
            created_at: audit.created_at,
          },
        };
      }

      // UPDATE returned 0 rows - check if job exists and get status
      const jobResult = await client.query<JobStatusRow>(
        `
        SELECT id, status
        FROM jobs
        WHERE id = $1
        `,
        [jobId],
      );

      await client.query('ROLLBACK');
      if (jobResult.rows.length === 0) {
        throw new NotFoundException(`Job with id ${jobId} not found`);
      }

      const job = jobResult.rows[0];
      throw new ConflictException(
        `Job with id ${jobId} is not in failed status (current status: ${job.status}). Only failed jobs can be requeued.`,
      );
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      throw error;
    } finally {
      client.release();
    }
  }

  @Get('interventions')
  async getInterventions(
    @Query('limit') limit?: unknown,
    @Query('job_id') jobId?: unknown,
    @Query('action') action?: unknown,
  ) {
    const clampedLimit = clampLimit(limit);
    validateJobId(jobId);
    validateAction(action);

    const client = await db.connect();
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      const hasJobId = jobId !== undefined && jobId !== null;
const hasAction = action !== undefined && action !== null;

if (hasJobId) {
  conditions.push(`a.job_id = $${paramIndex}`);
  params.push(Number(jobId));
  paramIndex++;
}

if (hasAction) {
  conditions.push(`a.action = $${paramIndex}`);
  params.push(String(action));
  paramIndex++;
}

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      params.push(clampedLimit);

      const result = await client.query<InterventionRow>(
        `
        SELECT
          a.id as audit_id,
          a.job_id as audit_job_id,
          a.action as audit_action,
          a.actor as audit_actor,
          a.reason as audit_reason,
          a.created_at as audit_created_at,
          j.id as job_id,
          j.status as job_status,
          j.attempts as job_attempts,
          j.max_attempts as job_max_attempts,
          j.failure_type as job_failure_type,
          j.last_error as job_last_error,
          j.available_at as job_available_at,
          j.event_type as job_event_type,
          j.external_event_id as job_external_event_id,
          j.event_ledger_id as job_event_ledger_id,
          j.created_at as job_created_at
        FROM job_intervention_audit a
        JOIN jobs j ON j.id = a.job_id
        ${whereClause}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $${paramIndex}
        `,
        params,
      );

      const serverNowResult = await client.query<{ now: Date }>(
        'SELECT NOW() as now',
      );
      const serverNow = serverNowResult.rows[0].now;

      const items = result.rows.map((row) => ({
        audit: {
          id: row.audit_id,
          job_id: row.audit_job_id,
          action: row.audit_action,
          actor: row.audit_actor,
          reason: row.audit_reason,
          created_at: row.audit_created_at,
        },
        job: {
          id: row.job_id,
          status: row.job_status,
          attempts: row.job_attempts,
          max_attempts: row.job_max_attempts,
          failure_type: row.job_failure_type,
          last_error: row.job_last_error,
          available_at: row.job_available_at,
          event_type: row.job_event_type,
          external_event_id: row.job_external_event_id,
          event_ledger_id: row.job_event_ledger_id,
          created_at: row.job_created_at,
        },
      }));

      return {
        items,
        limit: clampedLimit,
        server_now: serverNow,
      };
    } finally {
      client.release();
    }
  }

  @Get('effects')
  async getEffects(@Query('limit') limit?: unknown) {
    const clampedLimit = clampLimit(limit);

    const client = await db.connect();
    try {
      const result = await client.query<EffectRow>(
        `
        SELECT id, idempotency_key, subscription_id, status, error_message, created_at, updated_at
        FROM subscription_activations
        ORDER BY id DESC
        LIMIT $1
        `,
        [clampedLimit],
      );

      return {
        items: result.rows,
        limit: clampedLimit,
      };
    } finally {
      client.release();
    }
  }
}
