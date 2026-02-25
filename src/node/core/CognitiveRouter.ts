import { IntentPayload, CorvusProcess } from './CorvusProcess.js';
import { EventManager } from './EventManager.js';

/**
 * [TIERED BRAIN] Cognitive Router
 * Bridges the gap between local zero-cost inference (Ollama) and the heavy-lift Python core.
 */
export class CognitiveRouter {
    private static instance: CognitiveRouter;
    private readonly OLLAMA_URL = 'http://127.0.0.1:11434/api/generate';
    private readonly LOCAL_MODEL = 'llama3.1';

    private constructor() { }

    public static getInstance(): CognitiveRouter {
        if (!CognitiveRouter.instance) {
            CognitiveRouter.instance = new CognitiveRouter();
        }
        return CognitiveRouter.instance;
    }

    /**
     * [Ω] Orchestration Entrypoint
     * Routes intents based on the 'requires_core' flag in system_meta.
     */
    public async routeIntent(payload: IntentPayload, corvus: CorvusProcess): Promise<void> {
        const appId = payload.system_meta?.app_id || 'unknown';
        const requiresCore = payload.system_meta?.requires_core === true;

        if (requiresCore) {
            console.log(`[CognitiveRouter] Escalating ${payload.intent_normalized} to Gungnir Matrix (Core)...`);
            corvus.dispatchIntent(payload);
        } else {
            console.log(`[CognitiveRouter] Routing ${payload.intent_normalized} to Ollama (Edge)...`);
            await this.routeToOllama(payload, appId);
        }
    }

    /**
     * Tier 1: The Edge (Ollama native REST)
     * Hardcoded to llama3.1 for current Windows hardware stopgap.
     */
    private async routeToOllama(payload: IntentPayload, appId: string): Promise<void> {
        const eventManager = EventManager.getInstance();

        try {
            const response = await fetch(this.OLLAMA_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.LOCAL_MODEL,
                    prompt: payload.intent_raw,
                    format: 'json',
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.statusText}`);
            }

            const result = await response.json();

            // Broadcast successful inference back to Spoke
            eventManager.broadcast(appId, {
                type: 'INFERENCE_RESULT',
                intent: payload.intent_normalized,
                response: result.response,
                source: 'ollama'
            });

        } catch (err: any) {
            console.error(`[CognitiveRouter] Ollama Routing Failed: ${err.message}`);

            // Emit TELEMETRY error for graceful degradation in Spoke UI
            eventManager.broadcast(appId, {
                type: 'TELEMETRY',
                source: 'CognitiveRouter',
                status: 'ERROR',
                message: `Edge Inference Offline: ${err.message}`,
                ts: Date.now()
            });
        }
    }
}
