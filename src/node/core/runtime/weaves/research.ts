import {
    ResearchWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';

export class ResearchWeave implements RuntimeAdapter<ResearchWeavePayload> {
    public readonly id = 'weave:research';

    public constructor(private readonly dispatchPort: RuntimeDispatchPort) {}

    public async execute(
        invocation: WeaveInvocation<ResearchWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        
        // When running within the Gemini CLI environment, we do not want to use 
        // local python scripts or local API keys for heavy logic. We delegate
        // the task back to the native CLI environment.
        
        const isCliActive = context.env.GEMINI_CLI_ACTIVE === 'true' || process.env.GEMINI_CLI_ACTIVE === 'true';

        if (isCliActive) {
            // We return a TRANSITIONAL state containing a directive for the ONE MIND to execute.
            // The CLI will intercept this, run its 'generalist' sub-agent, and we assume
            // the user/CLI will feed the resulting JSON back into the system in the next turn.
            
            const directive = `
[SUB_AGENT_DIRECTIVE]
Task: You are the Corvus Star Research Agent.
Model Hint: gemini-2.5-flash-lite
Intent: "${payload.intent}"
Instructions: 
1. Use google_web_search to find architectural documentation, github repos, or tutorials related to the intent.
2. If you find a relevant github repo, use your terminal tools to invoke 'python src/skills/local/WildHunt/wild_hunt.py --ingest <url> --name <alias>' to ingest it into Corvus Star.
3. Synthesize your findings into a strict JSON object containing a comprehensive summary and a list of artifacts. Do NOT propose beads.
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
        } else {
            // Fallback for when running standalone (e.g. standard terminal)
            // Here we would call the python research_agent.py, but since we want to enforce
            // the new pattern, we will just return a failure asking the user to use the CLI.
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: 'The Research Agent requires the Gemini CLI environment to function optimally. Please run this command within the AI CLI.'
            };
        }
    }
}
