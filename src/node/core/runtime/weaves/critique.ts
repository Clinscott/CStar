import {
    RuntimeAdapter,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';

export interface CritiqueWeavePayload {
    bead: Record<string, unknown>;
    research: Record<string, unknown>;
    context?: string;
    project_root?: string;
    cwd: string;
}

export class CritiqueWeave implements RuntimeAdapter<CritiqueWeavePayload> {
    public readonly id = 'weave:critique';

    public constructor(private readonly dispatchPort: RuntimeDispatchPort) {}

    public async execute(
        invocation: WeaveInvocation<CritiqueWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        
        const isCliActive = context.env.GEMINI_CLI_ACTIVE === 'true' || process.env.GEMINI_CLI_ACTIVE === 'true';

        if (isCliActive) {
            const directive = `
[SUB_AGENT_DIRECTIVE]
Task: You are the specialized Adversarial Critique Agent for Corvus Star.
Instructions:
1. Act as a "Devil's Advocate". Stress-test the proposed bead against the research.
2. Find edge cases, logic gaps, or unverified assumptions.
3. Your critique MUST be backed by the research artifacts.
4. If the Architect and Sub-Agent disagree, do not execute the fix yet, formulate a counter-proposal to be adjudicated by the User.
5. Provide your output in a strict JSON format.

PROPOSED BEAD:
${JSON.stringify(payload.bead, null, 2)}

RESEARCH CONTEXT:
${JSON.stringify(payload.research, null, 2)}

ROLLING CONTEXT (History):
${payload.context ?? 'None'}

Expected Output Format (JSON):
{ "needs_revision": boolean, "critique": "...", "evidence_source": "...", "proposed_path": "..." }
[/SUB_AGENT_DIRECTIVE]
`;
            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: `Delegating adversarial critique to native ONE MIND environment.\n${directive}`,
                metadata: {
                    delegated: true,
                    bead_title: payload.bead.title
                }
            };
        } else {
            return {
                weave_id: this.id,
                status: 'FAILURE',
                output: '',
                error: 'The Critique Agent requires the Gemini CLI environment to function. Please run this command within the AI CLI.'
            };
        }
    }
}