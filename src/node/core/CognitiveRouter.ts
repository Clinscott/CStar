import type { IntentPayload, CorvusProcess } from './CorvusProcess.js';

/**
 * Fail-closed tombstone for the former Ollama/Python intent execution router.
 * Use `cstar_intent_route` for advisory classification and the durable CStar
 * lifecycle for any mutation or implementation.
 */
export class CognitiveRouter {
    private static instance: CognitiveRouter;

    private constructor() {}

    public static getInstance(): CognitiveRouter {
        if (!CognitiveRouter.instance) {
            CognitiveRouter.instance = new CognitiveRouter();
        }
        return CognitiveRouter.instance;
    }

    public async routeIntent(payload: IntentPayload, corvus: CorvusProcess): Promise<void> {
        void payload;
        void corvus;
        throw new Error(
            'cognitive_router_permanently_decommissioned: use cstar_intent_route and the authorized CStar execution lifecycle',
        );
    }
}
