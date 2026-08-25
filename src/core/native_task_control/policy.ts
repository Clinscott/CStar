import {
    canonicalNativeJson,
    hashCanonicalNative,
    parseStrictNativeJson,
    type NativeJsonInput,
} from './canonical.js';
import { failNativeTaskControl } from './errors.js';
import type {
    JsonValue,
    NativeTaskControlAllowlists,
    NativeTaskControlBudgets,
    NativeTaskControlEffectPermissions,
    NativeTaskControlMaxima,
    NativeTaskControlPolicy,
} from '../../types/native_task_control.js';

export const NATIVE_TASK_CONTROL_POLICY_SCHEMA = 'cstar.native_policy.v1';
export const NATIVE_TASK_CONTROL_POLICY_MAX_DEPTH = 8;

const POLICY_FIELDS = new Set([
    'schema',
    'policy_id',
    'depth',
    'budgets',
    'maxima',
    'allowlists',
    'prohibitions',
    'requirements',
    'effect_permissions',
]);
const BUDGET_FIELDS = new Set([
    'model_requests',
    'tool_calls',
    'uncached_input_tokens',
    'output_plus_reasoning_tokens',
    'wall_time_seconds',
]);
const MAXIMA_FIELDS = new Set(['descendants', 'waits', 'retries', 'replays', 'fallbacks']);
const ALLOWLIST_FIELDS = new Set(['task_kinds', 'effects']);
const EFFECT_FIELDS = new Set([
    'read_bound_context',
    'write_allowlisted_source',
    'run_bound_checks',
    'protected_effect',
]);

type NativePolicyRecord = Record<string, unknown>;

function policyInvalid(details: Record<string, unknown> = {}): never {
    return failNativeTaskControl('CSTAR_NATIVE_TASK_POLICY_INVALID', details);
}

function isPlainRecord(value: unknown): value is NativePolicyRecord {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function asRecord(value: unknown, path: string): NativePolicyRecord {
    if (!isPlainRecord(value)) return policyInvalid({ path, reason: 'object_expected' });
    return value;
}

function rejectUnknownKeys(value: NativePolicyRecord, allowed: ReadonlySet<string>, path: string): void {
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
            failNativeTaskControl('CSTAR_NATIVE_TASK_UNKNOWN_FIELD', { key, path });
        }
    }
}

function has(value: NativePolicyRecord, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function validateString(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        return policyInvalid({ path, reason: 'non_empty_string_expected' });
    }
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdfff) {
            if (code <= 0xdbff && value.charCodeAt(index + 1) >= 0xdc00) {
                index += 1;
            } else {
                return policyInvalid({ path, reason: 'invalid_unicode' });
            }
        }
    }
    return value;
}

function validateMetric(value: unknown, path: string): number {
    if (
        typeof value !== 'number'
        || !Number.isFinite(value)
        || !Number.isSafeInteger(value)
        || value < 0
    ) {
        return policyInvalid({ path, reason: 'non_negative_safe_integer_expected' });
    }
    return value;
}

function normalizeNumericGroup<T extends NativeTaskControlBudgets | NativeTaskControlMaxima>(
    value: unknown,
    path: string,
    allowed: ReadonlySet<string>,
): T {
    const record = asRecord(value, path);
    rejectUnknownKeys(record, allowed, path);
    const normalized: Record<string, number> = {};
    for (const key of Object.keys(record)) {
        normalized[key] = validateMetric(record[key], `${path}.${key}`);
    }
    return normalized as T;
}

function normalizeStringArray(value: unknown, path: string): readonly string[] {
    if (!Array.isArray(value)) return policyInvalid({ path, reason: 'string_array_expected' });
    const values = value.map((entry, index) => validateString(entry, `${path}[${index}]`));
    return [...new Set(values)].sort();
}

function normalizeAllowlists(value: unknown): NativeTaskControlAllowlists {
    const record = asRecord(value, 'allowlists');
    rejectUnknownKeys(record, ALLOWLIST_FIELDS, 'allowlists');
    const normalized: Record<string, readonly string[]> = {};
    for (const key of Object.keys(record)) {
        normalized[key] = normalizeStringArray(record[key], `allowlists.${key}`);
    }
    return normalized as NativeTaskControlAllowlists;
}

function normalizeEffectPermissions(value: unknown): NativeTaskControlEffectPermissions {
    const record = asRecord(value, 'effect_permissions');
    rejectUnknownKeys(record, EFFECT_FIELDS, 'effect_permissions');
    const normalized: Record<string, boolean> = {};
    for (const key of Object.keys(record)) {
        if (typeof record[key] !== 'boolean') {
            return policyInvalid({ path: `effect_permissions.${key}`, reason: 'boolean_expected' });
        }
        normalized[key] = record[key] as boolean;
    }
    return normalized as NativeTaskControlEffectPermissions;
}

function normalizePolicyRecord(value: unknown): NativeTaskControlPolicy {
    const record = asRecord(value, '$');
    rejectUnknownKeys(record, POLICY_FIELDS, '$');
    const schema = validateString(record.schema, '$.schema');
    if (schema !== NATIVE_TASK_CONTROL_POLICY_SCHEMA) {
        return policyInvalid({ path: '$.schema', reason: 'unsupported_schema', schema });
    }
    const policyId = validateString(record.policy_id, '$.policy_id');
    if (
        typeof record.depth !== 'number'
        || !Number.isSafeInteger(record.depth)
        || record.depth < 0
        || record.depth > NATIVE_TASK_CONTROL_POLICY_MAX_DEPTH
    ) {
        failNativeTaskControl('CSTAR_NATIVE_TASK_POLICY_DEPTH', {
            path: '$.depth',
            value: record.depth,
            max_depth: NATIVE_TASK_CONTROL_POLICY_MAX_DEPTH,
        });
    }

    const normalized: {
        schema: string;
        policy_id: string;
        depth: number;
        budgets?: NativeTaskControlBudgets;
        maxima?: NativeTaskControlMaxima;
        allowlists?: NativeTaskControlAllowlists;
        prohibitions?: readonly string[];
        requirements?: readonly string[];
        effect_permissions?: NativeTaskControlEffectPermissions;
    } = {
        schema,
        policy_id: policyId,
        depth: record.depth as number,
    };
    if (has(record, 'budgets')) {
        normalized.budgets = normalizeNumericGroup<NativeTaskControlBudgets>(
            record.budgets,
            'budgets',
            BUDGET_FIELDS,
        );
    }
    if (has(record, 'maxima')) {
        normalized.maxima = normalizeNumericGroup<NativeTaskControlMaxima>(
            record.maxima,
            'maxima',
            MAXIMA_FIELDS,
        );
    }
    if (has(record, 'allowlists')) normalized.allowlists = normalizeAllowlists(record.allowlists);
    if (has(record, 'prohibitions')) {
        normalized.prohibitions = normalizeStringArray(record.prohibitions, 'prohibitions');
    }
    if (has(record, 'requirements')) {
        normalized.requirements = normalizeStringArray(record.requirements, 'requirements');
    }
    if (has(record, 'effect_permissions')) {
        normalized.effect_permissions = normalizeEffectPermissions(record.effect_permissions);
    }
    return normalized;
}

function isJsonInput(value: unknown): value is NativeJsonInput {
    return typeof value === 'string'
        || value instanceof Uint8Array
        || value instanceof ArrayBuffer
        || ArrayBuffer.isView(value);
}

/** Validate and return an immutable-shape policy without inventing absent metrics. */
export function normalizeNativeTaskControlPolicy(input: unknown): NativeTaskControlPolicy {
    const value = isJsonInput(input)
        ? parseStrictNativeJson(input, { allowedKeys: POLICY_FIELDS })
        : input;
    return normalizePolicyRecord(value);
}

function numericKeys(
    parent: NativeTaskControlBudgets | NativeTaskControlMaxima | undefined,
    child: NativeTaskControlBudgets | NativeTaskControlMaxima | undefined,
): string[] {
    return [...new Set([
        ...Object.keys(parent ?? {}),
        ...Object.keys(child ?? {}),
    ])].sort();
}

function inheritNumericGroup<T extends NativeTaskControlBudgets | NativeTaskControlMaxima>(
    parent: T | undefined,
    child: T | undefined,
): T | undefined {
    if (parent === undefined && child === undefined) return undefined;
    const result: Record<string, number> = {};
    for (const key of numericKeys(parent, child)) {
        const parentValue = parent?.[key];
        const childValue = child?.[key];
        if (parentValue !== undefined && childValue !== undefined) {
            result[key] = Math.min(parentValue, childValue);
        }
    }
    return result as T;
}

function ensureNumericChildNotWider(
    parent: NativeTaskControlBudgets | NativeTaskControlMaxima | undefined,
    child: NativeTaskControlBudgets | NativeTaskControlMaxima | undefined,
    path: string,
): void {
    for (const key of numericKeys(parent, child)) {
        const parentValue = parent?.[key];
        const childValue = child?.[key];
        if (parentValue !== undefined && childValue !== undefined && childValue > parentValue) {
            failNativeTaskControl('CSTAR_NATIVE_TASK_POLICY_WIDENING', {
                path: `${path}.${key}`,
                parent: parentValue,
                child: childValue,
            });
        }
    }
}

function stringSet(value: readonly string[] | undefined): Set<string> | undefined {
    return value === undefined ? undefined : new Set(value);
}

function ensureAllowlistChildNotWider(
    parent: NativeTaskControlAllowlists | undefined,
    child: NativeTaskControlAllowlists | undefined,
): void {
    for (const key of new Set([
        ...Object.keys(parent ?? {}),
        ...Object.keys(child ?? {}),
    ])) {
        const parentSet = stringSet(parent?.[key]);
        const childSet = stringSet(child?.[key]);
        if (childSet === undefined) continue;
        for (const member of childSet) {
            if (parentSet === undefined || !parentSet.has(member)) {
                failNativeTaskControl('CSTAR_NATIVE_TASK_POLICY_WIDENING', {
                    path: `allowlists.${key}`,
                    member,
                });
            }
        }
    }
}

function ensureEffectChildNotWider(
    parent: NativeTaskControlEffectPermissions | undefined,
    child: NativeTaskControlEffectPermissions | undefined,
): void {
    for (const key of new Set([
        ...Object.keys(parent ?? {}),
        ...Object.keys(child ?? {}),
    ])) {
        if (child?.[key] === true && parent?.[key] !== true) {
            failNativeTaskControl('CSTAR_NATIVE_TASK_POLICY_WIDENING', {
                path: `effect_permissions.${key}`,
            });
        }
    }
}

function inheritAllowlists(
    parent: NativeTaskControlAllowlists | undefined,
    child: NativeTaskControlAllowlists | undefined,
): NativeTaskControlAllowlists | undefined {
    if (parent === undefined && child === undefined) return undefined;
    const result: Record<string, readonly string[]> = {};
    for (const key of new Set([
        ...Object.keys(parent ?? {}),
        ...Object.keys(child ?? {}),
    ])) {
        const parentSet = stringSet(parent?.[key]);
        const childSet = stringSet(child?.[key]);
        if (parentSet === undefined || childSet === undefined) {
            result[key] = [];
        } else {
            result[key] = [...childSet].filter((member) => parentSet.has(member)).sort();
        }
    }
    return result as NativeTaskControlAllowlists;
}

function inheritEffects(
    parent: NativeTaskControlEffectPermissions | undefined,
    child: NativeTaskControlEffectPermissions | undefined,
): NativeTaskControlEffectPermissions | undefined {
    if (parent === undefined && child === undefined) return undefined;
    const result: Record<string, boolean> = {};
    for (const key of new Set([
        ...Object.keys(parent ?? {}),
        ...Object.keys(child ?? {}),
    ])) {
        result[key] = parent?.[key] === true && child?.[key] === true;
    }
    return result as NativeTaskControlEffectPermissions;
}

function inheritStrings(
    parent: readonly string[] | undefined,
    child: readonly string[] | undefined,
): readonly string[] | undefined {
    if (parent === undefined && child === undefined) return undefined;
    return [...new Set([...(parent ?? []), ...(child ?? [])])].sort();
}

/** Intersect a child with its parent, failing before return if it attempts widening. */
export function inheritNativeTaskControlPolicy(
    parentInput: NativeTaskControlPolicy,
    childInput: NativeTaskControlPolicy,
): NativeTaskControlPolicy {
    const parent = normalizeNativeTaskControlPolicy(parentInput);
    const child = normalizeNativeTaskControlPolicy(childInput);
    if (child.depth !== parent.depth + 1) {
        failNativeTaskControl('CSTAR_NATIVE_TASK_POLICY_DEPTH', {
            parent_depth: parent.depth,
            child_depth: child.depth,
            expected_child_depth: parent.depth + 1,
        });
    }
    ensureNumericChildNotWider(parent.budgets, child.budgets, 'budgets');
    ensureNumericChildNotWider(parent.maxima, child.maxima, 'maxima');
    ensureAllowlistChildNotWider(parent.allowlists, child.allowlists);
    ensureEffectChildNotWider(parent.effect_permissions, child.effect_permissions);

    const inherited: {
        schema: string;
        policy_id: string;
        depth: number;
        budgets?: NativeTaskControlBudgets;
        maxima?: NativeTaskControlMaxima;
        allowlists?: NativeTaskControlAllowlists;
        prohibitions?: readonly string[];
        requirements?: readonly string[];
        effect_permissions?: NativeTaskControlEffectPermissions;
    } = {
        schema: child.schema,
        policy_id: child.policy_id,
        depth: child.depth,
    };
    const budgets = inheritNumericGroup(parent.budgets, child.budgets);
    const maxima = inheritNumericGroup(parent.maxima, child.maxima);
    const allowlists = inheritAllowlists(parent.allowlists, child.allowlists);
    const prohibitions = inheritStrings(parent.prohibitions, child.prohibitions);
    const requirements = inheritStrings(parent.requirements, child.requirements);
    const effectPermissions = inheritEffects(parent.effect_permissions, child.effect_permissions);
    if (budgets !== undefined) inherited.budgets = budgets;
    if (maxima !== undefined) inherited.maxima = maxima;
    if (allowlists !== undefined) inherited.allowlists = allowlists;
    if (prohibitions !== undefined) inherited.prohibitions = prohibitions;
    if (requirements !== undefined) inherited.requirements = requirements;
    if (effectPermissions !== undefined) inherited.effect_permissions = effectPermissions;
    return normalizePolicyRecord(inherited);
}

/** Resolve a root-to-leaf policy chain, preserving its explicit depth contract. */
export function resolveNativeTaskControlPolicy(
    chain: readonly NativeTaskControlPolicy[],
): NativeTaskControlPolicy {
    if (chain.length === 0) return policyInvalid({ path: '$', reason: 'non_empty_chain_expected' });
    let resolved = normalizeNativeTaskControlPolicy(chain[0]);
    if (resolved.depth !== 0) {
        failNativeTaskControl('CSTAR_NATIVE_TASK_POLICY_DEPTH', {
            path: '$[0].depth',
            expected: 0,
            actual: resolved.depth,
        });
    }
    for (let index = 1; index < chain.length; index += 1) {
        resolved = inheritNativeTaskControlPolicy(resolved, chain[index]);
    }
    return resolved;
}

/** Parse, validate, normalize, and return one policy from JSON or an object. */
export function parseNativeTaskControlPolicy(input: unknown): NativeTaskControlPolicy {
    return normalizeNativeTaskControlPolicy(input);
}

/** Hash the normalized policy's canonical UTF-8 representation. */
export function nativeTaskControlPolicyHash(policy: NativeTaskControlPolicy): string {
    const normalized = normalizeNativeTaskControlPolicy(policy);
    return hashCanonicalNative(normalized as unknown as JsonValue);
}

/** Expose canonical bytes for policy receipts without changing the policy. */
export function canonicalNativeTaskControlPolicy(policy: NativeTaskControlPolicy): string {
    return canonicalNativeJson(normalizeNativeTaskControlPolicy(policy) as unknown as JsonValue);
}
