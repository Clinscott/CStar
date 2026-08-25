import { buildAuguryLearningMetadata } from '../../../../core/host_session.js';
import { RETIRED_HOST_PROVIDER_DELEGATION_FAILURE } from '../../../../core/host_delegation_transport.js';
import type { HostProvider } from '../../../../core/host_session.js';
import type { IntelligenceExecutionSurface } from '../../../../types/intelligence-contract.js';
import type { RuntimeContext } from '../contracts.js';
import {
    sanitizeAuguryMetadataContracts,
    sanitizeUnscoredAuguryContract,
} from '../trace_inheritance.js';

export interface HostTextRequest {
    prompt: string;
    systemPrompt?: string;
    provider: HostProvider;
    projectRoot: string;
    source: string;
    executionSurface: IntelligenceExecutionSurface;
    env?: NodeJS.ProcessEnv;
    metadata?: Record<string, unknown>;
}

export type HostTextInvoker = (request: HostTextRequest) => Promise<string>;

/** Ambient provider resolution is retired; callers must use a sanctioned CStar lane. */
export function resolveRuntimeHostProvider(_context: RuntimeContext): HostProvider | null {
    return null;
}

/** Pure deterministic metadata projection retained for non-executing receipts. */
export function withRuntimeAuguryMetadata(
    metadata: Record<string, unknown>,
    context: RuntimeContext,
): Record<string, unknown> {
    const auguryContract = sanitizeUnscoredAuguryContract(context.augury_contract ?? context.trace_contract);
    const augurySource = context.augury_designation_source ?? context.trace_designation_source;
    const runtimeWeave = typeof metadata.runtime_weave === 'string' ? metadata.runtime_weave : undefined;
    const decision = typeof metadata.decision === 'string' ? metadata.decision : undefined;
    return {
        ...sanitizeAuguryMetadataContracts(metadata),
        target_domain: context.target_domain,
        spoke_name: context.spoke_name ?? null,
        spoke_root: context.spoke_root ?? null,
        requested_root: context.requested_root ?? null,
        ...(auguryContract ? {
            augury_contract: auguryContract,
            trace_contract: auguryContract,
        } : {}),
        ...(augurySource ? {
            augury_designation_source: augurySource,
            trace_designation_source: augurySource,
        } : {}),
        ...(auguryContract ? {
            augury_learning_metadata: buildAuguryLearningMetadata(auguryContract as Record<string, unknown>, {
                session_id: context.session_id ?? null,
                planning_session_id: context.session_id ?? null,
                designation_source: augurySource ?? null,
                prompt_surface: [runtimeWeave, decision].filter(Boolean).join(':') || null,
                bead_id: context.bead_id,
                weave_id: runtimeWeave ?? null,
                target_domain: context.target_domain,
                spoke_name: context.spoke_name ?? null,
                requested_root: context.requested_root ?? null,
            }),
        } : {}),
    };
}

/** Host callback compatibility fails before invoking any provider or callback. */
export async function defaultHostTextInvoker(_request: HostTextRequest): Promise<string> {
    throw new Error(RETIRED_HOST_PROVIDER_DELEGATION_FAILURE);
}

/** Pure parser retained for deterministic validation of already-returned text. */
export function extractJsonObject(raw: string): Record<string, unknown> {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
        throw new Error('Host session did not return a JSON object.');
    }
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}
