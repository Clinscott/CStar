import crypto from 'node:crypto';
import type {
    ExecutableWorkerJobContract,
    WorkerJobRecord,
    WorkerJobProviderEvidence,
    WorkerJobRepairInput,
    WorkerJobSpendEvidence,
    WorkerJobValidationInput,
} from '../../../types/worker_job.js';
import {
    WORKER_JOB_PROVIDER_REQUEST_CEILING,
    WORKER_JOB_VALIDATION_VERDICTS,
} from '../../../types/worker_job.js';
import { executableWorkerJobContractSchema } from '../../cstar-kernel-mcp/contracts/worker_jobs.js';
import { WorkerJobLedgerError } from './worker_job_errors.js';

const SHA256 = /^[a-f0-9]{64}$/;
const VALIDATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;

export function isSha256(value: string): boolean {
    return SHA256.test(value);
}

export function sha256(value: string | Buffer): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

export function normalizeWorkerJobContract(
    input: ExecutableWorkerJobContract,
): ExecutableWorkerJobContract {
    const parsed = executableWorkerJobContractSchema.safeParse(input);
    if (!parsed.success) {
        throw new WorkerJobLedgerError(
            'WORKER_JOB_CONTRACT_INVALID',
            parsed.error.issues.map((issue) => issue.message).join(' '),
        );
    }
    const contract = parsed.data;
    if (contract.provider_evidence.provider_started
        || contract.provider_evidence.provider_requests_started !== 0
        || contract.spend_evidence.spend_uncertain
        || contract.spend_evidence.known_spend_observed) {
        throw new WorkerJobLedgerError(
            'WORKER_JOB_INITIAL_EVIDENCE_INVALID',
            'A newly queued attempt requires explicit zero-provider and zero-spend evidence.',
        );
    }
    return {
        ...contract,
        objective: contract.objective.trim(),
        expected_artifacts: [...contract.expected_artifacts]
            .sort((left, right) =>
                `${left.artifact_kind}:${left.name}`
                    .localeCompare(`${right.artifact_kind}:${right.name}`)),
    };
}

export function workerJobContractSha256(
    contract: ExecutableWorkerJobContract,
): string {
    return sha256(JSON.stringify(contract));
}

export function requireExecutableAt(
    contract: Pick<ExecutableWorkerJobContract,
        'authorization_expires_at' | 'execution_deadline_at'>,
    now: number,
): void {
    if (!Number.isSafeInteger(now) || now < 0) {
        throw new WorkerJobLedgerError('WORKER_JOB_TIME_INVALID', 'Time must be a nonnegative integer.');
    }
    if (now >= contract.authorization_expires_at) {
        throw new WorkerJobLedgerError(
            'WORKER_JOB_AUTHORIZATION_EXPIRED',
            'Worker-job authorization has expired.',
        );
    }
    if (now >= contract.execution_deadline_at) {
        throw new WorkerJobLedgerError(
            'WORKER_JOB_EXECUTION_DEADLINE_ELAPSED',
            'Worker-job absolute execution deadline has elapsed.',
        );
    }
}

export function validateActiveEvidence(
    attemptId: string,
    provider: WorkerJobProviderEvidence,
    spend: WorkerJobSpendEvidence,
): void {
    if (provider.attempt_id !== attemptId || spend.attempt_id !== attemptId
        || !provider.provider_started
        || !Number.isSafeInteger(provider.provider_requests_started)
        || provider.provider_requests_started < 1
        || provider.provider_requests_started > WORKER_JOB_PROVIDER_REQUEST_CEILING
        || !SHA256.test(provider.evidence_sha256)
        || !SHA256.test(spend.evidence_sha256)) {
        throw new WorkerJobLedgerError(
            'WORKER_JOB_EXECUTION_EVIDENCE_INVALID',
            'Provider and spend evidence must bind the active started attempt.',
        );
    }
}

export function validateMonotonicExecutionEvidence(
    current: WorkerJobRecord,
    provider: WorkerJobProviderEvidence,
    spend: WorkerJobSpendEvidence,
): void {
    validateActiveEvidence(current.attempt_id, provider, spend);
    if (current.provider_evidence.provider_started && !provider.provider_started
        || provider.provider_requests_started < current.provider_evidence.provider_requests_started
        || current.spend_evidence.spend_uncertain && !spend.spend_uncertain
        || current.spend_evidence.known_spend_observed && !spend.known_spend_observed) {
        throw new WorkerJobLedgerError(
            'WORKER_JOB_PROVIDER_SPEND_REGRESSION',
            'Provider and spend evidence may only move forward.',
        );
    }
}

export function normalizeWorkerJobValidation(
    input: WorkerJobValidationInput,
): WorkerJobValidationInput {
    if (!VALIDATION_ID.test(input.validation_id)
        || !SHA256.test(input.evidence_sha256)
        || !(WORKER_JOB_VALIDATION_VERDICTS as readonly string[]).includes(input.verdict)) {
        throw new WorkerJobLedgerError(
            'WORKER_JOB_VALIDATION_INVALID',
            'Validation identity, verdict, or evidence is invalid.',
        );
    }
    return {
        validation_id: input.validation_id,
        verdict: input.verdict,
        evidence_sha256: input.evidence_sha256,
        summary: boundedDetail(input.summary, 512),
    };
}

export function validateRepairInput(input: WorkerJobRepairInput): void {
    if (!input.failure_code.trim() || input.failure_code.length > 80) {
        throw new WorkerJobLedgerError(
            'WORKER_JOB_REPAIR_NOT_ALLOWED',
            'A bounded repair failure code is required.',
        );
    }
}

export function boundedDetail(value: string | undefined, max: number): string | undefined {
    const normalized = value?.trim().replace(/\s+/g, ' ');
    return normalized ? normalized.slice(0, max) : undefined;
}
