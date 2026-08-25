import type {
    RuntimeAdapter,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';

export interface EstateRitualPayload {
    include_spokes?: boolean;
    auto_execute?: boolean;
}

/**
 * Fail-closed compatibility tombstone.
 *
 * The former ritual pulled CStar and every spoke, invoked ingestion, and
 * auto-resumed the host governor. Those actions require separate operator and
 * lifecycle gates and cannot be bundled behind a daily ritual.
 */
export class EstateRitualWeave implements RuntimeAdapter<EstateRitualPayload> {
    public readonly id = 'weave:estate-ritual';

    public constructor(private readonly dispatchPort: RuntimeDispatchPort) {}

    public async execute(
        invocation: WeaveInvocation<EstateRitualPayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        void this.dispatchPort;
        void invocation;
        void context;
        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: 'Estate ritual is permanently decommissioned: git updates, ingestion, and execution must use separate authorized CStar lanes.',
            metadata: {
                adapter: 'compatibility:estate-ritual-rejected',
                execution_attempted: false,
                git_update_attempted: false,
                ingestion_attempted: false,
            },
        };
    }
}
