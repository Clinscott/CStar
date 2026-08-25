import {
    canonicalNativeJson,
    hashCanonicalNative,
    parseStrictNativeJson,
} from './canonical.js';
import {
    failNativeTaskControl,
    NATIVE_TASK_CONTROL_ERROR_CODES,
} from './errors.js';
import type {
    JsonValue,
    NativeCircuitBreaker,
    NativeCohortWait,
    NativeControllerLease,
    NativeGoalGeneration,
    NativeRoleManifest,
    NativeSuccessionReceipt,
    NativeTaskControlEvent,
} from '../../types/native_task_control.js';

const EVENT_TYPES = new Set([
    'START', 'PROGRESS', 'COMPLETE', 'CANCEL', 'CANCEL_ACK', 'REVOKE', 'REVOKED',
    'UNKNOWN', 'SUCCESSION_PREPARE', 'SUCCESSION_COMMIT', 'COHORT_WAIT', 'TIMEOUT',
    'REPLACE', 'FORGE_INVOKE', 'PROTECTED_EFFECT',
]);

type RecordValue = { [key: string]: unknown };

const invalid = (reason: string, details: Record<string, unknown> = {}): never =>
    failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_JSON, { reason, ...details });

function isRecord(value: unknown): value is RecordValue {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    }
    return value;
}

function cloneObject(value: unknown, allowedKeys: readonly string[]): RecordValue {
    if (!isRecord(value)) return invalid('value must be an object');
    const canonical = canonicalNativeJson(value);
    const parsed = parseStrictNativeJson(canonical, { allowedKeys: { '': allowedKeys } });
    if (!isRecord(parsed)) return invalid('value must be an object');
    return parsed;
}

function requiredString(value: RecordValue, key: string): string {
    const candidate = value[key];
    if (typeof candidate !== 'string' || candidate.length === 0) return invalid(`${key} must be a non-empty string`);
    return candidate;
}

function optionalString(value: RecordValue, key: string): string | undefined {
    if (!Object.prototype.hasOwnProperty.call(value, key)) return undefined;
    const candidate = value[key];
    if (typeof candidate !== 'string' || candidate.length === 0) return invalid(`${key} must be a non-empty string`);
    return candidate;
}

function nonNegativeInteger(value: unknown, key: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        return invalid(`${key} must be a non-negative safe integer`);
    }
    return value;
}

function generation(value: unknown): NativeGoalGeneration {
    const parsed = cloneObject(value, ['goal_generation', 'controller_generation', 'occupant_generation']);
    const result = {
        goal_generation: nonNegativeInteger(parsed.goal_generation, 'goal_generation'),
        controller_generation: nonNegativeInteger(parsed.controller_generation, 'controller_generation'),
        occupant_generation: nonNegativeInteger(parsed.occupant_generation, 'occupant_generation'),
    };
    return deepFreeze(result);
}

function lease(value: unknown): NativeControllerLease {
    const parsed = cloneObject(value, ['lease_id', 'controller_generation', 'holder', 'issued_at', 'expires_at']);
    const result: NativeControllerLease = {
        lease_id: requiredString(parsed, 'lease_id'),
        controller_generation: nonNegativeInteger(parsed.controller_generation, 'controller_generation'),
        holder: requiredString(parsed, 'holder'),
    };
    const issuedAt = optionalString(parsed, 'issued_at');
    const expiresAt = optionalString(parsed, 'expires_at');
    if (issuedAt !== undefined) result.issued_at = issuedAt;
    if (expiresAt !== undefined) result.expires_at = expiresAt;
    return deepFreeze(result);
}

function roleSlot(value: unknown): NativeRoleManifest['slots'][number] {
    const parsed = cloneObject(value, [
        'role_slot_id', 'role', 'persistent', 'requested_model', 'requested_reasoning', 'actual_identity',
        'descendants_max',
    ]);
    const persistent = parsed.persistent;
    if (typeof persistent !== 'boolean') return invalid('persistent must be boolean');
    return deepFreeze({
        role_slot_id: requiredString(parsed, 'role_slot_id'),
        role: requiredString(parsed, 'role'),
        persistent,
        requested_model: requiredString(parsed, 'requested_model'),
        requested_reasoning: requiredString(parsed, 'requested_reasoning'),
        actual_identity: requiredString(parsed, 'actual_identity'),
        descendants_max: nonNegativeInteger(parsed.descendants_max, 'descendants_max'),
    });
}

function roleManifest(value: unknown): NativeRoleManifest {
    const parsed = cloneObject(value, [
        'schema', 'manifest_id', 'root_id', 'bead_id', 'set_id', 'phase_id',
        'max_persistent_role_slots', 'max_total_role_slots', 'slots',
    ]);
    if (parsed.schema !== 'cstar.native_role_manifest.v1') return invalid('schema must be cstar.native_role_manifest.v1');
    if (!Array.isArray(parsed.slots)) return invalid('slots must be an array');
    const slots = parsed.slots.map(roleSlot);
    const ids = new Set<string>();
    for (const slot of slots) {
        if (ids.has(slot.role_slot_id)) return invalid('role_slot_id must be unique');
        ids.add(slot.role_slot_id);
    }
    const result: NativeRoleManifest = {
        schema: 'cstar.native_role_manifest.v1',
        manifest_id: requiredString(parsed, 'manifest_id'),
        root_id: requiredString(parsed, 'root_id'),
        bead_id: requiredString(parsed, 'bead_id'),
        set_id: requiredString(parsed, 'set_id'),
        phase_id: requiredString(parsed, 'phase_id'),
        max_persistent_role_slots: nonNegativeInteger(parsed.max_persistent_role_slots, 'max_persistent_role_slots'),
        max_total_role_slots: nonNegativeInteger(parsed.max_total_role_slots, 'max_total_role_slots'),
        slots,
    };
    if (result.max_persistent_role_slots > result.max_total_role_slots) return invalid('role slot maxima are inconsistent');
    if (slots.length > result.max_total_role_slots) return invalid('slots exceed max_total_role_slots');
    if (slots.filter((slot) => slot.persistent).length > result.max_persistent_role_slots) {
        return invalid('persistent slots exceed max_persistent_role_slots');
    }
    return deepFreeze(result);
}

function jsonPayload(value: unknown): JsonValue {
    try {
        const canonical = canonicalNativeJson(value);
        return deepFreeze(parseStrictNativeJson(canonical));
    } catch (error) {
        throw error;
    }
}

export function hashNativeRoleManifest(manifest: NativeRoleManifest): string {
    return hashCanonicalNative(roleManifest(manifest));
}

export function hashNativeTaskControlEvent(event: NativeTaskControlEvent): string {
    return hashCanonicalNative(createNativeTaskControlEvent(event));
}

export function createNativeGoalGeneration(input: NativeGoalGeneration): NativeGoalGeneration {
    return generation(input);
}

export function createNativeControllerLease(input: NativeControllerLease): NativeControllerLease {
    return lease(input);
}

export function createNativeTaskControlEvent(input: NativeTaskControlEvent): NativeTaskControlEvent {
    const parsed = cloneObject(input, ['event_id', 'event_type', 'occurred_at', 'generation', 'payload']);
    const eventType = requiredString(parsed, 'event_type');
    if (!EVENT_TYPES.has(eventType)) return invalid(`unsupported event_type: ${eventType}`);
    const result: NativeTaskControlEvent = {
        event_id: requiredString(parsed, 'event_id'),
        event_type: eventType,
        occurred_at: requiredString(parsed, 'occurred_at'),
    };
    if (Object.prototype.hasOwnProperty.call(parsed, 'generation')) {
        result.generation = generation(parsed.generation);
    }
    if (Object.prototype.hasOwnProperty.call(parsed, 'payload')) {
        result.payload = jsonPayload(parsed.payload);
    }
    return deepFreeze(result);
}

export function createNativeSuccessionReceipt(input: NativeSuccessionReceipt): NativeSuccessionReceipt {
    const parsed = cloneObject(input, [
        'receipt_id', 'previous_controller_generation', 'next_controller_generation', 'accepted_at', 'reason',
    ]);
    const previous = nonNegativeInteger(parsed.previous_controller_generation, 'previous_controller_generation');
    const next = nonNegativeInteger(parsed.next_controller_generation, 'next_controller_generation');
    if (next !== previous + 1) return invalid('next_controller_generation must increment by one');
    const result: NativeSuccessionReceipt = {
        receipt_id: requiredString(parsed, 'receipt_id'),
        previous_controller_generation: previous,
        next_controller_generation: next,
        accepted_at: requiredString(parsed, 'accepted_at'),
    };
    const reason = optionalString(parsed, 'reason');
    if (reason !== undefined) result.reason = reason;
    return deepFreeze(result);
}

export function createNativeCohortWait(input: NativeCohortWait): NativeCohortWait {
    const parsed = cloneObject(input, ['wait_id', 'cohort_id', 'required', 'observed', 'deadline_ms', 'satisfied']);
    const satisfied = parsed.satisfied;
    if (typeof satisfied !== 'boolean') return invalid('satisfied must be boolean');
    const result: NativeCohortWait = {
        wait_id: requiredString(parsed, 'wait_id'),
        cohort_id: requiredString(parsed, 'cohort_id'),
        required: nonNegativeInteger(parsed.required, 'required'),
        observed: nonNegativeInteger(parsed.observed, 'observed'),
        satisfied,
    };
    if (Object.prototype.hasOwnProperty.call(parsed, 'deadline_ms')) {
        result.deadline_ms = nonNegativeInteger(parsed.deadline_ms, 'deadline_ms');
    }
    return deepFreeze(result);
}

export function createNativeCircuitBreaker(input: NativeCircuitBreaker): NativeCircuitBreaker {
    const parsed = cloneObject(input, ['state', 'failure_count', 'threshold', 'opened_at', 'last_error_code']);
    if (parsed.state !== 'closed' && parsed.state !== 'open' && parsed.state !== 'half_open') {
        return invalid('state must be closed, open, or half_open');
    }
    const threshold = nonNegativeInteger(parsed.threshold, 'threshold');
    if (threshold === 0) return invalid('threshold must be greater than zero');
    const result: NativeCircuitBreaker = {
        state: parsed.state,
        failure_count: nonNegativeInteger(parsed.failure_count, 'failure_count'),
        threshold,
    };
    const openedAt = optionalString(parsed, 'opened_at');
    const errorCode = optionalString(parsed, 'last_error_code');
    if (openedAt !== undefined) result.opened_at = openedAt;
    if (errorCode !== undefined) result.last_error_code = errorCode;
    return deepFreeze(result);
}

export function validateNativeRoleManifest(input: NativeRoleManifest): NativeRoleManifest {
    return roleManifest(input);
}
