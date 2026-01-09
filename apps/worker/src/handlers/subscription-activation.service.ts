import { Injectable } from '@nestjs/common';
import { logger } from '@pkg/shared';
import { db } from '../db';
import type { Job } from '../jobs/job.types';

@Injectable()
export class SubscriptionActivationService {
  /**
   * Processes a subscription.paid event:
   * - Loads raw_payload from event_ledger
   * - Applies idempotent activation effect via UNIQUE idempotency_key
   * - Handles duplicate effects gracefully (23505 constraint violation)
   */
  async processSubscriptionPaid(job: Job): Promise<void> {
    const client = await db.connect();
    try {
      // Load raw payload from event_ledger
      const ledgerResult = await client.query<{ raw_payload: unknown }>(
        'SELECT raw_payload FROM event_ledger WHERE id = $1',
        [job.event_ledger_id],
      );

      if (ledgerResult.rows.length === 0) {
        throw new Error('event_ledger entry not found');
      }

      const rawPayload = ledgerResult.rows[0].raw_payload;
      if (
        typeof rawPayload !== 'object' ||
        rawPayload === null ||
        !('payload' in rawPayload) ||
        typeof rawPayload.payload !== 'object' ||
        rawPayload.payload === null ||
        !('subscription_id' in rawPayload.payload) ||
        typeof rawPayload.payload.subscription_id !== 'string'
      ) {
        throw new Error('malformed payload: missing subscription_id');
      }

      const subscriptionId = rawPayload.payload.subscription_id;
      const idempotencyKey = `activate_subscription:${subscriptionId}`;

      // Insert with status 'pending'
      try {
        await client.query(
          `
          INSERT INTO subscription_activations (idempotency_key, subscription_id, status)
          VALUES ($1, $2, 'pending')
          `,
          [idempotencyKey, subscriptionId],
        );

        // Update to 'succeeded'
        await client.query(
          `
          UPDATE subscription_activations
          SET status = 'succeeded', updated_at = NOW()
          WHERE idempotency_key = $1
          `,
          [idempotencyKey],
        );

        logger.info(
          {
            service: 'worker',
            job_id: job.id,
            subscription_id: subscriptionId,
          },
          'effect applied',
        );
      } catch (insertError: unknown) {
        // Check for unique constraint violation (PostgreSQL error code 23505)
        if (
          insertError &&
          typeof insertError === 'object' &&
          'code' in insertError &&
          insertError.code === '23505'
        ) {
          logger.info(
            {
              service: 'worker',
              job_id: job.id,
              subscription_id: subscriptionId,
            },
            'duplicate effect',
          );
          return;
        }

        // Real error - try to mark as failed
        const errorMessage =
          insertError instanceof Error
            ? insertError.message
            : String(insertError);
        try {
          await client.query(
            `
            INSERT INTO subscription_activations (idempotency_key, subscription_id, status, error_message)
            VALUES ($1, $2, 'failed', $3)
            ON CONFLICT (idempotency_key) DO UPDATE
            SET status = 'failed', error_message = $3, updated_at = NOW()
            `,
            [idempotencyKey, subscriptionId, errorMessage],
          );
        } catch {
          // ignore persistence errors, throw original error
        }

        logger.error(
          {
            service: 'worker',
            job_id: job.id,
            subscription_id: subscriptionId,
            error: insertError,
          },
          'effect failed',
        );
        throw insertError;
      }
    } finally {
      client.release();
    }
  }
}
