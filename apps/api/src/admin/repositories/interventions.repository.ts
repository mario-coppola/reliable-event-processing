import { Injectable } from '@nestjs/common';
import { db } from '../../db';

export type InterventionRow = {
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

@Injectable()
export class InterventionsRepository {
  async findInterventions(filters: {
    jobId?: number;
    action?: string;
    limit: number;
  }): Promise<InterventionRow[]> {
    const client = await db.connect();
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (filters.jobId !== undefined && filters.jobId !== null) {
        conditions.push(`a.job_id = $${paramIndex}`);
        params.push(filters.jobId);
        paramIndex++;
      }

      if (filters.action !== undefined && filters.action !== null) {
        conditions.push(`a.action = $${paramIndex}`);
        params.push(filters.action);
        paramIndex++;
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      params.push(filters.limit);

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
}
