import {
  Controller,
  Get,
  Post,
  Query,
  Param,
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
  async requeueJob(@Param('id') id: unknown) {
    const jobId = Number(id);
    if (isNaN(jobId) || jobId <= 0) {
      throw new BadRequestException('id must be a positive integer');
    }

    const client = await db.connect();
    try {
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

        logger.info(
          {
            service: 'api',
            job_id: jobId,
            action: 'manual_requeue',
          },
          'manual requeue',
        );

        return {
          ok: true,
          id: updatedJob.id,
          status: updatedJob.status,
          available_at: updatedJob.available_at,
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

      if (jobResult.rows.length === 0) {
        throw new NotFoundException(`Job with id ${jobId} not found`);
      }

      const job = jobResult.rows[0];
      throw new ConflictException(
        `Job with id ${jobId} is not in failed status (current status: ${job.status}). Only failed jobs can be requeued.`,
      );
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
