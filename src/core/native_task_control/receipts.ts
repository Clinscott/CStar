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

type PathPart = string | number;
type RecordValue = Record<string, unknown>;

const GOAL_GENERATION_FIELDS = [
    'goal_generation',
    'controller_generation',
    'occupant_generation',
] as const;
const CONTROLLER_LEASE_FIELDS = [
    'lease_id',
    'controller_generation',
    'holder',
    'issued_at',
    'expires_at',
] as const;
const TASK_CONTROL_EVENT_FIELDS = [
    'event_id',
    'event_type',
    'occurred_at',
    'generation',
    'payload',
] as const;
const SUCCESSION_RECEIPT_FIELDS = [
    'receipt_id',
    'previous_controller_generation',
    'next_controller_generation',
    'accepted_at',
    'reason',
] as const;
const COHORT_WAIT_FIELDS = [
    'wait_id',
    'cohort_id',
    'required',
    'observed',
    'deadline_ms',
    'satisfied',
] as const;
const CIRCUIT_BREAKER_FIELDS = [
    'state',
    'failure_count',
    'threshold',
    'opened_at',
    'last_error_code',
] as const;

function pathText(path: readonly PathPart[]): string {
    return path.length === 0
        ? '$'
        : `$${path.map((part) => typeof part === 'number' ? `[${part}]` : `.${part}`).join('')}`;
}

function invalid(path: readonly PathPart[], reason: string): never {
    return failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_JSON, {
        path: pathText(path),
        reason,
    });
}

function unknownField(path: readonly PathPart[], key: string): never {
    return failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.UNKNOWN_FIELD, {
        key,
        path: pathText([...path, key]),
    });
}

function isRecord(value: JsonValue): value is { [key: string]: JsonValue } {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value: RecordValue, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function parseRecord(
    input: unknown,
    allowedFields: readonly string[],
    label: string,
): RecordValue {
    const canonical = canonicalNativeJson(input);
    const parsed = parseStrictNativeJson(canonical);
    if (!isRecord(parsed)) invalid([], `${label} must be an object`);

    const allowed = new Set(allowedFields);
    for (const key of Object.keys(parsed)) {
        if (!allowed.has(key)) unknownField([], key);
    }
    return parsed as RecordValue;
}

function nonEmptyString(value: unknown, path: readonly PathPart[]): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        invalid(path, 'must be a non-empty well-formed string');
    }
    return value;
}

function requiredString(record: RecordValue, key: string): string {
    if (!hasOwn(record, key)) invalid([key], 'required field is missing');
    return nonEmptyString(record[key], [key]);
}

function optionalString(record: RecordValue, key: string): string | undefined {
    if (!hasOwn(record, key)) return undefined;
    return nonEmptyString(record[key], [key]);
}

function safeInteger(value: unknown, path: readonly PathPart[], minimum: number): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
        invalid(path, `must be a safe integer greater than or equal to ${minimum}`);
    }
    return value;
}

function requiredInteger(record: RecordValue, key: string, minimum: number): number {
    if (!hasOwn(record, key)) invalid([key], 'required field is missing');
    return safeInteger(record[key], [key], minimum);
}

function optionalInteger(record: RecordValue, key: string, minimum: number): number | undefined {
    if (!hasOwn(record, key)) return undefined;
    return safeInteger(record[key], [key], minimum);
}

function requiredBoolean(record: RecordValue, key: string): boolean {
    if (!hasOwn(record, key)) invalid([key], 'required field is missing');
    const value = record[key];
    if (typeof value !== 'boolean') invalid([key], 'must be a boolean');
    return value;
}

function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === 'object') {
        if (Array.isArray(value)) {
            for (const item of value) deepFreeze(item);
        } else {
            const object = value as Record<string, unknown>;
            for (const key of Object.keys(object)) deepFreeze(object[key]);
        }
        Object.freeze(value);
    }
    return value;
}

export function hashNativeRoleManifest(manifest: NativeRoleManifest): string {
    return hashCanonicalNative(manifest);
}

export function hashNativeTaskControlEvent(event: NativeTaskControlEvent): string {
    return hashCanonicalNative(event);
}

export function createNativeGoalGeneration(input: unknown): NativeGoalGeneration {
    const record = parseRecord(input, GOAL_GENERATION_FIELDS, 'goal generation');
    return deepFreeze({
        goal_generation: requiredInteger(record, 'goal_generation', 1),
        controller_generation: requiredInteger(record, 'controller_generation', 1),
        occupant_generation: requiredInteger(record, 'occupant_generation', 1),
    });
}

export function createNativeControllerLease(input: unknown): NativeControllerLease {
    const record = parseRecord(input, CONTROLLER_LEASE_FIELDS, 'controller lease');
    const result: NativeControllerLease = {
        lease_id: requiredString(record, 'lease_id'),
        controller_generation: requiredInteger(record, 'controller_generation', 1),
        holder: requiredString(record, 'holder'),
    };
    const issuedAt = optionalString(record, 'issued_at');
    const expiresAt = optionalString(record, 'expires_at');
    if (issuedAt !== undefined) result.issued_at = issuedAt;
    if (expiresAt !== undefined) result.expires_at = expiresAt;
    return deepFreeze(result);
}

export function createNativeTaskControlEvent(input: unknown): NativeTaskControlEvent {
    const record = parseRecord(input, TASK_CONTROL_EVENT_FIELDS, 'task-control event');
    const result: NativeTaskControlEvent = {
        event_id: requiredString(record, 'event_id'),
        event_type: requiredString(record, 'event_type'),
        occurred_at: requiredString(record, 'occurred_at'),
    };
    if (hasOwn(record, 'generation')) {
        result.generation = createNativeGoalGeneration(record.generation);
    }
    if (hasOwn(record, 'payload')) {
        result.payload = deepFreeze(record.payload as JsonValue);
    }
    return deepFreeze(result);
}

export function createNativeSuccessionReceipt(input: unknown): NativeSuccessionReceipt {
    const record = parseRecord(input, SUCCESSION_RECEIPT_FIELDS, 'succession receipt');
    const previous = requiredInteger(record, 'previous_controller_generation', 1);
    const next = requiredInteger(record, 'next_controller_generation', 1);
    if (next <= previous) {
        invalid(
            ['next_controller_generation'],
            'must be greater than previous_controller_generation',
        );
    }
    const result: NativeSuccessionReceipt = {
        receipt_id: requiredString(record, 'receipt_id'),
        previous_controller_generation: previous,
        next_controller_generation: next,
        accepted_at: requiredString(record, 'accepted_at'),
    };
    const reason = optionalString(record, 'reason');
    if (reason !== undefined) result.reason = reason;
    return deepFreeze(result);
}

export function createNativeCohortWait(input: unknown): NativeCohortWait {
    const record = parseRecord(input, COHORT_WAIT_FIELDS, 'cohort wait');
    const required = requiredInteger(record, 'required', 1);
    const observed = requiredInteger(record, 'observed', 0);
    const satisfied = requiredBoolean(record, 'satisfied');
    if (satisfied !== (observed >= required)) {
        invalid(['satisfied'], 'must match whether observed meets required');
    }
    const result: NativeCohortWait = {
        wait_id: requiredString(record, 'wait_id'),
        cohort_id: requiredString(record, 'cohort_id'),
        required,
        observed,
        satisfied,
    };
    const deadlineMs = optionalInteger(record, 'deadline_ms', 0);
    if (deadlineMs !== undefined) result.deadline_ms = deadlineMs;
    return deepFreeze(result);
}

export function createNativeCircuitBreaker(input: unknown): NativeCircuitBreaker {
    const record = parseRecord(input, CIRCUIT_BREAKER_FIELDS, 'circuit breaker');
    const state = record.state;
    if (state !== 'closed' && state !== 'open' && state !== 'half_open') {
        invalid(['state'], 'must be closed, open, or half_open');
    }
    const result: NativeCircuitBreaker = {
        state,
        failure_count: requiredInteger(record, 'failure_count', 0),
        threshold: requiredInteger(record, 'threshold', 1),
    };
    const openedAt = optionalString(record, 'opened_at');
    const lastErrorCode = optionalString(record, 'last_error_code');
    if (openedAt !== undefined) result.opened_at = openedAt;
    if (lastErrorCode !== undefined) result.last_error_code = lastErrorCode;
    return deepFreeze(result);
}
