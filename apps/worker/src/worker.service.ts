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
      // No business logic - just mark as done
      await this.sleep(200);
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

