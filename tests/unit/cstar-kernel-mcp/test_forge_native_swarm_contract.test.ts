import assert from 'node:assert/strict';
import test from 'node:test';
import {
    FORGE_NATIVE_CONNECTION_ID,
    FORGE_NATIVE_REQUESTED_MODEL,
    FORGE_NATIVE_REQUESTED_REASONING,
    assertIdentitySeparation,
    hashNative,
} from '../../../src/types/forge_native_swarm.js';
import { forgeNativeAuthorizationSchema, forgeNativeRequestSchema } from '../../../src/tools/cstar-kernel-mcp/contracts/forge_native_swarm.js';

test('native identity keeps requested selector separate and defaults actual identity to unreported', () => {
    const identity = assertIdentitySeparation({ model: FORGE_NATIVE_REQUESTED_MODEL, reasoning: FORGE_NATIVE_REQUESTED_REASONING }, undefined, false);
    assert.equal(identity.actual_identity, 'unreported');
    assert.equal(identity.actual_identity_attested, false);
    assert.throws(() => assertIdentitySeparation({ model: 'other', reasoning: 'max' }, undefined, false), /requested_identity_policy_mismatch/);
    assert.throws(() => assertIdentitySeparation({ model: FORGE_NATIVE_REQUESTED_MODEL, reasoning: FORGE_NATIVE_REQUESTED_REASONING }, 'host-self-report', false), /actual_identity_unattested/);
});

test('native request and authorization schemas reject caller-shaped authority fields', () => {
    const root = '/tmp/cstar-native-contract';
    const scope = {
        decision_id: 'decision-1', set_batch_id: 'set-1', connection_id: FORGE_NATIVE_CONNECTION_ID, generation: 1,
        request_id: 'request-1', request_sha256: 'a'.repeat(64), source_repository: root, source_head: 'b'.repeat(40), execution_root: root,
        read_allowlist: [root], write_allowlist: [root], test_allowlist: [root], quarantine_allowlist: [root], effect_exclusions: ['git'],
        model_policy_sha256: 'c'.repeat(64), retry_policy: { initial_attempts: 1, repair_continuations: 1, unknown_retries: 0 }, cancellation_policy: 'interrupt_all_then_cancel_or_unknown',
    } as const;
    const request = { schema: 'cstar.forge_native_swarm_request.v1', authority: scope, goal: 'bounded', acceptance: ['pass'], source_identity: { repository: root, head: 'b'.repeat(40), execution_root: root }, requested_identity: { model: 'gpt-5.6-luna', reasoning: 'max' }, capabilities: ['spawn_agent', 'list_agents', 'send_message', 'followup_task', 'wait_agent', 'interrupt_agent'], deadline_at: Date.now() + 60_000, idempotency_key: 'request-1', evidence_root: `${root}/evidence`, binding_sha256: hashNative({ nope: true }) };
    assert.equal(forgeNativeRequestSchema.safeParse(request).success, true);
    assert.equal(forgeNativeRequestSchema.safeParse({ ...request, native_scope: scope }).success, false);
    const authorization = { schema: 'cstar.forge_native_swarm_authorization.v1', request_id: 'request-1', request_sha256: 'a'.repeat(64), authorization_id: 'authorization-1', authorization_ref: 'cstar-auth-1', authority: scope, scope_sha256: 'd'.repeat(64), evidence_root: `${root}/evidence`, requested_identity: { model: 'gpt-5.6-luna', reasoning: 'max' }, actual_identity: 'unreported', actual_identity_attested: false, binding_sha256: 'e'.repeat(64) };
    assert.equal(forgeNativeAuthorizationSchema.safeParse(authorization).success, true);
    assert.equal(forgeNativeAuthorizationSchema.safeParse({ ...authorization, cancellation_secret_sha256: 'f'.repeat(64) }).success, false);
});
