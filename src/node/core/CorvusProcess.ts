import { EventEmitter } from 'events';

import { mimir } from '../../core/mimir_client.ts';
import { CortexLink, type CortexResponse } from '../cortex_link.js';
import { EventManager } from './EventManager.js';
import { IntelligenceRequest, IntelligenceResponse } from '../../types/intelligence-contract.ts';

/**
 * [O.D.I.N.] Rigid Input Boundary Schema
 */
export interface IntentPayload {
    system_meta: Record<string, any>;
    intent_raw: string;
    intent_normalized: string;
    target_workflow: string;
    extracted_entities: Record<string, any>;
}

/**
 * [ALFRED] Continuous Output Boundary Schema
 */
export interface DaemonTelemetry {
    type?: 'TELEMETRY' | 'SYSTEM_RESTART' | 'HUD_STREAM' | 'TRACE' | 'FLARE';
    source?: string;
    message?: string;
    status?: string;
    data?: any;
    ts?: number;
}

export type IntentDispatchExecutor = (payload: IntentPayload) => Promise<CortexResponse>;

async function defaultIntentDispatch(payload: IntentPayload): Promise<CortexResponse> {
    const link = new CortexLink();
    return link.sendCommand('ROUTE_INTENT', [payload]);
}

export class CorvusProcess extends EventEmitter {
    private isRunning = false;

    constructor(
        private readonly _entrypoint: string = 'src/core/cstar_dispatcher.py',
        private readonly dispatchExecutor: IntentDispatchExecutor = defaultIntentDispatch,
    ) {
        super();
    }

    public async boot(): Promise<void> {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        this.emit('telemetry', {
            type: 'TELEMETRY',
            source: 'SYSTEM',
            status: 'READY',
            message: 'Kernel bridge ready for one-shot dispatch.',
            ts: Date.now(),
        });
    }

    public async dispatchIntent(payload: IntentPayload): Promise<void> {
        if (!this.isRunning) {
            throw new Error('Cannot dispatch: Kernel bridge offline.');
        }

        this.emit('telemetry', {
            type: 'TELEMETRY',
            source: 'SYSTEM',
            status: 'DISPATCH',
            message: `Dispatching intent ${payload.intent_normalized}.`,
            ts: Date.now(),
        });

        const response = await this.dispatchExecutor(payload);
        const appId = payload.system_meta?.app_id;
        const success = response.status === 'success';
        const message = success
            ? `Kernel completed ${payload.intent_normalized}.`
            : `Kernel failed ${payload.intent_normalized}: ${response.error ?? 'Unknown error'}`;

        if (appId) {
            EventManager.getInstance().broadcast(String(appId), {
                type: success ? 'CORE_INTENT_RESULT' : 'TELEMETRY',
                intent: payload.intent_normalized,
                response: response.data ?? response.error,
                source: 'kernel',
            });
        }

        this.emit('telemetry', {
            type: 'TELEMETRY',
            source: 'KERNEL',
            status: success ? 'SUCCESS' : 'ERROR',
            message,
            data: response.data,
            ts: Date.now(),
        });

        if (!success) {
            throw new Error(response.error ?? 'Kernel dispatch failed.');
        }
    }

    public async terminate(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;
        this.emit('telemetry', {
            type: 'TELEMETRY',
            source: 'SYSTEM',
            status: 'OFFLINE',
            message: 'Kernel bridge released.',
            ts: Date.now(),
        });
    }

    public getStatus(): boolean {
        return this.isRunning;
    }

    /**
     * [Ω] Canonical intelligence bridge for Node-side callers.
     */
    public async requestIntelligence(payload: IntelligenceRequest): Promise<IntelligenceResponse> {
        return mimir.request({
            ...payload,
            caller: payload.caller ?? { source: 'node:corvus-process' },
        });
    }

    /**
     * Retrieves canonical intent intelligence for a specific sector.
     */
    public async requestSectorIntent(filePath: string): Promise<IntelligenceResponse> {
        return this.requestIntelligence({
            prompt: `What is the intent of sector: ${filePath}?`,
            caller: {
                source: 'node:corvus-process:intent',
                sector_path: filePath,
            },
        });
    }

    /**
     * Legacy gateway compatibility shim over the canonical intelligence bridge.
     */
    public async sampleMind(payload: { prompt: string; systemPrompt?: string; maxTokens?: number }): Promise<{ text: string }> {
        const response = await this.requestIntelligence({
            prompt: payload.prompt,
            system_prompt: payload.systemPrompt,
            caller: {
                source: 'node:corvus-process:sampleMind',
                workflow: 'gateway:mimir',
            },
            metadata: {
                max_tokens: payload.maxTokens,
            },
        });

        if (response.status !== 'success' || !response.raw_text) {
            throw new Error(response.error ?? 'The One Mind returned no intelligence.');
        }

        return { text: response.raw_text };
    }

    /**
     * Legacy gateway compatibility shim over the canonical intelligence bridge.
     */
    public async getWellIntent(filePath: string): Promise<string | null> {
        const response = await this.requestSectorIntent(filePath);
        if (response.status !== 'success') {
            throw new Error(response.error ?? `Intent retrieval for ${filePath} failed.`);
        }
        return response.raw_text ?? null;
    }
}
