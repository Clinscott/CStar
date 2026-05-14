import { buildHallRepositoryId, normalizeHallPath } from '../../../../types/hall.js';
import { database } from '../../../../tools/pennyone/intel/database.js';
import type {
    LessonDistillWeavePayload,
    LessonDistillHostResponse,
    LessonDistillWeaveMetadata,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';
import { defaultHostTextInvoker, extractJsonObject, resolveRuntimeHostProvider, withRuntimeAuguryMetadata, type HostTextInvoker } from './host_bridge.js';
import { randomUUID } from 'node:crypto';
import { execa } from 'execa';
import path from 'node:path';

/**
 * [Ω] STABILITY: Truncate large text fields to prevent local model (LiteRT) context saturation.
 * 8000 characters is approximately 2000 tokens, a safe threshold for Gemma 1B.
 */
function truncateText(text: string, maxChars: number = 8000): string {
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + '\n\n[... TRUNCATED TO PREVENT LOCAL MODEL CONTEXT OVERFLOW ...]';
}

export class DistillLessonsWeave implements RuntimeAdapter<LessonDistillWeavePayload> {
    public readonly id = 'weave:distill-lessons';

    public constructor(
        private readonly hostTextInvoker: HostTextInvoker = defaultHostTextInvoker,
        private readonly runner: typeof execa = execa
    ) {}

    public async execute(
        invocation: WeaveInvocation<LessonDistillWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const memoryId = payload.memory_id;
        const workspaceRoot = payload.project_root || context.workspace_root;
        const repoId = buildHallRepositoryId(normalizeHallPath(workspaceRoot));

        if (!memoryId) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: 'Lesson distillation requires a memory_id.',
            };
        }

        const engram = database.getEpisodicMemory(memoryId);
        if (!engram) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `Episodic memory not found: ${memoryId}`,
            };
        }

        const provider = resolveRuntimeHostProvider(context);
        if (!provider) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: 'Lesson distillation requires an active host session.',
            };
        }

        try {
            const systemPrompt = 'You are the Corvus Star Lesson Harvester. Return strict JSON only.';
            
            // [Ω] STABILITY: Sanitize and truncate inputs to protect LiteRT
            const sanitizedSummary = truncateText(engram.tactical_summary || 'Restored session engram.');
            const sanitizedFiles = truncateText(JSON.stringify(engram.files_touched || []), 2000);
            const sanitizedSuccesses = truncateText(JSON.stringify(engram.successes || []), 2000);

            const prompt = `
Study the following episodic memory engram and identify key "lessons learned".
Organize these lessons into a hierarchical branching tree (TREE -> LIMB -> BRANCH -> LEAF -> CELL).

- TREE: Broad domain (e.g., Persistence, UI, Logic)
- LIMB: Specific subsystem or category
- BRANCH: Problem class or specific feature area
- LEAF: The lesson or insight itself
- CELL: Implementation detail, snippet, or micro-optimization

Engram Summary:
${sanitizedSummary}

Files Touched:
${sanitizedFiles}

Successes:
${sanitizedSuccesses}

Instructions:
1. Identify 3-5 distinct nodes.
2. Link nodes together using 'parent_title' where applicable.
3. Keep titles short and content dense.
4. Return strict JSON only in this format:
{
  "tree_nodes": [
    {
      "level": "TREE",
      "title": "...",
      "content": "...",
      "tags": ["..."]
    },
    {
      "level": "LIMB",
      "title": "...",
      "content": "...",
      "parent_title": "...",
      "tags": ["..."]
    }
  ]
}
`.trim();

            const rawText = await this.hostTextInvoker({
                prompt,
                systemPrompt,
                provider,
                projectRoot: workspaceRoot,
                source: 'runtime:weave:distill-lessons',
                env: context.env,
                metadata: withRuntimeAuguryMetadata({
                    weave_id: this.id,
                    memory_id: memoryId,
                    transport_mode: 'host_session',
                }, context),
            });

            const response = extractJsonObject(rawText) as LessonDistillHostResponse;
            if (!response.tree_nodes || !Array.isArray(response.tree_nodes)) {
                throw new Error('Lesson Harvester response missing tree_nodes array.');
            }

            // Use the Mimir Harvester script for consolidation
            const scriptPath = path.join(context.workspace_root, 'CStar', 'scripts', 'mimir_harvester.py');
            const dbPath = path.join(workspaceRoot, '.stats', 'pennyone.db');
            
            const { stdout } = await this.runner('python3', [
                scriptPath,
                '--db', dbPath,
                '--root', workspaceRoot,
                '--action', 'consolidate',
                '--memory-id', memoryId,
                '--repo-id', repoId,
                '--nodes-json', JSON.stringify(response.tree_nodes)
            ]);

            console.log(`[MimirHarvester] ${stdout.trim()}`);

            return {
                weave_id: this.id,
                status: 'SUCCESS',
                output: `Successfully distilled and consolidated lessons from session ${memoryId}.`,
                metadata: {
                    lessons_payload: response.tree_nodes,
                    harvester_output: stdout.trim()
                },
            };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: `Lesson distillation failed: ${message}`,
            };
        }
    }
}
