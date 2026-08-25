import { NativeTaskControlError, NATIVE_TASK_CONTROL_ERROR_CODES } from './errors.js';
import { normalizeNativeTaskControlPolicy } from './policy.js';
import {
    createNativeCircuitBreaker, createNativeCohortWait, createNativeControllerLease,
    createNativeGoalGeneration, createNativeSuccessionReceipt, createNativeTaskControlEvent,
    hashNativeTaskControlEvent, validateNativeRoleManifest,
} from './receipts.js';
import type {
    JsonValue, NativeCircuitBreaker, NativeControllerLease, NativeGoalGeneration,
    NativeRoleManifest, NativeSuccessionReceipt, NativeTaskControlEvent, NativeTaskControlPolicy, NativeTaskControlState,
    NativeTransitionResult,
} from '../../types/native_task_control.js';

export const NATIVE_TASK_CONTROL_RESULT_CODES = Object.freeze({
    GENERATION_LOOP: 'CSTAR_NATIVE_TASK_GENERATION_LOOP', STALE_CONTROLLER: 'CSTAR_NATIVE_TASK_STALE_CONTROLLER',
    SCOPE_VIOLATION: 'CSTAR_NATIVE_TASK_SCOPE_VIOLATION', REPLAY_CONFLICT: 'CSTAR_NATIVE_TASK_REPLAY_CONFLICT',
    PROTECTED_EFFECT: 'CSTAR_NATIVE_TASK_PROTECTED_EFFECT', SELECTOR_MISMATCH: 'CSTAR_NATIVE_TASK_SELECTOR_MISMATCH',
    GOAL_MISMATCH: 'CSTAR_NATIVE_TASK_GOAL_MISMATCH', COMPETING_LEASE: 'CSTAR_NATIVE_TASK_COMPETING_LEASE',
    CANCEL_ACK_MISSING: 'CSTAR_NATIVE_TASK_CANCEL_ACK_MISSING', CANCEL_DUPLICATE: 'CSTAR_NATIVE_TASK_CANCEL_DUPLICATE',
    TERMINAL_BARRIER: 'CSTAR_NATIVE_TASK_TERMINAL_BARRIER', TERMINAL_REPLAY_CONFLICT: 'CSTAR_NATIVE_TASK_TERMINAL_REPLAY_CONFLICT',
    SUCCESSION_OVERLAP: 'CSTAR_NATIVE_TASK_SUCCESSION_OVERLAP', SUCCESSION_AMBIGUOUS: 'CSTAR_NATIVE_TASK_SUCCESSION_AMBIGUOUS',
    WAIT_DUPLICATE: 'CSTAR_NATIVE_TASK_WAIT_DUPLICATE', LATE_EVENT: 'CSTAR_NATIVE_TASK_LATE_EVENT',
    UNDECLARED_ROLE: 'CSTAR_NATIVE_TASK_UNDECLARED_ROLE', REPLACEMENT_EXHAUSTED: 'CSTAR_NATIVE_TASK_REPLACEMENT_EXHAUSTED',
    SURFACE_UNAVAILABLE: 'CORVUS_NATIVE_TASK_SURFACE_UNAVAILABLE', FORGE_DEFUNCT: 'CSTAR_FORGE_DEFUNCT',
} as const);

export interface NativeTaskControlStateInput {
    generation?: NativeGoalGeneration; goal_generation?: number; controller_generation?: number;
    occupant_generation?: number; policy: NativeTaskControlPolicy; controller_lease?: NativeControllerLease;
    role_manifest?: NativeRoleManifest; events?: readonly NativeTaskControlEvent[]; circuit_breaker?: NativeCircuitBreaker;
}
export interface NativeTaskControlContext {
    controller_lease?: NativeControllerLease; lease?: NativeControllerLease; expected_controller_lease?: NativeControllerLease;
    role_manifest?: NativeRoleManifest; manifest?: NativeRoleManifest; allow_protected_effect?: boolean;
    protected_effect?: boolean; allowlisted_blocked_replacement?: boolean; allow_blocked_replacement?: boolean;
}
type RecordValue = { [key: string]: unknown };
type Succession = { active: string[]; prior_event_hash: string; prepare_event_id: string; committed: boolean };
type Barrier = { event_type: 'CANCEL' | 'REVOKE'; event_id: string };
type InternalState = {
    event_hashes: Map<string, string>; last_event_hash?: string; native_cancel_call_count: number; barrier?: Barrier;
    terminal_type?: 'CANCEL_ACK' | 'REVOKED' | 'UNKNOWN'; completed: Set<string>; active: Set<string>;
    statuses: Map<string, string>; cohorts: Map<string, JsonValue>; timed_out_cohorts: Set<string>;
    succession?: Succession; replacements: Set<string>; role_manifest?: NativeRoleManifest; effects_fenced: boolean;
};
const STATE_METADATA = new WeakMap<object, InternalState>();

function isRecord(value: unknown): value is RecordValue { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function freezeDeep<T>(value: T): T {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value); for (const child of Object.values(value as RecordValue)) freezeDeep(child);
    }
    return value;
}
function body(event: NativeTaskControlEvent): RecordValue { return isRecord(event.payload) ? event.payload : {}; }
function text(value: unknown): string | undefined { return typeof value === 'string' && value.length > 0 ? value : undefined; }
function integer(value: unknown): number | undefined { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined; }
function taskId(event: NativeTaskControlEvent): string | undefined {
    const value = body(event); for (const key of ['logical_task_id', 'logical_item_id', 'logical_id', 'item_id', 'task_id']) {
        const id = text(value[key]); if (id !== undefined) return id;
    } return undefined;
}
function slotId(event: NativeTaskControlEvent): string | undefined { return text(body(event).role_slot_id); }
function copyMetadata(meta: InternalState): InternalState {
    return {
        event_hashes: new Map(meta.event_hashes), last_event_hash: meta.last_event_hash,
        native_cancel_call_count: meta.native_cancel_call_count, barrier: meta.barrier && { ...meta.barrier },
        terminal_type: meta.terminal_type, completed: new Set(meta.completed), active: new Set(meta.active),
        statuses: new Map(meta.statuses), cohorts: new Map(meta.cohorts), timed_out_cohorts: new Set(meta.timed_out_cohorts),
        succession: meta.succession && { ...meta.succession, active: [...meta.succession.active] },
        replacements: new Set(meta.replacements), role_manifest: meta.role_manifest, effects_fenced: meta.effects_fenced,
    };
}
function emptyMetadata(role_manifest?: NativeRoleManifest): InternalState {
    return {
        event_hashes: new Map(), native_cancel_call_count: 0, completed: new Set(), active: new Set(),
        statuses: new Map(), cohorts: new Map(), timed_out_cohorts: new Set(), replacements: new Set(), role_manifest, effects_fenced: false,
    };
}
function taskSet(value: unknown): { present: boolean; ambiguous: boolean; ids: string[] } {
    if (value === undefined) return { present: false, ambiguous: false, ids: [] };
    if (!Array.isArray(value)) return { present: true, ambiguous: true, ids: [] };
    const ids: string[] = [];
    for (const item of value) {
        const id = typeof item === 'string' ? text(item) : isRecord(item)
            ? text(item.logical_task_id) ?? text(item.logical_item_id) ?? text(item.logical_id) : undefined;
        if (id === undefined) return { present: true, ambiguous: true, ids: [] }; ids.push(id);
    }
    const unique = [...new Set(ids)].sort(); return { present: true, ambiguous: unique.length !== ids.length, ids: unique };
}
function activeSet(value: RecordValue): { present: boolean; ambiguous: boolean; ids: string[] } {
    for (const key of ['active_logical_task_set', 'active_logical_task_ids', 'active_task_set', 'active_task_ids', 'logical_task_ids', 'task_set']) {
        if (Object.prototype.hasOwnProperty.call(value, key)) return taskSet(value[key]);
    } return { present: false, ambiguous: false, ids: [] };
}
function sameIds(left: Iterable<string>, right: readonly string[]): boolean { return [...left].sort().join('\u0000') === [...right].sort().join('\u0000'); }

function recordEvent(meta: InternalState, event: NativeTaskControlEvent, hash: string): void {
    meta.event_hashes.set(event.event_id, hash); meta.last_event_hash = hash; const id = taskId(event);
    if (event.event_type === 'START' || event.event_type === 'PROGRESS' || event.event_type === 'REPLACE') {
        if (id !== undefined) { meta.active.add(id); meta.statuses.set(id, 'RUNNING'); }
    } else if (event.event_type === 'COMPLETE') {
        if (id !== undefined) { meta.active.delete(id); meta.completed.add(id); meta.statuses.set(id, 'COMPLETE'); }
    } else if (event.event_type === 'CANCEL' || event.event_type === 'REVOKE') {
        if (meta.barrier === undefined) { meta.barrier = { event_type: event.event_type, event_id: event.event_id }; meta.native_cancel_call_count += 1; }
    } else if (event.event_type === 'CANCEL_ACK' || event.event_type === 'REVOKED' || event.event_type === 'UNKNOWN') {
        meta.terminal_type = event.event_type;
    } else if (event.event_type === 'COHORT_WAIT') {
        const cohort = text(body(event).cohort_id); if (cohort !== undefined) meta.cohorts.set(cohort, event.payload ?? null);
    } else if (event.event_type === 'TIMEOUT') {
        const cohort = text(body(event).cohort_id); if (cohort !== undefined) meta.timed_out_cohorts.add(cohort);
    } else if (event.event_type === 'SUCCESSION_PREPARE') {
        const set = activeSet(body(event)); const prior = text(body(event).prior_event_hash) ?? '';
        if (set.present && !set.ambiguous && prior.length > 0) meta.succession = { active: set.ids, prior_event_hash: prior, prepare_event_id: event.event_id, committed: false };
    } else if (event.event_type === 'SUCCESSION_COMMIT' && meta.succession !== undefined) meta.succession.committed = true;
    if (event.event_type === 'REPLACE' && id !== undefined) meta.replacements.add(`${id}\u0000${slotId(event) ?? ''}`);
}
function deriveMetadata(state: NativeTaskControlState): InternalState {
    const meta = emptyMetadata(); for (const raw of state.events) { const event = createNativeTaskControlEvent(raw); recordEvent(meta, event, hashNativeTaskControlEvent(event)); }
    if (state.circuit_breaker?.state === 'open') meta.effects_fenced = true; return meta;
}
function metadata(state: NativeTaskControlState): InternalState { return STATE_METADATA.get(state) ?? deriveMetadata(state); }
function defaultBreaker(): NativeCircuitBreaker { return createNativeCircuitBreaker({ state: 'closed', failure_count: 0, threshold: 1 }); }
function buildState(source: NativeTaskControlState, events: readonly NativeTaskControlEvent[], generation: NativeGoalGeneration, lease: NativeControllerLease | undefined, meta: InternalState, breaker: NativeCircuitBreaker): NativeTaskControlState {
    const next: NativeTaskControlState = { schema: 'cstar.native_task_control_state.v1', generation: createNativeGoalGeneration(generation), policy: freezeDeep(source.policy), events: [...events], circuit_breaker: createNativeCircuitBreaker(breaker) };
    if (lease !== undefined) next.controller_lease = createNativeControllerLease(lease);
    if (source.terminal_receipt !== undefined) next.terminal_receipt = freezeDeep(source.terminal_receipt);
    const frozen = freezeDeep(next); STATE_METADATA.set(frozen, meta); return frozen;
}
function openBreaker(state: NativeTaskControlState, meta: InternalState, code: string): NativeTaskControlState {
    const current = state.circuit_breaker ?? defaultBreaker(); if (current.state === 'open') return state;
    const nextMeta = copyMetadata(meta); nextMeta.effects_fenced = true;
    return buildState(state, state.events, state.generation, state.controller_lease, nextMeta, { state: 'open', failure_count: current.failure_count + 1, threshold: current.threshold, last_error_code: code });
}
function failure(state: NativeTaskControlState, meta: InternalState, code: string, opens = false): NativeTransitionResult {
    return { ok: false, state: opens ? openBreaker(state, meta, code) : state, error_code: code };
}
function accepted(state: NativeTaskControlState, meta: InternalState, event: NativeTaskControlEvent, generation = state.generation, lease = state.controller_lease): NativeTransitionResult {
    const nextMeta = copyMetadata(meta); recordEvent(nextMeta, event, hashNativeTaskControlEvent(event));
    return { ok: true, state: buildState(state, [...state.events, event], generation, lease, nextMeta, state.circuit_breaker ?? defaultBreaker()), event };
}
function generationFailure(state: NativeTaskControlState, event: NativeTaskControlEvent): string | undefined {
    const actual = event.generation;
    if (actual === undefined || actual.goal_generation !== state.generation.goal_generation) return NATIVE_TASK_CONTROL_RESULT_CODES.GOAL_MISMATCH;
    if (actual.controller_generation !== state.generation.controller_generation || actual.occupant_generation !== state.generation.occupant_generation) return NATIVE_TASK_CONTROL_RESULT_CODES.STALE_CONTROLLER;
    return undefined;
}
function leaseFailure(state: NativeTaskControlState, event: NativeTaskControlEvent, context: NativeTaskControlContext): string | undefined {
    const expected = context.controller_lease ?? context.expected_controller_lease ?? context.lease; const value = body(event);
    if (state.controller_lease !== undefined && ((text(value.controller_lease_id) !== undefined && text(value.controller_lease_id) !== state.controller_lease.lease_id) || (text(value.controller_holder) !== undefined && text(value.controller_holder) !== state.controller_lease.holder))) return NATIVE_TASK_CONTROL_RESULT_CODES.COMPETING_LEASE;
    if (expected === undefined) return undefined;
    let normalized: NativeControllerLease; try { normalized = createNativeControllerLease(expected); } catch { return NATIVE_TASK_CONTROL_RESULT_CODES.STALE_CONTROLLER; }
    if (normalized.controller_generation !== state.generation.controller_generation) return NATIVE_TASK_CONTROL_RESULT_CODES.STALE_CONTROLLER;
    if (state.controller_lease !== undefined && (normalized.lease_id !== state.controller_lease.lease_id || normalized.holder !== state.controller_lease.holder)) return NATIVE_TASK_CONTROL_RESULT_CODES.COMPETING_LEASE;
    return undefined;
}
function taskAdmission(state: NativeTaskControlState, meta: InternalState, event: NativeTaskControlEvent, context: NativeTaskControlContext): string | undefined {
    const source = context.role_manifest ?? context.manifest ?? meta.role_manifest; if (source === undefined) return NATIVE_TASK_CONTROL_RESULT_CODES.UNDECLARED_ROLE;
    let manifest: NativeRoleManifest; try { manifest = validateNativeRoleManifest(source); } catch { return NATIVE_TASK_CONTROL_RESULT_CODES.UNDECLARED_ROLE; }
    const value = body(event); const slot = slotId(event); if (slot === undefined || !manifest.slots.some((item) => item.role_slot_id === slot)) return NATIVE_TASK_CONTROL_RESULT_CODES.UNDECLARED_ROLE;
    const kinds = state.policy.allowlists.task_kinds; const kind = text(value.task_kind) ?? text(value.kind);
    if (kinds !== undefined && kinds.length > 0 && (kind === undefined || !kinds.includes(kind))) return NATIVE_TASK_CONTROL_RESULT_CODES.SCOPE_VIOLATION;
    const effects = state.policy.allowlists.effects; const supplied: string[] = []; const effect = text(value.effect); if (effect !== undefined) supplied.push(effect);
    if (Array.isArray(value.effects)) { for (const item of value.effects) { if (typeof item !== 'string') return NATIVE_TASK_CONTROL_RESULT_CODES.SCOPE_VIOLATION; supplied.push(item); } }
    if (effects !== undefined && supplied.some((item) => !effects.includes(item))) return NATIVE_TASK_CONTROL_RESULT_CODES.SCOPE_VIOLATION;
    return value.scope_violation === true ? NATIVE_TASK_CONTROL_RESULT_CODES.SCOPE_VIOLATION : undefined;
}
function terminalAdmission(state: NativeTaskControlState, meta: InternalState, event: NativeTaskControlEvent): NativeTransitionResult {
    if (meta.barrier === undefined) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.CANCEL_ACK_MISSING);
    if (meta.terminal_type !== undefined) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.TERMINAL_REPLAY_CONFLICT, true);
    return accepted(state, meta, event);
}
function successionPrepare(state: NativeTaskControlState, meta: InternalState, event: NativeTaskControlEvent): NativeTransitionResult {
    if (meta.succession !== undefined) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.SUCCESSION_OVERLAP);
    const value = body(event); const set = activeSet(value); const prior = text(value.prior_event_hash);
    if (!set.present || set.ambiguous || prior === undefined || meta.last_event_hash === undefined || prior !== meta.last_event_hash || !sameIds(meta.active, set.ids)) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.SUCCESSION_AMBIGUOUS);
    return accepted(state, meta, event);
}
function successionCommit(state: NativeTaskControlState, meta: InternalState, event: NativeTaskControlEvent): NativeTransitionResult {
    const prepared = meta.succession; if (prepared === undefined || prepared.committed) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.SUCCESSION_OVERLAP);
    const value = body(event); const set = activeSet(value); const prior = text(value.prior_event_hash); const prepareHash = meta.event_hashes.get(prepared.prepare_event_id); if (!set.present || set.ambiguous || (prior !== prepared.prior_event_hash && prior !== prepareHash) || !sameIds(prepared.active, set.ids)) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.SUCCESSION_AMBIGUOUS);
    const expected = { goal_generation: state.generation.goal_generation, controller_generation: state.generation.controller_generation + 1, occupant_generation: state.generation.occupant_generation + 1 };
    let nextGeneration = expected;
    if (value.next_generation !== undefined || value.fresh_generation !== undefined) { try { nextGeneration = createNativeGoalGeneration((value.next_generation ?? value.fresh_generation) as NativeGoalGeneration); } catch { return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.SUCCESSION_AMBIGUOUS); } if (nextGeneration.goal_generation !== expected.goal_generation || nextGeneration.controller_generation !== expected.controller_generation || nextGeneration.occupant_generation !== expected.occupant_generation) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.SUCCESSION_AMBIGUOUS); }
    const leaseInput = value.next_lease ?? value.next_controller_lease ?? value.fresh_lease; if (leaseInput === undefined) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.SUCCESSION_AMBIGUOUS);
    let nextLease: NativeControllerLease; try { nextLease = createNativeControllerLease(leaseInput as NativeControllerLease); } catch { return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.SUCCESSION_AMBIGUOUS); }
    if (nextLease.controller_generation !== expected.controller_generation || (state.controller_lease !== undefined && nextLease.lease_id === state.controller_lease.lease_id)) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.SUCCESSION_AMBIGUOUS);
    if (value.receipt !== undefined) { try { const receipt = createNativeSuccessionReceipt(value.receipt as NativeSuccessionReceipt); if (receipt.previous_controller_generation !== state.generation.controller_generation || receipt.next_controller_generation !== expected.controller_generation) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.SUCCESSION_AMBIGUOUS); } catch { return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.SUCCESSION_AMBIGUOUS); } }
    return accepted(state, meta, event, nextGeneration, nextLease);
}
function cohortEvent(state: NativeTaskControlState, meta: InternalState, event: NativeTaskControlEvent): NativeTransitionResult {
    const value = body(event); const cohort = text(value.cohort_id); if (cohort === undefined) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.SUCCESSION_AMBIGUOUS);
    if (event.event_type === 'TIMEOUT') { if (meta.timed_out_cohorts.has(cohort)) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.LATE_EVENT); return accepted(state, meta, event); }
    if (meta.cohorts.has(cohort)) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.WAIT_DUPLICATE);
    const required = integer(value.required); const observed = integer(value.observed); if (required === undefined || observed === undefined) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.SUCCESSION_AMBIGUOUS);
    try { const wait: Record<string, unknown> = { wait_id: text(value.wait_id) ?? event.event_id, cohort_id: cohort, required, observed, satisfied: typeof value.satisfied === 'boolean' ? value.satisfied : observed >= required }; if (integer(value.deadline_ms) !== undefined) wait.deadline_ms = value.deadline_ms; createNativeCohortWait(wait as never); } catch { return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.SUCCESSION_AMBIGUOUS); }
    return accepted(state, meta, event);
}
function taskEvent(state: NativeTaskControlState, meta: InternalState, event: NativeTaskControlEvent, context: NativeTaskControlContext): NativeTransitionResult {
    const value = body(event); const cohort = text(value.cohort_id); if (cohort !== undefined && meta.timed_out_cohorts.has(cohort)) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.LATE_EVENT);
    const admission = taskAdmission(state, meta, event, context); if (admission !== undefined) return failure(state, meta, admission); const id = taskId(event);
    if (event.event_type === 'START' && id !== undefined && meta.completed.has(id)) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.GENERATION_LOOP, true);
    if (event.event_type === 'REPLACE') {
        const key = `${id ?? ''}\u0000${slotId(event) ?? ''}`; if (meta.replacements.has(key)) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.REPLACEMENT_EXHAUSTED);
        const status = (text(value.prior_status) ?? text(value.status) ?? '').toUpperCase(); const allowedBlocked = context.allowlisted_blocked_replacement === true || context.allow_blocked_replacement === true || value.blocked_allowlisted === true || value.allowlisted === true;
        if (value.unknown === true || value.cancelled === true || value.revoked === true || value.scope_violation === true || value.protected_effect === true || value.ambiguous_spend === true || (status !== 'FAILED' && !(status === 'BLOCKED' && allowedBlocked))) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.REPLACEMENT_EXHAUSTED);
    }
    return accepted(state, meta, event);
}

export function createNativeTaskControlState(input: NativeTaskControlStateInput): NativeTaskControlState {
    const raw = input as unknown as RecordValue; const sourceGeneration = raw.generation ?? { goal_generation: raw.goal_generation, controller_generation: raw.controller_generation, occupant_generation: raw.occupant_generation };
    const generation = createNativeGoalGeneration(sourceGeneration as NativeGoalGeneration); const policy = freezeDeep(normalizeNativeTaskControlPolicy(input.policy));
    let lease: NativeControllerLease | undefined; if (input.controller_lease !== undefined) { lease = createNativeControllerLease(input.controller_lease); if (lease.controller_generation !== generation.controller_generation) throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_JSON, { reason: 'lease generation mismatch' }); }
    const roleManifest = input.role_manifest === undefined ? undefined : validateNativeRoleManifest(input.role_manifest);
    const events = (input.events ?? []).map((event) => createNativeTaskControlEvent(event)); const breaker = input.circuit_breaker === undefined ? defaultBreaker() : createNativeCircuitBreaker(input.circuit_breaker);
    const state: NativeTaskControlState = { schema: 'cstar.native_task_control_state.v1', generation, policy, events, circuit_breaker: breaker }; if (lease !== undefined) state.controller_lease = lease;
    const frozen = freezeDeep(state); const meta = emptyMetadata(roleManifest); for (const event of events) recordEvent(meta, event, hashNativeTaskControlEvent(event)); STATE_METADATA.set(frozen, meta); return frozen;
}
export function applyNativeTaskControlEvent(state: NativeTaskControlState, inputEvent: NativeTaskControlEvent, context: NativeTaskControlContext = {}): NativeTransitionResult {
    let event: NativeTaskControlEvent; try { event = createNativeTaskControlEvent(inputEvent); } catch (error) { const code = error instanceof NativeTaskControlError ? error.code : NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_JSON; return { ok: false, state, error_code: code }; }
    const meta = metadata(state); const eventHash = hashNativeTaskControlEvent(event); const priorHash = meta.event_hashes.get(event.event_id);
    if (priorHash !== undefined) { if (priorHash === eventHash) return { ok: true, state, event }; return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.REPLAY_CONFLICT, true); }
    if (state.circuit_breaker?.state === 'open' || meta.effects_fenced) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.TERMINAL_BARRIER);
    const generationError = generationFailure(state, event); if (generationError !== undefined) return failure(state, meta, generationError); const leaseError = leaseFailure(state, event, context); if (leaseError !== undefined) return failure(state, meta, leaseError);
    if (event.event_type === 'FORGE_INVOKE') return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.FORGE_DEFUNCT, true);
    if (event.event_type === 'PROTECTED_EFFECT') { const permitted = context.allow_protected_effect === true || context.protected_effect === true || state.policy.effect_permissions.protected_effect === true; if (!permitted) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.PROTECTED_EFFECT, true); return accepted(state, meta, event); }
    if (event.event_type === 'CANCEL' || event.event_type === 'REVOKE') { if (meta.barrier !== undefined) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.CANCEL_DUPLICATE); if (meta.completed.size > 0 && meta.active.size === 0) return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.TERMINAL_BARRIER); return accepted(state, meta, event); }
    if (event.event_type === 'CANCEL_ACK' || event.event_type === 'REVOKED' || event.event_type === 'UNKNOWN') return terminalAdmission(state, meta, event);
    if (meta.barrier !== undefined) return failure(state, meta, meta.terminal_type === undefined ? NATIVE_TASK_CONTROL_RESULT_CODES.CANCEL_ACK_MISSING : NATIVE_TASK_CONTROL_RESULT_CODES.TERMINAL_BARRIER);
    if (event.event_type === 'SUCCESSION_PREPARE') return successionPrepare(state, meta, event); if (event.event_type === 'SUCCESSION_COMMIT') return successionCommit(state, meta, event); if (event.event_type === 'COHORT_WAIT' || event.event_type === 'TIMEOUT') return cohortEvent(state, meta, event);
    if (event.event_type === 'START' || event.event_type === 'PROGRESS' || event.event_type === 'COMPLETE' || event.event_type === 'REPLACE') return taskEvent(state, meta, event, context);
    return failure(state, meta, NATIVE_TASK_CONTROL_RESULT_CODES.SURFACE_UNAVAILABLE);
}
export function nativeCancelCallCount(state: NativeTaskControlState): number { return metadata(state).native_cancel_call_count; }
