import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

import {
    forgeHostCompleteSchema,
    type ForgeHostCompleteInput,
} from '../../cstar-kernel-mcp/contracts/forge_host_completion.js';
import type { HallForgeAttemptRecord, HallForgeRequestRecord } from '../../../types/forge.js';
import { CODEX_HOST_WORKER_HANDOFF_SCHEMA } from '../../../types/worker_job.js';
import {
    forgeAuthorizationLineageMatchesRequest,
    getForgeAttemptByExecutionReceipt,
    getForgeAuthorizationByRequest,
    getForgeRequest,
} from './forge_receipt_controller.js';
import { recordForgeDelivery } from './forge_validation_controller.js';
import {
    issueIndependentValidatorTicket,
    type ValidationTicketIssueResult,
} from './validation_ticket_controller.js';

const DELIVERY_PREFIX = 'DELIVERED_PENDING_VALIDATION:';
const COMPLETION_EXTERNAL_ID_PREFIX = 'codex-host-completion:';
const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;
const ARTIFACT_READ_CHUNK_BYTES = 64 * 1024;

interface ArtifactStat {
    dev: bigint;
    ino: bigint;
    mode: bigint;
    uid: bigint;
    nlink: bigint;
    size: bigint;
    mtimeNs: bigint;
    ctimeNs: bigint;
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
}

export interface ForgeHostWorkerCompletionResult {
    replayed: boolean;
    completion_fingerprint_sha256: string;
    artifact_manifest_sha256: string;
    attempt: HallForgeAttemptRecord;
    request: HallForgeRequestRecord;
    validation_ticket_status: 'issued' | 'already_issued' | 'permitted' | 'permitted_replay';
    validation_ticket?: ValidationTicketIssueResult;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stable(item)]),
    );
}

function stableJson(value: unknown): string {
    return JSON.stringify(stable(value));
}

function validInput(value: unknown): ForgeHostCompleteInput {
    const parsed = forgeHostCompleteSchema.safeParse(value);
    if (!parsed.success) throw new Error('forge_host_completion_contract_invalid');
    return parsed.data;
}

function assertCurrentForgeV3(request: HallForgeRequestRecord): void {
    let summary: unknown;
    try {
        summary = JSON.parse(request.request_summary_json);
    } catch {
        throw new Error('forge_host_completion_request_summary_invalid');
    }
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)
        || (summary as { schema?: unknown }).schema !== 'cstar.forge_request.v3') {
        throw new Error('forge_host_completion_current_v3_required');
    }
}

function handoffHash(input: ForgeHostCompleteInput): string {
    return sha256(stableJson({ schema: CODEX_HOST_WORKER_HANDOFF_SCHEMA, job: input.job }));
}

function dispatchReceiptHash(input: ForgeHostCompleteInput): string {
    const { dispatch_receipt_sha256: _ignored, ...unsigned } = input.job;
    return sha256(stableJson(unsigned));
}

function artifactManifestHash(input: ForgeHostCompleteInput): string {
    return sha256(stableJson(input.artifact_manifest));
}

function completionFingerprint(input: ForgeHostCompleteInput): string {
    return sha256(stableJson({
        schema: input.schema,
        forge_request_receipt_id: input.forge_request_receipt_id,
        request_sha256: input.request_sha256,
        execution_receipt_id: input.execution_receipt_id,
        attempt_id: input.attempt_id,
        idempotency_key: input.idempotency_key,
        scope_sha256: input.scope_sha256,
        handoff_sha256: input.handoff_sha256,
        host_job_id: input.host_job_id,
        result_status: input.result_status,
        result_artifact_sha256: input.result_artifact_sha256
            ?? input.artifact_manifest.artifacts[0]!.sha256,
        artifact_manifest: input.artifact_manifest,
        actual_identity: input.actual_identity ?? input.job.actual_identity,
        validator_thread_id: input.validator_thread_id
            ?? input.job.validation_ticket_request?.validator_thread_id ?? null,
        validator_turn_id: input.validator_turn_id
            ?? input.job.validation_ticket_request?.validator_turn_id ?? null,
        zero_provider: {
            provider_requests_started: input.provider_requests_started,
            provider_requests_completed: input.provider_requests_completed ?? 0,
            provider_requests_ambiguous: input.provider_requests_ambiguous ?? 0,
            live_spend: input.live_spend ?? false,
            live_spend_unknown: input.live_spend_unknown ?? false,
            known_spend_observed: input.known_spend_observed,
            network_accessed: input.network_accessed,
            cognition_launch: input.cognition_launch,
            cstar_launch: input.cstar_launch,
        },
    }));
}

function artifactFailure(code: string): never {
    throw new Error(`forge_host_completion_artifact_${code}`);
}

function lstatArtifact(value: string): ArtifactStat {
    return fs.lstatSync(value, { bigint: true }) as ArtifactStat;
}

function sameIdentity(left: ArtifactStat, right: ArtifactStat): boolean {
    return left.dev === right.dev && left.ino === right.ino;
}

function sameFileState(left: ArtifactStat, right: ArtifactStat): boolean {
    return sameIdentity(left, right) && left.mode === right.mode && left.uid === right.uid
        && left.nlink === right.nlink && left.size === right.size
        && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function contained(root: string, candidate: string): boolean {
    const relative = path.relative(root, candidate);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relative);
}

function secureArtifactRoot(input: ForgeHostCompleteInput): string {
    const root = input.job.project_root!;
    try {
        const stat = lstatArtifact(root);
        if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(root) !== root) {
            artifactFailure('project_root_invalid');
        }
        return root;
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('forge_host_completion_artifact_')) throw error;
        artifactFailure('project_root_invalid');
    }
}

function verifyArtifactFile(root: string, artifact: ForgeHostCompleteInput['artifact_manifest']['artifacts'][number]): void {
    let descriptor: number | undefined;
    try {
        if (!path.isAbsolute(artifact.path) || path.resolve(artifact.path) !== artifact.path
            || !contained(root, artifact.path)) artifactFailure('path_invalid');
        const pathBefore = lstatArtifact(artifact.path);
        if (pathBefore.isSymbolicLink()) artifactFailure('symlink');
        const canonicalBefore = fs.realpathSync(artifact.path);
        if (canonicalBefore !== artifact.path || !contained(root, canonicalBefore)) {
            artifactFailure('identity_invalid');
        }
        descriptor = fs.openSync(
            artifact.path,
            fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
        );
        const before = fs.fstatSync(descriptor, { bigint: true }) as ArtifactStat;
        const effectiveUid = typeof process.geteuid === 'function' ? BigInt(process.geteuid()) : null;
        if (!before.isFile()) artifactFailure('not_regular_file');
        if (before.nlink !== 1n) artifactFailure('hardlink');
        if (effectiveUid === null || before.uid !== effectiveUid || (before.mode & 0o022n) !== 0n) {
            artifactFailure('owner_control_invalid');
        }
        if (!sameIdentity(pathBefore, before)) artifactFailure('identity_invalid');
        if (artifact.byte_count > MAX_ARTIFACT_BYTES
            || before.size !== BigInt(artifact.byte_count)) artifactFailure('size_mismatch');

        const digest = createHash('sha256');
        const buffer = Buffer.allocUnsafe(Math.min(
            ARTIFACT_READ_CHUNK_BYTES,
            Math.max(1, artifact.byte_count),
        ));
        let bytesRead = 0;
        while (true) {
            const count = fs.readSync(descriptor, buffer, 0, buffer.length, null);
            if (count === 0) break;
            bytesRead += count;
            if (bytesRead > artifact.byte_count || bytesRead > MAX_ARTIFACT_BYTES) {
                artifactFailure('size_changed_during_read');
            }
            digest.update(buffer.subarray(0, count));
        }

        const after = fs.fstatSync(descriptor, { bigint: true }) as ArtifactStat;
        const pathAfter = lstatArtifact(artifact.path);
        const canonicalAfter = fs.realpathSync(artifact.path);
        if (bytesRead !== artifact.byte_count || !sameFileState(before, after)
            || !sameIdentity(before, pathAfter) || pathAfter.isSymbolicLink()
            || canonicalAfter !== canonicalBefore || canonicalAfter !== artifact.path
            || !contained(root, canonicalAfter)) artifactFailure('changed_during_read');
        if (digest.digest('hex') !== artifact.sha256) artifactFailure('digest_mismatch');
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('forge_host_completion_artifact_')) throw error;
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') artifactFailure('missing');
        if (code === 'ELOOP') artifactFailure('symlink');
        artifactFailure('read_failed');
    } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
    }
}

function verifyArtifactBytes(input: ForgeHostCompleteInput): void {
    const root = secureArtifactRoot(input);
    let aggregateBytes = 0;
    for (const artifact of input.artifact_manifest.artifacts) {
        aggregateBytes += artifact.byte_count;
        if (aggregateBytes > MAX_ARTIFACT_BYTES) artifactFailure('aggregate_too_large');
        verifyArtifactFile(root, artifact);
    }
    if (aggregateBytes !== input.artifact_manifest.total_bytes) artifactFailure('aggregate_size_mismatch');
}

function existingTicket(db: Database.Database, executionReceiptId: string): { ticket_id: string } | null {
    const row = db.prepare(
        'SELECT ticket_id FROM hall_forge_validation_tickets WHERE execution_receipt_id = ?',
    ).get(executionReceiptId) as { ticket_id?: string } | undefined;
    return row?.ticket_id ? { ticket_id: row.ticket_id } : null;
}

function assertBindings(
    db: Database.Database,
    input: ForgeHostCompleteInput,
): { attempt: HallForgeAttemptRecord; request: HallForgeRequestRecord } {
    if (input.handoff_sha256 !== handoffHash(input)) {
        throw new Error('forge_host_completion_handoff_hash_mismatch');
    }
    if (input.job.dispatch_receipt_sha256 !== dispatchReceiptHash(input)) {
        throw new Error('forge_host_completion_job_hash_mismatch');
    }
    const attempt = getForgeAttemptByExecutionReceipt(db, input.execution_receipt_id);
    if (!attempt) throw new Error('forge_host_completion_execution_receipt_not_found');
    if (attempt.attempt_id !== input.attempt_id) {
        throw new Error('forge_host_completion_attempt_mismatch');
    }
    const request = getForgeRequest(db, attempt.request_id);
    if (!request) throw new Error('forge_host_completion_request_not_found');
    assertCurrentForgeV3(request);
    if (request.request_id !== input.forge_request_receipt_id) {
        throw new Error('forge_host_completion_request_mismatch');
    }
    if (request.request_sha256 !== input.request_sha256) {
        throw new Error('forge_host_completion_request_hash_mismatch');
    }
    if (request.target_paths_sha256 !== input.scope_sha256) {
        throw new Error('forge_host_completion_scope_hash_mismatch');
    }
    if (request.active_attempt_id !== attempt.attempt_id) {
        throw new Error('forge_host_completion_active_attempt_mismatch');
    }
    if (attempt.idempotency_key !== input.idempotency_key
        || input.job.idempotency_key !== input.idempotency_key
        || input.job.job_id !== input.host_job_id) {
        throw new Error('forge_host_completion_job_identity_mismatch');
    }
    const authorization = getForgeAuthorizationByRequest(db, request.request_id);
    if (!authorization || authorization.authorization_id !== input.job.authorization_id
        || !forgeAuthorizationLineageMatchesRequest(request, authorization)
        || input.job.bead_id !== request.bead_id
        || input.job.decision_id !== request.decision_id
        || input.job.authorization_expires_at !== authorization.expires_at
        || input.job.execution_deadline_at !== authorization.expires_at) {
        throw new Error('forge_host_completion_authorization_mismatch');
    }
    const binding = input.job.validation_ticket_binding;
    const ticketRequest = input.job.validation_ticket_request;
    if (!binding || !ticketRequest
        || binding.repository_id !== request.repo_id
        || binding.bead_id !== request.bead_id
        || ticketRequest.repository_id !== request.repo_id
        || ticketRequest.bead_id !== request.bead_id
        || binding.execution_receipt_id !== input.execution_receipt_id
        || ticketRequest.execution_receipt_id !== input.execution_receipt_id
        || binding.attempt_id !== input.attempt_id
        || ticketRequest.attempt_id !== input.attempt_id
        || binding.scope_sha256 !== input.scope_sha256
        || ticketRequest.scope_sha256 !== input.scope_sha256) {
        throw new Error('forge_host_completion_ticket_binding_mismatch');
    }
    if (attempt.provider && attempt.provider !== 'codex-host') {
        throw new Error('forge_host_completion_provider_mismatch');
    }
    if (attempt.requested_model && attempt.requested_model !== input.job.requested_model) {
        throw new Error('forge_host_completion_requested_model_mismatch');
    }
    if ((attempt.provider_requests_started ?? 0) !== 0
        || (attempt.provider_requests_completed ?? 0) !== 0
        || (attempt.provider_requests_ambiguous ?? 0) !== 0
        || attempt.live_source_collection === 1
        || attempt.known_spend_observed === 1
        || attempt.live_spend === 1) {
        throw new Error('forge_host_completion_zero_spend_evidence_mismatch');
    }
    return { attempt, request };
}

function normalizeZeroSpendEvidence(
    db: Database.Database,
    attemptId: string,
    externalExecutionId: string,
): void {
    const changed = db.prepare(`
        UPDATE hall_forge_attempts
        SET provider_evidence_valid = 1,
            provider_requests_started = 0,
            provider_requests_completed = 0,
            provider_requests_ambiguous = 0,
            live_spend = 0,
            live_spend_unknown = 0,
            known_spend_observed = 0,
            live_source_collection = 0,
            updated_at = updated_at
        WHERE attempt_id = ? AND status = 'STARTED' AND external_execution_id = ?
    `).run(attemptId, externalExecutionId);
    if (Number(changed.changes) !== 1) {
        throw new Error('forge_host_completion_spend_normalization_race');
    }
}

function validatorIds(input: ForgeHostCompleteInput): { threadId: string; turnId: string } | null {
    const threadId = input.validator_thread_id
        ?? input.job.validation_ticket_request?.validator_thread_id;
    const turnId = input.validator_turn_id
        ?? input.job.validation_ticket_request?.validator_turn_id;
    return threadId && turnId ? { threadId, turnId } : null;
}

function issueOrPermitTicket(
    db: Database.Database,
    input: ForgeHostCompleteInput,
    request: HallForgeRequestRecord,
    attempt: HallForgeAttemptRecord,
    now: number,
    replayed: boolean,
): Pick<ForgeHostWorkerCompletionResult, 'validation_ticket_status' | 'validation_ticket'> {
    const stored = existingTicket(db, attempt.execution_receipt_id);
    if (stored) return { validation_ticket_status: 'already_issued' };
    if (replayed) return { validation_ticket_status: 'permitted_replay' };
    const ids = validatorIds(input);
    if (!ids) return { validation_ticket_status: 'permitted' };
    const ticket = issueIndependentValidatorTicket(db, {
        repository_id: request.repo_id,
        bead_id: request.bead_id,
        execution_receipt_id: attempt.execution_receipt_id,
        attempt_id: attempt.attempt_id,
        scope_sha256: request.target_paths_sha256,
        validator_thread_id: ids.threadId,
        validator_turn_id: ids.turnId,
        expires_at: input.job.validation_ticket_request?.expires_at,
        now,
    });
    return { validation_ticket_status: 'issued', validation_ticket: ticket };
}

export function completeForgeHostWorker(
    db: Database.Database,
    rawInput: unknown,
): ForgeHostWorkerCompletionResult {
    const input = validInput(rawInput);
    const { attempt: initialAttempt, request } = assertBindings(db, input);
    const fingerprint = completionFingerprint(input);
    const externalExecutionId = `${COMPLETION_EXTERNAL_ID_PREFIX}${input.host_job_id}:${fingerprint}`;
    const artifactSha = input.result_artifact_sha256
        ?? input.artifact_manifest.artifacts[0]!.sha256;

    if (initialAttempt.status === 'UNKNOWN') {
        throw new Error('forge_host_completion_unknown_attempt');
    }
    if (initialAttempt.status !== 'STARTED') {
        throw new Error(`forge_host_completion_terminal_attempt:${initialAttempt.status}`);
    }
    if (initialAttempt.result_status?.startsWith(DELIVERY_PREFIX)) {
        if (initialAttempt.external_execution_id !== externalExecutionId
            || initialAttempt.result_artifact_sha256 !== artifactSha
            || initialAttempt.result_status !== `${DELIVERY_PREFIX}${input.result_status}`) {
            throw new Error('forge_host_completion_replay_conflict');
        }
        verifyArtifactBytes(input);
        const replayedAttempt = getForgeAttemptByExecutionReceipt(db, input.execution_receipt_id)!;
        return {
            replayed: true,
            completion_fingerprint_sha256: fingerprint,
            artifact_manifest_sha256: artifactManifestHash(input),
            attempt: replayedAttempt,
            request,
            ...issueOrPermitTicket(db, input, request, replayedAttempt, input.observed_at ?? Date.now(), true),
        };
    }
    if (initialAttempt.result_status) {
        throw new Error('forge_host_completion_existing_delivery_conflict');
    }

    verifyArtifactBytes(input);
    const durable = db.transaction(() => {
        const delivered = recordForgeDelivery(db, {
            attempt_id: initialAttempt.attempt_id,
            external_execution_id: externalExecutionId,
            result_status: input.result_status,
            result_artifact_sha256: artifactSha,
            provider: 'codex-host',
            requested_model: input.job.requested_model,
            actual_model: input.job.actual_identity ?? undefined,
            model_source: input.job.actual_identity ? 'host_attestation' : 'unreported',
            reasoning_profile: input.job.requested_reasoning,
            adapter_version: input.job.schema,
            now: input.observed_at,
        });
        normalizeZeroSpendEvidence(db, initialAttempt.attempt_id, externalExecutionId);
        const completedAttempt = getForgeAttemptByExecutionReceipt(db, input.execution_receipt_id)!;
        const validationTicket = issueOrPermitTicket(
            db,
            input,
            delivered.request,
            completedAttempt,
            input.observed_at ?? Date.now(),
            false,
        );
        return { delivered, completedAttempt, validationTicket };
    }).immediate();
    return {
        replayed: false,
        completion_fingerprint_sha256: fingerprint,
        artifact_manifest_sha256: artifactManifestHash(input),
        attempt: durable.completedAttempt,
        request: durable.delivered.request,
        ...durable.validationTicket,
    };
}

export const ingestForgeHostCompletion = completeForgeHostWorker;
