import {
    RuntimeAdapter,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';
import { defaultHostTextInvoker, extractJsonObject, resolveRuntimeHostProvider, type HostTextInvoker } from  './host_bridge.js';

export interface CritiqueWeavePayload {
    bead: Record<string, unknown>;
    research: Record<string, unknown>;
    context?: string;
    project_root?: string;
    cwd: string;
}

export class CritiqueWeave implements RuntimeAdapter<CritiqueWeavePayload> {
    public readonly id = 'weave:critique';

    public constructor(
        private readonly dispatchPort: RuntimeDispatchPort,
        private readonly hostTextInvoker: HostTextInvoker = defaultHostTextInvoker,
    ) {}

    public async execute(
        invocation: WeaveInvocation<CritiqueWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;

        const provider = resolveRuntimeHostProvider(context);

        if (provider) {
            try {
                const rawText = await this.hostTextInvoker({
                    provider,
                    projectRoot: payload.project_root || context.workspace_root,
                    source: 'runtime:critique',
                    env: { ...process.env, ...context.env } as NodeJS.ProcessEnv,
                    systemPrompt: 'You are the Corvus Star Adversarial Critique Agent. Return strict JSON only.',
                    prompt: [
                        'Stress-test the proposed bead against the supplied research and return strict JSON only.',
                        'Expected format: { "needs_revision": boolean, "critique": "...", "evidence_source": "...", "proposed_path": "..." }',
                        '',
                        `PROPOSED BEAD:\n${JSON.stringify(payload.bead, null, 2)}`,
                        '',
                        `RESEARCH CONTEXT:\n${JSON.stringify(payload.research, null, 2)}`,
                        '',
                        `ROLLING CONTEXT:\n${payload.context ?? 'None'}`,
                    ].join('\n'),
                });
                const parsed = extractJsonObject(rawText);
                return {
                    weave_id: this.id,
                    status: 'SUCCESS',
                    output: typeof parsed.critique === 'string' && parsed.critique.trim()
                        ? parsed.critique.trim()
                        : 'Critique complete.',
                    metadata: {
                        delegated: true,
                        provider,
                        bead_title: payload.bead.title,
                        critique_payload: parsed,
                    },
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: '',
                    error: `The Critique Agent failed through the ${provider} host session: ${message}`,
                };
            }
        }

        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: 'The Critique Agent requires an active host session.',
        };
    }
}
