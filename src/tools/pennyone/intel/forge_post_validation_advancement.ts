import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

import { missionGrantInputFromRecord } from './forge_mission_grant_scope.js';
import { getForgeRequest } from './forge_receipt_controller.js';
import {
    isV2AuguryForgeChild,
    projectForgePostValidationAdvancement,
} from './forge_post_validation_advancement_projection.js';
import {
    assertDispatchAdapterCapability,
    resolveDispatchActionAuthority,
} from '../../cstar-kernel-mcp/tools/dispatch_action_authority.js';
import {
    resolveDispatchSurface,
    verifyDispatchPackageLocks,
} from '../../cstar-kernel-mcp/tools/dispatch_request.js';
import { resolveForgeExecutionAdapterRef } from
    '../../cstar-kernel-mcp/tools/forge_adapters.js';
import {
    authorizePreparedForgeMissionGrant,
    assertPreparedForgeRequestCurrent,
    persistPreparedForgeRequest,
    prepareForgeRequestMaterialization,
    type PreparedForgeRequestMaterialization,
} from './forge_request_materialization.js';
import { stableJson } from '../../cstar-kernel-mcp/tools/forge_request_contract.js';
import { assertLiveForgeRuntimeReady } from
    '../../cstar-kernel-mcp/contracts/runtime.js';

export type ForgePostValidationAdvancementStatus =
    | 'successor_authorized'
    | 'domain_terminal'
    | 'batch_complete'
    | 'not_triggered'
    | 'failed';

export interface ForgePostValidationAdvancementOutcome {
    schema: 'cstar.forge_post_validation_advancement.v1';
    status: ForgePostValidationAdvancementStatus;
    trigger: 'accepted_delivery_finalization' | 'not_triggered';
    validation_retained: true;
    replayed: boolean;
    execution_receipt_id: string;
    validation_id: string;
    receipt_id: string | null;
    current_bead_id: string | null;
    current_plan_order: number | null;
    next_bead_id: string | null;
    next_plan_order: number | null;
    next_lane: string | null;
    next_request_id: string | null;
    next_request_sha256: string | null;
    next_authorization_id: string | null;
    mission_grant_id: string | null;
    error_code: string | null;
    provider_execution: {
        attempted: false;
        attempts_created: 0;
        reservations_created: 0;
        worker_jobs_created: 0;
        live_spend: false;
        live_source_collection: false;
    };
}

export interface ForgePostValidationAdvancementTestHooks {
    after_resolution?: () => void;
    after_request?: () => void;
    after_authorization?: () => void;
}

const SCHEMA = `
    CREATE TABLE IF NOT EXISTS hall_forge_post_validation_advancements (
        advancement_id TEXT PRIMARY KEY,
        execution_receipt_id TEXT NOT NULL UNIQUE,
        validation_id TEXT NOT NULL UNIQUE,
        augury_receipt_id TEXT NOT NULL,
        current_bead_id TEXT NOT NULL,
        current_plan_order INTEGER NOT NULL CHECK(current_plan_order >= 1),
        outcome TEXT NOT NULL CHECK(
            outcome IN ('successor_authorized', 'domain_terminal', 'batch_complete')
        ),
        next_bead_id TEXT,
        next_plan_order INTEGER,
        next_lane TEXT,
        next_request_id TEXT,
        next_request_sha256 TEXT,
        next_authorization_id TEXT,
        mission_grant_id TEXT NOT NULL,
        sterling_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
`;

function tablePresent(db: Database.Database): boolean {
    return db.prepare(`
        SELECT 1 FROM sqlite_master
        WHERE type = 'table' AND name = 'hall_forge_post_validation_advancements'
    `).pluck().get() === 1;
}

function zeroProvider() {
    return {
        attempted: false as const,
        attempts_created: 0 as const,
        reservations_created: 0 as const,
        worker_jobs_created: 0 as const,
        live_spend: false as const,
        live_source_collection: false as const,
    };
}

function mapReceipt(
    row: Record<string, unknown>,
    replayed: boolean,
): ForgePostValidationAdvancementOutcome {
    return {
        schema: 'cstar.forge_post_validation_advancement.v1',
        status: String(row.outcome) as ForgePostValidationAdvancementStatus,
        trigger: 'accepted_delivery_finalization',
        validation_retained: true,
        replayed,
        execution_receipt_id: String(row.execution_receipt_id),
        validation_id: String(row.validation_id),
        receipt_id: String(row.augury_receipt_id),
        current_bead_id: String(row.current_bead_id),
        current_plan_order: Number(row.current_plan_order),
        next_bead_id: row.next_bead_id === null ? null : String(row.next_bead_id),
        next_plan_order: row.next_plan_order === null ? null : Number(row.next_plan_order),
        next_lane: row.next_lane === null ? null : String(row.next_lane),
        next_request_id: row.next_request_id === null ? null : String(row.next_request_id),
        next_request_sha256: row.next_request_sha256 === null
            ? null : String(row.next_request_sha256),
        next_authorization_id: row.next_authorization_id === null
            ? null : String(row.next_authorization_id),
        mission_grant_id: String(row.mission_grant_id),
        error_code: null,
        provider_execution: zeroProvider(),
    };
}

export function readForgePostValidationAdvancement(
    db: Database.Database,
    executionReceiptId: string,
): ForgePostValidationAdvancementOutcome | null {
    if (!tablePresent(db)) return null;
    const row = db.prepare(`
        SELECT * FROM hall_forge_post_validation_advancements
        WHERE execution_receipt_id = ?
    `).get(executionReceiptId) as Record<string, unknown> | undefined;
    return row ? mapReceipt(row, true) : null;
}

export function forgePostValidationNotTriggered(input: {
    execution_receipt_id: string;
    validation_id: string;
    reason: string;
}): ForgePostValidationAdvancementOutcome {
    return {
        schema: 'cstar.forge_post_validation_advancement.v1',
        status: 'not_triggered',
        trigger: 'not_triggered',
        validation_retained: true,
        replayed: false,
        execution_receipt_id: input.execution_receipt_id,
        validation_id: input.validation_id,
        receipt_id: null,
        current_bead_id: null,
        current_plan_order: null,
        next_bead_id: null,
        next_plan_order: null,
        next_lane: null,
        next_request_id: null,
        next_request_sha256: null,
        next_authorization_id: null,
        mission_grant_id: null,
        error_code: input.reason,
        provider_execution: zeroProvider(),
    };
}

export function forgePostValidationFailed(input: {
    execution_receipt_id: string;
    validation_id: string;
    error: unknown;
}): ForgePostValidationAdvancementOutcome {
    return {
        ...forgePostValidationNotTriggered({
            execution_receipt_id: input.execution_receipt_id,
            validation_id: input.validation_id,
            reason: input.error instanceof Error
                ? input.error.message : String(input.error),
        }),
        status: 'failed',
        trigger: 'accepted_delivery_finalization',
    };
}

function scalarCount(db: Database.Database, table: string): number {
    const present = db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).pluck().get(table);
    return present === 1
        ? Number(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get()) : 0;
}

function sideEffects(db: Database.Database) {
    const totals = db.prepare(`
        SELECT COUNT(*) AS attempts,
               COALESCE(SUM(CASE WHEN live_spend = 1 OR known_spend_observed = 1
                    THEN 1 ELSE 0 END), 0) AS spend,
               COALESCE(SUM(CASE WHEN live_source_collection = 1
                    THEN 1 ELSE 0 END), 0) AS sources
        FROM hall_forge_attempts
    `).get() as Record<string, number>;
    return {
        attempts: Number(totals.attempts),
        spend: Number(totals.spend),
        sources: Number(totals.sources),
        reservations: scalarCount(db, 'hall_forge_mission_grant_reservations'),
        jobs: scalarCount(db, 'hall_worker_jobs'),
    };
}

function resolveChild(
    db: Database.Database,
    projection: ReturnType<typeof projectForgePostValidationAdvancement>,
    validationId: string,
    now: number,
): void {
    const original = JSON.parse(projection.current_bead.metadata_json) as Record<string, unknown>;
    const metadata = {
        ...original,
        resolved_by: 'forge-post-validation-advancement',
        sterling_mandate: projection.sterling,
        resolved_validation_id: validationId,
        resolution: {
            ...(original.resolution && typeof original.resolution === 'object'
                && !Array.isArray(original.resolution)
                ? original.resolution as Record<string, unknown> : {}),
            validation_id: validationId,
        },
    };
    const changed = db.prepare(`
        UPDATE hall_beads
        SET status = 'RESOLVED', resolution_note = ?,
            resolved_validation_id = ?, metadata_json = ?, updated_at = ?
        WHERE bead_id = ? AND status = 'IN_PROGRESS'
          AND metadata_json = ? AND resolved_validation_id IS NULL
    `).run(
        `Accepted Forge delivery ${validationId}.`,
        validationId,
        stableJson(metadata),
        now,
        projection.current_bead.bead_id,
        projection.current_bead.metadata_json,
    );
    if (Number(changed.changes) !== 1) {
        throw new Error('forge_advancement_child_resolution_race');
    }
}

async function prepareSuccessor(
    projection: ReturnType<typeof projectForgePostValidationAdvancement>,
    codeRoot: string,
): Promise<PreparedForgeRequestMaterialization | null> {
    if (!projection.request_args) return null;
    assertLiveForgeRuntimeReady();
    const surface = resolveDispatchSurface('forge', projection.request_args, codeRoot);
    if (!surface.found) throw new Error('missing_authorized_dispatch_surface');
    const adapter = resolveForgeExecutionAdapterRef(
        projection.request_args.execution_adapter_ref, codeRoot,
    );
    if (!adapter.selected) throw new Error('missing_authorized_execution_adapter');
    const authority = resolveDispatchActionAuthority(projection.request_args, codeRoot);
    assertDispatchAdapterCapability(
        authority, adapter.selected.write_capability, { require_adapter: true },
    );
    return prepareForgeRequestMaterialization({
        args: projection.request_args,
        code_root: codeRoot,
        decision_id: projection.request_args.decision_id!,
        adapter,
    });
}

function insertReceipt(input: {
    db: Database.Database;
    execution_receipt_id: string;
    validation_id: string;
    projection: ReturnType<typeof projectForgePostValidationAdvancement>;
    request_id: string | null;
    request_sha256: string | null;
    authorization_id: string | null;
    now: number;
}): ForgePostValidationAdvancementOutcome {
    const projection = input.projection;
    const identity = createHash('sha256').update([
        input.execution_receipt_id,
        input.validation_id,
        projection.receipt.receipt_id,
        projection.current_item.bead_id,
    ].join('\n'), 'utf8').digest('hex');
    input.db.prepare(`
        INSERT INTO hall_forge_post_validation_advancements (
            advancement_id, execution_receipt_id, validation_id,
            augury_receipt_id, current_bead_id, current_plan_order, outcome,
            next_bead_id, next_plan_order, next_lane, next_request_id,
            next_request_sha256, next_authorization_id, mission_grant_id,
            sterling_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        `forge-advancement-${identity.slice(0, 32)}`,
        input.execution_receipt_id,
        input.validation_id,
        projection.receipt.receipt_id,
        projection.current_item.bead_id,
        projection.current_item.order + 1,
        projection.outcome,
        projection.next_item?.bead_id ?? null,
        projection.next_item ? projection.next_item.order + 1 : null,
        projection.next_item?.lane ?? null,
        input.request_id,
        input.request_sha256,
        input.authorization_id,
        projection.grant.mission_grant_id,
        stableJson(projection.sterling),
        input.now,
    );
    const row = input.db.prepare(`
        SELECT * FROM hall_forge_post_validation_advancements
        WHERE execution_receipt_id = ?
    `).get(input.execution_receipt_id) as Record<string, unknown>;
    return mapReceipt(row, false);
}

export async function advanceForgePostValidation(input: {
    db: Database.Database;
    control_root: string;
    code_root: string;
    execution_receipt_id: string;
    validation_id: string;
    request_id: string;
    request_sha256: string;
    now?: number;
    test_hooks?: ForgePostValidationAdvancementTestHooks;
}): Promise<ForgePostValidationAdvancementOutcome> {
    const replay = readForgePostValidationAdvancement(
        input.db, input.execution_receipt_id,
    );
    if (replay) return replay;
    const now = input.now ?? Date.now();
    const initialRequest = getForgeRequest(input.db, input.request_id);
    if (!initialRequest || initialRequest.request_sha256 !== input.request_sha256) {
        throw new Error('forge_advancement_request_drift');
    }
    const initial = projectForgePostValidationAdvancement({
        db: input.db, control_root: input.control_root, code_root: input.code_root,
        request: initialRequest, execution_receipt_id: input.execution_receipt_id,
        validation_id: input.validation_id, now,
    });
    const prepared = await prepareSuccessor(initial, input.code_root);
    const operation = input.db.transaction(() => {
        input.db.exec(SCHEMA);
        const raced = readForgePostValidationAdvancement(
            input.db, input.execution_receipt_id,
        );
        if (raced) return raced;
        const request = getForgeRequest(input.db, input.request_id);
        if (!request || request.request_sha256 !== input.request_sha256
            || request.status !== 'SUCCEEDED') {
            throw new Error('forge_advancement_request_drift');
        }
        const projection = projectForgePostValidationAdvancement({
            db: input.db, control_root: input.control_root, code_root: input.code_root,
            request, execution_receipt_id: input.execution_receipt_id,
            validation_id: input.validation_id, now,
        });
        if (projection.outcome !== initial.outcome
            || projection.next_item?.bead_id !== initial.next_item?.bead_id) {
            throw new Error('forge_advancement_frontier_drift');
        }
        const before = sideEffects(input.db);
        resolveChild(input.db, projection, input.validation_id, now);
        input.test_hooks?.after_resolution?.();
        let requestId: string | null = null;
        let requestSha256: string | null = null;
        let authorizationId: string | null = null;
        if (projection.request_args) {
            if (!prepared) throw new Error('forge_advancement_prepared_request_missing');
            assertPreparedForgeRequestCurrent(
                prepared, projection.request_args, input.code_root,
            );
            const locks = verifyDispatchPackageLocks(
                projection.request_args.package_locks, input.code_root,
            );
            if (stableJson(locks) !== stableJson(prepared.package_lock_proofs)) {
                throw new Error('forge_advancement_package_lock_drift');
            }
            const saved = persistPreparedForgeRequest({
                db: input.db,
                control_root: input.control_root,
                code_root: input.code_root,
                prepared,
                requester: {
                    thread_id: projection.grant.root_thread_id,
                    turn_id: projection.grant.set_turn_id,
                    turn_record_set_sha256: projection.grant.set_record_set_sha256,
                },
                now,
            });
            input.test_hooks?.after_request?.();
            const authorization = authorizePreparedForgeMissionGrant({
                db: input.db,
                control_root: input.control_root,
                code_root: input.code_root,
                prepared,
                request: saved.request,
                grant: missionGrantInputFromRecord(projection.grant),
                now,
            }).authorization;
            input.test_hooks?.after_authorization?.();
            requestId = saved.request.request_id;
            requestSha256 = saved.request.request_sha256;
            authorizationId = authorization.authorization_id;
            const current = getForgeRequest(input.db, requestId);
            if (current?.status !== 'AUTHORIZED') {
                throw new Error('forge_advancement_successor_not_authorized');
            }
        }
        if (stableJson(sideEffects(input.db)) !== stableJson(before)) {
            throw new Error('forge_advancement_provider_boundary_violated');
        }
        return insertReceipt({
            db: input.db,
            execution_receipt_id: input.execution_receipt_id,
            validation_id: input.validation_id,
            projection,
            request_id: requestId,
            request_sha256: requestSha256,
            authorization_id: authorizationId,
            now,
        });
    });
    return operation.immediate();
}

export { isV2AuguryForgeChild };
