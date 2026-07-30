import type { IntelligenceExecutionSurface, IntelligenceResponse } from '../types/intelligence-contract.js';
import type { MimirClient, MimirClientOptions } from './mimir_client.js';
import type { HostProvider } from './host_session.js';
import { RETIRED_HOST_PROVIDER_DELEGATION_FAILURE } from './host_delegation_transport.js';

export interface HostTextRequest {
    prompt: string;
    systemPrompt?: string;
    projectRoot: string;
    source: string;
    provider?: HostProvider | null;
    env?: NodeJS.ProcessEnv;
    correlationId?: string;
    executionSurface: IntelligenceExecutionSurface;
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

export interface HostTextDependencies {
    clientFactory?: HostTextClientFactory;
    hostSessionInvoker?: HostSessionInvoker;
}

/** Callback binding is retired and fails before storing or invoking the callback. */
export function bindSharedHostSessionInvoker(_invoker: HostSessionInvoker): never {
    throw new Error(RETIRED_HOST_PROVIDER_DELEGATION_FAILURE);
}

/** Kept as an import-safe no-op for historical teardown calls. */
export function clearSharedHostSessionInvoker(): void {
    return;
}

/** Kept as an import-safe no-op; the retired path records no prompt history. */
export function clearAuguryPromptHistory(): void {
    return;
}

/** Host intelligence compatibility fails before provider, source, Hall, or callback access. */
export async function requestHostText(
    _request: HostTextRequest,
    _dependencies: HostTextDependencies = {},
): Promise<HostTextResult> {
    throw new Error(RETIRED_HOST_PROVIDER_DELEGATION_FAILURE);
}
