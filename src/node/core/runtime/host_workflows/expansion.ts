import type {
    EstateExpansionWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { retiredWorkflowResult } from '../retired_workflow.js';

export class EstateExpansionHostWorkflow implements RuntimeAdapter<EstateExpansionWeavePayload> {
    public readonly id = 'weave:expansion';
    public constructor(...args: unknown[]) { void args; }

    public async execute(
        invocation: WeaveInvocation<EstateExpansionWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        void invocation; void context;
        return retiredWorkflowResult(
            this.id,
            'Use an explicitly authorized cstar_spoke link/project lifecycle; no model may onboard a spoke.',
        );
    }
}

export { EstateExpansionHostWorkflow as EstateExpansionWeave };
