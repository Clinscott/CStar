import path from 'node:path';
import { z } from 'zod';

import {
    RESEARCHER_AUTHORITY_BINDING_SCHEMA,
    RESEARCHER_HOST_COMPLETION_SCHEMA,
    RESEARCHER_NATIVE_WORK_PACKAGE_SCHEMA,
    RESEARCHER_REQUEST_SCHEMA,
    RESEARCHER_TERMINAL_RECEIPT_SCHEMA,
    RESEARCHER_VALIDATION_RECEIPT_SCHEMA,
    RESEARCHER_VALIDATION_SUBJECT_SCHEMA,
} from '../../../types/worker_job.js';
import { codexHostWorkerJobContractSchema } from './worker_jobs.js';

const DIGEST = /^[a-f0-9]{64}$/;
const BOUNDED_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/;
const ABSOLUTE_PATH = z.string().trim().min(1).max(4_096).refine(
    (value) => path.isAbsolute(value) && path.resolve(value) === value,
    'Researcher paths must be canonical absolute paths.',
);
const SHA256 = z.string().regex(DIGEST);

export const researcherSelectorSchema = z.object({
    requested_model: z.literal('gpt-5.6-luna'),
    requested_reasoning: z.literal('max'),
    selector_status: z.literal('enforced'),
    actual_identity: z.string().trim().min(1).max(256),
}).strict();

export const researcherSourceGrantSchema = z.object({
    tool_capability_id: z.string().regex(BOUNDED_ID),
    tool_schema_sha256: SHA256,
    source_scope: z.string().trim().min(1).max(4_096),
    max_queries: z.number().int().nonnegative().max(8),
    max_items: z.number().int().nonnegative().max(128),
    max_tool_calls: z.number().int().nonnegative().max(8),
    expires_at: z.number().int().positive(),
}).strict();

export const researcherSourceBudgetSchema = z.object({
    max_queries: z.number().int().nonnegative().max(8),
    max_items: z.number().int().nonnegative().max(128),
    max_tool_calls: z.number().int().nonnegative().max(8),
    max_provider_requests: z.number().int().nonnegative().max(1),
}).strict();

export const researcherAdapterBindingSchema = z.object({
    adapter_id: z.literal('cstar.researcher_preserved_adapter.v1'),
    adapter_sha256: SHA256,
    selected_source_manifest_sha256: SHA256,
    callable_policy_sha256: SHA256,
}).strict();

export const researcherOutputBoundarySchema = z.object({
    root: ABSOLUTE_PATH.nullable(),
    allowed_paths: z.array(ABSOLUTE_PATH).max(64),
    public_artifact_paths: z.array(ABSOLUTE_PATH).max(64),
}).strict().superRefine((value, context) => {
    const all = [...value.allowed_paths, ...value.public_artifact_paths];
    if (new Set(all).size !== all.length) {
        context.addIssue({ code: 'custom', path: ['allowed_paths'], message: 'Output paths must be unique.' });
    }
    if (value.root) {
        all.forEach((candidate, index) => {
            const relative = path.relative(value.root!, candidate);
            if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
                context.addIssue({ code: 'custom', path: ['allowed_paths', index], message: 'Output path escapes root.' });
            }
        });
    }
});

export const researcherArtifactExpectationSchema = z.object({
    name: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._ -]*$/),
    artifact_kind: z.enum(['report', 'package', 'test_result', 'other']),
    required: z.boolean(),
}).strict();

export const researcherMetricSchema = z.object({
    name: z.string().trim().min(1).max(240),
    threshold: z.string().trim().min(1).max(240),
    acceptance_rule: z.string().trim().max(1_000).optional(),
    unit: z.string().trim().max(80).optional(),
}).strict();

export const researcherSpendPolicySchema = z.object({
    mode: z.enum(['no_spend', 'live_authorized']),
    live_source_allowed: z.boolean(),
    max_retries: z.literal(0),
}).strict();

export const researcherRetryPolicySchema = z.object({
    budget: z.literal(0),
    spent: z.literal(0),
    repairs: z.literal(0),
    replays: z.literal(0),
    fallbacks: z.literal(0),
}).strict();

/** Strict canonical request. Hash/id fields are optional derived projections. */
export const researcherRequestSchema = z.object({
    schema: z.literal(RESEARCHER_REQUEST_SCHEMA),
    contract_version: z.string().trim().min(1).max(64),
    request_id: z.string().regex(BOUNDED_ID).optional(),
    request_sha256: SHA256.optional(),
    bead_id: z.string().regex(BOUNDED_ID),
    set_id: z.string().regex(BOUNDED_ID),
    decision_id: z.string().regex(BOUNDED_ID),
    authorization_id: z.string().regex(BOUNDED_ID),
    authorization_sha256: SHA256,
    authorization_expires_at: z.number().int().positive(),
    source_callback_thread_id: z.string().trim().min(1).max(256),
    objective: z.string().trim().min(1).max(8_000),
    research_questions: z.array(z.string().trim().min(1).max(2_000)).min(1).max(32),
    target_spokes: z.array(z.string().trim().min(1).max(256)).max(32),
    primary_requested_action: z.literal('report'),
    source_grants: z.array(researcherSourceGrantSchema).max(16),
    source_budget: researcherSourceBudgetSchema,
    spend_policy: researcherSpendPolicySchema,
    retry_policy: researcherRetryPolicySchema,
    selector: researcherSelectorSchema,
    adapter_binding: researcherAdapterBindingSchema,
    output_boundary: researcherOutputBoundarySchema,
    expected_artifacts: z.array(researcherArtifactExpectationSchema).min(1).max(20),
    metrics: z.array(researcherMetricSchema).min(1).max(32),
    prohibitions: z.array(z.string().trim().min(1).max(240)).min(1).max(64),
    idempotency_key: z.string().regex(IDEMPOTENCY),
}).strict().superRefine((request, context) => {
    if (request.spend_policy.mode === 'no_spend'
        && (request.spend_policy.live_source_allowed || request.source_grants.length > 0)) {
        context.addIssue({ code: 'custom', path: ['source_grants'], message: 'No-spend requests cannot carry live source grants.' });
    }
    if (request.spend_policy.live_source_allowed && request.source_grants.length === 0) {
        context.addIssue({ code: 'custom', path: ['source_grants'], message: 'Live source requests require a source grant.' });
    }
    if (request.selector.actual_identity !== 'unreported') {
        context.addIssue({ code: 'custom', path: ['selector', 'actual_identity'], message: 'Request identity must remain unreported until host attestation.' });
    }
});

export const researcherAuthorityBindingSchema = z.object({
    schema: z.literal(RESEARCHER_AUTHORITY_BINDING_SCHEMA),
    request_id: z.string().regex(BOUNDED_ID),
    request_sha256: SHA256,
    bead_id: z.string().regex(BOUNDED_ID),
    set_id: z.string().regex(BOUNDED_ID),
    decision_id: z.string().regex(BOUNDED_ID),
    authorization_id: z.string().regex(BOUNDED_ID),
    authorization_sha256: SHA256,
    expires_at: z.number().int().positive(),
    action: z.literal('report'),
    one_use: z.literal(true),
}).strict();

export const researcherNativeWorkPackageSchema = z.object({
    schema: z.literal(RESEARCHER_NATIVE_WORK_PACKAGE_SCHEMA),
    request_id: z.string().regex(BOUNDED_ID),
    request_sha256: SHA256,
    job_id: z.string().regex(BOUNDED_ID),
    attempt_id: z.string().regex(BOUNDED_ID),
    authority: researcherAuthorityBindingSchema,
    request: researcherRequestSchema,
    adapter_binding: researcherAdapterBindingSchema,
    output_boundary: researcherOutputBoundarySchema,
    selector: researcherSelectorSchema,
    actual_identity: z.literal('unreported'),
    max_host_attempts: z.literal(1),
    max_descendants: z.literal(0),
    max_peer_messages: z.literal(0),
    max_retries: z.literal(0),
    max_replays: z.literal(0),
    max_fallbacks: z.literal(0),
    terminal_schema: z.literal(RESEARCHER_TERMINAL_RECEIPT_SCHEMA),
}).strict().superRefine((value, context) => {
    if (value.request.request_id && value.request.request_id !== value.request_id) {
        context.addIssue({ code: 'custom', path: ['request', 'request_id'], message: 'Work package request id drifted.' });
    }
    if (value.request.request_sha256 && value.request.request_sha256 !== value.request_sha256) {
        context.addIssue({ code: 'custom', path: ['request', 'request_sha256'], message: 'Work package request hash drifted.' });
    }
    if (value.authority.request_id !== value.request_id || value.authority.request_sha256 !== value.request_sha256
        || value.authority.bead_id !== value.request.bead_id || value.authority.set_id !== value.request.set_id) {
        context.addIssue({ code: 'custom', path: ['authority'], message: 'Authority binding does not match the request.' });
    }
});

export const researcherTerminalReceiptSchema = z.object({
    schema: z.literal(RESEARCHER_TERMINAL_RECEIPT_SCHEMA),
    request_id: z.string().regex(BOUNDED_ID),
    request_sha256: SHA256,
    job_id: z.string().regex(BOUNDED_ID),
    attempt_id: z.string().regex(BOUNDED_ID),
    host_task_id: z.string().regex(BOUNDED_ID),
    outcome: z.enum(['DELIVERED_UNVERIFIED', 'REJECTED', 'UNKNOWN']),
    requested_model: z.literal('gpt-5.6-luna'),
    requested_reasoning: z.literal('max'),
    selector_status: z.literal('enforced'),
    actual_identity: z.string().trim().min(1).max(256),
    worker_attempts_started: z.literal(1),
    worker_attempts_terminal: z.literal(1),
    provider_requests_started: z.number().int().nonnegative().max(1),
    source_tool_calls: z.number().int().nonnegative().max(8),
    retries: z.literal(0),
    replays: z.literal(0),
    fallbacks: z.literal(0),
    descendants: z.literal(0),
    peer_messages: z.literal(0),
    output_manifest_sha256: SHA256,
    adapter_sha256: SHA256,
    selected_source_manifest_sha256: SHA256,
    callable_policy_sha256: SHA256,
    source_grants_sha256: SHA256,
    source_budget_sha256: SHA256,
    observed_at: z.number().int().nonnegative(),
    elapsed_ms: z.number().int().nonnegative(),
}).strict().superRefine((receipt, context) => {
    if (receipt.actual_identity !== 'unreported' && receipt.actual_identity.trim().length === 0) {
        context.addIssue({ code: 'custom', path: ['actual_identity'], message: 'Actual identity must be unreported or host-attested.' });
    }
    if (receipt.outcome === 'DELIVERED_UNVERIFIED' && receipt.provider_requests_started < 1) {
        context.addIssue({ code: 'custom', path: ['provider_requests_started'], message: 'Delivered Researcher work requires one provider start.' });
    }
});

export const researcherArtifactManifestSchema = z.object({
    schema: z.literal('cstar.researcher_artifact_manifest.v1'),
    artifacts: z.array(z.object({
        path: ABSOLUTE_PATH,
        sha256: SHA256,
        byte_count: z.number().int().positive().max(64 * 1024 * 1024),
        name: z.string().trim().min(1).max(128),
        artifact_kind: z.enum(['report', 'package', 'test_result', 'other']),
    }).strict()).min(1).max(32),
    total_bytes: z.number().int().positive().max(64 * 1024 * 1024),
}).strict().superRefine((manifest, context) => {
    const bytes = manifest.artifacts.reduce((total, artifact) => total + artifact.byte_count, 0);
    if (bytes !== manifest.total_bytes) context.addIssue({ code: 'custom', path: ['total_bytes'], message: 'Artifact bytes do not reconcile.' });
    const paths = manifest.artifacts.map((artifact) => artifact.path);
    if (new Set(paths).size !== paths.length) context.addIssue({ code: 'custom', path: ['artifacts'], message: 'Artifact paths must be unique.' });
    const names = manifest.artifacts.map((artifact) => `${artifact.artifact_kind}:${artifact.name}`);
    if (new Set(names).size !== names.length) context.addIssue({ code: 'custom', path: ['artifacts'], message: 'Artifact names and kinds must be unique.' });
});

export const researcherValidationBindingSchema = z.object({
    schema: z.literal('cstar.researcher_validation_binding.v1'),
    request_id: z.string().regex(BOUNDED_ID),
    request_sha256: SHA256,
    job_id: z.string().regex(BOUNDED_ID),
    attempt_id: z.string().regex(BOUNDED_ID),
    handoff_sha256: SHA256,
    adapter_id: z.literal('cstar.researcher_preserved_adapter.v1'),
    adapter_sha256: SHA256,
    selected_source_manifest_sha256: SHA256,
    callable_policy_sha256: SHA256,
    source_grants_sha256: SHA256,
    source_budget_sha256: SHA256,
    output_manifest_sha256: SHA256,
    one_use: z.literal(true),
}).strict();

export const researcherHostCompleteSchema = z.object({
    schema: z.literal(RESEARCHER_HOST_COMPLETION_SCHEMA),
    request_id: z.string().regex(BOUNDED_ID),
    request_sha256: SHA256,
    job_id: z.string().regex(BOUNDED_ID),
    attempt_id: z.string().regex(BOUNDED_ID),
    handoff_sha256: SHA256,
    job: codexHostWorkerJobContractSchema,
    work_package: researcherNativeWorkPackageSchema.optional(),
    native_work_package: researcherNativeWorkPackageSchema.optional(),
    terminal_receipt: researcherTerminalReceiptSchema,
    artifact_manifest: researcherArtifactManifestSchema,
    lease_token: z.string().min(16).max(512).optional(),
    provider_requests_started: z.number().int().nonnegative().max(1),
    source_tool_calls: z.number().int().nonnegative().max(8),
    network_accessed: z.literal(false),
    cognition_launch: z.literal(false),
    cstar_launch: z.literal(false),
    observed_at: z.number().int().nonnegative(),
}).strict().superRefine((input, context) => {
    if (input.job.workflow_surface !== 'researcher' || input.job.worker_kind !== 'researcher') {
        context.addIssue({ code: 'custom', path: ['job'], message: 'Only Researcher host jobs may complete here.' });
    }
    if (input.job.job_id !== input.job_id || input.job.attempt_id !== input.attempt_id
        || input.job.canonical_request_id !== input.request_id
        || input.job.canonical_request_sha256 !== input.request_sha256) {
        context.addIssue({ code: 'custom', path: ['job_id'], message: 'Host job identity is not bound to the request attempt.' });
    }
    if (input.terminal_receipt.request_id !== input.request_id
        || input.terminal_receipt.request_sha256 !== input.request_sha256
        || input.terminal_receipt.job_id !== input.job_id
        || input.terminal_receipt.attempt_id !== input.attempt_id
        || input.terminal_receipt.provider_requests_started !== input.provider_requests_started
        || input.terminal_receipt.source_tool_calls !== input.source_tool_calls) {
        context.addIssue({ code: 'custom', path: ['terminal_receipt'], message: 'Terminal receipt counters or identity drifted.' });
    }
    if (input.terminal_receipt.actual_identity !== input.job.actual_identity
        && !(input.job.actual_identity === null && input.terminal_receipt.actual_identity === 'unreported')) {
        context.addIssue({ code: 'custom', path: ['terminal_receipt', 'actual_identity'], message: 'Host identity drifted from the job.' });
    }
    if (input.terminal_receipt.outcome === 'DELIVERED_UNVERIFIED' && input.provider_requests_started < 1) {
        context.addIssue({ code: 'custom', path: ['provider_requests_started'], message: 'Delivery requires a started host attempt.' });
    }
    if (!input.work_package && !input.native_work_package) {
        context.addIssue({ code: 'custom', path: ['work_package'], message: 'Native Researcher work package is required.' });
    }
    if (input.work_package && input.native_work_package
        && JSON.stringify(input.work_package) !== JSON.stringify(input.native_work_package)) {
        context.addIssue({ code: 'custom', path: ['native_work_package'], message: 'Work-package aliases must be byte-equivalent.' });
    }
});

export const researcherValidationSubjectSchema = z.object({
    schema: z.literal(RESEARCHER_VALIDATION_SUBJECT_SCHEMA),
    subject_kind: z.literal('researcher_execution'),
    request_id: z.string().regex(BOUNDED_ID),
    request_sha256: SHA256,
    job_id: z.string().regex(BOUNDED_ID),
    attempt_id: z.string().regex(BOUNDED_ID),
    handoff_sha256: SHA256,
    adapter_id: z.literal('cstar.researcher_preserved_adapter.v1'),
    adapter_sha256: SHA256,
    selected_source_manifest_sha256: SHA256,
    callable_policy_sha256: SHA256,
    source_grants_sha256: SHA256,
    source_budget_sha256: SHA256,
    output_manifest_sha256: SHA256,
    validator_identity: z.string().trim().min(1).max(256),
    validator_thread_id: z.string().trim().min(1).max(256),
    validator_turn_id: z.string().trim().min(1).max(256),
    one_use: z.literal(true),
}).strict().superRefine((subject, context) => {
    if (subject.validator_identity === subject.validator_thread_id) {
        context.addIssue({ code: 'custom', path: ['validator_identity'], message: 'Validator identity must be distinct from its thread label.' });
    }
});

export const researcherValidationReceiptSchema = z.object({
    schema: z.literal(RESEARCHER_VALIDATION_RECEIPT_SCHEMA),
    validation_id: z.string().regex(BOUNDED_ID),
    verdict: z.enum(['ACCEPTED', 'REJECTED', 'INCONCLUSIVE']),
    subject: researcherValidationSubjectSchema,
    evidence_sha256: SHA256,
    validator_identity: z.string().trim().min(1).max(256),
    one_use: z.literal(true),
}).strict().superRefine((receipt, context) => {
    if (receipt.validator_identity !== receipt.subject.validator_identity) {
        context.addIssue({ code: 'custom', path: ['validator_identity'], message: 'Receipt validator identity must bind its subject.' });
    }
});

export const researcherValidationResultSchema = z.object({
    subject_kind: z.literal('researcher_execution'),
    subject: researcherValidationSubjectSchema.optional(),
    request_id: z.string().regex(BOUNDED_ID).optional(),
    request_sha256: SHA256.optional(),
    job_id: z.string().regex(BOUNDED_ID).optional(),
    attempt_id: z.string().regex(BOUNDED_ID).optional(),
    handoff_sha256: SHA256.optional(),
    adapter_id: z.literal('cstar.researcher_preserved_adapter.v1').optional(),
    adapter_sha256: SHA256.optional(),
    selected_source_manifest_sha256: SHA256.optional(),
    callable_policy_sha256: SHA256.optional(),
    source_grants_sha256: SHA256.optional(),
    source_budget_sha256: SHA256.optional(),
    output_manifest_sha256: SHA256.optional(),
    validator_identity: z.string().trim().min(1).max(256).optional(),
    validator_thread_id: z.string().trim().min(1).max(256).optional(),
    validator_turn_id: z.string().trim().min(1).max(256).optional(),
    evidence_sha256: SHA256,
    one_use: z.literal(true),
}).strict().superRefine((input, context) => {
    const fields = ['request_id', 'request_sha256', 'job_id', 'attempt_id', 'handoff_sha256',
        'adapter_id', 'adapter_sha256', 'selected_source_manifest_sha256', 'callable_policy_sha256',
        'source_grants_sha256', 'source_budget_sha256', 'output_manifest_sha256',
        'validator_identity', 'validator_thread_id', 'validator_turn_id'] as const;
    if (!input.subject && fields.some((field) => input[field] === undefined)) {
        context.addIssue({ code: 'custom', path: ['subject'], message: 'A complete Researcher validation subject is required.' });
    }
    if (input.subject && fields.some((field) => input[field] !== undefined)) {
        context.addIssue({ code: 'custom', path: ['subject'], message: 'Use either subject or flattened subject fields, not both.' });
    }
    if (input.validator_identity && input.validator_identity === input.validator_thread_id) {
        context.addIssue({ code: 'custom', path: ['validator_identity'], message: 'Validator identity must be distinct from its thread label.' });
    }
});

export type ResearcherRequestInput = z.infer<typeof researcherRequestSchema>;
export type ResearcherHostCompleteInput = z.infer<typeof researcherHostCompleteSchema>;
export type ResearcherValidationSubjectInput = z.infer<typeof researcherValidationSubjectSchema>;
export type ResearcherValidationReceipt = z.infer<typeof researcherValidationReceiptSchema>;
export type ResearcherValidationBinding = z.infer<typeof researcherValidationBindingSchema>;
export type ResearcherValidationResultInput = z.infer<typeof researcherValidationResultSchema>;
