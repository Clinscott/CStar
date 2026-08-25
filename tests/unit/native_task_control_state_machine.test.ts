import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { NATIVE_TASK_CONTROL_ERROR_CODES } from '../../src/core/native_task_control/errors.js';
import { createGoalGeneration, createControllerLease, createTaskControlEvent, hashRoleManifest } from '../../src/core/native_task_control/receipts.js';
import { policyHash } from '../../src/core/native_task_control/policy.js';
import { applyTaskControlEvent, createNativeTaskControlState, nativeCancelCallCount } from '../../src/core/native_task_control/state_machine.js';
import type { NativePolicy, NativeRoleManifest, NativeStateMachineInput, NativeTaskControlEvent, NativeTaskControlState } from '../../src/types/native_task_control.js';

const digest = (char: string): string => char.repeat(64);

function basePolicy(): NativePolicy {
    return {
        schema: 'cstar.native_policy.v1',
        policy_id: 'oe-root-policy',
        depth: 0,
        budgets: { model_requests: 10, tool_calls: 20 },
        maxima: { descendants: 0, waits: 1 },
        allowlists: { task_kinds: ['work'], blocked_items: [] },
        prohibitions: ['forge', 'network'],
        requirements: ['single_controller', 'fresh_goal'],
        effect_permissions: { safe: true, protected: false },
    };
}

function seed(): NativeTaskControlState {
    const policy = basePolicy();
    const manifest: NativeRoleManifest = {
        schema: 'cstar.native_role_manifest.v1',
        manifest_id: 'manifest-01', root_id: 'root-01', bead_id: 'bead-01', set_id: 'set-01', phase_id: 'phase-01',
        slots: [
            { role_slot_id: 'controller', role: 'controller', persistent: true, owner: 'sol', allowed_task_kinds: ['work'], replacement_budget: 1, policy },
            { role_slot_id: 'successor', role: 'worker', persistent: true, owner: 'luna', allowed_task_kinds: ['work'], replacement_budget: 1, policy },
        ], max_persistent_role_slots: 8, max_total_role_slots: 8,
    };
    const roleHash = hashRoleManifest(manifest);
    const effectiveHash = policyHash(policy);
    const goal = createGoalGeneration({
        goal_id: 'goal-01', root_id: 'root-01', bead_id: 'bead-01', set_id: 'set-01', phase_id: 'phase-01',
        logical_item: 'item-01', partition: 'partition-01', generation: 1, goal: { objective: 'synthetic native control' },
        work_package_sha256: digest('b'), role_manifest_sha256: roleHash, effective_policy_sha256: effectiveHash,
    });
    const lease = createControllerLease({
        lease_id: 'lease-01', root_id: 'root-01', goal_id: goal.goal_id, goal_generation: 1,
        controller_generation: 1, role_slot_id: 'controller', occupant_id: 'sol-01', occupant_generation: 1,
        status: 'ACTIVE', previous_lease_sha256: null,
    });
    const input: NativeStateMachineInput = {
        identity: {
            root_id: goal.root_id, bead_id: goal.bead_id, set_id: goal.set_id, phase_id: goal.phase_id,
            logical_item: goal.logical_item, partition: goal.partition, goal_generation: goal.generation,
            controller_generation: 1, occupant_generation: 1, work_package_sha256: goal.work_package_sha256,
        }, goal, manifest, policy, lease,
    };
    return createNativeTaskControlState(input);
}

function event(state: NativeTaskControlState, kind: NativeTaskControlEvent['event_kind'], extra: Partial<NativeTaskControlEvent> = {}): NativeTaskControlEvent {
    const input = {
        event_id: `${kind.toLowerCase()}-${state.event_log.length + 1}`,
        event_kind: kind, root_id: state.identity.root_id, bead_id: state.identity.bead_id, set_id: state.identity.set_id,
        phase_id: state.identity.phase_id, logical_item: state.identity.logical_item, partition: state.identity.partition,
        goal_generation: state.goal.generation, controller_generation: state.lease.controller_generation,
        occupant_generation: state.lease.occupant_generation, role_slot_id: state.lease.role_slot_id,
        occupant_id: state.lease.occupant_id, event_sequence: state.event_log.length + 1,
        previous_event_sha256: state.last_event_sha256, task_logical_id: 'task-01', task_kind: 'work', ...extra,
    } as Partial<NativeTaskControlEvent>;
    if (input.task_logical_id === undefined) delete input.task_logical_id;
    if (input.task_kind === undefined) delete input.task_kind;
    return createTaskControlEvent(input as Omit<NativeTaskControlEvent, 'schema' | 'event_sha256'>);
}

function code(transition: ReturnType<typeof applyTaskControlEvent>, expected: string): void {
    assert.equal(transition.accepted, false);
    assert.equal(transition.error_code, expected);
    assert.equal(transition.state.breaker.state, 'OPEN');
}

describe('native task-control state machine', () => {
    it('TC01 cancel sets one barrier and accepts exactly one terminal acknowledgement', () => {
        let state = seed();
        let transition = applyTaskControlEvent(state, event(state, 'CANCEL'));
        assert.equal(transition.accepted, true); state = transition.state;
        transition = applyTaskControlEvent(state, event(state, 'CANCEL_ACK'));
        assert.equal(transition.accepted, true); state = transition.state;
        assert.equal(state.status, 'TERMINAL');
        assert.equal(nativeCancelCallCount(state), 1);
        code(applyTaskControlEvent(state, event(state, 'START')), NATIVE_TASK_CONTROL_ERROR_CODES.TERMINAL_BARRIER);
    });

    it('TC02 revoke accepts REVOKED and TC03 missing acknowledgement fences later work', () => {
        let state = seed();
        let transition = applyTaskControlEvent(state, event(state, 'REVOKE'));
        assert.equal(transition.accepted, true); state = transition.state;
        transition = applyTaskControlEvent(state, event(state, 'REVOKED'));
        assert.equal(transition.accepted, true); assert.equal(transition.state.status, 'TERMINAL');

        state = seed();
        transition = applyTaskControlEvent(state, event(state, 'CANCEL')); state = transition.state;
        code(applyTaskControlEvent(state, event(state, 'START')), NATIVE_TASK_CONTROL_ERROR_CODES.CANCEL_ACK_MISSING);
    });

    it('TC04 rejects stale controller and TC05 competing lease attempts', () => {
        const state = seed();
        code(applyTaskControlEvent(state, event(state, 'START', { controller_generation: 2 })), NATIVE_TASK_CONTROL_ERROR_CODES.STALE_CONTROLLER);
        code(applyTaskControlEvent(state, event(state, 'START', { occupant_id: 'other-lease' })), NATIVE_TASK_CONTROL_ERROR_CODES.COMPETING_LEASE);
    });

    it('TC06 and TC07 enforce two-phase succession with an exact active-task binding', () => {
        let state = seed();
        let transition = applyTaskControlEvent(state, event(state, 'SUCCESSION_PREPARE', { task_logical_id: undefined, payload: { active_task_ids: [], last_event_sha256: null } }));
        assert.equal(transition.accepted, true); state = transition.state;
        code(applyTaskControlEvent(state, event(state, 'SUCCESSION_PREPARE', { task_logical_id: undefined, payload: { active_task_ids: [], last_event_sha256: transition.state.succession?.last_event_sha256 ?? null } })), NATIVE_TASK_CONTROL_ERROR_CODES.SUCCESSION_OVERLAP);

        state = seed();
        code(applyTaskControlEvent(state, event(state, 'SUCCESSION_PREPARE', { task_logical_id: undefined, payload: {} })), NATIVE_TASK_CONTROL_ERROR_CODES.SUCCESSION_AMBIGUOUS);
    });

    it('TC08 opens the breaker before dispatch on an unchanged-generation loop', () => {
        let state = seed();
        let transition = applyTaskControlEvent(state, event(state, 'START')); assert.equal(transition.accepted, true); state = transition.state;
        transition = applyTaskControlEvent(state, event(state, 'COMPLETE')); assert.equal(transition.accepted, true); state = transition.state;
        transition = applyTaskControlEvent(state, event(state, 'START'));
        code(transition, NATIVE_TASK_CONTROL_ERROR_CODES.GENERATION_LOOP);
        assert.equal(transition.state.protected_effects_fenced, true);
    });

    it('TC09 rejects goal mismatch, TC10 duplicate waits, and TC11 late events after timeout', () => {
        let state = seed();
        code(applyTaskControlEvent(state, event(state, 'START', { goal_generation: 2 })), NATIVE_TASK_CONTROL_ERROR_CODES.GOAL_MISMATCH);

        state = seed();
        let transition = applyTaskControlEvent(state, event(state, 'COHORT_WAIT', { task_logical_id: undefined, payload: { cohort_id: 'cohort-01', task_ids: [], timeout_seconds: 30 } }));
        assert.equal(transition.accepted, false);
        state = seed();
        transition = applyTaskControlEvent(state, event(state, 'COHORT_WAIT', { task_logical_id: undefined, payload: { cohort_id: 'cohort-01', task_ids: ['task-01'], timeout_seconds: 30 } })); assert.equal(transition.accepted, true); state = transition.state;
        transition = applyTaskControlEvent(state, event(state, 'COHORT_WAIT', { task_logical_id: undefined, payload: { cohort_id: 'cohort-01', task_ids: ['task-01'], timeout_seconds: 30 } })); code(transition, NATIVE_TASK_CONTROL_ERROR_CODES.WAIT_DUPLICATE);

        state = seed();
        transition = applyTaskControlEvent(state, event(state, 'COHORT_WAIT', { task_logical_id: undefined, payload: { cohort_id: 'cohort-01', task_ids: ['task-01'], timeout_seconds: 30 } })); state = transition.state;
        transition = applyTaskControlEvent(state, event(state, 'TIMEOUT', { task_logical_id: undefined, payload: { cohort_id: 'cohort-01' } })); assert.equal(transition.accepted, true); state = transition.state;
        code(applyTaskControlEvent(state, event(state, 'PROGRESS')), NATIVE_TASK_CONTROL_ERROR_CODES.LATE_EVENT);
    });

    it('TC12 rejects undeclared roles and requires an explicit fresh successor commit', () => {
        let state = seed();
        code(applyTaskControlEvent(state, event(state, 'START', { role_slot_id: 'missing-role' })), NATIVE_TASK_CONTROL_ERROR_CODES.UNDECLARED_ROLE);
        state = seed();
        let transition = applyTaskControlEvent(state, event(state, 'SUCCESSION_PREPARE', { task_logical_id: undefined, payload: { active_task_ids: [], last_event_sha256: null } }));
        assert.equal(transition.accepted, true); state = transition.state;
        code(applyTaskControlEvent(state, event(state, 'START')), NATIVE_TASK_CONTROL_ERROR_CODES.SUCCESSION_REQUIRED);
        state = seed();
        transition = applyTaskControlEvent(state, event(state, 'SUCCESSION_PREPARE', { task_logical_id: undefined, payload: { active_task_ids: [], last_event_sha256: null } })); assert.equal(transition.accepted, true); state = transition.state;
        transition = applyTaskControlEvent(state, event(state, 'SUCCESSION_COMMIT', {
            task_logical_id: undefined, controller_generation: 2, occupant_generation: 2,
            payload: { prepare_event_sha256: state.succession?.prepare_event_sha256, old_lease_sha256: state.lease.lease_sha256, successor_role_slot_id: 'controller', successor_occupant_id: 'sol-02' },
        }));
        assert.equal(transition.accepted, true); state = transition.state;
        assert.equal(state.lease.occupant_id, 'sol-02');
        assert.equal(state.lease.controller_generation, 2);
        transition = applyTaskControlEvent(state, event(state, 'START')); assert.equal(transition.accepted, true);
    });
});
