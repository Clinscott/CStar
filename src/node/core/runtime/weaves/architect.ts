import {
    RuntimeAdapter,
    RuntimeContext,
    RuntimeDispatchPort,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.ts';
import * as hostBridge from  './host_bridge.js';

/**
 * External dependencies for the ArchitectWeave.
 * Supports 1:1 unit test isolation via dependency injection.
 */
export const deps = {
    ...Object.assign({}, hostBridge),
};

export interface ArchitectWeavePayload {
    action?: 'build_proposal' | 'review_critique';
    intent?: string;
    research?: Record<string, unknown>;
    bead?: Record<string, unknown>;
    critique_payload?: Record<string, unknown>;
    context?: string;
    project_root?: string;
    cwd: string;
}

export class ArchitectWeave implements RuntimeAdapter<ArchitectWeavePayload> {
    public readonly id = 'weave:architect';

    public constructor(
        private readonly dispatchPort: RuntimeDispatchPort,
        private readonly hostTextInvoker: hostBridge.HostTextInvoker = deps.defaultHostTextInvoker,
    ) {}

    public async execute(
        invocation: WeaveInvocation<ArchitectWeavePayload>,
        context: RuntimeContext,
    ): Promise<WeaveResult> {
        const payload = invocation.payload;
        const action = payload.action ?? 'review_critique';

        const provider = deps.resolveRuntimeHostProvider(context);

        if (action === 'build_proposal') {
            if (provider === 'codex') {
                try {
                    const rawText = await this.hostTextInvoker({
                        provider,
                        projectRoot: payload.project_root || context.workspace_root,
                        source: 'runtime:architect',
                        systemPrompt: 'You are the Corvus Star Architect Agent. Return strict JSON only.',
                        prompt: [
                            'Synthesize a structured proposal from the user intent and research data. Return strict JSON only.',
                            'Expected format: { "proposal_summary": "...", "beads": [{ "id": "...", "title": "...", "rationale": "...", "targets": ["..."], "target_symbol": "...", "depends_on": ["..."], "focus_hint": "...", "acceptance_criteria": ["..."], "checker_shell": "...", "test_file_path": "...", "test_file_content": "...", "target_file_skeleton": "..." }] }',
                            '',
                            `USER INTENT: ${payload.intent}`,
                            `RESEARCH: ${JSON.stringify(payload.research, null, 2)}`,
                        ].join('\n'),
                    });
                    const parsed = deps.extractJsonObject(rawText);
                    return {
                        weave_id: this.id,
                        status: 'SUCCESS',
                        output: parsed.proposal_summary || 'Proposal synthesized.',
                        metadata: {
                            delegated: true,
                            provider,
                            architect_proposal: parsed,
                        },
                    };
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    return {
                        weave_id: this.id,
                        status: 'FAILURE',
                        output: '',
                        error: `The Architect Agent failed to build proposal: ${message}`,
                    };
                }
            }
            // Gemini transitional block for build_proposal could go here
        }

        if (action === 'review_critique') {
            if (provider === 'codex') {
                try {
                    const rawText = await this.hostTextInvoker({
                        provider,
                        projectRoot: payload.project_root || context.workspace_root,
                        source: 'runtime:architect',
                        systemPrompt: 'You are the Corvus Star Architect Agent. Return strict JSON only.',
                        prompt: [
                            'Review the proposed bead and critique payload, then return strict JSON only.',
                            'Expected format: { "is_approved": boolean, "architect_opinion": "...", "final_proposed_path": "..." }',
                            '',
                            `PROPOSED BEAD:\n${JSON.stringify(payload.bead, null, 2)}`,
                            `SUB-AGENT CRITIQUE:\n${JSON.stringify(payload.critique_payload, null, 2)}`,
                        ].join('\n'),
                    });
                    const parsed = deps.extractJsonObject(rawText);
                    return {
                        weave_id: this.id,
                        status: 'SUCCESS',
                        output: parsed.architect_opinion || 'Architect review complete.',
                        metadata: {
                            delegated: true,
                            provider,
                            architect_payload: parsed,
                        },
                    };
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    return {
                        weave_id: this.id,
                        status: 'FAILURE',
                        output: '',
                        error: `The Architect Agent failed to review critique: ${message}`,
                    };
                }
            }
        }

        return {
            weave_id: this.id,
            status: 'FAILURE',
            output: '',
            error: 'The Architect Agent requires an active host session (Codex supported for this action).',
        };
    }
}
