import type { DispatchRequestArgs } from './dispatch_request.js';
import {
    findDispatchValidationError,
    hasDuplicatePackageLockMismatch,
} from './dispatch_request.js';

export type ForgeExecutionMode = 'no_op' | 'live_authorized';

export interface ForgeExecutionArgs extends DispatchRequestArgs {
    forge_request_receipt_id: string;
    forge_request_decision_id: string;
    forge_request_bead_id?: string;
    execution_mode: ForgeExecutionMode;
    execution_adapter_ref?: string;
    operator_authorization_ref?: string;
    idempotency_key: string;
    retry_of_attempt_id?: string;
    /** Optional only when the v3 request durably binds a project root. */
    project_root?: string;
    validation_ticket?: string;
    validation_ticket_request?: {
        scope_sha256: string;
        expires_at?: number;
        validator_thread_id?: string;
        validator_turn_id?: string;
    };
}

export function findForgeExecutionValidationError(args: ForgeExecutionArgs): string | null {
    const baseError = findDispatchValidationError(args, {
        require_operator_authorization_ref: false,
    });
    if (baseError) return baseError;
    if (!args.forge_request_receipt_id?.trim()) return 'forge_request_receipt_id is required';
    if (!args.forge_request_receipt_id.startsWith('dispatch-forge-')) {
        return 'forge_request_receipt_id must reference a cstar_forge_request receipt';
    }
    if (!args.forge_request_decision_id?.trim()) return 'forge_request_decision_id is required';
    if (args.decision_id?.trim() && args.decision_id.trim() !== args.forge_request_decision_id.trim()) {
        return 'decision_id must match forge_request_decision_id';
    }
    if (args.bead_id?.trim() && args.forge_request_bead_id?.trim()
        && args.bead_id.trim() !== args.forge_request_bead_id.trim()) {
        return 'bead_id must match forge_request_bead_id';
    }
    if (hasDuplicatePackageLockMismatch(args.package_locks)) {
        return 'package_locks contain inconsistent hashes for the same path';
    }
    if (!args.idempotency_key?.trim()) return 'idempotency_key is required';
    if (args.execution_mode === 'live_authorized') {
        if (!args.operator_authorization_ref?.trim()) {
            return 'live Forge execution requires operator_authorization_ref';
        }
        if (args.spend_policy.operator_authorization_ref?.trim()) {
            return 'legacy spend_policy.operator_authorization_ref is forbidden; use the exact outer authorization reference';
        }
    }
    return null;
}
