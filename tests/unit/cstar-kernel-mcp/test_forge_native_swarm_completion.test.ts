import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
    FORGE_NATIVE_CONNECTION_ID,
    hashNative,
    stableNativeJson,
    type ForgeNativeAggregateReceipt,
    type ForgeNativeAuthorityScope,
    type ForgeNativeControlReceipt,
    type ForgeNativePlan,
    type ForgeNativeWorkerReceipt,
} from '../../../src/types/forge_native_swarm.js';
import { ensureForgeNativeSwarmSchema } from '../../../src/tools/pennyone/intel/forge_native_swarm_schema.js';
import { getForgeNativeRun } from '../../../src/tools/pennyone/intel/forge_native_swarm_controller.js';
import { handleForgeSwarmPlan } from '../../../src/tools/cstar-kernel-mcp/tools/forge_swarm_plan.js';
import { handleForgeSwarmUpdate } from '../../../src/tools/cstar-kernel-mcp/tools/forge_swarm_update.js';
import { handleForgeSwarmComplete } from '../../../src/tools/cstar-kernel-mcp/tools/forge_swarm_complete.js';

function setup(label: string) {
    const root = fs.mkdtempSync(`/tmp/cstar-r6-complete-${label}-`);
    fs.mkdirSync(`${root}/src`); fs.mkdirSync(`${root}/tests`); fs.mkdirSync(`${root}/evidence`);
    const runId = `native-run-r6-complete-${label}`; const requestId = `request-r6-complete-${label}`;
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
        lease_id: `lease-r6-complete-${label}`, lease_expires_at: 10_000,
        cancellation_secret_sha256: 'd'.repeat(64),
    };
    const workerPackage = {
        schema: 'cstar.forge_native_worker_package.v1', run_id: runId,
        work_package_id: `package-r6-complete-${label}`, goal: 'Complete without accepting.',
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
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 10000, 'RESERVED', ?, ?, '[]', 1000, 1000)`)
        .run(runId, requestId, scope.request_sha256, FORGE_NATIVE_CONNECTION_ID, scope.set_batch_id,
            stableNativeJson(scope), stableNativeJson({ repository: root, head: scope.source_head,
                execution_root: root }), `idempotency-r6-complete-${label}`, control.lease_id,
            stableNativeJson(workerPackage), stableNativeJson(control));
    const output = `${root}/src/result.ts`; fs.writeFileSync(output, 'export const delivered = true;\n');
    const outputBytes = fs.readFileSync(output); const outputHash = createHash('sha256').update(outputBytes).digest('hex');
    const base: ForgeNativePlan = {
        schema: 'cstar.forge_native_swarm_plan.v1', run_id: runId,
        parent_task_id: `root-task-r6-complete-${label}`, work_items: [{
            work_item_id: `work-r6-complete-${label}`, idempotency_key: `work-key-r6-complete-${label}`,
            objective: 'Write result.', write_paths: [output],
            test_paths: [`${root}/tests/result.test.ts`], output_paths: [], useful: true, leaf_index: 0,
        }], integration_paths: [], expected_outputs: [output], plan_sha256: '',
    };
    const plan = { ...base, plan_sha256: hashNative({ ...base, plan_sha256: '' }) };
    const receiptBase: Omit<ForgeNativeWorkerReceipt, 'evidence_sha256'> = {
        schema: 'cstar.forge_native_worker_receipt.v1', run_id: runId,
        work_item_id: plan.work_items[0].work_item_id, task_id: `leaf-task-r6-complete-${label}`,
        parent_task_id: plan.parent_task_id, role: 'leaf', status: 'SUCCEEDED',
        requested_identity: { model: 'gpt-5.6-luna', reasoning: 'max' },
        actual_identity: 'unreported', actual_identity_attested: false,
        changed_files: [{ path: output, sha256: outputHash, byte_count: outputBytes.byteLength }],
        checks: [{ command: 'focused completion check', status: 'passed', evidence_sha256: 'e'.repeat(64) }],
        artifacts: [], descendants: [],
    };
    const receipt: ForgeNativeWorkerReceipt = {
        ...receiptBase, evidence_sha256: hashNative({ ...receiptBase, evidence_sha256: '' }),
    };
    return { db, root, runId, requestId, control, plan, receipt };
}

function aggregate(value: ReturnType<typeof setup>): ForgeNativeAggregateReceipt {
    const base: ForgeNativeAggregateReceipt = {
        schema: 'cstar.forge_native_delivery_receipt.v1', status: 'DELIVERED_UNVERIFIED',
        run_id: value.runId, request_id: value.requestId, plan: value.plan,
        task_graph: [{
            task_id: value.plan.parent_task_id, parent_task_id: null, role: 'parent', work_item_id: null,
            requested_model: 'gpt-5.6-sol', requested_reasoning: 'high',
            actual_identity: 'unreported', actual_identity_attested: false, status: 'COMPLETED',
        }, {
            task_id: value.receipt.task_id, parent_task_id: value.plan.parent_task_id,
            role: 'leaf', work_item_id: value.receipt.work_item_id,
            requested_model: 'gpt-5.6-luna', requested_reasoning: 'max',
            actual_identity: 'unreported', actual_identity_attested: false, status: 'SUCCEEDED',
        }],
        worker_receipts: [value.receipt], changed_files: value.receipt.changed_files,
        checks: value.receipt.checks, artifacts: [],
        requested_identity: { model: 'gpt-5.6-luna', reasoning: 'max' },
        actual_identities: ['unreported'], unresolved_gaps: [],
        candidate_digest: hashNative(value.receipt.changed_files), receipt_sha256: '',
    };
    return { ...base, receipt_sha256: hashNative({ ...base, receipt_sha256: '' }) };
}

function body(response: { content: Array<{ text: string }> }) {
    return JSON.parse(response.content[0].text) as Record<string, unknown>;
}

async function prepare(value: ReturnType<typeof setup>, includeReceipt = true) {
    await handleForgeSwarmPlan({ run_id: value.runId, control_receipt: value.control,
        plan: value.plan }, undefined, { db: value.db, now: 2_000 });
    if (includeReceipt) await handleForgeSwarmUpdate({ run_id: value.runId,
        control_receipt: value.control, plan: value.plan, worker_receipt: value.receipt },
    undefined, { db: value.db, now: 3_000 });
}

test('complete persists exactly DELIVERED_UNVERIFIED and exact replay adds no transition', async () => {
    const value = setup('valid'); await prepare(value); const delivery = aggregate(value);
    const first = body(await handleForgeSwarmComplete({ run_id: value.runId,
        control_receipt: value.control, aggregate: delivery }, undefined, { db: value.db, now: 4_000 }));
    const completedAt = getForgeNativeRun(value.db, value.runId).completed_at;
    const replay = body(await handleForgeSwarmComplete({ run_id: value.runId,
        control_receipt: value.control, aggregate: delivery }, undefined, { db: value.db, now: 12_000 }));
    assert.equal(first.run_state, 'DELIVERED_UNVERIFIED'); assert.equal(first.lifecycle_acceptance, false);
    assert.equal(first.independent_validation_required, true); assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true); assert.equal(getForgeNativeRun(value.db, value.runId).completed_at, completedAt);
});

test('conflicting completion replay preserves the first aggregate receipt', async () => {
    const value = setup('conflict'); await prepare(value); const delivery = aggregate(value);
    await handleForgeSwarmComplete({ run_id: value.runId, control_receipt: value.control,
        aggregate: delivery }, undefined, { db: value.db, now: 4_000 });
    const changedBase = { ...delivery, unresolved_gaps: ['drift'], receipt_sha256: '' };
    const changed = { ...changedBase, receipt_sha256: hashNative({ ...changedBase, receipt_sha256: '' }) };
    const result = body(await handleForgeSwarmComplete({ run_id: value.runId,
        control_receipt: value.control, aggregate: changed }, undefined, { db: value.db, now: 4_100 }));
    assert.equal(result.outcome, 'domain_terminal');
    assert.equal(getForgeNativeRun(value.db, value.runId).aggregate_receipt_json, stableNativeJson(delivery));
});

test('missing worker evidence and descendant-shaped task graph block delivery', async () => {
    const missing = setup('missing'); await prepare(missing, false);
    const missingResult = body(await handleForgeSwarmComplete({ run_id: missing.runId,
        control_receipt: missing.control, aggregate: aggregate(missing) }, undefined,
    { db: missing.db, now: 4_000 }));
    assert.notEqual(missingResult.outcome, 'ok');
    assert.equal(getForgeNativeRun(missing.db, missing.runId).state, 'PLANNED');

    const descendant = setup('descendant'); await prepare(descendant); const delivery = aggregate(descendant);
    delivery.task_graph[1] = { ...delivery.task_graph[1], parent_task_id: 'unexpected-parent' };
    delivery.receipt_sha256 = hashNative({ ...delivery, receipt_sha256: '' });
    const descendantResult = body(await handleForgeSwarmComplete({ run_id: descendant.runId,
        control_receipt: descendant.control, aggregate: delivery }, undefined,
    { db: descendant.db, now: 4_000 }));
    assert.notEqual(descendantResult.outcome, 'ok');
    assert.equal(getForgeNativeRun(descendant.db, descendant.runId).state, 'RUNNING');
});
