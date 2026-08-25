import type {
    HostWorkerWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';

/** Retained only so stale dependency injection cannot reactivate the lane. */
export interface HostWorkerDependencies {
    [key: string]: unknown;
}

/**
 * Fail-closed tombstone for the former host/subagent implementation worker.
 *
 * Codex subagents and host inference may review or analyze, but implementation
 * must use the durable CStar Forge request/execute/validation lifecycle.
 */
export class HostWorkerWeave implements RuntimeAdapter<HostWorkerWeavePayload> {
    public readonly id = 'weave:host-worker';

    public constructor(deps: HostWorkerDependencies = {}) {
        void deps;
    }

    public async execute(
        invocation: WeaveInvocation<HostWorkerWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        void context;
        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: 'Host worker implementation is permanently decommissioned. Use cstar_forge_request -> cstar_forge_execute and independent cstar_record_result validation.',
            metadata: {
                adapter: 'compatibility:host-worker-rejected',
                bead_id: invocation.payload.bead_id,
                delegated: false,
                inference_attempted: false,
                write_attempted: false,
                checker_attempted: false,
            },
        };
    }
}
