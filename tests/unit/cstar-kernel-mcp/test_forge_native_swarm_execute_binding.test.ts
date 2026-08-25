import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
    FORGE_NATIVE_CONNECTION_ID,
    stableNativeJson,
    type ForgeNativeAuthorization,
    type ForgeNativeAuthorityScope,
    type ForgeNativeRequest,
} from '../../../src/types/forge_native_swarm.js';
import { bindForgeNativeAuthorization } from '../../../src/tools/cstar-kernel-mcp/tools/forge_native_authorization_binding.js';
import { bindForgeNativeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_native_request_binding.js';
import {
    nativeExecutionResponse,
    reserveForgeNativeExecution,
    verifyForgeNativeExecuteBinding,
    type ForgeNativeExecuteInput,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_native_execute_binding.js';
import { ensureForgeNativeSwarmSchema } from '../../../src/tools/pennyone/intel/forge_native_swarm_schema.js';

const ROOT = '/tmp/cstar-r5-w01c-binding';
const CONTROL_ROOT = '/tmp/cstar-r5-w01c-binding-control';
const REQUEST_ID = 'dispatch-forge-fedcba9876543210fedcba9876543210';
const REQUEST_SHA256 = 'a'.repeat(64);

function scope(overrides: Partial<ForgeNativeAuthorityScope> = {}): ForgeNativeAuthorityScope {
    return {
        decision_id: 'CSF-D008-R5', set_batch_id: 'CSF-D008-FNS-SET-02-DELTA-03', connection_id: FORGE_NATIVE_CONNECTION_ID,
        generation: 1, request_id: REQUEST_ID, request_sha256: REQUEST_SHA256, source_repository: ROOT,
        source_head: 'b'.repeat(40), execution_root: ROOT, read_allowlist: [ROOT], write_allowlist: [`${ROOT}/src`],
        test_allowlist: [`${ROOT}/tests`], quarantine_allowlist: [`${ROOT}/quarantine`], effect_exclusions: ['git', 'network'],
        model_policy_sha256: 'c'.repeat(64), retry_policy: { initial_attempts: 1, repair_continuations: 1, unknown_retries: 0 },
        cancellation_policy: 'interrupt_all_then_cancel_or_unknown', ...overrides,
    };
}

function pair(): { request: ForgeNativeRequest; authorization: ForgeNativeAuthorization; context: ForgeNativeExecuteInput['native_context'] } {
    const chain = {
        durable_set: scope(), immutable_request: scope({ write_allowlist: [`${ROOT}/src/binding.ts`], test_allowlist: [`${ROOT}/tests/binding.test.ts`] }),
        connection_policy: scope(), run_lease: scope({ write_allowlist: [`${ROOT}/src/binding.ts`], test_allowlist: [`${ROOT}/tests/binding.test.ts`] }),
        control_root: CONTROL_ROOT, lease: { lease_id: 'lease:r5-w01c-binding', lease_started_at: 1_000, lease_expires_at: 10_000 }, now: 2_000,
    };
    const request = bindForgeNativeRequest({ authority_chain: chain, goal: 'Bind native execute.', acceptance: [stableNativeJson({ name: 'execute', threshold: 'pass', acceptance_rule: 'one', unit: null })] });
    const authorization = bindForgeNativeAuthorization({ authority_chain: chain, native_request: request.request,
        authorization_id: 'forge-auth-fedcba9876543210fedcba9876543210', authorization_ref: 'cstar-set:r5', legacy_authorization_binding_sha256: 'd'.repeat(64) });
    return { request: request.request, authorization: authorization.authorization, context: { authority_chain: chain, native_request: request.request, native_authorization: authorization.authorization } };
}

function dbFor(request: ForgeNativeRequest): Database.Database {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE hall_forge_requests (request_id TEXT PRIMARY KEY, request_sha256 TEXT NOT NULL);');
    db.prepare('INSERT INTO hall_forge_requests VALUES (?, ?)').run(request.authority.request_id, request.authority.request_sha256);
    ensureForgeNativeSwarmSchema(db, { copied_state: true });
    db.prepare(`INSERT INTO hall_forge_connection_generations
        (connection_id, generation, status, executable, policy_json, created_at, updated_at)
        VALUES (?, 1, 'ACTIVE', 1, '{}', 1, 1)`).run(FORGE_NATIVE_CONNECTION_ID);
    return db;
}

function canonical(goal: string) {
    return { objective: goal, required_metrics: [{ name: 'execute', threshold: 'pass', acceptance_rule: 'one', unit: null }] } as never;
}

function legacyRequest(request: ForgeNativeRequest) {
    return { request_id: REQUEST_ID, request_sha256: REQUEST_SHA256, adapter_ref: FORGE_NATIVE_CONNECTION_ID } as never;
}

test('execute binding reserves one split native run and keeps identity separate', () => {
    const value = pair();
    const db = dbFor(value.request);
    const input: ForgeNativeExecuteInput = {
        db, request: legacyRequest(value.request), authorization: {} as never, canonical: canonical(value.request.goal),
        code_root: ROOT, control_root: CONTROL_ROOT, native_context: value.context, now: 2_000,
    };
    const first = reserveForgeNativeExecution(input);
    const replay = reserveForgeNativeExecution(input);
    assert.equal(first.reservation.replayed, false);
    assert.equal(replay.reservation.replayed, true);
    assert.deepEqual(first.binding, replay.binding);
    verifyForgeNativeExecuteBinding(first);
    assert.deepEqual(first.binding.requested_identity, { model: 'gpt-5.6-luna', reasoning: 'max' });
    assert.equal(first.binding.actual_identity, 'unreported');
    assert.equal(first.binding.actual_identity_attested, false);
    const response = nativeExecutionResponse(first, { forge_request_receipt_id: REQUEST_ID });
    assert.match(String(response.content?.[0]?.text ?? ''), /native_run_reserved|native_run_replayed/);
    db.close();
});

test('execute binding rejects caller authority and request drift before native mutation', () => {
    const value = pair();
    const db = dbFor(value.request);
    const base: ForgeNativeExecuteInput = {
        db, request: legacyRequest(value.request), authorization: {} as never, canonical: canonical(value.request.goal),
        code_root: ROOT, control_root: CONTROL_ROOT, native_context: value.context, now: 2_000,
    };
    assert.throws(() => reserveForgeNativeExecution({ ...base, caller: { native_authorization: value.authorization } }), /caller_authority_forbidden/);
    assert.throws(() => reserveForgeNativeExecution({ ...base, canonical: canonical('drifted objective') }), /request_binding_mismatch/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM hall_forge_native_runs').get().count, 0);
    assert.throws(() => reserveForgeNativeExecution({ ...base, native_context: undefined }), /execute_context_missing/);
    db.close();
});

test('legacy execute input without native context remains non-native', () => {
    const value = pair();
    const db = dbFor(value.request);
    const input: ForgeNativeExecuteInput = {
        db, request: legacyRequest(value.request), authorization: {} as never, canonical: canonical(value.request.goal),
        code_root: ROOT, control_root: CONTROL_ROOT, now: 2_000,
    };
    assert.throws(() => reserveForgeNativeExecution(input), /execute_context_missing/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM hall_forge_native_runs').get().count, 0);
    db.close();
});
