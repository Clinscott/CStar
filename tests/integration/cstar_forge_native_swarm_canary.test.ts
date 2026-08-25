import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import Database from 'better-sqlite3';

import {
    FORGE_NATIVE_ACTUAL_UNREPORTED,
    FORGE_NATIVE_CONNECTION_ID,
    FORGE_NATIVE_REQUESTED_MODEL,
    FORGE_NATIVE_REQUESTED_REASONING,
    hashNative,
    stableNativeJson,
    type ForgeNativeAggregateReceipt,
    type ForgeNativeAuthorityScope,
    type ForgeNativeChangedFile,
    type ForgeNativeControlReceipt,
    type ForgeNativePlan,
    type ForgeNativeWorkerReceipt,
} from '../../src/types/forge_native_swarm.js';
import { ensureForgeNativeSwarmSchema }
    from '../../src/tools/pennyone/intel/forge_native_swarm_schema.js';
import {
    getForgeNativeRun,
    listForgeNativeWorkerReceipts,
} from '../../src/tools/pennyone/intel/forge_native_swarm_controller.js';
import { handleForgeSwarmPlan }
    from '../../src/tools/cstar-kernel-mcp/tools/forge_swarm_plan.js';
import { handleForgeSwarmStatus }
    from '../../src/tools/cstar-kernel-mcp/tools/forge_swarm_status.js';
import { handleForgeSwarmUpdate }
    from '../../src/tools/cstar-kernel-mcp/tools/forge_swarm_update.js';
import { handleForgeSwarmComplete }
    from '../../src/tools/cstar-kernel-mcp/tools/forge_swarm_complete.js';
import { handleForgeSwarmCancel }
    from '../../src/tools/cstar-kernel-mcp/tools/forge_swarm_cancel.js';

const temporaryRoots: string[] = [];

type Fixture = {
    db: Database.Database;
    root: string;
    runId: string;
    requestId: string;
    control: ForgeNativeControlReceipt;
    plan: ForgeNativePlan;
    receipts: ForgeNativeWorkerReceipt[];
    outputs: string[];
};

function fileIdentity(filename: string): ForgeNativeChangedFile {
    const bytes = fs.readFileSync(filename);
    return {
        path: filename,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        byte_count: bytes.byteLength,
    };
}

function tableChanges(db: Database.Database): number {
    return Number((db.prepare('SELECT total_changes() AS count').get() as { count: number }).count);
}

function responseBody(response: { content: Array<{ text: string }> }): Record<string, unknown> {
    return JSON.parse(response.content[0].text) as Record<string, unknown>;
}

function createFixture(): Fixture {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-r6-native-canary-'));
    temporaryRoots.push(root);
    for (const directory of ['worker-a', 'worker-b', 'tests', 'evidence']) {
        fs.mkdirSync(path.join(root, directory), { recursive: true });
    }
    const runId = 'forge-run:r6-native-two-worker-canary';
    const requestId = 'request-r6-native-two-worker-canary';
    const outputs = [
        path.join(root, 'worker-a/result.ts'),
        path.join(root, 'worker-b/result.ts'),
    ];
    fs.writeFileSync(outputs[0], 'export const workerA = "accepted";\n');
    fs.writeFileSync(outputs[1], 'export const workerB = "accepted";\n');

    const scope: ForgeNativeAuthorityScope = {
        decision_id: 'CSF-D008-R6',
        set_batch_id: 'CSF-D008-FNS-SET-02-DELTA-04',
        connection_id: FORGE_NATIVE_CONNECTION_ID,
        generation: 1,
        request_id: requestId,
        request_sha256: 'a'.repeat(64),
        source_repository: root,
        source_head: 'b'.repeat(40),
        execution_root: root,
        read_allowlist: [root],
        write_allowlist: outputs,
        test_allowlist: [path.join(root, 'tests')],
        quarantine_allowlist: [],
        effect_exclusions: ['git', 'network', 'install', 'activation', 'deployment'],
        model_policy_sha256: 'c'.repeat(64),
        retry_policy: { initial_attempts: 1, repair_continuations: 1, unknown_retries: 0 },
        cancellation_policy: 'interrupt_all_then_cancel_or_unknown',
    };
    const control: ForgeNativeControlReceipt = {
        schema: 'cstar.forge_native_control_receipt.v1',
        run_id: runId,
        request_id: requestId,
        lease_id: 'lease-r6-native-two-worker-canary',
        lease_expires_at: 100_000,
        cancellation_secret_sha256: 'd'.repeat(64),
    };
    const workerPackage = {
        schema: 'cstar.forge_native_worker_package.v1',
        run_id: runId,
        work_package_id: 'package-r6-native-two-worker-canary',
        goal: 'Exercise two direct workers and a separate read-only aggregator.',
        acceptance: ['both isolated outputs and focused checks pass'],
        execution_root: root,
        source_identity: { repository: root, head: scope.source_head },
        read_allowlist: scope.read_allowlist,
        write_allowlist: scope.write_allowlist,
        test_allowlist: scope.test_allowlist,
        protected_effect_exclusions: scope.effect_exclusions,
        topology_ceiling: { parent: 1, leaves: 3, descendants: 0 },
        requested_identity: {
            model: FORGE_NATIVE_REQUESTED_MODEL,
            reasoning: FORGE_NATIVE_REQUESTED_REASONING,
        },
        evidence_root: path.join(root, 'evidence'),
        deadline_at: control.lease_expires_at,
    };
    const db = new Database(':memory:');
    db.exec('CREATE TABLE hall_forge_requests (request_id TEXT PRIMARY KEY, request_sha256 TEXT NOT NULL);');
    db.prepare('INSERT INTO hall_forge_requests VALUES (?, ?)')
        .run(requestId, scope.request_sha256);
    ensureForgeNativeSwarmSchema(db, { copied_state: true });
    db.prepare(`INSERT INTO hall_forge_native_runs
        (run_id, request_id, request_sha256, connection_id, generation, set_batch_id,
         authority_scope_json, source_identity_json, idempotency_key, lease_id, lease_expires_at,
         state, worker_package_json, control_receipt_json, unresolved_gaps_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'RESERVED', ?, ?, '[]', 1000, 1000)`)
        .run(runId, requestId, scope.request_sha256, FORGE_NATIVE_CONNECTION_ID,
            scope.set_batch_id, stableNativeJson(scope),
            stableNativeJson({ repository: root, head: scope.source_head, execution_root: root }),
            'idempotency-r6-native-two-worker-canary', control.lease_id,
            control.lease_expires_at, stableNativeJson(workerPackage), stableNativeJson(control));

    const planBase: ForgeNativePlan = {
        schema: 'cstar.forge_native_swarm_plan.v1',
        run_id: runId,
        parent_task_id: 'coordinator-r6-native-two-worker-canary',
        work_items: outputs.map((output, index) => ({
            work_item_id: `r6-native-worker-${index + 1}`,
            idempotency_key: `r6-native-worker-key-${index + 1}`,
            objective: `Produce isolated output ${index + 1}.`,
            write_paths: [output],
            test_paths: [path.join(root, `tests/worker-${index + 1}.test.ts`)],
            output_paths: [],
            useful: true,
            leaf_index: index,
        })),
        integration_paths: [],
        expected_outputs: [...outputs].sort(),
        plan_sha256: '',
    };
    const plan = { ...planBase, plan_sha256: hashNative(planBase) };
    const receipts = plan.work_items.map((item, index) => {
        const base: Omit<ForgeNativeWorkerReceipt, 'evidence_sha256'> = {
            schema: 'cstar.forge_native_worker_receipt.v1',
            run_id: runId,
            work_item_id: item.work_item_id,
            task_id: `leaf-r6-native-worker-${index + 1}`,
            parent_task_id: plan.parent_task_id,
            role: 'leaf',
            status: 'SUCCEEDED',
            requested_identity: {
                model: FORGE_NATIVE_REQUESTED_MODEL,
                reasoning: FORGE_NATIVE_REQUESTED_REASONING,
            },
            actual_identity: FORGE_NATIVE_ACTUAL_UNREPORTED,
            actual_identity_attested: false,
            changed_files: [fileIdentity(outputs[index])],
            checks: [{
                command: `focused worker ${index + 1} canary`,
                status: 'passed',
                evidence_sha256: String(index + 1).repeat(64),
            }],
            artifacts: [],
            descendants: [],
        };
        return { ...base, evidence_sha256: hashNative({ ...base, evidence_sha256: '' }) };
    });
    return { db, root, runId, requestId, control, plan, receipts, outputs };
}

function runSeparateReadOnlyAggregator(value: Fixture) {
    const aggregatorTaskId = 'aggregator-r6-native-two-worker-canary';
    const changesBefore = tableChanges(value.db);
    const sourceBefore = hashNative(value.outputs.map(fileIdentity));
    const receipts = listForgeNativeWorkerReceipts(value.db, value.runId);
    assert.equal(receipts.length, 2);
    assert.equal(receipts.every((receipt) => receipt.status === 'SUCCEEDED'), true);
    const changedFiles = receipts.flatMap((receipt) => receipt.changed_files)
        .sort((left, right) => left.path.localeCompare(right.path));
    const base: ForgeNativeAggregateReceipt = {
        schema: 'cstar.forge_native_delivery_receipt.v1',
        status: 'DELIVERED_UNVERIFIED',
        run_id: value.runId,
        request_id: value.requestId,
        plan: value.plan,
        task_graph: [{
            task_id: value.plan.parent_task_id,
            parent_task_id: null,
            role: 'parent',
            work_item_id: null,
            requested_model: 'gpt-5.6-sol',
            requested_reasoning: 'max',
            actual_identity: FORGE_NATIVE_ACTUAL_UNREPORTED,
            actual_identity_attested: false,
            status: 'COMPLETED',
        }, ...receipts.map((receipt) => ({
            task_id: receipt.task_id,
            parent_task_id: value.plan.parent_task_id,
            role: 'leaf' as const,
            work_item_id: receipt.work_item_id,
            requested_model: receipt.requested_identity.model,
            requested_reasoning: receipt.requested_identity.reasoning,
            actual_identity: receipt.actual_identity,
            actual_identity_attested: receipt.actual_identity_attested,
            status: 'SUCCEEDED' as const,
        }))],
        worker_receipts: receipts,
        changed_files: changedFiles,
        checks: receipts.flatMap((receipt) => receipt.checks),
        artifacts: [],
        requested_identity: {
            model: FORGE_NATIVE_REQUESTED_MODEL,
            reasoning: FORGE_NATIVE_REQUESTED_REASONING,
        },
        actual_identities: [FORGE_NATIVE_ACTUAL_UNREPORTED],
        unresolved_gaps: [],
        candidate_digest: hashNative(changedFiles),
        receipt_sha256: '',
    };
    const aggregate = { ...base, receipt_sha256: hashNative(base) };
    const aggregator = {
        task_id: aggregatorTaskId,
        parent_task_id: value.plan.parent_task_id,
        role: 'aggregator' as const,
        requested_identity: { model: 'gpt-5.6-sol', reasoning: 'max' },
        actual_identity: 'unreported',
        actual_identity_attested: false,
        read_only: true,
        source_writes: 0,
        descendants: [] as string[],
        peer_messages: 0,
        worker_evidence_sha256s: receipts.map((receipt) => receipt.evidence_sha256),
        aggregate_sha256: aggregate.receipt_sha256,
    };
    assert.equal(tableChanges(value.db), changesBefore);
    assert.equal(hashNative(value.outputs.map(fileIdentity)), sourceBefore);
    assert.notEqual(aggregator.task_id, value.plan.parent_task_id);
    assert.equal(receipts.some((receipt) => receipt.task_id === aggregator.task_id), false);
    assert.equal(aggregator.parent_task_id,
        receipts[0].parent_task_id, 'aggregator and workers must be direct siblings');
    return { aggregate, aggregator };
}

afterEach(() => {
    while (temporaryRoots.length > 0) {
        fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
    }
});

test('real native canary runs two direct workers and one separate read-only aggregator exactly once', async () => {
    const value = createFixture();
    const planArgs = { run_id: value.runId, control_receipt: value.control, plan: value.plan };
    const firstPlan = responseBody(await handleForgeSwarmPlan(planArgs, undefined,
        { db: value.db, now: 2_000 }));
    const changesAfterPlan = tableChanges(value.db);
    const replayPlan = responseBody(await handleForgeSwarmPlan(planArgs, undefined,
        { db: value.db, now: 2_100 }));
    assert.equal(firstPlan.outcome, 'ok');
    assert.equal(firstPlan.replayed, false);
    assert.equal(replayPlan.replayed, true);
    assert.equal(tableChanges(value.db), changesAfterPlan);

    for (const [index, receipt] of value.receipts.entries()) {
        const args = { ...planArgs, worker_receipt: receipt };
        const first = responseBody(await handleForgeSwarmUpdate(args, undefined,
            { db: value.db, now: 3_000 + index * 1_000 }));
        const changesAfterWorker = tableChanges(value.db);
        const replay = responseBody(await handleForgeSwarmUpdate(args, undefined,
            { db: value.db, now: 3_500 + index * 1_000 }));
        assert.equal(first.status, 'worker_update_recorded');
        assert.equal(first.replayed, false);
        assert.equal(replay.status, 'worker_update_replayed');
        assert.equal(replay.replayed, true);
        assert.equal(tableChanges(value.db), changesAfterWorker);
    }
    assert.equal((value.db.prepare(
        'SELECT COUNT(*) AS count FROM hall_forge_native_worker_receipts',
    ).get() as { count: number }).count, 2);

    const statusChanges = tableChanges(value.db);
    const statusResponse = await handleForgeSwarmStatus({ run_id: value.runId }, undefined,
        { db: value.db });
    const status = responseBody(statusResponse);
    assert.equal(status.state, 'RUNNING');
    assert.equal(tableChanges(value.db), statusChanges);
    assert.doesNotMatch(statusResponse.content[0].text,
        /control_receipt|cancellation_secret|lease_id/u);

    const { aggregate, aggregator } = runSeparateReadOnlyAggregator(value);
    const sourceBeforeCompletion = hashNative(value.outputs.map(fileIdentity));
    const completionArgs = {
        run_id: value.runId,
        control_receipt: value.control,
        aggregate,
    };
    const firstCompletion = responseBody(await handleForgeSwarmComplete(completionArgs, undefined,
        { db: value.db, now: 6_000 }));
    const completed = getForgeNativeRun(value.db, value.runId);
    const changesAfterCompletion = tableChanges(value.db);
    const replayCompletion = responseBody(await handleForgeSwarmComplete(completionArgs, undefined,
        { db: value.db, now: 101_000 }));
    assert.equal(firstCompletion.run_state, 'DELIVERED_UNVERIFIED');
    assert.equal(firstCompletion.lifecycle_acceptance, false);
    assert.equal(firstCompletion.independent_validation_required, true);
    assert.equal(firstCompletion.replayed, false);
    assert.equal(replayCompletion.replayed, true);
    assert.equal(tableChanges(value.db), changesAfterCompletion);
    assert.equal(getForgeNativeRun(value.db, value.runId).completed_at, completed.completed_at);

    const aggregateBeforeCancel = getForgeNativeRun(value.db, value.runId).aggregate_receipt_json;
    const cancelChanges = tableChanges(value.db);
    const cancellation = responseBody(await handleForgeSwarmCancel({
        action: 'request', run_id: value.runId, control_receipt: value.control,
    }, undefined, { db: value.db, now: 7_000 }));
    const finalRun = getForgeNativeRun(value.db, value.runId);
    assert.equal(cancellation.run_state, 'DELIVERED_UNVERIFIED');
    assert.equal(finalRun.state, 'DELIVERED_UNVERIFIED');
    assert.equal(finalRun.aggregate_receipt_json, aggregateBeforeCancel);
    assert.equal(tableChanges(value.db), cancelChanges);
    assert.equal(hashNative(value.outputs.map(fileIdentity)), sourceBeforeCompletion);
    assert.equal(aggregator.read_only, true);
    assert.equal(aggregator.source_writes, 0);
    assert.equal(aggregator.descendants.length, 0);
    assert.equal(aggregator.peer_messages, 0);
    assert.equal(aggregator.actual_identity, FORGE_NATIVE_ACTUAL_UNREPORTED);
    assert.equal(aggregator.actual_identity_attested, false);
});
