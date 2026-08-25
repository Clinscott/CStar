import type { McpRequestContext } from '../contracts/request_context.js';
import {
    automaticMissionSchema,
    type AutomaticMissionContractInput,
} from '../contracts/automatic_mission.js';
import type { McpTextResponse } from '../contracts/responses.js';
import type { AutomaticMissionInput } from '../../../types/automatic_mission.js';
import {
    invalidAutomaticMissionContractResponse,
    runAutomaticMissionController,
} from './automatic_mission_coordinator.js';

/** Internal cstar_mission compatibility ingress; it records deterministic state only. */
export async function handleAutomaticMission(
    args: unknown,
    _requestContext?: McpRequestContext,
): Promise<McpTextResponse> {
    const parsed = automaticMissionSchema.safeParse(args);
    if (!parsed.success) return invalidAutomaticMissionContractResponse(parsed.error.issues);
    return runAutomaticMissionController(parsed.data as AutomaticMissionInput);
}

export const handleMissionIngress = handleAutomaticMission;

export {
    AUTOMATIC_MISSION_TOOL_NAME,
    AUTOMATIC_MISSION_OUTCOME_SCHEMA,
    handleCstarMission,
    handlePublicMissionCoordinator,
    handleMissionCoordinator,
} from './automatic_mission_coordinator.js';

export type AutomaticMissionToolInput = AutomaticMissionContractInput;
export type { CstarMissionCoordinatorToolInput } from './automatic_mission_coordinator.js';
