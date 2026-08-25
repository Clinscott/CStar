import { createHash } from 'node:crypto';

import type Database from 'better-sqlite3';

import type { HallForgeRequestRecord } from '../../../types/forge.js';
import {
    createCodexPlatformContextProjection,
    scanFixedCodexSession,
    codexUserRecordHasRootLineage,
} from '../../cstar-kernel-mcp/tools/codex_session_authority_projection.js';
import { classifyCodexSessionRecord } from '../../cstar-kernel-mcp/tools/codex_request_identity.js';
import { findCodexSessionFile, MAX_CODEX_SESSION_FILE_BYTES, resolveCodexSessionsRoot } from '../../cstar-kernel-mcp/tools/codex_session_locator.js';
import type { VerifiedCodexRequestIdentity } from '../../cstar-kernel-mcp/tools/operator_authorization.js';
import { isForgeAuthorityRevocation } from '../../cstar-kernel-mcp/tools/forge_revocation.js';
import { readForgeRequestBeforeMutation } from '../../cstar-kernel-mcp/tools/forge_execute_request_authority.js';
import { buildForgeRequestId, hashCanonicalForgeRequest, hashForgeTargetPaths, stableJson, type CanonicalForgeRequest } from '../../cstar-kernel-mcp/tools/forge_request_contract.js';
import { getForgeRequest } from './forge_receipt_controller.js';
import {
    FORGE_ROOT_REPAIR_BINDING_SCHEMA,
    getForgeRootRepairBinding,
    rederiveForgeRootRepairBinding,
    type ForgeRootRepairBinding,
} from './forge_request_root_repair_binding.js';
import {
    buildGoalResumeV2GoalRef,
    buildGoalResumeV2LivenessEvidenceSha256,
    buildGoalResumeV2OperatorAttestationSha256,
    buildGoalResumeV2OperatorResumeRef,
    buildGoalResumeV2ResumeId,
    GOAL_RESUME_V2_RATIONALE,
    GOAL_RESUME_V2_SCHEMA,
    type CanonicalHostGoalProjection,
    sha256Text,
} from './goal_resume_v2_contract.js';

const HASH = /^[a-f0-9]{64}$/;
const REQUEST_ID = /^dispatch-forge-[a-f0-9]{32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/u;
const VETO_TEXT = /\b(?:fork|forked|subagent|switch|switched|different\s+(?:task|goal)|(?:different|new|another|changed|change(?:d|ing)?)\s+(?:the\s+)?(?:target|scope|request|repair)|(?:target|scope|request|repair)(?:\s+request)?\s+(?:is\s+)?(?:different|new|another|changed)|cross[-\s]?thread|git|commit|push|merge|pull\s+request|install(?:ation)?|deploy(?:ment)?|restart|activat(?:e|ion)|secret(?:s)?|credential(?:s)?|provider|network|spend|production|execute|execution|out\s+of\s+scope|scope\s+expansion|expand(?:ed|ing)?|broaden|widen|additional\s+scope)\b/i;
const MAX_HISTORY = 1_000;

export interface GoalResumeV2Liveness {
    message_sha256: string;
    liveness_evidence_sha256: string;
}

export interface GoalResumeV2Authority {
    request: HallForgeRequestRecord;
    binding: ForgeRootRepairBinding;
    projection: CanonicalHostGoalProjection;
    goal_ref: string;
    resume_id: string;
    operator_resume_ref: string;
    operator_attestation_sha256: string;
    identity: VerifiedCodexRequestIdentity;
    liveness: GoalResumeV2Liveness;
}

export interface ForgeGoalResumeV2AuthorizationProjection {
    schema: 'cstar.forge_goal_resume_authorization_projection.v2';
    action: 'continue';
    requester_lineage_mode: 'explicit_goal_continuation_v2';
    subject: { kind: 'bead'; value: string; repo_id: string };
    scope_authority: {
        kind: 'request_bound_root_repair';
        goal_resume_id: string;
        request_id: string;
        request_sha256: string;
        root_repair_binding_sha256: string;
        root_repair_instruction_sha256: string;
        root_thread_id: string;
        root_turn_id: string;
        root_record_set_sha256: string;
        event_sha256: string;
    };
    continuity_evidence: {
        operator_thread_id: string;
        operator_turn_id: string;
        operator_message_sha256: string;
        operator_record_sha256: string;
        operator_record_set_sha256: string;
        operator_record_count: number;
    };
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: string[]): boolean {
    const actual = Object.keys(value).sort();
    const keys = [...expected].sort();
    return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function requiredHash(value: unknown, name: string): string {
    if (typeof value !== 'string' || !HASH.test(value)) throw new Error(`goal_resume_v2_${name}_invalid`);
    return value;
}

function requiredReference(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0 || value.length > 240
        || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`goal_resume_v2_${name}_invalid`);
    return value;
}

function requiredInteger(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new Error(`goal_resume_v2_${name}_invalid`);
    }
    return value;
}

function parseStoredJson(value: unknown, code: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(String(value ?? '')) as unknown;
        if (!isRecord(parsed)) throw new Error(code);
        return parsed;
    } catch {
        throw new Error(code);
    }
}

function parseCanonicalRequest(request: HallForgeRequestRecord): CanonicalForgeRequest {
    if (!REQUEST_ID.test(request.request_id) || !HASH.test(request.request_sha256)) {
        throw new Error('goal_resume_v2_request_identity_invalid');
    }
    const parsed = parseStoredJson(request.request_summary_json, 'goal_resume_v2_request_summary_invalid');
    if (parsed.schema !== 'cstar.forge_request.v3') throw new Error('goal_resume_v2_requires_v3_request');
    const canonical = parsed as unknown as CanonicalForgeRequest;
    try {
        if (stableJson(canonical) !== request.request_summary_json
            || hashCanonicalForgeRequest(canonical) !== request.request_sha256
            || buildForgeRequestId(request.request_sha256) !== request.request_id
            || hashForgeTargetPaths(canonical) !== request.target_paths_sha256
            || canonical.bead_id !== request.bead_id
            || canonical.decision_id !== request.decision_id
            || canonical.adapter_ref !== (request.adapter_ref ?? null)
            || canonical.write_capability !== request.write_capability) {
            throw new Error('goal_resume_v2_request_integrity_invalid');
        }
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('goal_resume_v2_')) throw error;
        throw new Error('goal_resume_v2_request_integrity_invalid');
    }
    return canonical;
}

function receiptCounts(db: Database.Database, requestId: string): { attempts: number; authorizations: number } {
    const attempts = Number((db.prepare(
        'SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?',
    ).get(requestId) as { count?: number }).count ?? 0);
    const authorizations = Number((db.prepare(
        'SELECT COUNT(*) AS count FROM hall_forge_authorizations WHERE request_id = ?',
    ).get(requestId) as { count?: number }).count ?? 0);
    return { attempts, authorizations };
}

export function assertGoalResumeV2RequestAndBinding(args: {
    db: Database.Database;
    repo_id: string;
    request_id: string;
    request_sha256: string;
    request?: HallForgeRequestRecord;
    require_unspent?: boolean;
}): { request: HallForgeRequestRecord; binding: ForgeRootRepairBinding } {
    const request = args.request ?? getForgeRequest(args.db, args.request_id);
    if (!request) throw new Error('goal_resume_v2_request_not_found');
    parseCanonicalRequest(request);
    if (request.request_id !== args.request_id || request.request_sha256 !== args.request_sha256
        || request.repo_id !== args.repo_id) throw new Error('goal_resume_v2_request_lineage_invalid');
    const binding = getForgeRootRepairBinding(args.db, request.request_id);
    if (!binding || binding.schema !== FORGE_ROOT_REPAIR_BINDING_SCHEMA) {
        throw new Error('goal_resume_v2_root_repair_binding_missing');
    }
    let expected: ForgeRootRepairBinding;
    try { expected = rederiveForgeRootRepairBinding(request, binding.created_at); } catch {
        throw new Error('goal_resume_v2_root_repair_binding_drift');
    }
    if (stableJson(binding) !== stableJson(expected)) {
        throw new Error('goal_resume_v2_root_repair_binding_drift');
    }
    if (args.require_unspent !== false) {
        const counts = receiptCounts(args.db, request.request_id);
        if (request.status !== 'PENDING_AUTH' || counts.attempts !== 0 || counts.authorizations !== 0
            || request.authorization_profile !== 'root_user_forge_intent_v1'
            || request.authorization_binding_sha256 !== undefined
            || request.authorization_challenge_sha256 !== undefined
            || request.operator_authorization_ref !== undefined
            || request.operator_thread_id !== undefined
            || request.operator_turn_id !== undefined
            || request.operator_message_sha256 !== undefined
            || request.operator_record_sha256 !== undefined
            || request.operator_record_set_sha256 !== undefined) {
            throw new Error('goal_resume_v2_requires_unspent_pending_request');
        }
    }
    return { request, binding };
}

function sessionLineageIsCanonical(payload: Record<string, unknown>, threadId: string): boolean {
    return payload.id === threadId
        && (payload.thread_source === undefined || payload.thread_source === 'user')
        && payload.parent_thread_id == null && payload.agent_path == null && payload.forked_from_id == null;
}

export function scanCurrentLiveness(identity: VerifiedCodexRequestIdentity): GoalResumeV2Liveness {
    const sessionFile = findCodexSessionFile(resolveCodexSessionsRoot(), identity.thread_id);
    const records: Array<{ timestamp: string; record_sha256: string }> = [];
    const textParts: string[] = [];
    let canonicalSession = false;
    let noncanonicalSession = false;
    const visitor = (record: { rawLine: string; row: Record<string, unknown> }): void => {
        const payload = isRecord(record.row.payload) ? record.row.payload : undefined;
        if (record.row.type === 'session_meta') {
            if (payload && sessionLineageIsCanonical(payload, identity.thread_id)) canonicalSession = true;
            else noncanonicalSession = true;
            return;
        }
        const classification = classifyCodexSessionRecord(record.row);
        if (classification.kind === 'noncanonical-user-like' && classification.turnId === identity.turn_id) {
            throw new Error('goal_resume_v2_current_turn_noncanonical');
        }
        if (classification.kind !== 'canonical-root-user' || classification.turnId !== identity.turn_id) return;
        if (!payload || !codexUserRecordHasRootLineage(record.row) || !Array.isArray(payload.content)
            || payload.content.length === 0 || payload.content.some((entry) => !isRecord(entry)
                || entry.type !== 'input_text' || typeof entry.text !== 'string')) {
            throw new Error('goal_resume_v2_current_turn_uninspectable');
        }
        const content = payload.content as Array<Record<string, unknown>>;
        const text = content.map((entry) => entry.text as string).join('');
        if (!text.trim() || UNSAFE_TEXT.test(text) || typeof record.row.timestamp !== 'string'
            || !Number.isFinite(Date.parse(record.row.timestamp))) {
            throw new Error('goal_resume_v2_current_turn_uninspectable');
        }
        records.push({ timestamp: record.row.timestamp, record_sha256: sha256(record.rawLine) });
        textParts.push(text);
    };
    const projection = createCodexPlatformContextProjection(visitor);
    scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, projection.consume);
    projection.finish();
    if (!canonicalSession || noncanonicalSession || records.length === 0) {
        throw new Error('goal_resume_v2_current_root_lineage_invalid');
    }
    const terminal = records.at(-1)!;
    const firstMs = Date.parse(records[0]!.timestamp);
    const terminalMs = Date.parse(terminal.timestamp);
    if (records.length !== identity.turn_record_count
        || terminal.record_sha256 !== identity.turn_record_sha256
        || firstMs > terminalMs
        || records.some((record, index) => index > 0
            && Date.parse(record.timestamp) < Date.parse(records[index - 1]!.timestamp))) {
        throw new Error('goal_resume_v2_current_record_set_invalid');
    }
    const recordSetSha256 = sha256(JSON.stringify({
        schema: 'cstar.codex_root_user_turn_record_set.v1',
        thread_id: identity.thread_id,
        turn_id: identity.turn_id,
        records: records.map((record, index) => ({ index, timestamp: record.timestamp, record_sha256: record.record_sha256 })),
    }));
    if (recordSetSha256 !== identity.turn_record_set_sha256) {
        throw new Error('goal_resume_v2_current_record_set_invalid');
    }
    const text = textParts.join('');
    if (isForgeAuthorityRevocation(text) || VETO_TEXT.test(text)) {
        throw new Error('goal_resume_v2_current_liveness_revoked');
    }
    const messageSha256 = sha256Text(text);
    return {
        message_sha256: messageSha256,
        liveness_evidence_sha256: buildGoalResumeV2LivenessEvidenceSha256({
            thread_id: identity.thread_id,
            turn_id: identity.turn_id,
            turn_record_sha256: identity.turn_record_sha256,
            turn_record_set_sha256: identity.turn_record_set_sha256,
            turn_record_count: identity.turn_record_count,
            first_timestamp: identity.turn_first_timestamp,
            timestamp: identity.turn_timestamp,
            message_sha256: messageSha256,
        }),
    };
}

export function prepareGoalResumeV2Authority(args: {
    root: string;
    repo_id: string;
    request_id: string;
    request_sha256: string;
    projection: CanonicalHostGoalProjection;
    identity: VerifiedCodexRequestIdentity;
    now?: number;
}): GoalResumeV2Authority {
    const read = readForgeRequestBeforeMutation(args.root, args.request_id);
    try {
        const checked = assertGoalResumeV2RequestAndBinding({
            db: read.db,
            repo_id: args.repo_id,
            request_id: args.request_id,
            request_sha256: args.request_sha256,
            request: read.request,
        });
        const { request, binding } = checked;
        if (args.identity.thread_id !== binding.root_thread_id
            || args.projection.host_goal_thread_id !== binding.root_thread_id
            || args.identity.turn_id === binding.root_turn_id) {
            throw new Error('goal_resume_v2_root_thread_lineage_invalid');
        }
        const liveness = scanCurrentLiveness(args.identity);
        const operatorResumeRef = buildGoalResumeV2OperatorResumeRef(
            args.identity.thread_id, args.identity.turn_id, args.identity.turn_record_set_sha256,
        );
        const operatorTimestamp = args.identity.turn_timestamp;
        if (!Number.isFinite(Date.parse(operatorTimestamp))) throw new Error('goal_resume_v2_operator_timestamp_invalid');
        const operatorAttestationSha256 = buildGoalResumeV2OperatorAttestationSha256({
            thread_id: args.identity.thread_id,
            turn_id: args.identity.turn_id,
            operator_resume_ref: operatorResumeRef,
            message_sha256: liveness.message_sha256,
            record_sha256: args.identity.turn_record_sha256,
            record_set_sha256: args.identity.turn_record_set_sha256,
            record_count: args.identity.turn_record_count,
            record_first_timestamp: args.identity.turn_first_timestamp,
            operator_timestamp: operatorTimestamp,
            liveness_evidence_sha256: liveness.liveness_evidence_sha256,
        });
        const goalRef = buildGoalResumeV2GoalRef({
            request_id: request.request_id,
            request_sha256: request.request_sha256,
            projection: args.projection,
        });
        const resumeId = buildGoalResumeV2ResumeId({
            request_id: request.request_id,
            request_sha256: request.request_sha256,
            goal_ref: goalRef,
            request_bead_id: request.bead_id,
            decision_id: request.decision_id,
            root_repair_binding_sha256: binding.binding_sha256,
            root_repair_instruction_sha256: binding.repair_instruction_sha256,
            root_thread_id: binding.root_thread_id,
            root_turn_id: binding.root_turn_id,
            root_record_set_sha256: binding.root_record_set_sha256,
            projection: args.projection,
            operator_thread_id: args.identity.thread_id,
            operator_turn_id: args.identity.turn_id,
            operator_record_set_sha256: args.identity.turn_record_set_sha256,
            operator_attestation_sha256: operatorAttestationSha256,
            liveness_evidence_sha256: liveness.liveness_evidence_sha256,
        });
        return {
            request,
            binding,
            projection: args.projection,
            goal_ref: goalRef,
            resume_id: resumeId,
            operator_resume_ref: operatorResumeRef,
            operator_attestation_sha256: operatorAttestationSha256,
            identity: args.identity,
            liveness,
        };
    } finally {
        read.release();
    }
}
