import type {
    ResearchHostResponse,
    ResearchWeavePayload,
    RuntimeAdapter,
    RuntimeContext,
    WeaveInvocation,
    WeaveResult,
} from '../contracts.js';
import { buildRetiredRuntimeResult } from '../retired_adapter.js';

/** Pure schema normalization retained for validated host-produced evidence. */
export function normalizeResearchResponse(
    parsed: ResearchHostResponse,
): { summary: string; researchArtifacts: string[] } {
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    if (!summary) {
        throw new Error('Research host response must include a non-empty summary string.');
    }

    if (parsed.research_artifacts !== undefined && !Array.isArray(parsed.research_artifacts)) {
        throw new Error('Research host response research_artifacts must be an array of strings when provided.');
    }

    const researchArtifacts = Array.isArray(parsed.research_artifacts)
        ? parsed.research_artifacts
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean)
        : [];

    return { summary, researchArtifacts };
}

/** Retired direct research callback/delegation workflow. */
export class ResearchHostWorkflow implements RuntimeAdapter<ResearchWeavePayload> {
    public readonly id = 'weave:research';

    public constructor(..._retiredDependencies: unknown[]) {
        void _retiredDependencies;
    }

    public async execute(
        _invocation: WeaveInvocation<ResearchWeavePayload>,
        _context: RuntimeContext,
    ): Promise<WeaveResult> {
        return buildRetiredRuntimeResult({
            weaveId: this.id,
            boundary: 'retired-research-host-workflow',
            recommendedTool: 'cstar_researcher_request',
        });
    }
}

export { ResearchHostWorkflow as ResearchWeave };
