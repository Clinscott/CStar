import type { McpRequestContext } from '../contracts/request_context.js';
import {
    automaticMissionSchema,
    type AutomaticMissionContractInput,
} from '../contracts/automatic_mission.js';
import { errorResponse, textResponse, type McpTextResponse } from '../contracts/responses.js';
import type { AutomaticMissionInput } from '../../../types/automatic_mission.js';
import { ingestAutomaticMission } from '../../pennyone/intel/automatic_mission_controller.js';

export const AUTOMATIC_MISSION_TOOL_NAME = 'cstar_mission' as const;
export const AUTOMATIC_MISSION_OUTCOME_SCHEMA = 'cstar.mission_outcome.v1' as const;

/**
 * Internal cstar_mission ingress.  It records deterministic state only.
 * Host dispatch, provider calls, and worker launches belong to later lanes.
 */
export async function handleAutomaticMission(
    args: unknown,
    _requestContext?: McpRequestContext,
): Promise<McpTextResponse> {
    const parsed = automaticMissionSchema.safeParse(args);
    if (!parsed.success) {
        return textResponse({
            schema: AUTOMATIC_MISSION_OUTCOME_SCHEMA,
            outcome: 'needs_input',
            kind: 'needs_input',
            status: 'needs_input',
            state: 'DRAFT',
            error_code: 'automatic_mission_contract_invalid',
            message: parsed.error.issues.map((issue) => issue.path.join('.') || 'input').join(', '),
            next_action: 'Supply one ordinary objective and, when dispatch is intended, a bounded design and SET grant.',
        });
    }
    try {
        const result = ingestAutomaticMission(
            parsed.data as AutomaticMissionInput,
            { action: parsed.data.action, queue_dispatch: parsed.data.queue_dispatch },
        );
        return textResponse({ schema: AUTOMATIC_MISSION_OUTCOME_SCHEMA, ...result },
            result.outcome === 'transport_error' || result.outcome === 'internal_error');
    } catch (error) {
        return errorResponse(error);
    }
}

export const handleCstarMission = handleAutomaticMission;
export const handleMissionIngress = handleAutomaticMission;

export type AutomaticMissionToolInput = AutomaticMissionContractInput;
