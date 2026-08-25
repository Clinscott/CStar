import type Database from 'better-sqlite3';

import type {
    HallForgeRequestRecord,
    SaveForgeRequestInput,
} from '../../../types/forge.js';
import {
    getForgeRequest,
    getForgeRequestByDecision,
} from './forge_receipt_controller.js';
import {
    forgeRequestContentMatches,
    forgeRequestImmutableContentMatches,
    AUTONOMOUS_DISPATCH_POLICY_PROFILE,
    LEGACY_EXACT_FORGE_CHALLENGE_PROFILE,
    normalizeForgeRequestAuthorizationExtension,
    ROOT_USER_FORGE_INTENT_PROFILE,
} from './forge_authorization_policy.js';
import { isForgeRequesterLineageValid } from './forge_requester_lineage.js';
import {
    isPendingForgeRequestCorrectionReplay,
    tryCorrectPendingForgeRequest,
} from './forge_request_preauthorization_correction.js';
import { isAutonomousDispatchPolicyCandidate } from
    '../../cstar-kernel-mcp/tools/forge_autonomous_policy_contract.js';
import { isPendingRootForgeAuthorizationReplay } from './forge_request_authorization_replay.js';

export interface SaveForgeRequestResult {
    request: HallForgeRequestRecord;
    replayed: boolean;
    challenge_upgraded: boolean;
    superseded_request_id?: string;
}

function extendPendingRequestAuthorization(
    db: Database.Database,
    existing: HallForgeRequestRecord,
    extension: ReturnType<typeof normalizeForgeRequestAuthorizationExtension>,
    now: number,
): HallForgeRequestRecord {
    if (existing.authorization_profile === LEGACY_EXACT_FORGE_CHALLENGE_PROFILE
        && extension.profile === ROOT_USER_FORGE_INTENT_PROFILE) return existing;
    if (existing.authorization_profile === undefined && extension.profile === undefined) {
        return existing;
    }
    if ((existing.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE
        || existing.authorization_profile === AUTONOMOUS_DISPATCH_POLICY_PROFILE)
        && extension.profile === ROOT_USER_FORGE_INTENT_PROFILE
        && extension.binding === undefined
        && extension.challenge === undefined) return existing;
    if (existing.authorization_profile === extension.profile
        && existing.authorization_binding_sha256 === extension.binding
        && existing.authorization_challenge_sha256 === extension.challenge) return existing;
    const legacyEmpty = existing.authorization_profile === undefined
        && existing.authorization_binding_sha256 === undefined
        && existing.authorization_challenge_sha256 === undefined;
    const legacyExactUpgrade = legacyEmpty
        && extension.profile === LEGACY_EXACT_FORGE_CHALLENGE_PROFILE
        && ['PENDING_AUTH', 'AUTHORIZED'].includes(existing.status);
    if (!legacyExactUpgrade || !extension.profile
        || !['PENDING_AUTH', 'AUTHORIZED'].includes(existing.status)) {
        throw new Error('forge_request_receipt_conflict');
    }
    const attemptCount = Number((db.prepare(
        'SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?',
    ).get(existing.request_id) as { count?: number }).count ?? 0);
    const authorizationCount = Number((db.prepare(
        'SELECT COUNT(*) AS count FROM hall_forge_authorizations WHERE request_id = ?',
    ).get(existing.request_id) as { count?: number }).count ?? 0);
    if (attemptCount !== 0 || authorizationCount !== 0) {
        throw new Error(legacyEmpty && extension.profile === LEGACY_EXACT_FORGE_CHALLENGE_PROFILE
            ? 'forge_request_legacy_upgrade_requires_unspent_request'
            : 'forge_request_authorization_transition_requires_unspent_request');
    }
    const updated = db.prepare(`
        UPDATE hall_forge_requests
        SET authorization_profile = ?, authorization_binding_sha256 = ?,
            authorization_challenge_sha256 = ?,
            operator_authorization_ref = NULL, operator_thread_id = NULL,
            operator_turn_id = NULL, operator_message_sha256 = NULL,
            operator_record_sha256 = NULL, operator_record_set_sha256 = NULL,
            operator_record_count = NULL, status = 'PENDING_AUTH',
            authorized_at = NULL, expires_at = NULL, active_attempt_id = NULL,
            completed_at = NULL, updated_at = ?
        WHERE request_id = ?
          AND status IN ('PENDING_AUTH', 'AUTHORIZED')
          AND NOT EXISTS (SELECT 1 FROM hall_forge_attempts WHERE request_id = ?)
          AND NOT EXISTS (SELECT 1 FROM hall_forge_authorizations WHERE request_id = ?)
    `).run(
        extension.profile,
        extension.binding ?? null,
        extension.challenge ?? null,
        now,
        existing.request_id,
        existing.request_id,
        existing.request_id,
    );
    if (Number(updated.changes) !== 1) {
        throw new Error('forge_request_authorization_transition_race');
    }
    return getForgeRequest(db, existing.request_id)!;
}

export function saveForgeRequestInTransaction(
    db: Database.Database,
    input: SaveForgeRequestInput,
): SaveForgeRequestResult {
    if (!db.inTransaction) throw new Error('forge_request_persistence_transaction_required');
    const now = input.now ?? Date.now();
    if (!Number.isSafeInteger(input.max_attempts)
        || input.max_attempts < 1 || input.max_attempts > 10) {
        throw new Error('forge_request_max_attempts_invalid');
    }
    const extension = normalizeForgeRequestAuthorizationExtension(input);
    if (extension.profile === ROOT_USER_FORGE_INTENT_PROFILE
        && !isForgeRequesterLineageValid(
            input.requester_thread_id,
            input.requester_turn_id,
            input.requester_record_set_sha256,
        )) {
        throw new Error('forge_request_natural_authorization_requester_lineage_required');
    }
    const bead = db.prepare(
        'SELECT repo_id, status FROM hall_beads WHERE bead_id = ?',
    ).get(input.bead_id) as { repo_id?: string; status?: string } | undefined;
    if (!bead || bead.repo_id !== input.repo_id) {
        throw new Error('forge_request_bead_not_found_in_repository');
    }
    if (['RESOLVED', 'ARCHIVED', 'SUPERSEDED'].includes(bead.status ?? '')) {
        throw new Error('forge_request_bead_is_terminal');
    }
    const existing = getForgeRequest(db, input.request_id);
    if (existing) {
        if (existing.status === 'SUPERSEDED') {
            if (!forgeRequestImmutableContentMatches(existing, input)) {
                throw new Error('forge_request_receipt_conflict');
            }
            throw new Error(`forge_request_superseded:${existing.superseded_by ?? 'unknown'}`);
        }
        const autonomousPolicyReplay = existing.status === 'PENDING_AUTH'
            && existing.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE
            && existing.authorization_binding_sha256 === undefined
            && existing.authorization_challenge_sha256 === undefined
            && forgeRequestImmutableContentMatches(existing, input)
            && isAutonomousDispatchPolicyCandidate(db, existing);
        if (!forgeRequestContentMatches(existing, input)
            && !isPendingRootForgeAuthorizationReplay(existing, input)
            && !autonomousPolicyReplay
            && !isPendingForgeRequestCorrectionReplay({
                db, existing, input, extension,
            })) {
            throw new Error('forge_request_receipt_conflict');
        }
        const request = extendPendingRequestAuthorization(db, existing, extension, now);
        return {
            request,
            replayed: true,
            challenge_upgraded: request !== existing,
        };
    }
    const decisionConflict = getForgeRequestByDecision(
        db, input.bead_id, input.decision_id,
    );
    if (decisionConflict) {
        const corrected = tryCorrectPendingForgeRequest({
            db, existing: decisionConflict, input, extension, now,
        });
        if (corrected) {
            return {
                request: corrected,
                replayed: false,
                challenge_upgraded: false,
                superseded_request_id: decisionConflict.request_id,
            };
        }
        throw new Error(`forge_request_decision_conflict:${decisionConflict.request_id}`);
    }
    db.prepare(`
        INSERT INTO hall_forge_requests (
            request_id, repo_id, bead_id, decision_id,
            requester_thread_id, requester_turn_id, requester_record_set_sha256,
            authorization_profile, authorization_binding_sha256,
            authorization_challenge_sha256,
            request_sha256, request_summary_json, adapter_ref, write_capability,
            target_paths_sha256, live_source_allowed, max_attempts, status,
            created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_AUTH', ?, ?
        )
    `).run(
        input.request_id,
        input.repo_id,
        input.bead_id,
        input.decision_id,
        input.requester_thread_id ?? null,
        input.requester_turn_id ?? null,
        input.requester_record_set_sha256 ?? null,
        extension.profile ?? null,
        extension.binding ?? null,
        extension.challenge ?? null,
        input.request_sha256,
        input.request_summary_json,
        input.adapter_ref ?? null,
        input.write_capability ?? null,
        input.target_paths_sha256,
        input.live_source_allowed ? 1 : 0,
        input.max_attempts,
        now,
        now,
    );
    return {
        request: getForgeRequest(db, input.request_id)!,
        replayed: false,
        challenge_upgraded: false,
    };
}
