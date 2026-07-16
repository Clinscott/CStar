import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

import type { HallForgeAttemptRecord, HallForgeRequestRecord } from '../../../types/forge.js';
import {
    type HallValidationEvidenceManifestV2,
    hashValidationEvidenceManifest,
    isValidationEvidenceManifestV2StructurallyValid,
    stableValidationEvidenceJson,
    VALIDATION_EVIDENCE_SHA256,
} from '../../../types/validation_evidence.js';
import {
    forgeAuthorizationLineageMatchesRequest,
    getForgeAttempt,
    getForgeAttemptByExecutionReceipt,
    getForgeAuthorizationByRequest,
    getForgeRequest,
} from './forge_receipt_controller.js';

export interface RecordForgeDeliveryInput {
    attempt_id: string;
    external_execution_id?: string;
    result_status: string;
    result_artifact_sha256?: string;
    provider?: string;
    requested_model?: string;
    actual_model?: string;
    model_source?: string;
    reasoning_profile?: string;
    adapter_version?: string;
    now?: number;
}

export interface FinalizeForgeValidationInput {
    execution_receipt_id: string;
    validation_id: string;
    now?: number;
}

export function resolveForgeValidationSubject(
    db: Database.Database,
    input: { execution_receipt_id: string; repository_id: string; bead_id: string },
) {
    const attempt = getForgeAttemptByExecutionReceipt(db, input.execution_receipt_id);
    if (!attempt) throw new Error('forge_execution_receipt_not_found');
    const request = getForgeRequest(db, attempt.request_id)!;
    if (request.repo_id !== input.repository_id) throw new Error('forge_validation_repository_mismatch');
    if (request.bead_id !== input.bead_id) throw new Error('forge_validation_bead_mismatch');
    const authorization = getForgeAuthorizationByRequest(db, request.request_id);
    if (!forgeAuthorizationLineageMatchesRequest(request, authorization)) {
        throw new Error('forge_validation_exact_authorization_lineage_invalid');
    }
    if (!request.requester_thread_id || !request.requester_turn_id
        || !request.requester_record_set_sha256) {
        throw new Error('forge_validation_implementation_lineage_missing');
    }
    return {
        attempt,
        request,
        subject: {
            repository_id: request.repo_id,
            bead_id: request.bead_id,
            work_receipt_kind: 'forge_execution' as const,
            work_receipt_id: attempt.execution_receipt_id,
            forge_request_id: request.request_id,
            forge_request_sha256: request.request_sha256,
            decision_id: request.decision_id,
            target_paths_sha256: request.target_paths_sha256,
            attempt_id: attempt.attempt_id,
            result_artifact_sha256: attempt.result_artifact_sha256 ?? null,
            adapter_ref: attempt.adapter_ref,
            adapter_version: attempt.adapter_version ?? null,
            external_execution_id: attempt.external_execution_id ?? null,
            requester_thread_id: request.requester_thread_id,
            requester_turn_id: request.requester_turn_id,
            requester_record_set_sha256: request.requester_record_set_sha256,
            authorization_id: authorization.authorization_id,
            executor_thread_id: authorization.operator_thread_id,
            executor_turn_id: authorization.operator_turn_id,
            executor_record_sha256: authorization.operator_record_sha256,
            executor_record_set_sha256: authorization.operator_record_set_sha256,
            executor_record_count: authorization.operator_record_count,
        },
    };
}

function verifiedValidationManifest(
    db: Database.Database,
    validationId: string,
): {
    manifest: HallValidationEvidenceManifestV2;
    evidence_sha256: string;
    repository_id: string;
    bead_id: string;
    verdict: string;
    notes: string;
} {
    const row = db.prepare(`
        SELECT repo_id, bead_id, verdict, notes, authority_class, evidence_sha256,
               validator_identity, validator_identity_source, evidence_manifest_json
        FROM hall_validation_runs WHERE validation_id = ?
    `).get(validationId) as Record<string, unknown> | undefined;
    if (!row) throw new Error('forge_validation_receipt_not_found');
    let manifest: HallValidationEvidenceManifestV2;
    try { manifest = JSON.parse(String(row.evidence_manifest_json)); } catch {
        throw new Error('forge_validation_manifest_invalid');
    }
    const evidenceSha256 = String(row.evidence_sha256 ?? '');
    const identitySourceAllowed = manifest.validator_identity_source === 'codex_request_meta'
        || (manifest.validator_identity_source === 'test_fixture' && Boolean(process.env.NODE_TEST_CONTEXT));
    if (row.authority_class !== 'verified_v2'
        || manifest.schema !== 'cstar.validation-evidence.v2'
        || !isValidationEvidenceManifestV2StructurallyValid(manifest)
        || manifest.validator_identity !== row.validator_identity
        || manifest.validator_identity_source !== row.validator_identity_source
        || !identitySourceAllowed || !VALIDATION_EVIDENCE_SHA256.test(evidenceSha256)
        || hashValidationEvidenceManifest(manifest) !== evidenceSha256) {
        throw new Error('forge_terminal_validation_requires_verified_evidence_v2');
    }
    return {
        manifest,
        evidence_sha256: evidenceSha256,
        repository_id: String(row.repo_id),
        bead_id: String(row.bead_id),
        verdict: String(row.verdict),
        notes: String(row.notes ?? ''),
    };
}

export function assertForgeValidationManifestCurrent(
    db: Database.Database,
    manifest: HallValidationEvidenceManifestV2,
): { attempt: HallForgeAttemptRecord; request: HallForgeRequestRecord } {
    const resolved = resolveForgeValidationSubject(db, {
        execution_receipt_id: manifest.subject.work_receipt_id,
        repository_id: manifest.subject.repository_id,
        bead_id: manifest.subject.bead_id,
    });
    const { attempt, request, subject } = resolved;
    const expectedSubject = {
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
    };
    const expectedIndependence = {
        policy: 'distinct_codex_root_thread_from_forge_requester_and_executor_v1' as const,
        validator_thread_id: manifest.request_thread_id,
        requester_thread_id: subject.requester_thread_id,
        requester_turn_id: subject.requester_turn_id,
        requester_record_set_sha256: subject.requester_record_set_sha256,
        executor_binding: 'forge_exact_authorizing_turn_v1' as const,
        authorization_id: subject.authorization_id,
        executor_thread_id: subject.executor_thread_id,
        executor_turn_id: subject.executor_turn_id,
        executor_record_sha256: subject.executor_record_sha256,
        executor_record_set_sha256: subject.executor_record_set_sha256,
        executor_record_count: subject.executor_record_count,
    };
    if (stableValidationEvidenceJson(manifest.subject) !== stableValidationEvidenceJson(expectedSubject)
        || stableValidationEvidenceJson(manifest.independence) !== stableValidationEvidenceJson(expectedIndependence)
        || manifest.independence.validator_thread_id !== manifest.request_thread_id
        || manifest.validator_identity !== `codex-thread:${manifest.request_thread_id}:turn:${manifest.request_turn_id}`
        || manifest.request_thread_id === subject.requester_thread_id
        || manifest.request_thread_id === subject.executor_thread_id) {
        throw new Error('forge_validation_subject_or_independence_mismatch');
    }
    return { attempt, request };
}

export function recordForgeDelivery(
    db: Database.Database,
    input: RecordForgeDeliveryInput,
): { attempt: HallForgeAttemptRecord; request: HallForgeRequestRecord } {
    const now = input.now ?? Date.now();
    const delivered = db.transaction(() => {
        const attempt = getForgeAttempt(db, input.attempt_id);
        if (!attempt) throw new Error('forge_attempt_not_found');
        if (attempt.status !== 'STARTED') throw new Error(`forge_delivery_transition_invalid:${attempt.status}`);
        db.prepare(`
            UPDATE hall_forge_attempts
            SET external_execution_id = ?, result_status = ?, result_artifact_sha256 = ?,
                error_code = NULL, provider = ?, requested_model = ?, actual_model = ?,
                model_source = ?, reasoning_profile = ?, adapter_version = ?, updated_at = ?
            WHERE attempt_id = ? AND status = 'STARTED'
        `).run(
            input.external_execution_id ?? null,
            `DELIVERED_PENDING_VALIDATION:${input.result_status}`,
            input.result_artifact_sha256 ?? null,
            input.provider ?? attempt.provider ?? null,
            input.requested_model ?? attempt.requested_model ?? null,
            input.actual_model ?? attempt.actual_model ?? null,
            input.model_source ?? attempt.model_source ?? 'unreported',
            input.reasoning_profile ?? attempt.reasoning_profile ?? null,
            input.adapter_version ?? attempt.adapter_version ?? null,
            now,
            attempt.attempt_id,
        );
        return {
            attempt: getForgeAttempt(db, attempt.attempt_id)!,
            request: getForgeRequest(db, attempt.request_id)!,
        };
    });
    return delivered.immediate();
}

function forgeValidationOutcome(verdict: string): 'accepted' | 'rejected' | 'inconclusive' {
    const normalized = verdict.trim().toUpperCase();
    if (['SUCCESS', 'ACCEPTED', 'PASS', 'PASSED'].includes(normalized)) return 'accepted';
    if (['FAILURE', 'REJECTED', 'FAIL', 'FAILED'].includes(normalized)) return 'rejected';
    if (normalized === 'INCONCLUSIVE') return 'inconclusive';
    throw new Error(`forge_validation_verdict_unsupported:${verdict}`);
}

export function finalizeForgeValidation(
    db: Database.Database,
    input: FinalizeForgeValidationInput,
): {
    attempt: HallForgeAttemptRecord;
    request: HallForgeRequestRecord;
    accepted: boolean | null;
    mode: 'delivery_finalization' | 'terminal_evidence_link';
    execution_status_changed: boolean;
} {
    const now = input.now ?? Date.now();
    const finish = db.transaction(() => {
        const verified = verifiedValidationManifest(db, input.validation_id);
        const outcome = forgeValidationOutcome(verified.verdict);
        const notesSha256 = createHash('sha256').update(verified.notes, 'utf-8').digest('hex');
        const manifest = verified.manifest;
        if (manifest.subject.work_receipt_id !== input.execution_receipt_id
            || manifest.subject.repository_id !== verified.repository_id
            || manifest.subject.bead_id !== verified.bead_id) {
            throw new Error('forge_validation_receipt_subject_mismatch');
        }
        const { attempt, request } = assertForgeValidationManifestCurrent(db, manifest);
        const pendingDelivery = attempt.status === 'STARTED'
            && attempt.result_status?.startsWith('DELIVERED_PENDING_VALIDATION:');
        const terminalEvidenceLink = ['FAILED_FINAL', 'UNKNOWN'].includes(attempt.status);
        if (!pendingDelivery && !terminalEvidenceLink) {
            throw new Error(`forge_execution_not_awaiting_validation:${attempt.status}`);
        }
        if (terminalEvidenceLink && outcome === 'accepted') {
            throw new Error('forge_terminal_failure_validation_cannot_accept_delivery');
        }
        const accepted = outcome === 'accepted' ? true : outcome === 'rejected' ? false : null;
        if (!terminalEvidenceLink && accepted === null) {
            throw new Error('forge_delivery_validation_inconclusive');
        }
        if (!terminalEvidenceLink && accepted) {
            if (!attempt.result_artifact_sha256) {
                throw new Error('forge_validation_result_artifact_missing');
            }
            const artifactPaths = new Set(manifest.artifacts.map((entry) => entry.path));
            const artifactHashes = new Set(manifest.artifacts.map((entry) => entry.sha256.toLowerCase()));
            const summary = JSON.parse(request.request_summary_json) as { required_output_paths?: string[] };
            for (const requiredPath of summary.required_output_paths ?? []) {
                if (!artifactPaths.has(requiredPath)) {
                    throw new Error(`forge_validation_required_output_unverified:${requiredPath}`);
                }
            }
            if (attempt.result_artifact_sha256 && !artifactHashes.has(attempt.result_artifact_sha256.toLowerCase())) {
                throw new Error('forge_validation_result_artifact_unverified');
            }
        }
        if (attempt.validation_id) {
            if (
                attempt.validation_id === input.validation_id
                && attempt.validation_verdict === verified.verdict
                && attempt.validation_notes_sha256 === notesSha256
                && attempt.validation_authority === 'verified_v2'
                && attempt.validation_evidence_sha256 === verified.evidence_sha256
            ) {
                return {
                    attempt,
                    request,
                    accepted,
                    mode: terminalEvidenceLink
                        ? 'terminal_evidence_link' as const
                        : 'delivery_finalization' as const,
                    execution_status_changed: false,
                };
            }
            throw new Error('forge_execution_already_validated');
        }
        if (terminalEvidenceLink) {
            db.prepare(`
                UPDATE hall_forge_attempts
                SET validation_id = ?, validation_verdict = ?,
                    validation_notes_sha256 = ?, validation_authority = ?,
                    validation_evidence_sha256 = ?, updated_at = ?
                WHERE attempt_id = ? AND validation_id IS NULL
            `).run(
                input.validation_id,
                verified.verdict,
                notesSha256,
                'verified_v2',
                verified.evidence_sha256,
                now,
                attempt.attempt_id,
            );
            return {
                attempt: getForgeAttempt(db, attempt.attempt_id)!,
                request: getForgeRequest(db, attempt.request_id)!,
                accepted,
                mode: 'terminal_evidence_link' as const,
                execution_status_changed: false,
            };
        }
        db.prepare(`
            UPDATE hall_forge_attempts
            SET status = ?, result_status = ?, error_code = ?, validation_id = ?,
                validation_verdict = ?, validation_notes_sha256 = ?, validation_authority = ?,
                validation_evidence_sha256 = ?, completed_at = ?, updated_at = ?
            WHERE attempt_id = ? AND validation_id IS NULL
        `).run(
            accepted ? 'SUCCEEDED' : 'FAILED_FINAL',
            accepted ? 'VALIDATION_ACCEPTED' : 'VALIDATION_REJECTED',
            accepted ? null : 'independent_validation_rejected',
            input.validation_id,
            verified.verdict,
            notesSha256,
            'verified_v2',
            verified.evidence_sha256,
            now,
            now,
            attempt.attempt_id,
        );
        db.prepare(`
            UPDATE hall_forge_requests
            SET status = ?, active_attempt_id = NULL, completed_at = ?, updated_at = ?
            WHERE request_id = ?
        `).run(accepted ? 'SUCCEEDED' : 'FAILED_FINAL', now, now, attempt.request_id);
        return {
            attempt: getForgeAttempt(db, attempt.attempt_id)!,
            request: getForgeRequest(db, attempt.request_id)!,
            accepted,
            mode: 'delivery_finalization' as const,
            execution_status_changed: true,
        };
    });
    return finish.immediate();
}
