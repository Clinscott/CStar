import {
    canonicalNativeJson,
    hashCanonicalNative,
} from './canonical.js';
import {
    createNativeControllerLease,
    createNativeGoalGeneration,
    createNativeTaskControlEvent,
    hashNativeRoleManifest,
    hashNativeTaskControlEvent,
} from './receipts.js';
import {
    normalizeNativeTaskControlPolicy,
} from './policy.js';
import {
    NativeTaskControlError,
    failNativeTaskControl,
    NATIVE_TASK_CONTROL_ERROR_CODES,
} from './errors.js';
import type {
    JsonValue,
    NativeCircuitBreaker,
    NativeControllerLease,
    NativeGoalGeneration,
    NativeRoleManifest,
    NativeRoleSlot,
    NativeTaskControlEvent,
    NativeTaskControlPolicy,
    NativeTaskControlState,
    NativeTransitionResult,
} from '../../types/native_task_control.js';
const EVENT_TYPES = new Set([
    'START', 'PROGRESS', 'COMPLETE', 'CANCEL', 'CANCEL_ACK', 'REVOKE', 'REVOKED',
    'UNKNOWN', 'SUCCESSION_PREPARE', 'SUCCESSION_COMMIT', 'COHORT_WAIT', 'TIMEOUT',
    'REPLACE', 'FORGE_INVOKE', 'PROTECTED_EFFECT',
]);
const CODE = {
    GOAL: 'CSTAR_NATIVE_TASK_GOAL_MISMATCH',
    COMPETING: 'CSTAR_NATIVE_TASK_COMPETING_LEASE',
    CANCEL_MISSING: 'CSTAR_NATIVE_TASK_CANCEL_ACK_MISSING',
    CANCEL_DUPLICATE: 'CSTAR_NATIVE_TASK_CANCEL_DUPLICATE',
    TERMINAL: 'CSTAR_NATIVE_TASK_TERMINAL_BARRIER',
    TERMINAL_REPLAY: 'CSTAR_NATIVE_TASK_TERMINAL_REPLAY_CONFLICT',
    SUCCESSION_OVERLAP: 'CSTAR_NATIVE_TASK_SUCCESSION_OVERLAP',
    SUCCESSION_AMBIGUOUS: 'CSTAR_NATIVE_TASK_SUCCESSION_AMBIGUOUS',
    WAIT_DUPLICATE: 'CSTAR_NATIVE_TASK_WAIT_DUPLICATE',
    LATE_EVENT: 'CSTAR_NATIVE_TASK_LATE_EVENT',
    UNDECLARED_ROLE: 'CSTAR_NATIVE_TASK_UNDECLARED_ROLE',
    REPLACEMENT: 'CSTAR_NATIVE_TASK_REPLACEMENT_EXHAUSTED',
} as const;
type AnyRecord = Record<string, unknown>;
class MachineFailure extends Error {
    constructor(readonly code: string) { super(code); }
}
function fail(code: string): never { throw new MachineFailure(code); }
function isRecord(value: unknown): value is AnyRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function own(value: AnyRecord, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}
function text(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
function integer(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}
function stringAt(value: AnyRecord, ...keys: string[]): string | undefined {
    for (const key of keys) {
        const result = text(value[key]);
        if (result !== undefined) return result;
    }
    return undefined;
}
function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value as AnyRecord)) deepFreeze(child);
        Object.freeze(value);
    }
    return value;
}
function cloneJson(value: unknown): JsonValue {
    return JSON.parse(canonicalNativeJson(value)) as JsonValue;
}
function generationOf(value: unknown): NativeGoalGeneration {
    try { return createNativeGoalGeneration(value); }
    catch (error) { throw error; }
}
function sameGeneration(left: NativeGoalGeneration, right: NativeGoalGeneration): boolean {
    return left.goal_generation === right.goal_generation
        && left.controller_generation === right.controller_generation
        && left.occupant_generation === right.occupant_generation;
}
function sameGoal(left: NativeGoalGeneration, right: NativeGoalGeneration): boolean {
    return left.goal_generation === right.goal_generation;
}
function defaultBreaker(): NativeCircuitBreaker {
    return { state: 'closed', failure_count: 0, threshold: 1 };
}
function freezeState(input: {
    generation: NativeGoalGeneration;
    policy: NativeTaskControlPolicy;
    events: readonly NativeTaskControlEvent[];
    controller_lease?: NativeControllerLease;
    circuit_breaker?: NativeTaskControlState['circuit_breaker'];
    terminal_receipt?: NativeTaskControlState['terminal_receipt'];
}): NativeTaskControlState {
    const state: NativeTaskControlState = {
        schema: 'cstar.native_task_control_state.v1',
        generation: {
            goal_generation: input.generation.goal_generation,
            controller_generation: input.generation.controller_generation,
            occupant_generation: input.generation.occupant_generation,
        },
        policy: normalizeNativeTaskControlPolicy(input.policy),
        events: input.events.map((event) => createNativeTaskControlEvent(event)),
        circuit_breaker: input.circuit_breaker
            ? cloneJson(input.circuit_breaker) as unknown as NativeCircuitBreaker
            : defaultBreaker(),
    };
    if (input.controller_lease !== undefined) {
        state.controller_lease = createNativeControllerLease(input.controller_lease);
    }
    if (input.terminal_receipt !== undefined) state.terminal_receipt = cloneJson(input.terminal_receipt) as unknown as NativeTaskControlState['terminal_receipt'];
    return deepFreeze(state);
}

export function createNativeTaskControlState(input: unknown): NativeTaskControlState {
    if (!isRecord(input)) failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_JSON, { reason: 'state must be an object' });
    if (own(input, 'schema') && input.schema !== 'cstar.native_task_control_state.v1') {
        failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_JSON, { reason: 'invalid state schema' });
    }
    if (!own(input, 'generation') || !own(input, 'policy')) {
        failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_JSON, { reason: 'generation and policy are required' });
    }
    const generation = generationOf(input.generation);
    const policy = normalizeNativeTaskControlPolicy(input.policy);
    const rawEvents = input.events === undefined ? [] : input.events;
    if (!Array.isArray(rawEvents)) failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_JSON, { reason: 'events must be an array' });
    const events = rawEvents.map((event) => createNativeTaskControlEvent(event));
    const ids = new Set<string>();
    for (const event of events) {
        if (ids.has(event.event_id)) fail(NATIVE_TASK_CONTROL_ERROR_CODES.REPLAY_CONFLICT);
        ids.add(event.event_id);
    }
    const lease = input.controller_lease === undefined
        ? undefined
        : createNativeControllerLease(input.controller_lease);
    const breaker = input.circuit_breaker === undefined
        ? defaultBreaker()
        : cloneJson(input.circuit_breaker) as unknown as NativeCircuitBreaker;
    const terminal = input.terminal_receipt === undefined
        ? undefined
        : cloneJson(input.terminal_receipt) as unknown as NativeTaskControlState['terminal_receipt'];
    return freezeState({ generation, policy, events, controller_lease: lease, circuit_breaker: breaker, terminal_receipt: terminal });
}

interface ControlContext {
    generation: NativeGoalGeneration;
    policy: NativeTaskControlPolicy;
    lease?: NativeControllerLease;
    manifest?: NativeRoleManifest;
    role_slot_id?: string;
    requested_model?: string;
    requested_reasoning?: string;
    actual_identity?: string;
    allow_blocked?: boolean;
    replacement_budget?: number;
    successor_lease?: NativeControllerLease;
}

function parseManifest(input: unknown): NativeRoleManifest {
    if (!isRecord(input) || input.schema !== 'cstar.native_role_manifest.v1') fail(CODE.UNDECLARED_ROLE);
    const strings = ['manifest_id', 'root_id', 'bead_id', 'set_id', 'phase_id'];
    const values: AnyRecord = {};
    for (const key of strings) {
        const value = text(input[key]);
        if (value === undefined) fail(CODE.UNDECLARED_ROLE);
        values[key] = value;
    }
    const maxPersistent = integer(input.max_persistent_role_slots);
    const maxTotal = integer(input.max_total_role_slots);
    if (maxPersistent === undefined || maxPersistent < 0 || maxTotal === undefined || maxTotal < 0 || !Array.isArray(input.slots)) {
        fail(CODE.UNDECLARED_ROLE);
    }
    const ids = new Set<string>();
    const slots: NativeRoleSlot[] = input.slots.map((candidate) => {
        if (!isRecord(candidate)) fail(CODE.UNDECLARED_ROLE);
        const slot: NativeRoleSlot = {
            role_slot_id: text(candidate.role_slot_id) ?? fail(CODE.UNDECLARED_ROLE),
            role: text(candidate.role) ?? fail(CODE.UNDECLARED_ROLE),
            persistent: candidate.persistent === true,
            requested_model: text(candidate.requested_model) ?? fail(CODE.UNDECLARED_ROLE),
            requested_reasoning: text(candidate.requested_reasoning) ?? fail(CODE.UNDECLARED_ROLE),
            actual_identity: text(candidate.actual_identity) ?? 'unreported',
            descendants_max: integer(candidate.descendants_max) ?? fail(CODE.UNDECLARED_ROLE),
        };
        if (slot.descendants_max < 0 || ids.has(slot.role_slot_id)) fail(CODE.UNDECLARED_ROLE);
        ids.add(slot.role_slot_id);
        return slot;
    });
    if (slots.length > maxTotal || slots.filter((slot) => slot.persistent).length > maxPersistent) fail(CODE.UNDECLARED_ROLE);
    return deepFreeze({
        schema: 'cstar.native_role_manifest.v1', ...values,
        max_persistent_role_slots: maxPersistent, max_total_role_slots: maxTotal, slots,
    } as NativeRoleManifest);
}

function parseContext(input: unknown, state: NativeTaskControlState): ControlContext {
    const record = isRecord(input) ? input : {};
    const rawGeneration = record.generation !== undefined
        ? record.generation
        : (record.goal_generation !== undefined || record.controller_generation !== undefined || record.occupant_generation !== undefined
            ? { goal_generation: record.goal_generation, controller_generation: record.controller_generation, occupant_generation: record.occupant_generation }
            : state.generation);
    const generation = generationOf(rawGeneration);
    const policy = record.policy === undefined ? state.policy : normalizeNativeTaskControlPolicy(record.policy);
    if (hashCanonicalNative(policy) !== hashCanonicalNative(state.policy)) fail(CODE.GOAL);
    const rawLease = record.controller_lease ?? record.lease;
    const lease = rawLease === undefined ? state.controller_lease : createNativeControllerLease(rawLease);
    const rawManifest = record.role_manifest ?? record.manifest;
    const manifest = rawManifest === undefined ? undefined : parseManifest(rawManifest);
    const selector = isRecord(record.selector) ? record.selector : {};
    const roleSlot = text(record.role_slot_id) ?? text(selector.role_slot_id);
    const requestedModel = text(record.requested_model) ?? text(selector.requested_model);
    const requestedReasoning = text(record.requested_reasoning) ?? text(selector.requested_reasoning);
    const replacementBudget = integer(record.replacement_budget);
    const successor = record.successor_lease ?? record.successor_controller_lease;
    return {
        generation, policy, lease, manifest, role_slot_id: roleSlot,
        requested_model: requestedModel, requested_reasoning: requestedReasoning,
        actual_identity: text(record.actual_identity) ?? text(selector.actual_identity),
        allow_blocked: record.allow_blocked === true || record.blocked_allowlisted === true,
        replacement_budget: replacementBudget,
        successor_lease: successor === undefined ? undefined : createNativeControllerLease(successor),
    };
}

function payloadOf(event: NativeTaskControlEvent): AnyRecord {
    return isRecord(event.payload) ? event.payload : {};
}
function eventGeneration(event: NativeTaskControlEvent, state: NativeTaskControlState): NativeGoalGeneration {
    return event.generation ?? state.generation;
}
function logicalKey(value: AnyRecord): string | undefined {
    return stringAt(value, 'logical_task_id', 'logical_item_id', 'logical_key', 'task_id', 'item_id', 'slot_id');
}
function cohortId(value: AnyRecord): string | undefined {
    return stringAt(value, 'cohort_id', 'cohort');
}
function activeSet(payload: AnyRecord): string[] {
    const candidates = ['active_logical_task_ids', 'active_task_ids', 'active_logical_tasks', 'logical_task_ids', 'active_tasks', 'active_set'];
    const found: string[][] = [];
    for (const key of candidates) {
        if (!own(payload, key)) continue;
        if (!Array.isArray(payload[key])) fail(CODE.SUCCESSION_AMBIGUOUS);
        const values = (payload[key] as unknown[]).map((item) => {
            if (typeof item === 'string') return text(item);
            return isRecord(item) ? stringAt(item, 'logical_task_id', 'logical_item_id', 'logical_key', 'task_id', 'id') : undefined;
        });
        if (values.some((item) => item === undefined)) fail(CODE.SUCCESSION_AMBIGUOUS);
        const normalized = (values as string[]).sort();
        if (normalized.length === 0 || new Set(normalized).size !== normalized.length) fail(CODE.SUCCESSION_AMBIGUOUS);
        found.push(normalized);
    }
    if (found.length === 0 || found.some((set) => set.join('\u0000') !== found[0].join('\u0000'))) fail(CODE.SUCCESSION_AMBIGUOUS);
    return found[0];
}
function priorHash(payload: AnyRecord): string {
    const value = stringAt(payload, 'prior_event_hash', 'previous_event_hash', 'prior_hash', 'previous_hash');
    if (value === undefined || !/^[0-9a-f]{64}$/i.test(value)) fail(CODE.SUCCESSION_AMBIGUOUS);
    return value.toLowerCase();
}
function findEvent(state: NativeTaskControlState, type: string, key?: string): NativeTaskControlEvent | undefined {
    return state.events.find((candidate) => candidate.event_type === type
        && (key === undefined || logicalKey(payloadOf(candidate)) === key));
}
function matchingBarrier(state: NativeTaskControlState): NativeTaskControlEvent | undefined {
    return state.events.find((event) => event.event_type === 'CANCEL' || event.event_type === 'REVOKE');
}
function terminalReferenceMatches(event: NativeTaskControlEvent, barrier: NativeTaskControlEvent): boolean {
    const payload = payloadOf(event);
    const reference = stringAt(payload, 'barrier_event_id', 'cancel_event_id', 'revoke_event_id', 'termination_event_id');
    if (reference !== undefined) return reference === barrier.event_id;
    const left = logicalKey(payload);
    const right = logicalKey(payloadOf(barrier));
    return (left === undefined || right === undefined || left === right)
        && sameGoal(event.generation ?? barrier.generation ?? { goal_generation: 1, controller_generation: 1, occupant_generation: 1 }, barrier.generation ?? event.generation ?? { goal_generation: 1, controller_generation: 1, occupant_generation: 1 });
}
function roleFor(event: NativeTaskControlEvent, context: ControlContext): NativeRoleSlot | undefined {
    const payload = payloadOf(event);
    const selected = stringAt(payload, 'role_slot_id', 'slot_id', 'role') ?? context.role_slot_id;
    if (selected === undefined) return context.manifest?.slots.length === 1 ? context.manifest.slots[0] : undefined;
    if (context.manifest === undefined) fail(CODE.UNDECLARED_ROLE);
    const slot = context.manifest.slots.find((candidate) => candidate.role_slot_id === selected || candidate.role === selected);
    if (slot === undefined) fail(CODE.UNDECLARED_ROLE);
    const model = stringAt(payload, 'requested_model') ?? context.requested_model;
    const reasoning = stringAt(payload, 'requested_reasoning') ?? context.requested_reasoning;
    if ((model !== undefined && model !== slot.requested_model) || (reasoning !== undefined && reasoning !== slot.requested_reasoning)) {
        fail(NATIVE_TASK_CONTROL_ERROR_CODES.SELECTOR_MISMATCH);
    }
    return slot;
}
function checkAuthority(state: NativeTaskControlState, event: NativeTaskControlEvent, context: ControlContext): NativeControllerLease | undefined {
    const expected = context.generation;
    if (expected.goal_generation !== state.generation.goal_generation) fail(CODE.GOAL);
    if (expected.controller_generation !== state.generation.controller_generation || expected.occupant_generation !== state.generation.occupant_generation) fail(NATIVE_TASK_CONTROL_ERROR_CODES.STALE_CONTROLLER);
    const actual = event.generation ?? expected;
    if (actual.goal_generation !== expected.goal_generation) fail(CODE.GOAL);
    if (actual.controller_generation !== expected.controller_generation || actual.occupant_generation !== expected.occupant_generation) fail(NATIVE_TASK_CONTROL_ERROR_CODES.STALE_CONTROLLER);
    if (state.controller_lease !== undefined && context.lease !== undefined
        && (state.controller_lease.lease_id !== context.lease.lease_id || state.controller_lease.holder !== context.lease.holder)) fail(CODE.COMPETING);
    const lease = context.lease ?? state.controller_lease;
    if (lease === undefined || lease.controller_generation !== state.generation.controller_generation) fail(NATIVE_TASK_CONTROL_ERROR_CODES.STALE_CONTROLLER);
    const payload = payloadOf(event);
    const leaseId = stringAt(payload, 'lease_id', 'controller_lease_id');
    const holder = stringAt(payload, 'holder', 'controller');
    if ((leaseId !== undefined && leaseId !== lease.lease_id) || (holder !== undefined && holder !== lease.holder)) fail(CODE.COMPETING);
    return lease;
}
function checkScope(state: NativeTaskControlState, event: NativeTaskControlEvent): void {
    const payload = payloadOf(event);
    const taskKind = stringAt(payload, 'task_kind', 'kind');
    const effects = Array.isArray(payload.effects)
        ? (payload.effects as unknown[]).map(text)
        : [stringAt(payload, 'effect')];
    if (state.policy.allowlists.task_kinds !== undefined
        && (taskKind === undefined || !state.policy.allowlists.task_kinds.includes(taskKind))) fail(NATIVE_TASK_CONTROL_ERROR_CODES.SCOPE_VIOLATION);
    if (state.policy.allowlists.effects !== undefined
        && (effects.some((effect) => effect === undefined || !state.policy.allowlists.effects!.includes(effect)))) fail(NATIVE_TASK_CONTROL_ERROR_CODES.SCOPE_VIOLATION);
    const prohibited = new Set(state.policy.prohibitions);
    if (prohibited.has('*') || prohibited.has(event.event_type) || (taskKind !== undefined && prohibited.has(taskKind)) || effects.some((effect) => effect !== undefined && prohibited.has(effect))) fail(NATIVE_TASK_CONTROL_ERROR_CODES.SCOPE_VIOLATION);
}
function fencedState(state: NativeTaskControlState, code: string): NativeTaskControlState {
    const prior = state.circuit_breaker ?? defaultBreaker();
    return freezeState({
        generation: state.generation, policy: state.policy, events: state.events,
        controller_lease: state.controller_lease,
        circuit_breaker: {
            state: 'open', failure_count: prior.failure_count + 1,
            threshold: prior.threshold, last_error_code: code,
        }, terminal_receipt: state.terminal_receipt,
    });
}
function resultFailure(state: NativeTaskControlState, code: string, fence = false): NativeTransitionResult {
    return { ok: false, state: fence ? fencedState(state, code) : state, error_code: code };
}
function appendEvent(state: NativeTaskControlState, event: NativeTaskControlEvent, context: ControlContext, generation = state.generation, lease = context.lease ?? state.controller_lease): NativeTaskControlState {
    return freezeState({ generation, policy: state.policy, events: [...state.events, event], controller_lease: lease, circuit_breaker: state.circuit_breaker, terminal_receipt: state.terminal_receipt });
}
function blockedCohort(state: NativeTaskControlState, id: string): boolean {
    return state.events.some((event) => event.event_type === 'TIMEOUT' && cohortId(payloadOf(event)) === id);
}
function replacementStatus(payload: AnyRecord): string | undefined {
    return stringAt(payload, 'input_status', 'prior_status', 'from_status', 'previous_status', 'status');
}

export function applyNativeTaskControlEvent(
    state: NativeTaskControlState,
    event: unknown,
    context: unknown,
): NativeTransitionResult {
    let base: NativeTaskControlState;
    let parsed: NativeTaskControlEvent;
    try {
        base = createNativeTaskControlState(state);
        parsed = createNativeTaskControlEvent(event);
    } catch (error) {
        const code = error instanceof NativeTaskControlError ? error.code : NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_JSON;
        return resultFailure(state, code);
    }
    const hash = hashNativeTaskControlEvent(parsed);
    const existing = base.events.find((candidate) => candidate.event_id === parsed.event_id);
    if (existing !== undefined) {
        if (hashNativeTaskControlEvent(existing) !== hash) return resultFailure(base, NATIVE_TASK_CONTROL_ERROR_CODES.REPLAY_CONFLICT, true);
        return { ok: true, state: freezeState({ generation: base.generation, policy: base.policy, events: base.events, controller_lease: base.controller_lease, circuit_breaker: base.circuit_breaker, terminal_receipt: base.terminal_receipt }), event: existing };
    }
    if (!EVENT_TYPES.has(parsed.event_type)) return resultFailure(state, NATIVE_TASK_CONTROL_ERROR_CODES.SCOPE_VIOLATION);
    if (base.circuit_breaker?.state === 'open' && parsed.event_type !== 'FORGE_INVOKE') return resultFailure(state, base.circuit_breaker.last_error_code ?? NATIVE_TASK_CONTROL_ERROR_CODES.SCOPE_VIOLATION);
    if (parsed.event_type === 'FORGE_INVOKE') return resultFailure(base, NATIVE_TASK_CONTROL_ERROR_CODES.FORGE_DEFUNCT, true);

    let control: ControlContext;
    try {
        control = parseContext(context, base);
        checkAuthority(base, parsed, control);
        if (parsed.event_type === 'PROTECTED_EFFECT' && base.policy.effect_permissions.protected_effect !== true) {
            return resultFailure(base, NATIVE_TASK_CONTROL_ERROR_CODES.PROTECTED_EFFECT, true);
        }
        checkScope(base, parsed);
        const slot = roleFor(parsed, control);
        const barrier = matchingBarrier(base);
        const terminalEvent = parsed.event_type === 'CANCEL_ACK' || parsed.event_type === 'REVOKED' || parsed.event_type === 'UNKNOWN';
        if (barrier !== undefined && parsed.event_type === 'CANCEL' || barrier !== undefined && parsed.event_type === 'REVOKE') fail(CODE.CANCEL_DUPLICATE);
        if (barrier !== undefined && terminalEvent) {
            if (base.events.some((candidate) => candidate.event_type === 'CANCEL_ACK' || candidate.event_type === 'REVOKED' || candidate.event_type === 'UNKNOWN')) fail(CODE.TERMINAL_REPLAY);
            const expectedTerminal = barrier.event_type === 'CANCEL' ? (parsed.event_type === 'CANCEL_ACK' || parsed.event_type === 'UNKNOWN') : (parsed.event_type === 'REVOKED' || parsed.event_type === 'UNKNOWN');
            if (!expectedTerminal || !terminalReferenceMatches(parsed, barrier)) fail(CODE.CANCEL_MISSING);
        } else if (barrier !== undefined && parsed.event_type !== 'CANCEL' && parsed.event_type !== 'REVOKE') {
            fail(CODE.TERMINAL);
        }
        if (terminalEvent && barrier === undefined) fail(CODE.CANCEL_MISSING);
        const payload = payloadOf(parsed);
        const cohort = cohortId(payload);
        if (cohort !== undefined && blockedCohort(base, cohort) && parsed.event_type !== 'TIMEOUT') fail(CODE.LATE_EVENT);
        if (base.events.some((candidate) => candidate.event_type === 'SUCCESSION_PREPARE')
            && (parsed.event_type === 'START' || parsed.event_type === 'REPLACE')) fail(CODE.SUCCESSION_OVERLAP);
        if (parsed.event_type === 'START') {
            const key = logicalKey(payload);
            if (key !== undefined && findEvent(base, 'COMPLETE', key) !== undefined) {
                const complete = findEvent(base, 'COMPLETE', key)!;
                if (sameGoal(eventGeneration(complete, base), control.generation)) fail(NATIVE_TASK_CONTROL_ERROR_CODES.GENERATION_LOOP);
            }
        }
        if (parsed.event_type === 'CANCEL' || parsed.event_type === 'REVOKE') {
            return { ok: true, state: appendEvent(base, parsed, control), event: parsed };
        }
        if (parsed.event_type === 'CANCEL_ACK' || parsed.event_type === 'REVOKED' || parsed.event_type === 'UNKNOWN') {
            return { ok: true, state: appendEvent(base, parsed, control), event: parsed };
        }
        if (parsed.event_type === 'SUCCESSION_PREPARE') {
            if (base.events.some((candidate) => candidate.event_type === 'SUCCESSION_PREPARE')) fail(CODE.SUCCESSION_OVERLAP);
            const set = activeSet(payload);
            const hashValue = priorHash(payload);
            const previous = base.events.at(-1);
            if (previous === undefined || hashNativeTaskControlEvent(previous) !== hashValue) fail(CODE.SUCCESSION_AMBIGUOUS);
            const manifestHash = stringAt(payload, 'manifest_hash', 'role_manifest_hash');
            if (manifestHash !== undefined && (control.manifest === undefined || manifestHash !== hashNativeRoleManifest(control.manifest))) fail(CODE.SUCCESSION_AMBIGUOUS);
            void set;
            return { ok: true, state: appendEvent(base, parsed, control), event: parsed };
        }
        if (parsed.event_type === 'SUCCESSION_COMMIT') {
            const prepare = base.events.find((candidate) => candidate.event_type === 'SUCCESSION_PREPARE');
            if (prepare === undefined) fail(CODE.SUCCESSION_AMBIGUOUS);
            if (base.events.some((candidate) => candidate.event_type === 'SUCCESSION_COMMIT')) fail(CODE.SUCCESSION_OVERLAP);
            const preparedSet = activeSet(payloadOf(prepare));
            const commitSet = activeSet(payload);
            if (preparedSet.join('\u0000') !== commitSet.join('\u0000') || priorHash(payload) !== priorHash(payloadOf(prepare))) fail(CODE.SUCCESSION_AMBIGUOUS);
            const successorRaw = payload.successor_lease ?? payload.successor_controller_lease ?? payload.next_lease ?? control.successor_lease;
            if (successorRaw === undefined) fail(CODE.SUCCESSION_AMBIGUOUS);
            const successor = createNativeControllerLease(successorRaw);
            if (successor.controller_generation !== base.generation.controller_generation + 1) fail(CODE.SUCCESSION_AMBIGUOUS);
            return {
                ok: true,
                state: appendEvent(base, parsed, control, {
                    goal_generation: base.generation.goal_generation,
                    controller_generation: base.generation.controller_generation + 1,
                    occupant_generation: base.generation.occupant_generation + 1,
                }, successor),
                event: parsed,
            };
        }
        if (parsed.event_type === 'COHORT_WAIT') {
            const id = cohortId(payload);
            if (id === undefined) fail(CODE.CANCEL_MISSING);
            if (blockedCohort(base, id)) fail(CODE.LATE_EVENT);
            if (base.events.some((candidate) => candidate.event_type === 'COHORT_WAIT' && cohortId(payloadOf(candidate)) === id)) fail(CODE.WAIT_DUPLICATE);
            return { ok: true, state: appendEvent(base, parsed, control), event: parsed };
        }
        if (parsed.event_type === 'TIMEOUT') {
            const id = cohortId(payload);
            if (id === undefined) fail(CODE.LATE_EVENT);
            if (blockedCohort(base, id)) fail(CODE.LATE_EVENT);
            return { ok: true, state: appendEvent(base, parsed, control), event: parsed };
        }
        if (parsed.event_type === 'REPLACE') {
            if (slot === undefined || control.manifest === undefined) fail(CODE.UNDECLARED_ROLE);
            const status = replacementStatus(payload);
            const blockedAllowed = status === 'BLOCKED' && (payload.allow_blocked === true || control.allow_blocked === true);
            if (status !== 'FAILED' && !blockedAllowed) fail(CODE.REPLACEMENT);
            const spend = payload.spend ?? payload.cost ?? payload.protected_effect;
            if ((typeof spend === 'number' && spend > 0) || spend === true || payload.scope_violation === true) fail(CODE.REPLACEMENT);
            const budget = control.replacement_budget ?? integer(payload.replacement_budget) ?? base.policy.maxima.retries ?? 1;
            const used = base.events.filter((candidate) => candidate.event_type === 'REPLACE' && logicalKey(payloadOf(candidate)) === (slot.role_slot_id)).length;
            if (budget <= used) fail(CODE.REPLACEMENT);
            return { ok: true, state: appendEvent(base, parsed, control), event: parsed };
        }
        if (parsed.event_type === 'PROTECTED_EFFECT') {
            if (base.policy.effect_permissions.protected_effect !== true) return resultFailure(base, NATIVE_TASK_CONTROL_ERROR_CODES.PROTECTED_EFFECT, true);
        }
        return { ok: true, state: appendEvent(base, parsed, control), event: parsed };
    } catch (error) {
        const rawCode = error instanceof MachineFailure
            ? error.code
            : error instanceof NativeTaskControlError ? error.code : NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_JSON;
        const code = parsed.event_type === 'REPLACE'
            && (rawCode === NATIVE_TASK_CONTROL_ERROR_CODES.SCOPE_VIOLATION || rawCode === NATIVE_TASK_CONTROL_ERROR_CODES.PROTECTED_EFFECT)
            ? CODE.REPLACEMENT : rawCode;
        const fence = code === NATIVE_TASK_CONTROL_ERROR_CODES.REPLAY_CONFLICT
            || code === NATIVE_TASK_CONTROL_ERROR_CODES.GENERATION_LOOP
            || code === CODE.TERMINAL_REPLAY
            || code === NATIVE_TASK_CONTROL_ERROR_CODES.FORGE_DEFUNCT
            || code === NATIVE_TASK_CONTROL_ERROR_CODES.PROTECTED_EFFECT;
        return resultFailure(base, code, fence);
    }
}

export function nativeCancelCallCount(state: NativeTaskControlState): number {
    if (!state || !Array.isArray(state.events)) return 0;
    return state.events.reduce((count, event) => count + (event.event_type === 'CANCEL' || event.event_type === 'REVOKE' ? 1 : 0), 0);
}
