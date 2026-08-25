import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
    FORGE_NATIVE_CONNECTION_ID,
    hashNative,
    stableNativeJson,
    type ForgeNativeAuthorityScope,
    type ForgeNativePlan,
    type ForgeNativeRequest,
    type ForgeNativeWorkerReceipt,
} from '../../../src/types/forge_native_swarm.js';
import { bindForgeNativeAuthorization } from '../../../src/tools/cstar-kernel-mcp/tools/forge_native_authorization_binding.js';
import { bindForgeNativeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_native_request_binding.js';
import {
    cancelForgeNativeRun,
    getForgeNativeRun,
    listForgeNativeWorkerReceipts,
    nativeRunControlReceipt,
    nativeRunPackage,
    nativeRunScope,
    recordForgeNativePlan,
    recordForgeNativeWorkerReceipt,
    reserveForgeNativeRun,
} from '../../../src/tools/pennyone/intel/forge_native_swarm_controller.js';
import { ensureForgeNativeSwarmSchema } from '../../../src/tools/pennyone/intel/forge_native_swarm_schema.js';

const ROOT = '/tmp/cstar-r5-w01c-controller';
const CONTROL_ROOT = '/tmp/cstar-r5-w01c-control';
const REQUEST_ID = 'dispatch-forge-0123456789abcdef0123456789abcdef';
const REQUEST_SHA256 = 'a'.repeat(64);

function scope(overrides: Partial<ForgeNativeAuthorityScope> = {}): ForgeNativeAuthorityScope {
    return {
        decision_id: 'CSF-D008-R5', set_batch_id: 'CSF-D008-FNS-SET-02-DELTA-03',
        connection_id: FORGE_NATIVE_CONNECTION_ID, generation: 1, request_id: REQUEST_ID,
        request_sha256: REQUEST_SHA256, source_repository: ROOT, source_head: 'b'.repeat(40),
        execution_root: ROOT, read_allowlist: [ROOT], write_allowlist: [`${ROOT}/src`],
        test_allowlist: [`${ROOT}/tests`], quarantine_allowlist: [`${ROOT}/quarantine`],
        effect_exclusions: ['git', 'network', 'deploy'], model_policy_sha256: 'c'.repeat(64),
        retry_policy: { initial_attempts: 1, repair_continuations: 1, unknown_retries: 0 },
        cancellation_policy: 'interrupt_all_then_cancel_or_unknown', ...overrides,
    };
}

function authorityInput() {
    const exact = { write_allowlist: [`${ROOT}/src/module.ts`], test_allowlist: [`${ROOT}/tests/module.test.ts`] };
    return {
        durable_set: scope(), immutable_request: scope(exact), connection_policy: scope(),
        run_lease: scope(exact), control_root: CONTROL_ROOT,
        lease: { lease_id: 'lease:r5-w01c', lease_started_at: 1_000, lease_expires_at: 10_000 }, now: 2_000,
    };
}

function nativePair(): { request: ForgeNativeRequest; authorization: ReturnType<typeof bindForgeNativeAuthorization>['authorization'] } {
    const chain = authorityInput();
    const request = bindForgeNativeRequest({ authority_chain: chain, goal: 'Execute one bounded native Forge run.', acceptance: ['focused checks pass'] });
    const authorization = bindForgeNativeAuthorization({ authority_chain: chain, native_request: request.request,
        authorization_id: 'forge-auth-0123456789abcdef0123456789abcdef', authorization_ref: 'cstar-set:r5',
        legacy_authorization_binding_sha256: 'd'.repeat(64) });
    return { request: request.request, authorization: authorization.authorization };
}

function database(request: ForgeNativeRequest): Database.Database {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE hall_forge_requests (request_id TEXT PRIMARY KEY, request_sha256 TEXT NOT NULL);');
    db.prepare('INSERT INTO hall_forge_requests VALUES (?, ?)').run(request.authority.request_id, request.authority.request_sha256);
    ensureForgeNativeSwarmSchema(db, { copied_state: true });
    db.prepare(`INSERT INTO hall_forge_connection_generations
        (connection_id, generation, status, executable, policy_json, created_at, updated_at)
        VALUES (?, 1, 'ACTIVE', 1, '{}', 1, 1)`).run(FORGE_NATIVE_CONNECTION_ID);
    return db;
}

test('controller derives one lease, split receipts, and byte-identical replay', () => {
    const pair = nativePair();
    const db = database(pair.request);
    const first = reserveForgeNativeRun(db, { request: pair.request, authorization: pair.authorization, now: 2_000 });
    const replay = reserveForgeNativeRun(db, { request: pair.request, authorization: pair.authorization, now: 9_000 });
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.deepEqual(first.worker_package, replay.worker_package);
    assert.deepEqual(first.control_receipt, replay.control_receipt);
    assert.equal('lease_id' in first.worker_package, false);
    assert.equal('cancellation_secret_sha256' in first.worker_package, false);
    assert.equal('worker_package' in first.control_receipt, false);
    assert.equal(first.run.state, 'RESERVED');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM hall_forge_native_runs').get().count, 1);
    const conflicting = { ...pair.request, idempotency_key: 'conflicting-native-key' } as ForgeNativeRequest;
    assert.throws(() => reserveForgeNativeRun(db, { request: conflicting, authorization: pair.authorization, now: 2_000 }), /conflicting_replay/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM hall_forge_native_runs').get().count, 1);
    db.close();
});

test('read-only status and package projections do not write copied state', () => {
    const pair = nativePair();
    const db = database(pair.request);
    const reserved = reserveForgeNativeRun(db, { request: pair.request, authorization: pair.authorization, now: 2_000 });
    const before = stableNativeJson(db.prepare(`SELECT * FROM hall_forge_native_runs WHERE run_id = ?`).get(reserved.run.run_id));
    assert.equal(getForgeNativeRun(db, reserved.run.run_id).run_id, reserved.run.run_id);
    assert.equal(nativeRunScope(db, reserved.run.run_id).request_sha256, REQUEST_SHA256);
    assert.equal(nativeRunPackage(db, reserved.run.run_id).run_id, reserved.run.run_id);
    assert.equal(nativeRunControlReceipt(db, reserved.run.run_id).run_id, reserved.run.run_id);
    assert.deepEqual(listForgeNativeWorkerReceipts(db, reserved.run.run_id), []);
    const after = stableNativeJson(db.prepare(`SELECT * FROM hall_forge_native_runs WHERE run_id = ?`).get(reserved.run.run_id));
    assert.equal(after, before);
    db.close();
});

test('cancellation requires the exact CStar control lease and freezes UNKNOWN', () => {
    const pair = nativePair();
    const db = database(pair.request);
    const reserved = reserveForgeNativeRun(db, { request: pair.request, authorization: pair.authorization, now: 2_000 });
    assert.throws(() => cancelForgeNativeRun(db, reserved.run.run_id, { ...reserved.control_receipt, lease_id: 'wrong' }), /control_receipt_invalid/);
    const cancelled = cancelForgeNativeRun(db, reserved.run.run_id, reserved.control_receipt);
    assert.equal(cancelled.state, 'CANCEL_REQUESTED');
    assert.deepEqual(cancelForgeNativeRun(db, reserved.run.run_id, reserved.control_receipt), cancelled);
    db.prepare(`UPDATE hall_forge_native_runs SET state = 'UNKNOWN' WHERE run_id = ?`).run(reserved.run.run_id);
    assert.throws(() => cancelForgeNativeRun(db, reserved.run.run_id, reserved.control_receipt), /unknown_frozen/);
    db.close();
});

test('copied-state plan and worker receipt replay are deterministic', () => {
    const pair = nativePair();
    const db = database(pair.request);
    const reserved = reserveForgeNativeRun(db, { request: pair.request, authorization: pair.authorization, now: 2_000 });
    const plan: ForgeNativePlan = { schema: 'cstar.forge_native_swarm_plan.v1', run_id: reserved.run.run_id,
        parent_task_id: 'parent:r5-w01c', work_items: [], integration_paths: [], expected_outputs: [], plan_sha256: '' };
    const planned = recordForgeNativePlan(db, reserved.run.run_id, plan, nativeRunScope(db, reserved.run.run_id));
    assert.equal(planned.plan_sha256, hashNative({ ...plan, plan_sha256: '' }));
    const receiptBase: Omit<ForgeNativeWorkerReceipt, 'evidence_sha256'> = { schema: 'cstar.forge_native_worker_receipt.v1',
        run_id: reserved.run.run_id, work_item_id: 'parent-work', task_id: 'parent:r5-w01c', parent_task_id: 'parent:r5-w01c', role: 'parent', status: 'SUCCEEDED',
        requested_identity: { model: 'gpt-5.6-luna', reasoning: 'max' }, actual_identity: 'unreported', actual_identity_attested: false,
        changed_files: [], checks: [], artifacts: [], descendants: [] };
    const receipt = { ...receiptBase, evidence_sha256: hashNative({ ...receiptBase, evidence_sha256: '' }) };
    const first = recordForgeNativeWorkerReceipt(db, { run_id: reserved.run.run_id, plan, receipt, now: 3_000 });
    const replay = recordForgeNativeWorkerReceipt(db, { run_id: reserved.run.run_id, plan, receipt, now: 4_000 });
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.deepEqual(listForgeNativeWorkerReceipts(db, reserved.run.run_id), [receipt]);
    db.close();
});
