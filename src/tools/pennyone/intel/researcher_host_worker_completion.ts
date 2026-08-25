import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

import {
    researcherHostCompleteSchema,
    researcherValidationBindingSchema,
    researcherValidationReceiptSchema,
    researcherValidationResultSchema,
    researcherValidationSubjectSchema,
    type ResearcherHostCompleteInput,
    type ResearcherValidationBinding,
    type ResearcherValidationReceipt,
    type ResearcherValidationResultInput,
    type ResearcherValidationSubjectInput,
} from '../../cstar-kernel-mcp/contracts/researcher_host_completion.js';
import type {
    CodexHostWorkerJobContract,
    WorkerJobArtifactRecord,
    WorkerJobRecord,
    WorkerJobValidationVerdict,
} from '../../../types/worker_job.js';
import {
    assertResearcherHostJob,
    researcherDigest,
    researcherHandoffHash,
    stableResearcherJson,
    readResearcherHostWorkerHandoff,
} from './researcher_host_worker_dispatch.js';
import {
    appendWorkerJobEvent,
    getWorkerJob,
    markWorkerJobRunning,
    requireWorkerJobLease,
    recordWorkerJobExecutionEvidence,
} from './worker_job_ledger.js';
import {
    beginWorkerJobValidation,
    deliverWorkerJobArtifacts,
    listWorkerJobArtifacts,
    recordWorkerJobValidation,
    stageWorkerJobArtifact,
} from './worker_job_artifact_ledger.js';
import { failWorkerJob, freezeWorkerJobUnknown } from './worker_job_lifecycle.js';

const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const SAFE_MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[^\s]{1,127}$/i;

function parseCompletion(raw: unknown): ResearcherHostCompleteInput {
    const parsed = researcherHostCompleteSchema.safeParse(raw);
    if (!parsed.success) throw new Error('cstar_researcher_host_completion_contract_invalid');
    return parsed.data;
}

function inputWorkPackage(input: ResearcherHostCompleteInput): Record<string, unknown> {
    const packageValue = input.work_package ?? input.native_work_package;
    if (!packageValue) throw new Error('cstar_researcher_work_package_missing');
    return packageValue as unknown as Record<string, unknown>;
}

function canonicalArtifactManifest(input: ResearcherHostCompleteInput): string {
    return researcherDigest(input.artifact_manifest);
}

function completionFingerprint(input: ResearcherHostCompleteInput): string {
    return researcherDigest({
        schema: input.schema,
        request_id: input.request_id,
        request_sha256: input.request_sha256,
        job_id: input.job_id,
        attempt_id: input.attempt_id,
        handoff_sha256: input.handoff_sha256,
        terminal_receipt: input.terminal_receipt,
        artifact_manifest: input.artifact_manifest,
        provider_requests_started: input.provider_requests_started,
        source_tool_calls: input.source_tool_calls,
    });
}

function assertCompletionBindings(input: ResearcherHostCompleteInput): Record<string, unknown> {
    const job = assertResearcherHostJob(input.job);
    const workPackage = inputWorkPackage(input);
    if (job.job_id !== input.job_id || job.attempt_id !== input.attempt_id
        || job.canonical_request_id !== input.request_id
        || job.canonical_request_sha256 !== input.request_sha256
        || job.provider_requests_started !== 0 || job.network_accessed
        || job.cognition_launch || job.cstar_launch || job.host_launch_required !== true) {
        throw new Error('cstar_researcher_completion_identity_mismatch');
    }
    if (String(workPackage.request_id) !== input.request_id
        || String(workPackage.request_sha256) !== input.request_sha256
        || String(workPackage.job_id) !== input.job_id
        || String(workPackage.attempt_id) !== input.attempt_id
        || researcherHandoffHash(workPackage, job) !== input.handoff_sha256) {
        throw new Error('cstar_researcher_completion_handoff_hash_mismatch');
    }
    const binding = workPackage.adapter_binding as Record<string, unknown> | undefined;
    if (!binding || binding.adapter_id !== job.adapter_id
        || binding.adapter_sha256 !== job.adapter_sha256
        || binding.selected_source_manifest_sha256 !== job.selected_source_manifest_sha256
        || binding.callable_policy_sha256 !== job.callable_policy_sha256) {
        throw new Error('cstar_researcher_completion_adapter_binding_mismatch');
    }
    const terminal = input.terminal_receipt;
    if (terminal.actual_identity !== job.actual_identity
        && !(job.actual_identity === null && terminal.actual_identity === 'unreported')) {
        throw new Error('cstar_researcher_completion_identity_mismatch');
    }
    return workPackage;
}

interface FileStat {
    dev: bigint;
    ino: bigint;
    mode: bigint;
    nlink: bigint;
    size: bigint;
    mtimeNs: bigint;
    ctimeNs: bigint;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
}

function statFile(filePath: string): FileStat {
    return fs.lstatSync(filePath, { bigint: true }) as unknown as FileStat;
}

function sameFileState(left: FileStat, right: FileStat): boolean {
    return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
        && left.nlink === right.nlink && left.size === right.size
        && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function pathInside(root: string, candidate: string): boolean {
    const relative = path.relative(root, candidate);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relative);
}

function assertArtifactPath(
    workPackage: Record<string, unknown>,
    artifactPath: string,
): void {
    if (!path.isAbsolute(artifactPath) || path.resolve(artifactPath) !== artifactPath) {
        throw new Error('cstar_researcher_artifact_path_invalid');
    }
    const boundary = workPackage.output_boundary as {
        root?: string | null;
        allowed_paths?: string[];
        public_artifact_paths?: string[];
    } | undefined;
    if (!boundary) throw new Error('cstar_researcher_output_boundary_missing');
    const allowed = [...(boundary.allowed_paths ?? []), ...(boundary.public_artifact_paths ?? [])];
    if (allowed.length > 0 && !allowed.includes(artifactPath)) {
        throw new Error('cstar_researcher_artifact_not_declared');
    }
    if (boundary.root) {
        if (!pathInside(boundary.root, artifactPath)) throw new Error('cstar_researcher_artifact_escape');
        if (fs.realpathSync(boundary.root) !== boundary.root) throw new Error('cstar_researcher_output_root_identity_invalid');
    } else if (allowed.length === 0) {
        throw new Error('cstar_researcher_output_boundary_missing');
    }
}

function readArtifact(
    workPackage: Record<string, unknown>,
    artifact: ResearcherHostCompleteInput['artifact_manifest']['artifacts'][number],
): void {
    let descriptor: number | undefined;
    try {
        assertArtifactPath(workPackage, artifact.path);
        const beforePath = statFile(artifact.path);
        if (beforePath.isSymbolicLink() || !beforePath.isFile() || beforePath.nlink !== 1n) {
            throw new Error('cstar_researcher_artifact_identity_invalid');
        }
        if (beforePath.size !== BigInt(artifact.byte_count) || artifact.byte_count > MAX_ARTIFACT_BYTES) {
            throw new Error('cstar_researcher_artifact_size_mismatch');
        }
        if (fs.realpathSync(artifact.path) !== artifact.path) {
            throw new Error('cstar_researcher_artifact_identity_invalid');
        }
        descriptor = fs.openSync(artifact.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        const opened = fs.fstatSync(descriptor, { bigint: true }) as unknown as FileStat;
        if (!sameFileState(beforePath, opened)) throw new Error('cstar_researcher_artifact_identity_invalid');
        const digest = crypto.createHash('sha256');
        const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, Math.max(1, artifact.byte_count)));
        let bytes = 0;
        while (true) {
            const count = fs.readSync(descriptor, buffer, 0, buffer.length, null);
            if (count === 0) break;
            bytes += count;
            if (bytes > artifact.byte_count || bytes > MAX_ARTIFACT_BYTES) {
                throw new Error('cstar_researcher_artifact_size_changed');
            }
            digest.update(buffer.subarray(0, count));
        }
        const after = fs.fstatSync(descriptor, { bigint: true }) as unknown as FileStat;
        if (bytes !== artifact.byte_count || digest.digest('hex') !== artifact.sha256
            || !sameFileState(beforePath, after)) {
            throw new Error('cstar_researcher_artifact_digest_mismatch');
        }
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('cstar_researcher_')) throw error;
        throw new Error('cstar_researcher_artifact_read_failed');
    } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
    }
}

function artifactIdentity(
    jobId: string,
    artifact: ResearcherHostCompleteInput['artifact_manifest']['artifacts'][number],
): { artifact_id: string; storage_ref: string } {
    const id = researcherDigest({ jobId, path: artifact.path, name: artifact.name,
        artifact_kind: artifact.artifact_kind, sha256: artifact.sha256 });
    return {
        artifact_id: `researcher-artifact-${id.slice(0, 32)}`,
        storage_ref: `cstar-storage:researcher/${jobId}/${id.slice(0, 32)}`,
    };
}

function sameDeliveredManifest(
    artifacts: WorkerJobArtifactRecord[],
    input: ResearcherHostCompleteInput,
): boolean {
    if (artifacts.length !== input.artifact_manifest.artifacts.length
        || artifacts.some((artifact) => artifact.status !== 'DELIVERED_UNVERIFIED')) return false;
    return input.artifact_manifest.artifacts.every((candidate) => {
        const identity = artifactIdentity(input.job_id, candidate);
        const found = artifacts.find((artifact) => artifact.artifact_id === identity.artifact_id);
        return !!found && found.attempt_id === input.attempt_id
            && found.name === candidate.name && found.artifact_kind === candidate.artifact_kind
            && found.byte_count === candidate.byte_count && found.sha256 === candidate.sha256
            && found.storage_ref === identity.storage_ref;
    });
}

function validationBinding(
    input: ResearcherHostCompleteInput,
    workPackage: Record<string, unknown>,
): ResearcherValidationBinding {
    const binding = workPackage.adapter_binding as Record<string, string>;
    const request = workPackage.request as Record<string, unknown>;
    return researcherValidationBindingSchema.parse({
        schema: 'cstar.researcher_validation_binding.v1',
        request_id: input.request_id, request_sha256: input.request_sha256,
        job_id: input.job_id, attempt_id: input.attempt_id,
        handoff_sha256: input.handoff_sha256, adapter_id: binding.adapter_id,
        adapter_sha256: binding.adapter_sha256,
        selected_source_manifest_sha256: binding.selected_source_manifest_sha256,
        callable_policy_sha256: binding.callable_policy_sha256,
        source_grants_sha256: researcherDigest(request.source_grants ?? []),
        source_budget_sha256: researcherDigest(request.source_budget ?? {}),
        output_manifest_sha256: canonicalArtifactManifest(input), one_use: true,
    }) as ResearcherValidationBinding;
}

export interface ResearcherHostWorkerCompletionResult {
    replayed: boolean;
    fingerprint_sha256: string;
    artifact_manifest_sha256: string;
    job: WorkerJobRecord;
    validation_binding: Record<string, unknown>;
    terminal_receipt: ResearcherHostCompleteInput['terminal_receipt'];
}

export function completeResearcherHostWorker(
    db: Database.Database,
    rawInput: unknown,
    now = Date.now(),
): ResearcherHostWorkerCompletionResult {
    const input = parseCompletion(rawInput);
    const workPackage = assertCompletionBindings(input);
    const current = getWorkerJob(db, input.job_id);
    if (!current || current.attempt_id !== input.attempt_id) throw new Error('cstar_researcher_completion_unknown_attempt');
    const fingerprint = completionFingerprint(input);
    const binding = validationBinding(input, workPackage);
    if (current.state === 'DELIVERED_UNVERIFIED') {
        const artifacts = listWorkerJobArtifacts(db, input.job_id);
        const prior = db.prepare("SELECT detail FROM hall_worker_job_events WHERE job_id = ? AND event_kind = 'researcher_completion' ORDER BY created_at DESC LIMIT 1").get(input.job_id) as { detail?: string } | undefined;
        if (input.terminal_receipt.outcome !== 'DELIVERED_UNVERIFIED' || prior?.detail !== fingerprint
            || !sameDeliveredManifest(artifacts, input)
            || current.provider_evidence.provider_requests_started !== input.provider_requests_started) {
            throw new Error('cstar_researcher_completion_replay_conflict');
        }
        return { replayed: true, fingerprint_sha256: fingerprint,
            artifact_manifest_sha256: canonicalArtifactManifest(input), job: current,
            validation_binding: binding, terminal_receipt: input.terminal_receipt };
    }
    if (['ACCEPTED', 'REJECTED', 'NEEDS_INPUT', 'DOMAIN_TERMINAL', 'FAILED', 'UNKNOWN', 'CANCELLED'].includes(current.state)) {
        throw new Error(`cstar_researcher_completion_terminal_attempt:${current.state}`);
    }
    const leaseToken = input.lease_token;
    if (!leaseToken) throw new Error('cstar_researcher_completion_lease_required');
    const observedAt = Math.max(now, input.observed_at);
    if (input.terminal_receipt.outcome === 'UNKNOWN') {
        requireWorkerJobLease(db, current, leaseToken, observedAt);
        const frozen = freezeWorkerJobUnknown(db, input.job_id, 'RESEARCHER_HOST_UNKNOWN', 'Host returned UNKNOWN.', observedAt);
        appendWorkerJobEvent(db, frozen, 'researcher_completion', canonicalArtifactManifest(input), fingerprint);
        return { replayed: false, fingerprint_sha256: fingerprint,
            artifact_manifest_sha256: canonicalArtifactManifest(input), job: frozen,
            validation_binding: binding, terminal_receipt: input.terminal_receipt };
    }
    if (input.terminal_receipt.outcome === 'REJECTED') {
        let active = current;
        if (active.state === 'RUNNING' && input.provider_requests_started > 0) {
            active = recordWorkerJobExecutionEvidence(db, input.job_id, leaseToken, {
                attempt_id: input.attempt_id, provider_started: true,
                provider_requests_started: input.provider_requests_started, observed_at: observedAt,
                evidence_sha256: researcherDigest({ fingerprint, provider: input.provider_requests_started }),
            }, { attempt_id: input.attempt_id, spend_uncertain: false, known_spend_observed: false,
                observed_at: observedAt, evidence_sha256: researcherDigest({ fingerprint, spend: false }) }, observedAt);
        } else if (active.state === 'LEASED') {
            if (input.provider_requests_started > 0) {
                active = markWorkerJobRunning(db, input.job_id, leaseToken, observedAt);
                active = recordWorkerJobExecutionEvidence(db, input.job_id, leaseToken, {
                    attempt_id: input.attempt_id, provider_started: true,
                    provider_requests_started: input.provider_requests_started, observed_at: observedAt,
                    evidence_sha256: researcherDigest({ fingerprint, provider: input.provider_requests_started }),
                }, { attempt_id: input.attempt_id, spend_uncertain: false, known_spend_observed: false,
                    observed_at: observedAt, evidence_sha256: researcherDigest({ fingerprint, spend: false }) }, observedAt);
            }
        }
        const failed = failWorkerJob(db, input.job_id, leaseToken, 'RESEARCHER_HOST_REJECTED', 'Host returned REJECTED.', observedAt);
        appendWorkerJobEvent(db, failed, 'researcher_completion', canonicalArtifactManifest(input), fingerprint);
        return { replayed: false, fingerprint_sha256: fingerprint,
            artifact_manifest_sha256: canonicalArtifactManifest(input), job: failed,
            validation_binding: binding, terminal_receipt: input.terminal_receipt };
    }
    input.artifact_manifest.artifacts.forEach((artifact) => readArtifact(workPackage, artifact));
    let active = current;
    if (active.state === 'LEASED') active = markWorkerJobRunning(db, input.job_id, leaseToken, observedAt);
    if (input.provider_requests_started < 1) throw new Error('cstar_researcher_completion_provider_start_required');
    active = recordWorkerJobExecutionEvidence(db, input.job_id, leaseToken, {
        attempt_id: input.attempt_id, provider_started: true,
        provider_requests_started: input.provider_requests_started, observed_at: observedAt,
        evidence_sha256: researcherDigest({ fingerprint, provider: input.provider_requests_started }),
    }, { attempt_id: input.attempt_id, spend_uncertain: false, known_spend_observed: false,
        observed_at: observedAt, evidence_sha256: researcherDigest({ fingerprint, spend: false }) }, observedAt);
    for (const artifact of input.artifact_manifest.artifacts) {
        const identity = artifactIdentity(input.job_id, artifact);
        if (!SAFE_MEDIA_TYPE.test(artifact.artifact_kind === 'report' ? 'text/plain' : 'application/octet-stream')) {
            throw new Error('cstar_researcher_artifact_media_type_invalid');
        }
        stageWorkerJobArtifact(db, input.job_id, leaseToken, {
            artifact_id: identity.artifact_id, attempt_id: input.attempt_id,
            artifact_kind: artifact.artifact_kind, name: artifact.name,
            media_type: artifact.artifact_kind === 'report' ? 'text/plain' : 'application/octet-stream',
            byte_count: artifact.byte_count, sha256: artifact.sha256, storage_ref: identity.storage_ref,
        }, observedAt);
    }
    const delivered = deliverWorkerJobArtifacts(db, input.job_id, leaseToken, observedAt);
    appendWorkerJobEvent(db, delivered, 'researcher_completion', canonicalArtifactManifest(input), fingerprint);
    return { replayed: false, fingerprint_sha256: fingerprint,
        artifact_manifest_sha256: canonicalArtifactManifest(input), job: delivered,
        validation_binding: binding, terminal_receipt: input.terminal_receipt };
}

function subjectFromReceipt(receipt: ResearcherValidationReceipt): ResearcherValidationSubjectInput {
    return researcherValidationSubjectSchema.parse(receipt.subject);
}

function assertSubjectBinding(
    db: Database.Database,
    subject: ResearcherValidationSubjectInput,
    controlRoot?: string,
): WorkerJobRecord {
    const job = getWorkerJob(db, subject.job_id);
    if (!job || job.attempt_id !== subject.attempt_id
        || job.canonical_request_id !== subject.request_id
        || job.canonical_request_sha256 !== subject.request_sha256
        || job.worker_kind !== 'researcher') throw new Error('cstar_researcher_validation_subject_mismatch');
    if (subject.validator_identity === subject.validator_thread_id
        || subject.validator_identity === subject.validator_turn_id
        || subject.validator_identity === 'unreported'
        || subject.validator_identity === 'codex-host') {
        throw new Error('cstar_researcher_validation_validator_not_independent');
    }
    if (controlRoot) {
        const handoff = readResearcherHostWorkerHandoff(controlRoot, subject.request_id);
        if (handoff.handoff_sha256 !== subject.handoff_sha256
            || researcherDigest(handoff.work_package?.adapter_binding ?? {}) !== researcherDigest({
                adapter_id: subject.adapter_id, adapter_sha256: subject.adapter_sha256,
                selected_source_manifest_sha256: subject.selected_source_manifest_sha256,
                callable_policy_sha256: subject.callable_policy_sha256,
            })
            || researcherDigest((handoff.work_package.request as Record<string, unknown>)?.source_grants ?? []) !== subject.source_grants_sha256
            || researcherDigest((handoff.work_package.request as Record<string, unknown>)?.source_budget ?? {}) !== subject.source_budget_sha256) {
            throw new Error('cstar_researcher_validation_binding_mismatch');
        }
    }
    const event = db.prepare("SELECT evidence_sha256 FROM hall_worker_job_events WHERE job_id = ? AND event_kind = 'researcher_completion' ORDER BY created_at DESC LIMIT 1").get(subject.job_id) as { evidence_sha256?: string } | undefined;
    if (event?.evidence_sha256 !== subject.output_manifest_sha256) throw new Error('cstar_researcher_validation_output_manifest_mismatch');
    return job;
}

export interface ResearcherValidationResult {
    replayed: boolean;
    receipt: ResearcherValidationReceipt;
    job: WorkerJobRecord;
}

export function recordResearcherValidation(
    db: Database.Database,
    rawInput: unknown,
    options: { controlRoot?: string; now?: number } = {},
): ResearcherValidationResult {
    const receipt = researcherValidationReceiptSchema.parse(rawInput);
    const subject = subjectFromReceipt(receipt);
    const current = assertSubjectBinding(db, subject, options.controlRoot);
    const now = options.now ?? Date.now();
    const replayed = ['ACCEPTED', 'NEEDS_INPUT', 'DOMAIN_TERMINAL'].includes(current.state);
    if (current.state === 'DELIVERED_UNVERIFIED' || current.state === 'DELIVERED') beginWorkerJobValidation(db, subject.job_id, now);
    const verdict: WorkerJobValidationVerdict = receipt.verdict === 'ACCEPTED'
        ? 'ACCEPTED' : receipt.verdict === 'REJECTED' ? 'DOMAIN_TERMINAL' : 'NEEDS_INPUT';
    const job = recordWorkerJobValidation(db, subject.job_id, {
        validation_id: receipt.validation_id, verdict,
        evidence_sha256: receipt.evidence_sha256,
        summary: `Researcher validator ${receipt.validator_identity} recorded ${receipt.verdict}.`,
    }, now);
    return { replayed, receipt, job };
}

export function buildResearcherValidationReceipt(
    raw: ResearcherValidationResultInput,
    validationId: string,
    verdict: 'ACCEPTED' | 'REJECTED' | 'INCONCLUSIVE',
): ResearcherValidationReceipt {
    const parsed = researcherValidationResultSchema.parse(raw);
    const subject = parsed.subject ?? researcherValidationSubjectSchema.parse({
        schema: 'cstar.researcher_validation_subject.v1', subject_kind: parsed.subject_kind,
        request_id: parsed.request_id, request_sha256: parsed.request_sha256,
        job_id: parsed.job_id, attempt_id: parsed.attempt_id, handoff_sha256: parsed.handoff_sha256,
        adapter_id: parsed.adapter_id, adapter_sha256: parsed.adapter_sha256,
        selected_source_manifest_sha256: parsed.selected_source_manifest_sha256,
        callable_policy_sha256: parsed.callable_policy_sha256,
        source_grants_sha256: parsed.source_grants_sha256, source_budget_sha256: parsed.source_budget_sha256,
        output_manifest_sha256: parsed.output_manifest_sha256,
        validator_identity: parsed.validator_identity, validator_thread_id: parsed.validator_thread_id,
        validator_turn_id: parsed.validator_turn_id, one_use: parsed.one_use,
    });
    return researcherValidationReceiptSchema.parse({
        schema: 'cstar.researcher_validation_receipt.v1', validation_id: validationId,
        verdict, subject, evidence_sha256: parsed.evidence_sha256,
        validator_identity: subject.validator_identity, one_use: true,
    });
}

export { canonicalArtifactManifest };
