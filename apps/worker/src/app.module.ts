import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { JobRepository } from './jobs/job.repository';
import { SubscriptionActivationService } from './handlers/subscription-activation.service';

@Module({
  controllers: [],
  providers: [WorkerService, JobRepository, SubscriptionActivationService],
})
export class AppModule {}
