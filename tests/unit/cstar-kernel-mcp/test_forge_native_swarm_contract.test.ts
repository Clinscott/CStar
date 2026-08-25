import assert from 'node:assert/strict';
import test from 'node:test';
import {
    FORGE_NATIVE_CAPABILITIES,
    FORGE_NATIVE_CONNECTION_ID,
    FORGE_NATIVE_REQUESTED_MODEL,
    FORGE_NATIVE_REQUESTED_REASONING,
    assertIdentitySeparation,
    hashNative,
    intersectNativeAuthority,
    isCanonicalAbsolutePath,
    validateNativeCapabilities,
} from '../../../src/types/forge_native_swarm.js';
import {
    forgeNativeAuthorizationSchema,
    forgeNativeRequestSchema,
} from '../../../src/tools/cstar-kernel-mcp/contracts/forge_native_swarm.js';

function scope(root: string) {
    return {
        decision_id: 'decision-1',
        set_batch_id: 'set-1',
        connection_id: FORGE_NATIVE_CONNECTION_ID,
        generation: 1,
        request_id: 'request-1',
        request_sha256: 'a'.repeat(64),
        source_repository: root,
        source_head: 'b'.repeat(40),
        execution_root: root,
        read_allowlist: [root],
        write_allowlist: [root],
        test_allowlist: [root],
        quarantine_allowlist: [root],
        effect_exclusions: ['git', 'network'],
        model_policy_sha256: 'c'.repeat(64),
        retry_policy: { initial_attempts: 1 as const, repair_continuations: 1 as const, unknown_retries: 0 as const },
        cancellation_policy: 'interrupt_all_then_cancel_or_unknown' as const,
    };
}

test('native identity keeps requested selector separate and defaults actual identity to unreported', () => {
    const identity = assertIdentitySeparation(
        { model: FORGE_NATIVE_REQUESTED_MODEL, reasoning: FORGE_NATIVE_REQUESTED_REASONING },
        undefined,
        false,
    );
    assert.equal(identity.actual_identity, 'unreported');
    assert.equal(identity.actual_identity_attested, false);
    assert.throws(
        () => assertIdentitySeparation({ model: 'other', reasoning: 'max' }, undefined, false),
        /requested_identity_policy_mismatch/,
    );
    assert.throws(
        () => assertIdentitySeparation({ model: FORGE_NATIVE_REQUESTED_MODEL, reasoning: FORGE_NATIVE_REQUESTED_REASONING }, 'host-self-report', false),
        /actual_identity_unattested/,
    );
});

test('native request and authorization schemas are strict and reject caller-shaped fields', () => {
    const root = '/tmp/cstar-native-contract';
    const authority = scope(root);
    const request = {
        schema: 'cstar.forge_native_swarm_request.v1',
        authority,
        goal: 'bounded foundation validation',
        acceptance: ['focused tests pass'],
        source_identity: { repository: root, head: 'b'.repeat(40), execution_root: root },
        requested_identity: { model: 'gpt-5.6-luna', reasoning: 'max' },
        capabilities: [...FORGE_NATIVE_CAPABILITIES],
        deadline_at: 4_000_000_000_000,
        idempotency_key: 'request-1',
        evidence_root: `${root}/evidence`,
        binding_sha256: hashNative({ request: 'bounded' }),
    };
    assert.equal(forgeNativeRequestSchema.safeParse(request).success, true);
    assert.equal(forgeNativeRequestSchema.safeParse({ ...request, native_scope: authority }).success, false);
    assert.equal(forgeNativeRequestSchema.safeParse({
        ...request,
        authority: { ...authority, caller_evidence_root: `${root}/caller` },
    }).success, false);

    const authorization = {
        schema: 'cstar.forge_native_swarm_authorization.v1',
        request_id: 'request-1',
        request_sha256: 'a'.repeat(64),
        authorization_id: 'authorization-1',
        authorization_ref: 'cstar-auth-1',
        authority,
        scope_sha256: 'd'.repeat(64),
        evidence_root: `${root}/evidence`,
        requested_identity: { model: 'gpt-5.6-luna', reasoning: 'max' },
        actual_identity: 'unreported',
        actual_identity_attested: false,
        binding_sha256: 'e'.repeat(64),
    };
    assert.equal(forgeNativeAuthorizationSchema.safeParse(authorization).success, true);
    assert.equal(forgeNativeAuthorizationSchema.safeParse({
        ...authorization,
        cancellation_secret_sha256: 'f'.repeat(64),
    }).success, false);
});

test('authority intersection is deterministic, narrowed, and capability-closed', () => {
    const root = '/tmp/cstar-native-intersection';
    const durable = scope(root);
    const result = intersectNativeAuthority({
        durable_set: durable,
        immutable_request: { ...durable, write_allowlist: [`${root}/src`] },
        connection_policy: { ...durable, test_allowlist: [`${root}/tests`] },
        run_lease: durable,
    });
    assert.equal(result.effective_scope.generation, 1);
    assert.deepEqual(result.effective_scope.write_allowlist, [`${root}/src`]);
    assert.deepEqual(result.effective_scope.test_allowlist, [`${root}/tests`]);
    assert.equal(result.scope_sha256, hashNative(result.effective_scope));
    assert.equal(hashNative({ nested: { b: 2, a: 1 } }), hashNative({ nested: { a: 1, b: 2 } }));
    assert.equal(isCanonicalAbsolutePath(root), true);
    assert.equal(isCanonicalAbsolutePath(`${root}/../escape`), false);
    assert.throws(() => validateNativeCapabilities(['spawn_agent']), /capability_unavailable/);
    assert.throws(() => validateNativeCapabilities([...FORGE_NATIVE_CAPABILITIES, 'shell']), /capability_unknown/);
    assert.throws(() => intersectNativeAuthority({
        durable_set: durable,
        immutable_request: { ...durable, write_allowlist: ['/tmp/outside'] },
        connection_policy: durable,
        run_lease: durable,
    }), /scope_broader_than_authority/);
});
