export const NATIVE_TASK_CONTROL_ERROR_CODES = {
    INVALID_JSON: 'CSTAR_NATIVE_TASK_INVALID_JSON',
    DUPLICATE_FIELD: 'CSTAR_NATIVE_TASK_DUPLICATE_FIELD',
    UNKNOWN_FIELD: 'CSTAR_NATIVE_TASK_UNKNOWN_FIELD',
    NON_CANONICAL: 'CSTAR_NATIVE_TASK_NON_CANONICAL',
    POLICY_INVALID: 'CSTAR_NATIVE_TASK_POLICY_INVALID',
    POLICY_WIDENING: 'CSTAR_NATIVE_TASK_POLICY_WIDENING',
    POLICY_DEPTH: 'CSTAR_NATIVE_TASK_POLICY_DEPTH',
    GENERATION_LOOP: 'CSTAR_NATIVE_TASK_GENERATION_LOOP',
    STALE_CONTROLLER: 'CSTAR_NATIVE_TASK_STALE_CONTROLLER',
    SCOPE_VIOLATION: 'CSTAR_NATIVE_TASK_SCOPE_VIOLATION',
    REPLAY_CONFLICT: 'CSTAR_NATIVE_TASK_REPLAY_CONFLICT',
    PROTECTED_EFFECT: 'CSTAR_NATIVE_TASK_PROTECTED_EFFECT',
    SELECTOR_MISMATCH: 'CSTAR_NATIVE_TASK_SELECTOR_MISMATCH',
    PROTOTYPE_KEY: 'CSTAR_NATIVE_TASK_PROTOTYPE_KEY',
    SURFACE_UNAVAILABLE: 'CORVUS_NATIVE_TASK_SURFACE_UNAVAILABLE',
    FORGE_DEFUNCT: 'CSTAR_FORGE_DEFUNCT',
} as const;

export type NativeTaskControlErrorCode =
    typeof NATIVE_TASK_CONTROL_ERROR_CODES[keyof typeof NATIVE_TASK_CONTROL_ERROR_CODES];

export class NativeTaskControlError extends Error {
    readonly code: NativeTaskControlErrorCode;
    readonly details: Readonly<Record<string, unknown>>;

    constructor(
        code: NativeTaskControlErrorCode,
        details: Readonly<Record<string, unknown>> = {},
    ) {
        super(code);
        this.name = 'NativeTaskControlError';
        this.code = code;
        this.details = Object.freeze({ ...details });
    }
}

export function failNativeTaskControl(
    code: NativeTaskControlErrorCode,
    details?: Readonly<Record<string, unknown>>,
): never {
    throw new NativeTaskControlError(code, details);
}

