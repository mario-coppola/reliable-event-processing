import { NotFoundException, ConflictException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JobsRepository } from './repositories/jobs.repository';
import { EffectsRepository } from './repositories/effects.repository';
import { InterventionsRepository } from './repositories/interventions.repository';
import { JobNotFoundError, JobInvalidStateError } from './errors';

describe('AdminService', () => {
  let service: AdminService;
  let jobsRepository: {
    findJobs: jest.Mock;
    getServerNow: jest.Mock;
    requeueJob: jest.Mock;
  };
  let effectsRepository: {
    findEffects: jest.Mock;
  };
  let interventionsRepository: {
    findInterventions: jest.Mock;
    getServerNow: jest.Mock;
  };

  beforeEach(() => {
    jobsRepository = {
      findJobs: jest.fn(),
      getServerNow: jest.fn(),
      requeueJob: jest.fn(),
    };

    effectsRepository = {
      findEffects: jest.fn(),
    };

    interventionsRepository = {
      findInterventions: jest.fn(),
      getServerNow: jest.fn(),
    };

    service = new AdminService(
      jobsRepository as unknown as JobsRepository,
      effectsRepository as unknown as EffectsRepository,
      interventionsRepository as unknown as InterventionsRepository,
    );
  });

  describe('requeueJob', () => {
    const jobId = 42;
    const actor = 'admin@example.com';
    const reason = 'Manual intervention after investigation';

    it('should successfully requeue a failed job', async () => {
      const mockJob = {
        id: jobId,
        status: 'queued',
        available_at: new Date('2024-01-01T12:00:00Z'),
      };

      const mockAudit = {
        id: 100,
        job_id: jobId,
        action: 'manual_requeue',
        actor,
        reason,
        created_at: new Date('2024-01-01T12:00:00Z'),
      };

      jobsRepository.requeueJob.mockResolvedValue({
        job: mockJob,
        audit: mockAudit,
      });

      const result = await service.requeueJob(jobId, actor, reason);

      expect(result).toEqual({
        ok: true,
        id: jobId,
        status: 'queued',
        available_at: mockJob.available_at,
        audit: {
          id: mockAudit.id,
          action: mockAudit.action,
          actor: mockAudit.actor,
          reason: mockAudit.reason,
          created_at: mockAudit.created_at,
        },
      });

      expect(jobsRepository.requeueJob).toHaveBeenCalledTimes(1);
      expect(jobsRepository.requeueJob).toHaveBeenCalledWith(
        jobId,
        actor,
        reason,
      );
    });

    it('should throw NotFoundException when job is not found', async () => {
      const error = new JobNotFoundError(jobId);
      jobsRepository.requeueJob.mockRejectedValue(error);

      await expect(service.requeueJob(jobId, actor, reason)).rejects.toThrow(
        NotFoundException,
      );

      try {
        await service.requeueJob(jobId, actor, reason);
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(NotFoundException);
        if (thrownError instanceof NotFoundException) {
          expect(thrownError.message).toContain(String(jobId));
        }
      }
    });

    it('should throw ConflictException when job is not in failed status', async () => {
      const currentStatus = 'done';
      const error = new JobInvalidStateError(jobId, currentStatus, 'failed');
      jobsRepository.requeueJob.mockRejectedValue(error);

      await expect(service.requeueJob(jobId, actor, reason)).rejects.toThrow(
        ConflictException,
      );

      try {
        await service.requeueJob(jobId, actor, reason);
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(ConflictException);
        if (thrownError instanceof ConflictException) {
          expect(thrownError.message).toContain(
            'Only failed jobs can be requeued',
          );
          expect(thrownError.message).toContain(currentStatus);
        }
      }
    });

    it('should throw ConflictException for queued status', async () => {
      const currentStatus = 'queued';
      const error = new JobInvalidStateError(jobId, currentStatus, 'failed');
      jobsRepository.requeueJob.mockRejectedValue(error);

      await expect(service.requeueJob(jobId, actor, reason)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException for in_progress status', async () => {
      const currentStatus = 'in_progress';
      const error = new JobInvalidStateError(jobId, currentStatus, 'failed');
      jobsRepository.requeueJob.mockRejectedValue(error);

      await expect(service.requeueJob(jobId, actor, reason)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should rethrow non-domain errors', async () => {
      const unexpectedError = new Error('Database connection failed');
      jobsRepository.requeueJob.mockRejectedValue(unexpectedError);

      await expect(service.requeueJob(jobId, actor, reason)).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should handle multiple requeue attempts with different actors', async () => {
      const mockJob = {
        id: jobId,
        status: 'queued',
        available_at: new Date('2024-01-01T12:00:00Z'),
      };

      const mockAudit1 = {
        id: 100,
        job_id: jobId,
        action: 'manual_requeue',
        actor: 'admin1@example.com',
        reason: 'First attempt',
        created_at: new Date('2024-01-01T12:00:00Z'),
      };

      const mockAudit2 = {
        id: 101,
        job_id: jobId,
        action: 'manual_requeue',
        actor: 'admin2@example.com',
        reason: 'Second attempt',
        created_at: new Date('2024-01-01T13:00:00Z'),
      };

      jobsRepository.requeueJob
        .mockResolvedValueOnce({
          job: mockJob,
          audit: mockAudit1,
        })
        .mockResolvedValueOnce({
          job: mockJob,
          audit: mockAudit2,
        });

      const result1 = await service.requeueJob(
        jobId,
        'admin1@example.com',
        'First attempt',
      );
      const result2 = await service.requeueJob(
        jobId,
        'admin2@example.com',
        'Second attempt',
      );

      expect(result1.audit.actor).toBe('admin1@example.com');
      expect(result2.audit.actor).toBe('admin2@example.com');
      expect(jobsRepository.requeueJob).toHaveBeenCalledTimes(2);
    });
  });
});
