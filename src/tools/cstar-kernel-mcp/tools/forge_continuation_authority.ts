import { createHash } from 'node:crypto';
import path from 'node:path';

import type Database from 'better-sqlite3';

import type {
    HallForgeAuthorizationRecord,
    HallForgeContinuationRecord,
    HallForgeRequestRecord,
} from '../../../types/forge.js';
import {
    finalizeForgePreProviderContinuation,
    getForgeContinuationByAttempt,
} from '../../pennyone/intel/forge_continuation_controller.js';
import { forgeAuthorizationLineageMatchesRequest } from '../../pennyone/intel/forge_receipt_controller.js';
import { readBoundedUtf8FileInside } from '../contracts/runtime.js';
import {
    classifyCodexSessionRecord,
} from './codex_request_identity.js';
import {
    createCodexPlatformContextProjection,
    scanFixedCodexSession,
} from './codex_session_authority_projection.js';
import {
    findCodexSessionFile,
    MAX_CODEX_SESSION_FILE_BYTES,
    resolveCodexSessionsRoot,
} from './codex_session_locator.js';
import {
    FORGE_PRE_PROVIDER_RECOVERABLE_FAILURES,
    projectForgeFailureEvidence,
    verifiedZeroProviderProof,
} from './forge_failure_evidence.js';
import {
    hashForgeContinuationAuthority,
    hashForgeRuntimeBinding,
    type CanonicalForgeRequest,
} from './forge_request_contract.js';
import type { VerifiedCodexRequestIdentity } from './operator_authorization.js';
import { isForgeAuthorityRevocation } from './forge_revocation.js';
import type { ForgeAdapterRuntimeProof } from './forge_adapter_runtime.js';
import {
    FORGE_MODEL_MATERIAL_POLICY,
    readSnapshot,
    type ForgeWorkspaceProjection,
} from './forge_workspace_projection.js';
import {
    ensureForgeContinuationRuntimeEvidence,
    isInsideForgeContinuationRoot,
    requireForgeContinuationArtifact,
    verifyForgeContinuationRuntimeEvidence,
    verifyForgeHermesRuntimeEvidence,
} from './forge_continuation_runtime_evidence.js';
import {
    hashValidationEvidenceManifest,
    isValidationEvidenceManifestV2StructurallyValid,
    VALIDATION_EVIDENCE_SHA256,
    type HallValidationEvidenceManifestV2,
} from '../../../types/validation_evidence.js';

const DIGEST = /^[a-f0-9]{64}$/;

function sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

interface CanonicalLineageRecord {
    timestamp: string;
    record_sha256: string;
}

function hashCanonicalTurnRecordSet(
    threadId: string,
    turnId: string,
    records: CanonicalLineageRecord[],
): string {
    return sha256(JSON.stringify({
        schema: 'cstar.codex_root_user_turn_record_set.v1',
        thread_id: threadId,
        turn_id: turnId,
        records: records.map((record, index) => ({ index, ...record })),
    }));
}

function canonicalRootUserText(row: Record<string, unknown>): string {
    const payload = isRecord(row.payload) ? row.payload : undefined;
    const content = payload?.content;
    if (!Array.isArray(content) || content.length === 0
        || content.some((item) => !isRecord(item)
            || item.type !== 'input_text' || typeof item.text !== 'string')
        || typeof row.timestamp !== 'string') {
        throw new Error('forge_continuation_later_user_record_uninspectable');
    }
    return content.map((item) => (item as Record<string, unknown>).text).join('');
}

export interface ForgePreProviderFailureInput {
    envelope: Record<string, unknown> | null;
    failure_code: string | null;
    execution_trace_sha256: string;
    live_source_collection: boolean;
    workspace_commit_present: boolean;
    recorded_canonical: CanonicalForgeRequest;
    current_canonical?: CanonicalForgeRequest;
}

export function classifyForgePreProviderFailure(input: ForgePreProviderFailureInput): {
    failure_code: string;
    execution_trace_sha256: string;
    zero_provider_proof: Record<string, unknown>;
    continuation_authority_sha256: string;
    prior_runtime_sha256: string;
} | null {
    if (!input.failure_code || !FORGE_PRE_PROVIDER_RECOVERABLE_FAILURES.has(input.failure_code)
        || !DIGEST.test(input.execution_trace_sha256)
        || input.live_source_collection || input.workspace_commit_present) return null;
    const proof = verifiedZeroProviderProof(projectForgeFailureEvidence(input.envelope));
    if (!proof) return null;
    return {
        failure_code: input.failure_code,
        execution_trace_sha256: input.execution_trace_sha256,
        zero_provider_proof: proof as unknown as Record<string, unknown>,
        continuation_authority_sha256: hashForgeContinuationAuthority(input.recorded_canonical),
        prior_runtime_sha256: hashForgeRuntimeBinding(
            input.current_canonical ?? input.recorded_canonical,
        ),
    };
}

export function verifyForgeContinuationLineage({
    authorization,
    caller,
    now = Date.now(),
}: {
    authorization: HallForgeAuthorizationRecord;
    caller: VerifiedCodexRequestIdentity;
    now?: number;
}): void {
    if (caller.thread_id !== authorization.operator_thread_id
        || authorization.expires_at <= now) {
        throw new Error('forge_continuation_caller_invalid');
    }
    if (!Number.isSafeInteger(authorization.operator_record_count)
        || authorization.operator_record_count < 1) {
        throw new Error('forge_continuation_authorized_record_mismatch');
    }
    const sessionFile = findCodexSessionFile(resolveCodexSessionsRoot(), caller.thread_id);
    const originalRecords: CanonicalLineageRecord[] = [];
    const currentRecords: CanonicalLineageRecord[] = [];
    let originalComplete = false;
    let originalStarted = false;
    const projection = createCodexPlatformContextProjection(({ row, rawLine }) => {
        const classification = classifyCodexSessionRecord(row);
        if (classification.kind === 'noncanonical-user-like') {
            if (originalComplete || originalStarted
                || classification.turnId === authorization.operator_turn_id
                || classification.turnId === caller.turn_id) {
                throw new Error('forge_continuation_later_user_record_uninspectable');
            }
            return;
        }
        if (classification.kind !== 'canonical-root-user') return;
        if (!classification.rootLineage) {
            if (originalComplete || originalStarted
                || classification.turnId === authorization.operator_turn_id
                || classification.turnId === caller.turn_id) {
                throw new Error('forge_continuation_later_user_record_uninspectable');
            }
            return;
        }
        const turnId = classification.turnId;
        if (typeof turnId !== 'string' || typeof row.timestamp !== 'string') {
            if (originalComplete || originalStarted) {
                throw new Error('forge_continuation_later_user_record_uninspectable');
            }
            return;
        }
        const recordSha256 = sha256(rawLine);
        const lineageRecord = { timestamp: row.timestamp, record_sha256: recordSha256 };
        if (turnId === caller.turn_id) currentRecords.push(lineageRecord);

        if (!originalComplete) {
            if (turnId !== authorization.operator_turn_id) {
                if (originalStarted) {
                    throw new Error('forge_continuation_authorized_record_mismatch');
                }
                return;
            }
            originalStarted = true;
            canonicalRootUserText(row);
            originalRecords.push(lineageRecord);
            if (originalRecords.length > authorization.operator_record_count) {
                throw new Error('forge_continuation_authorized_record_mismatch');
            }
            if (originalRecords.length === authorization.operator_record_count) {
                const terminal = originalRecords.at(-1)!;
                if (terminal.record_sha256 !== authorization.operator_record_sha256
                    || hashCanonicalTurnRecordSet(
                        authorization.operator_thread_id,
                        authorization.operator_turn_id,
                        originalRecords,
                    ) !== authorization.operator_record_set_sha256) {
                    throw new Error('forge_continuation_authorized_record_mismatch');
                }
                originalComplete = true;
            }
            return;
        }

        const text = canonicalRootUserText(row);
        if (isForgeAuthorityRevocation(text)) throw new Error('forge_continuation_revoked');
    });
    scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, projection.consume);
    projection.finish();
    const currentTerminal = currentRecords.at(-1);
    if (!originalComplete || !currentTerminal
        || currentRecords.length !== caller.turn_record_count
        || currentTerminal.record_sha256 !== caller.turn_record_sha256
        || hashCanonicalTurnRecordSet(caller.thread_id, caller.turn_id, currentRecords)
            !== caller.turn_record_set_sha256) {
        throw new Error('forge_continuation_lineage_incomplete');
    }
}

export function verifyForgeContinuationCaller({
    authorization,
    continuation,
    caller,
    now = Date.now(),
}: {
    authorization: HallForgeAuthorizationRecord;
    continuation: HallForgeContinuationRecord;
    caller: VerifiedCodexRequestIdentity;
    now?: number;
}): void {
    if (continuation.status !== 'PENDING_REPAIR') {
        throw new Error('forge_continuation_caller_invalid');
    }
    verifyForgeContinuationLineage({ authorization, caller, now });
}

export function verifyForgeContinuationRepairBinding({
    root,
    db,
    continuation,
    request,
    authorization,
    canonical,
    adapter_runtime,
    prepared_projection,
}: {
    root: string;
    db: Database.Database;
    continuation: HallForgeContinuationRecord;
    request: HallForgeRequestRecord;
    authorization: HallForgeAuthorizationRecord;
    canonical: CanonicalForgeRequest;
    adapter_runtime: ForgeAdapterRuntimeProof;
    prepared_projection?: ForgeWorkspaceProjection;
}): void {
    const attempt = db.prepare(
        'SELECT execution_receipt_id FROM hall_forge_attempts WHERE request_id = ? AND attempt_id = ?',
    ).get(request.request_id, continuation.attempt_id) as { execution_receipt_id?: string } | undefined;
    if (!attempt?.execution_receipt_id) {
        throw new Error('forge_continuation_repair_validation_subject_invalid');
    }
    if (!continuation.repair_validation_id || !continuation.repair_evidence_sha256) {
        ensureForgeContinuationRuntimeEvidence({
            root,
            execution_receipt_id: attempt.execution_receipt_id,
            canonical,
            adapter_runtime,
        });
        throw new Error('forge_continuation_repair_validation_required');
    }
    const row = db.prepare(`
        SELECT repo_id, bead_id, verdict, authority_class, evidence_sha256,
               validator_identity, validator_identity_source, evidence_manifest_json, created_at
        FROM hall_validation_runs WHERE validation_id = ?
    `).get(continuation.repair_validation_id) as Record<string, unknown> | undefined;
    if (!row) throw new Error('forge_continuation_repair_validation_missing');
    let manifest: HallValidationEvidenceManifestV2;
    try { manifest = JSON.parse(String(row.evidence_manifest_json)); } catch {
        throw new Error('forge_continuation_repair_validation_manifest_invalid');
    }
    const evidenceSha256 = String(row.evidence_sha256 ?? '');
    const identitySourceAllowed = manifest.validator_identity_source === 'codex_request_meta'
        || (manifest.validator_identity_source === 'test_fixture' && Boolean(process.env.NODE_TEST_CONTEXT));
    if (row.repo_id !== request.repo_id || row.bead_id !== request.bead_id
        || !['ACCEPTED', 'SUCCESS'].includes(String(row.verdict))
        || row.authority_class !== 'verified_v2'
        || !VALIDATION_EVIDENCE_SHA256.test(evidenceSha256)
        || evidenceSha256 !== continuation.repair_evidence_sha256
        || Number(row.created_at) < continuation.created_at
        || !isValidationEvidenceManifestV2StructurallyValid(manifest)
        || hashValidationEvidenceManifest(manifest) !== evidenceSha256
        || manifest.validator_identity !== row.validator_identity
        || manifest.validator_identity_source !== row.validator_identity_source
        || !identitySourceAllowed) {
        throw new Error('forge_continuation_repair_validation_invalid');
    }
    const subject = manifest.subject;
    const independence = manifest.independence;
    if (subject.repository_id !== request.repo_id || subject.bead_id !== request.bead_id
        || subject.work_receipt_id !== attempt?.execution_receipt_id
        || subject.forge_request_id !== request.request_id
        || subject.forge_request_sha256 !== request.request_sha256
        || subject.decision_id !== request.decision_id
        || subject.target_paths_sha256 !== request.target_paths_sha256
        || subject.attempt_id !== continuation.attempt_id
        || independence.authorization_id !== authorization.authorization_id
        || independence.requester_thread_id !== request.requester_thread_id
        || independence.requester_turn_id !== request.requester_turn_id
        || independence.requester_record_set_sha256 !== request.requester_record_set_sha256
        || independence.executor_thread_id !== authorization.operator_thread_id
        || independence.executor_turn_id !== authorization.operator_turn_id
        || manifest.request_thread_id === request.requester_thread_id
        || manifest.request_thread_id === authorization.operator_thread_id) {
        throw new Error('forge_continuation_repair_validation_subject_invalid');
    }
    const artifactPaths = new Map(manifest.artifacts.map((item) => [path.resolve(item.path), item.sha256]));
    if (artifactPaths.size !== manifest.artifacts.length) {
        throw new Error('forge_continuation_repair_validation_artifacts_ambiguous');
    }
    verifyForgeContinuationRuntimeEvidence(
        root, attempt.execution_receipt_id, canonical, adapter_runtime, artifactPaths,
    );
    for (const proof of [
        { role: 'adapter', path: adapter_runtime.path, sha256: adapter_runtime.sha256 },
        adapter_runtime.python_interpreter,
        ...(adapter_runtime.node_interpreter ? [adapter_runtime.node_interpreter] : []),
        adapter_runtime.process_containment,
        ...adapter_runtime.dependencies,
    ]) {
        if (isInsideForgeContinuationRoot(path.resolve(proof.path), path.resolve(root))) {
            requireForgeContinuationArtifact(artifactPaths, proof.path, proof.sha256, proof.role);
        }
    }
    verifyForgeHermesRuntimeEvidence(canonical, adapter_runtime, artifactPaths);
    const requiredOutputs = new Set(canonical.required_output_paths);
    const preparedSnapshots = prepared_projection
        ? new Map(prepared_projection.source_preimages.map((item) => [item.path, item]))
        : null;
    for (const target of canonical.target_paths) {
        if (preparedSnapshots) {
            const snapshot = preparedSnapshots.get(path.resolve(target));
            if (!snapshot || (snapshot.kind !== 'file' && !(
                snapshot.kind === 'missing' && requiredOutputs.has(target)
            )) || (snapshot.kind === 'file'
                && artifactPaths.get(path.resolve(target)) !== snapshot.sha256)) {
                throw new Error('forge_continuation_prepared_target_unvalidated');
            }
            continue;
        }
        let captured: ReturnType<typeof readSnapshot>;
        try {
            captured = readSnapshot(root, target, FORGE_MODEL_MATERIAL_POLICY.file_max_bytes);
        } catch {
            throw new Error(`forge_continuation_target_unsafe:${target}`);
        }
        if (!captured.snapshot.exists) {
            if (requiredOutputs.has(target)) continue;
            throw new Error(`forge_continuation_target_unavailable:${target}`);
        }
        if (captured.directory || !captured.content || !captured.snapshot.sha256) {
            throw new Error(`forge_continuation_target_unsafe:${target}`);
        }
        if (artifactPaths.get(path.resolve(target)) !== captured.snapshot.sha256) {
            throw new Error(`forge_continuation_target_unvalidated:${target}`);
        }
    }
}

export function verifyPreparedForgeContinuationRepairBinding({
    root,
    db,
    request,
    authorization,
    parent_attempt_id,
    continuation_fingerprint,
    canonical,
    adapter_runtime,
    prepared_projection,
}: {
    root: string;
    db: Database.Database;
    request: HallForgeRequestRecord;
    authorization: HallForgeAuthorizationRecord;
    parent_attempt_id: string;
    continuation_fingerprint: string;
    canonical: CanonicalForgeRequest;
    adapter_runtime: ForgeAdapterRuntimeProof;
    prepared_projection: ForgeWorkspaceProjection;
}): void {
    const continuation = getForgeContinuationByAttempt(db, parent_attempt_id);
    if (!continuation || continuation.status !== 'RESUMED'
        || continuation.failure_fingerprint_sha256 !== continuation_fingerprint) {
        throw new Error('forge_continuation_receipt_drift_after_preparation');
    }
    verifyForgeContinuationRepairBinding({
        root, db, continuation, request, authorization, canonical,
        adapter_runtime, prepared_projection,
    });
}

export function reconcileForgePreProviderFailureFromTrace({
    root,
    db,
    request,
    authorization,
    parent_attempt_id,
    recorded_canonical,
}: {
    root: string;
    db: Database.Database;
    request: HallForgeRequestRecord;
    authorization: HallForgeAuthorizationRecord;
    parent_attempt_id: string;
    recorded_canonical: CanonicalForgeRequest;
}): HallForgeContinuationRecord {
    if (!forgeAuthorizationLineageMatchesRequest(request, authorization)) {
        throw new Error('forge_preprovider_reconciliation_authorization_invalid');
    }
    const attempt = db.prepare(
        'SELECT * FROM hall_forge_attempts WHERE request_id = ? AND attempt_id = ?',
    ).get(request.request_id, parent_attempt_id) as Record<string, unknown> | undefined;
    if (!attempt || attempt.status !== 'FAILED_FINAL'
        || attempt.validation_id || attempt.validation_evidence_sha256
        || typeof attempt.execution_receipt_id !== 'string'
        || typeof attempt.adapter_version !== 'string') {
        throw new Error('forge_preprovider_reconciliation_parent_invalid');
    }
    const tracePath = `${root}/work/forge-executions/${attempt.execution_receipt_id}/adapter-execution-envelope.json`;
    const traceFile = readBoundedUtf8FileInside(root, tracePath, 4 * 1024 * 1024);
    const traceSha256 = sha256(traceFile.content);
    const trace = JSON.parse(traceFile.content) as Record<string, unknown>;
    const envelope = isRecord(trace.envelope) ? trace.envelope : null;
    const failureCode = typeof envelope?.degraded_reason === 'string'
        ? envelope.degraded_reason : typeof attempt.error_code === 'string' ? attempt.error_code : null;
    if (!String(attempt.adapter_version).split('@').some((item) =>
        item === `trace:${traceSha256}` || item === `trace-last:${traceSha256}`)
        || trace.execution_receipt_id !== attempt.execution_receipt_id
        || trace.forge_request_receipt_id !== request.request_id
        || trace.adapter_ref !== request.adapter_ref
        || !['degraded', 'failed'].includes(String(trace.status))
        || trace.live_source_collection !== false
        || trace.workspace_commit !== null
        || trace.response_artifact_exists !== false) {
        throw new Error('forge_preprovider_reconciliation_trace_invalid');
    }
    const classified = classifyForgePreProviderFailure({
        envelope,
        failure_code: failureCode,
        execution_trace_sha256: traceSha256,
        live_source_collection: false,
        workspace_commit_present: false,
        recorded_canonical,
    });
    if (!classified) throw new Error('forge_preprovider_reconciliation_evidence_invalid');
    return finalizeForgePreProviderContinuation(db, {
        attempt_id: parent_attempt_id,
        ...classified,
        reconcile_failed_final: true,
    });
}
