import type { SovereignBead } from '../../../types/bead.js';
import { RETIRED_ORCHESTRATOR_RUNTIME_ERROR } from './reaper.js';


export class OrchestratorScheduler {
    constructor(projectRoot: string) {
        void projectRoot;
    }

    public async reclaimZombies(): Promise<never> {
        throw new Error(RETIRED_ORCHESTRATOR_RUNTIME_ERROR);
    }

    public async getNextBatch(limit: number): Promise<SovereignBead[]> {
        void limit;
        throw new Error(RETIRED_ORCHESTRATOR_RUNTIME_ERROR);
    }
}
