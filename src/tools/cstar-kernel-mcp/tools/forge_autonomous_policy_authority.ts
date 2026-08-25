import path from 'node:path';
import type Database from 'better-sqlite3';

import type {
    HallForgeAuthorizationRecord,
    HallForgeMissionGrantRecord,
    HallForgeRequestRecord,
    MaterializeForgeMissionGrantInput,
} from '../../../types/forge.js';
import {
    forgeAuthorizationLineageMatchesRequest,
} from '../../pennyone/intel/forge_receipt_controller.js';
import { revokeForgeMissionGrant } from '../../pennyone/intel/forge_mission_grant_controller.js';
import { AUTONOMOUS_DISPATCH_POLICY_PROFILE } from
    '../../pennyone/intel/forge_authorization_policy.js';
import {
    assertAutonomousDispatchPolicyGrantLineage,
    assertAutonomousDispatchPolicyRequestScope,
    isAutonomousDispatchPolicyCandidate,
    resolveAutonomousDispatchPolicyBinding,
    type AutonomousDispatchPolicyBinding,
} from './forge_autonomous_policy_contract.js';
import {
    readForgeAutonomousPolicySignal,
    type ForgeAutonomousPolicySignal,
} from './forge_autonomous_policy_signal.js';
import type { ParsedCodexTurnMetadata } from './operator_authorization.js';
import { stableJson } from './forge_request_contract.js';

export type AutonomousPolicyCaller = Pick<ParsedCodexTurnMetadata, 'thread_id' | 'turn_id'>;

function grantInput(
    binding: AutonomousDispatchPolicyBinding,
    signal: ForgeAutonomousPolicySignal,
): MaterializeForgeMissionGrantInput {
    const template = binding.child.template;
    return {
        repo_id: binding.parent.repo_id,
        mission_decision_id: binding.child.decision_id,
        root_bead_id: binding.parent.bead_id,
        allowed_child_lineage: [binding.child.bead_id],
        root_thread_id: signal.thread_id,
        set_turn_id: signal.turn_id,
        set_record_sha256: signal.record_sha256,
        set_record_set_sha256: signal.record_set_sha256,
        set_record_count: signal.record_count,
        design_sha256: binding.parent.policy_sha256,
        allowed_targets: binding.child.target_paths.map((target) =>
            path.resolve(binding.parent.code_root, target)),
        allowed_outputs: template.required_output_paths.map((target) =>
            path.resolve(binding.parent.code_root, target)),
        allowed_actions: [...template.requested_actions],
        prohibited_actions: [...binding.parent.prohibited_actions],
        adapter_ref: binding.child.adapter_ref,
        write_capability: binding.child.write_capability,
        total_provider_attempt_ceiling: 1,
        retry_derived_iteration_ceiling: 0,
        paid_attempt_ceiling: 1,
        authorization_profile: AUTONOMOUS_DISPATCH_POLICY_PROFILE,
        policy_provider_attempt_ceiling: binding.parent.provider_attempt_ceiling,
        authorized_at: signal.authorized_at,
        expires_at: signal.expires_at,
    };
}

function grantMatches(
    grant: HallForgeMissionGrantRecord,
    input: MaterializeForgeMissionGrantInput,
): boolean {
    return grant.repo_id === input.repo_id
        && grant.mission_decision_id === input.mission_decision_id
        && grant.root_bead_id === input.root_bead_id
        && grant.allowed_child_lineage_json === stableJson(input.allowed_child_lineage)
        && grant.root_thread_id === input.root_thread_id && grant.set_turn_id === input.set_turn_id
        && grant.set_record_sha256 === input.set_record_sha256
        && grant.set_record_set_sha256 === input.set_record_set_sha256
        && grant.set_record_count === input.set_record_count
        && grant.design_sha256 === input.design_sha256
        && grant.allowed_targets_json === stableJson([...input.allowed_targets].sort())
        && grant.allowed_outputs_json === stableJson([...input.allowed_outputs].sort())
        && grant.allowed_actions_json === stableJson([...input.allowed_actions].sort())
        && grant.prohibited_actions_json === stableJson([...input.prohibited_actions].sort())
        && grant.adapter_ref === input.adapter_ref && grant.write_capability === input.write_capability
        && grant.total_provider_attempt_ceiling === 1 && grant.retry_derived_iteration_ceiling === 0
        && grant.paid_attempt_ceiling === 1 && grant.authorized_at === input.authorized_at
        && grant.expires_at === input.expires_at;
}

export function isForgeAutonomousPolicyCandidate(
    db: Database.Database,
    request: HallForgeRequestRecord,
): boolean {
    return isAutonomousDispatchPolicyCandidate(db, request);
}

export function verifyPendingForgeAutonomousPolicyAuthority(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    caller: AutonomousPolicyCaller;
    now?: number;
}): { binding: AutonomousDispatchPolicyBinding; grant: MaterializeForgeMissionGrantInput } {
    const binding = resolveAutonomousDispatchPolicyBinding(args.db, args.request, args.now);
    const signal = readForgeAutonomousPolicySignal(binding, args.now);
    if (args.caller.thread_id !== signal.thread_id || args.request.status !== 'PENDING_AUTH'
        || args.request.active_attempt_id || args.request.authorized_at || args.request.expires_at) {
        throw new Error('forge_autonomous_policy_pending_authority_invalid');
    }
    assertAutonomousDispatchPolicyRequestScope(binding, args.request);
    return { binding, grant: grantInput(binding, signal) };
}

export function verifyPersistedForgeAutonomousPolicyAuthority(args: {
    db: Database.Database;
    request: HallForgeRequestRecord;
    authorization: HallForgeAuthorizationRecord;
    grant: HallForgeMissionGrantRecord;
    caller: AutonomousPolicyCaller;
    now?: number;
}): void {
    let binding: AutonomousDispatchPolicyBinding;
    try {
        binding = assertAutonomousDispatchPolicyGrantLineage(args.db, args.grant, args.request)!;
        if (!binding) throw new Error('forge_autonomous_policy_grant_missing');
        const signal = readForgeAutonomousPolicySignal(binding, args.now);
        const input = grantInput(binding, signal);
        if (args.caller.thread_id !== signal.thread_id || !grantMatches(args.grant, input)
            || !forgeAuthorizationLineageMatchesRequest(args.request, args.authorization)
            || args.authorization.authorization_profile !== AUTONOMOUS_DISPATCH_POLICY_PROFILE
            || !args.authorization.operator_authorization_ref.startsWith('cstar-forge-mission-grant:')
            || args.authorization.operator_thread_id !== signal.thread_id
            || args.authorization.operator_turn_id !== signal.turn_id
            || args.authorization.operator_record_sha256 !== signal.record_sha256
            || args.authorization.operator_record_set_sha256 !== signal.record_set_sha256
            || args.authorization.operator_record_count !== signal.record_count
            || args.authorization.authorized_at !== signal.authorized_at
            || args.authorization.expires_at !== signal.expires_at) {
            throw new Error('forge_autonomous_policy_persisted_authority_invalid');
        }
    } catch (error) {
        if (error instanceof Error && error.message === 'forge_autonomous_policy_revoked') {
            revokeForgeMissionGrant(args.db, args.grant.mission_grant_id, error.message, args.now);
        }
        throw error;
    }
}
