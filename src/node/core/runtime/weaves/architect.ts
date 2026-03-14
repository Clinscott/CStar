import {
    RuntimeAdapter,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';

export interface ArchitectWeavePayload {
    bead: Record<string, unknown>;
    critique_payload: Record<string, unknown>;
    context?: string;
    project_root?: string;
    cwd: string;
}

export class ArchitectWeave implements RuntimeAdapter<ArchitectWeavePayload> {
    public readonly id = 'weave:architect';

    public constructor(private readonly dispatchPort: RuntimeDispatchPort) {}

    public async execute(
        invocation: WeaveInvocation<ArchitectWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        
        const isCliActive = context.env.GEMINI_CLI_ACTIVE === 'true' || process.env.GEMINI_CLI_ACTIVE === 'true';

        if (isCliActive) {
            const directive = `
[ARCHITECT_DIRECTIVE]
Task: You are the Main Agent (The Architect) for Corvus Star.
Instructions:
1. Review the proposed bead and the Sub-Agent's rigorous critique.
2. Determine if you agree with the Sub-Agent. 
   - If the Sub-Agent found a real flaw, adopt their proposed path and mark 'is_approved: false'.
   - If the Sub-Agent is being too pedantic, overrule them, maintain the original bead, and mark 'is_approved: true'.
3. Maintain the "Living Unified Whole". Ensure your decision does not break the Rolling Context (history).
4. Provide a blunt, honest [ARCHITECT'S OPINION] explaining your ruling.
5. Provide your output in a strict JSON format so it can be parsed back into the PennyOne database.

PROPOSED BEAD:
${JSON.stringify(payload.bead, null, 2)}

SUB-AGENT CRITIQUE:
${JSON.stringify(payload.critique_payload, null, 2)}

ROLLING CONTEXT (History):
${payload.context ?? 'None'}

Expected Output Format (JSON):
{ 
  "is_approved": boolean, 
  "architect_opinion": "...", 
  "final_proposed_path": "..." 
}
[/ARCHITECT_DIRECTIVE]
`;
            return {
                weave_id: this.id,
                status: 'TRANSITIONAL',
                output: `Delegating architectural review to native ONE MIND environment.\n${directive}`,
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
                error: 'The Architect Agent requires the ONE MIND environment to function. Please run this command within the AI CLI.'
            };
        }
    }
}