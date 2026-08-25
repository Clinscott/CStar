import { RETIRED_ORCHESTRATOR_RUNTIME_ERROR } from './reaper.js';


export const deps = Object.freeze({ lifecycleAuthority: 'cstar-kernel' as const });


export class OrchestratorTelemetryBridge {
    constructor(projectRoot: string) {
        void projectRoot;
    }

    public async pulse(beadId: string): Promise<never> {
        void beadId;
        throw new Error(RETIRED_ORCHESTRATOR_RUNTIME_ERROR);
    }

    public async recordExecution(
        beadId: string,
        outcome: { status: string; exit_code?: number; duration_ms?: number },
    ): Promise<never> {
        void beadId;
        void outcome;
        throw new Error(RETIRED_ORCHESTRATOR_RUNTIME_ERROR);
    }
}
