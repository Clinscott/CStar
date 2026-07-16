import type {
    RuntimeAdapter,
    RuntimeContext,
    VigilanceWeavePayload,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

/** Retired direct Ravens/Warden composition workflow. */
export class VigilanceHostWorkflow implements RuntimeAdapter<VigilanceWeavePayload> {
    public readonly id = 'weave:vigilance';

    public constructor(..._retiredDependencies: unknown[]) {
        void _retiredDependencies;
    }

    public async execute(
        _invocation: WeaveInvocation<VigilanceWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-vigilance-host-workflow',
            recommendedTool: 'cstar_warden',
        });
    }
}

export { VigilanceHostWorkflow as VigilanceWeave };
