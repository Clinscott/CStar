import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
    FORGE_NATIVE_CONNECTION_ID,
    hashNative,
    stableNativeJson,
    type ForgeNativeAuthorityScope,
    type ForgeNativeControlReceipt,
    type ForgeNativePlan,
    type ForgeNativeTaskGraphNode,
} from '../../../src/types/forge_native_swarm.js';
import { ensureForgeNativeSwarmSchema } from '../../../src/tools/pennyone/intel/forge_native_swarm_schema.js';
import { getForgeNativeRun, updateForgeNativeRunState }
    from '../../../src/tools/pennyone/intel/forge_native_swarm_controller.js';
import { handleForgeSwarmPlan } from '../../../src/tools/cstar-kernel-mcp/tools/forge_swarm_plan.js';
import { handleForgeSwarmCancel } from '../../../src/tools/cstar-kernel-mcp/tools/forge_swarm_cancel.js';

function fixture(label: string) {
    const root = fs.mkdtempSync(`/tmp/cstar-r6-cancel-${label}-`);
    fs.mkdirSync(`${root}/src`); fs.mkdirSync(`${root}/tests`); fs.mkdirSync(`${root}/evidence`);
    const marker = `${root}/src/retained.txt`; fs.writeFileSync(marker, 'retain\n');
    const runId = `native-run-r6-cancel-${label}`; const requestId = `request-r6-cancel-${label}`;
    const scope: ForgeNativeAuthorityScope = {
        decision_id: 'CSF-D008-R6', set_batch_id: 'CSF-D008-FNS-SET-02-DELTA-04',
        connection_id: FORGE_NATIVE_CONNECTION_ID, generation: 1, request_id: requestId,
        request_sha256: 'a'.repeat(64), source_repository: root, source_head: 'b'.repeat(40),
        execution_root: root, read_allowlist: [root], write_allowlist: [`${root}/src`],
        test_allowlist: [`${root}/tests`], quarantine_allowlist: [], effect_exclusions: ['cleanup'],
        model_policy_sha256: 'c'.repeat(64),
        retry_policy: { initial_attempts: 1, repair_continuations: 1, unknown_retries: 0 },
        cancellation_policy: 'interrupt_all_then_cancel_or_unknown',
    };
    const control: ForgeNativeControlReceipt = {
        schema: 'cstar.forge_native_control_receipt.v1', run_id: runId, request_id: requestId,
        lease_id: `lease-r6-cancel-${label}`, lease_expires_at: 10_000,
        cancellation_secret_sha256: 'd'.repeat(64),
    };
    const workerPackage = {
        schema: 'cstar.forge_native_worker_package.v1', run_id: runId,
        work_package_id: `package-r6-cancel-${label}`, goal: 'Cancel safely.',
        acceptance: ['retain worktree'], execution_root: root,
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
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 10000, 'RESERVED', ?, ?, '[]', 1000, 1000)`)
        .run(runId, requestId, scope.request_sha256, FORGE_NATIVE_CONNECTION_ID, scope.set_batch_id,
            stableNativeJson(scope), stableNativeJson({ repository: root, head: scope.source_head,
                execution_root: root }), `idempotency-r6-cancel-${label}`, control.lease_id,
            stableNativeJson(workerPackage), stableNativeJson(control));
    const base: ForgeNativePlan = {
        schema: 'cstar.forge_native_swarm_plan.v1', run_id: runId,
        parent_task_id: `root-task-r6-cancel-${label}`, work_items: [{
            work_item_id: `work-r6-cancel-${label}`, idempotency_key: `work-key-r6-cancel-${label}`,
            objective: 'Bounded work.', write_paths: [`${root}/src/result.ts`],
            test_paths: [`${root}/tests/result.test.ts`], output_paths: [], useful: true, leaf_index: 0,
        }], integration_paths: [], expected_outputs: [`${root}/src/result.ts`], plan_sha256: '',
    };
    const plan = { ...base, plan_sha256: hashNative({ ...base, plan_sha256: '' }) };
    return { db, root, marker, runId, control, plan };
}

function body(response: { content: Array<{ text: string }> }) {
    return JSON.parse(response.content[0].text) as Record<string, unknown>;
}

test('cancellation before spawn requires exact control and retains the worktree', async () => {
    const value = fixture('before');
    const wrong = body(await handleForgeSwarmCancel({ action: 'request', run_id: value.runId,
        control_receipt: { ...value.control, lease_id: 'wrong' } }, undefined,
    { db: value.db, now: 2_000 }));
    assert.notEqual(wrong.outcome, 'ok'); assert.equal(getForgeNativeRun(value.db, value.runId).state, 'RESERVED');
    const requested = body(await handleForgeSwarmCancel({ action: 'request', run_id: value.runId,
        control_receipt: value.control }, undefined, { db: value.db, now: 2_000 }));
    assert.equal(requested.run_state, 'CANCEL_REQUESTED');
    const finalized = body(await handleForgeSwarmCancel({ action: 'finalize', run_id: value.runId,
        control_receipt: value.control, all_tasks_inspectable: true, observed_task_graph: [] },
    undefined, { db: value.db, now: 2_100 }));
    assert.equal(finalized.run_state, 'CANCELLED'); assert.equal(finalized.worktree_retained, true);
    assert.equal(fs.readFileSync(value.marker, 'utf8'), 'retain\n');
});

test('all planned direct tasks must be terminal before cancellation finalizes', async () => {
    const value = fixture('running');
    await handleForgeSwarmPlan({ run_id: value.runId, control_receipt: value.control,
        plan: value.plan }, undefined, { db: value.db, now: 2_000 });
    await handleForgeSwarmCancel({ action: 'request', run_id: value.runId,
        control_receipt: value.control }, undefined, { db: value.db, now: 2_100 });
    const graph: ForgeNativeTaskGraphNode[] = [{
        task_id: value.plan.parent_task_id, parent_task_id: null, role: 'parent', work_item_id: null,
        requested_model: 'gpt-5.6-sol', requested_reasoning: 'high', actual_identity: 'unreported',
        actual_identity_attested: false, status: 'COMPLETED',
    }, {
        task_id: 'leaf-task-r6-cancel-running', parent_task_id: value.plan.parent_task_id,
        role: 'leaf', work_item_id: value.plan.work_items[0].work_item_id,
        requested_model: 'gpt-5.6-luna', requested_reasoning: 'max', actual_identity: 'unreported',
        actual_identity_attested: false, status: 'CANCELLED',
    }];
    const result = body(await handleForgeSwarmCancel({ action: 'finalize', run_id: value.runId,
        control_receipt: value.control, all_tasks_inspectable: true,
        observed_task_graph: graph, plan: value.plan }, undefined, { db: value.db, now: 2_200 }));
    assert.equal(result.run_state, 'CANCELLED'); assert.equal(result.replacement_launched, false);
    assert.equal(fs.readFileSync(value.marker, 'utf8'), 'retain\n');
});

test('uninspectable or nonterminal task evidence freezes UNKNOWN with no replacement', async () => {
    const value = fixture('unknown');
    await handleForgeSwarmCancel({ action: 'request', run_id: value.runId,
        control_receipt: value.control }, undefined, { db: value.db, now: 2_000 });
    const result = body(await handleForgeSwarmCancel({ action: 'finalize', run_id: value.runId,
        control_receipt: value.control, all_tasks_inspectable: false, observed_task_graph: [],
        reason: 'host_task_uninspectable' }, undefined, { db: value.db, now: 2_100 }));
    assert.equal(result.run_state, 'UNKNOWN'); assert.equal(result.replacement_launched, false);
    assert.throws(() => updateForgeNativeRunState(value.db, value.runId, 'RUNNING'), /unknown_frozen/);
    assert.equal(getForgeNativeRun(value.db, value.runId).state, 'UNKNOWN');
});
