import type {
    RuntimeAdapter,
    RuntimeContext,
    TaliesinForgeWeavePayload as ArtifactForgeWeavePayload,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

/** Retired local artifact-forge process adapter. Use the durable Forge MCP lane. */
export class ArtifactForgeHostWorkflow implements RuntimeAdapter<ArtifactForgeWeavePayload> {
    public readonly id = 'weave:artifact-forge';

    public constructor(..._retiredDependencies: unknown[]) {
        void _retiredDependencies;
    }

    public async execute(
        _invocation: WeaveInvocation<ArtifactForgeWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-artifact-forge-workflow',
            recommendedTool: 'cstar_forge_request',
        });
    }
}

export { ArtifactForgeHostWorkflow as ArtifactForgeWeave };
