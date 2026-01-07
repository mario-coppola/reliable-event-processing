import { Injectable, OnModuleInit } from "@nestjs/common";
import { logger } from "@pkg/shared";
import { db } from "./db";

type Job = {
  id: number;
  status: string;
  event_ledger_id: number;
  event_type: string;
  external_event_id: string;
  created_at: Date;
};

@Injectable()
export class WorkerService implements OnModuleInit {
  private isRunning = false;
  private readonly POLL_INTERVAL_MS = 750;
  private isIdle = false;
  private isErrorIdle = false;

  async onModuleInit() {
    this.isRunning = true;
    logger.info({ service: "worker" }, "worker started");
    this.poll();
  }

  private async poll() {
    while (this.isRunning) {
      try {
        const job = await this.claimJob();
        if (job) {
          this.isIdle = false;
          this.isErrorIdle = false;
          await this.processJob(job);
        } else {
          if (!this.isIdle) {
            logger.info({ service: "worker" }, "no jobs available");
            this.isIdle = true;
          }
          this.isErrorIdle = false;
          await this.sleep(this.POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (!this.isErrorIdle) {
          logger.error({ service: "worker", error }, "error in poll loop");
          this.isErrorIdle = true;
        }
        this.isIdle = false;
        await this.sleep(this.POLL_INTERVAL_MS);
      }
    }
  }

  private async claimJob(): Promise<Job | null> {
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const result = await client.query<Job>(
        `
        SELECT id, status, event_ledger_id, event_type, external_event_id, created_at
        FROM jobs
        WHERE status = 'queued'
        ORDER BY id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
        `
      );

      if (result.rows.length === 0) {
        await client.query("COMMIT");
        return null;
      }

      const job = result.rows[0];
      await client.query("UPDATE jobs SET status = 'in_progress' WHERE id = $1", [
        job.id,
      ]);

      await client.query("COMMIT");
      logger.info(
        { service: "worker", job_id: job.id, event_type: job.event_type },
        "job claimed"
      );
      return job;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {
        // ignore rollback errors
      });
      throw error;
    } finally {
      client.release();
    }
  }

    private async processJob(job: Job) {
      try {
        if (job.event_type !== "subscription.paid") {
          await this.sleep(200);
          await this.updateJobStatus(job.id, "done");
          logger.info(
            { service: "worker", job_id: job.id, event_type: job.event_type },
            "job skipped (irrelevant event_type)"
          );
          return;
        }

        await this.processSubscriptionPaid(job);
        await this.updateJobStatus(job.id, "done");
        logger.info(
          { service: "worker", job_id: job.id, event_type: job.event_type },
          "job completed"
        );
      } catch (error) {
        await this.updateJobStatus(job.id, "failed");
        logger.error(
          { service: "worker", job_id: job.id, event_type: job.event_type, error },
          "job failed"
        );
      }
    }

  private async processSubscriptionPaid(job: Job) {
    const client = await db.connect();
    try {
      // Load raw payload from event_ledger
      const ledgerResult = await client.query<{ raw_payload: unknown }>(
        "SELECT raw_payload FROM event_ledger WHERE id = $1",
        [job.event_ledger_id]
      );

      if (ledgerResult.rows.length === 0) {
        throw new Error("event_ledger entry not found");
      }

      const rawPayload = ledgerResult.rows[0].raw_payload;
      if (
        typeof rawPayload !== "object" ||
        rawPayload === null ||
        !("payload" in rawPayload) ||
        typeof rawPayload.payload !== "object" ||
        rawPayload.payload === null ||
        !("subscription_id" in rawPayload.payload) ||
        typeof rawPayload.payload.subscription_id !== "string"
      ) {
        throw new Error("malformed payload: missing subscription_id");
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
          [idempotencyKey, subscriptionId]
        );

        // Update to 'succeeded'
        await client.query(
          `
          UPDATE subscription_activations
          SET status = 'succeeded', updated_at = NOW()
          WHERE idempotency_key = $1
          `,
          [idempotencyKey]
        );

        logger.info(
          {
            service: "worker",
            job_id: job.id,
            subscription_id: subscriptionId,
          },
          "effect applied"
        );
      } catch (insertError: unknown) {
        // Check for unique constraint violation (PostgreSQL error code 23505)
        if (
          insertError &&
          typeof insertError === "object" &&
          "code" in insertError &&
          insertError.code === "23505"
        ) {
          logger.info(
            {
              service: "worker",
              job_id: job.id,
              subscription_id: subscriptionId,
            },
            "duplicate effect"
          );
          return;
        }

        // Real error - try to mark as failed
        const errorMessage =
          insertError instanceof Error ? insertError.message : String(insertError);
        try {
          await client.query(
            `
            INSERT INTO subscription_activations (idempotency_key, subscription_id, status, error_message)
            VALUES ($1, $2, 'failed', $3)
            ON CONFLICT (idempotency_key) DO UPDATE
            SET status = 'failed', error_message = $3, updated_at = NOW()
            `,
            [idempotencyKey, subscriptionId, errorMessage]
          );
        } catch {
          // ignore persistence errors, throw original error
        }

        logger.error(
          {
            service: "worker",
            job_id: job.id,
            subscription_id: subscriptionId,
            error: insertError,
          },
          "effect failed"
        );
        throw insertError;
      }
    } finally {
      client.release();
    }
  }

  private async updateJobStatus(jobId: number, status: "done" | "failed") {
    const client = await db.connect();
    try {
      await client.query("UPDATE jobs SET status = $1 WHERE id = $2", [
        status,
        jobId,
      ]);
    } finally {
      client.release();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async stop() {
    this.isRunning = false;
    this.isErrorIdle = false;
    this.isIdle = false;
  }
}

