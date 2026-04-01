import type * as hostBridge from '../weaves/host_bridge.js';
import {
    ArchitectServicePayload,
    RuntimeAdapter,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';
import { deps, executeArchitectService } from '../host_workflows/architect_service.js';

/**
 * Compatibility wrapper for legacy direct architect dispatch.
 * Chant planning owns architect synthesis; this adapter preserves older entrypoints.
 */
export class ArchitectCompatibilityAdapter implements RuntimeAdapter<ArchitectServicePayload> {
    public readonly id = 'weave:architect';

    public constructor(
        private readonly dispatchPort: RuntimeDispatchPort,
        private readonly hostTextInvoker: hostBridge.HostTextInvoker = deps.defaultHostTextInvoker,
    ) {}

    public async execute(
        invocation: WeaveInvocation<ArchitectServicePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        return executeArchitectService(invocation.payload, context, this.hostTextInvoker);
    }
}

export { ArchitectCompatibilityAdapter as ArchitectWeave };
