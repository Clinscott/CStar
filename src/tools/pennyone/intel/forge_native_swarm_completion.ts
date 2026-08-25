import type Database from 'better-sqlite3';
import {
    assertIdentitySeparation,
    FORGE_NATIVE_DELIVERY_SCHEMA,
    FORGE_NATIVE_REQUESTED_MODEL,
    FORGE_NATIVE_REQUESTED_REASONING,
    ForgeNativeError,
    type ForgeNativeAggregateReceipt,
    type ForgeNativeChangedFile,
    type ForgeNativePlan,
    type ForgeNativeWorkerReceipt,
} from '../../../types/forge_native_swarm.js';
import {
    buildNativeTaskGraph,
    hashNative,
    listForgeNativeWorkerReceipts,
    nativeRunScope,
    persistNativeAggregate,
} from './forge_native_swarm_controller.js';

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

function uniqueChangedFiles(receipts: ForgeNativeWorkerReceipt[]): ForgeNativeChangedFile[] {
    const byPath = new Map<string, ForgeNativeChangedFile>();
    for (const receipt of receipts) {
        for (const file of receipt.changed_files) {
            if (byPath.has(file.path.toLowerCase())) {
                const prior = byPath.get(file.path.toLowerCase())!;
                if (prior.path !== file.path || prior.sha256 !== file.sha256 || prior.byte_count !== file.byte_count) {
                    throw new ForgeNativeError('forge_native_aggregate_changed_file_conflict');
                }
                continue;
            }
            byPath.set(file.path.toLowerCase(), file);
        }
    }
    return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
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
            byPath.set(key, artifact);
        }
    }
    return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function assertChecks(checks: CompleteNativeRunInput['checks']): void {
    if (checks.length === 0) throw new ForgeNativeError('forge_native_mandatory_check_untested');
    if (checks.some((check) => check.status === 'failed')) throw new ForgeNativeError('forge_native_check_failed');
    if (checks.some((check) => check.status === 'untested')) throw new ForgeNativeError('forge_native_mandatory_check_untested');
    for (const check of checks) {
        if (!check.command.trim()) throw new ForgeNativeError('forge_native_check_command_missing');
    }
}

function assertReceiptCompleteness(plan: ForgeNativePlan, parentTaskId: string, receipts: ForgeNativeWorkerReceipt[]): void {
    const parent = receipts.filter((receipt) => receipt.role === 'parent');
    if (parent.length !== 1 || parent[0]!.task_id !== parentTaskId) throw new ForgeNativeError('forge_native_parent_receipt_missing');
    if (parent[0]!.status !== 'SUCCEEDED') throw new ForgeNativeError('forge_native_parent_receipt_failed');
    if (parent[0]!.checks.some((check) => check.status !== 'passed')) throw new ForgeNativeError('forge_native_parent_check_incomplete');
    const leaves = receipts.filter((receipt) => receipt.role === 'leaf');
    if (leaves.length !== plan.work_items.length) throw new ForgeNativeError('forge_native_worker_receipt_missing');
    const ids = new Set<string>();
    for (const leaf of leaves) {
        if (ids.has(leaf.work_item_id)) throw new ForgeNativeError('forge_native_duplicate_worker_receipt');
        ids.add(leaf.work_item_id);
        if (leaf.status !== 'SUCCEEDED') throw new ForgeNativeError('forge_native_worker_receipt_failed');
        if (leaf.descendants.length > 0) throw new ForgeNativeError('forge_native_descendant_detected');
        if (leaf.checks.some((check) => check.status !== 'passed')) throw new ForgeNativeError('forge_native_worker_check_incomplete');
    }
    if (plan.work_items.some((item) => !ids.has(item.work_item_id))) throw new ForgeNativeError('forge_native_worker_receipt_missing');
}

function assertIdentityReceipts(
    receipts: ForgeNativeWorkerReceipt[],
    actualIdentities: CompleteNativeRunInput['actual_identities'],
): string[] {
    const actual: string[] = [];
    for (const receipt of receipts) {
        const override = actualIdentities?.get(receipt.task_id);
        const identity = assertIdentitySeparation(
            receipt.requested_identity,
            override?.identity ?? receipt.actual_identity,
            override?.attested ?? receipt.actual_identity_attested,
        );
        if (identity.actual_identity !== receipt.actual_identity) throw new ForgeNativeError('forge_native_actual_identity_drift');
        actual.push(identity.actual_identity);
    }
    return [...new Set(actual)].sort();
}

function assertCandidateDigest(input: CompleteNativeRunInput, files: ForgeNativeChangedFile[], receipts: ForgeNativeWorkerReceipt[]): void {
    const expected = hashNative({
        run_id: input.run_id,
        request_id: input.request_id,
        plan_sha256: input.plan.plan_sha256,
        changed_files: files,
        worker_receipt_sha256: receipts.map((receipt) => receipt.evidence_sha256).sort(),
    });
    if (input.candidate_digest !== expected) throw new ForgeNativeError('forge_native_candidate_digest_mismatch');
}

export function completeForgeNativeRun(
    db: Database.Database,
    input: CompleteNativeRunInput,
): { replayed: boolean; receipt: ForgeNativeAggregateReceipt } {
    const scope = nativeRunScope(db, input.run_id);
    if (scope.request_id !== input.request_id) throw new ForgeNativeError('forge_native_completion_request_mismatch');
    const receipts = listForgeNativeWorkerReceipts(db, input.run_id);
    assertReceiptCompleteness(input.plan, input.parent_task_id, receipts);
    assertChecks(input.checks);
    const actualIdentities = assertIdentityReceipts(receipts, input.actual_identities);
    const changedFiles = uniqueChangedFiles(receipts);
    const artifacts = uniqueArtifacts(receipts);
    assertCandidateDigest(input, changedFiles, receipts);
    const taskGraph = buildNativeTaskGraph(input.parent_task_id, input.plan, receipts);
    const unresolvedGaps = [...new Set(input.unresolved_gaps ?? [])].sort();
    const base: Omit<ForgeNativeAggregateReceipt, 'receipt_sha256'> = {
        schema: FORGE_NATIVE_DELIVERY_SCHEMA,
        status: 'DELIVERED_UNVERIFIED',
        run_id: input.run_id,
        request_id: input.request_id,
        plan: input.plan,
        task_graph: taskGraph,
        worker_receipts: receipts,
        changed_files: changedFiles,
        checks: input.checks,
        artifacts,
        requested_identity: { model: FORGE_NATIVE_REQUESTED_MODEL, reasoning: FORGE_NATIVE_REQUESTED_REASONING },
        actual_identities: actualIdentities,
        unresolved_gaps: unresolvedGaps,
        candidate_digest: input.candidate_digest,
    };
    const receipt = { ...base, receipt_sha256: hashNative({ ...base, receipt_sha256: '' }) } as ForgeNativeAggregateReceipt;
    return persistNativeAggregate(db, input.run_id, receipt);
}
