import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { FORGE_NATIVE_CONNECTION_ID, type ForgeNativeAuthorityScope, type ForgeNativeAuthorization, type ForgeNativeRequest, intersectNativeAuthority } from '../../../src/types/forge_native_swarm.js';
import { ensureForgeNativeSwarmSchema } from '../../../src/tools/pennyone/intel/forge_native_swarm_schema.js';
import { reserveForgeNativeRun } from '../../../src/tools/pennyone/intel/forge_native_swarm_controller.js';

function fixture(): { db: Database.Database; request: ForgeNativeRequest; authorization: ForgeNativeAuthorization; scope: ForgeNativeAuthorityScope } {
    const db = new Database(':memory:'); db.exec('CREATE TABLE hall_forge_requests (request_id TEXT PRIMARY KEY, request_sha256 TEXT NOT NULL);'); ensureForgeNativeSwarmSchema(db);
    const root = '/tmp/cstar-native-authority';
    const scope: ForgeNativeAuthorityScope = { decision_id: 'decision-1', set_batch_id: 'set-1', connection_id: FORGE_NATIVE_CONNECTION_ID, generation: 1, request_id: 'request-1', request_sha256: 'a'.repeat(64), source_repository: root, source_head: 'b'.repeat(40), execution_root: root, read_allowlist: [root], write_allowlist: [root], test_allowlist: [root], quarantine_allowlist: [root], effect_exclusions: ['git', 'network'], model_policy_sha256: 'c'.repeat(64), retry_policy: { initial_attempts: 1, repair_continuations: 1, unknown_retries: 0 }, cancellation_policy: 'interrupt_all_then_cancel_or_unknown' };
    db.prepare('INSERT INTO hall_forge_requests (request_id, request_sha256) VALUES (?, ?)').run(scope.request_id, scope.request_sha256);
    db.prepare(`INSERT INTO hall_forge_connection_generations (connection_id, generation, status, executable, policy_json, created_at, updated_at) VALUES (?, 1, 'ACTIVE', 1, '{}', 1, 1)`).run(FORGE_NATIVE_CONNECTION_ID);
    const request: ForgeNativeRequest = { schema: 'cstar.forge_native_swarm_request.v1', authority: scope, goal: 'bounded authority fixture', acceptance: ['pass'], source_identity: { repository: root, head: scope.source_head, execution_root: root }, requested_identity: { model: 'gpt-5.6-luna', reasoning: 'max' }, capabilities: ['spawn_agent', 'list_agents', 'send_message', 'followup_task', 'wait_agent', 'interrupt_agent'], deadline_at: Date.now() + 60_000, idempotency_key: 'request-1', evidence_root: `${root}/evidence` };
    const authorization: ForgeNativeAuthorization = { schema: 'cstar.forge_native_swarm_authorization.v1', request_id: scope.request_id, request_sha256: scope.request_sha256, authorization_id: 'authorization-1', authorization_ref: 'root-auth-1', authority: scope, scope_sha256: '', evidence_root: request.evidence_root!, requested_identity: request.requested_identity, actual_identity: 'unreported', actual_identity_attested: false, binding_sha256: '' };
    authorization.scope_sha256 = intersectNativeAuthority({ durable_set: scope, immutable_request: scope, connection_policy: scope, run_lease: scope }).scope_sha256;
    return { db, request, authorization, scope };
}

test('durable authority intersection narrows paths and cannot widen effects or scalars', () => {
    const { scope } = fixture();
    const narrowed = { ...scope, read_allowlist: [`${scope.execution_root}/src`] };
    assert.deepEqual(intersectNativeAuthority({ durable_set: scope, immutable_request: narrowed, connection_policy: scope, run_lease: scope }).effective_scope.read_allowlist, narrowed.read_allowlist);
    assert.throws(() => intersectNativeAuthority({ durable_set: scope, immutable_request: { ...scope, source_head: 'd'.repeat(40) }, connection_policy: scope, run_lease: scope }), /scalar_mismatch/);
    assert.throws(() => intersectNativeAuthority({ durable_set: scope, immutable_request: { ...scope, effect_exclusions: ['git'] }, connection_policy: scope, run_lease: scope }), /effect_scope_broader/);
});

test('native reservation needs an already active generation and returns one split idempotent lease', () => {
    const { db, request, authorization } = fixture();
    const first = reserveForgeNativeRun(db, { request, authorization });
    const replay = reserveForgeNativeRun(db, { request, authorization });
    assert.equal(first.replayed, false); assert.equal(replay.replayed, true); assert.equal(replay.run.run_id, first.run.run_id);
    assert.equal('cancellation_secret_sha256' in first.worker_package, false); assert.equal(first.control_receipt.schema, 'cstar.forge_native_control_receipt.v1');
    assert.throws(() => reserveForgeNativeRun(db, { request: { ...request, idempotency_key: 'different-key' }, authorization }), /conflicting_replay/);
    const inactive = new Database(':memory:'); inactive.exec('CREATE TABLE hall_forge_requests (request_id TEXT PRIMARY KEY, request_sha256 TEXT NOT NULL);'); ensureForgeNativeSwarmSchema(inactive); inactive.prepare('INSERT INTO hall_forge_requests (request_id, request_sha256) VALUES (?, ?)').run(request.authority.request_id, request.authority.request_sha256);
    assert.throws(() => reserveForgeNativeRun(inactive, { request, authorization }), /generation_unbound/); assert.equal(inactive.prepare('SELECT COUNT(*) AS count FROM hall_forge_native_runs').get().count, 0);
});
