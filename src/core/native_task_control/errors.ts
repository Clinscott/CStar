/** Stable, typed failures for the neutral native task-control surface. */

export const NATIVE_TASK_CONTROL_ERROR_CODES = {
    invalid_input: 'CSTAR_NATIVE_TASK_CONTROL_INVALID',
    invalid_json: 'CSTAR_NATIVE_INVALID_JSON',
    invalid_utf8: 'CSTAR_NATIVE_INVALID_UTF8',
    non_canonical: 'CSTAR_NATIVE_NON_CANONICAL_JSON',
    duplicate_field: 'CSTAR_NATIVE_DUPLICATE_FIELD',
    unknown_field: 'CSTAR_NATIVE_UNKNOWN_FIELD',
    policy_invalid: 'CSTAR_NATIVE_POLICY_INVALID',
    policy_widening: 'CSTAR_NATIVE_POLICY_WIDENING',
    policy_depth_exceeded: 'CSTAR_NATIVE_POLICY_DEPTH_EXCEEDED',
    generation_loop: 'CSTAR_NATIVE_TASK_GENERATION_LOOP',
    native_surface_unavailable: 'CORVUS_NATIVE_TASK_SURFACE_UNAVAILABLE',
    forge_defunct: 'CSTAR_FORGE_DEFUNCT',
} as const;

export type NativeTaskControlErrorCode =
    typeof NATIVE_TASK_CONTROL_ERROR_CODES[keyof typeof NATIVE_TASK_CONTROL_ERROR_CODES];

export type NativeTaskControlErrorDetails = Readonly<Record<string, unknown>>;

function stableDetail(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        return String(value);
    }
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

function stableMessage(code: NativeTaskControlErrorCode, details: NativeTaskControlErrorDetails): string {
    const suffix = Object.keys(details)
        .sort()
        .map((key) => `${key}=${stableDetail(details[key])}`)
        .join(':');
    return suffix ? `${code}:${suffix}` : code;
}

export class NativeTaskControlError extends Error {
    readonly code: NativeTaskControlErrorCode;
    readonly details: NativeTaskControlErrorDetails;

    constructor(code: NativeTaskControlErrorCode, details: NativeTaskControlErrorDetails = {}) {
        super(stableMessage(code, details));
        this.name = 'NativeTaskControlError';
        this.code = code;
        this.details = Object.freeze({ ...details });
    }
}

/** Alias retained for callers that use the contract/error terminology. */
export class NativeTaskControlContractError extends NativeTaskControlError {
    constructor(code: NativeTaskControlErrorCode, details: NativeTaskControlErrorDetails = {}) {
        super(code, details);
        this.name = 'NativeTaskControlContractError';
    }
}

export function nativeTaskControlError(
    code: NativeTaskControlErrorCode,
    details: NativeTaskControlErrorDetails = {},
): NativeTaskControlError {
    return new NativeTaskControlError(code, details);
}

export function failNativeTaskControl(
    code: NativeTaskControlErrorCode,
    details: NativeTaskControlErrorDetails = {},
): never {
    throw new NativeTaskControlError(code, details);
}

export function isNativeTaskControlError(value: unknown): value is NativeTaskControlError {
    return value instanceof NativeTaskControlError;
}

export function nativeTaskControlErrorCode(value: unknown): NativeTaskControlErrorCode | undefined {
    if (value instanceof NativeTaskControlError) return value.code;
    return undefined;
}

export const NATIVE_ERROR_CODES = NATIVE_TASK_CONTROL_ERROR_CODES;
