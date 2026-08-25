import type {
    RuntimeAdapter,
    RuntimeContext,
    TaliesinForgeWeavePayload as ArtifactForgeWeavePayload,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { retiredWorkflowResult } from '../retired_workflow.js';

export class ArtifactForgeHostWorkflow implements RuntimeAdapter<ArtifactForgeWeavePayload> {
    public readonly id = 'weave:artifact-forge';
    public constructor(...args: unknown[]) { void args; }

    public async execute(
        invocation: WeaveInvocation<ArtifactForgeWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        void invocation; void context;
        return retiredWorkflowResult(
            this.id,
            'Use cstar_forge_request, cstar_forge_execute, and cstar_record_result.',
        );
    }
}

export { ArtifactForgeHostWorkflow as ArtifactForgeWeave };
