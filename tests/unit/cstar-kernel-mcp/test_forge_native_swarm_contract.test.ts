import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
    FORGE_NATIVE_CONNECTION_ID,
    FORGE_NATIVE_REQUEST_SCHEMA,
    type ForgeNativeAuthorityScope,
    type ForgeNativePlan,
    type ForgeNativeRequest,
    type ForgeNativeWorkerReceipt,
} from '../../../src/types/forge_native_swarm.js';
import {
    intersectNativeAuthority,
    hashNative,
    recordForgeNativePlan,
    recordForgeNativeWorkerReceipt,
    reserveForgeNativeRun,
} from '../../../src/tools/pennyone/intel/forge_native_swarm_controller.js';
import { completeForgeNativeRun } from '../../../src/tools/pennyone/intel/forge_native_swarm_completion.js';
import { ensureForgeNativeSwarmSchema, rehearseForgeNativeSwarmMigration } from '../../../src/tools/pennyone/intel/forge_native_swarm_schema.js';
import { assertForgeConnectionExecutable, buildForgeQuarantineManifest, listForgeConnectionHistory, tombstoneForgeConnection } from '../../../src/tools/pennyone/intel/forge_connection_tombstone.js';

function fixture(): { db: Database.Database; root: string; scope: ForgeNativeAuthorityScope; request: ForgeNativeRequest } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-native-swarm-'));
    const db = new Database(':memory:');
    db.exec('CREATE TABLE hall_forge_requests (request_id TEXT PRIMARY KEY, request_sha256 TEXT NOT NULL);');
    const scope: ForgeNativeAuthorityScope = {
        decision_id: 'CSF-D008-R1',
        set_batch_id: 'CSF-D008-FNS-SET-02',
        connection_id: FORGE_NATIVE_CONNECTION_ID,
        request_id: 'dispatch-forge-native-fixture',
        request_sha256: 'a'.repeat(64),
        source_repository: path.join(root, 'repo'),
        source_head: 'a'.repeat(40),
        execution_root: path.join(root, 'execution'),
        read_allowlist: [root],
        write_allowlist: [root],
        test_allowlist: [root],
        quarantine_allowlist: [root],
        effect_exclusions: ['git', 'migration', 'install', 'activation', 'deployment', 'production'],
        model_policy_sha256: 'b'.repeat(64),
        retry_policy: { initial_attempts: 1, repair_continuations: 1, unknown_retries: 0 },
        cancellation_policy: 'interrupt_all_then_cancel_or_unknown',
    };
    db.prepare('INSERT INTO hall_forge_requests (request_id, request_sha256) VALUES (?, ?)').run(scope.request_id, scope.request_sha256);
    const request: ForgeNativeRequest = {
        schema: FORGE_NATIVE_REQUEST_SCHEMA,
        authority: scope,
        goal: 'bounded native fixture',
        acceptance: ['all disjoint outputs pass'],
        source_identity: { repository: scope.source_repository, head: scope.source_head, execution_root: scope.execution_root },
        requested_identity: { model: 'gpt-5.6-luna', reasoning: 'max' },
        capabilities: ['spawn_agent', 'list_agents', 'send_message', 'followup_task', 'wait_agent', 'interrupt_agent'],
        deadline_at: Date.now() + 60_000,
        idempotency_key: 'native-fixture-key-01',
    };
    return { db, root, scope, request };
}

function authoritySet(scope: ForgeNativeAuthorityScope, mutate: Partial<ForgeNativeAuthorityScope> = {}): ForgeNativeAuthorityScope {
    return { ...scope, ...mutate };
}

test('additive native schema rehearses on a copied database and replays idempotently', () => {
    const { db } = fixture();
    const receipt = rehearseForgeNativeSwarmMigration(db);
    assert.equal(receipt.idempotent_replay, true);
    assert.deepEqual(receipt.existing_table_counts, { hall_forge_requests: 1 });
    assert.equal(receipt.foreign_key_check.every((entry) => entry.violations.length === 0), true);
    ensureForgeNativeSwarmSchema(db);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM hall_forge_requests').get().count, 1);
});

test('authority intersection rejects scalar drift and missing capability before reservation', () => {
    const { scope } = fixture();
    const effective = intersectNativeAuthority({
        durable_set: scope,
        immutable_request: authoritySet(scope, { read_allowlist: [scope.execution_root] }),
        connection_policy: scope,
        run_lease: scope,
    });
    assert.deepEqual(effective.effective_scope.read_allowlist, [scope.execution_root]);
    const narrowedEffects = intersectNativeAuthority({
        durable_set: scope,
        immutable_request: authoritySet(scope, { effect_exclusions: [...scope.effect_exclusions, 'network'] }),
        connection_policy: scope,
        run_lease: scope,
    });
    assert.equal(narrowedEffects.effective_scope.effect_exclusions.includes('network'), true);
    assert.throws(() => intersectNativeAuthority({
        durable_set: scope,
        immutable_request: authoritySet(scope, { effect_exclusions: [] }),
        connection_policy: scope,
        run_lease: scope,
    }), /forge_native_effect_scope_broader_than_authority/);
    assert.throws(() => intersectNativeAuthority({
        durable_set: scope,
        immutable_request: authoritySet(scope, { source_head: 'c'.repeat(40) }),
        connection_policy: scope,
        run_lease: scope,
    }), /forge_native_authority_scalar_mismatch/);
    const { db, request } = fixture();
    assert.throws(() => reserveForgeNativeRun(db, { request: { ...request, capabilities: ['spawn_agent'] }, evidence_root: '/tmp' }), /forge_native_capability_unavailable/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sqlite_master WHERE name = \'hall_forge_native_runs\'').get().count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM hall_forge_native_runs').get().count, 0);
});

test('one native lease is idempotent and separates worker package from control receipt', () => {
    const { db, request } = fixture();
    const first = reserveForgeNativeRun(db, { request, evidence_root: '/tmp' });
    const replay = reserveForgeNativeRun(db, { request, evidence_root: '/tmp' });
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(first.run.run_id, replay.run.run_id);
    assert.equal('cancellation_secret_sha256' in first.worker_package, false);
    assert.equal('control_receipt' in first.worker_package, false);
    assert.equal(first.control_receipt.schema, 'cstar.forge_native_control_receipt.v1');
    assert.throws(() => reserveForgeNativeRun(db, { request: { ...request, idempotency_key: 'native-other-key-01', authority: { ...request.authority, request_sha256: 'c'.repeat(64) } }, evidence_root: '/tmp' }), /forge_native_conflicting_replay|forge_native_request_missing/);
});

function planFor(runId: string, root: string): ForgeNativePlan {
    return {
        schema: 'cstar.forge_native_swarm_plan.v1',
        run_id: runId,
        parent_task_id: 'native-parent-fixture',
        work_items: [
            { work_item_id: 'leaf-a', idempotency_key: 'leaf-a-key-01', objective: 'write A', write_paths: [path.join(root, 'a.ts')], test_paths: [path.join(root, 'a.test.ts')], output_paths: [path.join(root, 'a.receipt')], useful: true, leaf_index: 0 },
            { work_item_id: 'leaf-b', idempotency_key: 'leaf-b-key-01', objective: 'write B', write_paths: [path.join(root, 'b.ts')], test_paths: [path.join(root, 'b.test.ts')], output_paths: [path.join(root, 'b.receipt')], useful: true, leaf_index: 1 },
        ],
        integration_paths: [root],
        expected_outputs: [path.join(root, 'a.receipt'), path.join(root, 'b.receipt')],
        plan_sha256: '',
    };
}

function receipt(runId: string, workItemId: string, taskId: string, role: 'parent' | 'leaf', files: ForgeNativeWorkerReceipt['changed_files'] = []): ForgeNativeWorkerReceipt {
    const base: ForgeNativeWorkerReceipt = {
        schema: 'cstar.forge_native_worker_receipt.v1', run_id: runId, work_item_id: workItemId,
        task_id: taskId, parent_task_id: 'native-parent-fixture', role, status: 'SUCCEEDED',
        requested_identity: { model: 'gpt-5.6-luna', reasoning: 'max' }, actual_identity: 'unreported', actual_identity_attested: false,
        changed_files: files, checks: [{ command: 'fixture-check', status: 'passed' }], artifacts: [], descendants: [], evidence_sha256: '',
    };
    return { ...base, evidence_sha256: hashNative({ ...base, evidence_sha256: '' }) };
}

test('plan rejects overlap and aggregate stops at DELIVERED_UNVERIFIED with replay', () => {
    const { db, request, scope, root } = fixture();
    const reserved = reserveForgeNativeRun(db, { request, evidence_root: '/tmp' });
    const plan = planFor(reserved.run.run_id, root);
    const validated = recordForgeNativePlan(db, reserved.run.run_id, plan, scope).plan;
    assert.throws(() => recordForgeNativePlan(db, reserved.run.run_id, { ...plan, work_items: [{ ...plan.work_items[0]!, output_paths: [plan.work_items[0]!.write_paths[0]!] }, plan.work_items[1]!] }, scope), /forge_native_plan_replay_conflict|forge_native_plan_path_overlap/);
    const parent = receipt(reserved.run.run_id, 'parent', validated.parent_task_id, 'parent');
    const leafA = receipt(reserved.run.run_id, 'leaf-a', 'native-leaf-a', 'leaf', [{ path: path.join(root, 'a.ts'), sha256: 'd'.repeat(64), byte_count: 1 }]);
    const leafB = receipt(reserved.run.run_id, 'leaf-b', 'native-leaf-b', 'leaf', [{ path: path.join(root, 'b.ts'), sha256: 'e'.repeat(64), byte_count: 1 }]);
    for (const worker of [parent, leafA, leafB]) recordForgeNativeWorkerReceipt(db, { run_id: reserved.run.run_id, plan: validated, receipt: worker });
    const candidateDigest = hashNative({ run_id: reserved.run.run_id, request_id: request.authority.request_id, plan_sha256: validated.plan_sha256, changed_files: [...leafA.changed_files, ...leafB.changed_files], worker_receipt_sha256: [parent, leafA, leafB].map((item) => item.evidence_sha256).sort() });
    const result = completeForgeNativeRun(db, { run_id: reserved.run.run_id, request_id: request.authority.request_id, plan: validated, parent_task_id: validated.parent_task_id, checks: [{ command: 'full focused suite', status: 'passed' }], artifacts: [], candidate_digest: candidateDigest });
    assert.equal(result.receipt.status, 'DELIVERED_UNVERIFIED');
    assert.equal(result.replayed, false);
    const replay = completeForgeNativeRun(db, { run_id: reserved.run.run_id, request_id: request.authority.request_id, plan: validated, parent_task_id: validated.parent_task_id, checks: [{ command: 'full focused suite', status: 'passed' }], artifacts: [], candidate_digest: candidateDigest });
    assert.equal(replay.replayed, true);
});

test('legacy connection tombstones remain readable and quarantine manifest is hash-bound', () => {
    const { db, root } = fixture();
    const tombstone = tombstoneForgeConnection(db, { connection_id: 'forge-v3-codex-host-handoff', generation: 3, connection_outcome: 'REJECTED_FINAL_CANONICAL_ATTEMPT', replacement_request_id: null, reason: 'native replacement', metadata: { historical: true } });
    tombstoneForgeConnection(db, { connection_id: 'forge-v2-hermes-minimax', generation: 2, connection_outcome: 'RETIRED', replacement_request_id: null, reason: 'native replacement', metadata: { historical: true } });
    assert.equal(tombstone.tombstone.executable, false);
    assert.equal(db.prepare('SELECT connection_id FROM hall_forge_connection_tombstones WHERE connection_id = ?').get('forge-v3-codex-host-handoff').connection_id, 'forge-v3-codex-host-handoff');
    assert.equal(listForgeConnectionHistory(db).length, 2);
    assert.throws(() => assertForgeConnectionExecutable(db, 'forge-v3-codex-host-handoff'), /forge_connection_generation/);
    assert.throws(() => assertForgeConnectionExecutable(db, 'forge-v2-hermes-minimax'), /forge_connection_generation/);
    const file = path.join(root, 'legacy.ts');
    fs.writeFileSync(file, 'legacy');
    const manifest = buildForgeQuarantineManifest({ source_root: root, generation: 'forge-v3-codex-host-handoff', source_branch: 'detached', source_head: 'a'.repeat(40), dirty_state_sha256: 'b'.repeat(64), reason: 'recoverable replacement', allowlist: ['legacy.ts'] });
    assert.equal(manifest.files[0]!.byte_count, 6);
    assert.equal(manifest.manifest_sha256.length, 64);
});
