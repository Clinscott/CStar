import type {
    EstateExpansionWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

/** Retired direct spoke-clone/link workflow. */
export class EstateExpansionHostWorkflow implements RuntimeAdapter<EstateExpansionWeavePayload> {
    public readonly id = 'weave:expansion';

    public constructor(..._retiredDependencies: unknown[]) {
        void _retiredDependencies;
    }

    public async execute(
        _invocation: WeaveInvocation<EstateExpansionWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-expansion-host-workflow',
            recommendedTool: 'cstar_spoke',
        });
    }
}

export { EstateExpansionHostWorkflow as EstateExpansionWeave };
