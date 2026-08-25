import type {
    HostGovernorWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import type { HostTextInvoker } from './host_bridge.js';

/** Retired model-owned governance entrypoint retained only for clear failures. */
export class HostGovernorWeave implements RuntimeAdapter<HostGovernorWeavePayload> {
    public readonly id = 'weave:host-governor';

    public constructor(
        _dispatchPort?: RuntimeDispatchPort,
        _hostTextInvoker?: HostTextInvoker,
    ) {
        void _dispatchPort;
        void _hostTextInvoker;
    }

    public async execute(
        _invocation: WeaveInvocation<HostGovernorWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        void _invocation;
        void _context;
        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: 'legacy_host_governor_retired_use_cstar_kernel',
            metadata: {
                compatibility: 'retired',
                operator_action_required: true,
                required_surface: 'cstar-kernel',
                recommended_tools: ['cstar_handoff', 'cstar_augury', 'cstar_bead'],
                execution_dispatched: false,
                provider_requests_started: 0,
                hall_mutation_started: false,
                automatic_replan_started: false,
                automatic_promotion_started: false,
            },
        };
    }
}
