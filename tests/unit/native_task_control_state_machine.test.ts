import assert from 'node:assert/strict';
import test from 'node:test';

import {
    applyNativeTaskControlEvent,
    createNativeTaskControlState,
    nativeCancelCallCount,
    NATIVE_TASK_CONTROL_RESULT_CODES as C,
} from '../../src/core/native_task_control/state_machine.js';
import { createNativeTaskControlEvent, hashNativeTaskControlEvent } from '../../src/core/native_task_control/receipts.js';
import type { NativeGoalGeneration, NativeRoleManifest, NativeTaskControlEvent, NativeTaskControlPolicy } from '../../src/types/native_task_control.js';

const generation: NativeGoalGeneration = { goal_generation: 5, controller_generation: 1, occupant_generation: 1 };
const policy: NativeTaskControlPolicy = {
    schema: 'cstar.native_policy.v1', policy_id: 'oe-l1b', depth: 0,
    budgets: { model_requests: 32, tool_calls: 96, wall_time_seconds: 1200 },
    maxima: { descendants: 0, waits: 0, retries: 0, replays: 0, fallbacks: 0 },
    allowlists: { task_kinds: ['source_implementation'], effects: ['run_bound_checks'] },
    prohibitions: ['forge', 'network', 'provider'], requirements: ['fail_closed'],
    effect_permissions: { read_bound_context: true, write_allowlisted_source: true, run_bound_checks: true, protected_effect: false },
};
const manifest: NativeRoleManifest = {
    schema: 'cstar.native_role_manifest.v1', manifest_id: 'manifest-1', root_id: 'root-1',
    bead_id: 'bead:mcp:cstar-oe-l1b-state-receipts-set-04', set_id: 'CSTAR-OE-L1B-SET-04', phase_id: 'L1B',
    max_persistent_role_slots: 1, max_total_role_slots: 1,
    slots: [{ role_slot_id: 'slot-1', role: 'worker', persistent: true, requested_model: 'gpt-5.6-luna', requested_reasoning: 'max', actual_identity: 'unreported', descendants_max: 0 }],
};

let sequence = 0;
function event(event_type: string, payload: Record<string, unknown> = {}, nextGeneration = generation): NativeTaskControlEvent {
    sequence += 1;
    return createNativeTaskControlEvent({ event_id: `event-${sequence}`, event_type, occurred_at: `observation-${sequence}`, generation: nextGeneration, payload });
}
function task(event_type: string, id = 'item-1', extra: Record<string, unknown> = {}): NativeTaskControlEvent {
    return event(event_type, { logical_task_id: id, role_slot_id: 'slot-1', task_kind: 'source_implementation', effect: 'run_bound_checks', ...extra });
}
function state() {
    return createNativeTaskControlState({ generation, policy, controller_lease: { lease_id: 'lease-1', controller_generation: 1, holder: 'controller-1' }, role_manifest: manifest });
}
function apply(current: ReturnType<typeof state>, next: NativeTaskControlEvent, context = {}) {
    const result = applyNativeTaskControlEvent(current, next, context);
    return result;
}

test('TC01 cancel admits one matching terminal ACK and fences later work', () => {
    let current = state();
    let result = apply(current, event('CANCEL')); assert.equal(result.ok, true); current = result.state;
    assert.equal(nativeCancelCallCount(current), 1);
    result = apply(current, event('CANCEL_ACK')); assert.equal(result.ok, true); current = result.state;
    result = apply(current, task('START')); assert.equal(result.ok, false); assert.equal(result.error_code, C.TERMINAL_BARRIER);
    assert.equal(nativeCancelCallCount(current), 1);
});

test('TC02 revoke admits one REVOKED terminal event', () => {
    let current = state(); let result = apply(current, event('REVOKE')); assert.equal(result.ok, true); current = result.state;
    result = apply(current, event('REVOKED')); assert.equal(result.ok, true); assert.equal(nativeCancelCallCount(result.state), 1);
});

test('TC03 missing cancel ACK rejects later task work', () => {
    let current = state(); current = apply(current, event('CANCEL')).state;
    const result = apply(current, task('START')); assert.equal(result.ok, false); assert.equal(result.error_code, C.CANCEL_ACK_MISSING);
});

test('TC04 stale controller generation fails before mutation', () => {
    const current = state(); const stale = { ...generation, controller_generation: 0 };
    const explicit = apply(current, event('START', { role_slot_id: 'slot-1', task_kind: 'source_implementation' }, stale));
    assert.equal(explicit.state, current); assert.equal(explicit.error_code, C.STALE_CONTROLLER);
});

test('TC05 competing lease holder fails before mutation', () => {
    const current = state(); const result = apply(current, task('START'), { controller_lease: { lease_id: 'lease-2', controller_generation: 1, holder: 'controller-2' } });
    assert.equal(result.state, current); assert.equal(result.error_code, C.COMPETING_LEASE);
});

test('TC06 second succession prepare fails as overlap', () => {
    let current = state(); const started = task('START'); current = apply(current, started).state;
    const prepare = event('SUCCESSION_PREPARE', { active_task_ids: ['item-1'], prior_event_hash: hashNativeTaskControlEvent(started) });
    current = apply(current, prepare).state;
    const result = apply(current, event('SUCCESSION_PREPARE', { active_task_ids: ['item-1'], prior_event_hash: hashNativeTaskControlEvent(started) }));
    assert.equal(result.error_code, C.SUCCESSION_OVERLAP);
});

test('TC07 omitted active task set fails succession prepare', () => {
    let current = state(); const started = task('START'); current = apply(current, started).state;
    const result = apply(current, event('SUCCESSION_PREPARE', { prior_event_hash: hashNativeTaskControlEvent(started) }));
    assert.equal(result.error_code, C.SUCCESSION_AMBIGUOUS);
});

test('TC08 COMPLETE then START at unchanged goal generation opens breaker', () => {
    let current = state(); current = apply(current, task('START')).state; current = apply(current, task('COMPLETE', 'item-1', { host_task_id: 'host-a' })).state;
    const result = apply(current, task('START', 'item-1', { host_task_id: 'host-b' }));
    assert.equal(result.error_code, C.GENERATION_LOOP); assert.equal(result.state.circuit_breaker?.state, 'open');
});

test('TC09 goal-generation mismatch fails', () => {
    const current = state(); const result = apply(current, event('PROGRESS', { role_slot_id: 'slot-1', task_kind: 'source_implementation' }, { ...generation, goal_generation: 4 }));
    assert.equal(result.state, current); assert.equal(result.error_code, C.GOAL_MISMATCH);
});

test('TC10 duplicate cohort wait fails', () => {
    let current = state(); current = apply(current, event('COHORT_WAIT', { cohort_id: 'cohort-1', required: 1, observed: 0, satisfied: false })).state;
    const result = apply(current, event('COHORT_WAIT', { cohort_id: 'cohort-1', required: 1, observed: 0, satisfied: false }));
    assert.equal(result.error_code, C.WAIT_DUPLICATE);
});

test('TC11 timeout freezes late cohort events', () => {
    let current = state(); current = apply(current, event('COHORT_WAIT', { cohort_id: 'cohort-1', required: 1, observed: 0, satisfied: false })).state;
    current = apply(current, event('TIMEOUT', { cohort_id: 'cohort-1' })).state;
    const result = apply(current, task('PROGRESS', 'item-1', { cohort_id: 'cohort-1' }));
    assert.equal(result.error_code, C.LATE_EVENT);
});

test('TC12 undeclared role fails and exact fresh succession commit passes', () => {
    let current = state(); const undeclared = event('START', { role_slot_id: 'missing', task_kind: 'source_implementation' });
    assert.equal(apply(current, undeclared).error_code, C.UNDECLARED_ROLE);
    const started = task('START'); current = apply(current, started).state;
    const prepare = event('SUCCESSION_PREPARE', { active_task_ids: ['item-1'], prior_event_hash: hashNativeTaskControlEvent(started) }); current = apply(current, prepare).state;
    const commit = event('SUCCESSION_COMMIT', { active_task_ids: ['item-1'], prior_event_hash: hashNativeTaskControlEvent(prepare), next_lease: { lease_id: 'lease-2', controller_generation: 2, holder: 'controller-2' }, next_generation: { goal_generation: 5, controller_generation: 2, occupant_generation: 2 } });
    const result = apply(current, commit); assert.equal(result.ok, true); assert.deepEqual(result.state.generation, { goal_generation: 5, controller_generation: 2, occupant_generation: 2 });
});

test('identical replays are idempotent and conflicting bytes open the breaker', () => {
    let current = state(); const first = task('PROGRESS'); current = apply(current, first).state;
    const replay = apply(current, first); assert.equal(replay.ok, true); assert.equal(replay.state, current);
    const conflict = apply(current, { ...first, occurred_at: 'different-observation' });
    assert.equal(conflict.error_code, C.REPLAY_CONFLICT); assert.equal(conflict.state.circuit_breaker?.state, 'open');
});

test('Forge and protected effects fence without dispatch or protected effects', () => {
    let current = state(); const forge = apply(current, event('FORGE_INVOKE')); assert.equal(forge.error_code, C.FORGE_DEFUNCT); assert.equal(forge.state.circuit_breaker?.state, 'open');
    current = state(); const protectedEffect = apply(current, event('PROTECTED_EFFECT')); assert.equal(protectedEffect.error_code, C.PROTECTED_EFFECT); assert.equal(protectedEffect.state.circuit_breaker?.state, 'open');
});
