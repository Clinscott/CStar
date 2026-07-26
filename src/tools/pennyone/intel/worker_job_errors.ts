export class WorkerJobControllerError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly retryable = false,
    ) {
        super(message);
        this.name = 'WorkerJobControllerError';
    }
}
