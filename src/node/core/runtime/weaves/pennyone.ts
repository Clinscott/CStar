import type {
    PennyOneWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

/** Retired direct PennyOne database/process/filesystem adapter. */
export class PennyOneAdapter implements RuntimeAdapter<PennyOneWeavePayload> {
    public readonly id = 'weave:pennyone';

    public async execute(
        _invocation: WeaveInvocation<PennyOneWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-pennyone-adapter',
            recommendedTool: 'cstar_pennyone_context',
        });
    }
}
