import { failRetiredGateway } from '../retired_gateway.js';

export type IntentExecutionRoute = 'kernel' | 'local';

export interface IntentSystemMeta {
    app_id?: string;
    execution_route: IntentExecutionRoute;
    provider?: 'ollama';
    model?: string;
}

export interface IntentPayload {
    system_meta: IntentSystemMeta;
    intent_raw: string;
    intent_normalized: string;
    target_workflow: string;
    extracted_entities?: Record<string, unknown>;
}

export interface DaemonTelemetry {
    type?: 'TELEMETRY' | 'SYSTEM_RESTART' | 'HUD_STREAM' | 'TRACE' | 'FLARE';
    source?: string;
    message?: string;
    status?: string;
    data?: unknown;
    ts?: number;
}

export type IntentDispatchExecutor = (payload: IntentPayload) => Promise<unknown>;

/** Retired gateway supervisor. Construction never reaches a callback or bridge. */
export class CorvusProcess {
    constructor(..._args: unknown[]) {
        failRetiredGateway();
    }

    public async boot(): Promise<never> { return failRetiredGateway(); }
    public async dispatchIntent(_payload: IntentPayload): Promise<never> { return failRetiredGateway(); }
    public async terminate(): Promise<never> { return failRetiredGateway(); }
    public getStatus(): never { return failRetiredGateway(); }
    public async requestIntelligence(_payload: unknown): Promise<never> { return failRetiredGateway(); }
    public async requestSectorIntent(_filePath: string): Promise<never> { return failRetiredGateway(); }
    public async sampleMind(_payload: unknown): Promise<never> { return failRetiredGateway(); }
    public async getWellIntent(_filePath: string): Promise<never> { return failRetiredGateway(); }
}
