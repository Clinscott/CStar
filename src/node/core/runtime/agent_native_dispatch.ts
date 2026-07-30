import type { HostTextRequest, HostTextResult } from '../../../core/host_intelligence.js';
import type { SkillBead } from '../skills/types.js';
import type { RuntimeContext, WeaveResult } from './contracts.js';

export const RETIRED_AGENT_NATIVE_DISPATCH_FAILURE =
    'legacy_agent_native_dispatch_retired_use_host_skill_surface';

export type AgentNativeDispatchDecision =
    | { handled: false }
    | { handled: true; result: WeaveResult };

type HostTextInvoker = (request: HostTextRequest) => Promise<HostTextResult>;

/**
 * The kernel cannot turn an agent-native skill into a host callback. Direct
 * compatibility invocation is terminal before source discovery or callbacks.
 */
export async function dispatchAgentNativeSkill<T>(
    invocation: SkillBead<T>,
    _workspaceRoot: string,
    _context: RuntimeContext,
    _hostTextInvoker: HostTextInvoker,
): Promise<AgentNativeDispatchDecision> {
    return {
        handled: true,
        result: {
            weave_id: invocation.skill_id,
            status: 'FAILURE',
            output: '',
            error: RETIRED_AGENT_NATIVE_DISPATCH_FAILURE,
            metadata: {
                failure_code: RETIRED_AGENT_NATIVE_DISPATCH_FAILURE,
                execution_boundary: 'host-only-skill',
                operator_action_required: true,
                automatic_recovery_attempted: false,
                execution_dispatched: false,
                hall_mutation_started: false,
                provider_attempted: false,
                process_started: false,
                source_access_started: false,
                host_callback_attempted: false,
            },
        },
    };
}
