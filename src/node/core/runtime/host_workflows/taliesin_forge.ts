import type {
    RuntimeAdapter,
    RuntimeContext,
    TaliesinForgeWeavePayload,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

/** Retired local TALIESIN process adapter. Use the durable Forge MCP lane. */
export class TaliesinForgeHostWorkflow implements RuntimeAdapter<TaliesinForgeWeavePayload> {
    public readonly id = 'weave:taliesin-forge';

    public constructor(..._retiredDependencies: unknown[]) {
        void _retiredDependencies;
    }

    public async execute(
        _invocation: WeaveInvocation<TaliesinForgeWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-taliesin-forge-workflow',
            recommendedTool: 'cstar_forge_request',
        });
    }
}

export { TaliesinForgeHostWorkflow as TaliesinForgeWeave };
