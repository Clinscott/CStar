import type {
    RuntimeAdapter,
    RuntimeContext,
    TemporalLearningWeavePayload,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

/** Retired direct Hall-analysis and bead-mutation adapter. */
export class TemporalLearningWeave implements RuntimeAdapter<TemporalLearningWeavePayload> {
    public readonly id = 'weave:temporal-learning';

    public async execute(
        _invocation: WeaveInvocation<TemporalLearningWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-temporal-learning-weave',
            recommendedTool: 'cstar_evolve',
        });
    }
}
