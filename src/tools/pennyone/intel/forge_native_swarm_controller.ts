import type Database from 'better-sqlite3';
import {
    assertIdentitySeparation,
    FORGE_NATIVE_ACTUAL_UNREPORTED,
    FORGE_NATIVE_CONNECTION_ID,
    FORGE_NATIVE_CONTROL_RECEIPT_SCHEMA,
    FORGE_NATIVE_GENERATION,
    FORGE_NATIVE_REQUESTED_MODEL,
    FORGE_NATIVE_REQUESTED_REASONING,
    FORGE_NATIVE_REQUEST_SCHEMA,
    FORGE_NATIVE_RUN_STATES,
    ForgeNativeError,
    hashNative,
    intersectNativeAuthority,
    isCanonicalAbsolutePath,
    stableNativeJson,
    validateNativeCapabilities,
    validateNativePlan,
    type ForgeNativeAuthorization,
    type ForgeNativeAuthorityScope,
    type ForgeNativeControlReceipt,
    type ForgeNativePlan,
    type ForgeNativeRequest,
    type ForgeNativeRunState,
    type ForgeNativeWorkerPackage,
    type ForgeNativeWorkerReceipt,
    type NativePlanValidationResult,
} from '../../../types/forge_native_swarm.js';
import { forgeNativeAuthorizationSchema, forgeNativeRequestSchema } from '../../cstar-kernel-mcp/contracts/forge_native_swarm.js';
import {
    assertForgeNativeSchemaPresent,
    ensureForgeNativeSwarmSchema,
    forgeNativeSchemaPresent,
    NATIVE_CONNECTION_GENERATIONS_TABLE,
    NATIVE_RUNS_TABLE,
    NATIVE_WORKER_RECEIPTS_TABLE,
} from './forge_native_swarm_schema.js';
import { assertForgeConnectionExecutable } from './forge_connection_tombstone.js';

export { hashNative, intersectNativeAuthority, stableNativeJson, validateNativeCapabilities, validateNativePlan } from '../../../types/forge_native_swarm.js';
export type { NativeAuthorityIntersectionInput, NativeAuthorityIntersectionResult, NativePlanValidationResult } from '../../../types/forge_native_swarm.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;

export type StoredNativeRun = {
    run_id: string; request_id: string; request_sha256: string; connection_id: string;
    generation: number; set_batch_id: string; authority_scope_json: string;
    source_identity_json: string; idempotency_key: string; lease_id: string;
    lease_expires_at: number; state: ForgeNativeRunState; plan_sha256: string | null;
    worker_package_json: string; control_receipt_json: string;
    aggregate_receipt_json: string | null; completion_fingerprint_sha256: string | null;
    unresolved_gaps_json: string; created_at: number; updated_at: number;
    completed_at: number | null;
};

export type ReserveNativeRunInput = {
    request: ForgeNativeRequest;
    authorization: ForgeNativeAuthorization;
    now?: number;
    run_id?: string;
    evidence_root?: string;
    /** Only permits additive schema creation on an explicitly copied database. */
    copied_state?: boolean;
};

export type ReserveNativeRunResult = {
    replayed: boolean;
    run: StoredNativeRun;
    worker_package: ForgeNativeWorkerPackage;
    control_receipt: ForgeNativeControlReceipt;
};

function assertId(value: unknown, name: string): asserts value is string {
    if (typeof value !== 'string' || !ID.test(value)) throw new ForgeNativeError(`forge_native_${name}_invalid`);
}

function assertDigest(value: unknown, name: string): asserts value is string {
    if (typeof value !== 'string' || !DIGEST.test(value)) throw new ForgeNativeError(`forge_native_${name}_invalid`);
}

function ensureCopiedSchema(db: Database.Database, copiedState: boolean | undefined): void {
    if (forgeNativeSchemaPresent(db)) return;
    ensureForgeNativeSwarmSchema(db, { copied_state: copiedState === true });
}

function readRun(db: Database.Database, runId: string): StoredNativeRun {
    assertId(runId, 'run_id');
    const row = db.prepare(`SELECT * FROM ${NATIVE_RUNS_TABLE} WHERE run_id = ?`).get(runId) as StoredNativeRun | undefined;
    if (!row) throw new ForgeNativeError('forge_native_run_missing');
    return row;
}

function validateRequest(request: ForgeNativeRequest, now: number): void {
    const parsed = forgeNativeRequestSchema.safeParse(request);
    if (!parsed.success || request.schema !== FORGE_NATIVE_REQUEST_SCHEMA) {
        throw new ForgeNativeError('forge_native_request_schema_invalid');
    }
    assertId(request.authority.request_id, 'request_id');
    assertDigest(request.authority.request_sha256, 'request_sha256');
    assertId(request.idempotency_key, 'idempotency_key');
    if (request.authority.connection_id !== FORGE_NATIVE_CONNECTION_ID
        || request.requested_identity.model !== FORGE_NATIVE_REQUESTED_MODEL
        || request.requested_identity.reasoning !== FORGE_NATIVE_REQUESTED_REASONING) {
        throw new ForgeNativeError('forge_native_requested_identity_policy_mismatch');
    }
    if (!Number.isSafeInteger(request.deadline_at) || request.deadline_at <= now) {
        throw new ForgeNativeError('forge_native_deadline_invalid');
    }
    if (!isCanonicalAbsolutePath(request.evidence_root ?? '')) {
        throw new ForgeNativeError('forge_native_evidence_root_missing');
    }
    validateNativeCapabilities(request.capabilities);
}

function verifyAuthorization(request: ForgeNativeRequest, authorization: ForgeNativeAuthorization): ForgeNativeAuthorityScope {
    const parsed = forgeNativeAuthorizationSchema.safeParse(authorization);
    if (!parsed.success || authorization.request_id !== request.authority.request_id
        || authorization.request_sha256 !== request.authority.request_sha256
        || authorization.actual_identity !== FORGE_NATIVE_ACTUAL_UNREPORTED
        || authorization.actual_identity_attested !== false) {
        throw new ForgeNativeError('forge_native_authorization_binding_invalid');
    }
    const intersection = intersectNativeAuthority({
        durable_set: request.authority,
        immutable_request: authorization.authority,
        connection_policy: request.authority,
        run_lease: authorization.authority,
    });
    if (intersection.scope_sha256 !== authorization.scope_sha256
        || authorization.evidence_root !== request.evidence_root) {
        throw new ForgeNativeError('forge_native_scope_digest_mismatch');
    }
    return intersection.effective_scope;
}

function buildWorkerPackage(request: ForgeNativeRequest, runId: string, scope: ForgeNativeAuthorityScope): ForgeNativeWorkerPackage {
    return {
        schema: 'cstar.forge_native_worker_package.v1',
        run_id: runId,
        work_package_id: `native-package-${hashNative({ run_id: runId, scope }).slice(0, 32)}`,
        goal: request.goal,
        acceptance: request.acceptance,
        execution_root: scope.execution_root,
        source_identity: { repository: scope.source_repository, head: scope.source_head },
        read_allowlist: scope.read_allowlist,
        write_allowlist: scope.write_allowlist,
        test_allowlist: scope.test_allowlist,
        protected_effect_exclusions: scope.effect_exclusions,
        topology_ceiling: { parent: 1, leaves: 3, descendants: 0 },
        requested_identity: { model: FORGE_NATIVE_REQUESTED_MODEL, reasoning: FORGE_NATIVE_REQUESTED_REASONING },
        evidence_root: request.evidence_root!,
        deadline_at: request.deadline_at,
    };
}

function buildControlReceipt(request: ForgeNativeRequest, runId: string, leaseId: string): ForgeNativeControlReceipt {
    return {
        schema: FORGE_NATIVE_CONTROL_RECEIPT_SCHEMA,
        run_id: runId,
        request_id: request.authority.request_id,
        lease_id: leaseId,
        lease_expires_at: request.deadline_at,
        cancellation_secret_sha256: hashNative({ run_id: runId, lease_id: leaseId, request_sha256: request.authority.request_sha256 }),
    };
}

function replayRun(existing: StoredNativeRun, request: ForgeNativeRequest, expectedScope?: ForgeNativeAuthorityScope): ReserveNativeRunResult {
    const workerPackage = JSON.parse(existing.worker_package_json) as ForgeNativeWorkerPackage;
    const controlReceipt = JSON.parse(existing.control_receipt_json) as ForgeNativeControlReceipt;
    if (existing.request_sha256 !== request.authority.request_sha256
        || existing.connection_id !== request.authority.connection_id
        || existing.idempotency_key !== request.idempotency_key
        || workerPackage.evidence_root !== request.evidence_root
        || controlReceipt.lease_expires_at !== request.deadline_at
        || workerPackage.goal !== request.goal
        || stableNativeJson(workerPackage.acceptance) !== stableNativeJson(request.acceptance)
        || workerPackage.execution_root !== request.source_identity.execution_root
        || (expectedScope && hashNative(JSON.parse(existing.authority_scope_json)) !== hashNative(expectedScope))) {
        throw new ForgeNativeError('forge_native_conflicting_replay');
    }
    return { replayed: true, run: existing, worker_package: workerPackage, control_receipt: controlReceipt };
}

export function reserveForgeNativeRun(db: Database.Database, input: ReserveNativeRunInput): ReserveNativeRunResult {
    ensureCopiedSchema(db, input.copied_state);
    if (input.evidence_root !== undefined) throw new ForgeNativeError('forge_native_evidence_root_caller_forbidden');
    const now = input.now ?? Date.now();
    if (!Number.isSafeInteger(now) || now < 0) throw new ForgeNativeError('forge_native_time_invalid');
    validateRequest(input.request, now);
    const request = input.request;
    const scope = verifyAuthorization(request, input.authorization);
    assertForgeConnectionExecutable(db, request.authority.connection_id);
    const parentExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'hall_forge_requests'").get();
    if (!parentExists || !db.prepare('SELECT 1 FROM hall_forge_requests WHERE request_id = ? AND request_sha256 = ?').get(request.authority.request_id, request.authority.request_sha256)) {
        throw new ForgeNativeError('forge_native_request_missing');
    }
    const existing = db.prepare(`SELECT * FROM ${NATIVE_RUNS_TABLE} WHERE request_id = ? OR request_sha256 = ? OR idempotency_key = ?`).get(request.authority.request_id, request.authority.request_sha256, request.idempotency_key) as StoredNativeRun | undefined;
    if (existing) return replayRun(existing, request, scope);
    const expectedRunId = `native-run-${hashNative({ request_id: request.authority.request_id, request_sha256: request.authority.request_sha256 }).slice(0, 32)}`;
    if (input.run_id !== undefined && input.run_id !== expectedRunId) throw new ForgeNativeError('forge_native_run_id_caller_forbidden');
    const runId = expectedRunId;
    const leaseId = `native-lease-${hashNative({ run_id: runId, idempotency_key: request.idempotency_key }).slice(0, 32)}`;
    const workerPackage = buildWorkerPackage(request, runId, scope);
    const controlReceipt = buildControlReceipt(request, runId, leaseId);
    const record: StoredNativeRun = {
        run_id: runId, request_id: request.authority.request_id, request_sha256: request.authority.request_sha256,
        connection_id: request.authority.connection_id, generation: request.authority.generation ?? FORGE_NATIVE_GENERATION,
        set_batch_id: scope.set_batch_id, authority_scope_json: stableNativeJson(scope),
        source_identity_json: stableNativeJson(request.source_identity), idempotency_key: request.idempotency_key,
        lease_id: leaseId, lease_expires_at: request.deadline_at, state: 'RESERVED', plan_sha256: null,
        worker_package_json: stableNativeJson(workerPackage), control_receipt_json: stableNativeJson(controlReceipt),
        aggregate_receipt_json: null, completion_fingerprint_sha256: null, unresolved_gaps_json: '[]',
        created_at: now, updated_at: now, completed_at: null,
    };
    try {
        db.prepare(`INSERT INTO ${NATIVE_RUNS_TABLE}
            (run_id, request_id, request_sha256, connection_id, generation, set_batch_id,
             authority_scope_json, source_identity_json, idempotency_key, lease_id, lease_expires_at,
             state, plan_sha256, worker_package_json, control_receipt_json, aggregate_receipt_json,
             completion_fingerprint_sha256, unresolved_gaps_json, created_at, updated_at, completed_at)
            VALUES (@run_id, @request_id, @request_sha256, @connection_id, @generation, @set_batch_id,
             @authority_scope_json, @source_identity_json, @idempotency_key, @lease_id, @lease_expires_at,
             @state, @plan_sha256, @worker_package_json, @control_receipt_json, @aggregate_receipt_json,
             @completion_fingerprint_sha256, @unresolved_gaps_json, @created_at, @updated_at, @completed_at)`).run(record);
    } catch (error) {
        const raced = db.prepare(`SELECT * FROM ${NATIVE_RUNS_TABLE} WHERE request_id = ? OR request_sha256 = ? OR idempotency_key = ?`).get(request.authority.request_id, request.authority.request_sha256, request.idempotency_key) as StoredNativeRun | undefined;
        if (raced) return replayRun(raced, request, scope);
        throw error;
    }
    return { replayed: false, run: record, worker_package: workerPackage, control_receipt: controlReceipt };
}

export function getForgeNativeRun(db: Database.Database, runId: string): StoredNativeRun {
    assertForgeNativeSchemaPresent(db);
    return readRun(db, runId);
}

export function nativeRunScope(db: Database.Database, runId: string): ForgeNativeAuthorityScope {
    return JSON.parse(getForgeNativeRun(db, runId).authority_scope_json) as ForgeNativeAuthorityScope;
}

export function nativeRunPackage(db: Database.Database, runId: string): ForgeNativeWorkerPackage {
    return JSON.parse(getForgeNativeRun(db, runId).worker_package_json) as ForgeNativeWorkerPackage;
}

export function nativeRunControlReceipt(db: Database.Database, runId: string): ForgeNativeControlReceipt {
    return JSON.parse(getForgeNativeRun(db, runId).control_receipt_json) as ForgeNativeControlReceipt;
}

export function updateForgeNativeRunState(db: Database.Database, runId: string, state: ForgeNativeRunState, gaps: string[] = [], now = Date.now()): StoredNativeRun {
    assertForgeNativeSchemaPresent(db);
    if (!(FORGE_NATIVE_RUN_STATES as readonly string[]).includes(state)) throw new ForgeNativeError('forge_native_run_state_invalid');
    if (!Number.isSafeInteger(now) || now < 0) throw new ForgeNativeError('forge_native_time_invalid');
    const run = readRun(db, runId);
    if (run.state === 'UNKNOWN' && state !== 'UNKNOWN') throw new ForgeNativeError('forge_native_unknown_frozen');
    if (run.state === 'DELIVERED_UNVERIFIED' && state !== 'DELIVERED_UNVERIFIED') throw new ForgeNativeError('forge_native_run_terminal');
    if (run.state === 'CANCELLED' && state !== 'CANCELLED') throw new ForgeNativeError('forge_native_run_terminal');
    if (state === 'CANCELLED' && run.state !== 'CANCEL_REQUESTED') throw new ForgeNativeError('forge_native_cancellation_not_requested');
    const terminal = ['CANCELLED', 'UNKNOWN', 'DELIVERED_UNVERIFIED'].includes(state);
    db.prepare(`UPDATE ${NATIVE_RUNS_TABLE} SET state = ?, unresolved_gaps_json = ?, updated_at = ?, completed_at = ? WHERE run_id = ?`)
        .run(state, stableNativeJson([...new Set(gaps.map((gap) => gap.trim()).filter(Boolean))].sort()), now, terminal ? now : null, runId);
    return readRun(db, runId);
}

export function markForgeNativeRunUnknown(db: Database.Database, runId: string, reason: string): StoredNativeRun {
    if (!reason.trim()) throw new ForgeNativeError('forge_native_unknown_reason_missing');
    return updateForgeNativeRunState(db, runId, 'UNKNOWN', [reason.trim()]);
}

function assertControlReceipt(run: StoredNativeRun, control: ForgeNativeControlReceipt): void {
    const stored = JSON.parse(run.control_receipt_json) as ForgeNativeControlReceipt;
    if (stableNativeJson(control) !== stableNativeJson(stored)
        || control.schema !== FORGE_NATIVE_CONTROL_RECEIPT_SCHEMA
        || control.run_id !== run.run_id || control.request_id !== run.request_id
        || control.lease_id !== run.lease_id) throw new ForgeNativeError('forge_native_control_receipt_invalid');
}

export function cancelForgeNativeRun(db: Database.Database, runId: string, control: ForgeNativeControlReceipt): StoredNativeRun {
    const run = getForgeNativeRun(db, runId);
    assertControlReceipt(run, control);
    if (run.state === 'UNKNOWN') throw new ForgeNativeError('forge_native_unknown_frozen');
    if (run.state === 'DELIVERED_UNVERIFIED' || run.state === 'CANCELLED' || run.state === 'CANCEL_REQUESTED') return run;
    return updateForgeNativeRunState(db, runId, 'CANCEL_REQUESTED');
}

export type RecordNativeWorkerReceiptInput = {
    run_id: string;
    plan: ForgeNativePlan;
    receipt: ForgeNativeWorkerReceipt;
    host_actual_identity?: string;
    host_actual_identity_attested?: boolean;
    now?: number;
};

export function recordForgeNativePlan(db: Database.Database, runId: string, plan: ForgeNativePlan, scope: ForgeNativeAuthorityScope): NativePlanValidationResult {
    const run = getForgeNativeRun(db, runId);
    if (run.state === 'UNKNOWN' || run.state === 'CANCELLED' || run.state === 'DELIVERED_UNVERIFIED') throw new ForgeNativeError('forge_native_run_terminal');
    if (plan.run_id !== runId || hashNative(scope) !== hashNative(JSON.parse(run.authority_scope_json))) throw new ForgeNativeError('forge_native_plan_binding_invalid');
    const validated = validateNativePlan(plan, scope);
    if (run.plan_sha256 && run.plan_sha256 !== validated.plan_sha256) throw new ForgeNativeError('forge_native_plan_replay_conflict');
    if (!run.plan_sha256) db.prepare(`UPDATE ${NATIVE_RUNS_TABLE} SET plan_sha256 = ?, state = 'PLANNED', updated_at = ? WHERE run_id = ? AND plan_sha256 IS NULL`).run(validated.plan_sha256, Date.now(), runId);
    return validated;
}

export function recordForgeNativeWorkerReceipt(db: Database.Database, input: RecordNativeWorkerReceiptInput): { replayed: boolean; receipt: ForgeNativeWorkerReceipt } {
    const run = getForgeNativeRun(db, input.run_id);
    if (run.state === 'UNKNOWN' || run.state === 'CANCELLED' || run.state === 'DELIVERED_UNVERIFIED') throw new ForgeNativeError('forge_native_run_terminal');
    if (!input.receipt || input.receipt.run_id !== input.run_id || input.receipt.schema !== 'cstar.forge_native_worker_receipt.v1' || input.receipt.descendants.length) throw new ForgeNativeError('forge_native_worker_receipt_binding_invalid');
    if (!run.plan_sha256 || validateNativePlan(input.plan, nativeRunScope(db, input.run_id)).plan_sha256 !== run.plan_sha256) throw new ForgeNativeError('forge_native_plan_binding_invalid');
    const validPlan = validateNativePlan(input.plan, nativeRunScope(db, input.run_id)).plan;
    const belongs = input.receipt.role === 'parent'
        ? validPlan.parent_task_id === input.receipt.task_id
        : validPlan.work_items.some((item) => item.work_item_id === input.receipt.work_item_id);
    if (!belongs || input.receipt.parent_task_id !== validPlan.parent_task_id) throw new ForgeNativeError('forge_native_worker_receipt_work_item_unknown');
    const identity = assertIdentitySeparation(input.receipt.requested_identity, input.host_actual_identity ?? input.receipt.actual_identity, input.host_actual_identity_attested ?? input.receipt.actual_identity_attested);
    if (identity.actual_identity !== input.receipt.actual_identity) throw new ForgeNativeError('forge_native_actual_identity_drift');
    const receiptHash = hashNative({ ...input.receipt, evidence_sha256: '' });
    if (receiptHash !== input.receipt.evidence_sha256) throw new ForgeNativeError('forge_native_worker_receipt_digest_mismatch');
    const existing = db.prepare(`SELECT receipt_json, receipt_sha256 FROM ${NATIVE_WORKER_RECEIPTS_TABLE} WHERE run_id = ? AND (work_item_id = ? OR idempotency_key = ? OR task_id = ?)`)
        .get(input.run_id, input.receipt.work_item_id, input.receipt.work_item_id, input.receipt.task_id) as { receipt_json?: string; receipt_sha256?: string } | undefined;
    if (existing) {
        if (existing.receipt_sha256 !== receiptHash || existing.receipt_json !== stableNativeJson(input.receipt)) throw new ForgeNativeError('forge_native_worker_receipt_replay_conflict');
        return { replayed: true, receipt: JSON.parse(existing.receipt_json!) as ForgeNativeWorkerReceipt };
    }
    const receiptId = `native-receipt-${hashNative({ run_id: input.run_id, task_id: input.receipt.task_id, evidence_sha256: receiptHash }).slice(0, 32)}`;
    db.prepare(`INSERT INTO ${NATIVE_WORKER_RECEIPTS_TABLE}
        (receipt_id, run_id, work_item_id, idempotency_key, task_id, parent_task_id, role, state, receipt_sha256, receipt_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(receiptId, input.run_id, input.receipt.work_item_id, input.receipt.work_item_id, input.receipt.task_id, input.receipt.parent_task_id, input.receipt.role, input.receipt.status, receiptHash, stableNativeJson(input.receipt), input.now ?? Date.now());
    db.prepare(`UPDATE ${NATIVE_RUNS_TABLE} SET state = 'RUNNING', updated_at = ? WHERE run_id = ? AND state IN ('RESERVED', 'PLANNED')`).run(input.now ?? Date.now(), input.run_id);
    return { replayed: false, receipt: input.receipt };
}

export function listForgeNativeWorkerReceipts(db: Database.Database, runId: string): ForgeNativeWorkerReceipt[] {
    assertForgeNativeSchemaPresent(db);
    return (db.prepare(`SELECT receipt_json FROM ${NATIVE_WORKER_RECEIPTS_TABLE} WHERE run_id = ? ORDER BY created_at, receipt_id`).all(runId) as Array<{ receipt_json: string }>).map((row) => JSON.parse(row.receipt_json) as ForgeNativeWorkerReceipt);
}
