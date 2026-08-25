import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import {
    CODEX_HOST_WORKER_JOB_SCHEMA,
    WORKER_JOB_ARTIFACT_KINDS,
    WORKER_JOB_KINDS,
    WORKER_JOB_PROGRESS_PHASES,
    WORKER_JOB_STATES,
} from '../../../types/worker_job.js';
import type {
    CodexHostPathIdentity,
    CodexHostWorkerValidationTicketBinding,
    CodexHostWorkerValidationTicketRequest,
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
const absolutePathSchema = z.string().trim().min(1).max(4_096)
    .refine((value) => path.isAbsolute(value), 'Canonical worker paths must be absolute.');

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

export const legacyExecutableWorkerJobContractSchema = z.object({
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

/** @deprecated Compatibility alias for v1 Hall readers; never dispatches a job. */
export const executableWorkerJobContractSchema = legacyExecutableWorkerJobContractSchema;

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

/**
 * Current v2 host-workflow contract. CStar records this envelope; it never
 * launches cognition, selects a provider, or owns credentials. The older
 * legacyExecutableWorkerJobContractSchema above remains a read-only v1 decoder for
 * historical Hall rows and is not a current dispatch contract.
 */
const codexHostActualIdentitySchema = z.string().trim().min(1).max(256).nullable();
const codexHostTransportSchema = z.literal('codex-host');
const validationTicketSchema = z.string()
    .regex(/^cstar-validation-ticket\.v1\.[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/);
const codexHostPathIdentitySchema: z.ZodType<CodexHostPathIdentity> = z.object({
    path: absolutePathSchema,
    state: z.enum(['missing', 'file', 'directory']),
    resolved_path: absolutePathSchema.nullable(),
    device: z.string().regex(/^[0-9]+$/).nullable(),
    inode: z.string().regex(/^[0-9]+$/).nullable(),
    nlink: z.number().int().positive().nullable(),
    parent_path: absolutePathSchema,
    parent_resolved_path: absolutePathSchema,
    parent_device: z.string().regex(/^[0-9]+$/),
    parent_inode: z.string().regex(/^[0-9]+$/),
    missing_suffix: z.array(z.string().min(1).max(255)).max(256),
}).strict();
const validationTicketBindingSchema: z.ZodType<CodexHostWorkerValidationTicketBinding> = z.object({
    schema: z.literal('cstar.validation_ticket_binding.v1'),
    repository_id: z.string().regex(boundedId),
    bead_id: z.string().regex(boundedId),
    execution_receipt_id: z.string().regex(boundedId),
    attempt_id: z.string().regex(boundedId),
    scope_sha256: digestSchema,
    one_use: z.literal(true),
}).strict();
const codexHostValidationTicketRequestSchema: z.ZodType<CodexHostWorkerValidationTicketRequest> = z.object({
    schema: z.literal('cstar.validation_ticket_request.v1'),
    repository_id: z.string().regex(boundedId),
    bead_id: z.string().regex(boundedId),
    execution_receipt_id: z.string().regex(boundedId),
    attempt_id: z.string().regex(boundedId),
    scope_sha256: digestSchema,
    one_use: z.literal(true),
    expires_at: timestampSchema,
    validator_thread_id: z.string().regex(boundedId).optional(),
    validator_turn_id: z.string().regex(boundedId).optional(),
}).strict();

export const codexHostWorkerJobContractSchema = z.object({
    schema: z.literal(CODEX_HOST_WORKER_JOB_SCHEMA),
    worker_kind: z.enum(WORKER_JOB_KINDS),
    workflow_surface: z.enum(['forge', 'researcher']),
    bead_id: z.string().regex(boundedId),
    decision_id: z.string().regex(boundedId),
    canonical_request_id: z.string().regex(boundedId),
    canonical_request_sha256: digestSchema,
    authorization_id: z.string().regex(boundedId),
    authorization_expires_at: timestampSchema,
    runner_owner: z.literal('codex-host'),
    requested_model: z.literal('gpt-5.6-luna'),
    requested_reasoning: z.literal('max'),
    selector_status: z.literal('enforced'),
    actual_identity: codexHostActualIdentitySchema,
    transport: codexHostTransportSchema,
    cognition_launch: z.literal(false),
    cstar_launch: z.literal(false),
    provider_requests_started: z.literal(0),
    spend_uncertain: z.literal(false).optional(),
    known_spend_observed: z.literal(false).optional(),
    network_accessed: z.literal(false),
    idempotency_key: z.string().regex(idempotencyKey),
    execution_deadline_at: timestampSchema,
    attempt_id: attemptIdSchema,
    objective: z.string().trim().min(1).max(8_000),
    expected_artifacts: z.array(workerJobArtifactExpectationSchema).min(1).max(20),
    dispatch_receipt_sha256: digestSchema,
    job_id: z.string().regex(boundedId).optional(),
    host_launch_required: z.literal(true).optional(),
    project_root: absolutePathSchema.optional(),
    target_paths: z.array(absolutePathSchema).min(1).max(512).optional(),
    output_paths: z.array(absolutePathSchema).max(256).optional(),
    /** Read-only decoder for the first SET-03 draft; Forge emits output_paths. */
    required_output_paths: z.array(absolutePathSchema).max(256).optional(),
    target_paths_sha256: digestSchema.optional(),
    path_identity_bindings: z.array(codexHostPathIdentitySchema).min(1).max(768).optional(),
    validation_ticket_binding: validationTicketBindingSchema.optional(),
    validation_ticket_request: codexHostValidationTicketRequestSchema.optional(),
    validation_ticket: validationTicketSchema.optional(),
}).strict().superRefine((contract, context) => {
    if (contract.workflow_surface !== contract.worker_kind) {
        context.addIssue({
            code: 'custom',
            path: ['workflow_surface'],
            message: 'Workflow surface must match the worker kind.',
        });
    }
    if (contract.execution_deadline_at > contract.authorization_expires_at) {
        context.addIssue({
            code: 'custom',
            path: ['execution_deadline_at'],
            message: 'Execution deadline cannot outlive authorization.',
        });
    }
    for (const field of ['target_paths', 'output_paths', 'required_output_paths'] as const) {
        const values = contract[field];
        if (!values) continue;
        const seen = new Set<string>();
        values.forEach((value, index) => {
            if (seen.has(value)) {
                context.addIssue({
                    code: 'custom',
                    path: [field, index],
                    message: `${field} must not contain duplicates.`,
                });
            }
            seen.add(value);
        });
    }
    if (contract.validation_ticket_request
        && contract.validation_ticket_request.attempt_id !== contract.attempt_id) {
        context.addIssue({
            code: 'custom',
            path: ['validation_ticket_request', 'attempt_id'],
            message: 'Validation ticket request must bind the active attempt.',
        });
    }
    if (contract.output_paths && contract.required_output_paths
        && JSON.stringify(contract.output_paths) !== JSON.stringify(contract.required_output_paths)) {
        context.addIssue({
            code: 'custom',
            path: ['output_paths'],
            message: 'output_paths and its compatibility alias must bind the same paths.',
        });
    }
    if (contract.spend_uncertain || contract.known_spend_observed) {
        context.addIssue({
            code: 'custom',
            path: ['spend_uncertain'],
            message: 'A newly persisted host handoff cannot claim spend or spend uncertainty.',
        });
    }
    if (contract.project_root) {
        const root = path.resolve(contract.project_root);
        for (const field of ['target_paths', 'output_paths'] as const) {
            for (const [index, candidate] of (contract[field] ?? []).entries()) {
                const relative = path.relative(root, candidate);
                if (relative === '..' || relative.startsWith(`..${path.sep}`)
                    || path.isAbsolute(relative)) {
                    context.addIssue({
                        code: 'custom',
                        path: [field, index],
                        message: `${field} must be contained by project_root.`,
                    });
                }
            }
        }
    }
    if (contract.target_paths && contract.target_paths_sha256) {
        const digest = createHash('sha256')
            .update(JSON.stringify(contract.target_paths), 'utf8').digest('hex');
        if (digest !== contract.target_paths_sha256) {
            context.addIssue({
                code: 'custom',
                path: ['target_paths_sha256'],
                message: 'target_paths_sha256 must bind the canonical target_paths array.',
            });
        }
    }
    const declaredPaths = new Set([
        ...(contract.target_paths ?? []),
        ...(contract.output_paths ?? []),
    ]);
    if (declaredPaths.size > 0) {
        const bindings = contract.path_identity_bindings;
        if (!bindings || bindings.length !== declaredPaths.size) {
            context.addIssue({
                code: 'custom',
                path: ['path_identity_bindings'],
                message: 'Current host paths require one identity binding per target or output path.',
            });
        } else {
            const boundPaths = new Set<string>();
            for (const [index, binding] of bindings.entries()) {
                if (boundPaths.has(binding.path) || !declaredPaths.has(binding.path)) {
                    context.addIssue({
                        code: 'custom',
                        path: ['path_identity_bindings', index],
                        message: 'Path identity bindings must exactly cover the target and output paths.',
                    });
                }
                boundPaths.add(binding.path);
                if (binding.state === 'missing') {
                    if (binding.resolved_path !== null || binding.device !== null
                        || binding.inode !== null || binding.nlink !== null
                        || binding.missing_suffix.length === 0) {
                        context.addIssue({
                            code: 'custom',
                            path: ['path_identity_bindings', index],
                            message: 'Missing paths must bind an absent suffix and no final identity.',
                        });
                    }
                } else if (binding.resolved_path !== binding.path
                    || binding.device === null || binding.inode === null
                    || binding.missing_suffix.length !== 0
                    || (binding.state === 'file' && binding.nlink !== 1)
                    || (binding.state === 'directory' && binding.nlink !== null)) {
                    context.addIssue({
                        code: 'custom',
                        path: ['path_identity_bindings', index],
                        message: 'Existing paths must bind their canonical device/inode identity.',
                    });
                }
            }
            if (boundPaths.size !== declaredPaths.size) {
                context.addIssue({
                    code: 'custom',
                    path: ['path_identity_bindings'],
                    message: 'Path identity bindings must exactly cover the target and output paths.',
                });
            }
        }
    }
    const binding = contract.validation_ticket_binding;
    const ticketRequest = contract.validation_ticket_request;
    if (binding && (binding.bead_id !== contract.bead_id
        || binding.attempt_id !== contract.attempt_id
        || (contract.target_paths_sha256 !== undefined
            && binding.scope_sha256 !== contract.target_paths_sha256))) {
        context.addIssue({
            code: 'custom',
            path: ['validation_ticket_binding'],
            message: 'Validation ticket binding must match the Forge bead, attempt, and target scope.',
        });
    }
    if (ticketRequest && (ticketRequest.bead_id !== contract.bead_id
        || ticketRequest.attempt_id !== contract.attempt_id
        || (contract.target_paths_sha256 !== undefined
            && ticketRequest.scope_sha256 !== contract.target_paths_sha256))) {
        context.addIssue({
            code: 'custom',
            path: ['validation_ticket_request'],
            message: 'Validation ticket request must match the Forge bead, attempt, and target scope.',
        });
    }
    if (binding && ticketRequest
        && (binding.repository_id !== ticketRequest.repository_id
            || binding.bead_id !== ticketRequest.bead_id
            || binding.execution_receipt_id !== ticketRequest.execution_receipt_id
            || binding.attempt_id !== ticketRequest.attempt_id
            || binding.scope_sha256 !== ticketRequest.scope_sha256)) {
        context.addIssue({
            code: 'custom',
            path: ['validation_ticket_request'],
            message: 'Validation ticket request must preserve the durable binding.',
        });
    }
});

export const codexHostWorkerReceiptSchema = z.object({
    schema: z.literal('cstar.codex_host_worker_receipt.v2'),
    job_id: z.string().regex(boundedId),
    attempt_id: attemptIdSchema,
    worker_kind: z.enum(WORKER_JOB_KINDS),
    runner_owner: z.literal('codex-host'),
    requested_model: z.literal('gpt-5.6-luna'),
    requested_reasoning: z.literal('max'),
    selector_status: z.literal('enforced'),
    actual_identity: codexHostActualIdentitySchema,
    transport: codexHostTransportSchema,
    provider_requests_started: z.literal(0),
    network_accessed: z.literal(false),
    cognition_launch: z.literal(false),
    evidence_sha256: digestSchema,
}).strict();

export type CodexHostWorkerJobContract = z.infer<typeof codexHostWorkerJobContractSchema>;
export type CodexHostWorkerReceipt = z.infer<typeof codexHostWorkerReceiptSchema>;
