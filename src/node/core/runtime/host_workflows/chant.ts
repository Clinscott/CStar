import type {
    ChantWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

/** Retired direct Chant planner/dispatcher. Host planning uses native skills. */
export class ChantHostWorkflow implements RuntimeAdapter<ChantWeavePayload> {
    public readonly id = 'weave:chant';

    public constructor(..._retiredDependencies: unknown[]) {
        void _retiredDependencies;
    }

    public async execute(
        _invocation: WeaveInvocation<ChantWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-chant-host-workflow',
            recommendedTool: 'cstar_handoff',
        });
    }
}

export { ChantHostWorkflow as ChantWeave };
