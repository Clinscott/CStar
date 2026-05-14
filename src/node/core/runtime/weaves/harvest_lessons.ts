import { RuntimeAdapter, RuntimeContext, WeaveInvocation, WeaveResult, RuntimeDispatchPort } from '../contracts.ts';
import { execa } from 'execa';
import path from 'node:path';

export interface HarvestLessonsWeavePayload {
    project_root: string;
    limit?: number;
}

/**
 * [Ω] HARVEST LESSONS WEAVE
 * Purpose: Batch process unstudied episodic memory engrams and distill hierarchical lessons.
 */
export class HarvestLessonsWeave implements RuntimeAdapter<HarvestLessonsWeavePayload> {
    public readonly id = 'weave:harvest-lessons';

    public constructor(
        private readonly dispatchPort: RuntimeDispatchPort,
        private readonly runner: typeof execa = execa
    ) {}

    public async execute(
        invocation: WeaveInvocation<HarvestLessonsWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const workspaceRoot = payload.project_root || context.workspace_root;
        const limit = payload.limit || 5;

        try {
            // 1. Find unstudied engrams
            const scriptPath = path.join(context.workspace_root, 'CStar', 'scripts', 'mimir_harvester.py');
            const dbPath = path.join(workspaceRoot, '.stats', 'pennyone.db');
            
            const { stdout } = await this.runner('python3', [
                scriptPath,
                '--db', dbPath,
                '--root', workspaceRoot,
                '--action', 'find'
            ]);

            const unstudiedIds: string[] = JSON.parse(stdout.trim());
            if (unstudiedIds.length === 0) {
                return {
                    weave_id: this.id,
                    status: 'SUCCESS',
                    output: 'The Hall is fully studied. No unstudied engrams found.',
                };
            }

            const targetIds = unstudiedIds.slice(0, limit);
            const results: string[] = [];
            let successCount = 0;

            console.log(`[ALFRED] Starting harvest of ${targetIds.length} engrams...`);

            for (const memoryId of targetIds) {
                try {
                    // [Ω] STABILITY: Add 500ms delay to prevent LiteRT/Local-Model congestion during batch harvest.
                    await new Promise((resolve) => setTimeout(resolve, 500));

                    const distillResult = await this.dispatchPort.dispatch({
                        weave_id: 'weave:distill-lessons',
                        payload: {
                            memory_id: memoryId,
                            project_root: workspaceRoot,
                            cwd: process.cwd(),
                        },
                        session: invocation.session,
                    } as any);

                    if (distillResult.status === 'SUCCESS') {
                        successCount++;
                        results.push(`✅ Studied ${memoryId}`);
                    } else {
                        results.push(`❌ Failed ${memoryId}: ${distillResult.error}`);
                    }
                } catch (e: any) {
                    results.push(`❌ Error studying ${memoryId}: ${e.message}`);
                }
            }

            return {
                weave_id: this.id,
                status: 'SUCCESS',
                output: `Harvest complete. Successfully studied ${successCount}/${targetIds.length} engrams.\n\n${results.join('\n')}`,
                metadata: {
                    total_unstudied: unstudiedIds.length,
                    processed_count: targetIds.length,
                    success_count: successCount
                }
            };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `Harvest failed: ${message}`,
            };
        }
    }
}
