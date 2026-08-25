import type Database from 'better-sqlite3';

import type {
    HallForgeRequestRecord,
    SaveForgeRequestInput,
} from '../../../types/forge.js';
import {
    isForgeSetManifestIterationRequest,
    verifyForgeSetManifestIterationCorrectionAuthority,
} from '../../cstar-kernel-mcp/tools/forge_set_manifest_iteration_authority.js';
import { hashForgeRuntimeBinding } from
    '../../cstar-kernel-mcp/tools/forge_request_contract.js';
import {
    forgeRequestImmutableContentMatches,
    ROOT_USER_FORGE_INTENT_PROFILE,
    type ForgeRequestAuthorizationExtension,
} from './forge_authorization_policy.js';
import { getForgeRequest } from './forge_receipt_controller.js';

function countRows(db: Database.Database, table: string, requestId: string): number {
    return Number((db.prepare(
        `SELECT COUNT(*) AS count FROM ${table} WHERE request_id = ?`,
    ).get(requestId) as { count?: number }).count ?? 0);
}

function replacementRecord(
    input: SaveForgeRequestInput,
    existing: HallForgeRequestRecord,
    now: number,
): HallForgeRequestRecord {
    return {
        request_id: input.request_id,
        repo_id: input.repo_id,
        bead_id: input.bead_id,
        decision_id: input.decision_id,
        requester_thread_id: existing.requester_thread_id,
        requester_turn_id: existing.requester_turn_id,
        requester_record_set_sha256: existing.requester_record_set_sha256,
        authorization_profile: input.authorization_profile,
        authorization_binding_sha256: input.authorization_binding_sha256,
        authorization_challenge_sha256: input.authorization_challenge_sha256,
        request_sha256: input.request_sha256,
        request_summary_json: input.request_summary_json,
        adapter_ref: input.adapter_ref,
        write_capability: input.write_capability,
        target_paths_sha256: input.target_paths_sha256,
        live_source_allowed: input.live_source_allowed ? 1 : 0,
        max_attempts: input.max_attempts,
        status: 'PENDING_AUTH',
        created_at: now,
        updated_at: now,
        supersedes_request_id: existing.request_id,
    };
}

function assertCorrectionEligibility(
    db: Database.Database,
    existing: HallForgeRequestRecord,
    input: SaveForgeRequestInput,
    extension: ForgeRequestAuthorizationExtension,
): void {
    const existingCanonical = JSON.parse(existing.request_summary_json);
    const replacementCanonical = JSON.parse(input.request_summary_json);
    const runtimeChanged = hashForgeRuntimeBinding(existingCanonical)
        !== hashForgeRuntimeBinding(replacementCanonical);
    if (existing.repo_id !== input.repo_id
        || existing.bead_id !== input.bead_id
        || existing.decision_id !== input.decision_id
        || !existing.requester_thread_id
        || existing.requester_thread_id !== input.requester_thread_id
        || existing.authorization_profile !== ROOT_USER_FORGE_INTENT_PROFILE
        || extension.profile !== ROOT_USER_FORGE_INTENT_PROFILE
        || extension.binding !== undefined || extension.challenge !== undefined
        || existing.status !== 'PENDING_AUTH'
        || existing.authorization_binding_sha256 !== undefined
        || existing.authorization_challenge_sha256 !== undefined
        || existing.operator_authorization_ref !== undefined
        || existing.operator_thread_id !== undefined || existing.operator_turn_id !== undefined
        || existing.operator_message_sha256 !== undefined
        || existing.operator_record_sha256 !== undefined
        || existing.operator_record_set_sha256 !== undefined
        || existing.operator_record_count !== undefined
        || existing.active_attempt_id !== undefined || existing.authorized_at !== undefined
        || existing.expires_at !== undefined || existing.completed_at !== undefined
        || existing.superseded_by !== undefined || existing.created_at !== existing.updated_at
        || existing.adapter_ref !== input.adapter_ref
        || existing.write_capability !== input.write_capability
        || existing.live_source_allowed !== 0 || input.live_source_allowed
        || existing.max_attempts !== 1 || input.max_attempts !== 1
        || (runtimeChanged && input.runtime_evidence_refresh_validated !== true)
        || countRows(db, 'hall_forge_authorizations', existing.request_id) !== 0
        || countRows(db, 'hall_forge_attempts', existing.request_id) !== 0) {
        throw new Error('forge_request_preauthorization_correction_not_allowed');
    }
}

function insertReplacement(
    db: Database.Database,
    replacement: HallForgeRequestRecord,
): void {
    db.prepare(`
        INSERT INTO hall_forge_requests (
            request_id, repo_id, bead_id, decision_id,
            requester_thread_id, requester_turn_id, requester_record_set_sha256,
            authorization_profile, authorization_binding_sha256,
            authorization_challenge_sha256,
            request_sha256, request_summary_json, adapter_ref, write_capability,
            target_paths_sha256, live_source_allowed, max_attempts, status,
            created_at, updated_at, supersedes_request_id
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            'PENDING_AUTH', ?, ?, ?
        )
    `).run(
        replacement.request_id, replacement.repo_id, replacement.bead_id,
        replacement.decision_id, replacement.requester_thread_id ?? null,
        replacement.requester_turn_id ?? null,
        replacement.requester_record_set_sha256 ?? null,
        replacement.authorization_profile ?? null,
        replacement.authorization_binding_sha256 ?? null,
        replacement.authorization_challenge_sha256 ?? null,
        replacement.request_sha256, replacement.request_summary_json,
        replacement.adapter_ref ?? null, replacement.write_capability ?? null,
        replacement.target_paths_sha256, replacement.live_source_allowed,
        replacement.max_attempts, replacement.created_at, replacement.updated_at,
        replacement.supersedes_request_id,
    );
}

export function isPendingForgeRequestCorrectionReplay(args: {
    db: Database.Database;
    existing: HallForgeRequestRecord;
    input: SaveForgeRequestInput;
    extension: ForgeRequestAuthorizationExtension;
}): boolean {
    const { db, existing, input, extension } = args;
    if (!existing.supersedes_request_id || existing.status !== 'PENDING_AUTH'
        || existing.authorization_profile !== ROOT_USER_FORGE_INTENT_PROFILE
        || extension.profile !== ROOT_USER_FORGE_INTENT_PROFILE
        || extension.binding !== undefined || extension.challenge !== undefined
        || existing.requester_thread_id !== input.requester_thread_id
        || !forgeRequestImmutableContentMatches(existing, input)) return false;
    try {
        verifyForgeSetManifestIterationCorrectionAuthority({ db, replacement: existing });
        return true;
    } catch {
        return false;
    }
}

export function tryCorrectPendingForgeRequest(args: {
    db: Database.Database;
    existing: HallForgeRequestRecord;
    input: SaveForgeRequestInput;
    extension: ForgeRequestAuthorizationExtension;
    now: number;
}): HallForgeRequestRecord | null {
    const { db, existing, input, extension, now } = args;
    if (!isForgeSetManifestIterationRequest(db, existing)) return null;
    assertCorrectionEligibility(db, existing, input, extension);
    const replacement = replacementRecord(input, existing, now);
    verifyForgeSetManifestIterationCorrectionAuthority({ db, replacement });
    const updated = db.prepare(`
        UPDATE hall_forge_requests
        SET status = 'SUPERSEDED', superseded_by = ?, completed_at = ?, updated_at = ?
        WHERE request_id = ? AND status = 'PENDING_AUTH' AND updated_at = ?
          AND active_attempt_id IS NULL AND operator_authorization_ref IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM hall_forge_authorizations WHERE request_id = ?
          ) AND NOT EXISTS (
              SELECT 1 FROM hall_forge_attempts WHERE request_id = ?
          )
    `).run(
        input.request_id, now, now, existing.request_id, existing.updated_at,
        existing.request_id, existing.request_id,
    );
    if (Number(updated.changes) !== 1) {
        throw new Error('forge_request_preauthorization_correction_race');
    }
    insertReplacement(db, replacement);
    return getForgeRequest(db, input.request_id)
        ?? (() => { throw new Error('forge_request_preauthorization_correction_missing'); })();
}
