import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

import type { HallForgeRequestRecord } from '../../../types/forge.js';
import {
    forgeAuthorizationLineageMatchesRequest,
    getForgeAuthorizationByRequest,
    getForgeRequestByDecision,
} from '../../pennyone/intel/forge_receipt_controller.js';
import { readForgeMissionGrantEnvelope }
    from '../../pennyone/intel/forge_mission_grant_envelope.js';
import {
    assertForgeSetManifestRequestIsUniqueAndUnspent,
    assertForgeSetManifestRequestPolicy,
    type ForgeSetManifestAuthorityIdentity,
    type SetManifestAuthorityProjection,
} from './forge_set_manifest_authority.js';
import {
    hashCanonicalForgeRequest,
    hashForgeTargetPaths,
    stableJson,
    type CanonicalForgeRequest,
} from './forge_request_contract.js';
import type { VerifiedCodexRequestIdentity } from './operator_authorization.js';

const SHA256 = /^[a-f0-9]{64}$/;
const ITERATION_KEYS = [
    'source', 'schema', 'parent_bead_id', 'iteration_of', 'order', 'design_sha256',
    'owning_lane', 'max_attempts', 'retry_budget', 'live_source_allowed',
    'fixture_policy', 'predecessor_request_sha256', 'mutation_request_identity',
    'authority_tier', 'archived',
] as const;

interface IterationBead {
    bead_id: string;
    repo_id: string;
    target_ref: string;
    status: string;
    metadata_json: string;
    created_at: number;
    updated_at: number;
}

interface MutationIdentity {
    thread_id: string;
    turn_id: string;
    record_set_sha256: string;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readBead(db: Database.Database, beadId: string, code: string): IterationBead {
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

function parseMetadata(raw: string, code: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!isRecord(parsed)) throw new Error(code);
        return parsed;
    } catch {
        throw new Error(code);
    }
}

function mutationIdentity(value: unknown, code: string): MutationIdentity {
    if (!isRecord(value) || value.source !== 'codex_request_meta'
        || typeof value.thread_id !== 'string' || typeof value.turn_id !== 'string'
        || typeof value.turn_record_set_sha256 !== 'string'
        || !SHA256.test(value.turn_record_set_sha256)) {
        throw new Error(code);
    }
    return {
        thread_id: value.thread_id,
        turn_id: value.turn_id,
        record_set_sha256: value.turn_record_set_sha256,
    };
}

function assertIterationMetadata(value: Record<string, unknown>): void {
    if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...ITERATION_KEYS].sort())
        || value.source !== 'cstar-kernel-mcp'
        || value.schema !== 'cstar.set_manifest_iteration.v1'
        || value.owning_lane !== 'Forge'
        || value.max_attempts !== 1 || value.retry_budget !== 0
        || value.live_source_allowed !== false || value.fixture_policy !== 'synthetic_only'
        || value.authority_tier !== 'reference' || value.archived !== false
        || !Number.isSafeInteger(value.order) || Number(value.order) < 2
        || typeof value.parent_bead_id !== 'string' || !value.parent_bead_id
        || typeof value.iteration_of !== 'string' || !value.iteration_of
        || !SHA256.test(String(value.design_sha256))
        || !SHA256.test(String(value.predecessor_request_sha256))) {
        throw new Error('forge_set_manifest_iteration_metadata_invalid');
    }
    mutationIdentity(
        value.mutation_request_identity,
        'forge_set_manifest_iteration_identity_invalid',
    );
}

function canonicalRequest(
    request: HallForgeRequestRecord,
    code: string,
): CanonicalForgeRequest {
    let parsed: unknown;
    try { parsed = JSON.parse(request.request_summary_json) as unknown; } catch {
        throw new Error(code);
    }
    const canonical = parsed as CanonicalForgeRequest;
    if (!isRecord(parsed) || parsed.schema !== 'cstar.forge_request.v3'
        || hashCanonicalForgeRequest(canonical) !== request.request_sha256
        || hashForgeTargetPaths(canonical) !== request.target_paths_sha256) {
        throw new Error(code);
    }
    return canonical;
}

export function assertForgeSetManifestIterationConstraints(
    previous: HallForgeRequestRecord,
    current: HallForgeRequestRecord,
): void {
    const prior = canonicalRequest(previous, 'forge_set_manifest_iteration_predecessor_invalid');
    const next = canonicalRequest(current, 'forge_set_manifest_iteration_request_invalid');
    const authority = (value: CanonicalForgeRequest) => ({
        ...value,
        bead_id: prior.bead_id,
        decision_id: prior.decision_id,
        adapter_runtime: null,
        hermes_runtime: null,
    });
    if (stableJson(authority(next)) !== stableJson(authority(prior))
        || previous.adapter_ref !== current.adapter_ref
        || previous.write_capability !== current.write_capability
        || previous.target_paths_sha256 !== current.target_paths_sha256) {
        throw new Error('forge_set_manifest_iteration_constraints_widened');
    }
}

function assertIterationChain(args: {
    db: Database.Database;
    parentBeadId: string;
    designSha256: string;
    batchOrder: string[];
    identity: ForgeSetManifestAuthorityIdentity;
    startBeadId: string;
    startOrder: number;
}): IterationBead {
    let beadId = args.startBeadId;
    let order = args.startOrder;
    let immediate: IterationBead | undefined;
    while (order >= 1 && order <= 64) {
        const bead = readBead(
            args.db, beadId, 'forge_set_manifest_iteration_predecessor_not_found',
        );
        immediate ??= bead;
        const metadata = parseMetadata(
            bead.metadata_json, 'forge_set_manifest_iteration_predecessor_metadata_invalid',
        );
        const identity = mutationIdentity(
            metadata.mutation_request_identity,
            'forge_set_manifest_iteration_predecessor_identity_invalid',
        );
        if (metadata.parent_bead_id !== args.parentBeadId
            || metadata.design_sha256 !== args.designSha256
            || metadata.owning_lane !== 'Forge' || metadata.order !== order
            || identity.thread_id !== args.identity.thread_id) {
            throw new Error('forge_set_manifest_iteration_predecessor_lineage_mismatch');
        }
        if (metadata.schema !== 'cstar.set_manifest_iteration.v1') {
            if (order !== args.batchOrder.length || args.batchOrder[order - 1] !== bead.bead_id) {
                throw new Error('forge_set_manifest_iteration_order_gap');
            }
            return immediate;
        }
        assertIterationMetadata(metadata);
        beadId = String(metadata.iteration_of);
        order -= 1;
    }
    throw new Error('forge_set_manifest_iteration_order_gap');
}

export function isForgeSetManifestIterationRequest(
    db: Database.Database,
    request: HallForgeRequestRecord,
): boolean {
    const row = db.prepare(
        'SELECT metadata_json FROM hall_beads WHERE bead_id = ? LIMIT 1',
    ).get(request.bead_id) as { metadata_json?: unknown } | undefined;
    if (typeof row?.metadata_json !== 'string') return false;
    try {
        return parseMetadata(row.metadata_json, 'forge_set_manifest_child_metadata_invalid')
            .schema === 'cstar.set_manifest_iteration.v1';
    } catch {
        return false;
    }
}

export interface VerifiedForgeSetManifestIterationAuthority {
    projection: SetManifestAuthorityProjection;
    predecessor_request_id: string;
    predecessor_attempt_id: string;
    predecessor_validation_id: string;
}

function verifyForgeSetManifestIterationAuthorityCore(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    identity: ForgeSetManifestAuthorityIdentity;
    allowReplay: boolean;
    requirePersistedCurrent: boolean;
}): VerifiedForgeSetManifestIterationAuthority {
    const { db, request, identity, allowReplay, requirePersistedCurrent } = args;
    assertForgeSetManifestRequestPolicy(request, allowReplay);
    if (requirePersistedCurrent) {
        assertForgeSetManifestRequestIsUniqueAndUnspent(
            db, request, identity, allowReplay, true,
        );
    }
    const child = readBead(db, request.bead_id, 'forge_set_manifest_child_not_found');
    const childMetadata = parseMetadata(
        child.metadata_json, 'forge_set_manifest_iteration_metadata_invalid',
    );
    assertIterationMetadata(childMetadata);
    const childIdentity = mutationIdentity(
        childMetadata.mutation_request_identity,
        'forge_set_manifest_iteration_identity_invalid',
    );
    const parentBeadId = String(childMetadata.parent_bead_id);
    const parent = readBead(db, parentBeadId, 'forge_set_manifest_parent_not_found');
    const parentMetadata = parseMetadata(
        parent.metadata_json, 'forge_set_manifest_parent_metadata_invalid',
    );
    const missionEnvelope = readForgeMissionGrantEnvelope(parentMetadata);
    const parentIdentity = mutationIdentity(
        parentMetadata.mutation_request_identity,
        'forge_set_manifest_parent_identity_invalid',
    );
    const batchOrder = Array.isArray(parentMetadata.batch_order)
        ? parentMetadata.batch_order.map(String) : [];
    const order = Number(childMetadata.order);
    const decisionId = String(parentMetadata.decision_id ?? '');
    if (parentMetadata.schema !== 'cstar.set_manifest.v1'
        || parentMetadata.operator_set !== true || parent.status !== 'IN_PROGRESS'
        || child.status !== 'IN_PROGRESS' || batchOrder.length === 0 || batchOrder.length > 64
        || new Set(batchOrder).size !== batchOrder.length
        || parentIdentity.thread_id !== identity.thread_id
        || parentIdentity.turn_id !== identity.turn_id
        || parentIdentity.record_set_sha256 !== identity.turn_record_set_sha256
        || childIdentity.thread_id !== identity.thread_id
        || childIdentity.thread_id !== request.requester_thread_id
        || childIdentity.turn_id !== request.requester_turn_id
        || childIdentity.record_set_sha256 !== request.requester_record_set_sha256
        || childMetadata.design_sha256 !== parentMetadata.design_sha256
        || parent.repo_id !== request.repo_id || child.repo_id !== request.repo_id
        || parent.target_ref !== decisionId || child.target_ref !== `${decisionId}:batch-${order}`
        || request.decision_id !== child.target_ref
        || parent.updated_at > child.created_at || child.updated_at > request.created_at) {
        throw new Error('forge_set_manifest_iteration_lineage_mismatch');
    }
    const previous = assertIterationChain({
        db, parentBeadId, designSha256: String(parentMetadata.design_sha256),
        batchOrder, identity, startBeadId: String(childMetadata.iteration_of),
        startOrder: order - 1,
    });
    const duplicateRows = db.prepare(`
        SELECT bead_id FROM hall_beads
        WHERE repo_id = ? AND json_valid(metadata_json) = 1
          AND json_extract(metadata_json, '$.schema') = 'cstar.set_manifest_iteration.v1'
          AND json_extract(metadata_json, '$.parent_bead_id') = ?
          AND (json_extract(metadata_json, '$.order') = ?
            OR json_extract(metadata_json, '$.iteration_of') = ?)
    `).all(request.repo_id, parentBeadId, order, previous.bead_id) as Array<{ bead_id?: string }>;
    if (duplicateRows.length !== 1 || duplicateRows[0]?.bead_id !== child.bead_id) {
        throw new Error('forge_set_manifest_iteration_candidate_ambiguous');
    }
    const previousRequest = getForgeRequestByDecision(db, previous.bead_id, previous.target_ref);
    if (!previousRequest) {
        throw new Error('forge_set_manifest_iteration_predecessor_request_missing');
    }
    const authorization = getForgeAuthorizationByRequest(db, previousRequest.request_id);
    const attempts = db.prepare(
        'SELECT * FROM hall_forge_attempts WHERE request_id = ? ORDER BY ordinal',
    ).all(previousRequest.request_id) as Array<Record<string, unknown>>;
    const attempt = attempts[0];
    const validation = attempt?.validation_id ? db.prepare(`
        SELECT * FROM hall_validation_runs WHERE validation_id = ?
    `).get(attempt.validation_id) as Record<string, unknown> | undefined : undefined;
    if (previousRequest.status !== 'AMBIGUOUS'
        || previousRequest.active_attempt_id !== attempt?.attempt_id
        || previousRequest.request_sha256 !== childMetadata.predecessor_request_sha256
        || previousRequest.requester_thread_id !== identity.thread_id
        || !authorization || !forgeAuthorizationLineageMatchesRequest(previousRequest, authorization)
        || authorization.operator_thread_id !== identity.thread_id
        || authorization.operator_turn_id !== identity.turn_id
        || !authorization.operator_authorization_ref.startsWith('cstar-forge-set-manifest:')
        || attempts.length !== 1 || attempt?.ordinal !== 1 || attempt.status !== 'UNKNOWN'
        || attempt.retry_of_attempt_id != null || !attempt.completed_at
        || attempt.validation_verdict !== 'INCONCLUSIVE'
        || attempt.validation_authority !== 'verified_v2'
        || !SHA256.test(String(attempt.validation_evidence_sha256 ?? ''))
        || !validation || validation.authority_class !== 'verified_v2'
        || validation.verdict !== 'INCONCLUSIVE' || validation.repo_id !== request.repo_id
        || validation.bead_id !== previous.bead_id
        || validation.evidence_sha256 !== attempt.validation_evidence_sha256
        || Number(validation.created_at) > child.created_at
        || Number(previousRequest.completed_at) > child.created_at) {
        throw new Error('forge_set_manifest_iteration_predecessor_not_authoritative');
    }
    assertForgeSetManifestRequestPolicy(previousRequest, true);
    assertForgeSetManifestIterationConstraints(previousRequest, request);
    const projection: SetManifestAuthorityProjection = {
        schema: 'cstar.forge_set_manifest_authority.v1',
        parent: {
            bead_id: parent.bead_id,
            repo_id: parent.repo_id,
            target_ref: parent.target_ref,
            status: 'IN_PROGRESS',
            metadata_sha256: sha256(parent.metadata_json),
            decision_id: decisionId,
            design_revision: Number(parentMetadata.design_revision),
            design_sha256: String(parentMetadata.design_sha256),
            batch_order: batchOrder,
            mission_grant_envelope: missionEnvelope.envelope,
            mission_grant_envelope_sha256: missionEnvelope.sha256,
        },
        child: {
            bead_id: child.bead_id,
            target_ref: child.target_ref,
            status: 'IN_PROGRESS',
            metadata_sha256: sha256(child.metadata_json),
            parent_bead_id: parentBeadId,
            order,
            design_sha256: String(parentMetadata.design_sha256),
        },
        request: {
            request_id: request.request_id,
            request_sha256: request.request_sha256,
            target_paths_sha256: request.target_paths_sha256,
            bead_id: request.bead_id,
            decision_id: request.decision_id,
            requester_thread_id: request.requester_thread_id!,
            requester_turn_id: request.requester_turn_id!,
            requester_record_set_sha256: request.requester_record_set_sha256!,
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
    return {
        projection,
        predecessor_request_id: previousRequest.request_id,
        predecessor_attempt_id: String(attempt.attempt_id),
        predecessor_validation_id: String(attempt.validation_id),
    };
}

export function verifyForgeSetManifestIterationAuthority(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    identity: ForgeSetManifestAuthorityIdentity;
    allowReplay: boolean;
}): VerifiedForgeSetManifestIterationAuthority {
    return verifyForgeSetManifestIterationAuthorityCore({
        ...args,
        requirePersistedCurrent: true,
    });
}

export function verifyForgeSetManifestIterationCorrectionAuthority(args: {
    db: Database.Database;
    replacement: HallForgeRequestRecord;
}): VerifiedForgeSetManifestIterationAuthority {
    const child = readBead(
        args.db, args.replacement.bead_id, 'forge_set_manifest_child_not_found',
    );
    const childMetadata = parseMetadata(
        child.metadata_json, 'forge_set_manifest_iteration_metadata_invalid',
    );
    assertIterationMetadata(childMetadata);
    const parent = readBead(
        args.db, String(childMetadata.parent_bead_id), 'forge_set_manifest_parent_not_found',
    );
    const parentMetadata = parseMetadata(
        parent.metadata_json, 'forge_set_manifest_parent_metadata_invalid',
    );
    const identity = mutationIdentity(
        parentMetadata.mutation_request_identity,
        'forge_set_manifest_parent_identity_invalid',
    );
    return verifyForgeSetManifestIterationAuthorityCore({
        db: args.db,
        request: args.replacement,
        identity: {
            thread_id: identity.thread_id,
            turn_id: identity.turn_id,
            turn_record_sha256: '0'.repeat(64),
            turn_record_set_sha256: identity.record_set_sha256,
        },
        allowReplay: false,
        requirePersistedCurrent: false,
    });
}

export function resolveForgeSetManifestIterationProjection(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    identity: VerifiedCodexRequestIdentity;
    allowReplay: boolean;
}): SetManifestAuthorityProjection {
    return verifyForgeSetManifestIterationAuthority(args).projection;
}
