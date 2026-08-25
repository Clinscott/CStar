import type {
    LessonDistillWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';

export const LESSON_DISTILLATION_DECOMMISSIONED_ERROR =
    'Lesson distillation is decommissioned: model output cannot write or promote canonical CStar memory.';

/**
 * Compatibility tombstone for the former model-backed lesson distiller.
 *
 * The adapter deliberately remains importable so stale callers receive a
 * deterministic failure instead of falling through to another execution
 * surface. It performs no Engram lookup, host/model request, subprocess,
 * Hall/SQLite mutation, or filesystem write.
 */
export class DistillLessonsWeave implements RuntimeAdapter<LessonDistillWeavePayload> {
    public readonly id = 'weave:distill-lessons';

    public async execute(
        invocation: WeaveInvocation<LessonDistillWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        void invocation;
        void context;
        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: LESSON_DISTILLATION_DECOMMISSIONED_ERROR,
            metadata: {
                decommissioned: true,
                actuated: false,
                replacement: 'Inspect existing Engrams or Hall lessons read-only; record new durable knowledge through an explicit operator-reviewed CStar lifecycle.',
            },
        };
    }
}
