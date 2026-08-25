import type {
    EngraveWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

/** Retired filesystem-to-Hall engraving adapter. */
export class EngraveWeave implements RuntimeAdapter<EngraveWeavePayload> {
    public readonly id = 'weave:engrave';

    public async execute(
        _invocation: WeaveInvocation<EngraveWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-engrave-weave',
            recommendedTool: 'cstar_engram_record',
        });
    }
}
