export const RETIRED_BLACKBOARD_COMPACTION_FAILURE =
    'legacy_blackboard_compaction_retired_use_cstar_kernel';

/** Import-compatible dependency seam with no runtime capability. */
export const blackboardManagerDeps = {
    stateRegistry: null,
    registry: null,
    requestHostText: async (): Promise<never> => {
        throw new Error(RETIRED_BLACKBOARD_COMPACTION_FAILURE);
    },
};

export interface BlackboardCompactionRequest {
    trigger: 'operator';
    source: 'tui';
}

export type BlackboardCompactionResult =
    | { status: 'COMPACTED'; compactedEntries: number }
    | { status: 'SKIPPED'; reason: 'below_threshold' }
    | { status: 'REJECTED'; reason: 'explicit_operator_request_required' }
    | { status: 'FAILED'; error: string };

/** Compaction compatibility returns a stable failure before state or provider access. */
export class BlackboardManager {
    public static async compact(
        _request: BlackboardCompactionRequest,
    ): Promise<BlackboardCompactionResult> {
        return {
            status: 'FAILED',
            error: RETIRED_BLACKBOARD_COMPACTION_FAILURE,
        };
    }
}
