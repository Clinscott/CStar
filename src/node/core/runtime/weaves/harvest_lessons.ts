import type {
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

export interface HarvestLessonsWeavePayload {
    limit?: number;
    project_root: string;
}

/** Retired lesson-query/process/dispatch adapter. */
export class HarvestLessonsWeave implements RuntimeAdapter<HarvestLessonsWeavePayload> {
    public readonly id = 'weave:harvest-lessons';

    public constructor(..._retiredDependencies: unknown[]) {
        void _retiredDependencies;
    }

    public async execute(
        _invocation: WeaveInvocation<HarvestLessonsWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-harvest-lessons-weave',
            recommendedTool: 'cstar_hall_maintenance',
        });
    }
}
