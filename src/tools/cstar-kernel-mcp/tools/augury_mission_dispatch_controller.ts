import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

import type {
    AnyAuguryMissionBoundaryInput,
    AnyAuguryMissionReceipt,
    AuguryMissionReplayBinding,
} from '../contracts/augury_mission.js';
import { getWritableDb } from '../../pennyone/intel/database.js';
import { materializeAuguryMissionReceipt } from
    '../../pennyone/intel/augury_mission_receipt_controller.js';
import {
    AutomaticMissionDispatchStore,
    buildAutomaticMissionDispatchRepositoryId,
    type AutomaticMissionDispatchReceipt,
} from '../../pennyone/intel/automatic_mission_dispatch_store.js';
import { getHallMountedSpoke } from '../../pennyone/intel/repository_spokes.js';

function exactRoot(value: string): string {
    if (!path.isAbsolute(value) || path.resolve(value) !== value) {
        throw new Error('augury_mission_repository_identity_invalid');
    }
    let real: string;
    try {
        real = fs.realpathSync.native(value);
    } catch {
        throw new Error('augury_mission_repository_root_uninspectable');
    }
    if (real !== value) throw new Error('augury_mission_repository_root_noncanonical');
    return real;
}

export function resolveAuguryMissionCodeRoot(input: {
    boundary: AnyAuguryMissionBoundaryInput;
    live_code_root: string;
    control_root: string;
}): string {
    const suppliedRoot = exactRoot(input.boundary.repository.root_path);
    const suppliedId = input.boundary.repository.repository_id;
    if (suppliedId !== buildAutomaticMissionDispatchRepositoryId(suppliedRoot)) {
        throw new Error('augury_mission_repository_id_root_mismatch');
    }
    if (input.boundary.scope.domain !== 'spoke') {
        const liveRoot = exactRoot(input.live_code_root);
        if (suppliedRoot !== liveRoot) throw new Error('augury_mission_root_mismatch');
        return liveRoot;
    }
    const spoke = getHallMountedSpoke(input.boundary.scope.subject, input.control_root);
    if (!spoke || spoke.slug !== input.boundary.scope.subject) {
        throw new Error('augury_mission_repository_unknown');
    }
    if (spoke.mount_status !== 'active') {
        throw new Error('augury_mission_repository_inactive');
    }
    const registeredRoot = exactRoot(spoke.root_path);
    const registeredId = buildAutomaticMissionDispatchRepositoryId(registeredRoot);
    if (registeredRoot !== suppliedRoot || registeredId !== suppliedId) {
        throw new Error('augury_mission_repository_id_root_mismatch');
    }
    return registeredRoot;
}

export interface DispatchAuguryMissionBoundaryInput {
    receipt: AnyAuguryMissionReceipt;
    expected_code_root: string;
    expected_control_root: string;
    replay?: AuguryMissionReplayBinding;
    db?: Database.Database;
    now?: number;
}

export interface DispatchAuguryMissionBoundaryResult {
    mission_boundary_receipt: AnyAuguryMissionReceipt;
    mission_boundary_plan: AnyAuguryMissionReceipt['bead_plan'];
    ordered_bead_ids: string[];
    materialization: { replayed: boolean };
    dispatch_intent_receipt: AutomaticMissionDispatchReceipt;
}

/**
 * Private kernel boundary: materialize one verified SET receipt synchronously.
 * It is intentionally not registered as a public MCP tool.
 */
export function dispatchAuguryMissionBoundary(
    input: DispatchAuguryMissionBoundaryInput,
): DispatchAuguryMissionBoundaryResult {
    try {
        const db = input.db ?? getWritableDb(input.expected_control_root);
        return db.transaction(() => {
            const materialized = materializeAuguryMissionReceipt({
                db,
                expected_code_root: input.expected_code_root,
                expected_control_root: input.expected_control_root,
                receipt: input.receipt,
                now: input.now,
                materialization_mode: input.replay ? 'replay' : 'initial',
            });
            const store = new AutomaticMissionDispatchStore({
                db,
                code_root: input.expected_code_root,
                control_root: input.expected_control_root,
            });
            const receipt = store.enqueue({
                source_kind: 'augury',
                mission_id: `mission:cstar:augury:${input.receipt.canonical_payload_sha256.slice(0, 32)}`,
                decision_id: input.receipt.mission_decision_id,
                bead_id: input.receipt.proposed_parent_bead_id,
                idempotency_key: `augury-dispatch:${input.receipt.receipt_id}`,
                repository_id: input.receipt.repository.repository_id,
                root_path: input.receipt.repository.root_path,
                intent_binding: {
                    receipt_id: input.receipt.receipt_id,
                    canonical_payload_sha256: input.receipt.canonical_payload_sha256,
                    set_record_sha256: input.receipt.set_identity.set_record_sha256,
                    scope_id: input.receipt.scope.scope_id,
                    contained_target_paths: input.receipt.contained_target_paths,
                    spend_authority: 'not_granted',
                },
                now: input.now,
            });
            return {
                mission_boundary_receipt: input.receipt,
                mission_boundary_plan: [...input.receipt.bead_plan],
                ordered_bead_ids: materialized.ordered_bead_ids,
                materialization: { replayed: materialized.replayed },
                dispatch_intent_receipt: receipt.receipt,
            };
        }).immediate();
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('augury_mission_')) {
            throw error;
        }
        throw new Error('augury_mission_dispatch_materialization_failed', { cause: error });
    }
}
