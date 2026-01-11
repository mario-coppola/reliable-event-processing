import { Injectable } from '@nestjs/common';
import { db } from '../../db';
import {
  JobNotFoundError,
  JobInvalidStateError,
  AuditInsertFailedError,
} from '../errors';

export type JobRow = {
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

export type JobRequeueRow = {
  id: number;
  status: string;
  available_at: Date;
};

export type JobStatusRow = {
  id: number;
  status: string;
};

@Injectable()
export class JobsRepository {
  async findJobs(filters: {
    status?: string;
    eventType?: string;
    externalEventId?: string;
    failureType?: string;
    limit: number;
  }): Promise<JobRow[]> {
    const client = await db.connect();
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (filters.status !== undefined && filters.status !== null) {
        conditions.push(`status = $${paramIndex}`);
        params.push(filters.status);
        paramIndex++;
      }

      if (filters.eventType !== undefined && filters.eventType !== null) {
        conditions.push(`event_type = $${paramIndex}`);
        params.push(filters.eventType);
        paramIndex++;
      }

      if (
        filters.externalEventId !== undefined &&
        filters.externalEventId !== null
      ) {
        conditions.push(`external_event_id = $${paramIndex}`);
        params.push(filters.externalEventId);
        paramIndex++;
      }

      if (filters.failureType !== undefined && filters.failureType !== null) {
        conditions.push(`failure_type = $${paramIndex}`);
        params.push(filters.failureType);
        paramIndex++;
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      params.push(filters.limit);

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

      return result.rows;
    } finally {
      client.release();
    }
  }

  async getServerNow(): Promise<Date> {
    const client = await db.connect();
    try {
      const result = await client.query<{ now: Date }>('SELECT NOW() as now');
      return result.rows[0].now;
    } finally {
      client.release();
    }
  }

  async requeueJob(
    jobId: number,
    actor: string,
    reason: string,
  ): Promise<{
    job: JobRequeueRow;
    audit: {
      id: number;
      job_id: number;
      action: string;
      actor: string;
      reason: string;
      created_at: Date;
    };
  }> {
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
        const auditResult = await client.query<{
          id: number;
          job_id: number;
          action: string;
          actor: string;
          reason: string;
          created_at: Date;
        }>(
          `
          INSERT INTO job_intervention_audit (job_id, action, actor, reason)
          VALUES ($1, $2, $3, $4)
          RETURNING id, job_id, action, actor, reason, created_at
          `,
          [jobId, 'manual_requeue', actor, reason],
        );

        const audit = auditResult.rows[0];
        if (!audit) {
          throw new AuditInsertFailedError(jobId);
        }

        await client.query('COMMIT');

        return {
          job: updatedJob,
          audit,
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
        throw new JobNotFoundError(jobId);
      }

      const job = jobResult.rows[0];
      throw new JobInvalidStateError(jobId, job.status, 'failed');
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
}
