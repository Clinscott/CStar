import type {
    CompressWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { retiredWorkflowResult } from '../retired_workflow.js';

export class DistillWeave implements RuntimeAdapter<CompressWeavePayload> {
    public readonly id = 'weave:distill';
    public constructor(...args: unknown[]) { void args; }

    public async execute(
        invocation: WeaveInvocation<CompressWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        void invocation; void context;
        return retiredWorkflowResult(
            this.id,
            'Prepare a bounded cstar-closeout packet; do not let a model write canonical memory.',
        );
    }
}
