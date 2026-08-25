import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { inheritPolicy, policyHash } from '../../src/core/native_task_control/policy.js';
import { createGoalGeneration, createControllerLease, createTaskControlEvent, hashRoleManifest } from '../../src/core/native_task_control/receipts.js';
import { applyTaskControlEvent, createNativeTaskControlState } from '../../src/core/native_task_control/state_machine.js';
import { NATIVE_TASK_CONTROL_ERROR_CODES } from '../../src/core/native_task_control/errors.js';
import type { NativePolicy, NativeRoleManifest, NativeTaskControlEvent, NativeTaskControlState } from '../../src/types/native_task_control.js';

const sha = (char: string): string => char.repeat(64);

function setup(): NativeTaskControlState {
    const policy: NativePolicy = {
        schema: 'cstar.native_policy.v1', policy_id: 'adv-policy', depth: 0,
        budgets: { model_requests: 10 }, maxima: { waits: 1 },
        allowlists: { task_kinds: ['work'], blocked_items: [] }, prohibitions: ['forge'], requirements: ['single_controller'],
        effect_permissions: { safe: true, protected: false },
    };
    const manifest: NativeRoleManifest = {
        schema: 'cstar.native_role_manifest.v1', manifest_id: 'adv-manifest', root_id: 'adv-root', bead_id: 'adv-bead', set_id: 'adv-set', phase_id: 'adv-phase',
        slots: [{ role_slot_id: 'controller', role: 'controller', persistent: true, owner: 'sol', allowed_task_kinds: ['work'], replacement_budget: 1, policy }],
        max_persistent_role_slots: 8, max_total_role_slots: 8,
    };
    const goal = createGoalGeneration({
        goal_id: 'adv-goal', root_id: 'adv-root', bead_id: 'adv-bead', set_id: 'adv-set', phase_id: 'adv-phase', logical_item: 'adv-item', partition: 'adv-partition', generation: 1,
        goal: { objective: 'adversarial' }, work_package_sha256: sha('b'), role_manifest_sha256: hashRoleManifest(manifest),
        effective_policy_sha256: policyHash(policy),
    });
    const lease = createControllerLease({ lease_id: 'adv-lease', root_id: goal.root_id, goal_id: goal.goal_id, goal_generation: 1, controller_generation: 1, role_slot_id: 'controller', occupant_id: 'adv-sol', occupant_generation: 1, status: 'ACTIVE', previous_lease_sha256: null });
    return createNativeTaskControlState({
        identity: { root_id: goal.root_id, bead_id: goal.bead_id, set_id: goal.set_id, phase_id: goal.phase_id, logical_item: goal.logical_item, partition: goal.partition, goal_generation: goal.generation, controller_generation: 1, occupant_generation: 1, work_package_sha256: goal.work_package_sha256 },
        goal, manifest, policy, lease,
    });
}

function event(state: NativeTaskControlState, kind: NativeTaskControlEvent['event_kind'], extra: Partial<NativeTaskControlEvent> = {}): NativeTaskControlEvent {
    const input = {
        event_id: `${kind}-${state.event_log.length + 1}`, event_kind: kind,
        root_id: state.identity.root_id, bead_id: state.identity.bead_id, set_id: state.identity.set_id, phase_id: state.identity.phase_id,
        logical_item: state.identity.logical_item, partition: state.identity.partition, goal_generation: state.goal.generation,
        controller_generation: state.lease.controller_generation, occupant_generation: state.lease.occupant_generation,
        role_slot_id: state.lease.role_slot_id, occupant_id: state.lease.occupant_id, event_sequence: state.event_log.length + 1,
        previous_event_sha256: state.last_event_sha256, task_logical_id: 'adv-task', task_kind: 'work', ...extra,
    } as Partial<NativeTaskControlEvent>;
    if (input.task_logical_id === undefined) delete input.task_logical_id;
    if (input.task_kind === undefined) delete input.task_kind;
    return createTaskControlEvent(input as Omit<NativeTaskControlEvent, 'schema' | 'event_sha256'>);
}

function expectError(state: NativeTaskControlState, evt: NativeTaskControlEvent, expected: string): NativeTaskControlState {
    const transition = applyTaskControlEvent(state, evt);
    assert.equal(transition.accepted, false);
    assert.equal(transition.error_code, expected);
    return transition.state;
}

describe('native task-control incident and adversarial cases', () => {
    it('TC01-TC22 fixture is complete, unique, and deterministic', () => {
        const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/native_task_control/incident-cases.json', import.meta.url), 'utf8')) as { schema: string; cases: Array<{ id: string }> };
        assert.equal(fixture.schema, 'cstar.native_task_control_incident_cases.v1');
        assert.deepEqual(fixture.cases.map((item) => item.id), Array.from({ length: 22 }, (_, index) => `TC${String(index + 1).padStart(2, '0')}`));
        assert.equal(new Set(fixture.cases.map((item) => item.id)).size, 22);
    });

    it('TC13 rejects policy widening and TC14 rejects manifest drift', () => {
        const root: NativePolicy = { ...setup().policy };
        const child = { ...root, policy_id: 'wide', depth: 1, budgets: { model_requests: 11 } };
        assert.throws(() => inheritPolicy(root, child), (error: unknown) => (error as { code?: string }).code === NATIVE_TASK_CONTROL_ERROR_CODES.POLICY_WIDENING);
        const state = setup();
        expectError(state, event(state, 'START', { payload: { role_manifest_sha256: sha('f') } }), NATIVE_TASK_CONTROL_ERROR_CODES.MANIFEST_DRIFT);
    });

    it('TC15 rejects event-id reuse with different bytes and TC16 exhausts replacements', () => {
        let state = setup();
        const first = event(state, 'START', { event_id: 'same-event' });
        let transition = applyTaskControlEvent(state, first); assert.equal(transition.accepted, true); state = transition.state;
        expectError(state, event(state, 'PROGRESS', { event_id: 'same-event' }), NATIVE_TASK_CONTROL_ERROR_CODES.REPLAY_CONFLICT);

        state = setup();
        transition = applyTaskControlEvent(state, event(state, 'FAIL')); assert.equal(transition.accepted, true); state = transition.state;
        transition = applyTaskControlEvent(state, event(state, 'REPLACEMENT', { payload: { original_task_logical_id: 'adv-task', new_task_logical_id: 'replacement-1', new_occupant_id: 'luna-1' } })); assert.equal(transition.accepted, true); state = transition.state;
        expectError(state, event(state, 'REPLACEMENT', { payload: { original_task_logical_id: 'adv-task', new_task_logical_id: 'replacement-2', new_occupant_id: 'luna-2' } }), NATIVE_TASK_CONTROL_ERROR_CODES.REPLACEMENT_EXHAUSTED);
    });

    it('TC17-TC20 fence scope, capability, Forge, and selector violations', () => {
        expectError(setup(), event(setup(), 'START', { payload: { scope_violation: true } }), NATIVE_TASK_CONTROL_ERROR_CODES.SCOPE_VIOLATION);
        expectError(setup(), event(setup(), 'START', { payload: { native_surface_available: false } }), NATIVE_TASK_CONTROL_ERROR_CODES.NATIVE_SURFACE_UNAVAILABLE);
        expectError(setup(), event(setup(), 'FORGE_INVOCATION'), NATIVE_TASK_CONTROL_ERROR_CODES.FORGE_DEFUNCT);
        expectError(setup(), event(setup(), 'START', { payload: { requested_selector: 'gpt-5.6-luna', actual_identity: 'unreported' } }), NATIVE_TASK_CONTROL_ERROR_CODES.SELECTOR_MISMATCH);
    });

    it('TC21 rejects a conflicting terminal replay and TC22 fences protected effects', () => {
        let state = setup();
        let transition = applyTaskControlEvent(state, event(state, 'CANCEL')); assert.equal(transition.accepted, true); state = transition.state;
        transition = applyTaskControlEvent(state, event(state, 'CANCEL_ACK')); assert.equal(transition.accepted, true); state = transition.state;
        expectError(state, event(state, 'REVOKED'), NATIVE_TASK_CONTROL_ERROR_CODES.TERMINAL_REPLAY_CONFLICT);
        expectError(setup(), event(setup(), 'START', { payload: { protected_effect: true, effect: 'protected' } }), NATIVE_TASK_CONTROL_ERROR_CODES.PROTECTED_EFFECT);
    });
});
