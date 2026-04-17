import { requestHostText } from  '../../../../core/host_intelligence.js';
import type { HostProvider } from  '../../../../core/host_session.js';
import { buildAuguryLearningMetadata, resolveHostProvider } from  '../../../../core/host_session.js';
import type { RuntimeContext } from  '../contracts.js';

export interface HostTextRequest {
    prompt: string;
    systemPrompt?: string;
    provider: HostProvider;
    projectRoot: string;
    source: string;
    env?: NodeJS.ProcessEnv;
    metadata?: Record<string, unknown>;
}

export type HostTextInvoker = (request: HostTextRequest) => Promise<string>;

export function resolveRuntimeHostProvider(context: RuntimeContext): HostProvider | null {
    return resolveHostProvider({ ...process.env, ...context.env } as NodeJS.ProcessEnv);
}

export function withRuntimeAuguryMetadata(
    metadata: Record<string, unknown>,
    context: RuntimeContext,
): Record<string, unknown> {
    const auguryContract = context.augury_contract ?? context.trace_contract;
    const augurySource = context.augury_designation_source ?? context.trace_designation_source;
    const runtimeWeave = typeof metadata.runtime_weave === 'string' ? metadata.runtime_weave : undefined;
    const decision = typeof metadata.decision === 'string' ? metadata.decision : undefined;
    return {
        ...metadata,
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

export async function defaultHostTextInvoker(request: HostTextRequest): Promise<string> {
    const result = await requestHostText({
        prompt: request.prompt,
        systemPrompt: request.systemPrompt,
        projectRoot: request.projectRoot,
        source: request.source,
        provider: request.provider,
        env: request.env,
        metadata: request.metadata,
    });
    return result.text;
}

export function extractJsonObject(raw: string): Record<string, unknown> {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
        throw new Error('Host session did not return a JSON object.');
    }
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}
