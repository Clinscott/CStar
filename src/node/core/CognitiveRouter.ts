import { failRetiredGateway } from '../retired_gateway.js';
import type { IntentPayload, CorvusProcess } from './CorvusProcess.js';

/** Retired provider/kernel intent router. */
export class CognitiveRouter {
    private constructor() {
        failRetiredGateway();
    }

    public static getInstance(): CognitiveRouter {
        return failRetiredGateway();
    }

    public async routeIntent(_payload: IntentPayload, _corvus: CorvusProcess): Promise<never> {
        return failRetiredGateway();
    }
}
