import { createHash } from 'node:crypto';
import path from 'node:path';

import { readBoundedUtf8FileInside } from '../contracts/runtime.js';
import type { McpRequestContext } from '../contracts/request_context.js';
import {
    type HallValidationEvidenceManifest,
    type HallValidationEvidenceManifestV2,
    hashValidationEvidenceManifest,
    VALIDATION_EVIDENCE_SHA256,
} from '../../../types/validation_evidence.js';
import { verifyCodexRequestIdentity } from './operator_authorization.js';

const MAX_VALIDATION_EVIDENCE_BYTES = 4 * 1024 * 1024;

export interface ValidationEvidencePayload {
    artifacts: Array<{ path: string; sha256: string }>;
    checks: Array<{
        name: string;
        status: 'pass' | 'fail';
        evidence_path: string;
        sha256: string;
    }>;
}

export interface ValidationEvidenceSubject {
    repository_id: string;
    bead_id: string;
    work_receipt_kind: 'forge_execution';
    work_receipt_id: string;
    forge_request_id: string;
    forge_request_sha256: string;
    decision_id: string;
    target_paths_sha256: string;
    attempt_id: string;
    result_artifact_sha256: string | null;
    adapter_ref: string | null;
    adapter_version: string | null;
    external_execution_id: string | null;
    requester_thread_id: string;
    requester_turn_id: string;
    requester_record_set_sha256: string;
    authorization_id: string;
    executor_thread_id: string;
    executor_turn_id: string;
    executor_record_sha256: string;
    executor_record_set_sha256: string;
    executor_record_count: number;
}

export interface VerifiedValidationEvidence {
    validator_identity: string;
    validator_identity_source: 'codex_request_meta' | 'codex_subagent_receipt' | 'host_artifact_receipt' | 'test_fixture';
    request_thread_id?: string;
    request_turn_id?: string;
    session_turn_record_sha256?: string;
    session_turn_record_set_sha256?: string;
    session_turn_record_count?: number;
    session_turn_first_timestamp?: string;
    session_turn_timestamp?: string;
    evidence_sha256: string;
    manifest: HallValidationEvidenceManifest;
    artifact_paths: string[];
    artifact_hashes: string[];
    check_count: number;
}

const kernelVerifiedEvidence = new WeakMap<object, {
    manifest: HallValidationEvidenceManifest;
    evidence_sha256: string;
}>();

export function markKernelVerifiedValidationEvidence(evidence: VerifiedValidationEvidence): void {
    kernelVerifiedEvidence.set(evidence, {
        manifest: evidence.manifest,
        evidence_sha256: evidence.evidence_sha256,
    });
}

export function consumeKernelVerifiedValidationEvidence(
    evidence: VerifiedValidationEvidence | undefined,
): boolean {
    if (!evidence) return false;
    const verified = kernelVerifiedEvidence.get(evidence);
    kernelVerifiedEvidence.delete(evidence);
    return Boolean(
        verified
        && evidence.manifest === verified.manifest
        && evidence.evidence_sha256 === verified.evidence_sha256
        && evidence.validator_identity === evidence.manifest.validator_identity
        && evidence.validator_identity_source === evidence.manifest.validator_identity_source
        && evidence.request_thread_id === evidence.manifest.request_thread_id
        && evidence.request_turn_id === evidence.manifest.request_turn_id
        && hashValidationEvidenceManifest(evidence.manifest) === verified.evidence_sha256,
    );
}

function verifyFile(root: string, candidate: string, expectedSha256: string): { path: string; sha256: string } {
    const normalizedHash = expectedSha256.trim().toLowerCase();
    if (!VALIDATION_EVIDENCE_SHA256.test(normalizedHash)) throw new Error('validation_evidence_sha256_invalid');
    const rootedCandidate = path.isAbsolute(candidate) ? candidate : path.join(root, candidate);
    const file = readBoundedUtf8FileInside(root, rootedCandidate, MAX_VALIDATION_EVIDENCE_BYTES);
    const actual = createHash('sha256').update(file.content, 'utf-8').digest('hex');
    if (actual !== normalizedHash) throw new Error('validation_evidence_sha256_mismatch');
    return { path: path.resolve(file.path), sha256: actual };
}

export async function verifyValidationEvidence(
    root: string,
    payload: ValidationEvidencePayload | undefined,
    context?: McpRequestContext,
    subject?: ValidationEvidenceSubject,
): Promise<VerifiedValidationEvidence | null> {
    if (!payload) return null;
    if (!subject) throw new Error('validation_evidence_work_receipt_subject_required');
    if (!Array.isArray(payload.artifacts) || payload.artifacts.length === 0 || payload.artifacts.length > 50) {
        throw new Error('validation_evidence_artifacts_required');
    }
    if (!Array.isArray(payload.checks) || payload.checks.length === 0 || payload.checks.length > 25) {
        throw new Error('validation_evidence_checks_required');
    }

    const callerThreadId = process.env.CSTAR_MCP_CALLER_THREAD_ID?.trim();
    const callerTransport = process.env.CSTAR_MCP_CALLER_TRANSPORT?.trim();
    const testFixture = Boolean(process.env.NODE_TEST_CONTEXT) && process.env.CSTAR_FORGE_TEST_MODE === '1';
    if (!testFixture && callerTransport !== 'direct-stdio') {
        throw new Error('validation_evidence_requires_direct_stdio_transport');
    }
    const requestIdentity = !testFixture ? await verifyCodexRequestIdentity(context) : null;
    if (requestIdentity && callerThreadId && callerThreadId !== requestIdentity.thread_id) {
        throw new Error('validation_evidence_request_identity_mismatch');
    }
    const validatorThreadId = testFixture
        ? process.env.CSTAR_VALIDATION_TEST_THREAD_ID?.trim() || 'test-independent-validator-thread'
        : requestIdentity?.thread_id;
    const validatorTurnId = testFixture
        ? process.env.CSTAR_VALIDATION_TEST_TURN_ID?.trim() || 'test-independent-validator-turn'
        : requestIdentity?.turn_id;
    if (!validatorThreadId || !validatorTurnId) {
        throw new Error('validation_evidence_requires_bound_request_identity');
    }
    if (validatorThreadId === subject.requester_thread_id
        || validatorThreadId === subject.executor_thread_id) {
        throw new Error('validation_evidence_validator_not_independent');
    }
    const adapterRefValid = subject.adapter_ref === null
        || (typeof subject.adapter_ref === 'string' && subject.adapter_ref.trim().length > 0);
    if (!subject.repository_id.trim() || !subject.bead_id.trim()
        || !subject.work_receipt_id.trim() || !subject.forge_request_id.trim()
        || !subject.decision_id.trim() || !subject.attempt_id.trim()
        || !adapterRefValid || !subject.requester_thread_id.trim()
        || !subject.requester_turn_id.trim() || !subject.authorization_id.trim()
        || !subject.executor_thread_id.trim() || !subject.executor_turn_id.trim()
        || !VALIDATION_EVIDENCE_SHA256.test(subject.forge_request_sha256)
        || !VALIDATION_EVIDENCE_SHA256.test(subject.target_paths_sha256)
        || !VALIDATION_EVIDENCE_SHA256.test(subject.requester_record_set_sha256)
        || !VALIDATION_EVIDENCE_SHA256.test(subject.executor_record_sha256)
        || !VALIDATION_EVIDENCE_SHA256.test(subject.executor_record_set_sha256)
        || subject.executor_record_count !== 1
        || (subject.result_artifact_sha256 !== null
            && !VALIDATION_EVIDENCE_SHA256.test(subject.result_artifact_sha256))) {
        throw new Error('validation_evidence_subject_invalid');
    }
    const validatorIdentity = `codex-thread:${validatorThreadId}:turn:${validatorTurnId}`;
    const identitySource = testFixture
        ? 'test_fixture'
        : 'codex_request_meta';

    const artifacts = payload.artifacts.map((entry) => verifyFile(root, entry.path, entry.sha256));
    const checks = payload.checks.map((entry) => {
        if (!entry.name?.trim() || entry.name.length > 240) throw new Error('validation_evidence_check_name_invalid');
        if (entry.status !== 'pass') throw new Error('validation_evidence_check_not_passed');
        const evidence = verifyFile(root, entry.evidence_path, entry.sha256);
        return {
            name: entry.name.trim(),
            status: 'pass' as const,
            evidence_path: evidence.path,
            sha256: evidence.sha256,
        };
    });
    const manifest: HallValidationEvidenceManifestV2 = {
        schema: 'cstar.validation-evidence.v2',
        validator_identity: validatorIdentity,
        validator_identity_source: identitySource,
        request_thread_id: validatorThreadId,
        request_turn_id: validatorTurnId,
        ...(requestIdentity ? {
            session_turn_record_sha256: requestIdentity.turn_record_sha256,
            session_turn_record_set_sha256: requestIdentity.turn_record_set_sha256,
            session_turn_record_count: requestIdentity.turn_record_count,
            session_turn_first_timestamp: requestIdentity.turn_first_timestamp,
            session_turn_timestamp: requestIdentity.turn_timestamp,
        } : {}),
        subject: {
            repository_id: subject.repository_id,
            bead_id: subject.bead_id,
            work_receipt_kind: subject.work_receipt_kind,
            work_receipt_id: subject.work_receipt_id,
            forge_request_id: subject.forge_request_id,
            forge_request_sha256: subject.forge_request_sha256,
            decision_id: subject.decision_id,
            target_paths_sha256: subject.target_paths_sha256,
            attempt_id: subject.attempt_id,
            result_artifact_sha256: subject.result_artifact_sha256,
            adapter_ref: subject.adapter_ref,
            adapter_version: subject.adapter_version,
            external_execution_id: subject.external_execution_id,
        },
        independence: {
            policy: 'distinct_codex_root_thread_from_forge_requester_and_executor_v1',
            validator_thread_id: validatorThreadId,
            requester_thread_id: subject.requester_thread_id,
            requester_turn_id: subject.requester_turn_id,
            requester_record_set_sha256: subject.requester_record_set_sha256,
            executor_binding: 'forge_exact_authorizing_turn_v1',
            authorization_id: subject.authorization_id,
            executor_thread_id: subject.executor_thread_id,
            executor_turn_id: subject.executor_turn_id,
            executor_record_sha256: subject.executor_record_sha256,
            executor_record_set_sha256: subject.executor_record_set_sha256,
            executor_record_count: subject.executor_record_count,
        },
        artifacts: artifacts.slice().sort((left, right) => left.path.localeCompare(right.path)),
        checks: checks.slice().sort((left, right) => left.name.localeCompare(right.name)),
    };
    const verified: VerifiedValidationEvidence = {
        validator_identity: validatorIdentity,
        validator_identity_source: identitySource,
        request_thread_id: validatorThreadId,
        request_turn_id: validatorTurnId,
        session_turn_record_sha256: requestIdentity?.turn_record_sha256,
        session_turn_record_set_sha256: requestIdentity?.turn_record_set_sha256,
        session_turn_record_count: requestIdentity?.turn_record_count,
        session_turn_first_timestamp: requestIdentity?.turn_first_timestamp,
        session_turn_timestamp: requestIdentity?.turn_timestamp,
        evidence_sha256: hashValidationEvidenceManifest(manifest),
        manifest,
        artifact_paths: artifacts.map((entry) => entry.path),
        artifact_hashes: artifacts.map((entry) => entry.sha256),
        check_count: checks.length,
    };
    markKernelVerifiedValidationEvidence(verified);
    return verified;
}
