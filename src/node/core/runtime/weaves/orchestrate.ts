import type {
    OrchestrateWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';
import {
    derivePlanningExecutionHints,
    resolveOrchestratePlanningSession,
    selectPlanningSessionBeadIds,
} from './orchestrate_planning.js';
import { resolveExecutionRoute } from './orchestrate_transitions.js';

export {
    derivePlanningExecutionHints,
    resolveExecutionRoute,
    resolveOrchestratePlanningSession,
    selectPlanningSessionBeadIds,
};

/**
 * Retired autonomous orchestration entrypoint.
 *
 * Durable request and lifecycle mutations belong to cstar-kernel. Keeping the
 * class lets old imports fail clearly without restoring a runtime surface.
 */
export class OrchestrateWeave implements RuntimeAdapter<OrchestrateWeavePayload> {
    public readonly id = 'weave:orchestrate';

    public constructor(_dispatchPort?: RuntimeDispatchPort) {
        void _dispatchPort;
    }

    public async execute(
        _invocation: WeaveInvocation<OrchestrateWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        void _invocation;
        void _context;
        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: 'legacy_orchestrate_weave_retired_use_cstar_kernel',
            metadata: {
                compatibility: 'retired',
                operator_action_required: true,
                required_surface: 'cstar-kernel',
                recommended_request_tools: ['cstar_forge_request', 'cstar_researcher_request'],
                execution_dispatched: false,
                provider_requests_started: 0,
                source_execution_started: false,
                checker_execution_started: false,
                git_actions_started: false,
                hall_mutation_started: false,
            },
        };
    }
}
