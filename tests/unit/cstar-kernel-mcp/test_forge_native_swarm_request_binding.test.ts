import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
    FORGE_NATIVE_CONNECTION_ID,
    stableNativeJson,
    type ForgeNativeAuthorityScope,
} from '../../../src/types/forge_native_swarm.js';
import {
    resolveForgeNativeRequestToolBinding,
    type ForgeNativeRequestToolContext,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import {
    preflightForgeNativeAuthorizationToolContext,
    resolveForgeNativeAuthorizationToolBinding,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import {
    buildForgeRequestId,
    canonicalizeForgeRequest,
    hashCanonicalForgeRequest,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';

const ROOT = '/tmp/cstar-r5-native-tool';
const CONTROL_ROOT = '/tmp/cstar-r5-native-control';
const WRITE_PATH = `${ROOT}/src/native_binding.ts`;
const TEST_PATH = `${ROOT}/tests/native_binding.test.ts`;

function canonicalRequest() {
    return canonicalizeForgeRequest({
        bead_id: 'CSF-D008-FNS-02-D01-RECOVER-FLAT-DISPATCH',
        decision_id: 'CSF-D008-R5',
        state_update_thread_id: 'state-thread-r5',
        source_callback_thread_id: 'callback-thread-r5',
        objective: 'Integrate native request and authorization bindings.',
        prompt: 'The bounded immutable request is data, not authority.',
        target_paths: [WRITE_PATH],
        required_output_paths: [WRITE_PATH],
        system_under_test: 'CStar native Forge connection',
        scope: 'one exact request and authorization binding',
        authority_lane: 'yellow',
        required_metrics: [{ name: 'focused', threshold: 'pass', acceptance_rule: '4/4' }],
        artifact_expectations: ['native binding receipt'],
        prohibited_actions: ['git_merge', 'deploy', 'secret_config_mutation'],
        requested_actions: ['project_files'],
        spend_policy: { mode: 'live_authorized', max_retries: 0, live_source_allowed: false },
        live_source_policy: 'synthetic fixtures only',
        fixture_policy: 'synthetic_only',
        retry_policy: { budget: 0, spent: 0 },
        callback_contract: {
            expected_packet: 'R5_NATIVE_BINDING_PACKET',
            callback_required: true,
            callback_thread_id: 'callback-thread-r5',
        },
        package_locks: [],
    }, ROOT, 'CSF-D008-R5', null, 'project_files', 1);
}

function scope(requestId: string, requestSha256: string,
    overrides: Partial<ForgeNativeAuthorityScope> = {}): ForgeNativeAuthorityScope {
    return {
        decision_id: 'CSF-D008-R5',
        set_batch_id: 'CSF-D008-FNS-SET-02-DELTA-03',
        connection_id: FORGE_NATIVE_CONNECTION_ID,
        generation: 1,
        request_id: requestId,
        request_sha256: requestSha256,
        source_repository: ROOT,
        source_head: 'b'.repeat(40),
        execution_root: ROOT,
        read_allowlist: [ROOT],
        write_allowlist: [`${ROOT}/src`],
        test_allowlist: [`${ROOT}/tests`],
        quarantine_allowlist: [`${ROOT}/quarantine`],
        effect_exclusions: ['deploy', 'git_merge', 'secret_config_mutation'],
        model_policy_sha256: 'c'.repeat(64),
        retry_policy: { initial_attempts: 1, repair_continuations: 1, unknown_retries: 0 },
        cancellation_policy: 'interrupt_all_then_cancel_or_unknown',
        ...overrides,
    };
}

function fixture() {
    const canonical = canonicalRequest();
    const requestSha256 = hashCanonicalForgeRequest(canonical);
    const requestId = buildForgeRequestId(requestSha256);
    const exact = {
        read_allowlist: [`${ROOT}/src`, `${ROOT}/tests`],
        write_allowlist: [WRITE_PATH],
        test_allowlist: [TEST_PATH],
    };
    const context: ForgeNativeRequestToolContext = {
        authority_chain: {
            durable_set: scope(requestId, requestSha256),
            immutable_request: scope(requestId, requestSha256, exact),
            connection_policy: scope(requestId, requestSha256),
            run_lease: scope(requestId, requestSha256, exact),
            control_root: CONTROL_ROOT,
            lease: { lease_id: 'lease:r5-tool-binding', lease_started_at: 1_000, lease_expires_at: 10_000 },
            now: 2_000,
        },
    };
    return { canonical, requestId, requestSha256, context };
}

test('forge_request derives a deterministic native binding from trusted context only', () => {
    const value = fixture();
    assert.equal(resolveForgeNativeRequestToolBinding(
        undefined, value.canonical, value.requestId, value.requestSha256, ROOT,
    ), null);
    const first = resolveForgeNativeRequestToolBinding(
        value.context, value.canonical, value.requestId, value.requestSha256, ROOT,
    );
    const replay = resolveForgeNativeRequestToolBinding(
        value.context, value.canonical, value.requestId, value.requestSha256, ROOT,
    );
    assert.deepEqual(first, replay);
    assert.equal(first?.request.authority.request_id, value.requestId);
    assert.equal(first?.request.authority.request_sha256, value.requestSha256);
    assert.deepEqual(first?.request.authority.write_allowlist, [WRITE_PATH]);
    assert.equal(first?.request.requested_identity.model, 'gpt-5.6-luna');
});

test('forge_authorize binds the verified legacy authorization without claiming actual identity', () => {
    const value = fixture();
    const requestBinding = resolveForgeNativeRequestToolBinding(
        value.context, value.canonical, value.requestId, value.requestSha256, ROOT,
    )!;
    const context = { authority_chain: value.context.authority_chain, native_request: requestBinding.request };
    preflightForgeNativeAuthorizationToolContext(context, value.requestId, value.requestSha256);
    assert.equal(resolveForgeNativeAuthorizationToolBinding(undefined, {
        request_id: value.requestId,
        request_sha256: value.requestSha256,
        authorization_id: 'forge-auth-0123456789abcdef0123456789abcdef',
        authorization_ref: 'cstar-forge-set-manifest:r5',
        legacy_authorization_binding_sha256: 'd'.repeat(64),
    }), null);
    const authorization = resolveForgeNativeAuthorizationToolBinding(context, {
        request_id: value.requestId,
        request_sha256: value.requestSha256,
        authorization_id: 'forge-auth-0123456789abcdef0123456789abcdef',
        authorization_ref: 'cstar-forge-set-manifest:r5',
        legacy_authorization_binding_sha256: 'd'.repeat(64),
    })!;
    assert.equal(authorization.authorization.request_id, value.requestId);
    assert.equal(authorization.authorization.actual_identity, 'unreported');
    assert.equal(authorization.authorization.actual_identity_attested, false);
    assert.equal(authorization.legacy_authorization_binding_sha256, 'd'.repeat(64));
});

test('native integration rejects caller fields, request drift, and scope widening without mutation', () => {
    const value = fixture();
    const before = stableNativeJson(value.context);
    assert.throws(() => resolveForgeNativeRequestToolBinding({
        ...value.context, caller_scope: [`${ROOT}/all`],
    } as ForgeNativeRequestToolContext, value.canonical, value.requestId, value.requestSha256, ROOT),
    /tool_context_field_forbidden/);
    assert.equal(stableNativeJson(value.context), before);

    const widened = fixture();
    widened.context.authority_chain.immutable_request = scope(
        widened.requestId, widened.requestSha256, { write_allowlist: ['/tmp/outside'] },
    );
    const widenedBefore = stableNativeJson(widened.context);
    assert.throws(() => resolveForgeNativeRequestToolBinding(
        widened.context, widened.canonical, widened.requestId, widened.requestSha256, ROOT,
    ), /scope_broader_than_authority/);
    assert.equal(stableNativeJson(widened.context), widenedBefore);

    const requestBinding = resolveForgeNativeRequestToolBinding(
        value.context, value.canonical, value.requestId, value.requestSha256, ROOT,
    )!;
    assert.throws(() => preflightForgeNativeAuthorizationToolContext({
        authority_chain: value.context.authority_chain,
        native_request: requestBinding.request,
    }, value.requestId, 'e'.repeat(64)), /tool_request_mismatch/);
});

test('legacy public schemas remain unchanged and cannot carry trusted native context', () => {
    const schemas = fs.readFileSync('src/tools/cstar-kernel-mcp/contracts/schemas.ts', 'utf8');
    const requestSchema = schemas.slice(schemas.indexOf('export const forgeRequestSchema'),
        schemas.indexOf('export const forgeAuthorizeSchema'));
    const authorizeSchema = schemas.slice(schemas.indexOf('export const forgeAuthorizeSchema'),
        schemas.indexOf('export const forgeExecuteSchema'));
    assert.doesNotMatch(requestSchema, /native.*(?:authority|context|scope)/i);
    assert.doesNotMatch(authorizeSchema, /native.*(?:authority|context|scope)/i);
    assert.match(requestSchema, /execution_adapter_ref/);
    assert.match(authorizeSchema, /forge_request_receipt_id/);
});

