import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseCanonicalJson, canonicalJson, hashCanonical, CanonicalizationError } from '../../src/core/native_task_control/canonical.js';
import { NATIVE_TASK_CONTROL_ERROR_CODES, NativeTaskControlError } from '../../src/core/native_task_control/errors.js';
import { inheritPolicy, normalizePolicy, policyHash, resolvePolicyInheritance } from '../../src/core/native_task_control/policy.js';
import type { NativePolicy } from '../../src/types/native_task_control.js';

const policy = (overrides: Partial<NativePolicy> = {}): NativePolicy => ({
    schema: 'cstar.native_policy.v1',
    policy_id: 'root',
    depth: 0,
    budgets: { model_requests: 10, tool_calls: 20 },
    maxima: { descendants: 3, waits: 1 },
    allowlists: { task_kinds: ['work', 'test'], effects: ['safe', 'read'] },
    prohibitions: ['forge'],
    requirements: ['single_controller'],
    effect_permissions: { safe: true, read: true, protected: false },
    ...overrides,
});

describe('native task-control canonicalization', () => {
    it('sorts object keys and hashes the same bytes independent of insertion order', () => {
        const left = canonicalJson({ z: 1, a: { y: false, x: 2 } });
        const right = canonicalJson({ a: { x: 2, y: false }, z: 1 });
        assert.equal(left, '{"a":{"x":2,"y":false},"z":1}');
        assert.equal(left, right);
        assert.equal(hashCanonical({ z: 1, a: 2 }), hashCanonical({ a: 2, z: 1 }));
    });

    it('rejects duplicate and unknown JSON fields before object materialization', () => {
        assert.throws(
            () => parseCanonicalJson('{"a":1,"a":2}'),
            (error: unknown) => error instanceof CanonicalizationError && error.code === 'DUPLICATE_FIELD',
        );
        assert.throws(
            () => parseCanonicalJson('{"a":1,"x":2}', { allowedKeys: ['a'] }),
            (error: unknown) => error instanceof CanonicalizationError && error.code === 'UNKNOWN_FIELD',
        );
    });
});

describe('native task-control policy inheritance', () => {
    it('narrows budgets/maxima, intersects allowlists, unions requirements, and ANDs effects', () => {
        const child = policy({
            policy_id: 'child',
            depth: 1,
            budgets: { model_requests: 7, tool_calls: 12 },
            maxima: { descendants: 2, waits: 1 },
            allowlists: { task_kinds: ['work'], effects: ['safe'] },
            prohibitions: ['network'],
            requirements: ['fresh_goal'],
            effect_permissions: { safe: true, read: false, protected: false },
        });
        const merged = inheritPolicy(policy(), child);
        assert.deepEqual(merged.budgets, { model_requests: 7, tool_calls: 12 });
        assert.deepEqual(merged.maxima, { descendants: 2, waits: 1 });
        assert.deepEqual(merged.allowlists, { effects: ['safe'], task_kinds: ['work'] });
        assert.deepEqual(merged.prohibitions, ['forge', 'network']);
        assert.deepEqual(merged.requirements, ['fresh_goal', 'single_controller']);
        assert.deepEqual(merged.effect_permissions, { protected: false, read: false, safe: true });
        assert.equal(policyHash(merged), policyHash(normalizePolicy(merged)));
    });

    it('fails closed when a child widens any authority dimension', () => {
        const cases: NativePolicy[] = [
            policy({ policy_id: 'wide-budget', depth: 1, budgets: { model_requests: 11, tool_calls: 20 } }),
            policy({ policy_id: 'wide-list', depth: 1, allowlists: { task_kinds: ['work', 'test', 'write'], effects: ['safe', 'read'] } }),
            policy({ policy_id: 'wide-effect', depth: 1, effect_permissions: { safe: true, read: true, protected: true } }),
        ];
        for (const child of cases) {
            assert.throws(
                () => inheritPolicy(policy(), child),
                (error: unknown) => error instanceof NativeTaskControlError && error.code === NATIVE_TASK_CONTROL_ERROR_CODES.POLICY_WIDENING,
            );
        }
    });

    it('limits inheritance depth and never treats a missing metric as zero', () => {
        const root = policy({ budgets: {}, maxima: {}, allowlists: {}, depth: 0 });
        const child = policy({ policy_id: 'child', depth: 1, budgets: {}, maxima: {}, allowlists: {} });
        assert.deepEqual(inheritPolicy(root, child).budgets, {});
        assert.throws(
            () => resolvePolicyInheritance([policy({ depth: 8 }), policy({ policy_id: 'too-deep', depth: 9 })]),
            (error: unknown) => error instanceof NativeTaskControlError && error.code === NATIVE_TASK_CONTROL_ERROR_CODES.POLICY_DEPTH,
        );
    });
});
