import {
  Controller,
  Post,
  Body,
  HttpCode,
  ServiceUnavailableException,
} from '@nestjs/common';
import { logger } from '@pkg/shared';
import { db } from './db';
import { EventLedgerInsertFailedError } from './errors';
import { parseOrThrow } from './validation/parse-or-throw';
import { ingestEventBodySchema } from './validation/schemas';

@Controller()
export class IngestController {
  @HttpCode(202)
  @Post('/events/ingest')
  async ingest(@Body() body: unknown) {
    const event = parseOrThrow(ingestEventBodySchema, body);

    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const res = await client.query<{ id: number }>(
        `
        INSERT INTO event_ledger (event_type, external_event_id, raw_payload)
        VALUES ($1, $2, $3::jsonb)
        RETURNING id
        `,
        [event.event_type, event.event_id, JSON.stringify(event)],
      );

      const eventLedgerId = res.rows[0]?.id;
      if (!eventLedgerId) {
        throw new EventLedgerInsertFailedError();
      }

      await client.query(
        `
        INSERT INTO jobs (status, event_ledger_id, event_type, external_event_id, max_attempts, available_at)
        VALUES ('queued', $1, $2, $3, 3, NOW())
        `,
        [eventLedgerId, event.event_type, event.event_id],
      );

      await client.query('COMMIT');
    } catch {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      // No retry, no inspection, no branching
      throw new ServiceUnavailableException('database unavailable');
    } finally {
      client.release();
    }

    // Minimal ingestion: accept + log. No persistence, no idempotency, no processing.
    logger.info(
      {
        service: 'api',
        event_id: event.event_id,
        event_type: event.event_type,
      },
      'event ingested and job enqueued',
    );

    // Use 202 to signal "accepted for async processing" (even though we don't process yet).
    return { accepted: true };
  }
}
