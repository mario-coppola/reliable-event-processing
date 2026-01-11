import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import {
  clampLimit,
  validateStatus,
  validateEventType,
  validateExternalEventId,
  validateFailureType,
  validateRequeueBody,
  validateJobId,
  validateAction,
} from './validation';

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
    const clampedLimit = clampLimit(limit);
    validateStatus(status);
    validateEventType(eventType);
    validateExternalEventId(externalEventId);
    validateFailureType(failureType);

    return this.adminService.getJobs({
      status: status as string | undefined,
      eventType: eventType as string | undefined,
      externalEventId: externalEventId as string | undefined,
      failureType: failureType as string | undefined,
      limit: clampedLimit,
    });
  }

  @HttpCode(200)
  @Post('jobs/:id/requeue')
  async requeueJob(@Param('id') id: unknown, @Body() body: unknown) {
    const jobId = Number(id);
    if (isNaN(jobId) || jobId <= 0) {
      throw new BadRequestException('id must be a positive integer');
    }

    const requestBody = validateRequeueBody(body);

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
    const clampedLimit = clampLimit(limit);
    validateJobId(jobId);
    validateAction(action);

    return this.adminService.getInterventions({
      jobId: jobId !== undefined && jobId !== null ? Number(jobId) : undefined,
      action: action as string | undefined,
      limit: clampedLimit,
    });
  }

  @Get('effects')
  async getEffects(@Query('limit') limit?: unknown) {
    const clampedLimit = clampLimit(limit);

    return this.adminService.getEffects(clampedLimit);
  }
}
