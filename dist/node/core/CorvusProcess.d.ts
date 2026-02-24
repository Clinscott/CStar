import { EventEmitter } from 'events';
/**
 * [ODIN] Rigid Input Boundary Schema
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
    type?: 'TELEMETRY' | 'SYSTEM_RESTART' | 'HUD_STREAM';
    source?: string;
    message?: string;
    status?: string;
    data?: any;
    ts?: number;
}
export declare class CorvusProcess extends EventEmitter {
    private readonly entrypoint;
    private daemon;
    private isRunning;
    private restartCount;
    private readonly MAX_RESTARTS;
    private terminalPromptActive;
    constructor(entrypoint?: string);
    boot(): Promise<void>;
    private _spawn;
    private setupFaultTolerance;
    private attemptResurrection;
    /**
     * [AMENDMENT A] NDJSON Stream Fragmentation Protection
     * Uses native readline to buffer incoming chunks and only emit on \n boundaries.
     */
    private setupOutputBoundary;
    private routeOutput;
    /**
     * Injects rigid JSON payloads into standard input.
     */
    dispatchIntent(payload: IntentPayload): void;
    terminate(): Promise<void>;
    getStatus(): boolean;
}
