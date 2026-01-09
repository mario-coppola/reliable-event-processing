import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { db } from './db';

type JobRow = {
  id: number;
  status: string;
  event_ledger_id: number;
  event_type: string;
  external_event_id: string;
  created_at: Date;
};

type EffectRow = {
  id: number;
  idempotency_key: string;
  subscription_id: string;
  status: string;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
};

function clampLimit(limit: unknown): number {
  if (limit === undefined || limit === null) {
    return 50;
  }
  const num = Number(limit);
  if (isNaN(num) || num < 1) {
    throw new BadRequestException('limit must be a number between 1 and 200');
  }
  return Math.min(Math.max(1, Math.floor(num)), 200);
}

@Controller('admin')
export class AdminController {
  @Get('jobs')
  async getJobs(@Query('limit') limit?: unknown) {
    const clampedLimit = clampLimit(limit);

    const client = await db.connect();
    try {
      const result = await client.query<JobRow>(
        `
        SELECT id, status, event_ledger_id, event_type, external_event_id, created_at
        FROM jobs
        ORDER BY id DESC
        LIMIT $1
        `,
        [clampedLimit],
      );

      return {
        items: result.rows,
        limit: clampedLimit,
      };
    } finally {
      client.release();
    }
  }

  @Get('effects')
  async getEffects(@Query('limit') limit?: unknown) {
    const clampedLimit = clampLimit(limit);

    const client = await db.connect();
    try {
      const result = await client.query<EffectRow>(
        `
        SELECT id, idempotency_key, subscription_id, status, error_message, created_at, updated_at
        FROM subscription_activations
        ORDER BY id DESC
        LIMIT $1
        `,
        [clampedLimit],
      );

      return {
        items: result.rows,
        limit: clampedLimit,
      };
    } finally {
      client.release();
    }
  }
}
