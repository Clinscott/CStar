import type { HallOneMindRequestRecord } from '../../../../types/hall.js';
import { RETIRED_ORCHESTRATOR_RUNTIME_ERROR } from '../reaper.js';


export async function reconcileDelegatedWorkflowRequest(
    rootPath: string,
    request: HallOneMindRequestRecord,
    env: NodeJS.ProcessEnv = process.env,
): Promise<never> {
    void rootPath;
    void request;
    void env;
    throw new Error(RETIRED_ORCHESTRATOR_RUNTIME_ERROR);
}
