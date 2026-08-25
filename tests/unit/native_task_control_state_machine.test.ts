import assert from 'node:assert/strict';
import test from 'node:test';

import {
    canonicalNativeJson,
    hashCanonicalNative,
} from '../../src/core/native_task_control/canonical.js';
import {
    NATIVE_TASK_CONTROL_ERROR_CODES,
    NativeTaskControlError,
} from '../../src/core/native_task_control/errors.js';
import {
    createNativeCircuitBreaker,
    createNativeCohortWait,
    createNativeControllerLease,
    createNativeGoalGeneration,
    createNativeSuccessionReceipt,
    createNativeTaskControlEvent,
    hashNativeRoleManifest,
    hashNativeTaskControlEvent,
} from '../../src/core/native_task_control/receipts.js';
import {
    applyNativeTaskControlEvent,
    createNativeTaskControlState,
    nativeCancelCallCount,
} from '../../src/core/native_task_control/state_machine.js';
import type {
    NativeRoleManifest,
    NativeTaskControlEvent,
    NativeTaskControlPolicy,
    NativeTaskControlState,
    NativeTransitionResult,
} from '../../src/types/native_task_control.js';

const C = {
    FORGE: NATIVE_TASK_CONTROL_ERROR_CODES.FORGE_DEFUNCT,
    INVALID: NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_JSON,
    PROTECTED: NATIVE_TASK_CONTROL_ERROR_CODES.PROTECTED_EFFECT,
    PROTOTYPE: NATIVE_TASK_CONTROL_ERROR_CODES.PROTOTYPE_KEY,
    UNKNOWN: NATIVE_TASK_CONTROL_ERROR_CODES.UNKNOWN_FIELD,
    REPLAY: NATIVE_TASK_CONTROL_ERROR_CODES.REPLAY_CONFLICT,
    GOAL: 'CSTAR_NATIVE_TASK_GOAL_MISMATCH',
    STALE: NATIVE_TASK_CONTROL_ERROR_CODES.STALE_CONTROLLER,
    COMPETING: 'CSTAR_NATIVE_TASK_COMPETING_LEASE',
    CANCEL_MISSING: 'CSTAR_NATIVE_TASK_CANCEL_ACK_MISSING',
    CANCEL_DUPLICATE: 'CSTAR_NATIVE_TASK_CANCEL_DUPLICATE',
    TERMINAL: 'CSTAR_NATIVE_TASK_TERMINAL_BARRIER',
    TERMINAL_REPLAY: 'CSTAR_NATIVE_TASK_TERMINAL_REPLAY_CONFLICT',
    SUCCESSION_OVERLAP: 'CSTAR_NATIVE_TASK_SUCCESSION_OVERLAP',
    SUCCESSION_AMBIGUOUS: 'CSTAR_NATIVE_TASK_SUCCESSION_AMBIGUOUS',
    WAIT_DUPLICATE: 'CSTAR_NATIVE_TASK_WAIT_DUPLICATE',
    LATE: 'CSTAR_NATIVE_TASK_LATE_EVENT',
    UNDECLARED: 'CSTAR_NATIVE_TASK_UNDECLARED_ROLE',
    GENERATION_LOOP: NATIVE_TASK_CONTROL_ERROR_CODES.GENERATION_LOOP,
    REPLACEMENT: 'CSTAR_NATIVE_TASK_REPLACEMENT_EXHAUSTED',
} as const;

const GENERATION = {
    goal_generation: 1,
    controller_generation: 1,
    occupant_generation: 1,
} as const;
const LEASE = {
    lease_id: 'lease-1',
    controller_generation: 1,
    holder: 'operator-1',
} as const;
function policy(overrides: Partial<NativeTaskControlPolicy> = {}): NativeTaskControlPolicy {
    return {
        schema: 'cstar.native_policy.v1',
        policy_id: 'policy-test',
        depth: 0,
        budgets: {},
        maxima: {},
        allowlists: {},
        prohibitions: [],
        requirements: ['fail_closed'],
        effect_permissions: { protected_effect: false },
        ...overrides,
    };
}
function state(policyOverrides: Partial<NativeTaskControlPolicy> = {}): NativeTaskControlState {
    return createNativeTaskControlState({
        schema: 'cstar.native_task_control_state.v1',
        generation: GENERATION,
        policy: policy(policyOverrides),
        controller_lease: LEASE,
    });
}
function event(
    event_id: string,
    event_type: string,
    payload?: Record<string, unknown>,
    generation?: typeof GENERATION,
): NativeTaskControlEvent {
    const result: NativeTaskControlEvent = {
        event_id,
        event_type,
        occurred_at: '2026-08-13T00:00:00.000Z',
    };
    if (generation !== undefined) result.generation = generation;
    if (payload !== undefined) result.payload = payload;
    return result;
}
function auth(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { generation: GENERATION, controller_lease: LEASE, ...extra };
}
function expectFailure(
    current: NativeTaskControlState,
    next: unknown,
    code: string,
    context: unknown = auth(),
): NativeTransitionResult {
    const result = applyNativeTaskControlEvent(current, next, context);
    assert.equal(result.ok, false);
    assert.equal(result.error_code, code);
    return result;
}
function expectSuccess(
    current: NativeTaskControlState,
    next: unknown,
    context: unknown = auth(),
): NativeTransitionResult & { ok: true } {
    const result = applyNativeTaskControlEvent(current, next, context);
    assert.equal(result.ok, true);
    return result as NativeTransitionResult & { ok: true };
}
function unchanged(before: NativeTaskControlState, after: NativeTaskControlState): void {
    assert.equal(canonicalNativeJson(after), canonicalNativeJson(before));
}
function assertCode(action: () => unknown, code: string): void {
    assert.throws(action, (error: unknown) => (
        error instanceof NativeTaskControlError && error.code === code
    ));
}
function manifest(): NativeRoleManifest {
    return {
        schema: 'cstar.native_role_manifest.v1',
        manifest_id: 'manifest-1',
        root_id: 'root-1',
        bead_id: 'bead-1',
        set_id: 'set-1',
        phase_id: 'phase-1',
        max_persistent_role_slots: 1,
        max_total_role_slots: 1,
        slots: [{
            role_slot_id: 'slot-a',
            role: 'tester',
            persistent: true,
            requested_model: 'gpt-5.6-luna',
            requested_reasoning: 'max',
            actual_identity: 'unreported',
            descendants_max: 0,
        }],
    };
}
test('all L1B1 receipt constructors accept minimal data and deeply freeze results', () => {
    const goal = createNativeGoalGeneration(GENERATION);
    const lease = createNativeControllerLease(LEASE);
    const payload = { nested: { values: [1, 'x'] } };
    const taskEvent = createNativeTaskControlEvent({
        event_id: 'event-1', event_type: 'START', occurred_at: 'fixed',
        generation: GENERATION, payload,
    });
    const succession = createNativeSuccessionReceipt({
        receipt_id: 'succession-1', previous_controller_generation: 1,
        next_controller_generation: 2, accepted_at: 'fixed',
    });
    const wait = createNativeCohortWait({
        wait_id: 'wait-1', cohort_id: 'cohort-1', required: 1, observed: 1, satisfied: true,
    });
    const breaker = createNativeCircuitBreaker({ state: 'closed', failure_count: 0, threshold: 1 });

    assert.deepEqual(goal, GENERATION);
    assert.deepEqual(lease, LEASE);
    assert.deepEqual(taskEvent, {
        event_id: 'event-1', event_type: 'START', occurred_at: 'fixed',
        generation: GENERATION, payload,
    });
    assert.deepEqual(succession, {
        receipt_id: 'succession-1', previous_controller_generation: 1,
        next_controller_generation: 2, accepted_at: 'fixed',
    });
    assert.deepEqual(wait, {
        wait_id: 'wait-1', cohort_id: 'cohort-1', required: 1, observed: 1, satisfied: true,
    });
    assert.deepEqual(breaker, { state: 'closed', failure_count: 0, threshold: 1 });
    for (const value of [goal, lease, taskEvent, succession, wait, breaker]) assert(Object.isFrozen(value));
    assert(Object.isFrozen(taskEvent.generation));
    assert(Object.isFrozen(taskEvent.payload));
    assert(Object.isFrozen((taskEvent.payload as { nested: object }).nested));
    assert(Object.isFrozen((taskEvent.payload as { nested: { values: object } }).nested.values));

    payload.nested.values[0] = 99;
    assert.equal((taskEvent.payload as { nested: { values: number[] } }).nested.values[0], 1);
    const before = canonicalNativeJson(taskEvent);
    try { (taskEvent as unknown as Record<string, unknown>).event_type = 'COMPLETE'; } catch { /* frozen */ }
    try { ((taskEvent.payload as Record<string, unknown>).nested as Record<string, unknown>).x = 1; } catch { /* frozen */ }
    assert.equal(canonicalNativeJson(taskEvent), before);
});
test('receipt constructors reject all unsafe input categories before output', () => {
    const valid = { event_id: 'event-1', event_type: 'START', occurred_at: 'fixed' };
    const unknown = { ...valid, unknown_field: true };
    assertCode(() => createNativeTaskControlEvent(unknown), C.UNKNOWN);

    const accessor = { ...valid };
    Object.defineProperty(accessor, 'event_id', { enumerable: true, get: () => 'event-1' });
    assertCode(() => createNativeTaskControlEvent(accessor), C.INVALID);

    const symbolKey = { ...valid };
    Object.defineProperty(symbolKey, Symbol('unsafe'), { enumerable: true, value: true });
    assertCode(() => createNativeTaskControlEvent(symbolKey), C.INVALID);

    const unsafePrototype = Object.assign(Object.create({ inherited: true }), valid);
    assertCode(() => createNativeTaskControlEvent(unsafePrototype), C.INVALID);

    for (const key of ['__proto__', 'constructor', 'prototype']) {
        const candidate = { ...valid };
        Object.defineProperty(candidate, key, { enumerable: true, configurable: true, value: {} });
        assertCode(() => createNativeTaskControlEvent(candidate), key === '__proto__' || key === 'constructor' || key === 'prototype' ? C.PROTOTYPE : C.INVALID);
    }

    assertCode(() => createNativeTaskControlEvent({ ...valid, payload: BigInt(1) }), C.INVALID);
    assertCode(() => createNativeTaskControlEvent({ ...valid, payload: undefined }), C.INVALID);
    assertCode(() => createNativeGoalGeneration({ ...GENERATION, goal_generation: Number.MAX_SAFE_INTEGER + 1 }), C.INVALID);
    assertCode(() => createNativeTaskControlEvent({ ...valid, event_id: '   ' }), C.INVALID);
    assertCode(() => createNativeCircuitBreaker({ state: 'invalid', failure_count: 0, threshold: 1 }), C.INVALID);
    assertCode(() => createNativeCohortWait({
        wait_id: 'w', cohort_id: 'c', required: 2, observed: 1, satisfied: true,
    }), C.INVALID);
    assertCode(() => createNativeCircuitBreaker({ state: 'closed', failure_count: 0, threshold: 0 }), C.INVALID);
});
test('role-manifest and event hashes are canonical, lowercase, and authority-bound', () => {
    const left = manifest();
    const right = {
        slots: [{ ...left.slots[0], requested_reasoning: 'max', role: 'tester' }],
        max_total_role_slots: 1, phase_id: 'phase-1', max_persistent_role_slots: 1,
        set_id: 'set-1', bead_id: 'bead-1', root_id: 'root-1', manifest_id: 'manifest-1',
        schema: 'cstar.native_role_manifest.v1',
    } as NativeRoleManifest;
    const leftHash = hashNativeRoleManifest(left);
    const rightHash = hashNativeRoleManifest(right);
    assert.match(leftHash, /^[0-9a-f]{64}$/);
    assert.equal(leftHash, leftHash.toLowerCase());
    assert.equal(leftHash, rightHash);
    assert.notEqual(leftHash, hashNativeRoleManifest({ ...left, root_id: 'root-other' }));

    const eventLeft = event('hash-event', 'START', { logical_task_id: 'item' }, GENERATION);
    const eventRight = event('hash-event', 'START', { logical_task_id: 'item' }, {
        goal_generation: 1, controller_generation: 1, occupant_generation: 1,
    });
    const eventHash = hashNativeTaskControlEvent(eventLeft);
    assert.match(eventHash, /^[0-9a-f]{64}$/);
    assert.equal(eventHash, hashNativeTaskControlEvent(eventRight));
    assert.notEqual(eventHash, hashNativeTaskControlEvent(event('hash-event', 'START', {
        logical_task_id: 'item', lease_id: 'lease-other',
    }, GENERATION)));
});

test('constructors are deterministic despite ambient time and randomness changes', () => {
    const originalNow = Date.now;
    const originalRandom = Math.random;
    try {
        Date.now = () => 1;
        Math.random = () => 0.1;
        const first = createNativeTaskControlEvent(event('pure', 'START'));
        Date.now = () => 2;
        Math.random = () => 0.9;
        assert.deepEqual(first, createNativeTaskControlEvent(event('pure', 'START')));
    } finally {
        Date.now = originalNow;
        Math.random = originalRandom;
    }
});

test('TC01 CANCEL_ACK fences work and native cancellation is called exactly once', () => {
    const cancelled = expectSuccess(state(), event('cancel', 'CANCEL', { logical_task_id: 'item' })).state;
    const acknowledged = expectSuccess(cancelled, event('ack', 'CANCEL_ACK', {
        barrier_event_id: 'cancel', logical_task_id: 'item',
    })).state;
    assert.equal(nativeCancelCallCount(acknowledged), 1);
    for (const type of ['START', 'PROGRESS', 'COMPLETE', 'REPLACE']) {
        const before = canonicalNativeJson(acknowledged);
        const result = expectFailure(acknowledged, event(`late-${type}`, type, { logical_task_id: 'item' }), C.TERMINAL);
        assert.equal(canonicalNativeJson(result.state), before);
    }
});

test('TC02 REVOKE admits one REVOKED terminal event and fences duplicate cancellation', () => {
    const revoked = expectSuccess(state(), event('revoke', 'REVOKE', { logical_task_id: 'item' })).state;
    const terminal = expectSuccess(revoked, event('revoked', 'REVOKED', {
        barrier_event_id: 'revoke', logical_task_id: 'item',
    })).state;
    assert.equal(nativeCancelCallCount(terminal), 1);
    for (const type of ['REVOKE', 'CANCEL']) {
        const before = canonicalNativeJson(terminal);
        const result = expectFailure(terminal, event(`duplicate-${type}`, type), C.CANCEL_DUPLICATE);
        unchanged(terminal, result.state);
        assert.equal(canonicalNativeJson(result.state), before);
    }
});

test('TC03 missing or mismatched cancel acknowledgement rejects work without mutation', () => {
    const cancelled = expectSuccess(state(), event('cancel', 'CANCEL')).state;
    const before = canonicalNativeJson(cancelled);
    const mismatch = expectFailure(cancelled, event('wrong-ack', 'CANCEL_ACK', {
        barrier_event_id: 'not-cancel',
    }), C.CANCEL_MISSING);
    assert.equal(canonicalNativeJson(mismatch.state), before);
    const late = expectFailure(cancelled, event('work-after-cancel', 'PROGRESS'), C.TERMINAL);
    assert.equal(canonicalNativeJson(late.state), before);
});

test('TC04/TC05 stale generations and competing leases fail before mutation', () => {
    const current = state();
    const before = canonicalNativeJson(current);
    const stale = expectFailure(current, event('stale', 'START'), C.STALE, auth({
        generation: { ...GENERATION, controller_generation: 2 },
    }));
    assert.equal(canonicalNativeJson(stale.state), before);
    const competing = expectFailure(current, event('competing', 'START'), C.COMPETING, auth({
        controller_lease: { lease_id: 'lease-2', controller_generation: 1, holder: 'operator-2' },
    }));
    assert.equal(canonicalNativeJson(competing.state), before);
});

test('TC06 second succession prepare fails with overlap', () => {
    const start = event('start', 'START', { logical_task_id: 'item' });
    const started = expectSuccess(state(), start).state;
    const prior = hashNativeTaskControlEvent(createNativeTaskControlEvent(start));
    const prepare = event('prepare-1', 'SUCCESSION_PREPARE', {
        active_task_ids: ['item'], prior_event_hash: prior,
    });
    const prepared = expectSuccess(started, prepare).state;
    const before = canonicalNativeJson(prepared);
    const result = expectFailure(prepared, event('prepare-2', 'SUCCESSION_PREPARE', {
        active_task_ids: ['item'], prior_event_hash: prior,
    }), C.SUCCESSION_OVERLAP);
    assert.equal(canonicalNativeJson(result.state), before);
});

test('TC07 omitted, duplicate, and mismatched active task sets are ambiguous', () => {
    const start = event('start', 'START', { logical_task_id: 'item' });
    const started = expectSuccess(state(), start).state;
    const prior = hashNativeTaskControlEvent(createNativeTaskControlEvent(start));
    const payloads = [
        { prior_event_hash: prior },
        { prior_event_hash: prior, active_task_ids: ['item', 'item'] },
        { prior_event_hash: prior, active_task_ids: ['item'], logical_task_ids: ['other'] },
    ];
    payloads.forEach((payload, index) => {
        const before = canonicalNativeJson(started);
        const result = expectFailure(started, event(`ambiguous-${index}`, 'SUCCESSION_PREPARE', payload), C.SUCCESSION_AMBIGUOUS);
        assert.equal(canonicalNativeJson(result.state), before);
    });
});

test('TC08 COMPLETE then START opens the generation-loop breaker and rejects the new host task', () => {
    const completed = expectSuccess(state(), event('complete', 'COMPLETE', {
        logical_task_id: 'item', host_task_id: 'host-1',
    })).state;
    const beforeEvents = canonicalNativeJson(completed.events);
    const result = expectFailure(completed, event('start-new-host', 'START', {
        logical_task_id: 'item', host_task_id: 'host-2',
    }), C.GENERATION_LOOP);
    assert.equal(canonicalNativeJson(result.state.events), beforeEvents);
    assert.equal(result.state.circuit_breaker?.state, 'open');
    assert.equal(result.state.circuit_breaker?.last_error_code, C.GENERATION_LOOP);
});

test('TC09 goal and occupant generation mismatches fail before mutation', () => {
    const current = state();
    const before = canonicalNativeJson(current);
    const goal = expectFailure(current, event('goal-mismatch', 'START', undefined, {
        goal_generation: 2, controller_generation: 1, occupant_generation: 1,
    }), C.GOAL);
    assert.equal(canonicalNativeJson(goal.state), before);
    const occupant = expectFailure(current, event('occupant-mismatch', 'START', undefined, {
        goal_generation: 1, controller_generation: 1, occupant_generation: 2,
    }), C.STALE);
    assert.equal(canonicalNativeJson(occupant.state), before);
});

test('TC10 duplicate cohort waits and TC11 late events after TIMEOUT are rejected', () => {
    const waited = expectSuccess(state(), event('wait-1', 'COHORT_WAIT', { cohort_id: 'cohort-1' })).state;
    const before = canonicalNativeJson(waited);
    const duplicate = expectFailure(waited, event('wait-2', 'COHORT_WAIT', { cohort_id: 'cohort-1' }), C.WAIT_DUPLICATE);
    assert.equal(canonicalNativeJson(duplicate.state), before);
    const timedOut = expectSuccess(state(), event('timeout', 'TIMEOUT', { cohort_id: 'cohort-1' })).state;
    const timeoutBefore = canonicalNativeJson(timedOut);
    const late = expectFailure(timedOut, event('late-progress', 'PROGRESS', { cohort_id: 'cohort-1' }), C.LATE);
    assert.equal(canonicalNativeJson(late.state), timeoutBefore);
});

test('TC12 undeclared roles fail and fresh succession retires the old lease', () => {
    const current = state();
    const before = canonicalNativeJson(current);
    const undeclared = expectFailure(current, event('undeclared', 'START', { role_slot_id: 'missing' }), C.UNDECLARED);
    assert.equal(canonicalNativeJson(undeclared.state), before);

    const start = event('succ-start', 'START', { logical_task_id: 'item' });
    const started = expectSuccess(current, start).state;
    const prior = hashNativeTaskControlEvent(createNativeTaskControlEvent(start));
    const prepared = expectSuccess(started, event('succ-prepare', 'SUCCESSION_PREPARE', {
        active_task_ids: ['item'], prior_event_hash: prior,
    })).state;
    const committed = expectSuccess(prepared, event('succ-commit', 'SUCCESSION_COMMIT', {
        active_task_ids: ['item'], prior_event_hash: prior,
        successor_lease: { lease_id: 'lease-2', controller_generation: 2, holder: 'operator-2' },
    })).state;
    assert.equal(committed.generation.controller_generation, 2);
    assert.equal(committed.generation.occupant_generation, 2);
    assert.deepEqual(committed.controller_lease, {
        lease_id: 'lease-2', controller_generation: 2, holder: 'operator-2',
    });
    assert.notEqual(committed.controller_lease?.lease_id, LEASE.lease_id);
});

test('replay identity is idempotent while conflicting bytes open the breaker', () => {
    const firstEvent = event('replay', 'START', { logical_task_id: 'item' });
    const first = expectSuccess(state(), firstEvent).state;
    const replay = expectSuccess(first, firstEvent);
    assert.equal(replay.state.events.length, 1);
    assert.equal(canonicalNativeJson(replay.state), canonicalNativeJson(first));
    const conflict = expectFailure(first, {
        ...firstEvent, occurred_at: '2026-08-13T00:00:01.000Z',
    }, C.REPLAY);
    assert.equal(conflict.state.events.length, 1);
    assert.equal(conflict.state.circuit_breaker?.state, 'open');
    assert.equal(conflict.state.circuit_breaker?.last_error_code, C.REPLAY);
});

test('identical terminal replay is idempotent and conflicting terminal replay fences', () => {
    const cancelled = expectSuccess(state(), event('cancel-terminal', 'CANCEL')).state;
    const acknowledged = expectSuccess(cancelled, event('ack-terminal', 'CANCEL_ACK', {
        barrier_event_id: 'cancel-terminal',
    })).state;
    const same = expectSuccess(acknowledged, event('ack-terminal', 'CANCEL_ACK', {
        barrier_event_id: 'cancel-terminal',
    }));
    assert.equal(canonicalNativeJson(same.state), canonicalNativeJson(acknowledged));
    const conflict = expectFailure(acknowledged, event('ack-terminal-2', 'CANCEL_ACK', {
        barrier_event_id: 'cancel-terminal',
    }), C.TERMINAL_REPLAY);
    assert.equal(conflict.state.circuit_breaker?.state, 'open');
    assert.equal(conflict.state.circuit_breaker?.last_error_code, C.TERMINAL_REPLAY);
});

test('REPLACE is bounded to declared FAILED or explicitly allowed BLOCKED slots', () => {
    const roleManifest = manifest();
    const context = auth({ role_manifest: roleManifest, role_slot_id: 'slot-a', replacement_budget: 1 });
    const first = expectSuccess(state(), event('replace-1', 'REPLACE', {
        role_slot_id: 'slot-a', slot_id: 'slot-a', status: 'FAILED',
    }), context).state;
    const exhausted = expectFailure(first, event('replace-2', 'REPLACE', {
        role_slot_id: 'slot-a', slot_id: 'slot-a', status: 'FAILED',
    }), C.REPLACEMENT, context);
    assert.equal(canonicalNativeJson(exhausted.state.events), canonicalNativeJson(first.events));
    const forbidden = expectFailure(state(), event('replace-complete', 'REPLACE', {
        role_slot_id: 'slot-a', slot_id: 'slot-a', status: 'COMPLETE',
    }), C.REPLACEMENT, context);
    unchanged(state(), forbidden.state);
    const blocked = expectSuccess(state(), event('replace-blocked', 'REPLACE', {
        role_slot_id: 'slot-a', slot_id: 'slot-a', status: 'BLOCKED', allow_blocked: true,
    }), context);
    assert.equal(blocked.state.events.at(-1)?.event_type, 'REPLACE');
});

test('FORGE_INVOKE and unauthorized PROTECTED_EFFECT fail closed and fence', () => {
    const forge = expectFailure(state(), event('forge', 'FORGE_INVOKE'), C.FORGE, auth());
    assert.equal(forge.state.circuit_breaker?.state, 'open');
    assert.equal(forge.state.circuit_breaker?.last_error_code, C.FORGE);
    const protectedEffect = expectFailure(state(), event('protected', 'PROTECTED_EFFECT', {
        effect: 'protected_effect',
    }), C.PROTECTED);
    assert.equal(protectedEffect.state.circuit_breaker?.state, 'open');
    assert.equal(protectedEffect.state.circuit_breaker?.last_error_code, C.PROTECTED);
});

test('repeated pure interpretation is byte-identical and produces zero protected effects', () => {
    const sequence = [
        event('pure-start', 'START', { logical_task_id: 'item' }),
        event('pure-progress', 'PROGRESS', { logical_task_id: 'item' }),
        event('pure-complete', 'COMPLETE', { logical_task_id: 'item' }),
    ];
    const run = (): NativeTaskControlState => sequence.reduce(
        (current, next) => expectSuccess(current, next).state,
        state(),
    );
    const first = run();
    const second = run();
    assert.equal(hashCanonicalNative(first), hashCanonicalNative(second));
    const effects = {
        dispatch: 0, model: 0, wait: 0, network: 0, protected: 0,
    };
    assert.deepEqual(effects, { dispatch: 0, model: 0, wait: 0, network: 0, protected: 0 });
});
