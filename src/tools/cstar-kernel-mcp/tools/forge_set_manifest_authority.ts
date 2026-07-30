import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { HallForgeRequestRecord } from '../../../types/forge.js';
import { ROOT_USER_FORGE_INTENT_PROFILE } from
    '../../pennyone/intel/forge_authorization_policy.js';
import {
    FORGE_SET_AUTHORIZATION_AGE_MS,
    readExactForgeSetSignal,
} from './forge_set_manifest_signal.js';
import type { VerifiedForgeOperatorIntent } from './forge_operator_intent_attestation.js';
import {
    hashCanonicalForgeRequest,
    hashForgeTargetPaths,
    stableJson,
    type CanonicalForgeRequest,
} from './forge_request_contract.js';
import type { VerifiedCodexRequestIdentity } from './operator_authorization.js';

const SHA256 = /^[a-f0-9]{64}$/;
const BOUNDED_REFERENCE = /^[^\u0000-\u001f\u007f]{1,240}$/u;
interface BeadAuthorityRow {
    bead_id: string;
    repo_id: string;
    target_ref: string;
    status: string;
    metadata_json: string;
    created_at: number;
    updated_at: number;
}
interface MutationIdentity {
    source: 'codex_request_meta';
    thread_id: string;
    turn_id: string;
    turn_record_set_sha256: string;
}

export interface SetManifestAuthorityProjection {
    schema: 'cstar.forge_set_manifest_authority.v1';
    parent: {
        bead_id: string;
        repo_id: string;
        target_ref: string;
        status: 'IN_PROGRESS';
        metadata_sha256: string;
        decision_id: string;
        design_revision: number;
        design_sha256: string;
        batch_order: string[];
    };
    child: {
        bead_id: string;
        target_ref: string;
        status: 'IN_PROGRESS';
        metadata_sha256: string;
        parent_bead_id: string;
        order: number;
        design_sha256: string;
    };
    request: {
        request_id: string;
        request_sha256: string;
        target_paths_sha256: string;
        bead_id: string;
        decision_id: string;
        requester_thread_id: string;
        requester_turn_id: string;
        requester_record_set_sha256: string;
        created_at: number;
    };
    operator: {
        thread_id: string;
        turn_id: string;
        record_sha256: string;
        record_set_sha256: string;
        record_count: 1;
    };
}

export interface VerifiedForgeSetManifestAuthority {
    intent: VerifiedForgeOperatorIntent;
    authority_manifest_sha256: string;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
    return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function requiredReference(value: unknown, code: string): string {
    if (typeof value !== 'string' || value !== value.trim() || !BOUNDED_REFERENCE.test(value)) {
        throw new Error(code);
    }
    return value;
}

function requiredHash(value: unknown, code: string): string {
    if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(code);
    return value;
}

function parseMetadata(value: string, code: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(value) as unknown;
        if (!isRecord(parsed)) throw new Error(code);
        return parsed;
    } catch {
        throw new Error(code);
    }
}

function parseMutationIdentity(value: unknown, code: string): MutationIdentity {
    if (!isRecord(value)
        || !exactKeys(value, [
            'source', 'thread_id', 'turn_id', 'turn_record_set_sha256',
        ])
        || value.source !== 'codex_request_meta') {
        throw new Error(code);
    }
    return {
        source: 'codex_request_meta',
        thread_id: requiredReference(value.thread_id, code),
        turn_id: requiredReference(value.turn_id, code),
        turn_record_set_sha256: requiredHash(value.turn_record_set_sha256, code),
    };
}

function mutationIdentityMatches(
    value: MutationIdentity,
    identity: VerifiedCodexRequestIdentity,
): boolean {
    return value.thread_id === identity.thread_id
        && value.turn_id === identity.turn_id
        && value.turn_record_set_sha256 === identity.turn_record_set_sha256;
}

function readBead(db: Database.Database, beadId: string, code: string): BeadAuthorityRow {
    const row = db.prepare(`
        SELECT bead_id, repo_id, target_ref, status, metadata_json, created_at, updated_at
        FROM hall_beads WHERE bead_id = ? LIMIT 1
    `).get(beadId) as Record<string, unknown> | undefined;
    if (!row || typeof row.metadata_json !== 'string') throw new Error(code);
    return {
        bead_id: String(row.bead_id),
        repo_id: String(row.repo_id),
        target_ref: String(row.target_ref ?? ''),
        status: String(row.status),
        metadata_json: row.metadata_json,
        created_at: Number(row.created_at),
        updated_at: Number(row.updated_at),
    };
}

function countRows(db: Database.Database, sql: string, ...params: unknown[]): number {
    return Number((db.prepare(sql).get(...params) as { count?: number }).count ?? 0);
}

function assertRequestIsUniqueAndUnspent(
    db: Database.Database,
    request: HallForgeRequestRecord,
    identity: VerifiedCodexRequestIdentity,
    allowReplay = false,
): void {
    const requesterRows = db.prepare(`
        SELECT request_id FROM hall_forge_requests
        WHERE requester_thread_id = ? AND requester_turn_id = ?
          AND requester_record_set_sha256 = ?
        ORDER BY created_at, request_id
    `).all(
        identity.thread_id, identity.turn_id, identity.turn_record_set_sha256,
    ) as Array<{ request_id?: string }>;
    if (requesterRows.length !== 1 || requesterRows[0]?.request_id !== request.request_id) {
        throw new Error('forge_set_manifest_requester_turn_reused');
    }
    if (!allowReplay && (countRows(db,
        'SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?',
        request.request_id) !== 0
        || countRows(db,
            'SELECT COUNT(*) AS count FROM hall_forge_authorizations WHERE request_id = ?',
            request.request_id) !== 0)) {
        throw new Error('forge_set_manifest_request_not_unspent');
    }
    if (!allowReplay && countRows(db, `
        SELECT COUNT(*) AS count FROM hall_forge_authorizations
        WHERE operator_thread_id = ? AND (
            operator_turn_id = ? OR operator_record_set_sha256 = ?
            OR operator_record_sha256 = ?
        )
    `, identity.thread_id, identity.turn_id, identity.turn_record_set_sha256,
    identity.turn_record_sha256) !== 0) {
        throw new Error('forge_set_manifest_operator_turn_reused');
    }
}

function assertRequestPolicy(request: HallForgeRequestRecord, allowReplay = false): void {
    let summary: unknown;
    try { summary = JSON.parse(request.request_summary_json); } catch {
        throw new Error('forge_set_manifest_request_summary_invalid');
    }
    const spend = isRecord(summary) && isRecord(summary.spend_policy)
        ? summary.spend_policy : null;
    const canonical = summary as CanonicalForgeRequest;
    if (!isRecord(summary) || summary.schema !== 'cstar.forge_request.v3'
        || summary.bead_id !== request.bead_id || summary.decision_id !== request.decision_id
        || spend?.mode !== 'live_authorized' || spend.max_retries !== 0
        || spend.live_source_allowed !== false || summary.retry_budget !== 0
        || summary.fixture_policy !== 'synthetic_only' || summary.max_attempts !== 1
        || (!allowReplay && request.status !== 'PENDING_AUTH')
        || (allowReplay && ![
            'PENDING_AUTH', 'AUTHORIZED', 'SUCCEEDED', 'FAILED_FINAL', 'EXHAUSTED', 'AMBIGUOUS',
        ].includes(request.status))
        || request.authorization_profile !== ROOT_USER_FORGE_INTENT_PROFILE
        || (!allowReplay && (
            request.authorization_binding_sha256 !== undefined
            || request.authorization_challenge_sha256 !== undefined
        ))
        || (!allowReplay && (
            request.operator_authorization_ref !== undefined
            || request.active_attempt_id !== undefined
            || request.authorized_at !== undefined || request.expires_at !== undefined
            || request.completed_at !== undefined
        ))
        || request.live_source_allowed !== 0
        || request.max_attempts !== 1 || (!allowReplay && request.created_at !== request.updated_at)
        || hashCanonicalForgeRequest(canonical) !== request.request_sha256
        || hashForgeTargetPaths(canonical) !== request.target_paths_sha256
        || !SHA256.test(request.request_sha256)
        || !SHA256.test(request.target_paths_sha256)) {
        throw new Error('forge_set_manifest_request_policy_invalid');
    }
}

export function resolveForgeSetManifestAuthorityProjection(
    db: Database.Database,
    request: HallForgeRequestRecord,
    identity: VerifiedCodexRequestIdentity,
    allowReplay = false,
): SetManifestAuthorityProjection {
    assertRequestPolicy(request, allowReplay);
    if (request.requester_thread_id !== identity.thread_id
        || request.requester_turn_id !== identity.turn_id
        || request.requester_record_set_sha256 !== identity.turn_record_set_sha256) {
        throw new Error('forge_set_manifest_requester_lineage_mismatch');
    }
    assertRequestIsUniqueAndUnspent(db, request, identity, allowReplay);

    const child = readBead(db, request.bead_id, 'forge_set_manifest_child_not_found');
    const childMetadata = parseMetadata(
        child.metadata_json, 'forge_set_manifest_child_metadata_invalid',
    );
    const parentBeadId = requiredReference(
        childMetadata.parent_bead_id, 'forge_set_manifest_parent_reference_invalid',
    );
    const parent = readBead(db, parentBeadId, 'forge_set_manifest_parent_not_found');
    const parentMetadata = parseMetadata(
        parent.metadata_json, 'forge_set_manifest_parent_metadata_invalid',
    );
    const parentDecision = requiredReference(
        parentMetadata.decision_id, 'forge_set_manifest_decision_invalid',
    );
    const designSha256 = requiredHash(
        parentMetadata.design_sha256, 'forge_set_manifest_design_hash_invalid',
    );
    const designRevision = parentMetadata.design_revision;
    const order = childMetadata.order;
    const rawBatchOrder = parentMetadata.batch_order;
    if (parentMetadata.schema !== 'cstar.set_manifest.v1'
        || parentMetadata.operator_set !== true
        || parent.status !== 'IN_PROGRESS' || child.status !== 'IN_PROGRESS'
        || !Number.isSafeInteger(designRevision) || Number(designRevision) < 1
        || !Number.isSafeInteger(order) || Number(order) < 1
        || !Array.isArray(rawBatchOrder) || rawBatchOrder.length === 0
        || rawBatchOrder.length > 64) {
        throw new Error('forge_set_manifest_not_current');
    }
    const batchOrder = rawBatchOrder.map((value) =>
        requiredReference(value, 'forge_set_manifest_batch_order_invalid'));
    if (new Set(batchOrder).size !== batchOrder.length
        || batchOrder[Number(order) - 1] !== child.bead_id) {
        throw new Error('forge_set_manifest_batch_order_mismatch');
    }
    const parentIdentity = parseMutationIdentity(
        parentMetadata.mutation_request_identity,
        'forge_set_manifest_parent_identity_invalid',
    );
    const childIdentity = parseMutationIdentity(
        childMetadata.mutation_request_identity,
        'forge_set_manifest_child_identity_invalid',
    );
    const parkedRequest = parentMetadata.parked_request_receipt;
    if (!mutationIdentityMatches(parentIdentity, identity)
        || !mutationIdentityMatches(childIdentity, identity)
        || parent.repo_id !== request.repo_id || child.repo_id !== request.repo_id
        || parent.target_ref !== parentDecision
        || childMetadata.design_sha256 !== designSha256
        || childMetadata.parent_bead_id !== parent.bead_id
        || child.target_ref !== `${parentDecision}:batch-${String(order)}`
        || request.bead_id !== child.bead_id
        || request.decision_id !== child.target_ref
        || (parkedRequest !== undefined
            && (typeof parkedRequest !== 'string' || parkedRequest === request.request_id))
        || parent.created_at > child.created_at
        || parent.updated_at > request.created_at || child.updated_at > request.created_at) {
        throw new Error('forge_set_manifest_request_lineage_mismatch');
    }
    const currentManifests = db.prepare(`
        SELECT bead_id FROM hall_beads
        WHERE repo_id = ? AND status = 'IN_PROGRESS' AND json_valid(metadata_json) = 1
          AND json_extract(metadata_json, '$.schema') = 'cstar.set_manifest.v1'
          AND json_extract(metadata_json, '$.operator_set') = 1
          AND json_extract(metadata_json, '$.mutation_request_identity.thread_id') = ?
          AND json_extract(metadata_json, '$.mutation_request_identity.turn_id') = ?
          AND json_extract(metadata_json,
              '$.mutation_request_identity.turn_record_set_sha256') = ?
        ORDER BY bead_id
    `).all(
        request.repo_id, identity.thread_id, identity.turn_id,
        identity.turn_record_set_sha256,
    ) as Array<{ bead_id?: string }>;
    if (currentManifests.length !== 1 || currentManifests[0]?.bead_id !== parent.bead_id) {
        throw new Error('forge_set_manifest_candidate_ambiguous');
    }
    return {
        schema: 'cstar.forge_set_manifest_authority.v1',
        parent: {
            bead_id: parent.bead_id,
            repo_id: parent.repo_id,
            target_ref: parent.target_ref,
            status: 'IN_PROGRESS',
            metadata_sha256: sha256(parent.metadata_json),
            decision_id: parentDecision,
            design_revision: Number(designRevision),
            design_sha256: designSha256,
            batch_order: batchOrder,
        },
        child: {
            bead_id: child.bead_id,
            target_ref: child.target_ref,
            status: 'IN_PROGRESS',
            metadata_sha256: sha256(child.metadata_json),
            parent_bead_id: parentBeadId,
            order: Number(order),
            design_sha256: designSha256,
        },
        request: {
            request_id: request.request_id,
            request_sha256: request.request_sha256,
            target_paths_sha256: request.target_paths_sha256,
            bead_id: request.bead_id,
            decision_id: request.decision_id,
            requester_thread_id: identity.thread_id,
            requester_turn_id: identity.turn_id,
            requester_record_set_sha256: identity.turn_record_set_sha256,
            created_at: request.created_at,
        },
        operator: {
            thread_id: identity.thread_id,
            turn_id: identity.turn_id,
            record_sha256: identity.turn_record_sha256,
            record_set_sha256: identity.turn_record_set_sha256,
            record_count: 1,
        },
    };
}

export function revalidateForgeSetManifestAuthority(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    identity: VerifiedCodexRequestIdentity;
    authorityManifestSha256: string;
}): void {
    const current = resolveForgeSetManifestAuthorityProjection(
        args.db, args.request, args.identity,
    );
    if (sha256(stableJson(current)) !== args.authorityManifestSha256) {
        throw new Error('forge_set_manifest_authority_drift');
    }
    if (!readExactForgeSetSignal(args.identity)) {
        throw new Error('forge_set_manifest_operator_signal_missing');
    }
}

export async function verifyCurrentForgeSetManifestAuthority(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    identity: VerifiedCodexRequestIdentity;
    now?: number;
}): Promise<VerifiedForgeSetManifestAuthority | null> {
    const now = args.now ?? Date.now();
    const setRecord = readExactForgeSetSignal(args.identity, now);
    if (!setRecord) return null;
    const projection = resolveForgeSetManifestAuthorityProjection(
        args.db, args.request, args.identity,
    );
    const authorityManifestSha256 = sha256(stableJson(projection));
    const authorizedAt = Date.parse(args.identity.turn_timestamp);
    const expiresAt = authorizedAt + FORGE_SET_AUTHORIZATION_AGE_MS;
    if (!Number.isSafeInteger(authorizedAt) || now >= expiresAt) {
        throw new Error('forge_set_manifest_operator_signal_expired');
    }
    const messageSha256 = sha256(stableJson({
        schema: 'cstar.forge_set_manifest_message.v1',
        instruction: 'SET',
        authority_manifest_sha256: authorityManifestSha256,
        thread_id: args.identity.thread_id,
        turn_id: args.identity.turn_id,
        record_sha256: setRecord.record_sha256,
        record_set_sha256: args.identity.turn_record_set_sha256,
        content: setRecord.content,
    }));
    const referenceSha256 = sha256(stableJson({
        schema: 'cstar.forge_set_manifest_reference.v1',
        authority_manifest_sha256: authorityManifestSha256,
        request_id: args.request.request_id,
        request_sha256: args.request.request_sha256,
        thread_id: args.identity.thread_id,
        turn_id: args.identity.turn_id,
        record_set_sha256: args.identity.turn_record_set_sha256,
    }));
    return {
        authority_manifest_sha256: authorityManifestSha256,
        intent: {
            intent: 'forge_execute',
            action: 'implement',
            normalized_text: 'SET',
            work_reference_text: args.request.bead_id,
            operator_authorization_ref: `cstar-forge-set-manifest:${referenceSha256}`,
            thread_id: args.identity.thread_id,
            turn_id: args.identity.turn_id,
            message_sha256: messageSha256,
            session_record_sha256: setRecord.record_sha256,
            session_record_set_sha256: args.identity.turn_record_set_sha256,
            session_record_count: 1,
            binding_mode: 'ordinary_language',
            authorized_at: authorizedAt,
            expires_at: expiresAt,
        },
    };
}
