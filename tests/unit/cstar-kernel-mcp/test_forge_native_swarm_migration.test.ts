import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { FORGE_NATIVE_CONNECTION_ID, intersectNativeAuthority, type ForgeNativeAuthorization, type ForgeNativeRequest } from '../../../src/types/forge_native_swarm.js';
import { ensureForgeNativeSwarmSchema, rehearseForgeNativeSwarmMigration } from '../../../src/tools/pennyone/intel/forge_native_swarm_schema.js';
import { tombstoneForgeConnection, assertForgeConnectionExecutable, listForgeConnectionHistory } from '../../../src/tools/pennyone/intel/forge_connection_tombstone.js';
import { markForgeNativeRunUnknown, reserveForgeNativeRun, updateForgeNativeRunState } from '../../../src/tools/pennyone/intel/forge_native_swarm_controller.js';

function base(): { db: Database.Database; request: ForgeNativeRequest; authorization: ForgeNativeAuthorization } {
    const db = new Database(':memory:'); db.exec('CREATE TABLE hall_forge_requests (request_id TEXT PRIMARY KEY, request_sha256 TEXT NOT NULL); CREATE TABLE hall_beads (bead_id TEXT PRIMARY KEY);'); ensureForgeNativeSwarmSchema(db);
    const root = '/tmp/cstar-native-migration';
    const scope = { decision_id: 'decision-1', set_batch_id: 'set-1', connection_id: FORGE_NATIVE_CONNECTION_ID as const, generation: 1, request_id: 'request-migration', request_sha256: 'a'.repeat(64), source_repository: root, source_head: 'b'.repeat(40), execution_root: root, read_allowlist: [root], write_allowlist: [root], test_allowlist: [root], quarantine_allowlist: [root], effect_exclusions: ['git'], model_policy_sha256: 'c'.repeat(64), retry_policy: { initial_attempts: 1 as const, repair_continuations: 1 as const, unknown_retries: 0 as const }, cancellation_policy: 'interrupt_all_then_cancel_or_unknown' as const };
    db.prepare('INSERT INTO hall_forge_requests (request_id, request_sha256) VALUES (?, ?)').run(scope.request_id, scope.request_sha256);
    db.prepare(`INSERT INTO hall_forge_connection_generations (connection_id, generation, status, executable, policy_json, created_at, updated_at) VALUES (?, 1, 'ACTIVE', 1, '{}', 1, 1)`).run(FORGE_NATIVE_CONNECTION_ID);
    const request: ForgeNativeRequest = { schema: 'cstar.forge_native_swarm_request.v1', authority: scope, goal: 'migration fixture', acceptance: ['pass'], source_identity: { repository: root, head: scope.source_head, execution_root: root }, requested_identity: { model: 'gpt-5.6-luna', reasoning: 'max' }, capabilities: ['spawn_agent', 'list_agents', 'send_message', 'followup_task', 'wait_agent', 'interrupt_agent'], deadline_at: Date.now() + 60_000, idempotency_key: scope.request_id, evidence_root: `${root}/evidence` };
    const authorization: ForgeNativeAuthorization = { schema: 'cstar.forge_native_swarm_authorization.v1', request_id: scope.request_id, request_sha256: scope.request_sha256, authorization_id: 'authorization-migration', authorization_ref: 'root-auth', authority: scope, scope_sha256: '', evidence_root: request.evidence_root!, requested_identity: request.requested_identity, actual_identity: 'unreported', actual_identity_attested: false, binding_sha256: '' };
    authorization.scope_sha256 = intersectNativeAuthority({ durable_set: scope, immutable_request: scope, connection_policy: scope, run_lease: scope }).scope_sha256;
    return { db, request, authorization };
}

test('copied-state migration is additive, idempotent, row-preserving, and FK-checked', () => {
    const db = new Database(':memory:'); db.exec('CREATE TABLE hall_forge_requests (request_id TEXT PRIMARY KEY, request_sha256 TEXT NOT NULL); INSERT INTO hall_forge_requests VALUES (\'old-request\', \'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\');');
    const receipt = rehearseForgeNativeSwarmMigration(db, { copied_state: true });
    assert.equal(receipt.idempotent_replay, true); assert.equal(receipt.copied_state, true); assert.deepEqual(receipt.existing_table_counts, { hall_forge_requests: 1 });
    assert.equal(receipt.foreign_key_check.every((entry) => entry.violations.length === 0), true); assert.equal(db.prepare('SELECT COUNT(*) AS count FROM hall_forge_requests').get().count, 1);
});

test('legacy generations are tombstoned but readable, and UNKNOWN runs stay frozen', () => {
    const { db, request, authorization } = base();
    tombstoneForgeConnection(db, { connection_id: 'forge-v3-codex-host-handoff', generation: 3, connection_outcome: 'REJECTED_FINAL_CANONICAL_ATTEMPT', replacement_request_id: null, reason: 'native replacement', metadata: { copied_state: true } });
    assert.equal(listForgeConnectionHistory(db).length, 1); assert.throws(() => assertForgeConnectionExecutable(db, 'forge-v3-codex-host-handoff'), /generation_rejected/);
    const run = reserveForgeNativeRun(db, { request, authorization }); const unknown = markForgeNativeRunUnknown(db, run.run.run_id, 'lost terminal receipt');
    assert.equal(unknown.state, 'UNKNOWN'); assert.throws(() => updateForgeNativeRunState(db, run.run.run_id, 'RUNNING'), /unknown_frozen/);
    const replay = reserveForgeNativeRun(db, { request, authorization }); assert.equal(replay.replayed, true); assert.equal(replay.run.state, 'UNKNOWN');
});
