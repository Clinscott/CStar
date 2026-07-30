import { z } from 'zod';
import {
    WORKER_JOB_ARTIFACT_KINDS,
    WORKER_JOB_KINDS,
    WORKER_JOB_PROGRESS_PHASES,
    WORKER_JOB_STATES,
} from '../../../types/worker_job.js';

export const WORKER_JOB_LEDGER_ENABLE_ENV =
    'CSTAR_KERNEL_ENABLE_SUBORDINATE_WORKER_JOBS';

const boundedId = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const idempotencyKey = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/;
const artifactName = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/;
const sha256 = /^[a-f0-9]{64}$/;

const timestampSchema = z.number().int().nonnegative();
const digestSchema = z.string().regex(sha256);
const attemptIdSchema = z.string().regex(boundedId);

export const workerJobArtifactExpectationSchema = z.object({
    name: z.string().regex(artifactName),
    artifact_kind: z.enum(WORKER_JOB_ARTIFACT_KINDS),
    required: z.boolean(),
}).strict();

export const workerJobProviderEvidenceSchema = z.object({
    attempt_id: attemptIdSchema,
    provider_started: z.boolean(),
    provider_requests_started: z.number().int().nonnegative(),
    observed_at: timestampSchema,
    evidence_sha256: digestSchema,
}).strict().superRefine((evidence, context) => {
    if (evidence.provider_started !== (evidence.provider_requests_started > 0)) {
        context.addIssue({
            code: 'custom',
            message: 'provider_started must agree with provider_requests_started.',
        });
    }
});

export const workerJobSpendEvidenceSchema = z.object({
    attempt_id: attemptIdSchema,
    spend_uncertain: z.boolean(),
    known_spend_observed: z.boolean(),
    observed_at: timestampSchema,
    evidence_sha256: digestSchema,
}).strict();

export const executableWorkerJobContractSchema = z.object({
    worker_kind: z.enum(WORKER_JOB_KINDS),
    bead_id: z.string().regex(boundedId),
    decision_id: z.string().regex(boundedId),
    canonical_request_id: z.string().regex(boundedId),
    canonical_request_sha256: digestSchema,
    authorization_id: z.string().regex(boundedId),
    authorization_expires_at: timestampSchema,
    adapter_runtime_binding_sha256: digestSchema,
    idempotency_key: z.string().regex(idempotencyKey),
    execution_deadline_at: timestampSchema,
    attempt_id: attemptIdSchema,
    objective: z.string().trim().min(1).max(8_000),
    expected_artifacts: z.array(workerJobArtifactExpectationSchema).min(1).max(20),
    provider_evidence: workerJobProviderEvidenceSchema,
    spend_evidence: workerJobSpendEvidenceSchema,
}).strict().superRefine((contract, context) => {
    if (contract.execution_deadline_at > contract.authorization_expires_at) {
        context.addIssue({
            code: 'custom',
            path: ['execution_deadline_at'],
            message: 'Execution deadline cannot outlive authorization.',
        });
    }
    if (contract.provider_evidence.attempt_id !== contract.attempt_id
        || contract.spend_evidence.attempt_id !== contract.attempt_id) {
        context.addIssue({
            code: 'custom',
            path: ['attempt_id'],
            message: 'All execution evidence must bind the same attempt identity.',
        });
    }
    const seen = new Set<string>();
    contract.expected_artifacts.forEach((artifact, index) => {
        const key = `${artifact.artifact_kind}\0${artifact.name}`;
        if (seen.has(key)) {
            context.addIssue({
                code: 'custom',
                path: ['expected_artifacts', index],
                message: 'Expected artifact names and kinds must be unique.',
            });
        }
        seen.add(key);
    });
});

export const workerJobZeroProviderProofSchema = z.object({
    attempt_id: attemptIdSchema,
    provider_requests_started: z.literal(0),
    known_spend_observed: z.literal(false),
    spend_uncertain: z.literal(false),
    observed_at: timestampSchema,
    evidence_sha256: digestSchema,
}).strict();

export const workerJobRecordSchema = executableWorkerJobContractSchema.extend({
    job_id: z.string().regex(boundedId),
    contract_sha256: digestSchema,
    state: z.enum(WORKER_JOB_STATES),
    progress_percent: z.number().int().min(0).max(100),
    progress_phase: z.enum(WORKER_JOB_PROGRESS_PHASES),
    cancel_requested_at: timestampSchema.optional(),
    cancel_reason: z.string().max(500).optional(),
    failure_code: z.string().max(80).optional(),
    failure_summary: z.string().max(512).optional(),
    version: z.number().int().positive(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
    terminal_at: timestampSchema.optional(),
}).strict();

export type ExecutableWorkerJobArgs =
    z.infer<typeof executableWorkerJobContractSchema>;

export function isSubordinateWorkerJobLedgerEnabled(
    env: NodeJS.ProcessEnv = process.env,
): boolean {
    return env[WORKER_JOB_LEDGER_ENABLE_ENV] === '1';
}
