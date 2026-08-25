import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
    FORGE_NATIVE_ACTUAL_UNREPORTED,
    FORGE_NATIVE_DELIVERY_SCHEMA,
    FORGE_NATIVE_REQUESTED_MODEL,
    FORGE_NATIVE_REQUESTED_REASONING,
    ForgeNativeError,
    hashNative,
    isCanonicalAbsolutePath,
    stableNativeJson,
    validateNativePlan,
    type ForgeNativeAggregateReceipt,
    type ForgeNativeAuthorityScope,
    type ForgeNativeChangedFile,
    type ForgeNativeControlReceipt,
    type ForgeNativePlan,
    type ForgeNativeTaskGraphNode,
    type ForgeNativeWorkerReceipt,
} from '../../../types/forge_native_swarm.js';
import {
    getForgeNativeRun,
    listForgeNativeWorkerReceipts,
    nativeRunControlReceipt,
    nativeRunPackage,
    nativeRunScope,
    type StoredNativeRun,
} from './forge_native_swarm_controller.js';
import { NATIVE_RUNS_TABLE } from './forge_native_swarm_schema.js';

export type CompleteForgeNativeRunInput = {
    run_id: string;
    control_receipt: ForgeNativeControlReceipt;
    aggregate: ForgeNativeAggregateReceipt;
    now?: number;
};

export type CompleteForgeNativeRunResult = {
    replayed: boolean;
    run: StoredNativeRun;
    aggregate: ForgeNativeAggregateReceipt;
    completion_fingerprint_sha256: string;
};

const DIGEST = /^[a-f0-9]{64}$/;
const TERMINAL_WORKER_STATES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN', 'COMPLETED']);

function inside(candidate: string, parent: string): boolean {
    const relative = path.relative(parent, candidate);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relative));
}

function assertExactKeys(value: object, keys: readonly string[], code: string): void {
    const unknown = Object.keys(value).filter((key) => !keys.includes(key));
    if (unknown.length) throw new ForgeNativeError(`${code}:${unknown.sort().join(',')}`);
}

function assertSafePath(candidate: string, root: string, allowed: string[], code: string): void {
    if (!isCanonicalAbsolutePath(candidate) || !inside(candidate, root)
        || !allowed.some((entry) => inside(candidate, entry))) {
        throw new ForgeNativeError(code);
    }
    const rootStat = fs.lstatSync(root, { throwIfNoEntry: false });
    if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
        throw new ForgeNativeError('forge_native_execution_root_invalid');
    }
    let current = path.parse(candidate).root;
    for (const segment of candidate.slice(current.length).split(path.sep).filter(Boolean)) {
        const parent = current;
        const parentStat = fs.lstatSync(parent, { throwIfNoEntry: false });
        if (parentStat?.isDirectory()) {
            const collision = fs.readdirSync(parent).find(
                (entry) => entry.toLowerCase() === segment.toLowerCase() && entry !== segment,
            );
            if (collision) throw new ForgeNativeError('forge_native_case_collision');
        }
        current = path.join(current, segment);
        const stat = fs.lstatSync(current, { throwIfNoEntry: false });
        if (!stat) continue;
        if (stat.isSymbolicLink()) throw new ForgeNativeError('forge_native_symlink_path_forbidden');
        if (stat.dev !== rootStat.dev) throw new ForgeNativeError('forge_native_mount_escape');
        if (stat.isFile() && stat.nlink !== 1) {
            throw new ForgeNativeError('forge_native_hardlink_path_forbidden');
        }
    }
}

function assertFileIdentity(file: ForgeNativeChangedFile, code: string): void {
    if (!DIGEST.test(file.sha256) || !Number.isSafeInteger(file.byte_count) || file.byte_count < 0) {
        throw new ForgeNativeError(code);
    }
    const stat = fs.lstatSync(file.path, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
        throw new ForgeNativeError(code);
    }
    const bytes = fs.readFileSync(file.path);
    if (bytes.byteLength !== file.byte_count
        || hashBytes(bytes) !== file.sha256) throw new ForgeNativeError(code);
}

function hashBytes(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
}

function sortedUnique(values: string[]): string[] {
    return [...new Set(values)].sort();
}

export function assertForgeNativeControlReceipt(
    db: Database.Database,
    runId: string,
    control: ForgeNativeControlReceipt,
    options: { now?: number; allow_expired_replay?: boolean } = {},
): StoredNativeRun {
    const run = getForgeNativeRun(db, runId);
    const stored = nativeRunControlReceipt(db, runId);
    if (stableNativeJson(control) !== stableNativeJson(stored)
        || control.run_id !== runId || control.request_id !== run.request_id
        || control.lease_id !== run.lease_id) {
        throw new ForgeNativeError('forge_native_control_receipt_invalid');
    }
    const now = options.now ?? Date.now();
    if (!Number.isSafeInteger(now) || now < 0) throw new ForgeNativeError('forge_native_time_invalid');
    if (!options.allow_expired_replay && now >= run.lease_expires_at) {
        throw new ForgeNativeError('forge_native_run_lease_expired');
    }
    return run;
}

export function validateDirectForgeNativePlan(
    plan: ForgeNativePlan,
    scope: ForgeNativeAuthorityScope,
): ForgeNativePlan {
    const validated = validateNativePlan(plan, scope).plan;
    if (validated.work_items.length < 1 || validated.work_items.length > 3) {
        throw new ForgeNativeError('forge_native_plan_worker_count_invalid');
    }
    if (validated.integration_paths.length) {
        throw new ForgeNativeError('forge_native_plan_nested_parent_forbidden');
    }
    const expected = sortedUnique(validated.expected_outputs);
    if (stableNativeJson(expected) !== stableNativeJson(validated.expected_outputs)) {
        throw new ForgeNativeError('forge_native_plan_expected_output_order_invalid');
    }
    for (const item of validated.work_items) {
        for (const [label, values] of [
            ['write', item.write_paths], ['test', item.test_paths], ['output', item.output_paths],
        ] as const) {
            if (stableNativeJson(sortedUnique(values)) !== stableNativeJson(values)) {
                throw new ForgeNativeError(`forge_native_plan_${label}_order_invalid`);
            }
        }
        for (const candidate of [...item.write_paths, ...item.output_paths, ...item.test_paths]) {
            assertSafePath(
                candidate,
                scope.execution_root,
                item.test_paths.includes(candidate) ? scope.test_allowlist : scope.write_allowlist,
                'forge_native_plan_path_escape',
            );
        }
    }
    for (const candidate of validated.expected_outputs) {
        assertSafePath(candidate, scope.execution_root, scope.write_allowlist,
            'forge_native_plan_expected_output_escape');
        if (!validated.work_items.some((item) => item.write_paths.some((owned) => inside(candidate, owned)))) {
            throw new ForgeNativeError('forge_native_plan_expected_output_unassigned');
        }
    }
    return validated;
}

function validateTaskGraph(
    plan: ForgeNativePlan,
    graph: ForgeNativeTaskGraphNode[],
    receipts: ForgeNativeWorkerReceipt[],
): void {
    if (graph.length !== plan.work_items.length + 1) {
        throw new ForgeNativeError('forge_native_task_graph_incomplete');
    }
    const taskIds = graph.map((node) => node.task_id);
    if (new Set(taskIds).size !== taskIds.length) throw new ForgeNativeError('forge_native_task_graph_duplicate');
    for (const node of graph) {
        assertExactKeys(node, [
            'task_id', 'parent_task_id', 'role', 'work_item_id', 'requested_model',
            'requested_reasoning', 'actual_identity', 'actual_identity_attested', 'status',
        ], 'forge_native_task_graph_field_forbidden');
        if (node.actual_identity !== FORGE_NATIVE_ACTUAL_UNREPORTED || node.actual_identity_attested) {
            throw new ForgeNativeError('forge_native_task_graph_identity_unattested');
        }
    }
    const root = graph[0];
    if (root.task_id !== plan.parent_task_id || root.parent_task_id !== null
        || root.role !== 'parent' || root.work_item_id !== null || root.status !== 'COMPLETED') {
        throw new ForgeNativeError('forge_native_task_graph_root_invalid');
    }
    plan.work_items.forEach((item, index) => {
        const node = graph[index + 1];
        const receipt = receipts[index];
        if (node.role !== 'leaf' || node.parent_task_id !== plan.parent_task_id
            || node.work_item_id !== item.work_item_id || node.task_id !== receipt.task_id
            || node.status !== 'SUCCEEDED' || node.requested_model !== receipt.requested_identity.model
            || node.requested_reasoning !== receipt.requested_identity.reasoning) {
            throw new ForgeNativeError('forge_native_task_graph_leaf_invalid');
        }
    });
}

function validateReceipts(
    db: Database.Database,
    plan: ForgeNativePlan,
    aggregate: ForgeNativeAggregateReceipt,
    scope: ForgeNativeAuthorityScope,
): ForgeNativeWorkerReceipt[] {
    const stored = listForgeNativeWorkerReceipts(db, aggregate.run_id);
    const workerPackage = nativeRunPackage(db, aggregate.run_id);
    const byItem = new Map(stored.map((receipt) => [receipt.work_item_id, receipt]));
    const ordered = plan.work_items.map((item) => byItem.get(item.work_item_id));
    if (stored.length !== plan.work_items.length || ordered.some((receipt) => !receipt)) {
        throw new ForgeNativeError('forge_native_completion_worker_receipt_missing');
    }
    const receipts = ordered as ForgeNativeWorkerReceipt[];
    if (stableNativeJson(receipts) !== stableNativeJson(aggregate.worker_receipts)) {
        throw new ForgeNativeError('forge_native_completion_worker_receipt_mismatch');
    }
    receipts.forEach((receipt, index) => {
        const item = plan.work_items[index];
        if (receipt.role !== 'leaf' || receipt.parent_task_id !== plan.parent_task_id
            || receipt.status !== 'SUCCEEDED' || receipt.descendants.length
            || receipt.actual_identity !== FORGE_NATIVE_ACTUAL_UNREPORTED
            || receipt.actual_identity_attested
            || receipt.requested_identity.model !== FORGE_NATIVE_REQUESTED_MODEL
            || receipt.requested_identity.reasoning !== FORGE_NATIVE_REQUESTED_REASONING
            || hashNative({ ...receipt, evidence_sha256: '' }) !== receipt.evidence_sha256) {
            throw new ForgeNativeError('forge_native_completion_worker_receipt_invalid');
        }
        const paths = receipt.changed_files.map((file) => file.path);
        if (stableNativeJson(paths) !== stableNativeJson(sortedUnique(paths))) {
            throw new ForgeNativeError('forge_native_completion_changed_file_order_invalid');
        }
        for (const file of receipt.changed_files) {
            assertSafePath(file.path, scope.execution_root, item.write_paths,
                'forge_native_completion_changed_file_escape');
            assertFileIdentity(file, 'forge_native_completion_changed_file_invalid');
        }
        if (!receipt.checks.length || receipt.checks.some((check) => check.status !== 'passed')) {
            throw new ForgeNativeError('forge_native_completion_check_failed');
        }
        for (const artifact of receipt.artifacts) {
            assertSafePath(artifact.path, workerPackage.evidence_root, [workerPackage.evidence_root],
                'forge_native_completion_artifact_escape');
            assertFileIdentity(artifact, 'forge_native_completion_artifact_invalid');
        }
    });
    return receipts;
}

function validateAggregate(
    db: Database.Database,
    run: StoredNativeRun,
    aggregate: ForgeNativeAggregateReceipt,
): string {
    if (aggregate.schema !== FORGE_NATIVE_DELIVERY_SCHEMA || aggregate.status !== 'DELIVERED_UNVERIFIED'
        || aggregate.run_id !== run.run_id || aggregate.request_id !== run.request_id) {
        throw new ForgeNativeError('forge_native_completion_binding_invalid');
    }
    const scope = nativeRunScope(db, run.run_id);
    const plan = validateDirectForgeNativePlan(aggregate.plan, scope);
    if (!run.plan_sha256 || plan.plan_sha256 !== run.plan_sha256) {
        throw new ForgeNativeError('forge_native_completion_plan_mismatch');
    }
    const receipts = validateReceipts(db, plan, aggregate, scope);
    validateTaskGraph(plan, aggregate.task_graph, receipts);
    const changed = receipts.flatMap((receipt) => receipt.changed_files)
        .sort((left, right) => left.path.localeCompare(right.path));
    if (new Set(changed.map((file) => file.path)).size !== changed.length
        || stableNativeJson(changed) !== stableNativeJson(aggregate.changed_files)) {
        throw new ForgeNativeError('forge_native_completion_changed_files_mismatch');
    }
    const checks = receipts.flatMap((receipt) => receipt.checks);
    const artifacts = receipts.flatMap((receipt) => receipt.artifacts)
        .sort((left, right) => left.path.localeCompare(right.path));
    if (stableNativeJson(checks) !== stableNativeJson(aggregate.checks)
        || stableNativeJson(artifacts) !== stableNativeJson(aggregate.artifacts)) {
        throw new ForgeNativeError('forge_native_completion_evidence_mismatch');
    }
    for (const expected of plan.expected_outputs) {
        if (![...changed, ...artifacts].some((entry) => entry.path === expected)) {
            throw new ForgeNativeError('forge_native_completion_expected_output_missing');
        }
    }
    const identities = sortedUnique(receipts.map((receipt) => receipt.actual_identity));
    if (aggregate.requested_identity.model !== FORGE_NATIVE_REQUESTED_MODEL
        || aggregate.requested_identity.reasoning !== FORGE_NATIVE_REQUESTED_REASONING
        || stableNativeJson(aggregate.actual_identities) !== stableNativeJson(identities)
        || stableNativeJson(aggregate.unresolved_gaps)
            !== stableNativeJson(sortedUnique(aggregate.unresolved_gaps))
        || aggregate.candidate_digest !== hashNative(changed)) {
        throw new ForgeNativeError('forge_native_completion_aggregate_invalid');
    }
    const fingerprint = hashNative({ ...aggregate, receipt_sha256: '' });
    if (aggregate.receipt_sha256 !== fingerprint) {
        throw new ForgeNativeError('forge_native_completion_digest_mismatch');
    }
    return fingerprint;
}

export function completeForgeNativeRun(
    db: Database.Database,
    input: CompleteForgeNativeRunInput,
): CompleteForgeNativeRunResult {
    const initial = getForgeNativeRun(db, input.run_id);
    const replay = initial.state === 'DELIVERED_UNVERIFIED';
    assertForgeNativeControlReceipt(db, input.run_id, input.control_receipt, {
        now: input.now,
        allow_expired_replay: replay,
    });
    if (replay) {
        const stored = initial.aggregate_receipt_json
            ? JSON.parse(initial.aggregate_receipt_json) as ForgeNativeAggregateReceipt : null;
        if (!stored || stableNativeJson(stored) !== stableNativeJson(input.aggregate)
            || initial.completion_fingerprint_sha256 !== input.aggregate.receipt_sha256) {
            throw new ForgeNativeError('forge_native_completion_replay_conflict');
        }
        return { replayed: true, run: initial, aggregate: stored,
            completion_fingerprint_sha256: input.aggregate.receipt_sha256 };
    }
    if (['UNKNOWN', 'CANCEL_REQUESTED', 'CANCELLED'].includes(initial.state)) {
        throw new ForgeNativeError('forge_native_run_terminal');
    }
    const fingerprint = validateAggregate(db, initial, input.aggregate);
    const now = input.now ?? Date.now();
    const commit = db.transaction(() => {
        const current = getForgeNativeRun(db, input.run_id);
        if (current.state === 'DELIVERED_UNVERIFIED') {
            if (current.aggregate_receipt_json !== stableNativeJson(input.aggregate)
                || current.completion_fingerprint_sha256 !== fingerprint) {
                throw new ForgeNativeError('forge_native_completion_replay_conflict');
            }
            return { replayed: true, run: current };
        }
        const changed = db.prepare(`UPDATE ${NATIVE_RUNS_TABLE}
            SET state = 'DELIVERED_UNVERIFIED', aggregate_receipt_json = ?,
                completion_fingerprint_sha256 = ?, unresolved_gaps_json = ?,
                updated_at = ?, completed_at = ?
            WHERE run_id = ? AND state IN ('PLANNED', 'RUNNING')`)
            .run(stableNativeJson(input.aggregate), fingerprint,
                stableNativeJson(input.aggregate.unresolved_gaps), now, now, input.run_id);
        if (changed.changes !== 1) throw new ForgeNativeError('forge_native_completion_transition_invalid');
        return { replayed: false, run: getForgeNativeRun(db, input.run_id) };
    }).immediate();
    return { ...commit, aggregate: input.aggregate, completion_fingerprint_sha256: fingerprint };
}

export function taskGraphIsTerminal(graph: ForgeNativeTaskGraphNode[]): boolean {
    return graph.every((node) => TERMINAL_WORKER_STATES.has(node.status));
}
