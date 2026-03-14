import { buildHallRepositoryId, normalizeHallPath } from '../../../../types/hall.ts';
import { saveHallEpisodicMemory } from '../../../../tools/pennyone/intel/database.ts';
import type {
    CompressWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';

function normalizeStringList(values: string[] | undefined): string[] {
    return (values ?? [])
        .map((value) => value.trim())
        .filter(Boolean);
}

export class CompressWeave implements RuntimeAdapter<CompressWeavePayload> {
    public readonly id = 'weave:compress';

    public async execute(
        invocation: WeaveInvocation<CompressWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        if (!payload.bead_id?.trim()) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: 'The Context Compressor requires a bead_id.',
            };
        }

        if (!payload.bead_intent?.trim()) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: 'The Context Compressor requires a bead_intent.',
            };
        }

        const repoId = buildHallRepositoryId(normalizeHallPath(payload.project_root || context.workspace_root));
        const now = Date.now();

        if (payload.tactical_summary?.trim()) {
            const memoryId = `memory:${payload.bead_id}:${now}`;
            saveHallEpisodicMemory({
                memory_id: memoryId,
                bead_id: payload.bead_id,
                repo_id: repoId,
                tactical_summary: payload.tactical_summary.trim(),
                files_touched: normalizeStringList(payload.files_touched ?? payload.target_paths),
                successes: normalizeStringList(payload.successes),
                metadata: {
                    bead_intent: payload.bead_intent,
                    proposal_id: payload.proposal_id,
                    validation_id: payload.validation_id,
                    source: payload.source ?? 'runtime',
                    ...payload.metadata,
                },
                created_at: now,
                updated_at: now,
            });

            return {
                weave_id: this.id,
                status: 'SUCCESS',
                output: `Persisted episodic memory for bead ${payload.bead_id}.`,
                metadata: {
                    persisted: true,
                    memory_id: memoryId,
                    bead_id: payload.bead_id,
                },
            };
        }

        const isCliActive =
            context.env.GEMINI_CLI_ACTIVE === 'true' || process.env.GEMINI_CLI_ACTIVE === 'true';

        if (!isCliActive) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: 'The Context Compressor requires the Gemini CLI environment unless a tactical summary is provided for persistence.',
            };
        }

        const directive = `
[SUB_AGENT_DIRECTIVE]
Task: You are the Corvus Star Context Compressor.
Model Hint: gemini-2.5-flash-lite
Bead ID: "${payload.bead_id}"
Bead Intent: "${payload.bead_intent}"
Candidate Diff:
${payload.git_diff?.trim() || 'NO_DIFF_PROVIDED'}

Instructions:
1. Read the bead intent and diff.
2. Ignore failed tool calls and abandoned attempts.
3. Summarize only successful tactical changes that should become episodic memory.
4. Keep the output compact and concrete.
5. Return strict JSON only in this format:
{
  "tactical_summary": "...",
  "files_touched": ["path/a", "path/b"],
  "successes": ["..."],
  "bead_id": "${payload.bead_id}"
}
[/SUB_AGENT_DIRECTIVE]
`;

        return {
            weave_id: this.id,
            status: 'TRANSITIONAL',
            output: `Delegating compression to native ONE MIND environment.\n${directive}`,
            metadata: {
                delegated: true,
                bead_id: payload.bead_id,
                model_hint: 'gemini-2.5-flash-lite',
            },
        };
    }
}
