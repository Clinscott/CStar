import {
    WORKER_ARTIFACT_KINDS,
    WORKER_JOB_PROGRESS_PHASES,
    WORKER_KINDS,
    type CreateWorkerJobInput,
    type WorkerJobProgressPhase,
} from '../../../types/worker_job.js';
import { WorkerJobControllerError } from './worker_job_errors.js';

const SAFE_LOGICAL_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_ARTIFACT_NAME = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const SAFE_LEASE_OWNER = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/;
const MAX_LEASE_DURATION_MS = 15 * 60_000;

export function validateCreateWorkerJobInput(input: CreateWorkerJobInput): void {
    if (!(WORKER_KINDS as readonly string[]).includes(input.worker_kind)) {
        throw new WorkerJobControllerError('WORKER_KIND_INVALID', 'Worker kind is outside the protected registry.');
    }
    const objective = input.objective?.trim();
    if (!objective || objective.length > 8_000) {
        throw new WorkerJobControllerError('OBJECTIVE_INVALID', 'Worker objective must contain 1 to 8000 characters.');
    }
    if (!SAFE_LOGICAL_REF.test(input.workspace_ref) || input.workspace_ref.includes('..')) {
        throw new WorkerJobControllerError('WORKSPACE_REF_INVALID', 'Workspace reference must be a bounded logical identifier.');
    }
    if (!SAFE_IDEMPOTENCY_KEY.test(input.idempotency_key)) {
        throw new WorkerJobControllerError('IDEMPOTENCY_KEY_INVALID', 'Idempotency key is outside the bounded contract.');
    }
    if (input.expected_artifacts.length < 1 || input.expected_artifacts.length > 20) {
        throw new WorkerJobControllerError('ARTIFACT_CONTRACT_INVALID', 'Expected artifacts must contain 1 to 20 entries.');
    }
    const seen = new Set<string>();
    for (const artifact of input.expected_artifacts) {
        const key = `${artifact.artifact_kind}\0${artifact.name.trim()}`;
        if (!SAFE_ARTIFACT_NAME.test(artifact.name)
            || !(WORKER_ARTIFACT_KINDS as readonly string[]).includes(artifact.artifact_kind)
            || seen.has(key)) {
            throw new WorkerJobControllerError(
                'ARTIFACT_CONTRACT_INVALID',
                'Expected artifacts must be unique, bounded logical names and kinds.',
            );
        }
        seen.add(key);
    }
}

export function validateLeaseDuration(leaseDurationMs: number): void {
    if (!Number.isSafeInteger(leaseDurationMs)
        || leaseDurationMs < 1_000
        || leaseDurationMs > MAX_LEASE_DURATION_MS) {
        throw new WorkerJobControllerError(
            'LEASE_DURATION_INVALID',
            'Worker lease duration must be an integer from 1000 to 900000 milliseconds.',
        );
    }
}

export function validateLeaseRequest(leaseOwnerId: string, leaseDurationMs: number): void {
    if (!SAFE_LEASE_OWNER.test(leaseOwnerId)) {
        throw new WorkerJobControllerError('LEASE_OWNER_INVALID', 'Worker lease owner is outside the bounded contract.');
    }
    validateLeaseDuration(leaseDurationMs);
}

export function validateWorkerJobProgress(
    percent: number,
    phase: Exclude<WorkerJobProgressPhase, 'queued' | 'complete'>,
): void {
    const validPhases = WORKER_JOB_PROGRESS_PHASES
        .filter((candidate) => candidate !== 'queued' && candidate !== 'complete');
    if (!Number.isSafeInteger(percent)
        || percent < 0
        || percent > 99
        || !validPhases.includes(phase)) {
        throw new WorkerJobControllerError(
            'INVALID_PROGRESS',
            'Progress must use an integer from 0 to 99 and an active worker phase.',
        );
    }
}
