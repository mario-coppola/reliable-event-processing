export class JobNotFoundError extends Error {
  constructor(public readonly jobId: number) {
    super(`Job with id ${jobId} not found`);
    this.name = 'JobNotFoundError';
  }
}

export class JobInvalidStateError extends Error {
  constructor(
    public readonly jobId: number,
    public readonly currentStatus: string,
    public readonly expectedStatus: string,
  ) {
    super(
      `Job with id ${jobId} is not in ${expectedStatus} status (current status: ${currentStatus})`,
    );
    this.name = 'JobInvalidStateError';
  }
}

export class AuditInsertFailedError extends Error {
  constructor(public readonly jobId: number) {
    super(`Audit insert did not return a result for job ${jobId}`);
    this.name = 'AuditInsertFailedError';
  }
}
