import { buildHallRepositoryId, normalizeHallPath } from  '../../../../types/hall.js';
import { saveHallEpisodicMemory } from  '../../../../tools/pennyone/intel/database.js';
import type {
    CompressWeavePayload,
    DistillHostResponse,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';
import { defaultHostTextInvoker, extractJsonObject, resolveRuntimeHostProvider, withRuntimeAuguryMetadata, type HostTextInvoker } from  './host_bridge.js';

function normalizeStringList(values: string[] | undefined): string[] {
    return (values ?? [])
        .map((value) => value.trim())
        .filter(Boolean);
}

function normalizeOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value)) {
        throw new Error(`Context Distiller response field ${fieldName} must be an array of strings when provided.`);
    }
    return value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean);
}

function normalizeDistillResponse(parsed: DistillHostResponse): {
    tacticalSummary: string;
    filesTouched?: string[];
    successes?: string[];
    beadId?: string;
} {
    const tacticalSummary = typeof parsed.tactical_summary === 'string' ? parsed.tactical_summary.trim() : '';
    if (!tacticalSummary) {
        throw new Error('Context Distiller response must include a non-empty tactical_summary string.');
    }

    const beadId = typeof parsed.bead_id === 'string' && parsed.bead_id.trim()
        ? parsed.bead_id.trim()
        : undefined;

    return {
        tacticalSummary,
        filesTouched: normalizeOptionalStringArray(parsed.files_touched, 'files_touched'),
        successes: normalizeOptionalStringArray(parsed.successes, 'successes'),
        beadId,
    };
}

function persistTacticalSummary(
    payload: CompressWeavePayload,
    context: RuntimeContext,
    overrides?: {
        tactical_summary?: string;
        files_touched?: string[];
        successes?: string[];
        metadata?: Record<string, unknown>;
        bead_id?: string;
    },
): WeaveResult {
    const repoId = buildHallRepositoryId(normalizeHallPath(payload.project_root || context.workspace_root));
    const now = Date.now();
    const beadId = overrides?.bead_id ?? payload.bead_id!;
    const memoryId = `memory:${beadId}:${now}`;
    saveHallEpisodicMemory({
        memory_id: memoryId,
        bead_id: beadId,
        repo_id: repoId,
        tactical_summary: (overrides?.tactical_summary ?? payload.tactical_summary ?? '').trim(),
        files_touched: normalizeStringList(overrides?.files_touched ?? payload.files_touched ?? payload.target_paths),
        successes: normalizeStringList(overrides?.successes ?? payload.successes),
        metadata: {
            bead_intent: payload.bead_intent,
            proposal_id: payload.proposal_id,
            validation_id: payload.validation_id,
            source: payload.source ?? 'runtime',
            ...payload.metadata,
            ...overrides?.metadata,
        },
        created_at: now,
        updated_at: now,
    });

    return {
        weave_id: 'weave:distill',
        status: 'SUCCESS',
        output: `Persisted episodic memory for bead ${beadId}.`,
        metadata: {
            persisted: true,
            memory_id: memoryId,
            bead_id: beadId,
        },
    };
}

export class DistillWeave implements RuntimeAdapter<CompressWeavePayload> {
    public readonly id = 'weave:distill';

    public constructor(private readonly hostTextInvoker: HostTextInvoker = defaultHostTextInvoker) {}

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
                error: 'The Context Distiller requires a bead_id.',
            };
        }

        if (!payload.bead_intent?.trim()) {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: 'The Context Distiller requires a bead_intent.',
            };
        }

        if (payload.tactical_summary?.trim()) {
            return persistTacticalSummary(payload, context);
        }

        const provider = resolveRuntimeHostProvider(context);

        if (provider) {
            try {
                const systemPrompt = 'You are the Corvus Star Context Distiller. Return strict JSON only.';
                const prompt = `
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
`.trim();

                const rawText = await this.hostTextInvoker({
                    prompt,
                    systemPrompt,
                    provider,
                    projectRoot: payload.project_root || context.workspace_root,
                    source: 'runtime:weave:distill',
                    env: context.env,
                    metadata: withRuntimeAuguryMetadata({
                        weave_id: this.id,
                        bead_id: payload.bead_id,
                        transport_mode: 'host_session',
                    }, context),
                });

                const parsed = extractJsonObject(rawText) as DistillHostResponse;
                const normalized = normalizeDistillResponse(parsed);
                return persistTacticalSummary(payload, context, {
                    tactical_summary: normalized.tacticalSummary,
                    files_touched: normalized.filesTouched,
                    successes: normalized.successes,
                    bead_id: normalized.beadId ?? payload.bead_id,
                    metadata: {
                        provider,
                    },
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: '',
                    error: `The Context Distiller failed through the ${provider} host session: ${message}`,
                };
            }
        }
        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: 'The Context Distiller requires an active host session unless a tactical summary is provided for persistence.',
        };
    }
}
