import type {
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

export interface CritiqueWeavePayload {
    bead: Record<string, unknown>;
    research: Record<string, unknown>;
    context?: string;
    focus_areas?: string[];
    project_root?: string;
    cwd: string;
}

/** Retired direct critique callback/delegation workflow. */
export class CritiqueHostWorkflow implements RuntimeAdapter<CritiqueWeavePayload> {
    public readonly id = 'weave:critique';

    public constructor(..._retiredDependencies: unknown[]) {
        void _retiredDependencies;
    }

    public async execute(
        _invocation: WeaveInvocation<CritiqueWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-critique-host-workflow',
            recommendedTool: 'cstar_handoff',
        });
    }
}

export { CritiqueHostWorkflow as CritiqueWeave };
