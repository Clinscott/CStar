import type {
    CompressWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

/** Retired provider/Hall episodic-memory adapter. */
export class DistillWeave implements RuntimeAdapter<CompressWeavePayload> {
    public readonly id = 'weave:distill';

    public constructor(..._retiredDependencies: unknown[]) {
        void _retiredDependencies;
    }

    public async execute(
        _invocation: WeaveInvocation<CompressWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-distill-weave',
            recommendedTool: 'cstar_engram_record',
        });
    }
}
