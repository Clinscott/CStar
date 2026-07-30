import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

import type {
    AuthorizeForgeRequestInput,
    HallForgeAuthorizationRecord,
    HallForgeRequestRecord,
    SaveForgeRequestInput,
} from '../../../types/forge.js';
export type { AuthorizeForgeRequestInput, SaveForgeRequestInput } from '../../../types/forge.js';
import {
    getForgeAuthorizationByRequest,
    getForgeRequest,
} from './forge_receipt_controller.js';
import {
    forgeAuthorizationRecordMatches,
    forgeRequestAuthorizationMatches,
    forgeRequestContentMatches,
    isForgeAuthorizationProfile,
    LEGACY_EXACT_FORGE_CHALLENGE_PROFILE,
    normalizeForgeRequestAuthorizationExtension,
    ROOT_USER_FORGE_INTENT_PROFILE,
    validateForgeExecutionGrant,
    validateLegacyExactAuthorizationBinding,
} from './forge_authorization_policy.js';
import {
    forgeRequesterLineageMatchesRequest,
    isForgeRequesterLineageValid,
} from './forge_requester_lineage.js';
import {
    forgeAuthorizationRecordCountIsValid,
    parseForgeAuthorizationIntent,
    resolveForgeRequestAuthorizationBinding,
} from './forge_request_authorization_binding.js';

function extendPendingRequestAuthorization(
    db: Database.Database,
    existing: HallForgeRequestRecord,
    extension: ReturnType<typeof normalizeForgeRequestAuthorizationExtension>,
    now: number,
): HallForgeRequestRecord {
    if (existing.authorization_profile === LEGACY_EXACT_FORGE_CHALLENGE_PROFILE
        && extension.profile === ROOT_USER_FORGE_INTENT_PROFILE) return existing;
    if (existing.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE
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
    if (Number(updated.changes) !== 1) throw new Error('forge_request_authorization_transition_race');
    return getForgeRequest(db, existing.request_id)!;
}

export function saveForgeRequest(
    db: Database.Database,
    input: SaveForgeRequestInput,
): { request: HallForgeRequestRecord; replayed: boolean; challenge_upgraded: boolean } {
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
    const save = db.transaction(() => {
        const bead = db.prepare('SELECT repo_id, status FROM hall_beads WHERE bead_id = ?').get(input.bead_id) as {
            repo_id?: string;
            status?: string;
        } | undefined;
        if (!bead || bead.repo_id !== input.repo_id) {
            throw new Error('forge_request_bead_not_found_in_repository');
        }
        if (['RESOLVED', 'ARCHIVED', 'SUPERSEDED'].includes(bead.status ?? '')) {
            throw new Error('forge_request_bead_is_terminal');
        }
        const existing = getForgeRequest(db, input.request_id);
        if (existing) {
            if (!forgeRequestContentMatches(existing, input)) {
                throw new Error('forge_request_receipt_conflict');
            }
            const request = extendPendingRequestAuthorization(db, existing, extension, now);
            return {
                request,
                replayed: true,
                challenge_upgraded: request !== existing,
            };
        }
        const decisionConflict = db.prepare(
            'SELECT request_id FROM hall_forge_requests WHERE bead_id = ? AND decision_id = ?',
        ).get(input.bead_id, input.decision_id) as { request_id?: string } | undefined;
        if (decisionConflict) {
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
    });
    return save.immediate();
}

export function authorizeForgeRequest(
    db: Database.Database,
    rawInput: AuthorizeForgeRequestInput,
): {
    request: HallForgeRequestRecord;
    authorization: HallForgeAuthorizationRecord;
    replayed: boolean;
} {
    const input: AuthorizeForgeRequestInput = rawInput.authorization_profile
        === LEGACY_EXACT_FORGE_CHALLENGE_PROFILE
        ? {
            ...rawInput,
            authorization_binding_sha256: validateLegacyExactAuthorizationBinding(
                rawInput.authorization_binding_sha256,
                rawInput.challenge_sha256,
            ),
            operator_intent_json: undefined,
        }
        : rawInput;
    const now = input.now ?? Date.now();
    const executionGrant = validateForgeExecutionGrant(input);
    const authorizationIntent = parseForgeAuthorizationIntent(input);
    if (
        !input.operator_authorization_ref.trim()
        || !input.operator_thread_id.trim()
        || !input.operator_turn_id.trim()
        || !/^[a-f0-9]{64}$/.test(input.request_sha256)
        || !isForgeAuthorizationProfile(input.authorization_profile)
        || !/^[a-f0-9]{64}$/.test(input.authorization_binding_sha256 ?? '')
        || (input.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE
            && input.challenge_sha256 !== undefined)
        || !/^[a-f0-9]{64}$/.test(input.operator_message_sha256)
        || !/^[a-f0-9]{64}$/.test(input.operator_record_sha256)
        || !/^[a-f0-9]{64}$/.test(input.operator_record_set_sha256)
        || !forgeAuthorizationRecordCountIsValid(input, authorizationIntent)
        || !Number.isSafeInteger(input.authorized_at)
        || !Number.isSafeInteger(input.expires_at)
        || input.authorized_at > now + 60_000
        || now - input.authorized_at > 24 * 60 * 60 * 1_000
        || input.expires_at <= input.authorized_at
        || input.expires_at - input.authorized_at > 24 * 60 * 60 * 1_000
        || input.expires_at <= now
    ) {
        throw new Error('forge_authorization_attestation_invalid');
    }
    const authorize = db.transaction(() => {
        let request = getForgeRequest(db, input.request_id);
        if (!request) throw new Error('forge_request_not_found');
        const existingAuthorization = getForgeAuthorizationByRequest(db, request.request_id);
        const expectedBinding = resolveForgeRequestAuthorizationBinding({
            db, request, input, existingAuthorization, intent: authorizationIntent,
        });
        if (input.authorization_binding_sha256 !== expectedBinding) {
            throw new Error('forge_authorization_binding_mismatch');
        }
        if (existingAuthorization) {
            if (
                !forgeRequestAuthorizationMatches(request, input)
                || !forgeAuthorizationRecordMatches(existingAuthorization, input)
            ) {
                throw new Error('forge_request_authorization_conflict');
            }
            return { request, authorization: existingAuthorization, replayed: true };
        }
        if (!['PENDING_AUTH', 'AUTHORIZED'].includes(request.status)) {
            throw new Error(`forge_request_not_pending_authorization:${request.status}`);
        }
        if (request.request_sha256 !== input.request_sha256) {
            throw new Error('forge_authorization_request_hash_mismatch');
        }
        let requestSchema: unknown;
        try {
            requestSchema = (JSON.parse(request.request_summary_json) as Record<string, unknown>).schema;
        } catch {
            throw new Error('forge_request_summary_invalid');
        }
        const legacyCompatibility = requestSchema === 'cstar.forge_request.v2';
        if (!legacyCompatibility && requestSchema !== 'cstar.forge_request.v3') {
            throw new Error('forge_authorization_request_schema_invalid');
        }
        if (legacyCompatibility && input.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE) {
            throw new Error('forge_natural_authorization_legacy_v2_unsupported');
        }
        if (legacyCompatibility !== Boolean(executionGrant)) {
            throw new Error('forge_authorization_execution_grant_policy_invalid');
        }
        if (legacyCompatibility && !forgeRequesterLineageMatchesRequest(
            request,
            executionGrant?.legacy_requester_lineage,
        )) {
            throw new Error('forge_authorization_legacy_requester_lineage_invalid');
        }
        const requestProfileReady = request.authorization_profile === input.authorization_profile
            && request.authorization_binding_sha256 === expectedBinding
            && request.authorization_challenge_sha256 === input.challenge_sha256;
        if (!requestProfileReady) {
            const legacyExactUpgrade = legacyCompatibility
                && request.authorization_profile === undefined
                && input.authorization_profile === LEGACY_EXACT_FORGE_CHALLENGE_PROFILE;
            const v3NaturalUpgrade = !legacyCompatibility
                && request.status === 'PENDING_AUTH'
                && input.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE
                && (
                    request.authorization_profile === undefined
                    || request.authorization_profile === ROOT_USER_FORGE_INTENT_PROFILE
                    || request.authorization_profile === LEGACY_EXACT_FORGE_CHALLENGE_PROFILE
                )
                && (
                    request.authorization_profile !== ROOT_USER_FORGE_INTENT_PROFILE
                    || request.authorization_binding_sha256 === undefined
                );
            if (!legacyExactUpgrade && !v3NaturalUpgrade) {
                throw new Error('forge_request_authorization_profile_transition_invalid');
            }
            const upgraded = db.prepare(`
                UPDATE hall_forge_requests
                SET authorization_profile = ?, authorization_binding_sha256 = ?,
                    authorization_challenge_sha256 = ?, updated_at = ?
                WHERE request_id = ? AND request_sha256 = ? AND status = 'PENDING_AUTH'
                  AND NOT EXISTS (SELECT 1 FROM hall_forge_attempts WHERE request_id = ?)
                  AND NOT EXISTS (SELECT 1 FROM hall_forge_authorizations WHERE request_id = ?)
            `).run(
                input.authorization_profile,
                expectedBinding,
                input.challenge_sha256 ?? null,
                now,
                request.request_id,
                request.request_sha256,
                request.request_id,
                request.request_id,
            );
            if (Number(upgraded.changes) !== 1) {
                throw new Error('forge_request_authorization_profile_transition_race');
            }
            request = getForgeRequest(db, input.request_id);
            if (!request) throw new Error('forge_request_not_found');
        }
        if (
            request.max_attempts !== 1
            || request.live_source_allowed !== 0
            || !request.adapter_ref
            || !request.write_capability
            || request.authorization_profile !== input.authorization_profile
            || request.authorization_binding_sha256 !== expectedBinding
            || request.authorization_challenge_sha256 !== input.challenge_sha256
        ) {
            throw new Error('forge_authorization_request_policy_invalid');
        }
        const attemptCount = Number((db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?',
        ).get(request.request_id) as { count?: number }).count ?? 0);
        if (attemptCount !== 0) throw new Error('forge_authorization_requires_unspent_request');
        const consumedTurn = db.prepare(`
            SELECT request_id FROM hall_forge_authorizations
            WHERE operator_thread_id = ? AND operator_turn_id = ?
        `).get(input.operator_thread_id, input.operator_turn_id) as { request_id?: string } | undefined;
        if (consumedTurn && consumedTurn.request_id !== request.request_id) {
            throw new Error(`forge_operator_turn_already_consumed:${consumedTurn.request_id}`);
        }
        const consumedReference = db.prepare(`
            SELECT request_id FROM hall_forge_authorizations
            WHERE operator_authorization_ref = ?
        `).get(input.operator_authorization_ref) as { request_id?: string } | undefined;
        if (consumedReference && consumedReference.request_id !== request.request_id) {
            throw new Error(`forge_operator_authorization_already_consumed:${consumedReference.request_id}`);
        }
        const authorizationId = `forge-auth-${createHash('sha256').update([
            request.request_id,
            request.request_sha256,
            input.operator_record_set_sha256,
        ].join('\n'), 'utf-8').digest('hex').slice(0, 32)}`;
        db.prepare(`
            INSERT INTO hall_forge_authorizations (
                authorization_id, request_id, request_sha256, authorization_profile,
                authorization_binding_sha256, challenge_sha256, operator_intent_json,
                operator_authorization_ref, operator_thread_id, operator_turn_id,
                operator_message_sha256, operator_record_sha256,
                operator_record_set_sha256, operator_record_count,
                execution_grant_schema, execution_grant_sha256, execution_grant_json,
                authorized_at, expires_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            authorizationId,
            request.request_id,
            request.request_sha256,
            input.authorization_profile,
            expectedBinding,
            input.challenge_sha256 ?? null,
            input.operator_intent_json ?? null,
            input.operator_authorization_ref,
            input.operator_thread_id,
            input.operator_turn_id,
            input.operator_message_sha256,
            input.operator_record_sha256,
            input.operator_record_set_sha256,
            input.operator_record_count,
            input.execution_grant_schema ?? null,
            input.execution_grant_sha256 ?? null,
            input.execution_grant_json ?? null,
            input.authorized_at,
            input.expires_at,
            now,
        );
        const updated = db.prepare(`
            UPDATE hall_forge_requests
            SET authorization_profile = ?, authorization_binding_sha256 = ?,
                authorization_challenge_sha256 = ?, operator_authorization_ref = ?,
                operator_thread_id = ?, operator_turn_id = ?,
                operator_message_sha256 = ?, operator_record_sha256 = ?,
                operator_record_set_sha256 = ?, operator_record_count = ?,
                status = 'AUTHORIZED', authorized_at = ?, expires_at = ?, updated_at = ?
            WHERE request_id = ? AND request_sha256 = ?
              AND status IN ('PENDING_AUTH', 'AUTHORIZED')
              AND repo_id = ? AND bead_id = ? AND decision_id = ?
              AND request_summary_json = ? AND target_paths_sha256 = ?
              AND live_source_allowed = ? AND max_attempts = ?
              AND adapter_ref IS ? AND write_capability IS ?
              AND requester_thread_id IS ? AND requester_turn_id IS ?
              AND requester_record_set_sha256 IS ?
              AND authorization_profile = ?
              AND authorization_binding_sha256 = ?
              AND authorization_challenge_sha256 IS ?
        `).run(
            input.authorization_profile,
            expectedBinding,
            input.challenge_sha256 ?? null,
            input.operator_authorization_ref,
            input.operator_thread_id,
            input.operator_turn_id,
            input.operator_message_sha256,
            input.operator_record_sha256,
            input.operator_record_set_sha256,
            input.operator_record_count,
            input.authorized_at,
            input.expires_at,
            now,
            input.request_id,
            input.request_sha256,
            request.repo_id,
            request.bead_id,
            request.decision_id,
            request.request_summary_json,
            request.target_paths_sha256,
            request.live_source_allowed,
            request.max_attempts,
            request.adapter_ref ?? null,
            request.write_capability ?? null,
            request.requester_thread_id ?? null,
            request.requester_turn_id ?? null,
            request.requester_record_set_sha256 ?? null,
            input.authorization_profile,
            expectedBinding,
            input.challenge_sha256 ?? null,
        );
        if (Number(updated.changes) !== 1) throw new Error('forge_request_authorization_race');
        const authorization = getForgeAuthorizationByRequest(db, input.request_id);
        if (!authorization) throw new Error('forge_authorization_receipt_missing');
        return {
            request: getForgeRequest(db, input.request_id)!,
            authorization,
            replayed: false,
        };
    });
    return authorize.immediate();
}
