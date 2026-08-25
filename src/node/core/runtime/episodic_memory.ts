import type { RuntimeContext, RuntimeDispatchPort, WeaveResult } from './contracts.js';
import { RETIRED_ORCHESTRATOR_RUNTIME_ERROR } from './reaper.js';


export interface ReadyForReviewMemoryRequest {
    bead_id: string;
    bead_intent: string;
    project_root: string;
    cwd: string;
    target_paths?: string[];
    context: RuntimeContext;
    dispatchPort?: RuntimeDispatchPort;
    session_id?: string;
    target_domain?: RuntimeContext['target_domain'];
    spoke?: string;
}


export const episodicMemoryDeps = Object.freeze({ lifecycleAuthority: 'cstar-kernel' as const });


export async function engraveReadyForReviewMemory(
    request: ReadyForReviewMemoryRequest,
): Promise<WeaveResult> {
    void request;
    throw new Error(RETIRED_ORCHESTRATOR_RUNTIME_ERROR);
}
