import type Database from 'better-sqlite3';
import {
    assertIdentitySeparation,
    FORGE_NATIVE_ACTUAL_UNREPORTED,
    FORGE_NATIVE_DELIVERY_SCHEMA,
    FORGE_NATIVE_REQUESTED_MODEL,
    FORGE_NATIVE_REQUESTED_REASONING,
    ForgeNativeError,
    hashNative,
    stableNativeJson,
    validateNativePlan,
    type ForgeNativeAggregateReceipt,
    type ForgeNativeChangedFile,
    type ForgeNativeIdentity,
    type ForgeNativePlan,
    type ForgeNativeTaskGraphNode,
    type ForgeNativeWorkerReceipt,
} from '../../../types/forge_native_swarm.js';
import {
    getForgeNativeRun,
    listForgeNativeWorkerReceipts,
    nativeRunScope,
} from './forge_native_swarm_controller.js';
import { NATIVE_RUNS_TABLE } from './forge_native_swarm_schema.js';

export type CompleteNativeRunInput = {
    run_id: string;
    request_id: string;
    plan: ForgeNativePlan;
    parent_task_id: string;
    checks: ForgeNativeAggregateReceipt['checks'];
    artifacts: ForgeNativeAggregateReceipt['artifacts'];
    unresolved_gaps?: string[];
    actual_identities?: Map<string, { identity: string; attested: boolean }>;
    candidate_digest: string;
};

function compare(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueChangedFiles(receipts: ForgeNativeWorkerReceipt[]): ForgeNativeChangedFile[] {
    const byPath = new Map<string, ForgeNativeChangedFile>();
    for (const receipt of receipts) {
        for (const file of receipt.changed_files) {
            const key = file.path.toLowerCase();
            const prior = byPath.get(key);
            if (prior && (prior.path !== file.path || prior.sha256 !== file.sha256 || prior.byte_count !== file.byte_count)) {
                throw new ForgeNativeError('forge_native_aggregate_changed_file_conflict');
            }
            if (!prior) byPath.set(key, file);
        }
    }
    return [...byPath.values()].sort((left, right) => compare(left.path, right.path));
}

function uniqueArtifacts(receipts: ForgeNativeWorkerReceipt[]): ForgeNativeAggregateReceipt['artifacts'] {
    const byPath = new Map<string, ForgeNativeAggregateReceipt['artifacts'][number]>();
    for (const receipt of receipts) {
        for (const artifact of receipt.artifacts) {
            const key = artifact.path.toLowerCase();
            const prior = byPath.get(key);
            if (prior && (prior.path !== artifact.path || prior.sha256 !== artifact.sha256 || prior.byte_count !== artifact.byte_count)) {
                throw new ForgeNativeError('forge_native_aggregate_artifact_conflict');
            }
            if (!prior) byPath.set(key, artifact);
        }
    }
    return [...byPath.values()].sort((left, right) => compare(left.path, right.path));
}

function canonicalChecks(checks: CompleteNativeRunInput['checks']): CompleteNativeRunInput['checks'] {
    if (checks.length === 0) throw new ForgeNativeError('forge_native_mandatory_check_untested');
    for (const check of checks) {
        if (!check.command.trim()) throw new ForgeNativeError('forge_native_check_command_missing');
        if (check.status === 'failed') throw new ForgeNativeError('forge_native_check_failed');
        if (check.status === 'untested') throw new ForgeNativeError('forge_native_mandatory_check_untested');
    }
    return [...checks].sort((left, right) => compare(
        stableNativeJson(left), stableNativeJson(right),
    ));
}

function canonicalGaps(gaps: string[] | undefined): string[] {
    return [...new Set((gaps ?? []).map((gap) => gap.trim()).filter(Boolean))].sort(compare);
}

function assertReceiptCompleteness(plan: ForgeNativePlan, parentTaskId: string, receipts: ForgeNativeWorkerReceipt[]): void {
    const parents = receipts.filter((receipt) => receipt.role === 'parent');
    if (parents.length !== 1 || parents[0]!.task_id !== parentTaskId || parents[0]!.parent_task_id !== parentTaskId) {
        throw new ForgeNativeError('forge_native_parent_receipt_missing');
    }
    const parent = parents[0]!;
    if (parent.status !== 'SUCCEEDED') throw new ForgeNativeError('forge_native_parent_receipt_failed');
    if (parent.descendants.length > 0) throw new ForgeNativeError('forge_native_descendant_detected');
    if (parent.checks.some((check) => check.status !== 'passed')) throw new ForgeNativeError('forge_native_parent_check_incomplete');

    const leaves = receipts.filter((receipt) => receipt.role === 'leaf');
    if (leaves.length !== plan.work_items.length) throw new ForgeNativeError('forge_native_worker_receipt_missing');
    const ids = new Set<string>();
    for (const leaf of leaves) {
        if (ids.has(leaf.work_item_id)) throw new ForgeNativeError('forge_native_duplicate_worker_receipt');
        ids.add(leaf.work_item_id);
        if (leaf.parent_task_id !== parentTaskId) throw new ForgeNativeError('forge_native_task_graph_invalid');
        if (leaf.task_id === parentTaskId) throw new ForgeNativeError('forge_native_task_graph_invalid');
        if (leaf.status !== 'SUCCEEDED') throw new ForgeNativeError('forge_native_worker_receipt_failed');
        if (leaf.descendants.length > 0) throw new ForgeNativeError('forge_native_descendant_detected');
        if (leaf.checks.some((check) => check.status !== 'passed')) throw new ForgeNativeError('forge_native_worker_check_incomplete');
    }
    if (plan.work_items.some((item) => !ids.has(item.work_item_id))) {
        throw new ForgeNativeError('forge_native_worker_receipt_missing');
    }
}

function collectIdentities(
    receipts: ForgeNativeWorkerReceipt[],
    overrides: CompleteNativeRunInput['actual_identities'],
): { actual: string[]; byTask: Map<string, ForgeNativeIdentity> } {
    const actual: string[] = [];
    const byTask = new Map<string, ForgeNativeIdentity>();
    for (const receipt of receipts) {
        const override = overrides?.get(receipt.task_id);
        const identity = assertIdentitySeparation(
            receipt.requested_identity,
            override?.identity ?? receipt.actual_identity,
            override?.attested ?? receipt.actual_identity_attested,
        );
        if (identity.actual_identity !== receipt.actual_identity) throw new ForgeNativeError('forge_native_actual_identity_drift');
        actual.push(identity.actual_identity);
        byTask.set(receipt.task_id, identity);
    }
    return { actual: [...new Set(actual)].sort(compare), byTask };
}

function taskGraph(
    parentTaskId: string,
    plan: ForgeNativePlan,
    receipts: ForgeNativeWorkerReceipt[],
    identities: Map<string, ForgeNativeIdentity>,
): ForgeNativeTaskGraphNode[] {
    const parent = receipts.find((receipt) => receipt.role === 'parent');
    if (!parent || parent.task_id !== parentTaskId) throw new ForgeNativeError('forge_native_task_graph_invalid');
    const graph: ForgeNativeTaskGraphNode[] = [{
        task_id: parentTaskId,
        parent_task_id: null,
        role: 'parent',
        work_item_id: null,
        requested_model: FORGE_NATIVE_REQUESTED_MODEL,
        requested_reasoning: FORGE_NATIVE_REQUESTED_REASONING,
        actual_identity: identities.get(parentTaskId)?.actual_identity ?? FORGE_NATIVE_ACTUAL_UNREPORTED,
        actual_identity_attested: identities.get(parentTaskId)?.actual_identity_attested ?? false,
        status: 'COMPLETED',
    }];
    const leaves = new Map(receipts.filter((receipt) => receipt.role === 'leaf').map((receipt) => [receipt.work_item_id, receipt]));
    for (const item of plan.work_items) {
        const receipt = leaves.get(item.work_item_id);
        if (!receipt || receipt.parent_task_id !== parentTaskId || receipt.task_id === parentTaskId) {
            throw new ForgeNativeError('forge_native_task_graph_orphan');
        }
        graph.push({
            task_id: receipt.task_id,
            parent_task_id: parentTaskId,
            role: 'leaf',
            work_item_id: receipt.work_item_id,
            requested_model: receipt.requested_identity.model,
            requested_reasoning: receipt.requested_identity.reasoning,
            actual_identity: receipt.actual_identity,
            actual_identity_attested: receipt.actual_identity_attested,
            status: receipt.status,
        });
    }
    if (new Set(graph.map((node) => node.task_id)).size !== graph.length) throw new ForgeNativeError('forge_native_task_graph_duplicate');
    return graph;
}

function assertCandidateDigest(input: CompleteNativeRunInput, files: ForgeNativeChangedFile[], receipts: ForgeNativeWorkerReceipt[]): void {
    const expected = hashNative({
        run_id: input.run_id,
        request_id: input.request_id,
        plan_sha256: input.plan.plan_sha256,
        changed_files: files,
        worker_receipt_sha256: receipts.map((receipt) => receipt.evidence_sha256).sort(compare),
    });
    if (input.candidate_digest !== expected) throw new ForgeNativeError('forge_native_candidate_digest_mismatch');
}

function persistNativeAggregate(
    db: Database.Database,
    runId: string,
    receipt: ForgeNativeAggregateReceipt,
): { replayed: boolean; receipt: ForgeNativeAggregateReceipt } {
    const run = getForgeNativeRun(db, runId);
    const fingerprint = hashNative({ ...receipt, receipt_sha256: '' });
    if (receipt.receipt_sha256 !== fingerprint) throw new ForgeNativeError('forge_native_aggregate_digest_mismatch');
    if (run.aggregate_receipt_json) {
        if (run.completion_fingerprint_sha256 !== fingerprint || run.aggregate_receipt_json !== stableNativeJson(receipt)) {
            throw new ForgeNativeError('forge_native_completion_replay_conflict');
        }
        return { replayed: true, receipt: JSON.parse(run.aggregate_receipt_json) as ForgeNativeAggregateReceipt };
    }
    if (['UNKNOWN', 'CANCELLED', 'CANCEL_REQUESTED', 'DELIVERED_UNVERIFIED'].includes(run.state)) {
        throw new ForgeNativeError('forge_native_run_terminal');
    }
    const now = Date.now();
    const result = db.prepare(`UPDATE ${NATIVE_RUNS_TABLE}
        SET state = 'DELIVERED_UNVERIFIED', aggregate_receipt_json = ?, completion_fingerprint_sha256 = ?,
            unresolved_gaps_json = ?, updated_at = ?, completed_at = ?
        WHERE run_id = ? AND aggregate_receipt_json IS NULL`)
        .run(stableNativeJson(receipt), fingerprint, stableNativeJson(receipt.unresolved_gaps), now, now, runId);
    if (result.changes !== 1) {
        const raced = getForgeNativeRun(db, runId);
        if (raced.aggregate_receipt_json === stableNativeJson(receipt) && raced.completion_fingerprint_sha256 === fingerprint) {
            return { replayed: true, receipt };
        }
        throw new ForgeNativeError('forge_native_completion_replay_conflict');
    }
    return { replayed: false, receipt };
}

export function completeForgeNativeRun(
    db: Database.Database,
    input: CompleteNativeRunInput,
): { replayed: boolean; receipt: ForgeNativeAggregateReceipt } {
    const run = getForgeNativeRun(db, input.run_id);
    if (run.request_id !== input.request_id) throw new ForgeNativeError('forge_native_completion_request_mismatch');
    const scope = nativeRunScope(db, input.run_id);
    const validatedPlan = validateNativePlan(input.plan, scope);
    if (validatedPlan.plan_sha256 !== run.plan_sha256) throw new ForgeNativeError('forge_native_plan_binding_invalid');
    const plan = validatedPlan.plan;
    const receipts = listForgeNativeWorkerReceipts(db, input.run_id);
    assertReceiptCompleteness(plan, input.parent_task_id, receipts);
    const checks = canonicalChecks(input.checks);
    const identities = collectIdentities(receipts, input.actual_identities);
    const changedFiles = uniqueChangedFiles(receipts);
    const artifacts = uniqueArtifacts(receipts);
    assertCandidateDigest({ ...input, plan }, changedFiles, receipts);
    const graph = taskGraph(input.parent_task_id, plan, receipts, identities.byTask);
    const base: Omit<ForgeNativeAggregateReceipt, 'receipt_sha256'> = {
        schema: FORGE_NATIVE_DELIVERY_SCHEMA,
        status: 'DELIVERED_UNVERIFIED',
        run_id: input.run_id,
        request_id: input.request_id,
        plan,
        task_graph: graph,
        worker_receipts: receipts,
        changed_files: changedFiles,
        checks,
        artifacts,
        requested_identity: { model: FORGE_NATIVE_REQUESTED_MODEL, reasoning: FORGE_NATIVE_REQUESTED_REASONING },
        actual_identities: identities.actual,
        unresolved_gaps: canonicalGaps(input.unresolved_gaps),
        candidate_digest: input.candidate_digest,
    };
    const receipt = {
        ...base,
        receipt_sha256: hashNative({ ...base, receipt_sha256: '' }),
    } as ForgeNativeAggregateReceipt;
    return persistNativeAggregate(db, input.run_id, receipt);
}
