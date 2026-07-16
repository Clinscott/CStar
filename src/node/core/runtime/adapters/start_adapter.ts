import type {
    RuntimeAdapter,
    RuntimeContext,
    StartWeavePayload,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

/** Retired direct wake/resume adapter. Startup is owned by supported host and kernel surfaces. */
export class StartAdapter implements RuntimeAdapter<StartWeavePayload> {
    public readonly id = 'weave:start';

    public constructor(..._retiredDependencies: unknown[]) {
        void _retiredDependencies;
    }

    public async execute(
        _invocation: WeaveInvocation<StartWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-start-adapter',
            recommendedTool: 'cstar_handoff',
        });
    }
}
