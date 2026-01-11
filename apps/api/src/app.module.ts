import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { IngestController } from './ingest.controller';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { JobsRepository } from './admin/repositories/jobs.repository';
import { EffectsRepository } from './admin/repositories/effects.repository';
import { InterventionsRepository } from './admin/repositories/interventions.repository';

@Module({
  controllers: [HealthController, IngestController, AdminController],
  providers: [
    AdminService,
    JobsRepository,
    EffectsRepository,
    InterventionsRepository,
  ],
})
export class AppModule {}
