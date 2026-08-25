import type { McpRequestContext } from '../contracts/request_context.js';
import {
    cstarMissionCoordinatorSchema,
    type CstarMissionCoordinatorInput,
} from '../contracts/automatic_mission.js';
import { textResponse, type McpTextResponse } from '../contracts/responses.js';
import type {
    AutomaticMissionInput,
    AutomaticMissionOutcome,
} from '../../../types/automatic_mission.js';
import { AutomaticMissionController } from '../../pennyone/intel/automatic_mission_controller.js';
import { CODE_ROOT, CONTROL_ROOT } from '../contracts/runtime.js';

export const AUTOMATIC_MISSION_TOOL_NAME = 'cstar_mission' as const;
export const AUTOMATIC_MISSION_OUTCOME_SCHEMA = 'cstar.mission_outcome.v1' as const;

const DEFAULT_ADAPTER = {
    adapter_ref: 'cstar-host-dispatch',
    capability: 'state_only',
} as const;
const DEFAULT_CALLBACK = {
    callback_required: true,
    expected_packet: 'CSTAR_MISSION_RESULT',
} as const;

export interface AutomaticMissionCoordinatorDependencies {
    controller?: AutomaticMissionController;
    code_root?: string;
    control_root?: string;
}

function errorCode(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return /^[a-z][a-z0-9_]{2,127}/.exec(message)?.[0]
        ?? 'automatic_mission_internal_error';
}

function nextActionFor(result: Pick<AutomaticMissionOutcome, 'outcome' | 'state'>): string {
    if (result.outcome === 'ok' && result.state === 'DISPATCH_QUEUED') {
        return 'The host may claim the durable mission intent; CStar does not launch workers or providers, and delivery remains unverified.';
    }
    switch (result.outcome) {
        case 'ok':
            return 'Review the derived bounded mission; queue durable host work only when the explicit root-user authority permits it.';
        case 'needs_input':
            return 'Supply the missing bounded design, root-user record, or exact authority input, then retry the same intent.';
        case 'guardrail_block':
            return 'Correct the rejected scope, ceiling, identity, or authority input; no worker, provider, Forge authorization, or spend was performed.';
        case 'domain_terminal':
            return 'Inspect the terminal domain outcome and its receipt; do not retry or treat it as worker delivery or independent validation.';
        case 'transport_error':
            return 'Repair the bounded kernel transport or persistence boundary, then retry only with the same idempotency key after verification.';
        case 'internal_error':
            return 'Open a bounded kernel repair for the reported error before retrying the mission.';
    }
}

export function invalidAutomaticMissionContractResponse(
    issues: Array<{ path: readonly PropertyKey[] }>,
): McpTextResponse {
    return textResponse({
        schema: AUTOMATIC_MISSION_OUTCOME_SCHEMA,
        outcome: 'needs_input',
        kind: 'needs_input',
        status: 'needs_input',
        state: 'DRAFT',
        error_code: 'automatic_mission_contract_invalid',
        message: issues.map((issue) => issue.path.map(String).join('.') || 'input').join(', '),
        next_action: 'Supply one ordinary bounded objective and, when advancement is intended, its bounded design and exact root-user authority record.',
    });
}

function controllerFailureResponse(error: unknown): McpTextResponse {
    const code = errorCode(error);
    const outcome = /(?:root|control|database|transport)/.test(code)
        ? 'transport_error'
        : 'internal_error';
    const message = error instanceof Error ? error.message : String(error);
    return textResponse({
        schema: AUTOMATIC_MISSION_OUTCOME_SCHEMA,
        outcome,
        kind: outcome,
        status: outcome,
        state: 'DRAFT',
        error_code: code,
        message,
        next_action: nextActionFor({ outcome, state: 'DRAFT' }),
    });
}

function publicDefaults(input: CstarMissionCoordinatorInput): AutomaticMissionInput {
    const design = input.design;
    if (design === undefined || design === null) return input;

    const designObject = typeof design === 'string' ? { description: design } : design;
    const rootRecord = input.root_user_record ?? input.root_user_records?.[0];
    return {
        ...input,
        design: {
            ...designObject,
            adapter: designObject.adapter ?? DEFAULT_ADAPTER,
            callback: designObject.callback ?? {
                ...DEFAULT_CALLBACK,
                ...(rootRecord?.thread_id ? { callback_thread_id: rootRecord.thread_id } : {}),
            },
        },
    };
}

export function runAutomaticMissionController(
    input: AutomaticMissionInput,
    dependencies: AutomaticMissionCoordinatorDependencies = {},
): McpTextResponse {
    try {
        const controller = dependencies.controller ?? new AutomaticMissionController({
            code_root: dependencies.code_root ?? CODE_ROOT,
            control_root: dependencies.control_root ?? CONTROL_ROOT,
        });
        const result = controller.ingest(input, {
            action: input.action,
            queue_dispatch: input.queue_dispatch,
        });
        return textResponse({
            schema: AUTOMATIC_MISSION_OUTCOME_SCHEMA,
            ...result,
            next_action: result.next_action ?? nextActionFor(result),
        });
    } catch (error) {
        return controllerFailureResponse(error);
    }
}

/** Public compatibility-first mission coordinator facade. */
export async function handleCstarMission(
    args: unknown,
    _requestContext?: McpRequestContext,
    dependencies: AutomaticMissionCoordinatorDependencies = {},
): Promise<McpTextResponse> {
    const parsed = cstarMissionCoordinatorSchema.safeParse(args);
    if (!parsed.success) return invalidAutomaticMissionContractResponse(parsed.error.issues);
    return runAutomaticMissionController(publicDefaults(parsed.data), dependencies);
}

export const handlePublicMissionCoordinator = handleCstarMission;
export const handleMissionCoordinator = handleCstarMission;

export type CstarMissionCoordinatorToolInput = CstarMissionCoordinatorInput;
