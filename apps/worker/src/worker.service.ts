import { Injectable, OnModuleInit } from '@nestjs/common';
import { logger } from '@pkg/shared';
import { JobRepository } from './jobs/job.repository';
import type { Job } from './jobs/job.types';
import { SubscriptionActivationService } from './handlers/subscription-activation.service';
import { classifyFailure } from './retry/failure-classifier';
import { shouldRetry, RETRY_DELAY_MS } from './retry/retry.policy';
import { shouldFailNow } from './dev/failpoint.dev';

@Injectable()
export class WorkerService implements OnModuleInit {
  private isRunning = false;
  private readonly POLL_INTERVAL_MS = 750;
  private isIdle = false;
  private isErrorIdle = false;

  constructor(
    private readonly jobRepository: JobRepository,
    private readonly subscriptionActivationService: SubscriptionActivationService,
  ) {}

  onModuleInit() {
    this.isRunning = true;
    logger.info({ service: 'worker' }, 'worker started');
    void this.poll();
  }

  private async poll() {
    while (this.isRunning) {
      try {
        const job = await this.jobRepository.claimJob();
        if (job) {
          this.isIdle = false;
          this.isErrorIdle = false;
          await this.processJob(job);
        } else {
          if (!this.isIdle) {
            logger.info({ service: 'worker' }, 'no jobs available');
            this.isIdle = true;
          }
          this.isErrorIdle = false;
          await this.sleep(this.POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (!this.isErrorIdle) {
          logger.error({ service: 'worker', error }, 'error in poll loop');
          this.isErrorIdle = true;
        }
        this.isIdle = false;
        await this.sleep(this.POLL_INTERVAL_MS);
      }
    }
  }

  private async processJob(job: Job) {
    try {
      if (job.event_type !== 'subscription.paid') {
        await this.sleep(200);
        await this.jobRepository.markDone(job.id);
        logger.info(
          { service: 'worker', job_id: job.id, event_type: job.event_type },
          'job skipped (irrelevant event_type)',
        );
        return;
      }

      // DEV-ONLY failpoint: simulate transient failure once per worker process
      if (shouldFailNow()) {
        logger.info(
          { service: 'worker', job_id: job.id },
          'failpoint triggered',
        );
        throw new Error('failpoint: simulated transient failure');
      }

      await this.subscriptionActivationService.processSubscriptionPaid(job);
      await this.jobRepository.markDone(job.id);
      logger.info(
        { service: 'worker', job_id: job.id, event_type: job.event_type },
        'job completed',
      );
    } catch (error) {
      try {
        const errorString = this.errorToString(error);
        const failureType = classifyFailure(error);
        const retryState = await this.jobRepository.getRetryState(job.id);

        if (
          shouldRetry(retryState.attempts, retryState.max_attempts, failureType)
        ) {
          await this.jobRepository.requeue(job.id, errorString, RETRY_DELAY_MS);
          logger.info(
            {
              service: 'worker',
              job_id: job.id,
              attempts: retryState.attempts,
              max_attempts: retryState.max_attempts,
            },
            'job re-queued (retryable)',
          );
        } else {
          await this.jobRepository.fail(job.id, failureType, errorString);
          if (retryState.attempts >= retryState.max_attempts) {
            logger.error(
              {
                service: 'worker',
                job_id: job.id,
                attempts: retryState.attempts,
                max_attempts: retryState.max_attempts,
              },
              'job failed (max attempts reached)',
            );
          } else {
            logger.error(
              { service: 'worker', job_id: job.id },
              'job failed (permanent)',
            );
          }
        }
      } catch (fallbackError) {
        logger.error(
          { service: 'worker', job_id: job.id, error: fallbackError },
          'job state update failed',
        );
        try {
          const errorString = this.errorToString(error);
          const failureType = classifyFailure(error);
          await this.jobRepository.fail(job.id, failureType, errorString);
        } catch {
          // ignore fallback update failures, already logged
        }
      }
    }
  }

  private errorToString(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  stop() {
    this.isRunning = false;
    this.isErrorIdle = false;
    this.isIdle = false;
  }
}
