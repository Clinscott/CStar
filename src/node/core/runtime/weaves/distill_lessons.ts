import type {
    LessonDistillWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

/** Retired lesson-model/process/Hall adapter. */
export class DistillLessonsWeave implements RuntimeAdapter<LessonDistillWeavePayload> {
    public readonly id = 'weave:distill-lessons';

    public constructor(..._retiredDependencies: unknown[]) {
        void _retiredDependencies;
    }

    public async execute(
        _invocation: WeaveInvocation<LessonDistillWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-distill-lessons-weave',
            recommendedTool: 'cstar_hall_maintenance',
        });
    }
}
