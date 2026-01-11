import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { logger } from '@pkg/shared';
import { JobsRepository } from './repositories/jobs.repository';
import { EffectsRepository } from './repositories/effects.repository';
import { InterventionsRepository } from './repositories/interventions.repository';
import { JobNotFoundError, JobInvalidStateError } from './errors';

@Injectable()
export class AdminService {
  constructor(
    private readonly jobsRepository: JobsRepository,
    private readonly effectsRepository: EffectsRepository,
    private readonly interventionsRepository: InterventionsRepository,
  ) {}

  async getJobs(filters: {
    status?: string;
    eventType?: string;
    externalEventId?: string;
    failureType?: string;
    limit: number;
  }) {
    const items = await this.jobsRepository.findJobs(filters);
    const serverNow = await this.jobsRepository.getServerNow();

    return {
      items,
      limit: filters.limit,
      server_now: serverNow,
    };
  }

  async requeueJob(jobId: number, actor: string, reason: string) {
    try {
      const result = await this.jobsRepository.requeueJob(jobId, actor, reason);

      logger.info(
        {
          service: 'api',
          job_id: jobId,
          action: 'manual_requeue',
          actor,
        },
        'manual requeue',
      );

      return {
        ok: true,
        id: result.job.id,
        status: result.job.status,
        available_at: result.job.available_at,
        audit: {
          id: result.audit.id,
          action: result.audit.action,
          actor: result.audit.actor,
          reason: result.audit.reason,
          created_at: result.audit.created_at,
        },
      };
    } catch (error) {
      if (error instanceof JobNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof JobInvalidStateError) {
        throw new ConflictException(
          `${error.message}. Only failed jobs can be requeued.`,
        );
      }
      throw error;
    }
  }

  async getEffects(limit: number) {
    const items = await this.effectsRepository.findEffects(limit);

    return {
      items,
      limit,
    };
  }

  async getInterventions(filters: {
    jobId?: number;
    action?: string;
    limit: number;
  }) {
    const rows = await this.interventionsRepository.findInterventions(filters);
    const serverNow = await this.interventionsRepository.getServerNow();

    const items = rows.map((row) => ({
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
      limit: filters.limit,
      server_now: serverNow,
    };
  }
}
