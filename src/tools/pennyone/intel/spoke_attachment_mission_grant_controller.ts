import { createHash } from 'node:crypto';

import type { McpRequestContext } from '../../cstar-kernel-mcp/contracts/request_context.js';
import {
    isExplicitAttachmentRevocation,
    readCurrentRootTurnAttachmentRecordSet,
} from '../../cstar-kernel-mcp/tools/spoke_attachment_authority.js';
import { database } from './database.js';
import { registry } from '../pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../types/hall.js';
import {
    AUTOMATIC_MISSION_SCHEMA,
    AUTOMATIC_MISSION_SET_GRANT_SCHEMA,
    type AutomaticMissionRecord,
    type AutomaticMissionSetGrant,
} from '../../../types/automatic_mission.js';
import { verifyAutomaticMissionSetGrant } from './automatic_mission_authority.js';
import { stableAutomaticMissionJson } from './automatic_mission_schema.js';
import { parseAttachmentJsonObject } from './spoke_attachment_json.js';
import { hasAttachmentAuthoritySource, type SpokeAttachmentAuthorityForStore } from './spoke_attachment_store.js';
import type { SpokeAttachmentRootProof } from './spoke_attachment_root_proof.js';

const SHA256 = /^[a-f0-9]{64}$/;
const DISPATCH_STATES = new Set(['queued', 'claimed', 'delivered_unverified']);
const DISPATCH_SCHEMA = 'cstar.mission_dispatch_receipt.v1';

interface PersistedParentRow {
    repo_id?: string;
    request_status: string;
    request_expires_at?: number;
    request_summary_json: string;
    grant_schema?: string;
    grant_sha256?: string;
    grant_json?: string;
    grant_expires_at?: number;
}

interface MissionParentProjection {
    mission_id: string;
    grant_id: string;
    thread_id: string;
    turn_id: string;
    record_sha256: string;
    record_set_sha256: string;
    record_count: number;
    selected_record_index: number;
    grant_expires_at: number;
    dispatch_deadline_at: number;
    dispatch_state: string;
    dispatch_receipt_id: string;
    dispatch_receipt_sha256: string;
    slug: string;
}

export interface DurableMissionAttachmentAuthorityInput {
    mission_id: string;
    grant_id: string;
    slug: string;
    proof: SpokeAttachmentRootProof;
    request_context?: McpRequestContext;
    now: number;
}

export function isCurrentMissionAttachmentRevocation(text: string): boolean {
    return isExplicitAttachmentRevocation(text)
        || /^(?:deny|denied|hold|hold on|put this on hold)[.!?]?$/i.test(text.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

export function canonicalMissionDispatchReceiptSha256(dispatch: Record<string, unknown>): string {
    const { receipt_sha256: _receiptSha256, ...material } = dispatch;
    return sha256(stableAutomaticMissionJson(material));
}

function requiredString(value: unknown, code: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(code);
    return value;
}

function requiredHash(value: unknown, code: string): string {
    if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(code);
    return value;
}

function requiredNumber(value: unknown, code: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(code);
    return value;
}

function requiredIndex(value: unknown, count: number, code: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= count) {
        throw new Error(code);
    }
    return value;
}

function targetList(value: unknown): string[] | null {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) return null;
    return value as string[];
}

function exactlyOneRootTarget(mission: Record<string, unknown>, rootPath: string): void {
    const design = isRecord(mission.design) ? mission.design : undefined;
    const candidates = [
        targetList(mission.targets),
        targetList(mission.target_paths),
        targetList(design?.targets),
    ].filter((entry): entry is string[] => entry !== null);
    if (candidates.length !== 1 || candidates[0]!.length !== 1 || candidates[0]![0] !== rootPath) {
        throw new Error('spoke_attachment_mission_target_not_exact');
    }
}

function exactSlug(
    mission: Record<string, unknown>,
    dispatch: Record<string, unknown>,
    dispatchMission: Record<string, unknown>,
    grant: Record<string, unknown>,
    slug: string,
): void {
    const values = [mission.slug, dispatch.slug, dispatchMission.slug, grant.slug]
        .filter((value) => value !== undefined);
    if (values.length === 0 || values.some((value) => typeof value !== 'string')
        || new Set(values).size !== 1 || values[0] !== slug) {
        throw new Error('spoke_attachment_mission_slug_not_exact');
    }
}

function readDispatch(
    summary: Record<string, unknown>,
    mission: Record<string, unknown>,
): Record<string, unknown> {
    const candidates = [summary.dispatch_receipt, summary.dispatch, mission.dispatch].filter(isRecord);
    if (candidates.length !== 1) throw new Error('spoke_attachment_mission_dispatch_missing');
    const dispatch = candidates[0]!;
    if (dispatch.schema !== DISPATCH_SCHEMA || !DISPATCH_STATES.has(String(dispatch.state))) {
        throw new Error('spoke_attachment_mission_dispatch_incompatible');
    }
    const missionJson = dispatch.mission_json;
    if (typeof missionJson !== 'string' || !SHA256.test(String(dispatch.mission_json_sha256))
        || sha256(missionJson) !== dispatch.mission_json_sha256) {
        throw new Error('spoke_attachment_mission_dispatch_receipt_invalid');
    }
    const receiptSha256 = requiredHash(
        dispatch.receipt_sha256,
        'spoke_attachment_mission_dispatch_receipt_invalid',
    );
    if (dispatch.mission_id !== mission.mission_id
        || typeof dispatch.receipt_id !== 'string' || !dispatch.receipt_id
        || canonicalMissionDispatchReceiptSha256(dispatch) !== receiptSha256) {
        throw new Error('spoke_attachment_mission_dispatch_receipt_invalid');
    }
    return dispatch;
}

function verifyCanonicalMissionGrant(
    mission: Record<string, unknown>,
    grant: Record<string, unknown>,
    now: number,
): void {
    try {
        verifyAutomaticMissionSetGrant(
            mission as unknown as AutomaticMissionRecord,
            grant as unknown as AutomaticMissionSetGrant,
            now,
        );
    } catch (error) {
        const code = error instanceof Error ? error.message : '';
        if (/expired/.test(code)) throw new Error('spoke_attachment_mission_parent_expired');
        if (/revoked|replayed/.test(code)) throw new Error('spoke_attachment_mission_parent_revoked');
        throw new Error('spoke_attachment_mission_parent_incompatible');
    }
}

export function verifyPersistedMissionAttachmentParent(input: {
    row: PersistedParentRow;
    mission_id: string;
    grant_id: string;
    slug: string;
    root_path: string;
    now: number;
}): MissionParentProjection {
    if (new Set(['REVOKED', 'DENIED', 'PAUSED', 'HELD', 'ON_HOLD'])
        .has(input.row.request_status.toUpperCase())) {
        throw new Error('spoke_attachment_mission_parent_revoked');
    }
    if (input.row.request_status !== 'AUTHORIZED') {
        throw new Error('spoke_attachment_mission_parent_incompatible');
    }
    if (input.row.grant_schema !== AUTOMATIC_MISSION_SET_GRANT_SCHEMA
        || !input.row.grant_json || !input.row.grant_sha256
        || sha256(input.row.grant_json) !== input.row.grant_sha256) {
        throw new Error('spoke_attachment_mission_parent_incompatible');
    }
    const grant = parseAttachmentJsonObject(
        input.row.grant_json,
        'spoke_attachment_mission_grant_invalid',
    );
    if (grant.schema !== AUTOMATIC_MISSION_SET_GRANT_SCHEMA
        || grant.grant_id !== input.grant_id || grant.mission_id !== input.mission_id
        || grant.status !== 'BOUND') {
        throw new Error('spoke_attachment_mission_parent_incompatible');
    }
    const grantExpiresAt = requiredNumber(grant.expires_at, 'spoke_attachment_mission_grant_expiry_invalid');
    if (input.row.grant_expires_at !== undefined && input.row.grant_expires_at !== grantExpiresAt) {
        throw new Error('spoke_attachment_mission_parent_incompatible');
    }
    const requestExpiresAt = input.row.request_expires_at ?? Number.POSITIVE_INFINITY;
    if (grantExpiresAt <= input.now || requestExpiresAt <= input.now) {
        throw new Error('spoke_attachment_mission_parent_expired');
    }
    const threadId = requiredString(grant.root_user_thread_id, 'spoke_attachment_mission_thread_invalid');
    const turnId = requiredString(grant.root_user_turn_id, 'spoke_attachment_mission_turn_invalid');
    const recordSha256 = requiredHash(
        grant.root_user_record_sha256,
        'spoke_attachment_mission_record_set_invalid',
    );
    const recordSet = requiredHash(
        grant.root_user_record_set_sha256,
        'spoke_attachment_mission_record_set_invalid',
    );
    const recordCountValue = grant.root_user_record_count;
    if (typeof recordCountValue !== 'number' || !Number.isInteger(recordCountValue) || recordCountValue < 1) {
        throw new Error('spoke_attachment_mission_record_set_invalid');
    }
    const selectedRecordIndex = requiredIndex(
        grant.selected_root_user_record_index,
        recordCountValue,
        'spoke_attachment_mission_record_set_invalid',
    );
    const summary = parseAttachmentJsonObject(
        input.row.request_summary_json,
        'spoke_attachment_mission_json_invalid',
    );
    const mission = isRecord(summary.mission) ? summary.mission : summary;
    if (mission.schema !== AUTOMATIC_MISSION_SCHEMA || mission.mission_id !== input.mission_id) {
        throw new Error('spoke_attachment_mission_json_invalid');
    }
    const dispatch = readDispatch(summary, mission);
    const dispatchMission = parseAttachmentJsonObject(
        String(dispatch.mission_json),
        'spoke_attachment_mission_dispatch_receipt_invalid',
    );
    if (dispatchMission.schema !== AUTOMATIC_MISSION_SCHEMA
        || dispatchMission.mission_id !== input.mission_id
        || stableAutomaticMissionJson(dispatchMission) !== stableAutomaticMissionJson(mission)) {
        throw new Error('spoke_attachment_mission_dispatch_receipt_invalid');
    }
    verifyCanonicalMissionGrant(dispatchMission, grant, input.now);
    exactlyOneRootTarget(dispatchMission, input.root_path);
    const grantTargets = targetList(grant.targets);
    if (!grantTargets || grantTargets.length !== 1 || grantTargets[0] !== input.root_path) {
        throw new Error('spoke_attachment_mission_target_not_exact');
    }
    exactSlug(mission, dispatch, dispatchMission, grant, input.slug);
    const deadline = requiredNumber(dispatch.deadline_at, 'spoke_attachment_mission_deadline_invalid');
    if (deadline <= input.now || dispatch.thread_id !== threadId) {
        throw new Error('spoke_attachment_mission_dispatch_binding_invalid');
    }
    return {
        mission_id: input.mission_id,
        grant_id: input.grant_id,
        thread_id: threadId,
        turn_id: turnId,
        record_sha256: recordSha256,
        record_set_sha256: recordSet,
        record_count: recordCountValue,
        selected_record_index: selectedRecordIndex,
        grant_expires_at: grantExpiresAt,
        dispatch_deadline_at: deadline,
        dispatch_state: String(dispatch.state),
        dispatch_receipt_id: String(dispatch.receipt_id),
        dispatch_receipt_sha256: String(dispatch.receipt_sha256),
        slug: input.slug,
    };
}

function readParentRow(missionId: string, grantId: string): PersistedParentRow {
    const db = database.tryGetReadDb(registry.getRoot());
    if (!db) throw new Error('spoke_attachment_mission_parent_missing');
    try {
        const hubRoot = registry.getRoot();
        const hubRepoId = database.getHallRepository(hubRoot)?.repo_id
            || buildHallRepositoryId(normalizeHallPath(hubRoot));
        const rows = db.prepare(`
            SELECT r.repo_id, r.status AS request_status, r.expires_at AS request_expires_at,
                   r.request_summary_json, a.execution_grant_schema,
                   a.execution_grant_sha256, a.execution_grant_json,
                   a.expires_at AS grant_expires_at
            FROM hall_forge_requests r
            JOIN hall_forge_authorizations a ON a.request_id = r.request_id
            WHERE r.repo_id = ? AND a.execution_grant_json IS NOT NULL
            ORDER BY a.created_at DESC
        `).all(hubRepoId) as Array<Record<string, unknown>>;
        const matches = rows.filter((candidate) => {
            try {
                const grant = typeof candidate.execution_grant_json === 'string'
                    ? parseAttachmentJsonObject(
                        candidate.execution_grant_json,
                        'spoke_attachment_mission_grant_invalid',
                    ) : null;
                return grant?.mission_id === missionId && grant.grant_id === grantId;
            } catch {
                return false;
            }
        });
        if (matches.length !== 1) throw new Error('spoke_attachment_mission_parent_missing');
        const match = matches[0]!;
        return {
            repo_id: String(match.repo_id),
            request_status: String(match.request_status),
            request_expires_at: typeof match.request_expires_at === 'number' ? match.request_expires_at : undefined,
            request_summary_json: String(match.request_summary_json),
            grant_schema: typeof match.execution_grant_schema === 'string' ? match.execution_grant_schema : undefined,
            grant_sha256: typeof match.execution_grant_sha256 === 'string' ? match.execution_grant_sha256 : undefined,
            grant_json: typeof match.execution_grant_json === 'string' ? match.execution_grant_json : undefined,
            grant_expires_at: typeof match.grant_expires_at === 'number' ? match.grant_expires_at : undefined,
        };
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('spoke_attachment_mission_')) throw error;
        throw new Error('spoke_attachment_mission_parent_missing');
    }
}

function assertNoCurrentRevocation(context: McpRequestContext | undefined, threadId: string, now: number): void {
    try {
        const current = readCurrentRootTurnAttachmentRecordSet({ request_context: context, now });
        if (current.thread_id !== threadId) throw new Error('spoke_attachment_mission_thread_mismatch');
        const revoked = current.records.some(({ text }) => isCurrentMissionAttachmentRevocation(text));
        if (revoked) throw new Error('spoke_attachment_mission_authority_revoked');
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('spoke_attachment_mission_')) throw error;
        throw new Error('spoke_attachment_mission_current_thread_unverified');
    }
}

export function resolveDurableMissionAttachmentAuthority(
    input: DurableMissionAttachmentAuthorityInput,
): SpokeAttachmentAuthorityForStore {
    const sourceAuthorityId = `cstar-mission-set-grant:${input.mission_id}:${input.grant_id}`;
    if (hasAttachmentAuthoritySource(sourceAuthorityId)) {
        throw new Error('spoke_attachment_mission_authority_replay');
    }
    const parent = verifyPersistedMissionAttachmentParent({
        row: readParentRow(input.mission_id, input.grant_id),
        mission_id: input.mission_id,
        grant_id: input.grant_id,
        slug: input.slug,
        root_path: input.proof.canonical_root_path,
        now: input.now,
    });
    assertNoCurrentRevocation(input.request_context, parent.thread_id, input.now);
    return {
        kind: 'cstar_mission_set_grant',
        source_authority_id: sourceAuthorityId,
        source_mission_id: parent.mission_id,
        source_authority_receipt_id: parent.dispatch_receipt_id,
        source_authority_receipt_sha256: parent.dispatch_receipt_sha256,
        thread_id: parent.thread_id,
        turn_id: parent.turn_id,
        record_sha256: parent.record_sha256,
        record_set_sha256: parent.record_set_sha256,
        record_count: parent.record_count,
        selected_record_index: parent.selected_record_index,
        child_expires_at: Math.min(parent.grant_expires_at, parent.dispatch_deadline_at),
    };
}
