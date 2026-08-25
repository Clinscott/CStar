import type {
    RuntimeAdapter,
    RuntimeContext,
    WardenWeavePayload,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

/** Retired direct Warden model/callback/scanner adapter. */
export class WardenWeave implements RuntimeAdapter<WardenWeavePayload> {
    public readonly id = 'weave:warden';

    public constructor(..._retiredDependencies: unknown[]) {
        void _retiredDependencies;
    }

    public async execute(
        _invocation: WeaveInvocation<WardenWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-warden-weave',
            recommendedTool: 'cstar_warden',
        });
    }
}
