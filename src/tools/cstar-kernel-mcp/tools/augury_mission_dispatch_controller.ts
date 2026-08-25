import type Database from 'better-sqlite3';

import type {
    AuguryMissionReceipt,
    AuguryMissionReplayBinding,
} from '../contracts/augury_mission.js';
import { getWritableDb } from '../../pennyone/intel/database.js';
import { materializeAuguryMissionReceipt } from
    '../../pennyone/intel/augury_mission_receipt_controller.js';

export interface DispatchAuguryMissionBoundaryInput {
    receipt: AuguryMissionReceipt;
    expected_code_root: string;
    expected_control_root: string;
    replay?: AuguryMissionReplayBinding;
    db?: Database.Database;
    now?: number;
}

export interface DispatchAuguryMissionBoundaryResult {
    mission_boundary_receipt: AuguryMissionReceipt;
    mission_boundary_plan: AuguryMissionReceipt['bead_plan'];
    ordered_bead_ids: string[];
    materialization: { replayed: boolean };
}

/**
 * Private kernel boundary: materialize one verified SET receipt synchronously.
 * It is intentionally not registered as a public MCP tool.
 */
export function dispatchAuguryMissionBoundary(
    input: DispatchAuguryMissionBoundaryInput,
): DispatchAuguryMissionBoundaryResult {
    try {
        const materialized = materializeAuguryMissionReceipt({
            db: input.db ?? getWritableDb(input.expected_control_root),
            expected_code_root: input.expected_code_root,
            expected_control_root: input.expected_control_root,
            receipt: input.receipt,
            now: input.now,
            materialization_mode: input.replay ? 'replay' : 'initial',
        });
        return {
            mission_boundary_receipt: input.receipt,
            mission_boundary_plan: [...input.receipt.bead_plan],
            ordered_bead_ids: materialized.ordered_bead_ids,
            materialization: { replayed: materialized.replayed },
        };
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('augury_mission_')) {
            throw error;
        }
        throw new Error('augury_mission_dispatch_materialization_failed', { cause: error });
    }
}
