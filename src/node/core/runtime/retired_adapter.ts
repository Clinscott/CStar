import type { WeaveResult } from './contracts.js';

export const RETIRED_AUTONOMOUS_RUNTIME_FAILURE =
    'legacy_autonomous_runtime_adapter_retired_use_cstar_kernel';

export interface RetiredRuntimeResultOptions {
    weaveId: string;
    boundary?: string;
    recommendedTool?: string;
}

/**
 * Return the one typed no-effect result shared by directly constructed legacy
 * runtime adapters. The explicit booleans make every former effect boundary
 * independently auditable without trusting a generic `dry_run` claim.
 */
export function buildRetiredRuntimeResult(
    options: RetiredRuntimeResultOptions,
): WeaveResult {
    return {
        weave_id: options.weaveId,
        status: 'FAILURE',
        output: '',
        error: RETIRED_AUTONOMOUS_RUNTIME_FAILURE,
        metadata: {
            failure_code: RETIRED_AUTONOMOUS_RUNTIME_FAILURE,
            execution_boundary: options.boundary ?? 'retired-autonomous-runtime',
            required_surface: 'cstar-kernel',
            recommended_tool: options.recommendedTool ?? 'cstar_handoff',
            execution_dispatched: false,
            provider_attempted: false,
            process_started: false,
            source_access_started: false,
            filesystem_access_started: false,
            filesystem_mutation_started: false,
            git_action_started: false,
            hall_mutation_started: false,
            state_registry_mutation_started: false,
            callback_started: false,
            timer_started: false,
            listener_started: false,
            network_started: false,
            secret_access_started: false,
        },
    };
}
