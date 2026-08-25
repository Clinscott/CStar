import type {
    EvolveWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

/** Retired subprocess/critique evolution adapter. */
export class EvolveWeave implements RuntimeAdapter<EvolveWeavePayload> {
    public readonly id = 'weave:evolve';

    public constructor(..._retiredDependencies: unknown[]) {
        void _retiredDependencies;
    }

    public async execute(
        _invocation: WeaveInvocation<EvolveWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-evolve-weave',
            recommendedTool: 'cstar_evolve',
        });
    }
}
