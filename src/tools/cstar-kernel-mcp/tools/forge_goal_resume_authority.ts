import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

import type {
    HallForgeAuthorizationRecord,
    HallForgeRequestRecord,
} from '../../../types/forge.js';
import type { HallCoordinationEventRecord } from '../../../types/hall.js';
import {
    buildForgeGoalResumeAuthorizationProjection,
    forgeGoalResumeAuthorizationProjectionJson,
    hashForgeGoalResumeAuthorizationBinding,
    parseForgeGoalResumeAuthorizationProjection,
    type ForgeGoalResumeAuthorizationProjection,
} from '../../pennyone/intel/forge_goal_resume_authorization_policy.js';
import {
    validateStoredGoalResumeEvent,
} from '../../pennyone/intel/goal_resume_controller.js';
import { getForgeAuthorizationByRequest } from '../../pennyone/intel/forge_receipt_controller.js';
import type { VerifiedCodexRequestIdentity } from './operator_authorization.js';
import {
    hashForgeAuthorizationChallenge,
    verifyHistoricalForgeAuthorizationChallenge,
} from './forge_authorization_challenge.js';
import { stableJson } from './forge_request_contract.js';

const GOAL_RESUME_ID = /^goal-resume:[a-f0-9]{64}$/;
const ITERATION_DECISION_SUFFIX = /^-i[1-9][0-9]*-[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const AUTHORIZATION_AGE_MS = 24 * 60 * 60 * 1_000;
const MAX_CLOCK_SKEW_MS = 5_000;

export interface VerifiedForgeGoalResumeAuthority {
    projection: ForgeGoalResumeAuthorizationProjection;
    operator_intent_json: string;
    authorization_binding_sha256: string;
    operator_authorization_ref: string;
    operator_thread_id: string;
    operator_turn_id: string;
    operator_message_sha256: string;
    operator_record_sha256: string;
    operator_record_set_sha256: string;
    operator_record_count: number;
    authorized_at: number;
    expires_at: number;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function parseJsonRecord(value: unknown, code: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(String(value ?? '')) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(code);
        return parsed as Record<string, unknown>;
    } catch { throw new Error(code); }
}

function readGoalResumeEvent(db: Database.Database, goalResumeId: string): HallCoordinationEventRecord {
    const row = db.prepare(`
        SELECT event_id, repo_id, thread_id, scope_kind, scope_ref, event_kind,
               from_agent_id, to_agent_id, session_id, trace_id, bead_id, target_path,
               rationale, summary, payload_json, metadata_json, created_at, updated_at
        FROM hall_coordination_events WHERE event_id = ? LIMIT 1
    `).get(goalResumeId) as Record<string, unknown> | undefined;
    if (!row) throw new Error('forge_goal_resume_event_not_found');
    return {
        event_id: String(row.event_id),
        repo_id: String(row.repo_id),
        thread_id: String(row.thread_id),
        scope_kind: String(row.scope_kind) as HallCoordinationEventRecord['scope_kind'],
        scope_ref: String(row.scope_ref),
        event_kind: String(row.event_kind) as HallCoordinationEventRecord['event_kind'],
        from_agent_id: String(row.from_agent_id),
        to_agent_id: row.to_agent_id ? String(row.to_agent_id) : undefined,
        session_id: row.session_id ? String(row.session_id) : undefined,
        trace_id: row.trace_id ? String(row.trace_id) : undefined,
        bead_id: row.bead_id ? String(row.bead_id) : undefined,
        target_path: row.target_path ? String(row.target_path) : undefined,
        rationale: String(row.rationale),
        summary: String(row.summary),
        payload: parseJsonRecord(row.payload_json, 'forge_goal_resume_event_payload_invalid'),
        metadata: parseJsonRecord(row.metadata_json, 'forge_goal_resume_event_metadata_invalid'),
        created_at: Number(row.created_at),
        updated_at: Number(row.updated_at),
    };
}

function hashCurrentRouterIdentity(identity: VerifiedCodexRequestIdentity): string {
    return sha256(stableJson({
        schema: 'cstar.goal_resume_router_identity.v1',
        thread_id: identity.thread_id,
        turn_id: identity.turn_id,
        record_sha256: identity.turn_record_sha256,
        record_set_sha256: identity.turn_record_set_sha256,
        record_count: identity.turn_record_count,
    }));
}

export function forgeGoalResumeDecisionMatches(
    missionDecisionId: unknown,
    requestDecisionId: string,
): boolean {
    if (typeof missionDecisionId !== 'string' || !missionDecisionId) return false;
    if (missionDecisionId === requestDecisionId) return true;
    if (!requestDecisionId.startsWith(missionDecisionId)) return false;
    return ITERATION_DECISION_SUFFIX.test(requestDecisionId.slice(missionDecisionId.length));
}

export function forgeGoalResumeEventTimeMatches(
    eventCreatedAt: number,
    callerTurnAt: number,
    now = Date.now(),
): boolean {
    return Number.isSafeInteger(eventCreatedAt)
        && Number.isSafeInteger(callerTurnAt)
        && Number.isSafeInteger(now)
        && eventCreatedAt <= now + MAX_CLOCK_SKEW_MS
        && eventCreatedAt >= callerTurnAt - AUTHORIZATION_AGE_MS;
}

function assertStoredEventMatchesCurrentRequest(
    event: HallCoordinationEventRecord,
    request: HallForgeRequestRecord,
    identity: VerifiedCodexRequestIdentity,
): { eventSha256: string; operatorAttestationSha256: string; authorizedAt: number } {
    validateStoredGoalResumeEvent(event, request.repo_id, event.scope_ref);
    const payload = event.payload ?? {};
    const operatorAttestationSha256 = String(payload.operator_attestation_sha256 ?? '');
    const authorizedAt = Date.parse(identity.turn_timestamp);
    if (!Number.isSafeInteger(authorizedAt)
        || !Number.isSafeInteger(identity.turn_record_count)
        || identity.turn_record_count < 1
        || request.requester_thread_id !== identity.thread_id
        || event.thread_id !== identity.thread_id
        || payload.continued_bead_id !== request.bead_id
        || !forgeGoalResumeDecisionMatches(payload.decision_id, request.decision_id)
        || !/^[a-f0-9]{64}$/.test(operatorAttestationSha256)
        || !forgeGoalResumeEventTimeMatches(event.created_at, authorizedAt)) {
        throw new Error('forge_goal_resume_event_request_mismatch');
    }
    return {
        eventSha256: sha256(stableJson(event)),
        operatorAttestationSha256,
        authorizedAt,
    };
}

function receiptCounts(db: Database.Database, requestId: string): {
    attempts: number;
    authorizations: number;
} {
    const attempts = Number((db.prepare(
        'SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?',
    ).get(requestId) as { count?: number }).count ?? 0);
    const authorizations = Number((db.prepare(
        'SELECT COUNT(*) AS count FROM hall_forge_authorizations WHERE request_id = ?',
    ).get(requestId) as { count?: number }).count ?? 0);
    return { attempts, authorizations };
}

function assertPendingOrExactReplay(
    db: Database.Database,
    request: HallForgeRequestRecord,
    goalResumeId: string,
    expectedChallengeSha256: string,
): HallForgeAuthorizationRecord | null {
    const counts = receiptCounts(db, request.request_id);
    const existing = getForgeAuthorizationByRequest(db, request.request_id);
    if (!existing) {
        if (request.status !== 'PENDING_AUTH' || counts.attempts !== 0 || counts.authorizations !== 0
            || request.authorization_profile !== 'exact_request_challenge_v1'
            || request.authorization_challenge_sha256 !== expectedChallengeSha256
            || request.authorization_binding_sha256 !== expectedChallengeSha256) {
            throw new Error('forge_goal_resume_requires_exact_unspent_pending_request');
        }
        return null;
    }
    const projection = parseForgeGoalResumeAuthorizationProjection(existing.operator_intent_json);
    if (request.status !== 'AUTHORIZED' || counts.authorizations !== 1
        || projection.continuity_evidence.goal_resume_id !== goalResumeId) {
        throw new Error('forge_goal_resume_existing_authorization_conflict');
    }
    return existing;
}

export function revalidateForgeGoalResumeAuthority({
    db,
    request,
    goalResumeId,
    identity,
    projection,
}: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    goalResumeId: string;
    identity: VerifiedCodexRequestIdentity;
    projection: ForgeGoalResumeAuthorizationProjection;
}): void {
    const event = readGoalResumeEvent(db, goalResumeId);
    const current = assertStoredEventMatchesCurrentRequest(event, request, identity);
    const expectedChallenge = hashForgeAuthorizationChallenge(request.request_id, request.request_sha256);
    const existing = assertPendingOrExactReplay(
        db, request, goalResumeId, expectedChallenge,
    );
    if (projection.continuity_evidence.event_sha256 !== current.eventSha256
        || projection.continuity_evidence.operator_attestation_sha256
            !== current.operatorAttestationSha256
        || projection.scope_authority.challenge_sha256 !== expectedChallenge
        || (existing && existing.operator_intent_json
            !== forgeGoalResumeAuthorizationProjectionJson(projection))) {
        throw new Error('forge_goal_resume_authority_drift');
    }
}

export async function verifyForgeGoalResumeAuthority({
    db,
    request,
    goalResumeId,
    identity,
}: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    goalResumeId: string;
    identity: VerifiedCodexRequestIdentity;
}): Promise<VerifiedForgeGoalResumeAuthority> {
    if (!GOAL_RESUME_ID.test(goalResumeId)) throw new Error('forge_goal_resume_id_invalid');
    let parsed: unknown;
    try { parsed = JSON.parse(request.request_summary_json); } catch {
        throw new Error('forge_request_summary_invalid');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
        || (parsed as Record<string, unknown>).schema !== 'cstar.forge_request.v3') {
        throw new Error('forge_goal_resume_requires_v3_request');
    }
    const event = readGoalResumeEvent(db, goalResumeId);
    const current = assertStoredEventMatchesCurrentRequest(event, request, identity);
    const expectedChallenge = hashForgeAuthorizationChallenge(request.request_id, request.request_sha256);
    assertPendingOrExactReplay(db, request, goalResumeId, expectedChallenge);
    const historical = await verifyHistoricalForgeAuthorizationChallenge({
        threadId: identity.thread_id,
        currentIdentity: identity,
        requestId: request.request_id,
        requestSha256: request.request_sha256,
    });
    const projection = buildForgeGoalResumeAuthorizationProjection({
        request,
        historical,
        goal_resume_id: goalResumeId,
        event_sha256: current.eventSha256,
        operator_attestation_sha256: current.operatorAttestationSha256,
        current_thread_id: identity.thread_id,
        current_turn_id: identity.turn_id,
        current_record_set_sha256: identity.turn_record_set_sha256,
        challenge_sha256: expectedChallenge,
    });
    const operatorIntentJson = forgeGoalResumeAuthorizationProjectionJson(projection);
    const binding = hashForgeGoalResumeAuthorizationBinding({
        request,
        projection,
        operator_thread_id: identity.thread_id,
        operator_turn_id: identity.turn_id,
        operator_message_sha256: hashCurrentRouterIdentity(identity),
        operator_record_sha256: identity.turn_record_sha256,
        operator_record_set_sha256: identity.turn_record_set_sha256,
        operator_record_count: identity.turn_record_count,
    });
    return {
        projection,
        operator_intent_json: operatorIntentJson,
        authorization_binding_sha256: binding,
        operator_authorization_ref: `cstar-forge-goal-resume:${sha256(`${goalResumeId}\n${binding}`)}`,
        operator_thread_id: identity.thread_id,
        operator_turn_id: identity.turn_id,
        operator_message_sha256: hashCurrentRouterIdentity(identity),
        operator_record_sha256: identity.turn_record_sha256,
        operator_record_set_sha256: identity.turn_record_set_sha256,
        operator_record_count: identity.turn_record_count,
        authorized_at: current.authorizedAt,
        expires_at: current.authorizedAt + AUTHORIZATION_AGE_MS,
    };
}
