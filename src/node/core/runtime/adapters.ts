import {
    RETIRED_DYNAMIC_COMMAND_FAILURE,
    retiredDynamicCommandMetadata,
} from './adapters/legacy_commands.js';
import type {
    DynamicCommandPayload,
    RavensWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from './contracts.js';
import { buildRetiredRuntimeResult } from './retired_adapter.js';

export { StartAdapter } from './adapters/start_adapter.js';
export { PennyOneAdapter } from './weaves/pennyone.js';
export {
    RestorationHostWorkflow,
    RestorationHostWorkflow as RestorationWeave,
} from './host_workflows/restoration.js';
export {
    EstateExpansionHostWorkflow,
    EstateExpansionHostWorkflow as EstateExpansionWeave,
} from './host_workflows/expansion.js';
export {
    VigilanceHostWorkflow,
    VigilanceHostWorkflow as VigilanceWeave,
} from './host_workflows/vigilance.js';

/** Retired direct Ravens estate sweep/cycle adapter. */
export class RavensAdapter implements RuntimeAdapter<RavensWeavePayload> {
    public readonly id = 'weave:ravens';

    public constructor(..._retiredDependencies: unknown[]) {
        void _retiredDependencies;
    }

    public async execute(
        _invocation: WeaveInvocation<RavensWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-ravens-adapter',
            recommendedTool: 'cstar_warden',
        });
    }
}

/** Retired filesystem-discovered command adapter. */
export class DynamicCommandAdapter implements RuntimeAdapter<DynamicCommandPayload> {
    public readonly id = 'weave:dynamic-command';

    public async execute(
        _invocation: WeaveInvocation<DynamicCommandPayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: RETIRED_DYNAMIC_COMMAND_FAILURE,
            metadata: retiredDynamicCommandMetadata(),
        };
    }
}
