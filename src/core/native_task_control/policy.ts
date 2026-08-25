import type { NativeTaskControlPolicy } from '../../types/native_task_control.js';
import { canonicalSha256, parseStrictObject, assertKnownFields } from './canonical.js';
import {
    NATIVE_TASK_CONTROL_ERROR_CODES,
    NativeTaskControlError,
    failNativeTaskControl,
} from './errors.js';

export const MAX_NATIVE_POLICY_DEPTH = 8;
export const NATIVE_POLICY_MAX_DEPTH = MAX_NATIVE_POLICY_DEPTH;

const LIMIT_GROUPS = [
    ['max_model_requests'],
    ['max_tool_calls'],
    ['max_native_waits', 'max_waits'],
    ['max_retries', 'max_retry_count'],
    ['max_replays', 'max_replay_count'],
    ['max_fallbacks', 'max_fallback_count'],
    ['max_uncached_input_tokens'],
    ['max_output_plus_reasoning_tokens'],
    ['max_wall_time_seconds'],
    ['max_descendants'],
    ['max_replacements'],
    ['max_succession'],
    ['max_depth', 'max_policy_depth'],
] as const;

const ARRAY_GROUPS = [
    ['allowed_sources', 'source_allowlist'],
    ['allowed_scopes', 'scope_allowlist'],
    ['allowed_effects', 'effect_allowlist'],
    ['prohibited_effects', 'prohibitions'],
    ['required_effects', 'requirements'],
] as const;

const DIRECT_FIELDS = new Set<string>([
    ...LIMIT_GROUPS.flat(),
    ...ARRAY_GROUPS.flat(),
    'effect_permissions',
    'effects',
    'budgets',
    'allowlists',
]);

const NESTED_BUDGET_FIELDS = new Set<string>([
    ...LIMIT_GROUPS.flat(),
]);
const NESTED_ALLOWLIST_FIELDS = new Set(['sources', 'scopes', 'effects']);

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function failInvalid(field: string, reason: string): never {
    return failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.policy_invalid, { field, reason });
}

function assertInteger(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        return failInvalid(field, 'nonnegative_integer_required');
    }
    return value;
}

function assertStringList(value: unknown, field: string): string[] {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
        return failInvalid(field, 'string_list_required');
    }
    const result = [...new Set(value)];
    if (result.some((entry) => entry.length === 0)) return failInvalid(field, 'empty_entry');
    return result.sort();
}

function assertPermissionMap(value: unknown, field: string): Record<string, boolean> {
    if (!isRecord(value)) return failInvalid(field, 'boolean_map_required');
    const result: Record<string, boolean> = {};
    for (const key of Object.keys(value).sort()) {
        if (typeof value[key] !== 'boolean') return failInvalid(`${field}.${key}`, 'boolean_required');
        result[key] = value[key] as boolean;
    }
    return result;
}

function nestedValue(policy: NativeTaskControlPolicy, key: string): unknown {
    const direct = (policy as Record<string, unknown>)[key];
    if (direct !== undefined) return direct;
    const budgets = policy.budgets;
    if (budgets && (budgets as Record<string, unknown>)[key] !== undefined) {
        return (budgets as Record<string, unknown>)[key];
    }
    const aliases: Record<string, string> = {
        max_native_waits: 'max_waits',
        max_retries: 'max_retry_count',
        max_replays: 'max_replay_count',
        max_fallbacks: 'max_fallback_count',
        max_depth: 'max_policy_depth',
    };
    const alias = aliases[key];
    if (alias && (policy as Record<string, unknown>)[alias] !== undefined) {
        return (policy as Record<string, unknown>)[alias];
    }
    if (alias && budgets && (budgets as Record<string, unknown>)[alias] !== undefined) {
        return (budgets as Record<string, unknown>)[alias];
    }
    return undefined;
}

function nestedArrayValue(policy: NativeTaskControlPolicy, key: string): unknown {
    const direct = (policy as Record<string, unknown>)[key];
    if (direct !== undefined) return direct;
    const alias = key === 'prohibited_effects'
        ? 'prohibitions'
        : key === 'required_effects' ? 'requirements' : undefined;
    if (alias && (policy as Record<string, unknown>)[alias] !== undefined) {
        return (policy as Record<string, unknown>)[alias];
    }
    const allowlists = policy.allowlists;
    const allowlistKey = key === 'allowed_sources'
        ? 'sources'
        : key === 'allowed_scopes' ? 'scopes' : key === 'allowed_effects' ? 'effects' : undefined;
    if (allowlistKey && allowlists?.[allowlistKey] !== undefined) return allowlists[allowlistKey];
    return undefined;
}

function assertNestedPolicyFields(policy: NativeTaskControlPolicy): void {
    if (policy.budgets !== undefined) {
        if (!isRecord(policy.budgets)) return failInvalid('budgets', 'object_required');
        const unknown = Object.keys(policy.budgets).find((field) => !NESTED_BUDGET_FIELDS.has(field));
        if (unknown !== undefined) {
            throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.unknown_field, {
                context: 'policy.budgets',
                field: unknown,
            });
        }
    }
    if (policy.allowlists !== undefined) {
        if (!isRecord(policy.allowlists)) return failInvalid('allowlists', 'object_required');
        const unknown = Object.keys(policy.allowlists).find((field) => !NESTED_ALLOWLIST_FIELDS.has(field));
        if (unknown !== undefined) {
            throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.unknown_field, {
                context: 'policy.allowlists',
                field: unknown,
            });
        }
    }
}

export function validateNativeTaskControlPolicy(policy: unknown): asserts policy is NativeTaskControlPolicy {
    if (!isRecord(policy)) return failInvalid('policy', 'object_required');
    const unknown = Object.keys(policy).find((field) => !DIRECT_FIELDS.has(field));
    if (unknown !== undefined) {
        throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.unknown_field, {
            context: 'policy',
            field: unknown,
        });
    }
    assertNestedPolicyFields(policy);
    for (const group of LIMIT_GROUPS) {
        const value = nestedValue(policy, group[0]);
        if (value !== undefined) assertInteger(value, group[0]);
    }
    for (const group of ARRAY_GROUPS) {
        const value = nestedArrayValue(policy, group[0]);
        if (value !== undefined) assertStringList(value, group[0]);
    }
    const permissions = policy.effect_permissions ?? policy.effects;
    if (permissions !== undefined) assertPermissionMap(permissions, 'effect_permissions');
}

function sourceKey(policy: NativeTaskControlPolicy, group: readonly string[]): string | undefined {
    for (const key of group) {
        if ((policy as Record<string, unknown>)[key] !== undefined) return key;
    }
    if (group[0].startsWith('allowed_') && policy.allowlists !== undefined) {
        const nested = group[0].slice('allowed_'.length);
        if (policy.allowlists[nested as 'sources' | 'scopes' | 'effects'] !== undefined) return group[0];
    }
    return undefined;
}

function numericValue(policy: NativeTaskControlPolicy, group: readonly string[]): number | undefined {
    for (const key of group) {
        const value = nestedValue(policy, key);
        if (value !== undefined) return value as number;
    }
    return undefined;
}

function listValue(policy: NativeTaskControlPolicy, group: readonly string[]): string[] | undefined {
    const value = nestedArrayValue(policy, group[0]);
    return value === undefined ? undefined : assertStringList(value, group[0]);
}

function intersection(left: string[], right: string[]): string[] {
    const rightSet = new Set(right);
    return [...new Set(left.filter((entry) => rightSet.has(entry)))].sort();
}

function union(left: string[], right: string[]): string[] {
    return [...new Set([...left, ...right])].sort();
}

function childListWidens(parent: string[] | undefined, child: string[] | undefined): boolean {
    if (parent === undefined || child === undefined) return false;
    const parentSet = new Set(parent);
    return child.some((entry) => !parentSet.has(entry));
}

function policyWidening(field: string, parent: unknown, child: unknown): never {
    return failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.policy_widening, {
        field,
        parent,
        child,
    });
}

/** Flatten accepted boundary spellings into deterministic direct policy fields. */
export function normalizeNativeTaskControlPolicy(input: NativeTaskControlPolicy): NativeTaskControlPolicy {
    validateNativeTaskControlPolicy(input);
    const result: NativeTaskControlPolicy = {};
    for (const group of LIMIT_GROUPS) {
        const value = numericValue(input, group);
        if (value !== undefined) result[group[0] as keyof NativeTaskControlPolicy] = value as never;
    }
    for (const group of ARRAY_GROUPS) {
        const value = listValue(input, group);
        if (value !== undefined) result[group[0] as keyof NativeTaskControlPolicy] = value as never;
    }
    const permissions = input.effect_permissions ?? input.effects;
    if (permissions !== undefined) result.effect_permissions = assertPermissionMap(permissions, 'effect_permissions');
    return result;
}

/**
 * Inherit one policy into a child policy.  The child may only narrow the
 * parent.  The returned policy is deterministic and has no provider effects.
 */
export function inheritNativeTaskControlPolicy(
    parent: NativeTaskControlPolicy,
    child: NativeTaskControlPolicy,
    depth = 1,
): NativeTaskControlPolicy {
    if (!Number.isSafeInteger(depth) || depth < 1 || depth > MAX_NATIVE_POLICY_DEPTH) {
        return failNativeTaskControl(NATIVE_TASK_CONTROL_ERROR_CODES.policy_depth_exceeded, {
            depth,
            max_depth: MAX_NATIVE_POLICY_DEPTH,
        });
    }
    validateNativeTaskControlPolicy(parent);
    validateNativeTaskControlPolicy(child);
    const left = normalizeNativeTaskControlPolicy(parent);
    const right = normalizeNativeTaskControlPolicy(child);
    const result: NativeTaskControlPolicy = {};

    for (const group of LIMIT_GROUPS) {
        const parentValue = numericValue(left, group);
        const childValue = numericValue(right, group);
        if (parentValue !== undefined && childValue !== undefined && childValue > parentValue) {
            policyWidening(group[0], parentValue, childValue);
        }
        if (parentValue !== undefined || childValue !== undefined) {
            result[group[0] as keyof NativeTaskControlPolicy] = Math.min(
                parentValue ?? Number.MAX_SAFE_INTEGER,
                childValue ?? Number.MAX_SAFE_INTEGER,
            ) as never;
        }
    }

    for (const group of ARRAY_GROUPS) {
        const parentValue = listValue(left, group);
        const childValue = listValue(right, group);
        if (childListWidens(parentValue, childValue)) policyWidening(group[0], parentValue, childValue);
        if (parentValue !== undefined || childValue !== undefined) {
            result[group[0] as keyof NativeTaskControlPolicy] = (
                parentValue === undefined ? childValue : childValue === undefined
                    ? parentValue : intersection(parentValue, childValue)
            ) as never;
        }
    }

    const parentPermissions = left.effect_permissions ?? {};
    const childPermissions = right.effect_permissions ?? {};
    const permissionKeys = new Set([...Object.keys(parentPermissions), ...Object.keys(childPermissions)]);
    if (permissionKeys.size > 0) {
        const effective: Record<string, boolean> = {};
        for (const key of [...permissionKeys].sort()) {
            const parentValue = parentPermissions[key];
            const childValue = childPermissions[key];
            if (parentValue === false && childValue === true) policyWidening(`effect_permissions.${key}`, false, true);
            effective[key] = (parentValue ?? true) && (childValue ?? true);
        }
        result.effect_permissions = effective;
    }
    return result;
}

export function assertNarrowingNativeTaskControlPolicy(
    parent: NativeTaskControlPolicy,
    child: NativeTaskControlPolicy,
    depth = 1,
): void {
    inheritNativeTaskControlPolicy(parent, child, depth);
}

export function parseNativeTaskControlPolicy(
    input: string | Uint8Array,
): NativeTaskControlPolicy {
    const parsed = parseStrictObject<Record<string, unknown>>(input, [...DIRECT_FIELDS], 'policy') as NativeTaskControlPolicy;
    validateNativeTaskControlPolicy(parsed);
    return normalizeNativeTaskControlPolicy(parsed);
}

export function hashNativeTaskControlPolicy(policy: NativeTaskControlPolicy): string {
    return canonicalSha256(normalizeNativeTaskControlPolicy(policy));
}

export const inheritNativePolicy = inheritNativeTaskControlPolicy;
export const inheritPolicy = inheritNativeTaskControlPolicy;
export const narrowNativePolicy = inheritNativeTaskControlPolicy;
export const normalizePolicy = normalizeNativeTaskControlPolicy;
export const parseNativePolicy = parseNativeTaskControlPolicy;
export const hashNativePolicy = hashNativeTaskControlPolicy;
export const validateNativePolicy = validateNativeTaskControlPolicy;
