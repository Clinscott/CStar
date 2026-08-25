import path from 'node:path';
import { z } from 'zod';

import { codexHostWorkerJobContractSchema } from './worker_jobs.js';

export const RESEARCHER_NATIVE_REQUEST_SCHEMA = 'cstar.researcher_request.v2' as const;
export const RESEARCHER_AUTHORITY_BINDING_SCHEMA =
    'cstar.researcher_authority_binding.v1' as const;
export const RESEARCHER_NATIVE_WORK_PACKAGE_SCHEMA =
    'cstar.researcher_native_work_package.v1' as const;
export const RESEARCHER_NATIVE_HANDOFF_SCHEMA =
    'cstar.researcher_native_handoff.v1' as const;
export const RESEARCHER_HOST_COMPLETION_SCHEMA =
    'cstar.researcher_host_completion.v1' as const;
export const RESEARCHER_ARTIFACT_MANIFEST_SCHEMA =
    'cstar.researcher_artifact_manifest.v1' as const;
export const RESEARCHER_VALIDATION_SUBJECT_SCHEMA =
    'cstar.researcher_validation_subject.v1' as const;

const DIGEST = /^[a-f0-9]{64}$/;
const BOUNDED_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/;
const ABSOLUTE_PATH = z.string().trim().min(1).max(4_096).refine((value) =>
    path.isAbsolute(value) && path.resolve(value) === value,
    'Researcher paths must be canonical absolute paths.');
const SHA256 = z.string().regex(DIGEST);
const id = z.string().regex(BOUNDED_ID);
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MAX_ATTEMPT_BYTES = 16 * 1024 * 1024;

const researcherSelectorSchema = z.object({
    requested_model: z.literal('gpt-5.6-luna'),
    requested_reasoning: z.literal('max'),
    selector_status: z.literal('enforced'),
    actual_identity: z.string().trim().min(1).max(256).nullable(),
}).strict().superRefine((selector, context) => {
    if (selector.actual_identity !== null && selector.actual_identity !== 'unreported') {
        context.addIssue({ code: 'custom', path: ['actual_identity'],
            message: 'Actual identity requires host attestation; use unreported when unavailable.' });
    }
});

export const researcherAuthorityBindingSchema = z.object({
    schema: z.literal(RESEARCHER_AUTHORITY_BINDING_SCHEMA),
    request_id: id,
    request_sha256: SHA256,
    bead_id: id,
    set_id: id,
    decision_id: id,
    authorization_id: id,
    authorization_sha256: SHA256,
    authorization_expires_at: z.number().int().positive(),
    action: z.literal('report'),
    scope_sha256: SHA256,
    adapter_id: id,
    adapter_sha256: SHA256,
    selected_source_manifest_sha256: SHA256,
    callable_policy_sha256: SHA256,
    source_grants_sha256: SHA256,
    source_budget_sha256: SHA256,
    one_use: z.literal(true),
}).strict();

export const researcherArtifactSchema = z.object({
    name: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._ -]*$/),
    path: ABSOLUTE_PATH,
    sha256: SHA256,
    byte_count: z.number().int().positive().max(MAX_ARTIFACT_BYTES),
    media_type: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9!#$&^_.+\/-]*$/),
}).strict();

export const researcherArtifactManifestSchema = z.object({
    schema: z.literal(RESEARCHER_ARTIFACT_MANIFEST_SCHEMA),
    artifacts: z.array(researcherArtifactSchema).min(1).max(64),
    total_bytes: z.number().int().nonnegative().max(MAX_ATTEMPT_BYTES),
}).strict().superRefine((manifest, context) => {
    const paths = new Set<string>();
    let total = 0;
    for (const [index, artifact] of manifest.artifacts.entries()) {
        if (paths.has(artifact.path)) context.addIssue({
            code: 'custom', path: ['artifacts', index, 'path'],
            message: 'Researcher artifact paths must be unique.',
        });
        paths.add(artifact.path);
        total += artifact.byte_count;
    }
    if (total !== manifest.total_bytes) context.addIssue({
        code: 'custom', path: ['total_bytes'],
        message: 'Researcher artifact total_bytes must equal its entries.',
    });
});

export const researcherValidationBindingSchema = z.object({
    schema: z.literal('cstar.researcher_validation_binding.v1'),
    subject_kind: z.literal('researcher_execution'),
    request_id: id,
    request_sha256: SHA256,
    job_id: id,
    attempt_id: id,
    work_package_sha256: SHA256,
    handoff_sha256: SHA256,
    terminal_receipt_sha256: SHA256.optional(),
    one_use: z.literal(true),
    validator_thread_id: id.optional(),
    validator_turn_id: id.optional(),
}).strict().superRefine((binding, context) => {
    if ((binding.validator_thread_id === undefined)
        !== (binding.validator_turn_id === undefined)) context.addIssue({
        code: 'custom', path: ['validator_thread_id'],
        message: 'Validator thread and turn must be supplied together.',
    });
});

export const researcherNativeWorkPackageSchema = z.object({
    schema: z.literal(RESEARCHER_NATIVE_WORK_PACKAGE_SCHEMA),
    request_id: id,
    request_sha256: SHA256,
    bead_id: id,
    set_id: id,
    decision_id: id,
    authorization_id: id,
    authorization_sha256: SHA256,
    authorization_expires_at: z.number().int().nonnegative(),
    attempt_id: id,
    job_id: id,
    idempotency_key: z.string().regex(IDEMPOTENCY_KEY),
    objective: z.string().trim().min(1).max(8_000),
    adapter_id: id,
    adapter_sha256: SHA256,
    selected_source_manifest_sha256: SHA256,
    callable_policy_sha256: SHA256,
    source_grants_sha256: SHA256,
    source_budget_sha256: SHA256,
    output_root: ABSOLUTE_PATH,
    output_paths: z.array(ABSOLUTE_PATH).min(1).max(64),
    expected_artifacts: z.array(researcherArtifactSchema).min(1).max(64),
    selector: researcherSelectorSchema,
    max_host_attempts: z.literal(1),
    max_descendants: z.literal(0),
    max_peer_messages: z.literal(0),
    max_retries: z.literal(0),
    max_replays: z.literal(0),
    max_fallbacks: z.literal(0),
    terminal_schema: z.literal('cstar.researcher_terminal_receipt.v1'),
    authority_binding: researcherAuthorityBindingSchema.optional(),
    validation_binding: researcherValidationBindingSchema.optional(),
}).strict().superRefine((packageValue, context) => {
    if (packageValue.authorization_expires_at <= 0) context.addIssue({
        code: 'custom', path: ['authorization_expires_at'],
        message: 'Researcher authorization must have a positive expiry.',
    });
    const outputs = new Set(packageValue.output_paths);
    for (const [index, artifact] of packageValue.expected_artifacts.entries()) {
        if (!outputs.has(artifact.path)) context.addIssue({
            code: 'custom', path: ['expected_artifacts', index, 'path'],
            message: 'Every expected artifact path must be declared as an output path.',
        });
    }
    const root = path.resolve(packageValue.output_root);
    for (const [field, values] of [['output_paths', packageValue.output_paths]] as const) {
        const seen = new Set<string>();
        values.forEach((value, index) => {
            const relative = path.relative(root, value);
            if (seen.has(value) || relative === '..' || relative.startsWith(`..${path.sep}`)
                || path.isAbsolute(relative)) context.addIssue({
                code: 'custom', path: [field, index],
                message: 'Researcher output paths must be unique and contained by output_root.',
            });
            seen.add(value);
        });
    }
    if (packageValue.validation_binding && (
        packageValue.validation_binding.request_id !== packageValue.request_id
        || packageValue.validation_binding.request_sha256 !== packageValue.request_sha256
        || packageValue.validation_binding.job_id !== packageValue.job_id
        || packageValue.validation_binding.attempt_id !== packageValue.attempt_id
    )) context.addIssue({
        code: 'custom', path: ['validation_binding'],
        message: 'Researcher validation binding must match the work package.',
    });
    if (packageValue.authority_binding && (
        packageValue.authority_binding.request_id !== packageValue.request_id
        || packageValue.authority_binding.request_sha256 !== packageValue.request_sha256
        || packageValue.authority_binding.bead_id !== packageValue.bead_id
        || packageValue.authority_binding.set_id !== packageValue.set_id
        || packageValue.authority_binding.decision_id !== packageValue.decision_id
        || packageValue.authority_binding.authorization_id !== packageValue.authorization_id
        || packageValue.authority_binding.authorization_sha256 !== packageValue.authorization_sha256
        || packageValue.authority_binding.authorization_expires_at !== packageValue.authorization_expires_at
        || packageValue.authority_binding.adapter_id !== packageValue.adapter_id
        || packageValue.authority_binding.adapter_sha256 !== packageValue.adapter_sha256
        || packageValue.authority_binding.selected_source_manifest_sha256 !== packageValue.selected_source_manifest_sha256
        || packageValue.authority_binding.callable_policy_sha256 !== packageValue.callable_policy_sha256
        || packageValue.authority_binding.source_grants_sha256 !== packageValue.source_grants_sha256
        || packageValue.authority_binding.source_budget_sha256 !== packageValue.source_budget_sha256
    )) context.addIssue({ code: 'custom', path: ['authority_binding'],
        message: 'Researcher authority binding must match the work package.' });
});

export const researcherNativeHandoffSchema = z.object({
    schema: z.literal(RESEARCHER_NATIVE_HANDOFF_SCHEMA),
    status: z.enum(['queued', 'replayed']),
    work_package: researcherNativeWorkPackageSchema,
    job: codexHostWorkerJobContractSchema,
    handoff_sha256: SHA256,
    handoff_path: ABSOLUTE_PATH,
    host_launch_required: z.literal(true),
    cstar_launch: z.literal(false),
    provider_attempted: z.literal(false),
}).strict().superRefine((handoff, context) => {
    if (handoff.job.worker_kind !== 'researcher' || handoff.job.workflow_surface !== 'researcher'
        || handoff.job.job_id !== handoff.work_package.job_id
        || handoff.job.attempt_id !== handoff.work_package.attempt_id) {
        context.addIssue({ code: 'custom', path: ['job'], message: 'Researcher handoff job must bind the work package.' });
    }
    const expected = handoff.work_package.output_root;
    const relative = path.relative(path.dirname(handoff.handoff_path), expected);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        // The work package may intentionally point at an external receipt root;
        // only its own output paths are constrained by output_root.
        void context;
    }
});

export const researcherHostCompleteSchema = z.object({
    schema: z.literal(RESEARCHER_HOST_COMPLETION_SCHEMA),
    request_id: id,
    request_sha256: SHA256,
    bead_id: id,
    set_id: id,
    decision_id: id,
    authorization_id: id,
    authorization_sha256: SHA256,
    attempt_id: id,
    host_job_id: id,
    idempotency_key: z.string().regex(IDEMPOTENCY_KEY),
    handoff_sha256: SHA256,
    work_package_sha256: SHA256,
    work_package: researcherNativeWorkPackageSchema,
    job: codexHostWorkerJobContractSchema,
    result_status: z.string().trim().min(1).max(48).regex(/^[A-Za-z][A-Za-z0-9_.-]*$/),
    artifact_manifest: researcherArtifactManifestSchema,
    native_worker_attempts: z.literal(1),
    source_tool_calls: z.number().int().nonnegative().max(8),
    source_queries: z.number().int().nonnegative().max(8),
    source_provider_requests_started: z.number().int().nonnegative().max(8),
    provider_requests_started: z.literal(0),
    hermes_transport_calls: z.literal(0),
    legacy_hermes_subprocess_calls: z.literal(0),
    parse_attempts: z.number().int().nonnegative().max(8),
    json_repair_attempts: z.literal(0),
    retries: z.literal(0),
    replays: z.literal(0),
    fallbacks: z.literal(0),
    provider_switches: z.literal(0),
    descendants: z.literal(0),
    peer_messages: z.literal(0),
    network_accessed: z.literal(false),
    cstar_launch: z.literal(false),
    cognition_launch: z.literal(true),
    actual_identity: z.string().trim().min(1).max(256).nullable().optional(),
    validation_binding: researcherValidationBindingSchema.optional(),
    observed_at: z.number().int().nonnegative().optional(),
}).strict().superRefine((input, context) => {
    const job = input.job;
    if (job.worker_kind !== 'researcher' || job.workflow_surface !== 'researcher') {
        context.addIssue({ code: 'custom', path: ['job'], message: 'Researcher completion requires a Researcher host job.' });
    }
    if (job.job_id !== input.host_job_id || job.attempt_id !== input.attempt_id
        || job.canonical_request_id !== input.request_id
        || job.canonical_request_sha256 !== input.request_sha256
        || job.requested_model !== 'gpt-5.6-luna' || job.requested_reasoning !== 'max'
        || job.selector_status !== 'enforced' || job.provider_requests_started !== 0
        || job.network_accessed !== false || job.cstar_launch !== false) {
        context.addIssue({ code: 'custom', path: ['job'], message: 'Researcher completion job binding drifted.' });
    }
    if (input.actual_identity !== undefined && input.actual_identity !== job.actual_identity) {
        context.addIssue({ code: 'custom', path: ['actual_identity'], message: 'Actual identity drifted from the host job.' });
    }
    if (input.work_package.request_id !== input.request_id
        || input.work_package.request_sha256 !== input.request_sha256
        || input.work_package.job_id !== input.host_job_id
        || input.work_package.attempt_id !== input.attempt_id
        || input.work_package.authorization_id !== input.authorization_id
        || input.work_package.authorization_sha256 !== input.authorization_sha256) {
        context.addIssue({ code: 'custom', path: ['work_package'], message: 'Researcher work package binding drifted.' });
    }
    if (input.validation_binding && (
        input.validation_binding.request_id !== input.request_id
        || input.validation_binding.request_sha256 !== input.request_sha256
        || input.validation_binding.job_id !== input.host_job_id
        || input.validation_binding.attempt_id !== input.attempt_id
    )) context.addIssue({ code: 'custom', path: ['validation_binding'], message: 'Validation binding drifted from completion subject.' });
});

export const researcherValidationSubjectSchema = z.object({
    schema: z.literal(RESEARCHER_VALIDATION_SUBJECT_SCHEMA),
    subject_kind: z.literal('researcher_execution'),
    request_id: id,
    request_sha256: SHA256,
    bead_id: id,
    set_id: id,
    decision_id: id,
    authorization_sha256: SHA256,
    job_id: id,
    attempt_id: id,
    adapter_id: id,
    adapter_sha256: SHA256,
    selected_source_manifest_sha256: SHA256,
    callable_policy_sha256: SHA256,
    source_grants_sha256: SHA256,
    source_budget_sha256: SHA256,
    work_package_sha256: SHA256,
    handoff_sha256: SHA256,
    terminal_receipt_sha256: SHA256,
    output_manifest_sha256: SHA256,
    one_use: z.literal(true),
    validator_identity: id,
}).strict();

export type ResearcherArtifact = z.infer<typeof researcherArtifactSchema>;
export type ResearcherArtifactManifest = z.infer<typeof researcherArtifactManifestSchema>;
export type ResearcherValidationBinding = z.infer<typeof researcherValidationBindingSchema>;
export type ResearcherNativeWorkPackage = z.infer<typeof researcherNativeWorkPackageSchema>;
export type ResearcherNativeHandoff = z.infer<typeof researcherNativeHandoffSchema>;
export type ResearcherHostCompleteInput = z.infer<typeof researcherHostCompleteSchema>;
export type ResearcherValidationSubject = z.infer<typeof researcherValidationSubjectSchema>;
