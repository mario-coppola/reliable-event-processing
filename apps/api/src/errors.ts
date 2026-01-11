export class EventLedgerInsertFailedError extends Error {
  constructor() {
    super('Event ledger insert did not return an id');
    this.name = 'EventLedgerInsertFailedError';
  }
}
