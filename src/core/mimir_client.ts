import type { IntelligenceRequest, IntelligenceResponse } from '../types/intelligence-contract.js';
import type { HostProvider } from './host_session.js';
import type { HostExecRunner } from './mimir_host_transport.js';
import { RETIRED_HOST_PROVIDER_DELEGATION_FAILURE } from './host_delegation_transport.js';

export interface MimirClientOptions {
    projectRoot?: string;
    dbPath?: string;
    env?: NodeJS.ProcessEnv;
    hostSessionActive?: boolean;
    hostProvider?: HostProvider | null;
    hostSessionInvoker?: (prompt: string, provider: HostProvider) => Promise<string> | string;
    oracleInvoker?: (synapseId: number) => Promise<void> | void;
    hostExecRunner?: HostExecRunner;
    codexExecRunner?: HostExecRunner;
    hostSessionTimeoutMs?: number;
    pollIntervalMs?: number;
    pollAttempts?: number;
}

function retiredResponse(request: IntelligenceRequest): IntelligenceResponse {
    return {
        status: 'error',
        error: RETIRED_HOST_PROVIDER_DELEGATION_FAILURE,
        trace: {
            correlation_id: request.correlation_id ?? 'retired-host-provider-delegation',
            transport_mode: 'host_session',
        },
    };
}

/**
 * Import-compatible tombstone for the former model/router client.
 * Construction and every method are local and side-effect free.
 */
export class MimirClient {
    public constructor(_options: MimirClientOptions = {}) {}

    public async request(request: IntelligenceRequest): Promise<IntelligenceResponse> {
        return retiredResponse(request);
    }

    public async think(_query: string, _systemPrompt?: string): Promise<string | null> {
        return null;
    }

    public async getFileIntent(_filepath: string): Promise<string | null> {
        return null;
    }

    public async get_file_intent(filepath: string): Promise<string | null> {
        return this.getFileIntent(filepath);
    }

    public async getWellIntent(filepath: string): Promise<string | null> {
        return this.getFileIntent(filepath);
    }

    public async sampleMind(_options: {
        prompt: string;
        system_instructions?: string;
        systemPrompt?: string;
    }): Promise<{
        data: { raw: string | null };
        trace: IntelligenceResponse['trace'];
        status: IntelligenceResponse['status'];
        error?: string;
    }> {
        const response = retiredResponse({
            prompt: '',
            correlation_id: 'retired-host-provider-delegation',
        });
        return {
            status: response.status,
            error: response.error,
            data: { raw: null },
            trace: response.trace,
        };
    }

    public async close(): Promise<void> {
        return;
    }
}

export const mimir = new MimirClient();
