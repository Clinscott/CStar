import assert from 'node:assert/strict';
import test from 'node:test';

import {
    assertCanonicalNativeJson,
    canonicalNativeJson,
    hashCanonicalNative,
    parseStrictNativeJson,
} from '../../src/core/native_task_control/canonical.js';
import {
    NativeTaskControlError,
    NATIVE_TASK_CONTROL_ERROR_CODES,
} from '../../src/core/native_task_control/errors.js';
import {
    inheritNativeTaskControlPolicy,
    normalizeNativeTaskControlPolicy,
    nativeTaskControlPolicyHash,
    parseNativeTaskControlPolicy,
    resolveNativeTaskControlPolicy,
} from '../../src/core/native_task_control/policy.js';
import {
    NATIVE_TASK_CONTROL_CONTRACT,
    NATIVE_TASK_CONTROL_SCHEMAS,
} from '../../src/tools/cstar-kernel-mcp/contracts/native_task_control.js';
import type { JsonValue, NativeTaskControlPolicy } from '../../src/types/native_task_control.js';

function codeIs(code: string) {
    return (error: unknown): boolean =>
        error instanceof NativeTaskControlError && error.code === code;
}

function policy(overrides: Partial<NativeTaskControlPolicy> = {}): NativeTaskControlPolicy {
    return {
        schema: 'cstar.native_policy.v1',
        policy_id: 'policy-test',
        depth: 0,
        budgets: {
            model_requests: 32,
            tool_calls: 96,
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
            task_kinds: ['source_implementation', 'focused_test'],
            effects: ['read_bound_context', 'write_allowlisted_source'],
        },
        prohibitions: ['forge', 'network'],
        requirements: ['fail_closed', 'single_terminal_packet'],
        effect_permissions: {
            read_bound_context: true,
            write_allowlisted_source: true,
            run_bound_checks: true,
            protected_effect: false,
        },
        ...overrides,
    };
}

test('canonical bytes and hashes ignore object insertion order', () => {
    const first = { z: [true, null, 'x'], a: { y: 2, x: 1 } } as unknown as JsonValue;
    const second = { a: { x: 1, y: 2 }, z: [true, null, 'x'] } as unknown as JsonValue;
    assert.equal(canonicalNativeJson(first), '{"a":{"x":1,"y":2},"z":[true,null,"x"]}');
    assert.equal(canonicalNativeJson(first), canonicalNativeJson(second));
    assert.equal(hashCanonicalNative(first), hashCanonicalNative(second));
});

test('duplicate fields fail before a materialized object can be accepted', () => {
    assert.throws(
        () => parseStrictNativeJson('{"depth":0,"depth":1}'),
        codeIs(NATIVE_TASK_CONTROL_ERROR_CODES.CSTAR_NATIVE_TASK_DUPLICATE_FIELD),
    );
});

test('unknown fields, non-canonical bytes, invalid UTF-8, and unsafe numbers fail closed', () => {
    assert.throws(
        () => parseStrictNativeJson('{"extra":1}', { allowedKeys: ['known'] }),
        codeIs(NATIVE_TASK_CONTROL_ERROR_CODES.CSTAR_NATIVE_TASK_UNKNOWN_FIELD),
    );
    assert.throws(
        () => assertCanonicalNativeJson('{"b":2,"a":1}'),
        codeIs(NATIVE_TASK_CONTROL_ERROR_CODES.CSTAR_NATIVE_TASK_NON_CANONICAL),
    );
    assert.throws(
        () => parseStrictNativeJson(new Uint8Array([0x22, 0xc3, 0x28, 0x22])),
        codeIs(NATIVE_TASK_CONTROL_ERROR_CODES.CSTAR_NATIVE_TASK_INVALID_JSON),
    );
    assert.throws(
        () => parseStrictNativeJson('9007199254740992'),
        codeIs(NATIVE_TASK_CONTROL_ERROR_CODES.CSTAR_NATIVE_TASK_INVALID_JSON),
    );
});

test('normalization sorts sets and preserves absent metrics', () => {
    const normalized = normalizeNativeTaskControlPolicy({
        schema: 'cstar.native_policy.v1',
        policy_id: 'absence',
        depth: 0,
        budgets: { tool_calls: 9 },
        allowlists: { effects: ['z', 'a', 'a'] },
        prohibitions: ['z', 'a', 'a'],
    });
    assert.deepEqual(normalized.budgets, { tool_calls: 9 });
    assert.equal('model_requests' in (normalized.budgets ?? {}), false);
    assert.deepEqual(normalized.allowlists, { effects: ['a', 'z'] });
    assert.deepEqual(normalized.prohibitions, ['a', 'z']);
    assert.equal(nativeTaskControlPolicyHash(normalized), nativeTaskControlPolicyHash({
        ...normalized,
        budgets: { tool_calls: 9 },
        allowlists: { effects: ['z', 'a'] },
        prohibitions: ['z', 'a'],
    }));
});

test('inheritance applies min, intersection, sorted union, AND, and absence preservation', () => {
    const parent = policy({ policy_id: 'parent', depth: 0 });
    const child = policy({
        policy_id: 'child',
        depth: 1,
        budgets: { model_requests: 8, tool_calls: 12 },
        maxima: { descendants: 0, waits: 0 },
        allowlists: {
            task_kinds: ['focused_test'],
            effects: ['read_bound_context'],
        },
        prohibitions: ['provider', 'network'],
        requirements: ['fail_closed'],
        effect_permissions: {
            read_bound_context: true,
            write_allowlisted_source: false,
            run_bound_checks: false,
            protected_effect: false,
        },
    });
    const inherited = inheritNativeTaskControlPolicy(parent, child);
    assert.deepEqual(inherited.budgets, { model_requests: 8, tool_calls: 12 });
    assert.deepEqual(inherited.maxima, { descendants: 0, waits: 0 });
    assert.deepEqual(inherited.allowlists, {
        task_kinds: ['focused_test'],
        effects: ['read_bound_context'],
    });
    assert.deepEqual(inherited.prohibitions, ['forge', 'network', 'provider']);
    assert.deepEqual(inherited.requirements, ['fail_closed', 'single_terminal_packet']);
    assert.deepEqual(inherited.effect_permissions, {
        read_bound_context: true,
        write_allowlisted_source: false,
        run_bound_checks: false,
        protected_effect: false,
    });
});

test('numeric, allowlist, effect, and depth widening have stable codes', () => {
    assert.throws(
        () => inheritNativeTaskControlPolicy(
            policy({ depth: 0, budgets: { model_requests: 3 } }),
            policy({ depth: 1, budgets: { model_requests: 4 } }),
        ),
        codeIs(NATIVE_TASK_CONTROL_ERROR_CODES.CSTAR_NATIVE_TASK_POLICY_WIDENING),
    );
    assert.throws(
        () => inheritNativeTaskControlPolicy(
            policy({ depth: 0, allowlists: { effects: ['read_bound_context'] } }),
            policy({ depth: 1, allowlists: { effects: ['write_allowlisted_source'] } }),
        ),
        codeIs(NATIVE_TASK_CONTROL_ERROR_CODES.CSTAR_NATIVE_TASK_POLICY_WIDENING),
    );
    assert.throws(
        () => inheritNativeTaskControlPolicy(
            policy({ depth: 0, effect_permissions: { read_bound_context: false } }),
            policy({ depth: 1, effect_permissions: { read_bound_context: true } }),
        ),
        codeIs(NATIVE_TASK_CONTROL_ERROR_CODES.CSTAR_NATIVE_TASK_POLICY_WIDENING),
    );
    assert.throws(
        () => normalizeNativeTaskControlPolicy(policy({ depth: 9 })),
        codeIs(NATIVE_TASK_CONTROL_ERROR_CODES.CSTAR_NATIVE_TASK_POLICY_DEPTH),
    );
});

test('chain resolution requires a depth-zero root', () => {
    assert.equal(resolveNativeTaskControlPolicy([policy({ depth: 0 })]).depth, 0);
    assert.throws(
        () => resolveNativeTaskControlPolicy([policy({ depth: 1 })]),
        codeIs(NATIVE_TASK_CONTROL_ERROR_CODES.CSTAR_NATIVE_TASK_POLICY_DEPTH),
    );
});

test('contract is neutral and has no active Forge route', () => {
    assert.equal(NATIVE_TASK_CONTROL_SCHEMAS.policy, 'cstar.native_policy.v1');
    assert.equal(NATIVE_TASK_CONTROL_CONTRACT.mode, 'neutral');
    assert.equal(NATIVE_TASK_CONTROL_CONTRACT.active_route, null);
    assert.equal(NATIVE_TASK_CONTROL_CONTRACT.forge, 'TOMBSTONED_PERMANENT');
    assert.deepEqual(NATIVE_TASK_CONTROL_CONTRACT.functions, []);
    assert.equal(Object.values(NATIVE_TASK_CONTROL_CONTRACT).some((value) => typeof value === 'function'), false);
});

test('policy JSON parser applies the root allowlist before normalization', () => {
    assert.throws(
        () => parseNativeTaskControlPolicy('{"schema":"cstar.native_policy.v1","policy_id":"x","depth":0,"unknown":true}'),
        codeIs(NATIVE_TASK_CONTROL_ERROR_CODES.CSTAR_NATIVE_TASK_UNKNOWN_FIELD),
    );
});
