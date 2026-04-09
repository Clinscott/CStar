import {
    ArchitectProposalHostResponse,
    ArchitectReviewHostResponse,
    ArchitectServicePayload,
    RuntimeContext,
    WeaveResult,
} from '../contracts.ts';
import * as hostBridge from '../weaves/host_bridge.js';

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

export async function executeArchitectService(
    payload: ArchitectServicePayload,
    context: RuntimeContext,
    hostTextInvoker: hostBridge.HostTextInvoker = deps.defaultHostTextInvoker,
): Promise<WeaveResult> {
    const action = payload.action ?? 'review_critique';
    const provider = deps.resolveRuntimeHostProvider(context);

    if (action === 'build_proposal' && provider === 'codex') {
        try {
            const rawText = await hostTextInvoker({
                provider,
                projectRoot: payload.project_root || context.workspace_root,
                source: 'runtime:architect',
                systemPrompt: 'You are the Corvus Star chant architect service. Return strict JSON only.',
                prompt: [
                    'Synthesize a structured proposal from the user intent and research data. Return strict JSON only.',
                    'Expected format: { "proposal_summary": "...", "beads": [{ "id": "...", "title": "...", "rationale": "...", "targets": ["..."], "target_symbol": "...", "depends_on": ["..."], "focus_hint": "...", "acceptance_criteria": ["..."], "checker_shell": "...", "test_file_path": "...", "test_file_content": "...", "target_file_skeleton": "..." }] }',
                    'Host-governable beads must stay bounded.',
                    'If the request cannot be kept bounded, emit multiple smaller beads instead of one oversized bead.',
                    'checker_shell must be executable in this repository without pnpm assumptions.',
                    'Prefer repository-native verification commands such as `node scripts/run-tsx.mjs --test ...` when shaping checker_shell.',
                    '',
                    `USER INTENT: ${payload.intent}`,
                    `RESEARCH: ${JSON.stringify(payload.research, null, 2)}`,
                ].join('\n'),
                metadata: {
                    runtime_weave: 'architect',
                    decision: 'build_proposal',
                    trace_critical: true,
                    require_agent_harness: true,
                    transport_mode: 'host_session',
                },
            });
            const parsed = deps.extractJsonObject(rawText) as ArchitectProposalHostResponse;
            const normalized = normalizeProposalResponse(parsed);
            return {
                weave_id: 'weave:architect',
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
                weave_id: 'weave:architect',
                status: 'FAILURE',
                output: '',
                error: `The chant architect service failed to build proposal: ${message}`,
            };
        }
    }

    if (action === 'review_critique' && provider === 'codex') {
        try {
            const rawText = await hostTextInvoker({
                provider,
                projectRoot: payload.project_root || context.workspace_root,
                source: 'runtime:architect',
                systemPrompt: 'You are the Corvus Star chant architect service. Return strict JSON only.',
                prompt: [
                    'Review the proposed bead and critique payload, then return strict JSON only.',
                    'Expected format: { "is_approved": boolean, "architect_opinion": "...", "final_proposed_path": "..." }',
                    '',
                    `PROPOSED BEAD:\n${JSON.stringify(payload.bead, null, 2)}`,
                    `SUB-AGENT CRITIQUE:\n${JSON.stringify(payload.critique_payload, null, 2)}`,
                ].join('\n'),
                metadata: {
                    runtime_weave: 'architect',
                    decision: 'review_critique',
                    trace_critical: true,
                    require_agent_harness: true,
                    transport_mode: 'host_session',
                },
            });
            const parsed = deps.extractJsonObject(rawText) as ArchitectReviewHostResponse;
            const normalized = normalizeReviewResponse(parsed);
            return {
                weave_id: 'weave:architect',
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
                weave_id: 'weave:architect',
                status: 'FAILURE',
                output: '',
                error: `The chant architect service failed to review critique: ${message}`,
            };
        }
    }

    return {
        weave_id: 'weave:architect',
        status: 'FAILURE',
        output: '',
        error: 'The chant architect service requires an active host session (Codex supported for this action).',
    };
}
