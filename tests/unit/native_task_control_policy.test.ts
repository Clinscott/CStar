import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    canonicalBytes,
    canonicalSha256,
    canonicalize,
    parseCanonicalJson,
    parseStrictJson,
} from '../../src/core/native_task_control/canonical.js';
import {
    NATIVE_TASK_CONTROL_ERROR_CODES,
    NativeTaskControlError,
} from '../../src/core/native_task_control/errors.js';
import {
    MAX_NATIVE_POLICY_DEPTH,
    hashNativeTaskControlPolicy,
    inheritNativeTaskControlPolicy,
    parseNativeTaskControlPolicy,
} from '../../src/core/native_task_control/policy.js';
import {
    FORGE_ROUTE_STATE,
    NATIVE_TASK_CONTROL_EVENT_SCHEMA,
} from '../../src/types/native_task_control.js';

function codeOf(action: () => unknown): string {
    try {
        action();
    } catch (error) {
        assert.ok(error instanceof NativeTaskControlError);
        return error.code;
    }
    assert.fail('expected a NativeTaskControlError');
}

describe('native task-control contract and policy foundations', () => {
    it('emits deterministic sorted canonical bytes and hashes', () => {
        assert.equal(canonicalize({ z: 1, a: { d: true, c: null }, list: [2, 'x'] }),
            '{"a":{"c":null,"d":true},"list":[2,"x"],"z":1}');
        assert.equal(Buffer.from(canonicalBytes({ b: 2, a: 1 })).toString('utf8'), '{"a":1,"b":2}');
        assert.match(canonicalSha256({ b: 2, a: 1 }), /^[a-f0-9]{64}$/);
        assert.deepEqual(parseCanonicalJson('{"a":1}'), { a: 1 });
    });

    it('rejects duplicate fields before JSON object materialisation', () => {
        assert.equal(codeOf(() => parseStrictJson('{"a":1,"a":2}')),
            NATIVE_TASK_CONTROL_ERROR_CODES.duplicate_field);
        assert.equal(codeOf(() => parseCanonicalJson('{"a":1, "a":1}')),
            NATIVE_TASK_CONTROL_ERROR_CODES.duplicate_field);
    });

    it('rejects non-canonical bytes, unknown policy fields, and invalid UTF-8', () => {
        assert.equal(codeOf(() => parseCanonicalJson('{"b":1,"a":2}')),
            NATIVE_TASK_CONTROL_ERROR_CODES.non_canonical);
        assert.equal(codeOf(() => parseNativeTaskControlPolicy('{"not_a_policy":1}')),
            NATIVE_TASK_CONTROL_ERROR_CODES.unknown_field);
        assert.equal(codeOf(() => parseStrictJson(new Uint8Array([0xff]))),
            NATIVE_TASK_CONTROL_ERROR_CODES.invalid_utf8);
    });

    it('inherits budgets by min, allowlists by intersection, unions requirements, and ANDs effects', () => {
        const effective = inheritNativeTaskControlPolicy({
            max_model_requests: 24,
            max_tool_calls: 48,
            allowed_scopes: ['spoke:a', 'spoke:b'],
            prohibited_effects: ['forge', 'provider'],
            required_effects: ['receipt'],
            effect_permissions: { install: false, read: true },
        }, {
            max_model_requests: 12,
            max_tool_calls: 24,
            allowed_scopes: ['spoke:b', 'spoke:c'],
            prohibited_effects: ['network'],
            required_effects: ['hash'],
            effect_permissions: { install: false, read: true, write: false },
        });
        assert.equal(effective.max_model_requests, 12);
        assert.equal(effective.max_tool_calls, 24);
        assert.deepEqual(effective.allowed_scopes, ['spoke:b']);
        assert.deepEqual(effective.prohibited_effects, ['forge', 'network', 'provider']);
        assert.deepEqual(effective.required_effects, ['hash', 'receipt']);
        assert.deepEqual(effective.effect_permissions, { install: false, read: true, write: false });
        assert.match(hashNativeTaskControlPolicy(effective), /^[a-f0-9]{64}$/);
    });

    it('fails closed on widening and on policy traversal beyond the bound', () => {
        assert.equal(codeOf(() => inheritNativeTaskControlPolicy(
            { max_tool_calls: 48, allowed_scopes: ['spoke:a'] },
            { max_tool_calls: 49 },
        )), NATIVE_TASK_CONTROL_ERROR_CODES.policy_widening);
        assert.equal(codeOf(() => inheritNativeTaskControlPolicy(
            { allowed_scopes: ['spoke:a'] },
            { allowed_scopes: ['spoke:b'] },
        )), NATIVE_TASK_CONTROL_ERROR_CODES.policy_widening);
        assert.equal(codeOf(() => inheritNativeTaskControlPolicy({}, {}, MAX_NATIVE_POLICY_DEPTH + 1)),
            NATIVE_TASK_CONTROL_ERROR_CODES.policy_depth_exceeded);
    });

    it('keeps the native contract neutral and the Forge route permanently tombstoned', () => {
        assert.equal(NATIVE_TASK_CONTROL_EVENT_SCHEMA, 'cstar.native_task_control_event.v1');
        assert.equal(FORGE_ROUTE_STATE, 'TOMBSTONED_PERMANENT');
    });
});
