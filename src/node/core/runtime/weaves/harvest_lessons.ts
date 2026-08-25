import type {
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';

export interface HarvestLessonsWeavePayload {
    project_root: string;
    limit?: number;
}

export const LESSON_HARVEST_DECOMMISSIONED_ERROR =
    'Lesson harvesting is decommissioned: recursive model study cannot write or promote canonical CStar memory.';

/**
 * Compatibility tombstone for the former recursive lesson harvester.
 *
 * It performs no candidate scan, dispatch, delay loop, subprocess, model
 * request, Hall/SQLite mutation, or filesystem write.
 */
export class HarvestLessonsWeave implements RuntimeAdapter<HarvestLessonsWeavePayload> {
    public readonly id = 'weave:harvest-lessons';

    public async execute(
        invocation: WeaveInvocation<HarvestLessonsWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        void invocation;
        void context;
        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: LESSON_HARVEST_DECOMMISSIONED_ERROR,
            metadata: {
                decommissioned: true,
                actuated: false,
                replacement: 'Use bounded read-only Hall search for existing Engrams or lessons.',
            },
        };
    }
}
