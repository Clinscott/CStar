export const WORKER_JOB_ERROR_CODES = [
    'WORKER_JOB_DISPATCH_STATE_INVALID',
    'WORKER_JOB_DISPATCH_FROZEN',
    'WORKER_JOB_ATTEMPT_CEILING_EXCEEDED',
    'WORKER_JOB_RETRY_CEILING_EXCEEDED',
    'WORKER_JOB_PROVIDER_SPEND_REGRESSION',
    'WORKER_JOB_VALIDATION_INVALID',
    'WORKER_JOB_VALIDATION_STATE_INVALID',
    'WORKER_JOB_VALIDATION_CONFLICT',
    'WORKER_JOB_REPAIR_NOT_ALLOWED',
] as const;

export class WorkerJobLedgerError extends Error {
    constructor(
        public readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = 'WorkerJobLedgerError';
    }
}
