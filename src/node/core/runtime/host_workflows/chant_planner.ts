import type {
    ChantWeavePayload,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';

export * from './chant_planner_artifacts.js';

export const CHANT_PLANNER_RETIRED_ERROR =
    'legacy_chant_planner_retired_use_host_native_skill';

/** Retired before research dispatch, host callbacks, Hall, or proposal files. */
export async function runPlanningLoop(
    _dispatchPort: RuntimeDispatchPort,
    _invocation: WeaveInvocation<ChantWeavePayload>,
    _context: RuntimeContext,
    ..._legacyArguments: unknown[]
): Promise<WeaveResult> {
    void _dispatchPort;
    void _invocation;
    void _context;
    void _legacyArguments;
    return {
        weave_id: 'weave:chant',
        status: 'FAILURE',
        output: '',
        error: CHANT_PLANNER_RETIRED_ERROR,
        metadata: {
            compatibility: 'retired',
            execution_dispatched: false,
            provider_attempted: false,
            source_access_started: false,
            filesystem_effect_started: false,
            hall_mutation_started: false,
        },
    };
}
