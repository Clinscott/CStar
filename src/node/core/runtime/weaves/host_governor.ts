import type {
    HostGovernorWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';

const RETIREMENT_MESSAGE = [
    'Host Governor is decommissioned and cannot plan, promote, replan, execute, or mutate lifecycle state.',
    'Use explicit cstar-kernel lifecycle transitions.',
    'Route implementation through cstar_forge_request -> cstar_forge_execute and research through an authorized Researcher request.',
].join(' ');

/**
 * Fail-closed compatibility record retained so persisted weave identifiers and
 * runtime bootstrap do not silently resolve to a different capability.
 */
export class HostGovernorWeave implements RuntimeAdapter<HostGovernorWeavePayload> {
    public readonly id = 'weave:host-governor';

    public constructor(
        _legacyDispatchPort?: RuntimeDispatchPort,
        _legacyHostInvoker?: unknown,
    ) {}

    public async execute(
        _invocation: WeaveInvocation<HostGovernorWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: RETIREMENT_MESSAGE,
            metadata: {
                capability_status: 'decommissioned',
                execution_attempted: false,
                lifecycle_mutation_attempted: false,
                required_routes: {
                    lifecycle: 'cstar-kernel',
                    implementation: 'cstar_forge_request -> cstar_forge_execute',
                    research: 'authorized Researcher request',
                },
            },
        };
    }
}
