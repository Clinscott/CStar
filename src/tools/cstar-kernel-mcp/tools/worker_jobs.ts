import type {
    PublicWorkerArtifact,
    PublicWorkerJob,
    WorkerJobArtifactRecord,
    WorkerJobRecord,
} from '../../../types/worker_job.js';
import {
    getWorkerJob,
    getWorkerJobArtifact,
    listWorkerJobArtifacts,
    requestWorkerJobCancellation,
    createWorkerJob,
    WorkerJobControllerError,
} from '../../pennyone/intel/worker_job_controller.js';
import {
    type CancelWorkerJobArgs,
    type FetchWorkerArtifactArgs,
    type GetWorkerJobArgs,
    isWorkerJobsV2Enabled,
    type StartWorkerJobArgs,
} from '../contracts/worker_jobs.js';
import { normalizeErrorMessage, type McpTextResponse } from '../contracts/responses.js';

interface StructuredWorkerResponse extends McpTextResponse {
    structuredContent: Record<string, unknown>;
}

function structuredResponse(payload: Record<string, unknown>): StructuredWorkerResponse {
    return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        structuredContent: payload,
    };
}

function workerErrorResponse(error: unknown): McpTextResponse {
    const known = error instanceof WorkerJobControllerError;
    const payload = {
        status: 'error',
        error: {
            code: known ? error.code : 'INTERNAL_ERROR',
            message: known
                ? normalizeErrorMessage(error)
                : 'The worker-job operation could not be completed.',
            retryable: known && error.retryable,
        },
    };
    return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        isError: true,
    };
}

function requireFeature(env: NodeJS.ProcessEnv): void {
    if (!isWorkerJobsV2Enabled(env)) {
        throw new WorkerJobControllerError(
            'FEATURE_DISABLED',
            'Worker Jobs v2 is not enabled for this CStar kernel.',
        );
    }
}

function toPublicArtifact(artifact: WorkerJobArtifactRecord): PublicWorkerArtifact {
    return {
        artifact_id: artifact.artifact_id,
        artifact_kind: artifact.artifact_kind,
        name: artifact.name,
        media_type: artifact.media_type,
        byte_count: artifact.byte_count,
        sha256: artifact.sha256,
        created_at: artifact.created_at,
    };
}

function toPublicJob(job: WorkerJobRecord): PublicWorkerJob {
    const artifacts = listWorkerJobArtifacts(job.job_id)
        .map(toPublicArtifact);
    return {
        job_id: job.job_id,
        ...(job.bead_id ? { bead_id: job.bead_id } : {}),
        worker_kind: job.worker_kind,
        objective: job.objective,
        workspace_ref: job.workspace_ref,
        expected_artifacts: job.expected_artifacts,
        state: job.state,
        progress: {
            percent: job.progress_percent,
            phase: job.progress_phase,
        },
        cancel_requested: job.cancel_requested_at !== undefined,
        ...(job.failure_code
            ? {
                failure: {
                    code: job.failure_code,
                    ...(job.failure_summary ? { summary: job.failure_summary } : {}),
                },
            }
            : {}),
        attempt_count: job.attempt_count,
        version: job.version,
        artifacts,
        created_at: job.created_at,
        updated_at: job.updated_at,
        ...(job.started_at !== undefined ? { started_at: job.started_at } : {}),
        ...(job.terminal_at !== undefined ? { terminal_at: job.terminal_at } : {}),
    };
}

export async function handleStartWorkerJob(
    args: StartWorkerJobArgs,
    env: NodeJS.ProcessEnv = process.env,
): Promise<McpTextResponse> {
    try {
        requireFeature(env);
        const created = createWorkerJob({
            ...args,
            expected_artifacts: args.expected_artifacts.map((artifact) => ({
                ...artifact,
                required: artifact.required !== false,
            })),
        });
        return structuredResponse({
            status: created.deduplicated ? 'existing' : 'queued',
            deduplicated: created.deduplicated,
            execution_available: false,
            job: toPublicJob(created.job),
        });
    } catch (error) {
        return workerErrorResponse(error);
    }
}

export async function handleGetWorkerJob(
    args: GetWorkerJobArgs,
    env: NodeJS.ProcessEnv = process.env,
): Promise<McpTextResponse> {
    try {
        requireFeature(env);
        const job = getWorkerJob(args.job_id);
        if (!job) {
            throw new WorkerJobControllerError('JOB_NOT_FOUND', `Worker job not found: ${args.job_id}`);
        }
        return structuredResponse({
            status: 'ok',
            execution_available: false,
            job: toPublicJob(job),
        });
    } catch (error) {
        return workerErrorResponse(error);
    }
}

export async function handleCancelWorkerJob(
    args: CancelWorkerJobArgs,
    env: NodeJS.ProcessEnv = process.env,
): Promise<McpTextResponse> {
    try {
        requireFeature(env);
        const result = requestWorkerJobCancellation(
            args.job_id,
            args.reason,
            args.expected_version,
        );
        return structuredResponse({
            status: result.job.state === 'CANCELLED' ? 'cancelled' : 'cancel_requested',
            changed: result.changed,
            job: toPublicJob(result.job),
        });
    } catch (error) {
        return workerErrorResponse(error);
    }
}

export async function handleFetchWorkerArtifact(
    args: FetchWorkerArtifactArgs,
    env: NodeJS.ProcessEnv = process.env,
): Promise<McpTextResponse> {
    try {
        requireFeature(env);
        const artifact = getWorkerJobArtifact(args.job_id, args.artifact_id);
        if (!artifact) {
            throw new WorkerJobControllerError(
                'ARTIFACT_NOT_FOUND',
                `Ready worker artifact not found: ${args.artifact_id}`,
            );
        }
        if (artifact.inline_text === undefined) {
            throw new WorkerJobControllerError(
                'ARTIFACT_DELIVERY_UNAVAILABLE',
                'This artifact is not available for bounded inline delivery.',
            );
        }
        return structuredResponse({
            status: 'ok',
            artifact: toPublicArtifact(artifact),
            delivery: {
                mode: 'inline_text',
                text: artifact.inline_text,
            },
        });
    } catch (error) {
        return workerErrorResponse(error);
    }
}
