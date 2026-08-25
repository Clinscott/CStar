import type {
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

export interface EstateRitualPayload {
    include_spokes?: boolean;
    auto_execute?: boolean;
    auto_replan_blocked?: boolean;
}

/**
 * Retired autonomous daily ritual. In particular, direct construction cannot
 * dispatch the historical bookmark-weaver or host-governor routes.
 */
export class EstateRitualWeave implements RuntimeAdapter<EstateRitualPayload> {
    public readonly id = 'weave:estate-ritual';

    public constructor(..._retiredDependencies: unknown[]) {
        void _retiredDependencies;
    }

    public async execute(
        _invocation: WeaveInvocation<EstateRitualPayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-estate-ritual-weave',
            recommendedTool: 'cstar_handoff',
        });
    }
}
