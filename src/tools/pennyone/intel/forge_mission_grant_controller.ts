import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

import type {
    HallForgeAuthorizationRecord,
    HallForgeMissionGrantRecord,
    HallForgeRequestRecord,
    MaterializeForgeMissionGrantInput,
} from '../../../types/forge.js';
import { FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS }
    from '../../../types/forge.js';
import {
    AUTONOMOUS_DISPATCH_POLICY_PROFILE,
    buildForgeOperatorIntentProjection,
    forgeOperatorIntentProjectionJson,
    hashRootUserForgeIntentBinding,
    ROOT_USER_FORGE_INTENT_PROFILE,
} from './forge_authorization_policy.js';
import { assertAutonomousDispatchPolicyCapacity }
    from './forge_autonomous_policy_capacity.js';
import {
    activeForgeAuthorizationMatchesRequest,
    getForgeAuthorizationByRequest,
    getForgeRequest,
} from './forge_receipt_controller.js';
import {
    assertForgeMissionGrantScope,
} from './forge_mission_grant_scope.js';

const SHA256 = /^[a-f0-9]{64}$/;

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function stableValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stableValue(item)]));
    }
    return value;
}

function stableJson(value: unknown): string {
    return JSON.stringify(stableValue(value));
}

function normalizedStrings(values: string[]): string[] {
    return [...new Set(values)].sort();
}

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mapMissionGrant(row: Record<string, unknown>): HallForgeMissionGrantRecord {
    return {
        mission_grant_id: String(row.mission_grant_id),
        repo_id: String(row.repo_id),
        mission_decision_id: String(row.mission_decision_id),
        root_bead_id: String(row.root_bead_id),
        allowed_child_lineage_json: String(row.allowed_child_lineage_json),
        root_thread_id: String(row.root_thread_id),
        set_turn_id: String(row.set_turn_id),
        set_record_sha256: String(row.set_record_sha256),
        set_record_set_sha256: String(row.set_record_set_sha256),
        set_record_count: Number(row.set_record_count),
        design_sha256: String(row.design_sha256),
        allowed_targets_json: String(row.allowed_targets_json),
        allowed_outputs_json: String(row.allowed_outputs_json),
        allowed_actions_json: String(row.allowed_actions_json),
        prohibited_actions_json: String(row.prohibited_actions_json),
        adapter_ref: String(row.adapter_ref),
        write_capability: String(row.write_capability) as HallForgeMissionGrantRecord['write_capability'],
        total_provider_attempt_ceiling: Number(row.total_provider_attempt_ceiling),
        retry_derived_iteration_ceiling: Number(row.retry_derived_iteration_ceiling),
        paid_attempt_ceiling: Number(row.paid_attempt_ceiling),
        authorized_at: Number(row.authorized_at),
        expires_at: Number(row.expires_at),
        status: String(row.status) as HallForgeMissionGrantRecord['status'],
        revocation_state: String(row.revocation_state) as HallForgeMissionGrantRecord['revocation_state'],
        blocked_reason: optionalString(row.blocked_reason),
        revoked_at: optionalNumber(row.revoked_at),
        revocation_reason: optionalString(row.revocation_reason),
        created_at: Number(row.created_at),
        updated_at: Number(row.updated_at),
    };
}

function missionGrantSchemaPresent(db: Database.Database): boolean {
    return db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'hall_forge_mission_grants'",
    ).pluck().get() === 1;
}

export function getForgeMissionGrant(
    db: Database.Database,
    missionGrantId: string,
): HallForgeMissionGrantRecord | null {
    if (!missionGrantSchemaPresent(db)) return null;
    const row = db.prepare(
        'SELECT * FROM hall_forge_mission_grants WHERE mission_grant_id = ?',
    ).get(missionGrantId) as Record<string, unknown> | undefined;
    return row ? mapMissionGrant(row) : null;
}

export function getForgeMissionGrantByRequest(
    db: Database.Database,
    requestId: string,
): HallForgeMissionGrantRecord | null {
    if (!missionGrantSchemaPresent(db)) return null;
    const row = db.prepare(`
        SELECT grant.* FROM hall_forge_mission_grants AS grant
        JOIN hall_forge_mission_grant_requests AS link
          ON link.mission_grant_id = grant.mission_grant_id
        WHERE link.request_id = ?
    `).get(requestId) as Record<string, unknown> | undefined;
    return row ? mapMissionGrant(row) : null;
}

function validateMaterializeInput(input: MaterializeForgeMissionGrantInput, now: number): void {
    const bounded = [
        input.repo_id, input.mission_decision_id, input.root_bead_id,
        input.root_thread_id, input.set_turn_id, input.adapter_ref,
    ];
    const ceilings = [
        input.total_provider_attempt_ceiling,
        input.retry_derived_iteration_ceiling,
        input.paid_attempt_ceiling,
    ];
    const prohibited = new Set(input.prohibited_actions);
    if (bounded.some((value) => !value || value !== value.trim())
        || !SHA256.test(input.set_record_sha256)
        || !SHA256.test(input.set_record_set_sha256)
        || !SHA256.test(input.design_sha256)
        || !Number.isSafeInteger(input.set_record_count) || input.set_record_count < 1
        || ceilings.some((value) => !Number.isSafeInteger(value) || value < 0)
        || input.total_provider_attempt_ceiling < 1
        || input.paid_attempt_ceiling > input.total_provider_attempt_ceiling
        || !Number.isSafeInteger(input.authorized_at)
        || !Number.isSafeInteger(input.expires_at)
        || input.authorized_at > now + 60_000 || input.expires_at <= now
        || input.expires_at <= input.authorized_at
        || input.allowed_child_lineage.length < 1
        || input.allowed_targets.length < 1
        || input.allowed_actions.length < 1
        || FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS.some(
            (action) => !prohibited.has(action),
        )
        || input.allowed_actions.some((action) => prohibited.has(action))) {
        throw new Error('forge_mission_grant_input_invalid');
    }
}

function grantIdentity(input: MaterializeForgeMissionGrantInput): string {
    return sha256(stableJson({
        schema: 'cstar.forge_mission_grant_identity.v1',
        repo_id: input.repo_id,
        mission_decision_id: input.mission_decision_id,
        root_bead_id: input.root_bead_id,
        root_thread_id: input.root_thread_id,
        set_turn_id: input.set_turn_id,
        set_record_sha256: input.set_record_sha256,
        set_record_set_sha256: input.set_record_set_sha256,
        design_sha256: input.design_sha256,
    }));
}

function expectedGrantShape(input: MaterializeForgeMissionGrantInput) {
    return {
        repo_id: input.repo_id,
        mission_decision_id: input.mission_decision_id,
        root_bead_id: input.root_bead_id,
        allowed_child_lineage_json: stableJson(input.allowed_child_lineage),
        root_thread_id: input.root_thread_id,
        set_turn_id: input.set_turn_id,
        set_record_sha256: input.set_record_sha256,
        set_record_set_sha256: input.set_record_set_sha256,
        set_record_count: input.set_record_count,
        design_sha256: input.design_sha256,
        allowed_targets_json: stableJson(normalizedStrings(input.allowed_targets)),
        allowed_outputs_json: stableJson(normalizedStrings(input.allowed_outputs)),
        allowed_actions_json: stableJson(normalizedStrings(input.allowed_actions)),
        prohibited_actions_json: stableJson(normalizedStrings(input.prohibited_actions)),
        adapter_ref: input.adapter_ref,
        write_capability: input.write_capability,
        total_provider_attempt_ceiling: input.total_provider_attempt_ceiling,
        retry_derived_iteration_ceiling: input.retry_derived_iteration_ceiling,
        paid_attempt_ceiling: input.paid_attempt_ceiling,
        authorized_at: input.authorized_at,
        expires_at: input.expires_at,
    };
}

function grantShapeMatches(
    grant: HallForgeMissionGrantRecord,
    input: MaterializeForgeMissionGrantInput,
): boolean {
    const expected = expectedGrantShape(input);
    const immutableKeys = [
        'repo_id', 'mission_decision_id', 'root_bead_id',
        'allowed_child_lineage_json', 'root_thread_id', 'set_turn_id',
        'set_record_sha256', 'set_record_set_sha256', 'set_record_count',
        'design_sha256', 'allowed_targets_json', 'allowed_outputs_json',
        'allowed_actions_json', 'prohibited_actions_json',
        'adapter_ref', 'write_capability',
        'total_provider_attempt_ceiling', 'retry_derived_iteration_ceiling',
        'paid_attempt_ceiling', 'authorized_at', 'expires_at',
    ] as const;
    return immutableKeys.every((key) =>
        grant[key as keyof HallForgeMissionGrantRecord] === expected[key]);
}

export function materializeForgeMissionGrant(
    db: Database.Database,
    input: MaterializeForgeMissionGrantInput,
): { grant: HallForgeMissionGrantRecord; replayed: boolean } {
    const now = input.now ?? Date.now();
    validateMaterializeInput(input, now);
    const missionGrantId = `forge-mission-grant-${grantIdentity(input).slice(0, 32)}`;
    const existing = getForgeMissionGrant(db, missionGrantId);
    if (existing) {
        if (!grantShapeMatches(existing, input)) {
            throw new Error('forge_mission_grant_materialization_conflict');
        }
        return { grant: existing, replayed: true };
    }
    const shape = expectedGrantShape(input);
    db.prepare(`
        INSERT INTO hall_forge_mission_grants (
            mission_grant_id, repo_id, mission_decision_id, root_bead_id,
            allowed_child_lineage_json, root_thread_id, set_turn_id,
            set_record_sha256, set_record_set_sha256, set_record_count,
            design_sha256, allowed_targets_json, allowed_outputs_json,
            allowed_actions_json, prohibited_actions_json, adapter_ref,
            write_capability, total_provider_attempt_ceiling,
            retry_derived_iteration_ceiling, paid_attempt_ceiling,
            authorized_at, expires_at, status, revocation_state, created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            'ACTIVE', 'ACTIVE', ?, ?
        )
    `).run(missionGrantId, ...Object.values(shape), now, now);
    return { grant: getForgeMissionGrant(db, missionGrantId)!, replayed: false };
}

function aggregateProviderAttempts(db: Database.Database, grantId: string): number {
    return Number((db.prepare(`
        SELECT COUNT(*) AS count
        FROM hall_forge_attempts AS attempt
        JOIN hall_forge_mission_grant_requests AS link
          ON link.request_id = attempt.request_id
        WHERE link.mission_grant_id = ?
          AND attempt.attempt_budget_class <> 'mechanical_no_provider'
    `).get(grantId) as { count?: number }).count ?? 0);
}

export function assertForgeMissionGrantActive(
    db: Database.Database,
    grant: HallForgeMissionGrantRecord,
    now = Date.now(),
): void {
    const current = getForgeMissionGrant(db, grant.mission_grant_id);
    if (!current) throw new Error('forge_mission_grant_not_found');
    if (current.revocation_state === 'REVOKED' || current.status === 'REVOKED') {
        throw new Error('forge_mission_grant_revoked');
    }
    if (current.expires_at <= now) {
        db.prepare(`
            UPDATE hall_forge_mission_grants
            SET status = 'EXPIRED', updated_at = ?
            WHERE mission_grant_id = ? AND status = 'ACTIVE'
        `).run(now, current.mission_grant_id);
        throw new Error('forge_mission_grant_expired');
    }
    if (current.status !== 'ACTIVE') {
        throw new Error(`forge_mission_grant_not_active:${current.status}`);
    }
    const attempts = aggregateProviderAttempts(db, current.mission_grant_id);
    if (attempts >= current.total_provider_attempt_ceiling
        || attempts >= current.paid_attempt_ceiling) {
        db.prepare(`
            UPDATE hall_forge_mission_grants
            SET status = 'EXHAUSTED', updated_at = ?
            WHERE mission_grant_id = ? AND status = 'ACTIVE'
        `).run(now, current.mission_grant_id);
        throw new Error('forge_mission_grant_capacity_exhausted');
    }
}

export function assertForgeMissionGrantReservation(
    db: Database.Database,
    request: HallForgeRequestRecord,
    now = Date.now(),
): HallForgeMissionGrantRecord | null {
    const grant = getForgeMissionGrantByRequest(db, request.request_id);
    if (!grant) return null;
    assertForgeMissionGrantActive(db, grant, now);
    assertForgeMissionGrantScope(db, grant, request);
    return grant;
}

export function blockForgeMissionGrantForAmbiguity(
    db: Database.Database,
    requestId: string,
    reason: string,
    now = Date.now(),
): void {
    if (!missionGrantSchemaPresent(db)) return;
    db.prepare(`
        UPDATE hall_forge_mission_grants
        SET status = 'BLOCKED', blocked_reason = ?, updated_at = ?
        WHERE mission_grant_id = (
            SELECT mission_grant_id FROM hall_forge_mission_grant_requests
            WHERE request_id = ?
        ) AND status = 'ACTIVE'
    `).run(reason, now, requestId);
}

export function revokeForgeMissionGrant(
    db: Database.Database,
    grantId: string,
    reason: string,
    now = Date.now(),
): void {
    if (!missionGrantSchemaPresent(db)) return;
    db.prepare(`
        UPDATE hall_forge_mission_grants
        SET status = 'REVOKED', revocation_state = 'REVOKED',
            revoked_at = COALESCE(revoked_at, ?),
            revocation_reason = COALESCE(revocation_reason, ?), updated_at = ?
        WHERE mission_grant_id = ?
          AND revocation_state = 'ACTIVE'
    `).run(now, reason, now, grantId);
}

export function materializeAndAuthorizeForgeMissionGrant(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    grant: MaterializeForgeMissionGrantInput;
    now?: number;
}): {
    grant: HallForgeMissionGrantRecord;
    authorization: HallForgeAuthorizationRecord;
    grant_replayed: boolean;
    authorization_replayed: boolean;
} {
    const now = args.now ?? Date.now();
    const derive = args.db.transaction(() => {
        const request = getForgeRequest(args.db, args.request.request_id);
        if (!request || request.request_sha256 !== args.request.request_sha256) {
            throw new Error('forge_mission_grant_request_drift');
        }
        const existingAuthorization = getForgeAuthorizationByRequest(args.db, request.request_id);
        const linkedGrant = getForgeMissionGrantByRequest(args.db, request.request_id);
        if (existingAuthorization || linkedGrant) {
            if (!existingAuthorization || !linkedGrant
                || !activeForgeAuthorizationMatchesRequest(request, existingAuthorization)) {
                throw new Error('forge_mission_grant_receipt_conflict');
            }
            assertForgeMissionGrantActive(args.db, linkedGrant, now);
            assertForgeMissionGrantScope(args.db, linkedGrant, request);
            return {
                grant: linkedGrant,
                authorization: existingAuthorization,
                grant_replayed: true,
                authorization_replayed: true,
            };
        }
        if (request.status !== 'PENDING_AUTH' || request.active_attempt_id
            || request.authorized_at || request.expires_at) {
            throw new Error('forge_mission_grant_requires_pending_unspent_request');
        }
        const attempts = Number((args.db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_attempts WHERE request_id = ?',
        ).get(request.request_id) as { count?: number }).count ?? 0);
        if (attempts !== 0) throw new Error('forge_mission_grant_requires_pending_unspent_request');
        if (args.grant.authorization_profile === AUTONOMOUS_DISPATCH_POLICY_PROFILE) {
            assertAutonomousDispatchPolicyCapacity({
                db: args.db,
                root_bead_id: args.grant.root_bead_id,
                ceiling: args.grant.policy_provider_attempt_ceiling,
            });
        }
        const materialized = materializeForgeMissionGrant(args.db, { ...args.grant, now });
        assertForgeMissionGrantActive(args.db, materialized.grant, now);
        const canonical = assertForgeMissionGrantScope(args.db, materialized.grant, request);
        const projection = buildForgeOperatorIntentProjection({
            action: 'implement',
            requester_lineage_mode: 'stored_set_manifest',
            kind: 'bead',
            value: request.bead_id,
            repo_id: request.repo_id,
        });
        const authorizationProfile = args.grant.authorization_profile
            ?? ROOT_USER_FORGE_INTENT_PROFILE;
        const operatorMessageSha256 = sha256(stableJson({
            schema: 'cstar.forge_mission_grant_request_authorization.v1',
            mission_grant_id: materialized.grant.mission_grant_id,
            request_id: request.request_id,
            request_sha256: request.request_sha256,
        }));
        const binding = hashRootUserForgeIntentBinding({
            request,
            projection,
            operator_thread_id: materialized.grant.root_thread_id,
            operator_turn_id: materialized.grant.set_turn_id,
            operator_message_sha256: operatorMessageSha256,
            operator_record_sha256: materialized.grant.set_record_sha256,
            operator_record_set_sha256: materialized.grant.set_record_set_sha256,
            operator_record_count: materialized.grant.set_record_count,
        });
        const authorizationId = `forge-auth-${sha256([
            materialized.grant.mission_grant_id,
            request.request_id,
            request.request_sha256,
        ].join('\n')).slice(0, 32)}`;
        const operatorAuthorizationRef = `cstar-forge-mission-grant:${sha256(stableJson({
            mission_grant_id: materialized.grant.mission_grant_id,
            authorization_id: authorizationId,
            request_sha256: request.request_sha256,
        }))}`;
        args.db.prepare(`
            INSERT INTO hall_forge_authorizations (
                authorization_id, request_id, request_sha256, authorization_profile,
                authorization_binding_sha256, challenge_sha256, operator_intent_json,
                operator_authorization_ref, operator_thread_id, operator_turn_id,
                operator_message_sha256, operator_record_sha256,
                operator_record_set_sha256, operator_record_count,
                authorized_at, expires_at, created_at
            ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            authorizationId, request.request_id, request.request_sha256,
            authorizationProfile, binding,
            forgeOperatorIntentProjectionJson(projection), operatorAuthorizationRef,
            materialized.grant.root_thread_id, materialized.grant.set_turn_id,
            operatorMessageSha256, materialized.grant.set_record_sha256,
            materialized.grant.set_record_set_sha256, materialized.grant.set_record_count,
            materialized.grant.authorized_at, materialized.grant.expires_at, now,
        );
        const requestScopeSha256 = sha256(stableJson({
            target_paths: canonical.target_paths,
            required_output_paths: canonical.required_output_paths,
            requested_actions: canonical.requested_actions,
            prohibited_actions: canonical.prohibited_actions,
            adapter_ref: canonical.adapter_ref,
            write_capability: canonical.write_capability,
        }));
        args.db.prepare(`
            INSERT INTO hall_forge_mission_grant_requests (
                mission_grant_id, request_id, authorization_id,
                request_scope_sha256, created_at
            ) VALUES (?, ?, ?, ?, ?)
        `).run(
            materialized.grant.mission_grant_id, request.request_id,
            authorizationId, requestScopeSha256, now,
        );
        const changed = args.db.prepare(`
            UPDATE hall_forge_requests
            SET authorization_profile = ?, authorization_binding_sha256 = ?,
                authorization_challenge_sha256 = NULL,
                operator_authorization_ref = ?, operator_thread_id = ?,
                operator_turn_id = ?, operator_message_sha256 = ?,
                operator_record_sha256 = ?, operator_record_set_sha256 = ?,
                operator_record_count = ?, status = 'AUTHORIZED',
                authorized_at = ?, expires_at = ?, updated_at = ?
            WHERE request_id = ? AND request_sha256 = ? AND status = 'PENDING_AUTH'
              AND active_attempt_id IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM hall_forge_attempts WHERE request_id = ?
              )
        `).run(
            authorizationProfile, binding, operatorAuthorizationRef,
            materialized.grant.root_thread_id, materialized.grant.set_turn_id,
            operatorMessageSha256, materialized.grant.set_record_sha256,
            materialized.grant.set_record_set_sha256, materialized.grant.set_record_count,
            materialized.grant.authorized_at, materialized.grant.expires_at, now,
            request.request_id, request.request_sha256, request.request_id,
        );
        if (Number(changed.changes) !== 1) {
            throw new Error('forge_mission_grant_authorization_race');
        }
        const authorization = getForgeAuthorizationByRequest(args.db, request.request_id);
        if (!authorization) throw new Error('forge_mission_grant_authorization_missing');
        return {
            grant: materialized.grant,
            authorization,
            grant_replayed: materialized.replayed,
            authorization_replayed: false,
        };
    });
    return derive.immediate();
}
