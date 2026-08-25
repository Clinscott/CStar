import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
    FORGE_NATIVE_CONNECTION_ID,
    hashNative,
    stableNativeJson,
    type ForgeNativeAuthorityScope,
    type ForgeNativeControlReceipt,
    type ForgeNativePlan,
    type ForgeNativeWorkerReceipt,
} from '../../../src/types/forge_native_swarm.js';
import { ensureForgeNativeSwarmSchema } from '../../../src/tools/pennyone/intel/forge_native_swarm_schema.js';
import { getForgeNativeRun } from '../../../src/tools/pennyone/intel/forge_native_swarm_controller.js';
import { handleForgeSwarmPlan } from '../../../src/tools/cstar-kernel-mcp/tools/forge_swarm_plan.js';
import { handleForgeSwarmStatus } from '../../../src/tools/cstar-kernel-mcp/tools/forge_swarm_status.js';
import { handleForgeSwarmUpdate } from '../../../src/tools/cstar-kernel-mcp/tools/forge_swarm_update.js';

function setup() {
    const root = fs.mkdtempSync('/tmp/cstar-r6-lifecycle-');
    fs.mkdirSync(`${root}/src`); fs.mkdirSync(`${root}/tests`); fs.mkdirSync(`${root}/evidence`);
    const runId = 'native-run-r6-lifecycle'; const requestId = 'request-r6-lifecycle';
    const scope: ForgeNativeAuthorityScope = {
        decision_id: 'CSF-D008-R6', set_batch_id: 'CSF-D008-FNS-SET-02-DELTA-04',
        connection_id: FORGE_NATIVE_CONNECTION_ID, generation: 1, request_id: requestId,
        request_sha256: 'a'.repeat(64), source_repository: root, source_head: 'b'.repeat(40),
        execution_root: root, read_allowlist: [root], write_allowlist: [`${root}/src`],
        test_allowlist: [`${root}/tests`], quarantine_allowlist: [], effect_exclusions: ['git', 'network'],
        model_policy_sha256: 'c'.repeat(64),
        retry_policy: { initial_attempts: 1, repair_continuations: 1, unknown_retries: 0 },
        cancellation_policy: 'interrupt_all_then_cancel_or_unknown',
    };
    const control: ForgeNativeControlReceipt = {
        schema: 'cstar.forge_native_control_receipt.v1', run_id: runId, request_id: requestId,
        lease_id: 'lease-r6-lifecycle', lease_expires_at: 10_000,
        cancellation_secret_sha256: 'd'.repeat(64),
    };
    const workerPackage = {
        schema: 'cstar.forge_native_worker_package.v1', run_id: runId,
        work_package_id: 'package-r6-lifecycle', goal: 'Record direct worker receipts.',
        acceptance: ['focused checks pass'], execution_root: root,
        source_identity: { repository: root, head: scope.source_head }, read_allowlist: [root],
        write_allowlist: scope.write_allowlist, test_allowlist: scope.test_allowlist,
        protected_effect_exclusions: scope.effect_exclusions,
        topology_ceiling: { parent: 1, leaves: 3, descendants: 0 },
        requested_identity: { model: 'gpt-5.6-luna', reasoning: 'max' },
        evidence_root: `${root}/evidence`, deadline_at: 10_000,
    };
    const db = new Database(':memory:');
    db.exec('CREATE TABLE hall_forge_requests (request_id TEXT PRIMARY KEY, request_sha256 TEXT NOT NULL);');
    db.prepare('INSERT INTO hall_forge_requests VALUES (?, ?)').run(requestId, scope.request_sha256);
    ensureForgeNativeSwarmSchema(db, { copied_state: true });
    db.prepare(`INSERT INTO hall_forge_native_runs
        (run_id, request_id, request_sha256, connection_id, generation, set_batch_id,
         authority_scope_json, source_identity_json, idempotency_key, lease_id, lease_expires_at,
         state, worker_package_json, control_receipt_json, unresolved_gaps_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'idempotency-r6-lifecycle', ?, 10000,
        'RESERVED', ?, ?, '[]', 1000, 1000)`)
        .run(runId, requestId, scope.request_sha256, FORGE_NATIVE_CONNECTION_ID, scope.set_batch_id,
            stableNativeJson(scope), stableNativeJson({ repository: root, head: scope.source_head,
                execution_root: root }), control.lease_id,
            stableNativeJson(workerPackage), stableNativeJson(control));
    const output = `${root}/src/result.ts`; const testPath = `${root}/tests/result.test.ts`;
    const base: ForgeNativePlan = {
        schema: 'cstar.forge_native_swarm_plan.v1', run_id: runId,
        parent_task_id: 'root-task-r6-lifecycle', work_items: [{
            work_item_id: 'work-r6-lifecycle', idempotency_key: 'work-key-r6-lifecycle',
            objective: 'Write the result.', write_paths: [output], test_paths: [testPath],
            output_paths: [], useful: true, leaf_index: 0,
        }], integration_paths: [], expected_outputs: [output], plan_sha256: '',
    };
    const plan = { ...base, plan_sha256: hashNative({ ...base, plan_sha256: '' }) };
    fs.writeFileSync(output, 'export const result = 1;\n');
    const bytes = fs.readFileSync(output);
    const receiptBase: Omit<ForgeNativeWorkerReceipt, 'evidence_sha256'> = {
        schema: 'cstar.forge_native_worker_receipt.v1', run_id: runId,
        work_item_id: 'work-r6-lifecycle', task_id: 'leaf-task-r6-lifecycle',
        parent_task_id: plan.parent_task_id, role: 'leaf', status: 'SUCCEEDED',
        requested_identity: { model: 'gpt-5.6-luna', reasoning: 'max' },
        actual_identity: 'unreported', actual_identity_attested: false,
        changed_files: [{ path: output, sha256: fsHash(bytes), byte_count: bytes.byteLength }],
        checks: [{ command: 'focused lifecycle check', status: 'passed', evidence_sha256: 'e'.repeat(64) }],
        artifacts: [], descendants: [],
    };
    const receipt: ForgeNativeWorkerReceipt = {
        ...receiptBase, evidence_sha256: hashNative({ ...receiptBase, evidence_sha256: '' }),
    };
    return { db, root, runId, control, plan, receipt };
}

function fsHash(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
}

function body(response: { content: Array<{ text: string }> }) {
    return JSON.parse(response.content[0].text) as Record<string, unknown>;
}

test('plan then terminal worker update advances only to RUNNING and exact replay is inert', async () => {
    const value = setup();
    assert.equal(body(await handleForgeSwarmPlan({ run_id: value.runId, control_receipt: value.control,
        plan: value.plan }, undefined, { db: value.db, now: 2_000 })).outcome, 'ok');
    const first = body(await handleForgeSwarmUpdate({ run_id: value.runId, control_receipt: value.control,
        plan: value.plan, worker_receipt: value.receipt }, undefined, { db: value.db, now: 3_000 }));
    const replay = body(await handleForgeSwarmUpdate({ run_id: value.runId, control_receipt: value.control,
        plan: value.plan, worker_receipt: value.receipt }, undefined, { db: value.db, now: 3_500 }));
    assert.equal(first.status, 'worker_update_recorded'); assert.equal(first.replayed, false);
    assert.equal(replay.status, 'worker_update_replayed'); assert.equal(replay.replayed, true);
    assert.equal(getForgeNativeRun(value.db, value.runId).state, 'RUNNING');
    assert.equal(value.db.prepare('SELECT COUNT(*) AS count FROM hall_forge_native_worker_receipts').get().count, 1);
});

test('status is read-only and projects no control receipt or secret', async () => {
    const value = setup();
    await handleForgeSwarmPlan({ run_id: value.runId, control_receipt: value.control,
        plan: value.plan }, undefined, { db: value.db, now: 2_000 });
    await handleForgeSwarmUpdate({ run_id: value.runId, control_receipt: value.control,
        plan: value.plan, worker_receipt: value.receipt }, undefined, { db: value.db, now: 3_000 });
    const before = Number((value.db.prepare('SELECT total_changes() AS count').get() as { count: number }).count);
    const response = await handleForgeSwarmStatus({ run_id: value.runId }, undefined, { db: value.db });
    const after = Number((value.db.prepare('SELECT total_changes() AS count').get() as { count: number }).count);
    const parsed = body(response); const raw = response.content[0].text;
    assert.equal(parsed.outcome, 'ok'); assert.equal(parsed.state, 'RUNNING');
    assert.equal(after, before); assert.doesNotMatch(raw, /control_receipt|cancellation_secret|lease_id/);
});

test('self-attested identity and conflicting receipt replay reject without replacing evidence', async () => {
    const value = setup();
    await handleForgeSwarmPlan({ run_id: value.runId, control_receipt: value.control,
        plan: value.plan }, undefined, { db: value.db, now: 2_000 });
    const selfBase = { ...value.receipt, actual_identity: 'claimed-model',
        actual_identity_attested: true, evidence_sha256: '' };
    const self = { ...selfBase, evidence_sha256: hashNative({ ...selfBase, evidence_sha256: '' }) };
    const rejected = body(await handleForgeSwarmUpdate({ run_id: value.runId,
        control_receipt: value.control, plan: value.plan, worker_receipt: self },
    undefined, { db: value.db, now: 3_000 }));
    assert.notEqual(rejected.outcome, 'ok');
    assert.equal(value.db.prepare('SELECT COUNT(*) AS count FROM hall_forge_native_worker_receipts').get().count, 0);

    await handleForgeSwarmUpdate({ run_id: value.runId, control_receipt: value.control,
        plan: value.plan, worker_receipt: value.receipt }, undefined, { db: value.db, now: 3_100 });
    const conflictBase = { ...value.receipt, checks: [{ command: 'different', status: 'passed' as const }],
        evidence_sha256: '' };
    const conflict = { ...conflictBase,
        evidence_sha256: hashNative({ ...conflictBase, evidence_sha256: '' }) };
    const conflictResult = body(await handleForgeSwarmUpdate({ run_id: value.runId,
        control_receipt: value.control, plan: value.plan, worker_receipt: conflict },
    undefined, { db: value.db, now: 3_200 }));
    assert.notEqual(conflictResult.outcome, 'ok');
    assert.equal(value.db.prepare('SELECT COUNT(*) AS count FROM hall_forge_native_worker_receipts').get().count, 1);
});
