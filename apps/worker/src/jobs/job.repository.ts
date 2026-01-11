import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { logger } from '@pkg/shared';
import type { Job, FailureType, JobRetryState } from './job.types';
import { JobNotFoundError } from '../errors';

@Injectable()
export class JobRepository {
  /**
   * Claims a job atomically using SELECT ... FOR UPDATE SKIP LOCKED.
   * Filters for queued jobs with available_at <= now().
   * Increments attempts when transitioning to in_progress.
   */
  async claimJob(): Promise<Job | null> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<Job>(
        `
        SELECT id, status, event_ledger_id, event_type, external_event_id, created_at,
       attempts, max_attempts, available_at
        FROM jobs
        WHERE status = 'queued' AND available_at <= NOW()
        ORDER BY id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
        `,
      );

      if (result.rows.length === 0) {
        await client.query('COMMIT');
        return null;
      }

      const job = result.rows[0];
      await client.query(
        "UPDATE jobs SET status = 'in_progress', attempts = attempts + 1 WHERE id = $1",
        [job.id],
      );

      await client.query('COMMIT');
      logger.info(
        { service: 'worker', job_id: job.id, event_type: job.event_type },
        'job claimed',
      );
      return job;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {
        // ignore rollback errors
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Marks a job as done.
   */
  async markDone(jobId: number): Promise<void> {
    const client = await db.connect();
    try {
      await client.query('UPDATE jobs SET status = $1 WHERE id = $2', [
        'done',
        jobId,
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Marks a job as failed with the given failure type and error message.
   */
  async fail(
    jobId: number,
    failureType: FailureType,
    lastError: string,
  ): Promise<void> {
    const client = await db.connect();
    try {
      await client.query(
        `
        UPDATE jobs
        SET status = 'failed',
            failure_type = $1,
            last_error = $2
        WHERE id = $3
        `,
        [failureType, lastError, jobId],
      );
    } finally {
      client.release();
    }
  }

  /**
   * Requeues a job with the given error message and delay.
   * Sets status back to queued and schedules available_at.
   */
  async requeue(
    jobId: number,
    lastError: string,
    delayMs: number,
  ): Promise<void> {
    const client = await db.connect();
    try {
      await client.query(
        `
        UPDATE jobs
        SET status = 'queued',
            last_error = $1,
            failure_type = 'retryable',
            available_at = NOW() + ($2::text || ' milliseconds')::interval
        WHERE id = $3
        `,
        [lastError, delayMs, jobId],
      );
    } finally {
      client.release();
    }
  }

  /**
   * Gets the retry state (attempts and max_attempts) for a job.
   */
  async getRetryState(jobId: number): Promise<JobRetryState> {
    const client = await db.connect();
    try {
      const result = await client.query<JobRetryState>(
        'SELECT attempts, max_attempts FROM jobs WHERE id = $1',
        [jobId],
      );
      if (result.rows.length === 0) {
        throw new JobNotFoundError(jobId);
      }
      return result.rows[0];
    } finally {
      client.release();
    }
  }
}
