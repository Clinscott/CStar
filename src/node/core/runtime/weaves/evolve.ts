import type {
    EvolveWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { retiredWorkflowResult } from '../retired_workflow.js';

export class EvolveWeave implements RuntimeAdapter<EvolveWeavePayload> {
    public readonly id = 'weave:evolve';
    public constructor(...args: unknown[]) { void args; }

    public async execute(
        invocation: WeaveInvocation<EvolveWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        void invocation; void context;
        return retiredWorkflowResult(
            this.id,
            'Submit the bounded change through cstar_forge_request and validate it independently.',
        );
    }
}
