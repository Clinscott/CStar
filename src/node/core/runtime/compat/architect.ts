import type {
    ArchitectServicePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

/** Retired direct architect host-callback adapter. */
export class ArchitectCompatibilityAdapter implements RuntimeAdapter<ArchitectServicePayload> {
    public readonly id = 'weave:architect';

    public constructor(..._retiredDependencies: unknown[]) {
        void _retiredDependencies;
    }

    public async execute(
        _invocation: WeaveInvocation<ArchitectServicePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-architect-adapter',
            recommendedTool: 'cstar_handoff',
        });
    }
}

export { ArchitectCompatibilityAdapter as ArchitectWeave };
