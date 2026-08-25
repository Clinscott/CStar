import type {
    RestorationWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

/** Retired direct restoration/evolve/distill composition workflow. */
export class RestorationHostWorkflow implements RuntimeAdapter<RestorationWeavePayload> {
    public readonly id = 'weave:restoration';

    public constructor(..._retiredDependencies: unknown[]) {
        void _retiredDependencies;
    }

    public async execute(
        _invocation: WeaveInvocation<RestorationWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-restoration-host-workflow',
            recommendedTool: 'cstar_handoff',
        });
    }
}

export { RestorationHostWorkflow as RestorationWeave };
