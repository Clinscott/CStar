import path from 'node:path';
import { z } from 'zod';

import { codexHostWorkerJobContractSchema } from './worker_jobs.js';

export const FORGE_HOST_COMPLETION_SCHEMA = 'cstar.forge_host_completion.v1' as const;
export const FORGE_HOST_ARTIFACT_MANIFEST_SCHEMA =
    'cstar.forge_host_artifact_manifest.v1' as const;

const DIGEST = /^[a-f0-9]{64}$/;
const BOUNDED_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/;
const ABSOLUTE_PATH = z.string().min(1).max(4_096).refine((value) =>
    value === value.trim() && path.isAbsolute(value) && path.resolve(value) === value,
    'Artifact paths must be canonical absolute paths.');
const SHA256 = z.string().regex(DIGEST);
const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;

function secretLike(value: string): boolean {
    return /(?:api[_-]?key|secret|password|token)\s*[:=]\s*[^\s,]{8,}|(?:sk|ghp|xox[bap]|AKIA)[-_A-Za-z0-9]{16,}|Bearer\s+[A-Za-z0-9._~+/=-]{16,}/i.test(value);
}

const artifactSchema = z.object({
    path: ABSOLUTE_PATH,
    sha256: SHA256,
    byte_count: z.number().int().nonnegative().max(MAX_ARTIFACT_BYTES),
}).strict();

const artifactManifestSchema = z.object({
    schema: z.literal(FORGE_HOST_ARTIFACT_MANIFEST_SCHEMA),
    artifacts: z.array(artifactSchema).min(1).max(32),
    total_bytes: z.number().int().nonnegative().max(MAX_ARTIFACT_BYTES),
}).strict();

const boundedStatus = z.string().trim().min(1).max(48).regex(/^[A-Za-z][A-Za-z0-9_.-]*$/)
    .refine((value) => !secretLike(value), 'Receipt status cannot contain secret-like material.');

export const forgeHostCompleteSchema = z.object({
    schema: z.literal(FORGE_HOST_COMPLETION_SCHEMA),
    forge_request_receipt_id: z.string().regex(BOUNDED_ID),
    request_sha256: SHA256,
    execution_receipt_id: z.string().regex(BOUNDED_ID),
    attempt_id: z.string().regex(BOUNDED_ID),
    idempotency_key: z.string().regex(IDEMPOTENCY_KEY),
    scope_sha256: SHA256,
    handoff_sha256: SHA256,
    host_job_id: z.string().regex(BOUNDED_ID),
    job: codexHostWorkerJobContractSchema,
    result_status: boundedStatus,
    result_artifact_sha256: SHA256.optional(),
    artifact_manifest: artifactManifestSchema,
    provider_requests_started: z.literal(0),
    provider_requests_completed: z.literal(0).optional(),
    provider_requests_ambiguous: z.literal(0).optional(),
    live_spend: z.literal(false).optional(),
    live_spend_unknown: z.literal(false).optional(),
    known_spend_observed: z.literal(false),
    network_accessed: z.literal(false),
    cognition_launch: z.literal(false),
    cstar_launch: z.literal(false),
    actual_identity: z.string().trim().min(1).max(256).nullable().optional(),
    validator_thread_id: z.string().regex(BOUNDED_ID).optional(),
    validator_turn_id: z.string().regex(BOUNDED_ID).optional(),
    observed_at: z.number().int().nonnegative().optional(),
}).strict().superRefine((input, context) => {
    if ((input.validator_thread_id === undefined) !== (input.validator_turn_id === undefined)) {
        context.addIssue({
            code: 'custom',
            path: ['validator_thread_id'],
            message: 'Validator thread and turn must be supplied together.',
        });
    }

    const totalBytes = input.artifact_manifest.artifacts.reduce(
        (total, artifact) => total + artifact.byte_count,
        0,
    );
    if (totalBytes !== input.artifact_manifest.total_bytes) {
        context.addIssue({
            code: 'custom',
            path: ['artifact_manifest', 'total_bytes'],
            message: 'Artifact manifest total_bytes must equal its bounded entries.',
        });
    }
    if (JSON.stringify(input.artifact_manifest).length > 256 * 1024) {
        context.addIssue({
            code: 'custom',
            path: ['artifact_manifest'],
            message: 'Artifact manifest exceeds the bounded completion envelope.',
        });
    }

    const paths = new Set<string>();
    const outputPaths = input.job.output_paths ?? [];
    const requiredOutputPaths = new Set(outputPaths);
    const projectRoot = input.job.project_root ? path.resolve(input.job.project_root) : null;
    if (!projectRoot) {
        context.addIssue({
            code: 'custom',
            path: ['job', 'project_root'],
            message: 'Host completion requires a project root for artifact containment.',
        });
    }
    if (outputPaths.length === 0) {
        context.addIssue({
            code: 'custom',
            path: ['job', 'output_paths'],
            message: 'Host completion requires at least one declared output path.',
        });
    }
    input.artifact_manifest.artifacts.forEach((artifact, index) => {
        if (paths.has(artifact.path)) {
            context.addIssue({
                code: 'custom',
                path: ['artifact_manifest', 'artifacts', index, 'path'],
                message: 'Artifact paths must be unique.',
            });
        }
        paths.add(artifact.path);
        if (projectRoot) {
            const relative = path.relative(projectRoot, artifact.path);
            if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
                context.addIssue({
                    code: 'custom',
                    path: ['artifact_manifest', 'artifacts', index, 'path'],
                    message: 'Artifact path escapes the host job project root.',
                });
            }
        }
        if (!requiredOutputPaths.has(artifact.path)) {
            context.addIssue({
                code: 'custom',
                path: ['artifact_manifest', 'artifacts', index, 'path'],
                message: 'Artifact path is not an exact declared host job output.',
            });
        }
    });
    outputPaths.forEach((outputPath, index) => {
        if (!paths.has(outputPath)) {
            context.addIssue({
                code: 'custom',
                path: ['job', 'output_paths', index],
                message: 'Every declared host job output must appear exactly once in the manifest.',
            });
        }
    });

    const job = input.job;
    if (job.workflow_surface !== 'forge' || job.worker_kind !== 'forge') {
        context.addIssue({ code: 'custom', path: ['job'], message: 'Only Forge host jobs may complete here.' });
    }
    if (job.job_id !== input.host_job_id || job.attempt_id !== input.attempt_id) {
        context.addIssue({ code: 'custom', path: ['host_job_id'], message: 'Host job identity must bind the attempt.' });
    }
    if (job.canonical_request_id !== input.forge_request_receipt_id
        || job.canonical_request_sha256 !== input.request_sha256
        || job.target_paths_sha256 !== input.scope_sha256) {
        context.addIssue({ code: 'custom', path: ['request_sha256'], message: 'Host job request and scope hashes drifted.' });
    }
    if (job.runner_owner !== 'codex-host' || job.transport !== 'codex-host'
        || job.requested_model !== 'gpt-5.6-luna' || job.requested_reasoning !== 'max'
        || job.selector_status !== 'enforced' || job.host_launch_required !== true
        || job.provider_requests_started !== 0 || job.spend_uncertain !== false
        || job.known_spend_observed !== false || job.network_accessed !== false
        || job.cognition_launch !== false || job.cstar_launch !== false) {
        context.addIssue({
            code: 'custom',
            path: ['job'],
            message: 'Host completion requires an explicit zero-provider Codex-host job.',
        });
    }
    if (job.validation_ticket) {
        context.addIssue({
            code: 'custom',
            path: ['job', 'validation_ticket'],
            message: 'Raw validation tickets are not accepted in a host completion payload.',
        });
    }
    if (input.actual_identity !== undefined && input.actual_identity !== job.actual_identity) {
        context.addIssue({ code: 'custom', path: ['actual_identity'], message: 'Actual host identity drifted from the job.' });
    }
    if (secretLike(job.objective)) {
        context.addIssue({ code: 'custom', path: ['job', 'objective'], message: 'Secret-like host payloads are rejected.' });
    }

    const binding = job.validation_ticket_binding;
    const request = job.validation_ticket_request;
    if (!binding || !request || binding.execution_receipt_id !== input.execution_receipt_id
        || request.execution_receipt_id !== input.execution_receipt_id
        || binding.attempt_id !== input.attempt_id || request.attempt_id !== input.attempt_id
        || binding.scope_sha256 !== input.scope_sha256 || request.scope_sha256 !== input.scope_sha256) {
        context.addIssue({
            code: 'custom',
            path: ['execution_receipt_id'],
            message: 'The one-use validator binding must match the exact completion subject.',
        });
    }
    if (input.result_artifact_sha256
        && !input.artifact_manifest.artifacts.some((artifact) => artifact.sha256 === input.result_artifact_sha256)) {
        context.addIssue({
            code: 'custom',
            path: ['result_artifact_sha256'],
            message: 'Result artifact hash must be present in the bounded manifest.',
        });
    }
});

export type ForgeHostCompleteInput = z.infer<typeof forgeHostCompleteSchema>;
export type ForgeHostArtifactManifest = ForgeHostCompleteInput['artifact_manifest'];
