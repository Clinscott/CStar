import type {
    HostWorkerWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';

/**
 * Compatibility-only constructor shape. Historical callers may still inject
 * worker dependencies, but the retired adapter must never consume them.
 */
export interface HostWorkerDependencies {
    [key: string]: unknown;
}

/**
 * Retired implementation adapter.
 *
 * Source implementation belongs to the durable CStar Forge request/execute
 * lane. Keeping this fail-closed tombstone makes direct legacy calls explicit
 * without preserving provider, filesystem, or shell authority.
 */
export class HostWorkerWeave implements RuntimeAdapter<HostWorkerWeavePayload> {
    public readonly id = 'weave:host-worker';

    public constructor(_dependencies: HostWorkerDependencies = {}) {}

    public async execute(
        invocation: WeaveInvocation<HostWorkerWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: 'forge_request_required: legacy HostWorker execution is retired; create a durable cstar_forge_request and obtain explicit execute authority',
            metadata: {
                context_policy: 'project',
                execution_boundary: 'cstar_forge_request',
                execution_dispatched: false,
                provider: null,
                bead_id: invocation.payload.bead_id,
            },
        };
    }
}
