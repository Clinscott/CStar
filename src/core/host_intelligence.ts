import type { IntelligenceResponse } from  '../types/intelligence-contract.js';
import { MimirClient, type MimirClientOptions } from  './mimir_client.js';
import type { HostProvider } from  './host_session.js';
import { resolveHostProvider } from  './host_session.js';
import { loadCascadingContext } from './context_loader.js';

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
export type HostSessionInvoker = NonNullable<MimirClientOptions['hostSessionInvoker']>;

let sharedHostSessionInvoker: HostSessionInvoker | undefined;

export interface HostTextDependencies {
    clientFactory?: HostTextClientFactory;
    hostSessionInvoker?: HostSessionInvoker;
}

export function bindSharedHostSessionInvoker(invoker: HostSessionInvoker): () => void {
    const previous = sharedHostSessionInvoker;
    sharedHostSessionInvoker = invoker;
    return () => {
        sharedHostSessionInvoker = previous;
    };
}

export function clearSharedHostSessionInvoker(): void {
    sharedHostSessionInvoker = undefined;
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
    const hostSessionInvoker = dependencies.hostSessionInvoker ?? sharedHostSessionInvoker;
    const timeoutRaw = Number(env.CSTAR_HOST_SESSION_TIMEOUT_MS ?? env.CORVUS_HOST_SESSION_TIMEOUT_MS ?? '');
    const hostSessionTimeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : undefined;
    const client = clientFactory({
        projectRoot: request.projectRoot,
        env,
        hostSessionActive: true,
        hostProvider: provider,
        hostSessionInvoker,
        hostSessionTimeoutMs,
    });

    const cascadingContext = loadCascadingContext(request.projectRoot);
    const finalSystemPrompt = request.systemPrompt
        ? `${request.systemPrompt}\n\n${cascadingContext}`
        : cascadingContext;

    const intelligenceRequest = {
        prompt: request.prompt,
        system_prompt: finalSystemPrompt || undefined,
        correlation_id: request.correlationId,
        caller: { source: request.source },
        metadata: request.metadata ?? {},
        transport_mode: (request.metadata?.transport_mode as any) ?? 'host_session',
    };
    const response = await client.request({
        ...intelligenceRequest,
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
