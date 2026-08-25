import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

import type { HallForgeAttemptRecord, HallForgeRequestRecord } from '../../../types/forge.js';
import { getForgeAttempt, getForgeRequest } from './forge_receipt_controller.js';

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
    bead_id: string;
    validation_id: string;
    verdict: string;
    notes?: string;
    validation_authority: 'reported' | 'verified' | 'internal';
    validation_evidence_sha256?: string;
    validation_artifact_paths?: string[];
    validation_artifact_hashes?: string[];
    now?: number;
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

function forgeValidationAccepted(verdict: string): boolean {
    const normalized = verdict.trim().toUpperCase();
    if (['SUCCESS', 'ACCEPTED', 'PASS', 'PASSED'].includes(normalized)) return true;
    if (['FAILURE', 'REJECTED', 'FAIL', 'FAILED'].includes(normalized)) return false;
    throw new Error(`forge_validation_verdict_unsupported:${verdict}`);
}

export function finalizeForgeValidation(
    db: Database.Database,
    input: FinalizeForgeValidationInput,
): { attempt: HallForgeAttemptRecord; request: HallForgeRequestRecord; accepted: boolean } {
    const now = input.now ?? Date.now();
    const accepted = forgeValidationAccepted(input.verdict);
    const notesSha256 = createHash('sha256').update(input.notes ?? '', 'utf-8').digest('hex');
    const finish = db.transaction(() => {
        const row = db.prepare(
            'SELECT attempt_id FROM hall_forge_attempts WHERE execution_receipt_id = ?',
        ).get(input.execution_receipt_id) as { attempt_id?: string } | undefined;
        if (!row?.attempt_id) throw new Error('forge_execution_receipt_not_found');
        const attempt = getForgeAttempt(db, row.attempt_id)!;
        const request = getForgeRequest(db, attempt.request_id)!;
        if (request.bead_id !== input.bead_id) throw new Error('forge_validation_bead_mismatch');
        if (input.validation_authority !== 'verified' || !input.validation_evidence_sha256) {
            throw new Error('forge_terminal_validation_requires_verified_evidence');
        }
        if (accepted) {
            const artifactPaths = new Set(input.validation_artifact_paths ?? []);
            const artifactHashes = new Set((input.validation_artifact_hashes ?? []).map((value) => value.toLowerCase()));
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
                && attempt.validation_verdict === input.verdict
                && attempt.validation_notes_sha256 === notesSha256
                && attempt.validation_authority === input.validation_authority
                && attempt.validation_evidence_sha256 === input.validation_evidence_sha256
            ) {
                return { attempt, request, accepted };
            }
            throw new Error('forge_execution_already_validated');
        }
        const pendingDelivery = attempt.status === 'STARTED'
            && attempt.result_status?.startsWith('DELIVERED_PENDING_VALIDATION:');
        const legacyUnvalidatedSuccess = attempt.status === 'SUCCEEDED';
        if (!pendingDelivery && !legacyUnvalidatedSuccess) {
            throw new Error(`forge_execution_not_awaiting_validation:${attempt.status}`);
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
            input.verdict,
            notesSha256,
            input.validation_authority,
            input.validation_evidence_sha256 ?? null,
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
        };
    });
    return finish.immediate();
}
