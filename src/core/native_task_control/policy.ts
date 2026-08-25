import {
    assertAllowedKeys,
    canonicalJson,
    hashCanonical,
} from './canonical.js';
import { NATIVE_TASK_CONTROL_ERROR_CODES, NativeTaskControlError } from './errors.js';
import type { NativeEffectPermissions, NativePolicy } from '../../types/native_task_control.js';

export const MAX_NATIVE_POLICY_DEPTH = 8;

function invalid(message: string, details: Record<string, unknown> = {}): never {
    throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_CONTRACT, message, details);
}

function widening(message: string, details: Record<string, unknown> = {}): never {
    throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.POLICY_WIDENING, message, details);
}

function sortedUnique(values: readonly string[], field: string): string[] {
    if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || value.length === 0)) {
        invalid(`${field} must contain non-empty strings`, { field });
    }
    const result = [...values].sort();
    for (let index = 1; index < result.length; index += 1) {
        if (result[index] === result[index - 1]) invalid(`${field} contains a duplicate`, { field, value: result[index] });
    }
    return result;
}

function sortedRecord(record: Record<string, number>, field: string): Record<string, number> {
    if (!record || typeof record !== 'object' || Array.isArray(record)) invalid(`${field} must be an object`, { field });
    const result: Record<string, number> = {};
    for (const key of Object.keys(record).sort()) {
        const value = record[key];
        if (!Number.isSafeInteger(value) || value < 0) invalid(`${field}.${key} must be a non-negative safe integer`, { field, key });
        result[key] = value;
    }
    return result;
}

function sortedEffects(record: NativeEffectPermissions): NativeEffectPermissions {
    if (!record || typeof record !== 'object' || Array.isArray(record)) invalid('effect_permissions must be an object');
    const result: NativeEffectPermissions = {};
    for (const key of Object.keys(record).sort()) {
        if (typeof record[key] !== 'boolean') invalid(`effect_permissions.${key} must be boolean`, { key });
        result[key] = record[key]!;
    }
    return result;
}

export function normalizePolicy(input: NativePolicy): NativePolicy {
    if (!input || typeof input !== 'object') invalid('policy must be an object');
    assertAllowedKeys(input as unknown as Record<string, unknown>, [
        'schema', 'policy_id', 'depth', 'budgets', 'maxima', 'allowlists', 'prohibitions', 'requirements', 'effect_permissions',
    ], 'policy');
    if (typeof input.policy_id !== 'string' || !input.policy_id) invalid('policy_id must be non-empty');
    if (!Number.isSafeInteger(input.depth) || input.depth < 0 || input.depth > MAX_NATIVE_POLICY_DEPTH) {
        throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.POLICY_DEPTH, 'policy depth exceeds the bounded maximum', {
            depth: input.depth,
            max_depth: MAX_NATIVE_POLICY_DEPTH,
        });
    }
    if (!input.budgets || !input.maxima || !input.allowlists || !input.effect_permissions) invalid('policy is missing a required section');
    const allowlists: Record<string, string[]> = {};
    for (const key of Object.keys(input.allowlists).sort()) {
        allowlists[key] = sortedUnique(input.allowlists[key]!, `allowlists.${key}`);
    }
    return {
        schema: 'cstar.native_policy.v1',
        policy_id: input.policy_id,
        depth: input.depth,
        budgets: sortedRecord(input.budgets, 'budgets'),
        maxima: sortedRecord(input.maxima, 'maxima'),
        allowlists,
        prohibitions: sortedUnique(input.prohibitions ?? [], 'prohibitions'),
        requirements: sortedUnique(input.requirements ?? [], 'requirements'),
        effect_permissions: sortedEffects(input.effect_permissions),
    };
}

function minRecord(parent: Record<string, number>, child: Record<string, number>, field: string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const key of new Set([...Object.keys(parent), ...Object.keys(child)].sort())) {
        const parentValue = parent[key];
        const childValue = child[key];
        if (parentValue !== undefined && childValue !== undefined && childValue > parentValue) {
            widening(`child ${field}.${key} widens the parent`, { field, key, parent: parentValue, child: childValue });
        }
        result[key] = parentValue === undefined ? childValue! : childValue === undefined ? parentValue : Math.min(parentValue, childValue);
    }
    return result;
}

function intersectAllowlists(parent: Record<string, string[]>, child: Record<string, string[]>): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const key of new Set([...Object.keys(parent), ...Object.keys(child)].sort())) {
        const parentValues = parent[key];
        const childValues = child[key];
        if (!parentValues) {
            result[key] = childValues ? [...childValues] : [];
            continue;
        }
        if (!childValues) {
            result[key] = [...parentValues];
            continue;
        }
        const parentSet = new Set(parentValues);
        const widened = childValues.find((value) => !parentSet.has(value));
        if (widened) widening(`child allowlist ${key} widens the parent`, { key, value: widened });
        result[key] = childValues.filter((value) => parentSet.has(value)).sort();
    }
    return result;
}

function union(left: readonly string[], right: readonly string[]): string[] {
    return [...new Set([...left, ...right])].sort();
}

function andEffects(parent: NativeEffectPermissions, child: NativeEffectPermissions): NativeEffectPermissions {
    const result: NativeEffectPermissions = {};
    for (const key of new Set([...Object.keys(parent), ...Object.keys(child)].sort())) {
        const parentValue = parent[key];
        const childValue = child[key];
        if (parentValue === false && childValue === true) widening(`child effect permission ${key} widens the parent`, { key });
        result[key] = parentValue === undefined ? childValue! : childValue === undefined ? parentValue : parentValue && childValue;
    }
    return result;
}

/** Merge one child policy into its root policy using only narrowing operations. */
export function inheritPolicy(parentInput: NativePolicy, childInput: NativePolicy): NativePolicy {
    const parent = normalizePolicy(parentInput);
    const child = normalizePolicy(childInput);
    if (child.depth !== parent.depth + 1) {
        throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.POLICY_DEPTH, 'policy inheritance depth is not contiguous', {
            parent_depth: parent.depth,
            child_depth: child.depth,
        });
    }
    if (child.depth > MAX_NATIVE_POLICY_DEPTH) {
        throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.POLICY_DEPTH, 'policy inheritance exceeds maximum depth');
    }
    const merged: NativePolicy = {
        schema: 'cstar.native_policy.v1',
        policy_id: child.policy_id,
        depth: child.depth,
        budgets: minRecord(parent.budgets, child.budgets, 'budgets'),
        maxima: minRecord(parent.maxima, child.maxima, 'maxima'),
        allowlists: intersectAllowlists(parent.allowlists, child.allowlists),
        prohibitions: union(parent.prohibitions, child.prohibitions),
        requirements: union(parent.requirements, child.requirements),
        effect_permissions: andEffects(parent.effect_permissions, child.effect_permissions),
    };
    return normalizePolicy(merged);
}

export function resolvePolicyInheritance(policies: readonly NativePolicy[]): NativePolicy {
    if (policies.length === 0) invalid('at least one policy is required');
    let effective = normalizePolicy(policies[0]!);
    for (const policy of policies.slice(1)) effective = inheritPolicy(effective, policy);
    return effective;
}

export function policyHash(policy: NativePolicy): string {
    return hashCanonical(normalizePolicy(policy));
}

export function canonicalPolicyJson(policy: NativePolicy): string {
    return canonicalJson(normalizePolicy(policy));
}

export function policyAllows(policyInput: NativePolicy, effect: string): boolean {
    const policy = normalizePolicy(policyInput);
    return policy.effect_permissions[effect] === true;
}

export function policyAllowsTaskKind(policyInput: NativePolicy, taskKind: string): boolean {
    const policy = normalizePolicy(policyInput);
    const allowed = policy.allowlists.task_kinds;
    return !allowed || allowed.includes(taskKind);
}
