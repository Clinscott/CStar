import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

import type {
    HallForgeAuthorizationRecord,
    HallForgeRequestRecord,
} from '../../../types/forge.js';
import {
    getForgeAuthorizationByRequest,
    getForgeRequest,
} from './forge_receipt_controller.js';
import { forgeRequesterLineageMatchesRequest } from './forge_requester_lineage.js';

export interface SaveForgeRequestInput {
    request_id: string;
    repo_id: string;
    bead_id: string;
    decision_id: string;
    request_sha256: string;
    request_summary_json: string;
    target_paths_sha256: string;
    live_source_allowed: boolean;
    max_attempts: number;
    requester_thread_id?: string;
    requester_turn_id?: string;
    requester_record_set_sha256?: string;
    authorization_profile?: 'exact_request_challenge_v1';
    authorization_challenge_sha256?: string;
    adapter_ref?: string;
    write_capability?: 'response_only' | 'project_files';
    now?: number;
}

export interface AuthorizeForgeRequestInput {
    request_id: string;
    request_sha256: string;
    authorization_profile: 'exact_request_challenge_v1';
    challenge_sha256: string;
    operator_authorization_ref: string;
    operator_thread_id: string;
    operator_turn_id: string;
    operator_message_sha256: string;
    operator_record_sha256: string;
    operator_record_set_sha256: string;
    operator_record_count: number;
    execution_grant_schema?: 'cstar.forge_legacy_v2_execution_grant.v1';
    execution_grant_sha256?: string;
    execution_grant_json?: string;
    authorized_at: number;
    expires_at: number;
    now?: number;
}

function requestContentMatches(
    existing: HallForgeRequestRecord,
    input: SaveForgeRequestInput,
): boolean {
    return existing.request_id === input.request_id
        && existing.repo_id === input.repo_id
        && existing.bead_id === input.bead_id
        && existing.decision_id === input.decision_id
        && existing.request_sha256 === input.request_sha256
        && existing.request_summary_json === input.request_summary_json
        && existing.target_paths_sha256 === input.target_paths_sha256
        && existing.adapter_ref === input.adapter_ref
        && existing.write_capability === input.write_capability
        && existing.live_source_allowed === (input.live_source_allowed ? 1 : 0)
        && existing.max_attempts === input.max_attempts;
}

function challengeExtensionMatches(
    existing: HallForgeRequestRecord,
    input: SaveForgeRequestInput,
): boolean {
    return existing.authorization_profile === input.authorization_profile
        && existing.authorization_challenge_sha256 === input.authorization_challenge_sha256;
}

function validateChallengeExtension(input: SaveForgeRequestInput): void {
    const hasProfile = input.authorization_profile !== undefined;
    const hasChallenge = input.authorization_challenge_sha256 !== undefined;
    if (hasProfile !== hasChallenge) throw new Error('forge_request_challenge_fields_incomplete');
    if (hasProfile && (
        input.authorization_profile !== 'exact_request_challenge_v1'
        || !/^[a-f0-9]{64}$/.test(input.authorization_challenge_sha256 ?? '')
    )) {
        throw new Error('forge_request_challenge_fields_invalid');
    }
}

function extendLegacyRequestChallenge(
    db: Database.Database,
    existing: HallForgeRequestRecord,
    input: SaveForgeRequestInput,
    now: number,
): HallForgeRequestRecord {
    if (challengeExtensionMatches(existing, input)) return existing;
    if (
        existing.authorization_profile !== undefined
        || existing.authorization_challenge_sha256 !== undefined
        || !input.authorization_profile
        || !input.authorization_challenge_sha256
        || !['PENDING_AUTH', 'AUTHORIZED'].includes(existing.status)
    ) {
        throw new Error('forge_request_receipt_conflict');
    }
    const attemptCount = Number((db.prepare(
        'SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?',
    ).get(existing.request_id) as { count?: number }).count ?? 0);
    if (attemptCount !== 0) throw new Error('forge_request_legacy_upgrade_requires_unspent_request');
    const updated = db.prepare(`
        UPDATE hall_forge_requests
        SET authorization_profile = ?, authorization_challenge_sha256 = ?,
            status = 'PENDING_AUTH', authorized_at = NULL, expires_at = NULL,
            active_attempt_id = NULL, completed_at = NULL, updated_at = ?
        WHERE request_id = ?
          AND authorization_profile IS NULL
          AND authorization_challenge_sha256 IS NULL
          AND status IN ('PENDING_AUTH', 'AUTHORIZED')
    `).run(
        input.authorization_profile,
        input.authorization_challenge_sha256,
        now,
        existing.request_id,
    );
    if (Number(updated.changes) !== 1) throw new Error('forge_request_legacy_upgrade_race');
    return getForgeRequest(db, existing.request_id)!;
}

export function saveForgeRequest(
    db: Database.Database,
    input: SaveForgeRequestInput,
): { request: HallForgeRequestRecord; replayed: boolean; challenge_upgraded: boolean } {
    const now = input.now ?? Date.now();
    if (input.max_attempts < 1 || input.max_attempts > 10) {
        throw new Error('forge_request_max_attempts_invalid');
    }
    validateChallengeExtension(input);
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
            if (!requestContentMatches(existing, input)) {
                throw new Error('forge_request_receipt_conflict');
            }
            const request = extendLegacyRequestChallenge(db, existing, input, now);
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
                authorization_profile, authorization_challenge_sha256,
                request_sha256, request_summary_json, adapter_ref, write_capability,
                target_paths_sha256, live_source_allowed, max_attempts, status,
                created_at, updated_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_AUTH', ?, ?
            )
        `).run(
            input.request_id,
            input.repo_id,
            input.bead_id,
            input.decision_id,
            input.requester_thread_id ?? null,
            input.requester_turn_id ?? null,
            input.requester_record_set_sha256 ?? null,
            input.authorization_profile ?? null,
            input.authorization_challenge_sha256 ?? null,
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

function requestAuthorizationMatches(
    request: HallForgeRequestRecord,
    input: AuthorizeForgeRequestInput,
): boolean {
    return request.request_sha256 === input.request_sha256
        && request.authorization_profile === input.authorization_profile
        && request.authorization_challenge_sha256 === input.challenge_sha256
        && request.operator_authorization_ref === input.operator_authorization_ref
        && request.operator_thread_id === input.operator_thread_id
        && request.operator_turn_id === input.operator_turn_id
        && request.operator_message_sha256 === input.operator_message_sha256
        && request.operator_record_sha256 === input.operator_record_sha256
        && request.operator_record_set_sha256 === input.operator_record_set_sha256
        && request.operator_record_count === input.operator_record_count
        && request.authorized_at === input.authorized_at
        && request.expires_at === input.expires_at;
}

function stableValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, item]) => [key, stableValue(item)]),
        );
    }
    return value;
}

function stableJson(value: unknown): string {
    return JSON.stringify(stableValue(value));
}

function validateExecutionGrant(input: AuthorizeForgeRequestInput): Record<string, unknown> | null {
    const fields = [
        input.execution_grant_schema,
        input.execution_grant_sha256,
        input.execution_grant_json,
    ];
    const present = fields.filter((value) => value !== undefined).length;
    if (present === 0) return null;
    if (present !== fields.length
        || input.execution_grant_schema !== 'cstar.forge_legacy_v2_execution_grant.v1'
        || !/^[a-f0-9]{64}$/.test(input.execution_grant_sha256 ?? '')) {
        throw new Error('forge_authorization_execution_grant_invalid');
    }
    let grant: unknown;
    try {
        grant = JSON.parse(input.execution_grant_json!);
    } catch {
        throw new Error('forge_authorization_execution_grant_invalid');
    }
    if (!grant || typeof grant !== 'object' || Array.isArray(grant)
        || stableJson(grant) !== input.execution_grant_json
        || createHash('sha256').update(input.execution_grant_json!, 'utf-8').digest('hex')
            !== input.execution_grant_sha256) {
        throw new Error('forge_authorization_execution_grant_invalid');
    }
    const record = grant as Record<string, unknown>;
    if (record.schema !== input.execution_grant_schema
        || record.legacy_request_id !== input.request_id
        || record.legacy_request_sha256 !== input.request_sha256) {
        throw new Error('forge_authorization_execution_grant_binding_invalid');
    }
    return record;
}

function authorizationRecordMatches(
    authorization: HallForgeAuthorizationRecord,
    input: AuthorizeForgeRequestInput,
): boolean {
    return authorization.request_id === input.request_id
        && authorization.request_sha256 === input.request_sha256
        && authorization.authorization_profile === input.authorization_profile
        && authorization.challenge_sha256 === input.challenge_sha256
        && authorization.operator_authorization_ref === input.operator_authorization_ref
        && authorization.operator_thread_id === input.operator_thread_id
        && authorization.operator_turn_id === input.operator_turn_id
        && authorization.operator_message_sha256 === input.operator_message_sha256
        && authorization.operator_record_sha256 === input.operator_record_sha256
        && authorization.operator_record_set_sha256 === input.operator_record_set_sha256
        && authorization.operator_record_count === input.operator_record_count
        && authorization.execution_grant_schema === input.execution_grant_schema
        && authorization.execution_grant_sha256 === input.execution_grant_sha256
        && authorization.execution_grant_json === input.execution_grant_json
        && authorization.authorized_at === input.authorized_at
        && authorization.expires_at === input.expires_at;
}

export function authorizeForgeRequest(
    db: Database.Database,
    input: AuthorizeForgeRequestInput,
): {
    request: HallForgeRequestRecord;
    authorization: HallForgeAuthorizationRecord;
    replayed: boolean;
} {
    const now = input.now ?? Date.now();
    const executionGrant = validateExecutionGrant(input);
    if (
        !input.operator_authorization_ref.trim()
        || !input.operator_thread_id.trim()
        || !input.operator_turn_id.trim()
        || !/^[a-f0-9]{64}$/.test(input.request_sha256)
        || input.authorization_profile !== 'exact_request_challenge_v1'
        || !/^[a-f0-9]{64}$/.test(input.challenge_sha256)
        || !/^[a-f0-9]{64}$/.test(input.operator_message_sha256)
        || !/^[a-f0-9]{64}$/.test(input.operator_record_sha256)
        || !/^[a-f0-9]{64}$/.test(input.operator_record_set_sha256)
        || input.operator_record_count !== 1
        || !Number.isFinite(input.authorized_at)
        || !Number.isFinite(input.expires_at)
        || input.authorized_at > now + 60_000
        || input.expires_at <= now
    ) {
        throw new Error('forge_authorization_attestation_invalid');
    }
    const authorize = db.transaction(() => {
        let request = getForgeRequest(db, input.request_id);
        if (!request) throw new Error('forge_request_not_found');
        const existingAuthorization = getForgeAuthorizationByRequest(db, request.request_id);
        if (existingAuthorization) {
            if (
                !requestAuthorizationMatches(request, input)
                || !authorizationRecordMatches(existingAuthorization, input)
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
        if (legacyCompatibility !== Boolean(executionGrant)) {
            throw new Error('forge_authorization_execution_grant_policy_invalid');
        }
        if (legacyCompatibility && !forgeRequesterLineageMatchesRequest(
            request,
            executionGrant?.legacy_requester_lineage,
        )) {
            throw new Error('forge_authorization_legacy_requester_lineage_invalid');
        }
        if (
            request.authorization_profile === undefined
            && request.authorization_challenge_sha256 === undefined
            && legacyCompatibility
        ) {
            if (request.status !== 'PENDING_AUTH') {
                throw new Error('forge_request_legacy_upgrade_requires_pending_request');
            }
            const upgraded = db.prepare(`
                UPDATE hall_forge_requests
                SET authorization_profile = ?, authorization_challenge_sha256 = ?, updated_at = ?
                WHERE request_id = ? AND request_sha256 = ? AND status = 'PENDING_AUTH'
                  AND authorization_profile IS NULL
                  AND authorization_challenge_sha256 IS NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM hall_forge_attempts WHERE request_id = ?
                  )
            `).run(
                input.authorization_profile,
                input.challenge_sha256,
                now,
                request.request_id,
                request.request_sha256,
                request.request_id,
            );
            if (Number(upgraded.changes) !== 1) {
                throw new Error('forge_request_legacy_upgrade_race');
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
                challenge_sha256, operator_authorization_ref, operator_thread_id,
                operator_turn_id, operator_message_sha256, operator_record_sha256,
                operator_record_set_sha256, operator_record_count,
                execution_grant_schema, execution_grant_sha256, execution_grant_json,
                authorized_at, expires_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            authorizationId,
            request.request_id,
            request.request_sha256,
            input.authorization_profile,
            input.challenge_sha256,
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
            SET operator_authorization_ref = ?, operator_thread_id = ?, operator_turn_id = ?,
                operator_message_sha256 = ?, operator_record_sha256 = ?,
                operator_record_set_sha256 = ?, operator_record_count = ?,
                status = 'AUTHORIZED', authorized_at = ?, expires_at = ?, updated_at = ?
            WHERE request_id = ? AND request_sha256 = ?
              AND status IN ('PENDING_AUTH', 'AUTHORIZED')
        `).run(
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
