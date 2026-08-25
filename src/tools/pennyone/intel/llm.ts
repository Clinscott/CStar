import path from 'node:path';

import type { IntelligenceRequest, IntelligenceResponse } from '../../../types/intelligence-contract.js';
import type { FileData } from '../types.js';
import { RETIRED_HOST_PROVIDER_DELEGATION_FAILURE } from '../../../core/host_delegation_transport.js';

export interface IntelProvider {
    getIntent(code: string, data: FileData): Promise<{ intent: string; interaction: string }>;
    getBatchIntent(items: { code: string; data: FileData }[]): Promise<{ intent: string; interaction: string }[]>;
}

export const OFFLINE_INTENT_PLACEHOLDER = 'Intelligence generation offline. See sector lore for details.';

type IntelligenceRequester = (request: IntelligenceRequest) => Promise<IntelligenceResponse>;

/**
 * Deterministic compatibility provider. The former model callback is ignored and
 * no provider, source file, process, Hall row, or StateRegistry entry is touched.
 */
export class SamplingProvider implements IntelProvider {
    public constructor(
        _requestIntelligence?: IntelligenceRequester,
        _env: NodeJS.ProcessEnv = {},
    ) {}

    public async getIntent(
        code: string,
        data: FileData,
    ): Promise<{ intent: string; interaction: string }> {
        return (await this.getBatchIntent([{ code, data }]))[0];
    }

    public async getBatchIntent(
        items: { code: string; data: FileData }[],
    ): Promise<{ intent: string; interaction: string }[]> {
        return items.map(({ data }) => {
            const fileName = path.basename(data.path);
            const exports = data.exports.length > 0
                ? ` Key exports: ${data.exports.join(', ')}.`
                : '';
            return {
                intent: `The ${fileName} sector is indexed locally at ${data.path}.${exports}`,
                interaction: RETIRED_HOST_PROVIDER_DELEGATION_FAILURE,
            };
        });
    }
}

export const defaultProvider: IntelProvider = new SamplingProvider();
