import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

import type { HallForgeRequestRecord } from '../../../types/forge.js';
import { getForgeRequest } from './forge_receipt_controller.js';
import { isForgeRequesterLineageValid } from './forge_requester_lineage.js';

const SHA256 = /^[a-f0-9]{64}$/;

export interface LegacyV2RequesterLineageInput {
    request_id: string;
    request_sha256: string;
    requester_thread_id: string;
    requester_turn_id: string;
    requester_record_set_sha256: string;
    now?: number;
}

function assertLegacyRequest(request: HallForgeRequestRecord, input: LegacyV2RequesterLineageInput): void {
    if (request.request_sha256 !== input.request_sha256) {
        throw new Error('forge_legacy_v2_reconciliation_request_hash_mismatch');
    }
    let schema: unknown;
    try {
        schema = (JSON.parse(request.request_summary_json) as Record<string, unknown>).schema;
    } catch {
        throw new Error('forge_request_summary_invalid');
    }
    if (schema !== 'cstar.forge_request.v2') {
        throw new Error('forge_legacy_v2_reconciliation_request_schema_invalid');
    }
    const summarySha256 = createHash('sha256').update(request.request_summary_json, 'utf-8').digest('hex');
    if (summarySha256 !== request.request_sha256
        || request.request_id !== `dispatch-forge-${summarySha256.slice(0, 32)}`) {
        throw new Error('forge_legacy_v2_reconciliation_request_integrity_invalid');
    }
    if (request.status !== 'PENDING_AUTH') {
        throw new Error('forge_legacy_v2_reconciliation_requires_pending_request');
    }
}

function assertLineageInput(input: LegacyV2RequesterLineageInput): void {
    if (!input.request_id.trim() || !SHA256.test(input.request_sha256)
        || !isForgeRequesterLineageValid(
            input.requester_thread_id,
            input.requester_turn_id,
            input.requester_record_set_sha256,
        )) {
        throw new Error('forge_legacy_v2_requester_lineage_invalid');
    }
}

function matchesInput(request: HallForgeRequestRecord, input: LegacyV2RequesterLineageInput): boolean {
    return request.requester_thread_id === input.requester_thread_id
        && request.requester_turn_id === input.requester_turn_id
        && request.requester_record_set_sha256 === input.requester_record_set_sha256;
}

export function bindLegacyV2RequesterLineage(
    db: Database.Database,
    input: LegacyV2RequesterLineageInput,
): { request: HallForgeRequestRecord; replayed: boolean } {
    assertLineageInput(input);
    const bind = db.transaction(() => {
        let request = getForgeRequest(db, input.request_id);
        if (!request) throw new Error('forge_request_not_found');
        assertLegacyRequest(request, input);
        const lineageFields = [
            request.requester_thread_id,
            request.requester_turn_id,
            request.requester_record_set_sha256,
        ];
        const lineageFieldCount = lineageFields.filter(Boolean).length;
        if (lineageFieldCount !== 0 && lineageFieldCount !== lineageFields.length) {
            throw new Error('forge_legacy_v2_requester_lineage_partial');
        }
        if (lineageFieldCount === lineageFields.length && !isForgeRequesterLineageValid(
            request.requester_thread_id,
            request.requester_turn_id,
            request.requester_record_set_sha256,
        )) {
            throw new Error('forge_legacy_v2_requester_lineage_tampered');
        }
        const attemptCount = Number((db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?',
        ).get(request.request_id) as { count?: number }).count ?? 0);
        const authorizationCount = Number((db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_authorizations WHERE request_id = ?',
        ).get(request.request_id) as { count?: number }).count ?? 0);
        if (attemptCount !== 0 || authorizationCount !== 0) {
            throw new Error('forge_legacy_v2_reconciliation_requires_unspent_unauthorized_request');
        }
        if (lineageFieldCount === lineageFields.length) {
            return { request, replayed: true };
        }
        const updated = db.prepare(`
            UPDATE hall_forge_requests
            SET requester_thread_id = ?, requester_turn_id = ?, requester_record_set_sha256 = ?, updated_at = ?
            WHERE request_id = ? AND request_sha256 = ? AND status = 'PENDING_AUTH'
              AND requester_thread_id IS NULL AND requester_turn_id IS NULL
              AND requester_record_set_sha256 IS NULL
              AND NOT EXISTS (SELECT 1 FROM hall_forge_attempts WHERE request_id = ?)
              AND NOT EXISTS (SELECT 1 FROM hall_forge_authorizations WHERE request_id = ?)
        `).run(
            input.requester_thread_id,
            input.requester_turn_id,
            input.requester_record_set_sha256,
            input.now ?? Date.now(),
            request.request_id,
            request.request_sha256,
            request.request_id,
            request.request_id,
        );
        if (Number(updated.changes) !== 1) {
            throw new Error('forge_legacy_v2_requester_lineage_race');
        }
        request = getForgeRequest(db, input.request_id);
        if (!request || !matchesInput(request, input)) {
            throw new Error('forge_legacy_v2_requester_lineage_persistence_failed');
        }
        return { request, replayed: false };
    });
    return bind.immediate();
}
