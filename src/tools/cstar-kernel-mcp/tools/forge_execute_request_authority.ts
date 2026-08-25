import type Database from 'better-sqlite3';

import { openForgeReadDb } from '../../pennyone/intel/forge_hall_store.js';
import {
    getForgeRequest,
    getForgeRequestByDecision,
} from '../../pennyone/intel/forge_receipt_controller.js';
import type { HallForgeRequestRecord } from '../../../types/forge.js';

export function readForgeRequestBeforeMutation(
    root: string,
    requestId: string,
): { db: Database.Database; request: HallForgeRequestRecord; release: () => void } {
    let handle: ReturnType<typeof openForgeReadDb>;
    try {
        handle = openForgeReadDb(root);
    } catch (error) {
        if (error instanceof Error && error.message === 'hall_store_missing') {
            throw new Error('forge_request_receipt_not_found');
        }
        throw error;
    }
    try {
        const request = getForgeRequest(handle.db, requestId);
        if (!request) throw new Error('forge_request_receipt_not_found');
        return { db: handle.db, request, release: handle.release };
    } catch (error) {
        handle.release();
        throw error;
    }
}

export function findForgeRequestByDecisionBeforeMutation(
    root: string,
    beadId: string,
    decisionId: string,
): { request: HallForgeRequestRecord | null; attemptCount: number; release: () => void } {
    let handle: ReturnType<typeof openForgeReadDb>;
    try {
        handle = openForgeReadDb(root);
    } catch (error) {
        if (error instanceof Error && error.message === 'hall_store_missing') {
            return { request: null, attemptCount: 0, release: () => undefined };
        }
        throw error;
    }
    try {
        const request = getForgeRequestByDecision(handle.db, beadId, decisionId);
        const attemptCount = request
            ? Number((handle.db.prepare(
                'SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?',
            ).get(request.request_id) as { count?: number }).count ?? 0)
            : 0;
        return {
            request,
            attemptCount,
            release: handle.release,
        };
    } catch (error) {
        handle.release();
        if (error instanceof Error && /no such table: hall_forge_requests/i.test(error.message)) {
            return { request: null, attemptCount: 0, release: () => undefined };
        }
        throw error;
    }
}

export function forgeRequestAuthorityMatches(
    expected: HallForgeRequestRecord,
    current: HallForgeRequestRecord,
): boolean {
    return expected.request_id === current.request_id
        && expected.repo_id === current.repo_id
        && expected.bead_id === current.bead_id
        && expected.decision_id === current.decision_id
        && expected.operator_authorization_ref === current.operator_authorization_ref
        && expected.operator_thread_id === current.operator_thread_id
        && expected.operator_turn_id === current.operator_turn_id
        && expected.operator_message_sha256 === current.operator_message_sha256
        && expected.operator_record_sha256 === current.operator_record_sha256
        && expected.operator_record_set_sha256 === current.operator_record_set_sha256
        && expected.operator_record_count === current.operator_record_count
        && expected.requester_thread_id === current.requester_thread_id
        && expected.requester_turn_id === current.requester_turn_id
        && expected.requester_record_set_sha256 === current.requester_record_set_sha256
        && expected.authorization_profile === current.authorization_profile
        && expected.authorization_binding_sha256 === current.authorization_binding_sha256
        && expected.authorization_challenge_sha256 === current.authorization_challenge_sha256
        && expected.request_sha256 === current.request_sha256
        && expected.request_summary_json === current.request_summary_json
        && expected.adapter_ref === current.adapter_ref
        && expected.write_capability === current.write_capability
        && expected.target_paths_sha256 === current.target_paths_sha256
        && expected.live_source_allowed === current.live_source_allowed
        && expected.max_attempts === current.max_attempts
        && expected.authorized_at === current.authorized_at
        && expected.expires_at === current.expires_at
        && expected.created_at === current.created_at;
}
