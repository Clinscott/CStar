import { IntentPayload, CorvusProcess } from './CorvusProcess.js';
/**
 * [TIERED BRAIN] Cognitive Router
 * Bridges the gap between local zero-cost inference (Ollama) and the heavy-lift Python core.
 */
export declare class CognitiveRouter {
    private static instance;
    private readonly OLLAMA_URL;
    private readonly LOCAL_MODEL;
    private constructor();
    static getInstance(): CognitiveRouter;
    /**
     * [Ω] Orchestration Entrypoint
     * Routes intents based on the 'requires_core' flag in system_meta.
     */
    routeIntent(payload: IntentPayload, corvus: CorvusProcess): Promise<void>;
    /**
     * Tier 1: The Edge (Ollama native REST)
     * Hardcoded to llama3.1 for current Windows hardware stopgap.
     */
    private routeToOllama;
}
