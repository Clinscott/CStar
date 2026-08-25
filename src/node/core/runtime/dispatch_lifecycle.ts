import type { HallBeadStatus } from '../../../types/hall.js';
import type {
    RuntimeAuguryContract,
    RuntimeAuguryDesignationSource,
    RuntimeContext,
    WeaveResult,
} from './contracts.ts';
import { mergeRuntimeAuguryMetadata } from './dispatch_augury.js';

export const LEGACY_RUNTIME_LIFECYCLE_ERROR =
    'legacy_runtime_hall_lifecycle_retired_use_cstar_kernel';

export function mapExecutionResultToBeadStatus(result: WeaveResult): HallBeadStatus {
    if (result.status === 'SUCCESS') return 'RESOLVED';
    if (result.status === 'TRANSITIONAL') return 'READY_FOR_REVIEW';
    return 'BLOCKED';
}

function rejectLegacyLifecycleMutation(): never {
    throw new Error(LEGACY_RUNTIME_LIFECYCLE_ERROR);
}

/** @deprecated Lifecycle mutation is owned by cstar-kernel MCP. */
export function upsertMissionBead(_input: Record<string, unknown>): never {
    return rejectLegacyLifecycleMutation();
}

/** @deprecated Lifecycle mutation is owned by cstar-kernel MCP. */
export function upsertExecutionBead(_input: Record<string, unknown>): never {
    return rejectLegacyLifecycleMutation();
}

interface LegacyExecutionBeadInput {
    beadId: string;
    weaveId: string;
    context: RuntimeContext;
    auguryContract: RuntimeAuguryContract | null;
    augurySource: RuntimeAuguryDesignationSource | null;
    [key: string]: unknown;
}

/**
 * Legacy finalizer tombstone.
 *
 * It records nothing and converts every attempted legacy completion into a
 * fail-closed result so callers cannot mistake adapter output for a canonical
 * CStar lifecycle transition.
 */
export function finalizeExecutionResult(
    input: {
        result: WeaveResult;
        executionDispatched: boolean;
        bead: LegacyExecutionBeadInput;
    },
    _recordExecution?: typeof upsertExecutionBead,
): WeaveResult {
    return {
        ...input.result,
        status: 'FAILURE',
        error: input.result.status === 'FAILURE' && input.result.error
            ? input.result.error
            : LEGACY_RUNTIME_LIFECYCLE_ERROR,
        metadata: mergeRuntimeAuguryMetadata({
            metadata: {
                ...(input.result.metadata ?? {}),
                failure_code: LEGACY_RUNTIME_LIFECYCLE_ERROR,
                execution_result_status: input.result.status,
                execution_dispatched: input.executionDispatched,
                hall_mutation_started: false,
                lifecycle_recorded: false,
                lifecycle_authority: 'cstar-kernel-mcp',
            },
            context: input.bead.context,
            weaveId: input.bead.weaveId,
            auguryContract: input.bead.auguryContract,
            augurySource: input.bead.augurySource,
            executionBeadId: input.bead.beadId,
            resultStatus: 'FAILURE',
        }),
    };
}
