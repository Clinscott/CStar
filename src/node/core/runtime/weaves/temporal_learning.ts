import type {
    RuntimeAdapter,
    RuntimeContext,
    TemporalLearningWeavePayload,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { retiredWorkflowResult } from '../retired_workflow.js';

export class TemporalLearningWeave implements RuntimeAdapter<TemporalLearningWeavePayload> {
    public readonly id = 'weave:temporal-learning';

    public async execute(
        invocation: WeaveInvocation<TemporalLearningWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        void invocation; void context;
        return retiredWorkflowResult(
            this.id,
            'Use read-only evidence to propose a CStar bead; never seed beads or scores automatically.',
        );
    }
}
