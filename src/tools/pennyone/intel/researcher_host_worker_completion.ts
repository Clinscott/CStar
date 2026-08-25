import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

import {
    appendWorkerJobEvent,
    getWorkerJob,
} from './worker_job_ledger.js';
import {
    beginWorkerJobValidation,
    recordWorkerJobValidation,
} from './worker_job_artifact_ledger.js';
import {
    researcherHostCompleteSchema,
    researcherValidationSubjectSchema,
    type ResearcherHostCompleteInput,
    type ResearcherValidationSubject,
} from '../../cstar-kernel-mcp/contracts/researcher_host_completion.js';
import {
    researcherNativeHandoffHash,
    stableResearcherJson,
} from './researcher_host_worker_dispatch.js';
import type { WorkerJobRecord } from '../../../types/worker_job.js';
import type { McpRequestContext } from '../../cstar-kernel-mcp/contracts/request_context.js';
import { CONTROL_ROOT } from '../../cstar-kernel-mcp/contracts/runtime.js';
import { mcpGuardrail, mcpOutcomeResponse, type McpTextResponse } from '../../cstar-kernel-mcp/contracts/responses.js';
import { getForgeWritableDb } from './forge_hall_store.js';
import { verifyCodexRequestIdentity } from '../../cstar-kernel-mcp/tools/operator_authorization.js';
import {
    verifyHostWorkflowValidationEvidence,
    type HostValidationReceiptInput,
    type HostValidationSubject,
} from '../../cstar-kernel-mcp/tools/host_workflow_validation.js';
import type { ValidationEvidencePayload } from '../../cstar-kernel-mcp/tools/validation_evidence.js';

const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const COMPLETION_EVENT = 'researcher_host_completion';

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function errorCode(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/\s+/g, ' ').slice(0, 256);
}

function validInput(value: unknown): ResearcherHostCompleteInput {
    const parsed = researcherHostCompleteSchema.safeParse(value);
    if (!parsed.success) throw new Error('researcher_host_completion_contract_invalid');
    return parsed.data;
}

function outputRoot(input: ResearcherHostCompleteInput): string {
    const root = input.work_package.output_root;
    const stat = fs.lstatSync(root, { throwIfNoEntry: false });
    if (!stat || !stat.isDirectory() || stat.isSymbolicLink()
        || fs.realpathSync(root) !== root) throw new Error('researcher_host_artifact_root_invalid');
    return root;
}

function contained(root: string, candidate: string): boolean {
    const relative = path.relative(root, candidate);
    return relative !== '' && relative !== '..'
        && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function verifyArtifact(root: string, artifact: ResearcherHostCompleteInput['artifact_manifest']['artifacts'][number]): void {
    if (!path.isAbsolute(artifact.path) || path.resolve(artifact.path) !== artifact.path
        || !contained(root, artifact.path)) throw new Error('researcher_host_artifact_path_invalid');
    const before = fs.lstatSync(artifact.path, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
        || (typeof process.getuid === 'function' && before.uid !== BigInt(process.getuid()))
        || (before.mode & 0o022n) !== 0n || fs.realpathSync(artifact.path) !== artifact.path) {
        throw new Error('researcher_host_artifact_identity_invalid');
    }
    if (before.size !== BigInt(artifact.byte_count) || artifact.byte_count > MAX_ARTIFACT_BYTES) {
        throw new Error('researcher_host_artifact_size_invalid');
    }
    const digest = createHash('sha256');
    const fd = fs.openSync(artifact.path, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
        const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, Math.max(1, artifact.byte_count)));
        let read = 0;
        while (true) {
            const count = fs.readSync(fd, buffer, 0, buffer.length, null);
            if (count === 0) break;
            read += count;
            if (read > artifact.byte_count) throw new Error('researcher_host_artifact_changed_during_read');
            digest.update(buffer.subarray(0, count));
        }
        const after = fs.fstatSync(fd, { bigint: true });
        if (read !== artifact.byte_count || after.dev !== before.dev || after.ino !== before.ino
            || after.size !== before.size || after.mtimeNs !== before.mtimeNs
            || after.ctimeNs !== before.ctimeNs || digest.digest('hex') !== artifact.sha256) {
            throw new Error('researcher_host_artifact_changed_during_read');
        }
    } finally {
        fs.closeSync(fd);
    }
}

function verifyArtifacts(input: ResearcherHostCompleteInput): string {
    const root = outputRoot(input);
    const expected = new Map(input.work_package.expected_artifacts.map((artifact) => [artifact.path, artifact]));
    let total = 0;
    for (const artifact of input.artifact_manifest.artifacts) {
        const declared = expected.get(artifact.path);
        if (!declared || declared.name !== artifact.name || declared.sha256 !== artifact.sha256
            || declared.byte_count !== artifact.byte_count) throw new Error('researcher_host_artifact_manifest_mismatch');
        total += artifact.byte_count;
        if (total > MAX_ARTIFACT_BYTES) throw new Error('researcher_host_artifact_aggregate_too_large');
        verifyArtifact(root, artifact);
    }
    if (expected.size !== input.artifact_manifest.artifacts.length
        || total !== input.artifact_manifest.total_bytes) throw new Error('researcher_host_artifact_manifest_incomplete');
    return sha256(stableResearcherJson(input.artifact_manifest));
}

function completionFingerprint(input: ResearcherHostCompleteInput): string {
    return sha256(stableResearcherJson({
        schema: input.schema, request_id: input.request_id, request_sha256: input.request_sha256,
        bead_id: input.bead_id, set_id: input.set_id, decision_id: input.decision_id,
        authorization_id: input.authorization_id, authorization_sha256: input.authorization_sha256,
        attempt_id: input.attempt_id, host_job_id: input.host_job_id,
        idempotency_key: input.idempotency_key, handoff_sha256: input.handoff_sha256,
        work_package_sha256: input.work_package_sha256, result_status: input.result_status,
        adapter_sha256: input.work_package.adapter_sha256,
        selected_source_manifest_sha256: input.work_package.selected_source_manifest_sha256,
        callable_policy_sha256: input.work_package.callable_policy_sha256,
        source_grants_sha256: input.work_package.source_grants_sha256,
        source_budget_sha256: input.work_package.source_budget_sha256,
        artifact_manifest: input.artifact_manifest, native_worker_attempts: input.native_worker_attempts,
        source_tool_calls: input.source_tool_calls, source_queries: input.source_queries,
        source_provider_requests_started: input.source_provider_requests_started,
        parse_attempts: input.parse_attempts, actual_identity: input.actual_identity ?? input.job.actual_identity,
    }));
}

function terminalReceiptHash(
    input: ResearcherHostCompleteInput,
    artifactManifestSha256: string,
): string {
    return sha256(stableResearcherJson({
        schema: 'cstar.researcher_terminal_receipt.v1', request_id: input.request_id,
        request_sha256: input.request_sha256, attempt_id: input.attempt_id, job_id: input.host_job_id,
        result_status: input.result_status, artifact_manifest_sha256: artifactManifestSha256,
        requested_model: input.job.requested_model, requested_reasoning: input.job.requested_reasoning,
        selector_status: input.job.selector_status, actual_identity: input.actual_identity ?? input.job.actual_identity,
        native_worker_attempts: 1, source_tool_calls: input.source_tool_calls,
        source_queries: input.source_queries,
        source_provider_requests_started: input.source_provider_requests_started,
        provider_requests_started: 0, hermes_transport_calls: 0,
        legacy_hermes_subprocess_calls: 0, parse_attempts: input.parse_attempts,
        json_repair_attempts: 0, retries: 0, replays: 0, fallbacks: 0,
        provider_switches: 0, descendants: 0, peer_messages: 0,
    }));
}

function existingCompletion(db: Database.Database, jobId: string): string | null {
    const row = db.prepare(`
        SELECT evidence_sha256 FROM hall_worker_job_events
        WHERE job_id = ? AND event_kind = ? ORDER BY created_at DESC, event_id DESC LIMIT 1
    `).get(jobId, COMPLETION_EVENT) as { evidence_sha256?: string } | undefined;
    return row?.evidence_sha256 && SHA256.test(row.evidence_sha256) ? row.evidence_sha256 : null;
}

function dispatchReceiptHash(job: ResearcherHostCompleteInput['job']): string {
    const { dispatch_receipt_sha256: _ignored, ...unsigned } = job;
    return sha256(stableResearcherJson(unsigned));
}

function assertJobBinding(db: Database.Database, input: ResearcherHostCompleteInput): WorkerJobRecord {
    const job = getWorkerJob(db, input.host_job_id);
    if (!job) throw new Error('researcher_host_completion_job_not_found');
    if (job.worker_kind !== 'researcher' || job.job_id !== input.host_job_id
        || job.attempt_id !== input.attempt_id || job.canonical_request_id !== input.request_id
        || job.canonical_request_sha256 !== input.request_sha256
        || job.bead_id !== input.bead_id || job.decision_id !== input.decision_id
        || job.authorization_id !== input.authorization_id) throw new Error('researcher_host_completion_binding_mismatch');
    if (input.job.job_id !== job.job_id || input.job.attempt_id !== job.attempt_id
        || input.job.canonical_request_id !== job.canonical_request_id
        || input.job.canonical_request_sha256 !== job.canonical_request_sha256) {
        throw new Error('researcher_host_completion_job_contract_mismatch');
    }
    if (input.work_package.job_id !== job.job_id || input.work_package.attempt_id !== job.attempt_id) {
        throw new Error('researcher_host_completion_work_package_mismatch');
    }
    if (input.handoff_sha256 !== researcherNativeHandoffHash(input.work_package, input.job)
        || input.work_package_sha256 !== sha256(stableResearcherJson(input.work_package))) {
        throw new Error('researcher_host_completion_hash_mismatch');
    }
    return job;
}

function insertArtifacts(
    db: Database.Database,
    job: WorkerJobRecord,
    input: ResearcherHostCompleteInput,
    now: number,
): void {
    for (const artifact of input.artifact_manifest.artifacts) {
        const artifactId = `researcher-artifact-${sha256(`${job.attempt_id}\n${artifact.name}\n${artifact.sha256}`).slice(0, 32)}`;
        const storageRef = `cstar-storage:researcher/${job.attempt_id}/${artifact.name.replace(/[^A-Za-z0-9._-]/g, '-')}`;
        db.prepare(`
            INSERT INTO hall_worker_job_artifacts (
                artifact_id, job_id, attempt_id, artifact_kind, name, media_type,
                byte_count, sha256, storage_ref, status, created_at, updated_at
            ) VALUES (?, ?, ?, 'report', ?, ?, ?, ?, ?, 'DELIVERED_UNVERIFIED', ?, ?)
        `).run(artifactId, job.job_id, job.attempt_id, artifact.name, artifact.media_type,
            artifact.byte_count, artifact.sha256, storageRef, now, now);
    }
}

export interface ResearcherHostWorkerCompletionResult {
    replayed: boolean;
    completion_fingerprint_sha256: string;
    artifact_manifest_sha256: string;
    terminal_receipt_sha256: string;
    attempt: WorkerJobRecord;
    validation_binding: ResearcherValidationSubject;
}

export function completeResearcherHostWorker(
    db: Database.Database,
    rawInput: unknown,
    now = Date.now(),
): ResearcherHostWorkerCompletionResult {
    const input = validInput(rawInput);
    const job = assertJobBinding(db, input);
    const fingerprint = completionFingerprint(input);
    const artifactManifestSha256 = verifyArtifacts(input);
    const terminalHash = terminalReceiptHash(input, artifactManifestSha256);
    const existing = existingCompletion(db, job.job_id);
    if (existing) {
        if (existing !== fingerprint) throw new Error('researcher_host_completion_replay_conflict');
        const binding = researcherValidationSubjectSchema.parse({
            schema: 'cstar.researcher_validation_subject.v1', subject_kind: 'researcher_execution',
            request_id: input.request_id, request_sha256: input.request_sha256,
            bead_id: input.bead_id, job_id: job.job_id, attempt_id: job.attempt_id,
            work_package_sha256: input.work_package_sha256, handoff_sha256: input.handoff_sha256,
            terminal_receipt_sha256: terminalHash, output_manifest_sha256: artifactManifestSha256,
            one_use: true, validator_identity: 'unreported',
        });
        return {
            replayed: true, completion_fingerprint_sha256: fingerprint,
            artifact_manifest_sha256: artifactManifestSha256,
            terminal_receipt_sha256: terminalHash, attempt: job, validation_binding: binding,
        };
    }
    if (!['LEASED', 'RUNNING'].includes(job.state)) {
        throw new Error(`researcher_host_completion_terminal_attempt:${job.state}`);
    }
    if (!Number.isSafeInteger(now) || now < job.created_at) throw new Error('researcher_host_completion_time_invalid');
    const durable = db.transaction(() => {
        const current = getWorkerJob(db, job.job_id);
        if (!current || !['LEASED', 'RUNNING'].includes(current.state)) {
            throw new Error('researcher_host_completion_state_race');
        }
        if (current.state === 'LEASED') {
            db.prepare(`UPDATE hall_worker_jobs SET state = 'RUNNING', progress_phase = 'working', updated_at = ?, version = version + 1 WHERE job_id = ?`).run(now, current.job_id);
        }
        const running = getWorkerJob(db, current.job_id)!;
        insertArtifacts(db, running, input, now);
        db.prepare(`
            UPDATE hall_worker_jobs SET state = 'DELIVERED_UNVERIFIED', progress_percent = 100,
                progress_phase = 'delivered', terminal_at = NULL, updated_at = ?, version = version + 1
            WHERE job_id = ?
        `).run(now, running.job_id);
        db.prepare('DELETE FROM hall_worker_job_leases WHERE job_id = ?').run(running.job_id);
        const delivered = getWorkerJob(db, running.job_id)!;
        appendWorkerJobEvent(db, delivered, COMPLETION_EVENT, fingerprint,
            `terminal_receipt_sha256=${terminalHash};work_package_sha256=${input.work_package_sha256};handoff_sha256=${input.handoff_sha256};output_manifest_sha256=${artifactManifestSha256}`);
        return delivered;
    }).immediate();
    const binding = researcherValidationSubjectSchema.parse({
        schema: 'cstar.researcher_validation_subject.v1', subject_kind: 'researcher_execution',
        request_id: input.request_id, request_sha256: input.request_sha256,
        bead_id: input.bead_id, job_id: durable.job_id, attempt_id: durable.attempt_id,
        work_package_sha256: input.work_package_sha256, handoff_sha256: input.handoff_sha256,
        terminal_receipt_sha256: terminalHash, output_manifest_sha256: artifactManifestSha256,
        one_use: true, validator_identity: 'unreported',
    });
    return {
        replayed: false, completion_fingerprint_sha256: fingerprint,
        artifact_manifest_sha256: artifactManifestSha256,
        terminal_receipt_sha256: terminalHash, attempt: durable, validation_binding: binding,
    };
}

export interface ResearcherValidationRecordInput {
    subject: ResearcherValidationSubject;
    verdict: 'ACCEPTED' | 'REJECTED' | 'INCONCLUSIVE';
    validation_id: string;
    evidence_sha256: string;
    validator_identity: string;
    notes?: string;
}

export function recordResearcherValidation(
    db: Database.Database,
    input: ResearcherValidationRecordInput,
    now = Date.now(),
): WorkerJobRecord {
    const subject = researcherValidationSubjectSchema.parse(input.subject);
    if (!input.validation_id || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/.test(input.validation_id)
        || !SHA256.test(input.evidence_sha256) || !input.validator_identity.trim()
        || input.validator_identity === 'unreported') throw new Error('researcher_validation_identity_invalid');
    const job = getWorkerJob(db, subject.job_id);
    if (!job || job.worker_kind !== 'researcher' || job.attempt_id !== subject.attempt_id
        || job.canonical_request_id !== subject.request_id
        || job.canonical_request_sha256 !== subject.request_sha256 || job.bead_id !== subject.bead_id) {
        throw new Error('researcher_validation_subject_mismatch');
    }
    const completion = db.prepare(`
        SELECT detail FROM hall_worker_job_events WHERE job_id = ? AND event_kind = ?
        ORDER BY created_at DESC, event_id DESC LIMIT 1
    `).get(job.job_id, COMPLETION_EVENT) as { detail?: string } | undefined;
    if (!completion?.detail || !completion.detail.includes(`terminal_receipt_sha256=${subject.terminal_receipt_sha256}`)
        || !completion.detail.includes(`work_package_sha256=${subject.work_package_sha256}`)
        || !completion.detail.includes(`handoff_sha256=${subject.handoff_sha256}`)
        || !completion.detail.includes(`output_manifest_sha256=${subject.output_manifest_sha256}`)) {
        throw new Error('researcher_validation_binding_mismatch');
    }
    if (!['DELIVERED_UNVERIFIED', 'VALIDATING', 'ACCEPTED', 'DOMAIN_TERMINAL', 'NEEDS_INPUT'].includes(job.state)) {
        throw new Error(`researcher_validation_state_invalid:${job.state}`);
    }
    const mapped = input.verdict === 'ACCEPTED' ? 'ACCEPTED' : 'DOMAIN_TERMINAL';
    const validating = job.state === 'DELIVERED_UNVERIFIED'
        ? beginWorkerJobValidation(db, job.job_id, now) : job;
    return recordWorkerJobValidation(db, validating.job_id, {
        validation_id: input.validation_id, verdict: mapped,
        evidence_sha256: input.evidence_sha256, summary: input.notes,
    }, now);
}

export function researcherCompletionError(error: unknown): string {
    return errorCode(error);
}

export async function handleResearcherRecordResult(input: {
    bead_id: string;
    verdict: 'ACCEPTED' | 'REJECTED' | 'INCONCLUSIVE' | 'SUCCESS' | 'FAILURE';
    notes?: string;
    validation_id?: string;
    researcher_validation_subject?: ResearcherValidationSubject;
    researcher_execution?: ResearcherValidationSubject;
    host_validation_receipt?: HostValidationReceiptInput;
    validation_evidence?: ValidationEvidencePayload;
}, requestContext?: McpRequestContext): Promise<McpTextResponse> {
    const subject = input.researcher_validation_subject ?? input.researcher_execution;
    if (!subject) return mcpOutcomeResponse('guardrail_block', {
        status: 'validation_not_recorded', error_code: 'researcher_subject_required',
        error: 'A Researcher result requires subject_kind=researcher_execution and its one-use binding.',
    });
    try {
        const requestIdentity = await verifyCodexRequestIdentity(requestContext);
        const validationId = input.validation_id?.trim()
            || `researcher-validation-${sha256(`${subject.job_id}\n${subject.attempt_id}\n${input.verdict}`).slice(0, 32)}`;
        const positive = input.verdict === 'ACCEPTED' || input.verdict === 'SUCCESS';
        const verified = input.host_validation_receipt
            ? verifyHostWorkflowValidationEvidence(
                CONTROL_ROOT,
                input.validation_evidence,
                input.host_validation_receipt,
                {
                    repository_id: 'cstar', bead_id: subject.bead_id, target_path: null,
                    validation_id: validationId, verdict: input.verdict,
                    subject_kind: 'researcher_execution',
                    execution_receipt_id: subject.request_id,
                    attempt_id: subject.attempt_id,
                    request_sha256: subject.request_sha256,
                } satisfies HostValidationSubject,
                requestIdentity,
            ) : null;
        if (positive && !verified) throw new Error('researcher_validation_independent_evidence_required');
        const evidenceSha256 = verified?.evidence_sha256
            ?? input.validation_evidence?.checks?.[0]?.sha256
            ?? sha256(stableResearcherJson({ subject, verdict: input.verdict, notes: input.notes ?? null }));
        const db = getForgeWritableDb(CONTROL_ROOT);
        const job = recordResearcherValidation(db, {
            subject: { ...subject, validator_identity: verified?.validator_identity ?? subject.validator_identity },
            verdict: input.verdict === 'SUCCESS' ? 'ACCEPTED'
                : input.verdict === 'FAILURE' ? 'REJECTED' : input.verdict,
            validation_id: validationId, evidence_sha256: evidenceSha256,
            validator_identity: verified?.validator_identity ?? subject.validator_identity,
            notes: input.notes,
        });
        return mcpOutcomeResponse('ok', {
            schema: 'cstar.researcher_validation_receipt.v1', status: 'recorded_verified',
            bead_id: subject.bead_id, subject_kind: 'researcher_execution',
            job_id: subject.job_id, attempt_id: subject.attempt_id,
            request_id: subject.request_id, validation_id: validationId,
            reported_verdict: input.verdict, stored_verdict: input.verdict,
            validation_authority: verified ? 'verified_v3' : 'reported_negative',
            validation_persisted: true, authoritative: Boolean(verified),
            validator_identity: verified?.validator_identity ?? subject.validator_identity,
            evidence_sha256: evidenceSha256, worker_job_state: job.state,
            guardrail: mcpGuardrail('caution', 'verify',
                'Researcher validation was recorded independently; source acceptance and runtime activation remain separate gates.',
                [], ['researcher_runtime_activation_held']),
        });
    } catch (error) {
        const message = researcherCompletionError(error);
        return mcpOutcomeResponse('guardrail_block', {
            status: 'validation_not_recorded', error_code: 'researcher_validation_blocked',
            error: message, subject_kind: 'researcher_execution', validation_persisted: false,
            guardrail: mcpGuardrail('block', 'refuse',
                'Researcher result binding failed closed; no positive acceptance was recorded.',
                [message], ['researcher_validation_binding']),
        });
    }
}
