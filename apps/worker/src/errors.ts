export class JobNotFoundError extends Error {
  constructor(public readonly jobId: number) {
    super(`Job ${jobId} not found`);
    this.name = 'JobNotFoundError';
  }
}

export class EventLedgerNotFoundError extends Error {
  constructor(public readonly eventLedgerId: number) {
    super(`Event ledger entry with id ${eventLedgerId} not found`);
    this.name = 'EventLedgerNotFoundError';
  }
}

export class MalformedPayloadError extends Error {
  constructor(public readonly reason: string) {
    super(`Malformed payload: ${reason}`);
    this.name = 'MalformedPayloadError';
  }
}

export class EventLedgerInsertFailedError extends Error {
  constructor() {
    super('Event ledger insert did not return an id');
    this.name = 'EventLedgerInsertFailedError';
  }
}

export class FailpointError extends Error {
  constructor() {
    super('failpoint: simulated transient failure');
    this.name = 'FailpointError';
  }
}
