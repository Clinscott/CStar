import {
    ResearchWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';
import { defaultHostTextInvoker, extractJsonObject, resolveRuntimeHostProvider, type HostTextInvoker } from './host_bridge.ts';

export class ResearchWeave implements RuntimeAdapter<ResearchWeavePayload> {
    public readonly id = 'weave:research';

    public constructor(
        private readonly dispatchPort: RuntimeDispatchPort,
        private readonly hostTextInvoker: HostTextInvoker = defaultHostTextInvoker,
    ) {}

    public async execute(
        invocation: WeaveInvocation<ResearchWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;

        const provider = resolveRuntimeHostProvider(context);

        if (provider === 'codex') {
            try {
                const rawText = await this.hostTextInvoker({
                    provider,
                    projectRoot: payload.project_root || context.workspace_root,
                    source: 'runtime:research',
                    systemPrompt: 'You are the Corvus Star Research Agent. Return strict JSON only.',
                    prompt: [
                        `Intent: ${payload.intent}`,
                        `Workspace root: ${payload.project_root || context.workspace_root}`,
                        'Instructions:',
                        '1. Inspect the repository first.',
                        '2. Use web search only if your host environment supports it and the intent needs external context.',
                        '3. Synthesize only the findings needed for the planner to continue.',
                        '4. Return strict JSON only in this format:',
                        '{ "summary": "...", "research_artifacts": ["artifact-1", "artifact-2"] }',
                    ].join('\n'),
                });
                const parsed = extractJsonObject(rawText);
                const summary = typeof parsed.summary === 'string' && parsed.summary.trim()
                    ? parsed.summary.trim()
                    : 'Research complete.';
                const artifacts = Array.isArray(parsed.research_artifacts)
                    ? parsed.research_artifacts
                    : [];
                return {
                    weave_id: this.id,
                    status: 'SUCCESS',
                    output: summary,
                    metadata: {
                        delegated: true,
                        provider,
                        intent: payload.intent,
                        research_artifacts: artifacts,
                        research_payload: parsed,
                    },
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    weave_id: this.id,
                    status: 'FAILURE',
                    output: '',
                    error: `The Research Agent failed through the Codex host session: ${message}`,
                };
            }
        }

        if (provider === 'gemini') {
            const directive = `
[SUB_AGENT_DIRECTIVE]
Task: You are the Corvus Star Research Agent.
Model Hint: gemini-2.5-flash-lite
Intent: "${payload.intent}"
Instructions: 
1. Inspect the repository first.
2. Use google_web_search only if external context is required.
3. If you find a relevant github repo, use your terminal tools to invoke 'python src/skills/local/WildHunt/wild_hunt.py --ingest <url> --name <alias>' to ingest it into Corvus Star.
4. Synthesize your findings into a strict JSON object containing a comprehensive summary and a list of artifacts. Do NOT propose beads.
   Format: { "summary": "...", "research_artifacts": ["url1", "url2", "skill:ref-alias"] }
[/SUB_AGENT_DIRECTIVE]
`;
            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: `Delegating research to native ONE MIND environment.\n${directive}`,
                metadata: {
                    delegated: true,
                    intent: payload.intent
                }
            };
        }

        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: 'The Research Agent requires an active host session (Gemini or Codex).',
        };
    }
}
