import {
    assertCanonicalNativeJson,
    canonicalNativeJson,
    hashCanonicalNative,
    parseStrictNativeJson,
    type NativeJsonInput,
} from './canonical.js';
import {
    failNativeTaskControl,
    NATIVE_TASK_CONTROL_ERROR_CODES,
} from './errors.js';
import type {
    JsonValue,
    NativeTaskControlAllowlists,
    NativeTaskControlBudgets,
    NativeTaskControlEffectPermissions,
    NativeTaskControlMaxima,
    NativeTaskControlPolicy,
} from '../../types/native_task_control.js';

const BUDGET_FIELDS = [
    'model_requests',
    'tool_calls',
    'uncached_input_tokens',
    'output_plus_reasoning_tokens',
    'wall_time_seconds',
] as const;
const MAXIMUM_FIELDS = ['descendants', 'waits', 'retries', 'replays', 'fallbacks'] as const;
const ALLOWLIST_FIELDS = ['task_kinds', 'effects'] as const;
const EFFECT_FIELDS = [
    'read_bound_context',
    'write_allowlisted_source',
    'run_bound_checks',
    'protected_effect',
] as const;

const POLICY_ALLOWLIST = {
    '': [
        'schema',
        'policy_id',
        'depth',
        'budgets',
        'maxima',
        'allowlists',
        'prohibitions',
        'requirements',
        'effect_permissions',
    ],
    budgets: BUDGET_FIELDS,
    maxima: MAXIMUM_FIELDS,
    allowlists: ALLOWLIST_FIELDS,
    effect_permissions: EFFECT_FIELDS,
} as const;

type RecordValue = { [key: string]: unknown };

type NumericPolicyRecord<T extends string> = Partial<Record<T, number>>;
type StringListPolicyRecord<T extends string> = Partial<Record<T, string[]>>;
type BooleanPolicyRecord<T extends string> = Partial<Record<T, boolean>>;

function isRecord(value: unknown): value is RecordValue {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalidPolicy(reason: string, details: Record<string, unknown> = {}): never {
    return failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.POLICY_INVALID, {
        reason,
        ...details,
    });
}

function readRequiredRecord(parent: RecordValue, key: string): RecordValue {
    const value = parent[key];
    if (!isRecord(value)) return invalidPolicy(`${key} must be an object`, { key });
    return value;
}

function readRequiredString(parent: RecordValue, key: string): string {
    const value = parent[key];
    if (typeof value !== 'string' || value.length === 0) {
        return invalidPolicy(`${key} must be a non-empty string`, { key });
    }
    return value;
}

function readStringList(parent: RecordValue, key: string): string[] {
    const value = parent[key];
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
        return invalidPolicy(`${key} must be an array of strings`, { key });
    }
    return [...new Set(value as string[])].sort();
}

function readOptionalNumberRecord(
    value: RecordValue,
    fields: readonly string[],
    label: string,
): Record<string, number> {
    const result: Record<string, number> = {};
    for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
        const candidate = value[field];
        if (typeof candidate !== 'number'
            || !Number.isFinite(candidate)
            || !Number.isSafeInteger(candidate)
            || candidate < 0) {
            return invalidPolicy(`${label}.${field} must be a non-negative safe integer`, { field });
        }
        result[field] = candidate;
    }
    return result;
}

function readOptionalStringLists(
    value: RecordValue,
    fields: readonly string[],
): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
        const candidate = value[field];
        if (!Array.isArray(candidate) || !candidate.every((item) => typeof item === 'string')) {
            return invalidPolicy(`allowlists.${field} must be an array of strings`, { field });
        }
        result[field] = [...new Set(candidate as string[])].sort();
    }
    return result;
}

function readOptionalBooleans(
    value: RecordValue,
    fields: readonly string[],
): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
        const candidate = value[field];
        if (typeof candidate !== 'boolean') {
            return invalidPolicy(`effect_permissions.${field} must be boolean`, { field });
        }
        result[field] = candidate;
    }
    return result;
}

function normalizeParsedPolicy(value: unknown): NativeTaskControlPolicy {
    if (!isRecord(value)) return invalidPolicy('policy must be an object');
    if (value.schema !== 'cstar.native_policy.v1') {
        return invalidPolicy('schema must be cstar.native_policy.v1');
    }
    const policyId = readRequiredString(value, 'policy_id');
    const depth = value.depth;
    if (typeof depth !== 'number' || !Number.isSafeInteger(depth) || depth < 0) {
        return invalidPolicy('depth must be a non-negative safe integer');
    }
    if (depth > 8) {
        return failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.POLICY_DEPTH, { depth });
    }

    const budgets = readOptionalNumberRecord(readRequiredRecord(value, 'budgets'), BUDGET_FIELDS, 'budgets');
    const maxima = readOptionalNumberRecord(readRequiredRecord(value, 'maxima'), MAXIMUM_FIELDS, 'maxima');
    const allowlists = readOptionalStringLists(readRequiredRecord(value, 'allowlists'), ALLOWLIST_FIELDS);
    const effectPermissions = readOptionalBooleans(
        readRequiredRecord(value, 'effect_permissions'),
        EFFECT_FIELDS,
    );

    return {
        schema: 'cstar.native_policy.v1',
        policy_id: policyId,
        depth,
        budgets: budgets as NativeTaskControlBudgets,
        maxima: maxima as NativeTaskControlMaxima,
        allowlists: allowlists as NativeTaskControlAllowlists,
        prohibitions: readStringList(value, 'prohibitions'),
        requirements: readStringList(value, 'requirements'),
        effect_permissions: effectPermissions as NativeTaskControlEffectPermissions,
    };
}

function policyAsCanonicalValue(policy: unknown): JsonValue {
    if (typeof policy === 'string' || policy instanceof Uint8Array || policy instanceof ArrayBuffer) {
        return assertCanonicalNativeJson(policy as NativeJsonInput, {
            allowedKeys: POLICY_ALLOWLIST,
        });
    }
    const canonical = canonicalNativeJson(policy as JsonValue);
    return parseStrictNativeJson(canonical, { allowedKeys: POLICY_ALLOWLIST });
}

export function normalizeNativeTaskControlPolicy(policy: unknown): NativeTaskControlPolicy {
    return normalizeParsedPolicy(policyAsCanonicalValue(policy));
}

export function parseNativeTaskControlPolicy(
    input: NativeJsonInput | NativeTaskControlPolicy,
): NativeTaskControlPolicy {
    return normalizeParsedPolicy(policyAsCanonicalValue(input));
}

function assertChildNotWider(parent: NativeTaskControlPolicy, child: NativeTaskControlPolicy): void {
    for (const field of BUDGET_FIELDS) {
        const parentValue = parent.budgets[field];
        const childValue = child.budgets[field];
        if (parentValue !== undefined && childValue !== undefined && childValue > parentValue) {
            failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.POLICY_WIDENING, {
                field: `budgets.${field}`,
                parent: parentValue,
                child: childValue,
            });
        }
    }
    for (const field of MAXIMUM_FIELDS) {
        const parentValue = parent.maxima[field];
        const childValue = child.maxima[field];
        if (parentValue !== undefined && childValue !== undefined && childValue > parentValue) {
            failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.POLICY_WIDENING, {
                field: `maxima.${field}`,
                parent: parentValue,
                child: childValue,
            });
        }
    }
    for (const field of ALLOWLIST_FIELDS) {
        const parentValue = parent.allowlists[field];
        const childValue = child.allowlists[field];
        if (parentValue !== undefined && childValue !== undefined) {
            const parentSet = new Set(parentValue);
            if (childValue.some((item) => !parentSet.has(item))) {
                failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.POLICY_WIDENING, {
                    field: `allowlists.${field}`,
                });
            }
        }
    }
    for (const field of EFFECT_FIELDS) {
        const parentValue = parent.effect_permissions[field];
        const childValue = child.effect_permissions[field];
        if (parentValue === false && childValue === true) {
            failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.POLICY_WIDENING, {
                field: `effect_permissions.${field}`,
            });
        }
    }
}

function inheritNumbers<T extends string>(
    parent: NumericPolicyRecord<T>,
    child: NumericPolicyRecord<T>,
    fields: readonly T[],
): Record<string, number> {
    const result: Record<string, number> = {};
    for (const field of fields) {
        const parentValue = parent[field];
        const childValue = child[field];
        if (parentValue === undefined && childValue === undefined) continue;
        if (parentValue === undefined) result[field] = childValue!;
        else if (childValue === undefined) result[field] = parentValue;
        else result[field] = Math.min(parentValue, childValue);
    }
    return result;
}

function inheritAllowlists<T extends string>(
    parent: StringListPolicyRecord<T>,
    child: StringListPolicyRecord<T>,
    fields: readonly T[],
): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const field of fields) {
        const parentValue = parent[field];
        const childValue = child[field];
        if (parentValue === undefined && childValue === undefined) continue;
        if (parentValue === undefined) result[field] = [...childValue!].sort();
        else if (childValue === undefined) result[field] = [...parentValue].sort();
        else {
            const childSet = new Set(childValue);
            result[field] = parentValue.filter((item) => childSet.has(item)).sort();
        }
    }
    return result;
}

function inheritEffects<T extends string>(
    parent: BooleanPolicyRecord<T>,
    child: BooleanPolicyRecord<T>,
    fields: readonly T[],
): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const field of fields) {
        const parentValue = parent[field];
        const childValue = child[field];
        if (parentValue === undefined && childValue === undefined) continue;
        if (parentValue === undefined) result[field] = childValue!;
        else if (childValue === undefined) result[field] = parentValue;
        else result[field] = parentValue && childValue;
    }
    return result;
}

function unionSorted(left: readonly string[], right: readonly string[]): string[] {
    return [...new Set([...left, ...right])].sort();
}

export function inheritNativeTaskControlPolicy(
    parentInput: NativeTaskControlPolicy,
    childInput: NativeTaskControlPolicy,
): NativeTaskControlPolicy {
    const parent = normalizeNativeTaskControlPolicy(parentInput);
    const child = normalizeNativeTaskControlPolicy(childInput);
    assertChildNotWider(parent, child);
    return {
        schema: 'cstar.native_policy.v1',
        policy_id: child.policy_id,
        depth: Math.max(parent.depth, child.depth),
        budgets: inheritNumbers(parent.budgets, child.budgets, BUDGET_FIELDS),
        maxima: inheritNumbers(parent.maxima, child.maxima, MAXIMUM_FIELDS),
        allowlists: inheritAllowlists(parent.allowlists, child.allowlists, ALLOWLIST_FIELDS),
        prohibitions: unionSorted(parent.prohibitions, child.prohibitions),
        requirements: unionSorted(parent.requirements, child.requirements),
        effect_permissions: inheritEffects(parent.effect_permissions, child.effect_permissions, EFFECT_FIELDS),
    };
}

export function resolveNativeTaskControlPolicy(
    chain: readonly NativeTaskControlPolicy[],
): NativeTaskControlPolicy {
    if (chain.length === 0) return invalidPolicy('policy chain must not be empty');
    let resolved = normalizeNativeTaskControlPolicy(chain[0]);
    for (const policy of chain.slice(1)) {
        resolved = inheritNativeTaskControlPolicy(resolved, policy);
    }
    return resolved;
}

export function nativeTaskControlPolicyHash(policy: NativeTaskControlPolicy): string {
    return hashCanonicalNative(normalizeNativeTaskControlPolicy(policy));
}
