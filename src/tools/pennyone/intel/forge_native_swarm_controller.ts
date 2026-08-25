import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
    assertIdentitySeparation,
    FORGE_NATIVE_ACTUAL_UNREPORTED,
    FORGE_NATIVE_CONNECTION_ID,
    FORGE_NATIVE_REQUESTED_MODEL,
    FORGE_NATIVE_REQUESTED_REASONING,
    FORGE_NATIVE_RUN_STATES,
    ForgeNativeError,
    hashNative,
    intersectNativeAuthority,
    isCanonicalAbsolutePath,
    stableNativeJson,
    uniqueSorted,
    validateNativeCapabilities,
    validateNativePlan,
    type ForgeNativeAggregateReceipt,
    type ForgeNativeAuthorityScope,
    type ForgeNativeControlReceipt,
    type ForgeNativeIdentity,
    type ForgeNativePlan,
    type ForgeNativeRequest,
    type ForgeNativeRunState,
    type ForgeNativeTaskGraphNode,
    type ForgeNativeWorkItem,
    type ForgeNativeWorkerPackage,
    type ForgeNativeWorkerReceipt,
    type NativeAuthorityIntersectionInput,
    type NativeAuthorityIntersectionResult,
    type NativePlanValidationResult,
} from '../../../types/forge_native_swarm.js';
import {
    ensureForgeNativeSwarmSchema,
    NATIVE_CONNECTION_GENERATIONS_TABLE,
    NATIVE_CONNECTION_TOMBSTONES_TABLE,
    NATIVE_RUNS_TABLE,
    NATIVE_WORKER_RECEIPTS_TABLE,
} from './forge_native_swarm_schema.js';

export { hashNative, intersectNativeAuthority, stableNativeJson, validateNativeCapabilities, validateNativePlan } from '../../../types/forge_native_swarm.js';
export type { NativeAuthorityIntersectionInput, NativeAuthorityIntersectionResult, NativePlanValidationResult } from '../../../types/forge_native_swarm.js';

const HEX64 = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const NATIVE_CONNECTION_GENERATION = 1;

type StoredRun = {
    run_id: string;
    request_id: string;
    request_sha256: string;
    connection_id: string;
    set_batch_id: string;
    authority_scope_json: string;
    source_identity_json: string;
    idempotency_key: string;
    lease_id: string;
    lease_expires_at: number;
    state: ForgeNativeRunState;
    plan_sha256: string | null;
    worker_package_json: string;
    control_receipt_json: string;
    aggregate_receipt_json: string | null;
    completion_fingerprint_sha256: string | null;
    unresolved_gaps_json: string;
    created_at: number;
    updated_at: number;
    completed_at: number | null;
};

export type ReserveNativeRunInput = {
    request: ForgeNativeRequest;
    evidence_root: string;
    now?: number;
    run_id?: string;
};

export type ReserveNativeRunResult = {
    replayed: boolean;
    run: StoredRun;
    worker_package: ForgeNativeWorkerPackage;
    control_receipt: ForgeNativeControlReceipt;
};

function assertId(value: unknown, name: string): asserts value is string {
    if (typeof value !== 'string' || !ID.test(value)) throw new ForgeNativeError(`forge_native_${name}_invalid`);
}

function assertDigest(value: unknown, name: string): asserts value is string {
    if (typeof value !== 'string' || !HEX64.test(value)) throw new ForgeNativeError(`forge_native_${name}_invalid`);
}

function parseRun(row: unknown): StoredRun {
    if (!row || typeof row !== 'object') throw new ForgeNativeError('forge_native_run_missing');
    return row as StoredRun;
}

function readRun(db: Database.Database, runId: string): StoredRun {
    return parseRun(db.prepare(`SELECT * FROM ${NATIVE_RUNS_TABLE} WHERE run_id = ?`).get(runId));
}

function assertNativeGeneration(db: Database.Database, now: number): void {
    const row = db.prepare(`SELECT status, executable FROM ${NATIVE_CONNECTION_GENERATIONS_TABLE} WHERE connection_id = ?`)
        .get(FORGE_NATIVE_CONNECTION_ID) as { status?: string; executable?: number } | undefined;
    if (row && (row.status !== 'ACTIVE' || row.executable !== 1)) {
        throw new ForgeNativeError('forge_connection_generation_rejected');
    }
    if (!row) {
        db.prepare(`INSERT INTO ${NATIVE_CONNECTION_GENERATIONS_TABLE}
            (connection_id, generation, status, executable, policy_json, created_at, updated_at)
            VALUES (?, ?, 'ACTIVE', 1, ?, ?, ?)`).run(
            FORGE_NATIVE_CONNECTION_ID,
            NATIVE_CONNECTION_GENERATION,
            stableNativeJson({ connection_id: FORGE_NATIVE_CONNECTION_ID, native: true }),
            now,
            now,
        );
    }
    const tombstone = db.prepare(`SELECT executable FROM ${NATIVE_CONNECTION_TOMBSTONES_TABLE} WHERE connection_id = ?`)
        .get(FORGE_NATIVE_CONNECTION_ID) as { executable?: number } | undefined;
    if (tombstone && tombstone.executable !== 1) throw new ForgeNativeError('forge_connection_generation_tombstoned');
}

function validateRequest(request: ForgeNativeRequest, now = Date.now()): void {
    if (request.schema !== 'cstar.forge_native_swarm_request.v1') throw new ForgeNativeError('forge_native_request_schema_invalid');
    if (request.authority.connection_id !== FORGE_NATIVE_CONNECTION_ID) throw new ForgeNativeError('forge_native_connection_invalid');
    assertId(request.authority.request_id, 'request_id');
    assertDigest(request.authority.request_sha256, 'request_sha256');
    assertId(request.idempotency_key, 'idempotency_key');
    if (request.requested_identity.model !== FORGE_NATIVE_REQUESTED_MODEL
        || request.requested_identity.reasoning !== FORGE_NATIVE_REQUESTED_REASONING) {
        throw new ForgeNativeError('forge_native_requested_identity_policy_mismatch');
    }
    if (!Number.isSafeInteger(request.deadline_at) || request.deadline_at <= now) {
        throw new ForgeNativeError('forge_native_deadline_invalid');
    }
    validateNativeCapabilities(request.capabilities);
}

function buildWorkerPackage(request: ForgeNativeRequest, runId: string, evidenceRoot: string): ForgeNativeWorkerPackage {
    if (!isCanonicalAbsolutePath(evidenceRoot)) throw new ForgeNativeError('forge_native_evidence_root_invalid');
    const authority = request.authority;
    return {
        schema: 'cstar.forge_native_worker_package.v1',
        run_id: runId,
        work_package_id: `native-package-${hashNative({ runId, request: authority }).slice(0, 32)}`,
        goal: request.goal,
        acceptance: request.acceptance,
        execution_root: authority.execution_root,
        source_identity: { repository: authority.source_repository, head: authority.source_head },
        read_allowlist: authority.read_allowlist,
        write_allowlist: authority.write_allowlist,
        test_allowlist: authority.test_allowlist,
        protected_effect_exclusions: authority.effect_exclusions,
        topology_ceiling: { parent: 1, leaves: 3, descendants: 0 },
        requested_identity: { model: FORGE_NATIVE_REQUESTED_MODEL, reasoning: FORGE_NATIVE_REQUESTED_REASONING },
        evidence_root: evidenceRoot,
        deadline_at: request.deadline_at,
    };
}

function buildControlReceipt(request: ForgeNativeRequest, runId: string, leaseId: string, leaseExpiresAt: number): ForgeNativeControlReceipt {
    const cancellation = hashNative({ runId, leaseId, request: request.authority.request_sha256 });
    return {
        schema: 'cstar.forge_native_control_receipt.v1',
        run_id: runId,
        request_id: request.authority.request_id,
        lease_id: leaseId,
        lease_expires_at: leaseExpiresAt,
        cancellation_secret_sha256: cancellation,
    };
}

export function reserveForgeNativeRun(
    db: Database.Database,
    input: ReserveNativeRunInput,
): ReserveNativeRunResult {
    ensureForgeNativeSwarmSchema(db);
    const now = input.now ?? Date.now();
    if (!Number.isSafeInteger(now)) throw new ForgeNativeError('forge_native_time_invalid');
    validateRequest(input.request, now);
    if (!isCanonicalAbsolutePath(input.evidence_root)) throw new ForgeNativeError('forge_native_evidence_root_invalid');
    const authority = input.request.authority;
    const requestTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'hall_forge_requests'").get();
    if (requestTable && !db.prepare('SELECT 1 FROM hall_forge_requests WHERE request_id = ? AND request_sha256 = ?')
        .get(authority.request_id, authority.request_sha256)) {
        throw new ForgeNativeError('forge_native_request_missing');
    }
    const existing = db.prepare(`SELECT * FROM ${NATIVE_RUNS_TABLE} WHERE request_id = ? OR idempotency_key = ?`)
        .get(authority.request_id, input.request.idempotency_key) as StoredRun | undefined;
    if (existing) {
        const existingPackage = JSON.parse(existing.worker_package_json) as ForgeNativeWorkerPackage;
        if (existing.request_sha256 !== authority.request_sha256
            || existing.idempotency_key !== input.request.idempotency_key
            || existingPackage.evidence_root !== input.evidence_root) {
            throw new ForgeNativeError('forge_native_conflicting_replay');
        }
        return {
            replayed: true,
            run: existing,
            worker_package: existingPackage,
            control_receipt: JSON.parse(existing.control_receipt_json) as ForgeNativeControlReceipt,
        };
    }
    assertNativeGeneration(db, now);
    const runId = input.run_id ?? `native-run-${hashNative({ request: authority.request_id, key: input.request.idempotency_key }).slice(0, 32)}`;
    assertId(runId, 'run_id');
    const leaseId = `native-lease-${randomUUID()}`;
    const leaseExpiresAt = Math.min(input.request.deadline_at, now + 15 * 60 * 1000);
    const workerPackage = buildWorkerPackage(input.request, runId, input.evidence_root);
    const controlReceipt = buildControlReceipt(input.request, runId, leaseId, leaseExpiresAt);
    const row: StoredRun = {
        run_id: runId,
        request_id: authority.request_id,
        request_sha256: authority.request_sha256,
        connection_id: authority.connection_id,
        set_batch_id: authority.set_batch_id,
        authority_scope_json: stableNativeJson(authority),
        source_identity_json: stableNativeJson(input.request.source_identity),
        idempotency_key: input.request.idempotency_key,
        lease_id: leaseId,
        lease_expires_at: leaseExpiresAt,
        state: 'RESERVED',
        plan_sha256: null,
        worker_package_json: stableNativeJson(workerPackage),
        control_receipt_json: stableNativeJson(controlReceipt),
        aggregate_receipt_json: null,
        completion_fingerprint_sha256: null,
        unresolved_gaps_json: '[]',
        created_at: now,
        updated_at: now,
        completed_at: null,
    };
    try {
        db.prepare(`INSERT INTO ${NATIVE_RUNS_TABLE}
            (run_id, request_id, request_sha256, connection_id, set_batch_id, authority_scope_json,
             source_identity_json, idempotency_key, lease_id, lease_expires_at, state, plan_sha256,
             worker_package_json, control_receipt_json, aggregate_receipt_json, completion_fingerprint_sha256,
             unresolved_gaps_json, created_at, updated_at, completed_at)
            VALUES (@run_id, @request_id, @request_sha256, @connection_id, @set_batch_id, @authority_scope_json,
             @source_identity_json, @idempotency_key, @lease_id, @lease_expires_at, @state, @plan_sha256,
             @worker_package_json, @control_receipt_json, @aggregate_receipt_json, @completion_fingerprint_sha256,
             @unresolved_gaps_json, @created_at, @updated_at, @completed_at)`).run(row);
    } catch (error) {
        const replay = db.prepare(`SELECT * FROM ${NATIVE_RUNS_TABLE} WHERE request_id = ? OR idempotency_key = ?`)
            .get(authority.request_id, input.request.idempotency_key) as StoredRun | undefined;
        if (replay) {
            const replayPackage = JSON.parse(replay.worker_package_json) as ForgeNativeWorkerPackage;
            if (replay.request_sha256 !== authority.request_sha256 || replayPackage.evidence_root !== input.evidence_root) {
                throw new ForgeNativeError('forge_native_conflicting_replay');
            }
            return {
                replayed: true,
                run: replay,
                worker_package: replayPackage,
                control_receipt: JSON.parse(replay.control_receipt_json) as ForgeNativeControlReceipt,
            };
        }
        throw error;
    }
    return { replayed: false, run: row, worker_package: workerPackage, control_receipt: controlReceipt };
}

export function getForgeNativeRun(db: Database.Database, runId: string): StoredRun {
    ensureForgeNativeSwarmSchema(db);
    assertId(runId, 'run_id');
    return readRun(db, runId);
}

export function recordForgeNativePlan(
    db: Database.Database,
    runId: string,
    plan: ForgeNativePlan,
    scope: ForgeNativeAuthorityScope,
): NativePlanValidationResult {
    ensureForgeNativeSwarmSchema(db);
    const run = readRun(db, runId);
    if (run.state === 'UNKNOWN' || run.state === 'CANCELLED') throw new ForgeNativeError('forge_native_run_terminal');
    if (plan.run_id !== runId) throw new ForgeNativeError('forge_native_plan_run_mismatch');
    const validated = validateNativePlan(plan, scope);
    if (run.plan_sha256) {
        if (run.plan_sha256 !== validated.plan_sha256) throw new ForgeNativeError('forge_native_plan_replay_conflict');
        return validated;
    }
    db.prepare(`UPDATE ${NATIVE_RUNS_TABLE} SET plan_sha256 = ?, state = 'PLANNED', updated_at = ? WHERE run_id = ? AND plan_sha256 IS NULL`)
        .run(validated.plan_sha256, Date.now(), runId);
    return validated;
}

function expectedWorkItem(plan: ForgeNativePlan, workItemId: string): ForgeNativeWorkItem | null {
    return plan.work_items.find((item) => item.work_item_id === workItemId) ?? null;
}

export type RecordNativeWorkerReceiptInput = {
    run_id: string;
    plan: ForgeNativePlan;
    receipt: ForgeNativeWorkerReceipt;
    host_actual_identity?: string;
    host_actual_identity_attested?: boolean;
};

export function recordForgeNativeWorkerReceipt(
    db: Database.Database,
    input: RecordNativeWorkerReceiptInput,
): { replayed: boolean; receipt: ForgeNativeWorkerReceipt } {
    ensureForgeNativeSwarmSchema(db);
    const run = readRun(db, input.run_id);
    if (input.receipt.run_id !== input.run_id || input.receipt.schema !== 'cstar.forge_native_worker_receipt.v1') {
        throw new ForgeNativeError('forge_native_worker_receipt_binding_invalid');
    }
    const isParent = input.receipt.role === 'parent';
    if (!isParent && !expectedWorkItem(input.plan, input.receipt.work_item_id)) {
        throw new ForgeNativeError('forge_native_worker_receipt_work_item_unknown');
    }
    if (input.receipt.parent_task_id !== input.plan.parent_task_id && isParent) {
        throw new ForgeNativeError('forge_native_worker_receipt_parent_invalid');
    }
    if (input.receipt.task_id === input.plan.parent_task_id && !isParent) {
        throw new ForgeNativeError('forge_native_worker_receipt_role_invalid');
    }
    if (input.receipt.descendants.length > 0) throw new ForgeNativeError('forge_native_descendant_detected');
    const identity = assertIdentitySeparation(
        input.receipt.requested_identity,
        input.host_actual_identity ?? input.receipt.actual_identity,
        input.host_actual_identity_attested ?? input.receipt.actual_identity_attested,
    );
    if (identity.actual_identity !== input.receipt.actual_identity) throw new ForgeNativeError('forge_native_actual_identity_drift');
    const receiptHash = hashNative({ ...input.receipt, evidence_sha256: '' });
    if (input.receipt.evidence_sha256 !== receiptHash) throw new ForgeNativeError('forge_native_worker_receipt_digest_mismatch');
    const existing = db.prepare(`SELECT receipt_json, receipt_sha256 FROM ${NATIVE_WORKER_RECEIPTS_TABLE}
        WHERE run_id = ? AND (work_item_id = ? OR idempotency_key = ? OR task_id = ?)`)
        .get(input.run_id, input.receipt.work_item_id, input.receipt.work_item_id, input.receipt.task_id) as { receipt_json?: string; receipt_sha256?: string } | undefined;
    if (existing) {
        if (existing.receipt_sha256 !== receiptHash || existing.receipt_json !== stableNativeJson(input.receipt)) {
            throw new ForgeNativeError('forge_native_worker_receipt_replay_conflict');
        }
        return { replayed: true, receipt: JSON.parse(existing.receipt_json!) as ForgeNativeWorkerReceipt };
    }
    if (run.state === 'UNKNOWN' || run.state === 'CANCELLED' || run.state === 'DELIVERED_UNVERIFIED') {
        throw new ForgeNativeError('forge_native_run_terminal');
    }
    db.prepare(`INSERT INTO ${NATIVE_WORKER_RECEIPTS_TABLE}
        (receipt_id, run_id, work_item_id, idempotency_key, task_id, parent_task_id, role, state,
         receipt_sha256, receipt_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
            `native-receipt-${randomUUID()}`,
            input.run_id,
            input.receipt.work_item_id,
            input.receipt.work_item_id,
            input.receipt.task_id,
            input.receipt.parent_task_id,
            input.receipt.role,
            input.receipt.status,
            receiptHash,
            stableNativeJson(input.receipt),
            Date.now(),
        );
    db.prepare(`UPDATE ${NATIVE_RUNS_TABLE} SET state = 'RUNNING', updated_at = ? WHERE run_id = ? AND state IN ('RESERVED', 'PLANNED')`)
        .run(Date.now(), input.run_id);
    return { replayed: false, receipt: { ...input.receipt, evidence_sha256: receiptHash } };
}

export function listForgeNativeWorkerReceipts(db: Database.Database, runId: string): ForgeNativeWorkerReceipt[] {
    ensureForgeNativeSwarmSchema(db);
    return (db.prepare(`SELECT receipt_json FROM ${NATIVE_WORKER_RECEIPTS_TABLE} WHERE run_id = ? ORDER BY created_at, receipt_id`)
        .all(runId) as Array<{ receipt_json: string }>).map((row) => JSON.parse(row.receipt_json) as ForgeNativeWorkerReceipt);
}

export function updateForgeNativeRunState(
    db: Database.Database,
    runId: string,
    state: ForgeNativeRunState,
    gaps: string[] = [],
): StoredRun {
    ensureForgeNativeSwarmSchema(db);
    if (!(FORGE_NATIVE_RUN_STATES as readonly string[]).includes(state)) throw new ForgeNativeError('forge_native_run_state_invalid');
    const run = readRun(db, runId);
    if (run.state === 'DELIVERED_UNVERIFIED' && state !== 'DELIVERED_UNVERIFIED') throw new ForgeNativeError('forge_native_run_terminal');
    if (run.state === 'UNKNOWN' && state !== 'UNKNOWN') throw new ForgeNativeError('forge_native_unknown_frozen');
    const completed = ['CANCELLED', 'UNKNOWN', 'DELIVERED_UNVERIFIED'].includes(state) ? Date.now() : null;
    db.prepare(`UPDATE ${NATIVE_RUNS_TABLE} SET state = ?, unresolved_gaps_json = ?, updated_at = ?, completed_at = ? WHERE run_id = ?`)
        .run(state, stableNativeJson(uniqueSorted(gaps)), Date.now(), completed, runId);
    return readRun(db, runId);
}

export function cancelForgeNativeRun(db: Database.Database, runId: string): StoredRun {
    const run = readRun(db, runId);
    if (run.state === 'DELIVERED_UNVERIFIED' || run.state === 'CANCELLED') return run;
    if (run.state === 'UNKNOWN') throw new ForgeNativeError('forge_native_unknown_frozen');
    return updateForgeNativeRunState(db, runId, 'CANCEL_REQUESTED');
}

export function buildNativeTaskGraph(
    parentTaskId: string,
    plan: ForgeNativePlan,
    receipts: ForgeNativeWorkerReceipt[],
    actualIdentities: Map<string, ForgeNativeIdentity> = new Map(),
): ForgeNativeTaskGraphNode[] {
    const graph: ForgeNativeTaskGraphNode[] = [{
        task_id: parentTaskId,
        parent_task_id: null,
        role: 'parent',
        work_item_id: null,
        requested_model: FORGE_NATIVE_REQUESTED_MODEL,
        requested_reasoning: FORGE_NATIVE_REQUESTED_REASONING,
        actual_identity: actualIdentities.get(parentTaskId)?.actual_identity ?? FORGE_NATIVE_ACTUAL_UNREPORTED,
        actual_identity_attested: actualIdentities.get(parentTaskId)?.actual_identity_attested ?? false,
        status: 'COMPLETED',
    }];
    for (const receipt of receipts) {
        if (receipt.role === 'parent') {
            if (receipt.task_id !== parentTaskId || receipt.parent_task_id !== parentTaskId) throw new ForgeNativeError('forge_native_task_graph_invalid');
            continue;
        }
        if (receipt.parent_task_id !== parentTaskId || receipt.task_id === parentTaskId) throw new ForgeNativeError('forge_native_task_graph_invalid');
        if (receipt.descendants.length > 0) throw new ForgeNativeError('forge_native_descendant_detected');
        if (!plan.work_items.some((item) => item.work_item_id === receipt.work_item_id)) throw new ForgeNativeError('forge_native_task_graph_orphan');
        graph.push({
            task_id: receipt.task_id,
            parent_task_id: receipt.parent_task_id,
            role: receipt.role,
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

export function nativeRunScope(db: Database.Database, runId: string): ForgeNativeAuthorityScope {
    const run = readRun(db, runId);
    return JSON.parse(run.authority_scope_json) as ForgeNativeAuthorityScope;
}

export function nativeRunPackage(db: Database.Database, runId: string): ForgeNativeWorkerPackage {
    return JSON.parse(readRun(db, runId).worker_package_json) as ForgeNativeWorkerPackage;
}

export function nativeRunControlReceipt(db: Database.Database, runId: string): ForgeNativeControlReceipt {
    return JSON.parse(readRun(db, runId).control_receipt_json) as ForgeNativeControlReceipt;
}

export function persistNativeAggregate(
    db: Database.Database,
    runId: string,
    receipt: ForgeNativeAggregateReceipt,
): { replayed: boolean; receipt: ForgeNativeAggregateReceipt } {
    const run = readRun(db, runId);
    const fingerprint = hashNative({ ...receipt, receipt_sha256: '' });
    if (receipt.receipt_sha256 !== fingerprint) throw new ForgeNativeError('forge_native_aggregate_digest_mismatch');
    if (run.aggregate_receipt_json) {
        if (run.completion_fingerprint_sha256 !== fingerprint || run.aggregate_receipt_json !== stableNativeJson(receipt)) {
            throw new ForgeNativeError('forge_native_completion_replay_conflict');
        }
        return { replayed: true, receipt: JSON.parse(run.aggregate_receipt_json) as ForgeNativeAggregateReceipt };
    }
    if (run.state === 'UNKNOWN' || run.state === 'CANCELLED') throw new ForgeNativeError('forge_native_run_terminal');
    db.prepare(`UPDATE ${NATIVE_RUNS_TABLE} SET state = 'DELIVERED_UNVERIFIED', aggregate_receipt_json = ?, completion_fingerprint_sha256 = ?, updated_at = ?, completed_at = ? WHERE run_id = ? AND aggregate_receipt_json IS NULL`)
        .run(stableNativeJson(receipt), fingerprint, Date.now(), Date.now(), runId);
    return { replayed: false, receipt };
}
