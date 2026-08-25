import assert from 'node:assert/strict';
import test from 'node:test';

import {
    assertCanonicalNativeJson,
    canonicalNativeJson,
    hashCanonicalNative,
    parseStrictNativeJson,
} from '../../src/core/native_task_control/canonical.js';
import {
    NATIVE_TASK_CONTROL_ERROR_CODES,
    NativeTaskControlError,
} from '../../src/core/native_task_control/errors.js';
import {
    inheritNativeTaskControlPolicy,
    nativeTaskControlPolicyHash,
    normalizeNativeTaskControlPolicy,
    parseNativeTaskControlPolicy,
    resolveNativeTaskControlPolicy,
} from '../../src/core/native_task_control/policy.js';
import {
    NATIVE_TASK_CONTROL_CONTRACT,
    NATIVE_TASK_CONTROL_SCHEMAS,
} from '../../src/tools/cstar-kernel-mcp/contracts/native_task_control.js';
import type { NativeTaskControlPolicy } from '../../src/types/native_task_control.js';

function errorCode(error: unknown): string | undefined {
    return error instanceof NativeTaskControlError ? error.code : undefined;
}

function assertCode(action: () => unknown, code: string): void {
    assert.throws(action, (error: unknown) => errorCode(error) === code);
}

function policy(overrides: Partial<NativeTaskControlPolicy> = {}): NativeTaskControlPolicy {
    return {
        schema: 'cstar.native_policy.v1',
        policy_id: 'policy-base',
        depth: 0,
        budgets: {
            model_requests: 32,
            tool_calls: 96,
            uncached_input_tokens: 262144,
            output_plus_reasoning_tokens: 262144,
            wall_time_seconds: 1200,
        },
        maxima: {
            descendants: 0,
            waits: 0,
            retries: 0,
            replays: 0,
            fallbacks: 0,
        },
        allowlists: {
            task_kinds: ['focused_test', 'source_implementation'],
            effects: ['read_bound_context', 'run_bound_checks', 'write_allowlisted_source'],
        },
        prohibitions: ['forge', 'network', 'provider'],
        requirements: ['fail_closed', 'strict_write_allowlist'],
        effect_permissions: {
            read_bound_context: true,
            write_allowlisted_source: true,
            run_bound_checks: true,
            protected_effect: false,
        },
        ...overrides,
    };
}

test('canonical bytes and hashes are independent of insertion order', () => {
    const left = { z: [true, null, 'text'], a: { y: 2, x: 1 } };
    const right = { a: { x: 1, y: 2 }, z: [true, null, 'text'] };
    assert.equal(canonicalNativeJson(left), canonicalNativeJson(right));
    assert.equal(hashCanonicalNative(left), hashCanonicalNative(right));
    assert.deepEqual(assertCanonicalNativeJson(canonicalNativeJson(left)), {
        a: { x: 1, y: 2 },
        z: [true, null, 'text'],
    });
});

test('duplicate fields are rejected before materialization', () => {
    assertCode(
        () => parseStrictNativeJson('{"a":1,"a":2}'),
        NATIVE_TASK_CONTROL_ERROR_CODES.DUPLICATE_FIELD,
    );
});

test('prototype-mutating keys are rejected recursively without pollution', () => {
    const cases = [
        '{"__proto__":{"injected":true}}',
        '{"nested":{"__proto__":{"injected":true}}}',
        '{"nested":{"constructor":{"injected":true}}}',
        '{"nested":[{"prototype":{"injected":true}}]}',
    ];
    for (const input of cases) {
        const before = Object.getOwnPropertyNames(Object.prototype);
        const unrelated: Record<string, unknown> = {};
        assertCode(() => parseStrictNativeJson(input), NATIVE_TASK_CONTROL_ERROR_CODES.PROTOTYPE_KEY);
        assert.deepEqual(Object.getOwnPropertyNames(Object.prototype), before);
        assert.deepEqual(unrelated, {});
        assert.equal((Object.prototype as Record<string, unknown>).injected, undefined);
    }
});

test('invalid UTF-8, unsafe numbers, and non-finite numbers fail closed', () => {
    assertCode(
        () => parseStrictNativeJson(new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff, 0x7d])),
        NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_JSON,
    );
    assertCode(
        () => parseStrictNativeJson('{"number":9007199254740992}'),
        NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_JSON,
    );
    assertCode(
        () => parseStrictNativeJson('{"number":1e400}'),
        NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_JSON,
    );
});

test('unknown fields and non-canonical bytes are rejected', () => {
    const canonical = canonicalNativeJson(policy());
    assertCanonicalNativeJson(canonical);
    assertCode(
        () => assertCanonicalNativeJson('{"b":2,"a":1}'),
        NATIVE_TASK_CONTROL_ERROR_CODES.NON_CANONICAL,
    );
    const withUnknown = canonicalNativeJson({ ...policy(), unknown_policy_field: true });
    assertCode(
        () => parseNativeTaskControlPolicy(withUnknown),
        NATIVE_TASK_CONTROL_ERROR_CODES.UNKNOWN_FIELD,
    );
});

test('policy normalization preserves absent metrics', () => {
    const input = policy({
        budgets: { tool_calls: 3 },
        maxima: { retries: 2 },
        allowlists: { task_kinds: ['source_implementation'] },
        effect_permissions: { run_bound_checks: true },
    });
    const normalized = normalizeNativeTaskControlPolicy(input);
    assert.deepEqual(normalized.budgets, { tool_calls: 3 });
    assert.equal('model_requests' in normalized.budgets, false);
    assert.deepEqual(normalized.maxima, { retries: 2 });
    assert.equal('waits' in normalized.maxima, false);
    assert.deepEqual(normalized.allowlists, { task_kinds: ['source_implementation'] });
    assert.deepEqual(normalized.effect_permissions, { run_bound_checks: true });
});

test('policy inheritance applies min, intersection, sorted union, AND, and absence', () => {
    const parent = policy({ policy_id: 'parent' });
    const child = policy({
        policy_id: 'child',
        depth: 2,
        budgets: {
            model_requests: 16,
            tool_calls: 96,
            wall_time_seconds: 800,
        },
        maxima: { retries: 0, replays: 0 },
        allowlists: { task_kinds: ['source_implementation'], effects: ['run_bound_checks'] },
        prohibitions: ['network', 'provider'],
        requirements: ['strict_write_allowlist'],
        effect_permissions: {
            read_bound_context: true,
            write_allowlisted_source: false,
            run_bound_checks: true,
            protected_effect: false,
        },
    });
    const resolved = inheritNativeTaskControlPolicy(parent, child);
    assert.equal(resolved.policy_id, 'child');
    assert.equal(resolved.depth, 2);
    assert.deepEqual(resolved.budgets, {
        model_requests: 16,
        tool_calls: 96,
        wall_time_seconds: 800,
        uncached_input_tokens: 262144,
        output_plus_reasoning_tokens: 262144,
    });
    assert.deepEqual(resolved.allowlists, {
        task_kinds: ['source_implementation'],
        effects: ['run_bound_checks'],
    });
    assert.deepEqual(resolved.prohibitions, ['forge', 'network', 'provider']);
    assert.deepEqual(resolved.requirements, ['fail_closed', 'strict_write_allowlist']);
    assert.equal(resolved.effect_permissions.write_allowlisted_source, false);
    assert.equal(resolved.effect_permissions.protected_effect, false);
    assert.equal(nativeTaskControlPolicyHash(resolved), nativeTaskControlPolicyHash(resolveNativeTaskControlPolicy([parent, child])));
});

test('widening and depth greater than eight fail with stable codes', () => {
    assertCode(
        () => inheritNativeTaskControlPolicy(policy(), policy({ budgets: { model_requests: 33 } })),
        NATIVE_TASK_CONTROL_ERROR_CODES.POLICY_WIDENING,
    );
    assertCode(
        () => inheritNativeTaskControlPolicy(
            policy({ allowlists: { task_kinds: ['source_implementation'] } }),
            policy({ allowlists: { task_kinds: ['focused_test', 'source_implementation'] } }),
        ),
        NATIVE_TASK_CONTROL_ERROR_CODES.POLICY_WIDENING,
    );
    assertCode(
        () => normalizeNativeTaskControlPolicy(policy({ depth: 9 })),
        NATIVE_TASK_CONTROL_ERROR_CODES.POLICY_DEPTH,
    );
});

test('the contract is neutral and Forge is permanently tombstoned', () => {
    assert.equal(NATIVE_TASK_CONTROL_SCHEMAS.policy, 'cstar.native_policy.v1');
    assert.equal(NATIVE_TASK_CONTROL_CONTRACT.forge_status, 'TOMBSTONED_PERMANENT');
    assert.equal(NATIVE_TASK_CONTROL_CONTRACT.forge.status, 'TOMBSTONED_PERMANENT');
    assert.equal(NATIVE_TASK_CONTROL_CONTRACT.forge.execution, null);
    assert.equal(NATIVE_TASK_CONTROL_CONTRACT.forge.fallback, null);
    assert.equal(NATIVE_TASK_CONTROL_CONTRACT.forge.adapter, null);
    assert.equal(NATIVE_TASK_CONTROL_CONTRACT.forge.lifecycle, null);
    assert.equal(NATIVE_TASK_CONTROL_CONTRACT.forge.validation, null);
    assert.equal(NATIVE_TASK_CONTROL_CONTRACT.active_functions.length, 0);
});

