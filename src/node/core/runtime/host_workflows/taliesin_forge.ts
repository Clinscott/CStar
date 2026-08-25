import type {
    RuntimeAdapter,
    RuntimeContext,
    TaliesinForgeWeavePayload,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { retiredWorkflowResult } from '../retired_workflow.js';

export class TaliesinForgeHostWorkflow implements RuntimeAdapter<TaliesinForgeWeavePayload> {
    public readonly id = 'weave:taliesin-forge';
    public constructor(...args: unknown[]) { void args; }

    public async execute(
        invocation: WeaveInvocation<TaliesinForgeWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        void invocation; void context;
        return retiredWorkflowResult(
            this.id,
            'Use cstar_forge_request, cstar_forge_execute, and cstar_record_result.',
        );
    }
}

export { TaliesinForgeHostWorkflow as TaliesinForgeWeave };
