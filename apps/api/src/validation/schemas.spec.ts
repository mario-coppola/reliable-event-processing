import { BadRequestException } from '@nestjs/common';
import { parseOrThrow, ValidationError } from './parse-or-throw';
import {
  getJobsQuerySchema,
  getInterventionsQuerySchema,
  requeueJobBodySchema,
  ingestEventBodySchema,
} from './schemas';

interface BadRequestResponse {
  message: string;
  errors: ValidationError[];
}

describe('Zod Schema Validation', () => {
  describe('getJobsQuerySchema', () => {
    it('should parse valid query parameters', () => {
      const valid = {
        limit: '50',
        status: 'failed',
        event_type: 'subscription.activated',
        external_event_id: 'evt_123',
        failure_type: 'permanent',
      };

      const result = parseOrThrow(getJobsQuerySchema, valid);
      expect(result.limit).toBe(50);
      expect(result.status).toBe('failed');
      expect(result.event_type).toBe('subscription.activated');
      expect(result.external_event_id).toBe('evt_123');
      expect(result.failure_type).toBe('permanent');
    });

    it('should default limit to 50 when undefined', () => {
      const result = parseOrThrow(getJobsQuerySchema, {});
      expect(result.limit).toBe(50);
    });

    it('should reject invalid limit (too high)', () => {
      const invalid = { limit: '999' };
      expect(() => parseOrThrow(getJobsQuerySchema, invalid)).toThrow(
        BadRequestException,
      );
      try {
        parseOrThrow(getJobsQuerySchema, invalid);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        if (error instanceof BadRequestException) {
          expect(error.message).toContain('Invalid request');
          const response = error.response as BadRequestResponse;
          expect(response.errors).toBeDefined();
          expect(response.errors.some((e) => e.path.includes('limit'))).toBe(
            true,
          );
        }
      }
    });

    it('should reject invalid limit (too low)', () => {
      const invalid = { limit: '0' };
      expect(() => parseOrThrow(getJobsQuerySchema, invalid)).toThrow(
        BadRequestException,
      );
    });

    it('should reject invalid status', () => {
      const invalid = { status: 'boh' };
      expect(() => parseOrThrow(getJobsQuerySchema, invalid)).toThrow(
        BadRequestException,
      );
      try {
        parseOrThrow(getJobsQuerySchema, invalid);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        if (error instanceof BadRequestException) {
          const response = error.response as BadRequestResponse;
          expect(response.errors.some((e) => e.path.includes('status'))).toBe(
            true,
          );
        }
      }
    });

    it('should accept valid status values', () => {
      const statuses = ['queued', 'in_progress', 'done', 'failed'];
      for (const status of statuses) {
        const result = parseOrThrow(getJobsQuerySchema, { status });
        expect(result.status).toBe(status);
      }
    });

    it('should accept optional fields as undefined', () => {
      const result = parseOrThrow(getJobsQuerySchema, { limit: '10' });
      expect(result.status).toBeUndefined();
      expect(result.event_type).toBeUndefined();
      expect(result.external_event_id).toBeUndefined();
      expect(result.failure_type).toBeUndefined();
    });
  });

  describe('getInterventionsQuerySchema', () => {
    it('should parse valid query parameters', () => {
      const valid = {
        limit: '20',
        job_id: '123',
        action: 'manual_requeue',
      };

      const result = parseOrThrow(getInterventionsQuerySchema, valid);
      expect(result.limit).toBe(20);
      expect(result.job_id).toBe(123);
      expect(result.action).toBe('manual_requeue');
    });

    it('should reject invalid job_id (non-numeric)', () => {
      const invalid = { job_id: 'abc' };
      expect(() => parseOrThrow(getInterventionsQuerySchema, invalid)).toThrow(
        BadRequestException,
      );
      try {
        parseOrThrow(getInterventionsQuerySchema, invalid);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        if (error instanceof BadRequestException) {
          const response = error.response as BadRequestResponse;
          expect(response.errors.some((e) => e.path.includes('job_id'))).toBe(
            true,
          );
        }
      }
    });

    it('should reject invalid job_id (negative)', () => {
      const invalid = { job_id: '-1' };
      expect(() => parseOrThrow(getInterventionsQuerySchema, invalid)).toThrow(
        BadRequestException,
      );
    });

    it('should reject invalid job_id (zero)', () => {
      const invalid = { job_id: '0' };
      expect(() => parseOrThrow(getInterventionsQuerySchema, invalid)).toThrow(
        BadRequestException,
      );
    });

    it('should accept valid positive integer job_id', () => {
      const result = parseOrThrow(getInterventionsQuerySchema, {
        job_id: '42',
      });
      expect(result.job_id).toBe(42);
    });

    it('should accept undefined job_id', () => {
      const result = parseOrThrow(getInterventionsQuerySchema, { limit: '10' });
      expect(result.job_id).toBeUndefined();
    });
  });

  describe('requeueJobBodySchema', () => {
    it('should parse valid requeue body', () => {
      const valid = {
        actor: 'admin@example.com',
        reason: 'Manual intervention after investigation',
      };

      const result = parseOrThrow(requeueJobBodySchema, valid);
      expect(result.actor).toBe('admin@example.com');
      expect(result.reason).toBe('Manual intervention after investigation');
    });

    it('should reject missing actor', () => {
      const invalid = { reason: 'some reason' };
      expect(() => parseOrThrow(requeueJobBodySchema, invalid)).toThrow(
        BadRequestException,
      );
      try {
        parseOrThrow(requeueJobBodySchema, invalid);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        if (error instanceof BadRequestException) {
          const response = error.response as BadRequestResponse;
          expect(response.errors.some((e) => e.path.includes('actor'))).toBe(
            true,
          );
        }
      }
    });

    it('should reject missing reason', () => {
      const invalid = { actor: 'admin@example.com' };
      expect(() => parseOrThrow(requeueJobBodySchema, invalid)).toThrow(
        BadRequestException,
      );
      try {
        parseOrThrow(requeueJobBodySchema, invalid);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        if (error instanceof BadRequestException) {
          const response = error.response as BadRequestResponse;
          expect(response.errors.some((e) => e.path.includes('reason'))).toBe(
            true,
          );
        }
      }
    });

    it('should reject empty actor string', () => {
      const invalid = { actor: '', reason: 'some reason' };
      expect(() => parseOrThrow(requeueJobBodySchema, invalid)).toThrow(
        BadRequestException,
      );
    });

    it('should reject empty reason string', () => {
      const invalid = { actor: 'admin@example.com', reason: '' };
      expect(() => parseOrThrow(requeueJobBodySchema, invalid)).toThrow(
        BadRequestException,
      );
    });

    it('should reject whitespace-only actor', () => {
      const invalid = { actor: '   ', reason: 'some reason' };
      expect(() => parseOrThrow(requeueJobBodySchema, invalid)).toThrow(
        BadRequestException,
      );
    });

    it('should reject whitespace-only reason', () => {
      const invalid = { actor: 'admin@example.com', reason: '   ' };
      expect(() => parseOrThrow(requeueJobBodySchema, invalid)).toThrow(
        BadRequestException,
      );
    });

    it('should trim and accept valid strings', () => {
      const valid = {
        actor: '  admin@example.com  ',
        reason: '  some reason  ',
      };

      const result = parseOrThrow(requeueJobBodySchema, valid);
      expect(result.actor).toBe('admin@example.com');
      expect(result.reason).toBe('some reason');
    });
  });

  describe('ingestEventBodySchema', () => {
    it('should parse valid event body', () => {
      const valid = {
        event_id: 'evt_123',
        event_type: 'subscription.activated',
        payload: { subscription_id: 'sub_456', user_id: 'user_789' },
      };

      const result = parseOrThrow(ingestEventBodySchema, valid);
      expect(result.event_id).toBe('evt_123');
      expect(result.event_type).toBe('subscription.activated');
      expect(result.payload).toEqual({
        subscription_id: 'sub_456',
        user_id: 'user_789',
      });
    });

    it('should reject missing event_id', () => {
      const invalid = {
        event_type: 'subscription.activated',
        payload: {},
      };
      expect(() => parseOrThrow(ingestEventBodySchema, invalid)).toThrow(
        BadRequestException,
      );
      try {
        parseOrThrow(ingestEventBodySchema, invalid);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        if (error instanceof BadRequestException) {
          const response = error.response as BadRequestResponse;
          expect(response.errors.some((e) => e.path.includes('event_id'))).toBe(
            true,
          );
        }
      }
    });

    it('should reject missing event_type', () => {
      const invalid = {
        event_id: 'evt_123',
        payload: {},
      };
      expect(() => parseOrThrow(ingestEventBodySchema, invalid)).toThrow(
        BadRequestException,
      );
      try {
        parseOrThrow(ingestEventBodySchema, invalid);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        if (error instanceof BadRequestException) {
          const response = error.response as BadRequestResponse;
          expect(
            response.errors.some((e) => e.path.includes('event_type')),
          ).toBe(true);
        }
      }
    });

    it('should reject missing payload', () => {
      const invalid = {
        event_id: 'evt_123',
        event_type: 'subscription.activated',
      };
      expect(() => parseOrThrow(ingestEventBodySchema, invalid)).toThrow(
        BadRequestException,
      );
    });

    it('should reject empty event_id', () => {
      const invalid = {
        event_id: '',
        event_type: 'subscription.activated',
        payload: {},
      };
      expect(() => parseOrThrow(ingestEventBodySchema, invalid)).toThrow(
        BadRequestException,
      );
    });

    it('should reject empty event_type', () => {
      const invalid = {
        event_id: 'evt_123',
        event_type: '',
        payload: {},
      };
      expect(() => parseOrThrow(ingestEventBodySchema, invalid)).toThrow(
        BadRequestException,
      );
    });

    it('should accept empty payload object', () => {
      const valid = {
        event_id: 'evt_123',
        event_type: 'subscription.activated',
        payload: {},
      };

      const result = parseOrThrow(ingestEventBodySchema, valid);
      expect(result.payload).toEqual({});
    });

    it('should trim and accept valid strings', () => {
      const valid = {
        event_id: '  evt_123  ',
        event_type: '  subscription.activated  ',
        payload: { key: 'value' },
      };

      const result = parseOrThrow(ingestEventBodySchema, valid);
      expect(result.event_id).toBe('evt_123');
      expect(result.event_type).toBe('subscription.activated');
    });
  });
});
