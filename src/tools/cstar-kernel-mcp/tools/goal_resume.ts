import type { McpRequestContext } from '../contracts/request_context.js';
import {
    mcpErrorCode,
    mcpMutation,
    preAuthorizationErrorResponse,
    textResponse,
} from '../contracts/responses.js';
import {
    canonicalizeGoalResumeV2Args,
    type GoalResumeV2Args,
} from '../../pennyone/intel/goal_resume_v2_contract.js';
import {
    canonicalizeHostGoalSnapshot,
    type HostGoalSnapshotInput,
} from '../../pennyone/intel/host_goal_snapshot.js';
import { recordHostGoalResume } from '../../pennyone/intel/goal_resume_controller.js';
import { prepareGoalResumeV2Authority } from '../../pennyone/intel/goal_resume_v2_authority.js';
import { recordGoalResumeV2 } from '../../pennyone/intel/goal_resume_v2_persistence.js';
import { verifyCodexRequestIdentity } from './operator_authorization.js';
import { verifyCurrentGoalResumeIntent } from './operator_intent_attestation.js';
import { requireString, resolveActiveRepo } from './shared.js';

const SHA256 = /^[a-f0-9]{64}$/i;
const MAX_IDENTIFIER_LENGTH = 240;

interface HistoricalGoalResumeArgs {
    repair_bead_id: string;
    continued_bead_id?: string;
    decision_id?: string;
    host_goal_objective_sha256?: string;
    host_goal_snapshot_sha256?: string;
    host_goal_snapshot?: HostGoalSnapshotInput;
    observed_host_status: 'blocked';
    host_resume_capability: 'unavailable';
}

export type GoalResumeArgs = GoalResumeV2Args | HistoricalGoalResumeArgs;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isHistoricalGoalResumeArgs(value: unknown): value is HistoricalGoalResumeArgs {
    if (!isRecord(value) || 'forge_request_receipt_id' in value || 'host_goal_projection' in value) {
        return false;
    }
    return 'repair_bead_id' in value || 'host_goal_snapshot' in value || 'observed_host_status' in value;
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

function optionalBoundedHash(value: string | undefined, name: string): string | undefined {
    return value === undefined ? undefined : boundedHash(value, name);
}

async function handleHistoricalGoalResume(
    args: HistoricalGoalResumeArgs,
    requestContext: McpRequestContext | undefined,
) {
    let intentVerified = false;
    try {
        const now = Date.now();
        const snapshot = canonicalizeHostGoalSnapshot(
            args.host_goal_snapshot,
            optionalBoundedHash(args.host_goal_objective_sha256, 'host_goal_objective_sha256'),
            optionalBoundedHash(args.host_goal_snapshot_sha256, 'host_goal_snapshot_sha256'),
        );
        const input = {
            repair_bead_id: boundedIdentifier(args.repair_bead_id, 'repair_bead_id', true),
            continued_bead_id: boundedIdentifier(args.continued_bead_id, 'continued_bead_id', false),
            decision_id: boundedIdentifier(args.decision_id, 'decision_id', false),
            host_goal_objective_sha256: snapshot.objectiveSha256,
            host_goal_snapshot_sha256: snapshot.snapshotSha256,
            host_goal_snapshot: snapshot.material,
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
                'hall_goal_resume_record', recorded.resume_id,
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
            host_goal_thread_id: input.host_goal_snapshot.host_goal_thread_id,
            host_goal_objective_sha256: input.host_goal_objective_sha256,
            host_goal_snapshot_sha256: input.host_goal_snapshot_sha256,
            repair_bead_id: input.repair_bead_id,
            continued_bead_id: input.continued_bead_id ?? null,
        });
    } catch (error) {
        return intentVerified
            ? textResponse({ error: error instanceof Error ? error.message : String(error) }, true)
            : preAuthorizationErrorResponse(mcpErrorCode(error), error);
    }
}

export async function handleGoalResume(
    args: GoalResumeArgs,
    requestContext?: McpRequestContext,
) {
    if (isHistoricalGoalResumeArgs(args)) {
        return handleHistoricalGoalResume(args, requestContext);
    }
    let identityVerified = false;
    try {
        const input = canonicalizeGoalResumeV2Args(args);
        const identity = await verifyCodexRequestIdentity(requestContext);
        identityVerified = true;
        const { root, repoId } = resolveActiveRepo();
        const authority = prepareGoalResumeV2Authority({
            root,
            repo_id: repoId,
            request_id: input.request_id,
            request_sha256: input.request_sha256,
            projection: input.projection,
            identity,
        });
        const recorded = recordGoalResumeV2(authority, root, repoId);
        return textResponse({
            status: recorded.status,
            action: 'record_goal_resume_v2',
            mutation: recorded.status === 'recorded'
                ? mcpMutation(
                    'hall_goal_resume_record', recorded.resume_id,
                    'Continuity-only host goal resume v2 evidence was persisted; the host goal status was not changed.',
                )
                : null,
            resume_id: recorded.resume_id,
            goal_ref: recorded.goal_ref,
            resume_generation: recorded.resume_generation,
            previous_resume_id: recorded.previous_resume_id,
            forge_request_receipt_id: authority.request.request_id,
            request_sha256: authority.request.request_sha256,
            request_bead_id: authority.request.bead_id,
            decision_id: authority.request.decision_id,
            host_goal_thread_id: authority.projection.host_goal_thread_id,
            host_goal_objective_sha256: authority.projection.host_goal_objective_sha256,
            host_goal_snapshot_sha256: authority.projection.host_goal_snapshot_sha256,
            host_goal_status: 'blocked',
            host_resume_capability: 'unavailable',
            host_status_mutated: false,
            authority_effect: 'continuity_only',
            operator_resume_ref: authority.operator_resume_ref,
        });
    } catch (error) {
        return identityVerified
            ? textResponse({ error: error instanceof Error ? error.message : String(error) }, true)
            : preAuthorizationErrorResponse(mcpErrorCode(error), error);
    }
}
