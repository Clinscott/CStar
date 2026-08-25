import type {
    RuntimeAdapter,
    RuntimeContext,
    VigilanceWeavePayload,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { retiredWorkflowResult } from '../retired_workflow.js';

export class VigilanceHostWorkflow implements RuntimeAdapter<VigilanceWeavePayload> {
    public readonly id = 'weave:vigilance';
    public constructor(...args: unknown[]) { void args; }

    public async execute(
        invocation: WeaveInvocation<VigilanceWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        void invocation; void context;
        return retiredWorkflowResult(
            this.id,
            'Use bounded CorvusEye evaluation or explicit cstar_warden scans; never model-supervise mutation.',
        );
    }
}

export { VigilanceHostWorkflow as VigilanceWeave };
