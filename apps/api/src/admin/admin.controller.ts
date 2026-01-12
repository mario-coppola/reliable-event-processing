import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  HttpCode,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { parseOrThrow } from './validation/parse-or-throw';
import {
  getJobsQuerySchema,
  requeueJobBodySchema,
  getInterventionsQuerySchema,
  positiveIntegerSchema,
  limitSchema,
} from './validation/schemas';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('jobs')
  async getJobs(
    @Query('limit') limit?: unknown,
    @Query('status') status?: unknown,
    @Query('event_type') eventType?: unknown,
    @Query('external_event_id') externalEventId?: unknown,
    @Query('failure_type') failureType?: unknown,
  ) {
    const parsed = parseOrThrow(getJobsQuerySchema, {
      limit,
      status,
      event_type: eventType,
      external_event_id: externalEventId,
      failure_type: failureType,
    });

    return this.adminService.getJobs({
      status: parsed.status,
      eventType: parsed.event_type,
      externalEventId: parsed.external_event_id,
      failureType: parsed.failure_type,
      limit: parsed.limit as number,
    });
  }

  @HttpCode(200)
  @Post('jobs/:id/requeue')
  async requeueJob(@Param('id') id: unknown, @Body() body: unknown) {
    const jobId = parseOrThrow(positiveIntegerSchema, id) as number;
    const requestBody = parseOrThrow(requeueJobBodySchema, body);

    return this.adminService.requeueJob(
      jobId,
      requestBody.actor,
      requestBody.reason,
    );
  }

  @Get('interventions')
  async getInterventions(
    @Query('limit') limit?: unknown,
    @Query('job_id') jobId?: unknown,
    @Query('action') action?: unknown,
  ) {
    const parsed = parseOrThrow(getInterventionsQuerySchema, {
      limit,
      job_id: jobId,
      action,
    });

    return this.adminService.getInterventions({
      jobId: parsed.job_id as number | undefined,
      action: parsed.action,
      limit: parsed.limit as number,
    });
  }

  @Get('effects')
  async getEffects(@Query('limit') limit?: unknown) {
    const parsedLimit = parseOrThrow(limitSchema, limit) as number;

    return this.adminService.getEffects(parsedLimit);
  }
}
