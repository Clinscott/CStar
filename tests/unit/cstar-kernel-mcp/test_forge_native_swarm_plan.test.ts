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
} from '../../../src/types/forge_native_swarm.js';
import { ensureForgeNativeSwarmSchema } from '../../../src/tools/pennyone/intel/forge_native_swarm_schema.js';
import { getForgeNativeRun } from '../../../src/tools/pennyone/intel/forge_native_swarm_controller.js';
import { handleForgeSwarmPlan } from '../../../src/tools/cstar-kernel-mcp/tools/forge_swarm_plan.js';

type Fixture = { db: Database.Database; root: string; runId: string; control: ForgeNativeControlReceipt;
    scope: ForgeNativeAuthorityScope };

function fixture(label: string): Fixture {
    const root = fs.mkdtempSync(`/tmp/cstar-r6-plan-${label}-`);
    fs.mkdirSync(`${root}/src`); fs.mkdirSync(`${root}/tests`); fs.mkdirSync(`${root}/evidence`);
    const runId = `native-run-r6-plan-${label}`;
    const scope: ForgeNativeAuthorityScope = {
        decision_id: 'CSF-D008-R6', set_batch_id: 'CSF-D008-FNS-SET-02-DELTA-04',
        connection_id: FORGE_NATIVE_CONNECTION_ID, generation: 1, request_id: `request-r6-plan-${label}`,
        request_sha256: 'a'.repeat(64), source_repository: root, source_head: 'b'.repeat(40),
        execution_root: root, read_allowlist: [root], write_allowlist: [`${root}/src`],
        test_allowlist: [`${root}/tests`], quarantine_allowlist: [], effect_exclusions: ['git', 'network'],
        model_policy_sha256: 'c'.repeat(64),
        retry_policy: { initial_attempts: 1, repair_continuations: 1, unknown_retries: 0 },
        cancellation_policy: 'interrupt_all_then_cancel_or_unknown',
    };
    const control: ForgeNativeControlReceipt = {
        schema: 'cstar.forge_native_control_receipt.v1', run_id: runId,
        request_id: scope.request_id, lease_id: `lease-r6-plan-${label}`,
        lease_expires_at: 10_000, cancellation_secret_sha256: 'd'.repeat(64),
    };
    const workerPackage = {
        schema: 'cstar.forge_native_worker_package.v1', run_id: runId,
        work_package_id: `package-r6-plan-${label}`, goal: 'Plan direct workers.',
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
    db.prepare('INSERT INTO hall_forge_requests VALUES (?, ?)').run(scope.request_id, scope.request_sha256);
    ensureForgeNativeSwarmSchema(db, { copied_state: true });
    db.prepare(`INSERT INTO hall_forge_native_runs
        (run_id, request_id, request_sha256, connection_id, generation, set_batch_id,
         authority_scope_json, source_identity_json, idempotency_key, lease_id, lease_expires_at,
         state, worker_package_json, control_receipt_json, unresolved_gaps_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 10000, 'RESERVED', ?, ?, '[]', 1000, 1000)`)
        .run(runId, scope.request_id, scope.request_sha256, FORGE_NATIVE_CONNECTION_ID,
            scope.set_batch_id, stableNativeJson(scope), stableNativeJson(workerPackage),
            `idempotency-r6-plan-${label}`, control.lease_id,
            stableNativeJson(workerPackage), stableNativeJson(control));
    return { db, root, runId, control, scope };
}

function plan(value: Fixture, writes = [`${value.root}/src/one.ts`]): ForgeNativePlan {
    const base: ForgeNativePlan = {
        schema: 'cstar.forge_native_swarm_plan.v1', run_id: value.runId,
        parent_task_id: `root-task-r6-${value.runId}`,
        work_items: writes.map((writePath, index) => ({
            work_item_id: `work-r6-${index}`, idempotency_key: `work-key-r6-${index}`,
            objective: `Implement item ${index}.`, write_paths: [writePath],
            test_paths: [`${value.root}/tests/check-${index}.test.ts`], output_paths: [],
            useful: true, leaf_index: index,
        })),
        integration_paths: [], expected_outputs: [...writes].sort(), plan_sha256: '',
    };
    return { ...base, plan_sha256: hashNative({ ...base, plan_sha256: '' }) };
}

function payload(response: Awaited<ReturnType<typeof handleForgeSwarmPlan>>) {
    return JSON.parse(response.content[0].text) as Record<string, unknown>;
}

test('direct-worker plan records one-to-three disjoint items and replays exactly', async () => {
    const value = fixture('valid');
    const candidate = plan(value, [`${value.root}/src/a.ts`, `${value.root}/src/b.ts`, `${value.root}/src/c.ts`]);
    const first = payload(await handleForgeSwarmPlan({ run_id: value.runId,
        control_receipt: value.control, plan: candidate }, undefined, { db: value.db, now: 2_000 }));
    const replay = payload(await handleForgeSwarmPlan({ run_id: value.runId,
        control_receipt: value.control, plan: candidate }, undefined, { db: value.db, now: 2_100 }));
    assert.equal(first.outcome, 'ok'); assert.equal(first.replayed, false);
    assert.equal(replay.outcome, 'ok'); assert.equal(replay.replayed, true);
    assert.equal(getForgeNativeRun(value.db, value.runId).state, 'PLANNED');
    assert.equal(getForgeNativeRun(value.db, value.runId).plan_sha256, candidate.plan_sha256);
});

test('overlap, a fourth worker, nested integration, and caller fields reject without plan state', async () => {
    for (const [label, mutate] of [
        ['overlap', (value: Fixture, candidate: ForgeNativePlan) => plan(value,
            [`${value.root}/src`, `${value.root}/src/nested.ts`])],
        ['fourth', (value: Fixture) => plan(value, [1, 2, 3, 4].map((n) => `${value.root}/src/${n}.ts`))],
        ['nested', (_value: Fixture, candidate: ForgeNativePlan) => {
            const changed = { ...candidate, integration_paths: [candidate.work_items[0].write_paths[0]], plan_sha256: '' };
            return { ...changed, plan_sha256: hashNative({ ...changed, plan_sha256: '' }) };
        }],
    ] as const) {
        const value = fixture(label); const candidate = mutate(value, plan(value));
        const result = payload(await handleForgeSwarmPlan({ run_id: value.runId,
            control_receipt: value.control, plan: candidate }, undefined, { db: value.db, now: 2_000 }));
        assert.notEqual(result.outcome, 'ok');
        assert.equal(getForgeNativeRun(value.db, value.runId).state, 'RESERVED');
    }
    const value = fixture('caller');
    const result = payload(await handleForgeSwarmPlan({ run_id: value.runId,
        control_receipt: value.control, plan: plan(value), trusted_scope: value.scope },
    undefined, { db: value.db, now: 2_000 }));
    assert.equal(result.error_code, 'forge_native_plan_contract_invalid');
    assert.equal(getForgeNativeRun(value.db, value.runId).state, 'RESERVED');
});

test('wrong or expired control lease cannot record a plan', async () => {
    const value = fixture('lease'); const candidate = plan(value);
    for (const [control, now] of [[{ ...value.control, lease_id: 'wrong' }, 2_000],
        [value.control, 10_000]] as const) {
        const result = payload(await handleForgeSwarmPlan({ run_id: value.runId,
            control_receipt: control, plan: candidate }, undefined, { db: value.db, now }));
        assert.notEqual(result.outcome, 'ok');
    }
    assert.equal(getForgeNativeRun(value.db, value.runId).state, 'RESERVED');
});
