import { canonicalJson, hashCanonical } from './canonical.js';
import {
    NATIVE_TASK_CONTROL_ERROR_CODES,
    NativeTaskControlError,
    type NativeTaskControlErrorCode,
} from './errors.js';
import {
    buildTerminalReceipt,
    createCircuitBreaker,
    createControllerLease,
    hashEvent,
    hashRoleManifest,
    normalizeControllerLease,
    normalizeEvent,
    normalizeGoalGeneration,
    normalizeRoleManifest,
} from './receipts.js';
import { normalizePolicy, policyAllows, policyHash, policyAllowsTaskKind } from './policy.js';
import type {
    NativeCircuitBreaker,
    NativeControllerLease,
    NativeGoalGeneration,
    NativeRoleManifest,
    NativeRoleSlot,
    NativeStateMachineInput,
    NativeSuccessionPending,
    NativeTaskControlEvent,
    NativeTaskControlState,
    NativeTaskControlTransition,
    NativeTaskState,
    NativeTaskStatus,
} from '../../types/native_task_control.js';

function fail(code: NativeTaskControlErrorCode, message: string = code, details: Record<string, unknown> = {}): never {
    throw new NativeTaskControlError(code, message, details);
}

function clone<T>(value: T): T {
    return JSON.parse(canonicalJson(value)) as T;
}

function scopeId(goal: NativeGoalGeneration): string {
    return `${goal.root_id}:${goal.set_id}:${goal.phase_id}:${goal.logical_item}:${goal.partition}`;
}

function slotFor(manifest: NativeRoleManifest, roleSlotId: string): NativeRoleSlot | undefined {
    return manifest.slots.find((slot) => slot.role_slot_id === roleSlotId);
}

function openBreaker(state: NativeTaskControlState, code: string, eventHash: string): void {
    state.breaker = {
        ...state.breaker,
        state: 'OPEN',
        reason_code: code,
        opened_event_sha256: eventHash,
    };
    state.status = 'FENCED';
    state.protected_effects_fenced = true;
}

function result(
    state: NativeTaskControlState,
    eventHash: string,
    accepted: boolean,
    idempotent: boolean,
    errorCode?: string,
    terminalReceipt?: ReturnType<typeof buildTerminalReceipt>,
): NativeTaskControlTransition {
    return { state, event_sha256: eventHash, accepted, idempotent, error_code: errorCode, terminal_receipt: terminalReceipt };
}

function rejected(
    state: NativeTaskControlState,
    eventHash: string,
    error: NativeTaskControlError,
    breaker = true,
): NativeTaskControlTransition {
    if (breaker) openBreaker(state, error.code, eventHash);
    return result(state, eventHash, false, false, error.code);
}

function taskPayload(event: NativeTaskControlEvent): Record<string, unknown> {
    return event.payload ?? {};
}

function requireTaskId(event: NativeTaskControlEvent): string {
    if (!event.task_logical_id) fail(NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_CONTRACT, 'task event requires task_logical_id');
    return event.task_logical_id;
}

function ensureEventBinding(state: NativeTaskControlState, event: NativeTaskControlEvent): void {
    const identity = state.identity;
    if (event.goal_generation !== state.goal.generation) fail(NATIVE_TASK_CONTROL_ERROR_CODES.GOAL_MISMATCH, 'goal generation mismatch');
    if (event.root_id !== identity.root_id || event.bead_id !== identity.bead_id || event.set_id !== identity.set_id
        || event.phase_id !== identity.phase_id || event.logical_item !== identity.logical_item || event.partition !== identity.partition) {
        fail(NATIVE_TASK_CONTROL_ERROR_CODES.SCOPE_VIOLATION, 'event is outside the bound scope');
    }
    const payload = taskPayload(event);
    if (payload.role_manifest_sha256 !== undefined && payload.role_manifest_sha256 !== identity.role_manifest_sha256) {
        fail(NATIVE_TASK_CONTROL_ERROR_CODES.MANIFEST_DRIFT, 'event role manifest hash differs from bound manifest');
    }
    if (payload.native_surface_available === false) fail(NATIVE_TASK_CONTROL_ERROR_CODES.NATIVE_SURFACE_UNAVAILABLE, 'native task surface is unavailable');
    if (payload.requested_selector !== undefined || payload.actual_identity !== undefined) {
        if (payload.requested_selector !== payload.actual_identity || payload.actual_identity === 'unreported' || payload.selector_status === 'mismatch') {
            fail(NATIVE_TASK_CONTROL_ERROR_CODES.SELECTOR_MISMATCH, 'requested selector was not host-attested as selected');
        }
    }
    if (payload.scope_violation === true || payload.out_of_scope === true) fail(NATIVE_TASK_CONTROL_ERROR_CODES.SCOPE_VIOLATION, 'event claims an out-of-scope effect');
    if (payload.protected_effect === true) {
        const effect = typeof payload.effect === 'string' ? payload.effect : '';
        if (!effect || !policyAllows(state.effective_policy, effect)) fail(NATIVE_TASK_CONTROL_ERROR_CODES.PROTECTED_EFFECT, 'protected effect is not permitted', { effect });
    }
}

function ensureLease(state: NativeTaskControlState, event: NativeTaskControlEvent, allowSuccessor = false): void {
    if (state.lease.status !== 'ACTIVE') fail(NATIVE_TASK_CONTROL_ERROR_CODES.LEASE_NOT_ACTIVE, 'controller lease is not active');
    if (!slotFor(state.manifest, event.role_slot_id)) fail(NATIVE_TASK_CONTROL_ERROR_CODES.UNDECLARED_ROLE, 'event role slot is not manifest-declared');
    const expectedController = allowSuccessor ? state.lease.controller_generation + 1 : state.lease.controller_generation;
    const expectedOccupant = allowSuccessor ? state.lease.occupant_generation + 1 : state.lease.occupant_generation;
    if (event.controller_generation !== expectedController || event.occupant_generation !== expectedOccupant) {
        fail(NATIVE_TASK_CONTROL_ERROR_CODES.STALE_CONTROLLER, 'event has a stale controller or occupant generation');
    }
    if (!allowSuccessor && (event.role_slot_id !== state.lease.role_slot_id || event.occupant_id !== state.lease.occupant_id)) {
        fail(NATIVE_TASK_CONTROL_ERROR_CODES.COMPETING_LEASE, 'event does not hold the active controller lease');
    }
    const leaseId = taskPayload(event).lease_id;
    if (leaseId !== undefined && leaseId !== state.lease.lease_id) fail(NATIVE_TASK_CONTROL_ERROR_CODES.COMPETING_LEASE, 'event references a competing lease');
}

function append(state: NativeTaskControlState, event: NativeTaskControlEvent): void {
    const eventHash = hashEvent(event);
    state.event_log.push(eventHash);
    state.event_ids[event.event_id] = eventHash;
    state.last_event_sha256 = eventHash;
    state.identity.previous_event_sha256 = eventHash;
}

function syncIdentityGenerations(state: NativeTaskControlState): void {
    state.identity.controller_generation = state.lease.controller_generation;
    state.identity.occupant_generation = state.lease.occupant_generation;
}

function terminalReceipt(
    state: NativeTaskControlState,
    event: NativeTaskControlEvent,
    terminalKind: 'COMPLETE' | 'CANCEL_ACK' | 'REVOKED' | 'UNKNOWN' | 'TIMEOUT' | 'FENCED',
): ReturnType<typeof buildTerminalReceipt> {
    return buildTerminalReceipt({
        receipt_id: `terminal:${hashEvent(event)}`,
        root_id: state.identity.root_id,
        bead_id: state.identity.bead_id,
        set_id: state.identity.set_id,
        phase_id: state.identity.phase_id,
        logical_item: state.identity.logical_item,
        goal_generation: state.goal.generation,
        controller_generation: state.lease.controller_generation,
        occupant_generation: state.lease.occupant_generation,
        terminal_kind: terminalKind,
        terminal_event_sha256: hashEvent(event),
        breaker: state.breaker,
        protected_effects_fenced: state.protected_effects_fenced,
        accepted: true,
    });
}

function activeTaskIds(state: NativeTaskControlState): string[] {
    return Object.values(state.tasks)
        .filter((task) => ['PENDING', 'STARTED', 'PROGRESSING'].includes(task.status))
        .map((task) => task.task_logical_id)
        .sort();
}

function newTask(taskId: string, taskKind: string, event: NativeTaskControlEvent): NativeTaskState {
    return {
        task_logical_id: taskId,
        task_kind: taskKind,
        role_slot_id: event.role_slot_id,
        occupant_id: event.occupant_id,
        status: 'PENDING',
        start_event_sha256: null,
        last_event_sha256: null,
        terminal_event_sha256: null,
        replacement_count: 0,
    };
}

function integerPayload(payload: Record<string, unknown>, key: string, fallback: number): number {
    const value = payload[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) fail(NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_CONTRACT, `${key} must be a positive generation`);
    return value;
}

function updateTask(task: NativeTaskState, status: NativeTaskStatus, event: NativeTaskControlEvent): void {
    const eventHash = hashEvent(event);
    task.status = status;
    task.last_event_sha256 = eventHash;
    if (status === 'STARTED' && !task.start_event_sha256) task.start_event_sha256 = eventHash;
    if (['COMPLETE', 'FAILED', 'BLOCKED', 'CANCELLED', 'REVOKED', 'UNKNOWN'].includes(status)) task.terminal_event_sha256 = eventHash;
}

export function createNativeTaskControlState(input: NativeStateMachineInput): NativeTaskControlState {
    const manifest = normalizeRoleManifest(input.manifest);
    const policy = normalizePolicy(input.policy);
    const goal = normalizeGoalGeneration(input.goal);
    const lease = normalizeControllerLease(input.lease);
    const roleHash = hashRoleManifest(manifest);
    const effectiveHash = policyHash(policy);
    if (goal.role_manifest_sha256 !== roleHash) fail(NATIVE_TASK_CONTROL_ERROR_CODES.MANIFEST_DRIFT, 'goal role manifest hash mismatch');
    if (goal.effective_policy_sha256 !== effectiveHash) fail(NATIVE_TASK_CONTROL_ERROR_CODES.POLICY_WIDENING, 'goal effective policy hash mismatch');
    if (lease.goal_id !== goal.goal_id || lease.goal_generation !== goal.generation) fail(NATIVE_TASK_CONTROL_ERROR_CODES.GOAL_MISMATCH, 'lease goal binding mismatch');
    if (lease.controller_generation !== 1 || lease.occupant_generation !== 1) fail(NATIVE_TASK_CONTROL_ERROR_CODES.STALE_CONTROLLER, 'initial lease generations must be one');
    const controller = slotFor(manifest, lease.role_slot_id);
    if (!controller || controller.role !== 'controller') fail(NATIVE_TASK_CONTROL_ERROR_CODES.UNDECLARED_ROLE, 'lease controller role is not manifest-declared');
    const identity = {
        ...input.identity,
        role_manifest_sha256: roleHash,
        effective_policy_sha256: effectiveHash,
        previous_event_sha256: null,
    };
    if (identity.root_id !== goal.root_id || identity.bead_id !== goal.bead_id || identity.set_id !== goal.set_id
        || identity.phase_id !== goal.phase_id || identity.logical_item !== goal.logical_item || identity.partition !== goal.partition
        || identity.goal_generation !== goal.generation) fail(NATIVE_TASK_CONTROL_ERROR_CODES.GOAL_MISMATCH, 'state identity does not match goal');
    return {
        schema: 'cstar.native_task_control_state.v1',
        identity,
        goal,
        manifest,
        policy,
        effective_policy: policy,
        lease,
        status: 'OPEN',
        tasks: {},
        event_log: [],
        event_ids: {},
        last_event_sha256: null,
        termination: { active: false, requested_kind: null, terminal_kind: null, terminal_event_sha256: null, native_cancel_calls: 0 },
        succession: null,
        cohort_wait: null,
        breaker: createCircuitBreaker(scopeId(goal)),
        replacement_counts: {},
        protected_effects_fenced: false,
    };
}

export const createState = createNativeTaskControlState;

function handleTerminal(state: NativeTaskControlState, event: NativeTaskControlEvent): NativeTaskControlTransition {
    const kind = event.event_kind as 'CANCEL_ACK' | 'REVOKED' | 'UNKNOWN';
    if (!state.termination.active) {
        const error = new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.UNKNOWN_TERMINAL, 'terminal acknowledgement has no cancel/revoke barrier');
        return rejected(state, hashEvent(event), error);
    }
    if (state.termination.terminal_kind) {
        const error = new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.TERMINAL_REPLAY_CONFLICT, 'a terminal acknowledgement already exists');
        return rejected(state, hashEvent(event), error);
    }
    if (state.termination.requested_kind === 'CANCEL' && kind === 'REVOKED') {
        const error = new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.TERMINAL_REPLAY_CONFLICT, 'cancel barrier received revoke terminal');
        return rejected(state, hashEvent(event), error);
    }
    state.termination.terminal_kind = kind;
    state.termination.terminal_event_sha256 = hashEvent(event);
    state.status = 'TERMINAL';
    append(state, event);
    const receipt = terminalReceipt(state, event, kind);
    return result(state, hashEvent(event), true, false, undefined, receipt);
}

function handleSuccessionPrepare(state: NativeTaskControlState, event: NativeTaskControlEvent): NativeTaskControlTransition {
    if (state.succession) return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.SUCCESSION_OVERLAP, 'succession is already prepared'));
    const payload = taskPayload(event);
    const ids = Array.isArray(payload.active_task_ids) && payload.active_task_ids.every((id) => typeof id === 'string')
        ? [...payload.active_task_ids as string[]].sort()
        : null;
    const expected = activeTaskIds(state);
    if (!ids || new Set(ids).size !== ids.length || JSON.stringify(ids) !== JSON.stringify(expected) || payload.last_event_sha256 !== state.last_event_sha256) {
        return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.SUCCESSION_AMBIGUOUS, 'succession prepare does not bind the active task set'));
    }
    const boundLastEvent = state.last_event_sha256;
    append(state, event);
    state.succession = { prepare_event_sha256: hashEvent(event), active_task_ids: ids, last_event_sha256: boundLastEvent };
    return result(state, hashEvent(event), true, false);
}

function handleSuccessionCommit(state: NativeTaskControlState, event: NativeTaskControlEvent): NativeTaskControlTransition {
    if (!state.succession) return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.SUCCESSION_REQUIRED, 'succession commit requires prepare'));
    const payload = taskPayload(event);
    if (payload.prepare_event_sha256 !== state.succession.prepare_event_sha256) return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.SUCCESSION_AMBIGUOUS, 'succession prepare binding differs'));
    if (payload.old_lease_sha256 !== state.lease.lease_sha256) return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.SUCCESSION_OLD_LEASE, 'succession old lease differs'));
    const roleSlotId = typeof payload.successor_role_slot_id === 'string' ? payload.successor_role_slot_id : '';
    const occupantId = typeof payload.successor_occupant_id === 'string' ? payload.successor_occupant_id : '';
    const slot = slotFor(state.manifest, roleSlotId);
    if (!slot || !slot.persistent || slot.role !== 'controller' || roleSlotId !== state.lease.role_slot_id || !occupantId || occupantId === state.lease.occupant_id) return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.UNDECLARED_ROLE, 'successor is not a fresh manifest-declared persistent controller role'));
    if (event.controller_generation !== state.lease.controller_generation + 1 || event.occupant_generation !== state.lease.occupant_generation + 1) return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.STALE_CONTROLLER, 'successor generations are not incremented'));
    append(state, event);
    state.lease = createControllerLease({
        lease_id: typeof payload.successor_lease_id === 'string' ? payload.successor_lease_id : `lease:${hashEvent(event)}`,
        root_id: state.lease.root_id,
        goal_id: state.lease.goal_id,
        goal_generation: state.lease.goal_generation,
        controller_generation: state.lease.controller_generation + 1,
        role_slot_id: roleSlotId,
        occupant_id: occupantId,
        occupant_generation: state.lease.occupant_generation + 1,
        status: 'ACTIVE',
        previous_lease_sha256: state.lease.lease_sha256 ?? null,
    });
    syncIdentityGenerations(state);
    state.succession = null;
    return result(state, hashEvent(event), true, false);
}

function handleWait(state: NativeTaskControlState, event: NativeTaskControlEvent): NativeTaskControlTransition {
    if (state.cohort_wait) return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.WAIT_DUPLICATE, 'cohort already has an immutable wait'));
    const payload = taskPayload(event);
    const ids = Array.isArray(payload.task_ids) && payload.task_ids.every((id) => typeof id === 'string') ? [...payload.task_ids as string[]].sort() : null;
    const timeout = typeof payload.timeout_seconds === 'number' ? payload.timeout_seconds : null;
    if (!ids || new Set(ids).size !== ids.length || !ids.length || timeout === null || !Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 600 || payload.cohort_id === undefined) return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.WAIT_MISMATCH, 'cohort wait packet is not bounded'));
    append(state, event);
    state.cohort_wait = { schema: 'cstar.native_cohort_wait.v1', cohort_id: String(payload.cohort_id), root_id: state.identity.root_id, goal_generation: state.goal.generation, task_ids: ids, timeout_seconds: timeout as number, wait_count: 1, status: 'PENDING', wait_event_sha256: hashEvent(event), terminal_event_sha256: null };
    return result(state, hashEvent(event), true, false);
}

function handleTimeout(state: NativeTaskControlState, event: NativeTaskControlEvent): NativeTaskControlTransition {
    const payload = taskPayload(event);
    if (!state.cohort_wait || state.cohort_wait.status !== 'PENDING' || payload.cohort_id !== state.cohort_wait.cohort_id) return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.WAIT_MISMATCH, 'timeout does not match the pending cohort wait'));
    append(state, event);
    state.cohort_wait.status = 'FROZEN';
    state.cohort_wait.terminal_event_sha256 = hashEvent(event);
    state.status = 'FENCED';
    state.protected_effects_fenced = true;
    openBreaker(state, NATIVE_TASK_CONTROL_ERROR_CODES.WAIT_TIMEOUT, hashEvent(event));
    return result(state, hashEvent(event), true, false, undefined, terminalReceipt(state, event, 'TIMEOUT'));
}

function handleReplacement(state: NativeTaskControlState, event: NativeTaskControlEvent): NativeTaskControlTransition {
    const payload = taskPayload(event);
    const originalId = typeof payload.original_task_logical_id === 'string' ? payload.original_task_logical_id : '';
    const task = state.tasks[originalId];
    const count = state.replacement_counts[originalId] ?? 0;
    const slot = slotFor(state.manifest, event.role_slot_id);
    const allowBlocked = state.effective_policy.allowlists.blocked_items?.includes(originalId) ?? false;
    if (!task || !slot || (task.status !== 'FAILED' && !(task.status === 'BLOCKED' && allowBlocked))) return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.REPLACEMENT_NOT_ALLOWED, 'replacement is not allowed for this task'));
    if (count >= slot.replacement_budget) return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.REPLACEMENT_EXHAUSTED, 'replacement budget is exhausted'));
    const newTaskId = typeof payload.new_task_logical_id === 'string' ? payload.new_task_logical_id : '';
    const newOccupant = typeof payload.new_occupant_id === 'string' ? payload.new_occupant_id : '';
    const newControllerGeneration = integerPayload(payload, 'new_controller_generation', state.lease.controller_generation + 1);
    const newOccupantGeneration = integerPayload(payload, 'new_occupant_generation', state.lease.occupant_generation + 1);
    if (newControllerGeneration !== state.lease.controller_generation + 1 || newOccupantGeneration !== state.lease.occupant_generation + 1) return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.STALE_CONTROLLER, 'replacement generations must increment exactly once'));
    if (!newTaskId || !newOccupant || state.tasks[newTaskId] || newOccupant === task.occupant_id || newOccupant === state.lease.occupant_id) return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.REPLACEMENT_NOT_ALLOWED, 'replacement must use fresh task and occupant identity'));
    append(state, event);
    state.replacement_counts[originalId] = count + 1;
    state.tasks[newTaskId] = { ...newTask(newTaskId, task.task_kind, { ...event, occupant_id: newOccupant }), replacement_count: count + 1 };
    state.lease = createControllerLease({
        lease_id: typeof payload.new_lease_id === 'string' ? payload.new_lease_id : `lease:${hashEvent(event)}`,
        root_id: state.lease.root_id, goal_id: state.lease.goal_id, goal_generation: state.lease.goal_generation,
        controller_generation: newControllerGeneration, role_slot_id: state.lease.role_slot_id, occupant_id: newOccupant,
        occupant_generation: newOccupantGeneration, status: 'ACTIVE', previous_lease_sha256: state.lease.lease_sha256 ?? null,
    });
    syncIdentityGenerations(state);
    state.tasks[originalId].status = task.status;
    return result(state, hashEvent(event), true, false);
}

function handleTask(state: NativeTaskControlState, event: NativeTaskControlEvent): NativeTaskControlTransition {
    const id = requireTaskId(event);
    const slot = slotFor(state.manifest, event.role_slot_id);
    if (!slot) return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.UNDECLARED_ROLE, 'event role slot is not in manifest'));
    const taskKind = event.task_kind ?? (typeof taskPayload(event).task_kind === 'string' ? taskPayload(event).task_kind as string : 'work');
    if (!policyAllowsTaskKind(slot.policy, taskKind) || (slot.allowed_task_kinds.length > 0 && !slot.allowed_task_kinds.includes(taskKind))) return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.UNDECLARED_ROLE, 'task kind is not allowed by role slot'));
    const existing = state.tasks[id];
    if (event.event_kind === 'START' && existing?.status === 'COMPLETE') return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.GENERATION_LOOP, 'completed task restarted under unchanged goal generation'));
    if (event.event_kind === 'START' && existing && existing.status !== 'PENDING') return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.REPLAY_CONFLICT, 'task already has a non-pending start state'));
    const task = existing ?? newTask(id, taskKind, event);
    if (event.event_kind === 'START') updateTask(task, 'STARTED', event);
    else if (event.event_kind === 'PROGRESS') {
        if (!existing || !['STARTED', 'PROGRESSING'].includes(existing.status)) return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.STALE_CONTROLLER, 'progress requires an active task'));
        updateTask(task, 'PROGRESSING', event);
    } else if (event.event_kind === 'COMPLETE') {
        if (!existing || !['STARTED', 'PROGRESSING'].includes(existing.status)) return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.STALE_CONTROLLER, 'complete requires an active task'));
        updateTask(task, 'COMPLETE', event);
    } else if (event.event_kind === 'FAIL') updateTask(task, 'FAILED', event);
    else if (event.event_kind === 'BLOCK') updateTask(task, 'BLOCKED', event);
    else return rejected(state, hashEvent(event), new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.REPLAY_CONFLICT, 'event is not a task lifecycle event'), false);
    state.tasks[id] = task;
    append(state, event);
    const receipt = event.event_kind === 'COMPLETE' ? terminalReceipt(state, event, 'COMPLETE') : undefined;
    return result(state, hashEvent(event), true, false, undefined, receipt);
}

/** Apply one already-bound event without any external side effects. */
export function applyTaskControlEvent(inputState: NativeTaskControlState, inputEvent: NativeTaskControlEvent): NativeTaskControlTransition {
    const state = clone(inputState);
    let event: NativeTaskControlEvent;
    try { event = normalizeEvent(inputEvent); } catch (error) {
        const code = error instanceof NativeTaskControlError ? error.code : NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_CONTRACT;
        return rejected(state, hashCanonical({ invalid_event: true, code }), new NativeTaskControlError(code, error instanceof Error ? error.message : code));
    }
    const eventHash = hashEvent(event);
    const previousForId = state.event_ids[event.event_id];
    if (previousForId && previousForId !== eventHash) return rejected(state, eventHash, new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.REPLAY_CONFLICT, 'event id was reused with different bytes'));
    if (state.event_log.includes(eventHash)) return result(state, eventHash, true, true);
    try {
        ensureEventBinding(state, event);
        if (event.previous_event_sha256 !== state.last_event_sha256) fail(NATIVE_TASK_CONTROL_ERROR_CODES.REPLAY_CONFLICT, 'previous event hash does not bind the current state');
        if (event.event_sequence !== state.event_log.length + 1) fail(NATIVE_TASK_CONTROL_ERROR_CODES.EVENT_SEQUENCE, 'event sequence is not the next sequence');
        if (event.event_kind === 'FORGE_INVOCATION') fail(NATIVE_TASK_CONTROL_ERROR_CODES.FORGE_DEFUNCT, 'Forge is tombstoned permanently');
        if (state.cohort_wait?.status === 'FROZEN' && event.event_kind !== 'TIMEOUT') fail(NATIVE_TASK_CONTROL_ERROR_CODES.LATE_EVENT, 'event arrived after cohort timeout');
        if (state.breaker.state === 'OPEN') fail(NATIVE_TASK_CONTROL_ERROR_CODES.BREAKER_OPEN, 'scope circuit breaker is open');
        if (state.status === 'TERMINAL' || state.termination.active) {
            if (['CANCEL_ACK', 'REVOKED', 'UNKNOWN'].includes(event.event_kind)) { ensureLease(state, event); return handleTerminal(state, event); }
            fail(state.termination.terminal_kind ? NATIVE_TASK_CONTROL_ERROR_CODES.TERMINAL_BARRIER : NATIVE_TASK_CONTROL_ERROR_CODES.CANCEL_ACK_MISSING, 'terminal barrier rejects this event');
        }
        if (state.succession && event.event_kind !== 'SUCCESSION_COMMIT' && event.event_kind !== 'SUCCESSION_PREPARE') {
            fail(NATIVE_TASK_CONTROL_ERROR_CODES.SUCCESSION_REQUIRED, 'succession prepare freezes admission until commit');
        }
        if (event.event_kind === 'CANCEL' || event.event_kind === 'REVOKE') {
            ensureLease(state, event);
            if (state.termination.active || state.termination.native_cancel_calls >= 1) fail(NATIVE_TASK_CONTROL_ERROR_CODES.CANCEL_ALREADY_REQUESTED, 'only one cancel/revoke call is permitted');
            state.termination.active = true;
            state.termination.requested_kind = event.event_kind;
            state.termination.native_cancel_calls = 1;
            append(state, event);
            return result(state, eventHash, true, false);
        }
        if (['CANCEL_ACK', 'REVOKED', 'UNKNOWN'].includes(event.event_kind)) { ensureLease(state, event); return handleTerminal(state, event); }
        if (event.event_kind === 'SUCCESSION_PREPARE') { ensureLease(state, event); return handleSuccessionPrepare(state, event); }
        if (event.event_kind === 'SUCCESSION_COMMIT') return handleSuccessionCommit(state, event);
        if (event.event_kind === 'COHORT_WAIT') { ensureLease(state, event); return handleWait(state, event); }
        if (event.event_kind === 'TIMEOUT') return handleTimeout(state, event);
        if (event.event_kind === 'REPLACEMENT') { ensureLease(state, event); return handleReplacement(state, event); }
        if (['RETRY', 'REPLAY', 'AUTO_CONTINUATION'].includes(event.event_kind)) return rejected(state, eventHash, new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.IMPLICIT_REACQUISITION, 'retry, replay, and auto-continuation require a fresh goal and explicit succession'));
        ensureLease(state, event);
        return handleTask(state, event);
    } catch (error) {
        const typed = error instanceof NativeTaskControlError ? error : new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_CONTRACT, error instanceof Error ? error.message : 'invalid event');
        return rejected(state, eventHash, typed, true);
    }
}

export const applyEvent = applyTaskControlEvent;

export function transitionOrThrow(state: NativeTaskControlState, event: NativeTaskControlEvent): NativeTaskControlState {
    const transition = applyTaskControlEvent(state, event);
    if (!transition.accepted) throw new NativeTaskControlError((transition.error_code ?? NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_CONTRACT) as NativeTaskControlErrorCode);
    return transition.state;
}

export function breakerIsOpen(state: NativeTaskControlState): boolean {
    return state.breaker.state === 'OPEN';
}

export function nativeCancelCallCount(state: NativeTaskControlState): number {
    return state.termination.native_cancel_calls;
}

export function protectedEffectsFenced(state: NativeTaskControlState): boolean {
    return state.protected_effects_fenced;
}
