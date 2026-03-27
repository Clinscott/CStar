import {
    ArchitectProposalHostResponse,
    ArchitectReviewHostResponse,
    ArchitectWeavePayload,
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

function normalizeProposalResponse(parsed: ArchitectProposalHostResponse): { proposalSummary: string; beads: Record<string, unknown>[] } {
    const proposalSummary = typeof parsed.proposal_summary === 'string' ? parsed.proposal_summary.trim() : '';
    if (!proposalSummary) {
        throw new Error('Architect proposal response must include a non-empty proposal_summary string.');
    }

    if (!Array.isArray(parsed.beads)) {
        throw new Error('Architect proposal response must include a beads array.');
    }

    const beads = parsed.beads.filter(
        (bead): bead is Record<string, unknown> => typeof bead === 'object' && bead !== null && !Array.isArray(bead),
    );
    if (beads.length !== parsed.beads.length) {
        throw new Error('Architect proposal response beads must be objects.');
    }

    return { proposalSummary, beads };
}

function normalizeReviewResponse(parsed: ArchitectReviewHostResponse): {
    isApproved: boolean;
    architectOpinion: string;
    finalProposedPath?: string;
} {
    if (typeof parsed.is_approved !== 'boolean') {
        throw new Error('Architect review response must include an is_approved boolean.');
    }

    const architectOpinion = typeof parsed.architect_opinion === 'string' ? parsed.architect_opinion.trim() : '';
    if (!architectOpinion) {
        throw new Error('Architect review response must include a non-empty architect_opinion string.');
    }

    const finalProposedPath = typeof parsed.final_proposed_path === 'string' && parsed.final_proposed_path.trim()
        ? parsed.final_proposed_path.trim()
        : undefined;

    return {
        isApproved: parsed.is_approved,
        architectOpinion,
        finalProposedPath,
    };
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
                    const parsed = deps.extractJsonObject(rawText) as ArchitectProposalHostResponse;
                    const normalized = normalizeProposalResponse(parsed);
                    return {
                        weave_id: this.id,
                        status: 'SUCCESS',
                        output: normalized.proposalSummary,
                        metadata: {
                            delegated: true,
                            provider,
                            architect_proposal: {
                                ...parsed,
                                proposal_summary: normalized.proposalSummary,
                                beads: normalized.beads,
                            },
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
                    const parsed = deps.extractJsonObject(rawText) as ArchitectReviewHostResponse;
                    const normalized = normalizeReviewResponse(parsed);
                    return {
                        weave_id: this.id,
                        status: 'SUCCESS',
                        output: normalized.architectOpinion,
                        metadata: {
                            delegated: true,
                            provider,
                            architect_payload: {
                                ...parsed,
                                is_approved: normalized.isApproved,
                                architect_opinion: normalized.architectOpinion,
                                final_proposed_path: normalized.finalProposedPath,
                            },
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
