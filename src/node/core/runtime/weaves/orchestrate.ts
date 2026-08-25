import type {
    OrchestrateWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { retiredWorkflowResult } from '../retired_workflow.js';

export class OrchestrateWeave implements RuntimeAdapter<OrchestrateWeavePayload> {
    public readonly id = 'weave:orchestrate';
    public constructor(...args: unknown[]) { void args; }

    public async execute(
        invocation: WeaveInvocation<OrchestrateWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        void invocation; void context;
        return retiredWorkflowResult(
            this.id,
            'Use CStar lifecycle state and cstar_forge_request/cstar_forge_execute for implementation.',
        );
    }
}
