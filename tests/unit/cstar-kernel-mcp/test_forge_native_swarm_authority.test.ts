import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
    FORGE_NATIVE_CONNECTION_ID,
    hashNative,
    stableNativeJson,
    type ForgeNativeAuthorityScope,
} from '../../../src/types/forge_native_swarm.js';
import {
    deriveForgeNativeSwarmAuthority,
    type ForgeNativeAuthorityChainInput,
} from '../../../src/tools/pennyone/intel/forge_native_swarm_authority.js';
import {
    assertForgeNativeRequestMatchesToolRequest,
    bindForgeNativeRequest,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_native_request_binding.js';
import {
    bindForgeNativeAuthorization,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_native_authorization_binding.js';

const ROOT = '/tmp/cstar-r5-native-authority';
const REQUEST_ID = 'dispatch-forge-0123456789abcdef0123456789abcdef';
const REQUEST_SHA256 = 'a'.repeat(64);
const WRITE_PATH = `${ROOT}/src/request.ts`;
const TEST_PATH = `${ROOT}/tests/request.test.ts`;

function scope(overrides: Partial<ForgeNativeAuthorityScope> = {}): ForgeNativeAuthorityScope {
    return {
        decision_id: 'CSF-D008-R5',
        set_batch_id: 'CSF-D008-FNS-SET-02-DELTA-03',
        connection_id: FORGE_NATIVE_CONNECTION_ID,
        generation: 1,
        request_id: REQUEST_ID,
        request_sha256: REQUEST_SHA256,
        source_repository: ROOT,
        source_head: 'b'.repeat(40),
        execution_root: ROOT,
        read_allowlist: [ROOT],
        write_allowlist: [`${ROOT}/src`],
        test_allowlist: [`${ROOT}/tests`],
        quarantine_allowlist: [`${ROOT}/quarantine`],
        effect_exclusions: ['git', 'network'],
        model_policy_sha256: 'c'.repeat(64),
        retry_policy: { initial_attempts: 1, repair_continuations: 1, unknown_retries: 0 },
        cancellation_policy: 'interrupt_all_then_cancel_or_unknown',
        ...overrides,
    };
}

function authorityInput(): ForgeNativeAuthorityChainInput {
    return {
        durable_set: scope(),
        immutable_request: scope({
            read_allowlist: [`${ROOT}/src`, `${ROOT}/tests`],
            write_allowlist: [WRITE_PATH],
            test_allowlist: [TEST_PATH],
            effect_exclusions: ['git', 'network', 'deployment'],
        }),
        connection_policy: scope({
            write_allowlist: [`${ROOT}/src`],
            test_allowlist: [`${ROOT}/tests`],
            effect_exclusions: ['git', 'network', 'deployment'],
        }),
        run_lease: scope({
            read_allowlist: [`${ROOT}/src`, `${ROOT}/tests`],
            write_allowlist: [WRITE_PATH],
            test_allowlist: [TEST_PATH],
            effect_exclusions: ['git', 'network', 'deployment'],
        }),
        control_root: '/tmp/cstar-r5-control',
        lease: { lease_id: 'lease:r5-w01b', lease_started_at: 1_000, lease_expires_at: 10_000 },
        now: 2_000,
    };
}

test('authority is the deterministic SET/request/policy/lease intersection', () => {
    const input = authorityInput();
    const first = deriveForgeNativeSwarmAuthority(input);
    const replay = deriveForgeNativeSwarmAuthority(input);
    assert.deepEqual(first, replay);
    assert.deepEqual(first.effective_scope.write_allowlist, [WRITE_PATH]);
    assert.deepEqual(first.effective_scope.test_allowlist, [TEST_PATH]);
    assert.equal(first.scope_sha256, hashNative(first.effective_scope));
    assert.equal(first.generation, 1);
    assert.equal(first.evidence_root, `/tmp/cstar-r5-control/work/forge-native/${REQUEST_SHA256.slice(0, 32)}`);
    assert.deepEqual(first.requested_identity, { model: 'gpt-5.6-luna', reasoning: 'max' });
    assert.equal(first.actual_identity, 'unreported');
    assert.equal(first.actual_identity_attested, false);
    const changed = authorityInput();
    for (const source of [changed.durable_set, changed.immutable_request,
        changed.connection_policy, changed.run_lease]) source.source_head = `c${'b'.repeat(39)}`;
    assert.notEqual(deriveForgeNativeSwarmAuthority(changed).authority_binding_sha256,
        first.authority_binding_sha256);
});

test('native request and authorization bindings replay byte-equivalently with separated identity', () => {
    const requestInput = {
        authority_chain: authorityInput(),
        goal: 'Implement the bounded native request and authorization seam.',
        acceptance: ['typecheck passes', 'focused test passes', 'typecheck passes'],
    };
    const request = bindForgeNativeRequest(requestInput);
    assert.deepEqual(request, bindForgeNativeRequest(requestInput));
    assert.deepEqual(request.request.acceptance, ['focused test passes', 'typecheck passes']);
    assertForgeNativeRequestMatchesToolRequest(request, {
        request_id: REQUEST_ID,
        request_sha256: REQUEST_SHA256,
        decision_id: 'CSF-D008-R5',
        source_repository: ROOT,
        target_paths: [WRITE_PATH],
        required_output_paths: [WRITE_PATH],
        prohibited_actions: ['git', 'network'],
    });
    const authorizationInput = {
        authority_chain: authorityInput(),
        native_request: request.request,
        authorization_id: 'forge-auth-0123456789abcdef0123456789abcdef',
        authorization_ref: 'cstar-forge-set-manifest:bounded',
        legacy_authorization_binding_sha256: 'd'.repeat(64),
    };
    const authorization = bindForgeNativeAuthorization(authorizationInput);
    assert.deepEqual(authorization, bindForgeNativeAuthorization(authorizationInput));
    assert.equal(authorization.authorization.actual_identity, 'unreported');
    assert.equal(authorization.authorization.actual_identity_attested, false);
    assert.equal(authorization.authorization.requested_identity.model, 'gpt-5.6-luna');
});

test('caller-shaped fields and widening fail without mutating authority inputs', () => {
    const input = authorityInput();
    const before = stableNativeJson(input);
    assert.throws(() => deriveForgeNativeSwarmAuthority({
        ...input,
        caller_evidence_root: '/tmp/caller',
    } as ForgeNativeAuthorityChainInput), /authority_chain_field_forbidden/);
    assert.equal(stableNativeJson(input), before);

    const widened = authorityInput();
    widened.immutable_request = scope({ write_allowlist: ['/tmp/outside'] });
    const widenedBefore = stableNativeJson(widened);
    assert.throws(() => bindForgeNativeRequest({
        authority_chain: widened,
        goal: 'must fail',
        acceptance: ['no mutation'],
    }), /scope_broader_than_authority/);
    assert.equal(stableNativeJson(widened), widenedBefore);
    assert.throws(() => deriveForgeNativeSwarmAuthority({
        ...authorityInput(), now: 10_000,
    }), /run_lease_expired/);
});

test('CP1 authority modules do not import the W01C controller', () => {
    const sources = [
        'src/tools/pennyone/intel/forge_native_swarm_authority.ts',
        'src/tools/cstar-kernel-mcp/tools/forge_native_request_binding.ts',
        'src/tools/cstar-kernel-mcp/tools/forge_native_authorization_binding.ts',
    ];
    for (const source of sources) {
        assert.doesNotMatch(fs.readFileSync(source, 'utf8'), /forge_native_swarm_controller/);
    }
});
