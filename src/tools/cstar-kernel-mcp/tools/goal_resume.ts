import type { McpRequestContext } from '../contracts/request_context.js';
import {
    mcpErrorCode,
    mcpMutation,
    preAuthorizationErrorResponse,
    textResponse,
} from '../contracts/responses.js';
import { recordHostGoalResume } from '../../pennyone/intel/goal_resume_controller.js';
import { requireString, resolveActiveRepo } from './shared.js';
import { verifyCurrentGoalResumeIntent } from './operator_intent_attestation.js';

const SHA256 = /^[a-f0-9]{64}$/i;
const MAX_IDENTIFIER_LENGTH = 240;

export interface GoalResumeArgs {
    repair_bead_id: string;
    continued_bead_id?: string;
    decision_id?: string;
    host_goal_objective_sha256: string;
    host_goal_snapshot_sha256: string;
    observed_host_status: 'blocked';
    host_resume_capability: 'unavailable';
}

function boundedIdentifier(value: string | undefined, name: string, required: true): string;
function boundedIdentifier(value: string | undefined, name: string, required: false): string | undefined;
function boundedIdentifier(value: string | undefined, name: string, required: boolean): string | undefined {
    const normalized = value?.trim();
    if (!normalized) {
        if (required) throw new Error(`${name} is required.`);
        return undefined;
    }
    if (normalized.length > MAX_IDENTIFIER_LENGTH || /[\u0000-\u001f\u007f]/.test(normalized)) {
        throw new Error(`goal_resume_${name}_invalid`);
    }
    return normalized;
}

function boundedHash(value: string | undefined, name: string): string {
    const normalized = requireString(value, name).trim().toLowerCase();
    if (!SHA256.test(normalized)) throw new Error(`goal_resume_${name}_invalid`);
    return normalized;
}

export async function handleGoalResume(
    args: GoalResumeArgs,
    requestContext?: McpRequestContext,
) {
    let intentVerified = false;
    try {
        const now = Date.now();
        const input = {
            repair_bead_id: boundedIdentifier(args.repair_bead_id, 'repair_bead_id', true),
            continued_bead_id: boundedIdentifier(args.continued_bead_id, 'continued_bead_id', false),
            decision_id: boundedIdentifier(args.decision_id, 'decision_id', false),
            host_goal_objective_sha256: boundedHash(
                args.host_goal_objective_sha256,
                'host_goal_objective_sha256',
            ),
            host_goal_snapshot_sha256: boundedHash(
                args.host_goal_snapshot_sha256,
                'host_goal_snapshot_sha256',
            ),
            observed_host_status: args.observed_host_status === 'blocked'
                ? 'blocked' as const
                : (() => { throw new Error('goal_resume_host_status_must_remain_blocked'); })(),
            host_resume_capability: args.host_resume_capability === 'unavailable'
                ? 'unavailable' as const
                : (() => { throw new Error('goal_resume_host_capability_must_be_unavailable'); })(),
        };
        const attestation = await verifyCurrentGoalResumeIntent(requestContext, now, {
            repair_bead_id: input.repair_bead_id,
            continued_bead_id: input.continued_bead_id,
            decision_id: input.decision_id,
        });
        intentVerified = true;
        const { root, repoId } = resolveActiveRepo();
        const recorded = recordHostGoalResume(input, attestation, root, repoId, now);

        return textResponse({
            status: recorded.status,
            action: 'record_goal_resume',
            mutation: mcpMutation(
                'hall_goal_resume_record',
                recorded.resume_id,
                'Continuity-only host goal resume evidence was persisted; the host goal status was not changed.',
            ),
            resume_id: recorded.resume_id,
            goal_ref: recorded.goal_ref,
            resume_generation: recorded.resume_generation,
            previous_resume_id: recorded.previous_resume_id ?? null,
            observed_host_status: 'blocked',
            host_status_mutated: false,
            authority_effect: 'continuity_only',
            operator_resume_ref: attestation.operator_resume_ref,
            repair_bead_id: input.repair_bead_id,
            continued_bead_id: input.continued_bead_id ?? null,
        });
    } catch (error) {
        if (!intentVerified) {
            return preAuthorizationErrorResponse(mcpErrorCode(error), error);
        }
        return textResponse({
            error: error instanceof Error ? error.message : String(error),
        }, true);
    }
}
