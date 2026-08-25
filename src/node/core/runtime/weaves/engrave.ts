import type {
    EngraveWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { retiredWorkflowResult } from '../retired_workflow.js';

export class EngraveWeave implements RuntimeAdapter<EngraveWeavePayload> {
    public readonly id = 'weave:engrave';

    public async execute(
        invocation: WeaveInvocation<EngraveWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        void invocation; void context;
        return retiredWorkflowResult(
            this.id,
            'Use evidence-backed cstar_record_result and the cstar-closeout handoff workflow.',
        );
    }
}
