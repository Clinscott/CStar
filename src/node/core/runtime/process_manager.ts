import { RETIRED_ORCHESTRATOR_RUNTIME_ERROR } from './reaper.js';


export const deps = Object.freeze({ processEffectsEnabled: false as const });


export class OrchestratorProcessManager {
    public registerGroup(pgid: number): never {
        void pgid;
        throw new Error(RETIRED_ORCHESTRATOR_RUNTIME_ERROR);
    }

    public unregisterGroup(pgid: number): never {
        void pgid;
        throw new Error(RETIRED_ORCHESTRATOR_RUNTIME_ERROR);
    }

    public async reapGroup(pgid: number): Promise<never> {
        void pgid;
        throw new Error(RETIRED_ORCHESTRATOR_RUNTIME_ERROR);
    }

    public async reapAll(): Promise<never> {
        throw new Error(RETIRED_ORCHESTRATOR_RUNTIME_ERROR);
    }
}
