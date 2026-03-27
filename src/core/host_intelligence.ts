import type { IntelligenceResponse } from  '../types/intelligence-contract.js';
import { MimirClient, type MimirClientOptions } from  './mimir_client.js';
import type { HostProvider } from  './host_session.js';
import { resolveHostProvider } from  './host_session.js';
import { resolveOneMindDecision } from './one_mind_bridge.js';

export interface HostTextRequest {
    prompt: string;
    systemPrompt?: string;
    projectRoot: string;
    source: string;
    provider?: HostProvider | null;
    env?: NodeJS.ProcessEnv;
    correlationId?: string;
    metadata?: Record<string, unknown>;
}

export interface HostTextResult {
    provider: HostProvider;
    response: IntelligenceResponse;
    text: string;
}

export type HostTextClient = Pick<MimirClient, 'request'>;
export type HostTextClientFactory = (options: MimirClientOptions) => HostTextClient;

export interface HostTextDependencies {
    clientFactory?: HostTextClientFactory;
}

export async function requestHostText(
    request: HostTextRequest,
    dependencies: HostTextDependencies = {},
): Promise<HostTextResult> {
    const env = request.env ?? process.env;
    const provider = request.provider ?? resolveHostProvider(env);

    if (!provider) {
        throw new Error('Host Agent session inactive.');
    }

    const clientFactory = dependencies.clientFactory ?? ((options: MimirClientOptions) => new MimirClient(options));
    const client = clientFactory({
        projectRoot: request.projectRoot,
        env,
        hostSessionActive: true,
        hostProvider: provider,
    });

    const intelligenceRequest = {
        prompt: request.prompt,
        system_prompt: request.systemPrompt,
        correlation_id: request.correlationId,
        caller: { source: request.source },
        metadata: request.metadata ?? {},
        transport_mode: request.metadata?.transport_mode as any ?? 'auto',
    };
    const transportMode = resolveOneMindDecision(intelligenceRequest, env, {
        hostSessionActive: true,
    }).transportMode;

    const response = await client.request({
        ...intelligenceRequest,
        transport_mode: transportMode,
    });

    if (response.status !== 'success') {
        throw new Error(response.error ?? `${provider} host session invocation failed.`);
    }

    const text = String(response.raw_text ?? '').trim();
    if (!text) {
        throw new Error(`${provider} host session returned no output.`);
    }

    return {
        provider,
        response,
        text,
    };
}
