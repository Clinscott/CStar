import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const FORGE_NATIVE_CONNECTION_ID = 'forge-native-codex-swarm-v1' as const;
export const FORGE_NATIVE_REQUEST_SCHEMA = 'cstar.forge_native_swarm_request.v1' as const;
export const FORGE_NATIVE_WORKER_PACKAGE_SCHEMA = 'cstar.forge_native_worker_package.v1' as const;
export const FORGE_NATIVE_CONTROL_RECEIPT_SCHEMA = 'cstar.forge_native_control_receipt.v1' as const;
export const FORGE_NATIVE_PLAN_SCHEMA = 'cstar.forge_native_swarm_plan.v1' as const;
export const FORGE_NATIVE_WORKER_RECEIPT_SCHEMA = 'cstar.forge_native_worker_receipt.v1' as const;
export const FORGE_NATIVE_DELIVERY_SCHEMA = 'cstar.forge_native_delivery_receipt.v1' as const;

export const FORGE_NATIVE_REQUESTED_MODEL = 'gpt-5.6-luna' as const;
export const FORGE_NATIVE_REQUESTED_REASONING = 'max' as const;
export const FORGE_NATIVE_ACTUAL_UNREPORTED = 'unreported' as const;

export const FORGE_NATIVE_CAPABILITIES = [
    'spawn_agent',
    'list_agents',
    'send_message',
    'followup_task',
    'wait_agent',
    'interrupt_agent',
] as const;
export type ForgeNativeCapability = typeof FORGE_NATIVE_CAPABILITIES[number];

export const FORGE_NATIVE_RUN_STATES = [
    'RESERVED',
    'PLANNED',
    'RUNNING',
    'DELIVERED_UNVERIFIED',
    'CANCEL_REQUESTED',
    'CANCELLED',
    'UNKNOWN',
] as const;
export type ForgeNativeRunState = typeof FORGE_NATIVE_RUN_STATES[number];

export const FORGE_NATIVE_WORKER_STATES = [
    'PLANNED',
    'SPAWNED',
    'RUNNING',
    'SUCCEEDED',
    'FAILED',
    'CANCELLED',
    'UNKNOWN',
] as const;
export type ForgeNativeWorkerState = typeof FORGE_NATIVE_WORKER_STATES[number];

export type ForgeNativeIdentity = {
    requested_model: typeof FORGE_NATIVE_REQUESTED_MODEL;
    requested_reasoning: typeof FORGE_NATIVE_REQUESTED_REASONING;
    actual_identity: string;
    actual_identity_attested: boolean;
};

export type ForgeNativeAuthorityScope = {
    decision_id: string;
    set_batch_id: string;
    connection_id: typeof FORGE_NATIVE_CONNECTION_ID;
    request_id: string;
    request_sha256: string;
    source_repository: string;
    source_head: string;
    execution_root: string;
    read_allowlist: string[];
    write_allowlist: string[];
    test_allowlist: string[];
    quarantine_allowlist: string[];
    effect_exclusions: string[];
    model_policy_sha256: string;
    retry_policy: { initial_attempts: 1; repair_continuations: 1; unknown_retries: 0 };
    cancellation_policy: 'interrupt_all_then_cancel_or_unknown';
};

export type ForgeNativeRequest = {
    schema: typeof FORGE_NATIVE_REQUEST_SCHEMA;
    authority: ForgeNativeAuthorityScope;
    goal: string;
    acceptance: string[];
    source_identity: { repository: string; head: string; execution_root: string };
    requested_identity: {
        model: typeof FORGE_NATIVE_REQUESTED_MODEL;
        reasoning: typeof FORGE_NATIVE_REQUESTED_REASONING;
    };
    capabilities: ForgeNativeCapability[];
    deadline_at: number;
    idempotency_key: string;
};

export type ForgeNativeWorkItem = {
    work_item_id: string;
    idempotency_key: string;
    objective: string;
    write_paths: string[];
    test_paths: string[];
    output_paths: string[];
    useful: boolean;
    leaf_index?: number;
};

export type ForgeNativePlan = {
    schema: typeof FORGE_NATIVE_PLAN_SCHEMA;
    run_id: string;
    parent_task_id: string;
    work_items: ForgeNativeWorkItem[];
    integration_paths: string[];
    expected_outputs: string[];
    plan_sha256: string;
};

export type ForgeNativeWorkerPackage = {
    schema: typeof FORGE_NATIVE_WORKER_PACKAGE_SCHEMA;
    run_id: string;
    work_package_id: string;
    goal: string;
    acceptance: string[];
    execution_root: string;
    source_identity: { repository: string; head: string };
    read_allowlist: string[];
    write_allowlist: string[];
    test_allowlist: string[];
    protected_effect_exclusions: string[];
    topology_ceiling: { parent: 1; leaves: 3; descendants: 0 };
    requested_identity: { model: typeof FORGE_NATIVE_REQUESTED_MODEL; reasoning: typeof FORGE_NATIVE_REQUESTED_REASONING };
    evidence_root: string;
    deadline_at: number;
};

export type ForgeNativeControlReceipt = {
    schema: typeof FORGE_NATIVE_CONTROL_RECEIPT_SCHEMA;
    run_id: string;
    request_id: string;
    lease_id: string;
    lease_expires_at: number;
    cancellation_secret_sha256: string;
};

export type ForgeNativeTaskGraphNode = {
    task_id: string;
    parent_task_id: string | null;
    role: 'parent' | 'leaf';
    work_item_id: string | null;
    requested_model: string;
    requested_reasoning: string;
    actual_identity: string;
    actual_identity_attested: boolean;
    status: ForgeNativeWorkerState | 'COMPLETED';
};

export type ForgeNativeChangedFile = { path: string; sha256: string; byte_count: number };

export type ForgeNativeWorkerReceipt = {
    schema: typeof FORGE_NATIVE_WORKER_RECEIPT_SCHEMA;
    run_id: string;
    work_item_id: string;
    task_id: string;
    parent_task_id: string;
    role: 'parent' | 'leaf';
    status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'UNKNOWN';
    requested_identity: { model: string; reasoning: string };
    actual_identity: string;
    actual_identity_attested: boolean;
    changed_files: ForgeNativeChangedFile[];
    checks: Array<{ command: string; status: 'passed' | 'failed' | 'untested'; evidence_sha256?: string }>;
    artifacts: Array<{ path: string; sha256: string; byte_count: number }>;
    descendants: string[];
    evidence_sha256: string;
};

export type ForgeNativeAggregateReceipt = {
    schema: typeof FORGE_NATIVE_DELIVERY_SCHEMA;
    status: 'DELIVERED_UNVERIFIED';
    run_id: string;
    request_id: string;
    plan: ForgeNativePlan;
    task_graph: ForgeNativeTaskGraphNode[];
    worker_receipts: ForgeNativeWorkerReceipt[];
    changed_files: ForgeNativeChangedFile[];
    checks: Array<{ command: string; status: 'passed' | 'failed' | 'untested'; evidence_sha256?: string }>;
    artifacts: Array<{ path: string; sha256: string; byte_count: number }>;
    requested_identity: { model: string; reasoning: string };
    actual_identities: string[];
    unresolved_gaps: string[];
    candidate_digest: string;
    receipt_sha256: string;
};

export class ForgeNativeError extends Error {
    readonly code: string;

    constructor(code: string, message = code) {
        super(message);
        this.name = 'ForgeNativeError';
        this.code = code;
    }
}

export function isCanonicalAbsolutePath(value: string): boolean {
    return path.isAbsolute(value)
        && path.resolve(value) === value
        && !value.split(path.sep).some((segment) => segment === '.' || segment === '..');
}

export function resolveActualIdentity(attestation: unknown): ForgeNativeIdentity['actual_identity'] {
    if (typeof attestation !== 'string' || attestation.trim().length === 0) return FORGE_NATIVE_ACTUAL_UNREPORTED;
    return attestation.trim();
}

export function assertIdentitySeparation(
    requested: { model: string; reasoning: string },
    actual: unknown,
    attested: boolean,
): ForgeNativeIdentity {
    if (requested.model !== FORGE_NATIVE_REQUESTED_MODEL || requested.reasoning !== FORGE_NATIVE_REQUESTED_REASONING) {
        throw new ForgeNativeError('forge_native_requested_identity_policy_mismatch');
    }
    const actualIdentity = resolveActualIdentity(actual);
    if (actualIdentity !== FORGE_NATIVE_ACTUAL_UNREPORTED && !attested) {
        throw new ForgeNativeError('forge_native_actual_identity_unattested');
    }
    return {
        requested_model: FORGE_NATIVE_REQUESTED_MODEL,
        requested_reasoning: FORGE_NATIVE_REQUESTED_REASONING,
        actual_identity: actualIdentity,
        actual_identity_attested: actualIdentity !== FORGE_NATIVE_ACTUAL_UNREPORTED && attested,
    };
}

export type NativeAuthorityIntersectionInput = {
    durable_set: ForgeNativeAuthorityScope;
    immutable_request: ForgeNativeAuthorityScope;
    connection_policy: ForgeNativeAuthorityScope;
    run_lease: ForgeNativeAuthorityScope;
};

export type NativeAuthorityIntersectionResult = {
    effective_scope: ForgeNativeAuthorityScope;
    scope_sha256: string;
};

export type NativePlanValidationResult = { plan: ForgeNativePlan; plan_sha256: string };

function stableValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
    }
    return value;
}

export function stableNativeJson(value: unknown): string {
    return JSON.stringify(stableValue(value));
}

export function hashNative(value: unknown): string {
    return createHash('sha256').update(stableNativeJson(value), 'utf8').digest('hex');
}

export function uniqueSorted(values: string[]): string[] {
    return [...new Set(values)].sort();
}

function assertId(value: unknown, name: string): asserts value is string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/.test(value)) {
        throw new ForgeNativeError(`forge_native_${name}_invalid`);
    }
}

function sameJson(left: unknown, right: unknown): boolean {
    return stableNativeJson(left) === stableNativeJson(right);
}

function sameScalarFields(left: ForgeNativeAuthorityScope, right: ForgeNativeAuthorityScope): boolean {
    return left.decision_id === right.decision_id
        && left.set_batch_id === right.set_batch_id
        && left.connection_id === right.connection_id
        && left.request_id === right.request_id
        && left.request_sha256 === right.request_sha256
        && left.source_repository === right.source_repository
        && left.source_head === right.source_head
        && left.execution_root === right.execution_root
        && left.model_policy_sha256 === right.model_policy_sha256
        && sameJson(left.retry_policy, right.retry_policy)
        && left.cancellation_policy === right.cancellation_policy;
}

function intersectLists(...lists: string[][]): string[] {
    const [first, ...rest] = lists.map(uniqueSorted);
    return first.filter((item) => rest.every((list) => list.includes(item)));
}

function pathInside(candidate: string, scope: string): boolean {
    const relative = path.relative(scope, candidate);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function pathOverlap(left: string, right: string): boolean {
    const l = left.toLowerCase();
    const r = right.toLowerCase();
    return pathInside(l, r) || pathInside(r, l);
}

function intersectPathLists(...lists: string[][]): string[] {
    let current = uniqueSorted(lists[0] ?? []);
    for (const next of lists.slice(1)) {
        const candidates: string[] = [];
        for (const left of current) {
            for (const right of uniqueSorted(next)) {
                if (pathOverlap(left, right)) candidates.push(pathInside(left, right) ? left : right);
            }
        }
        current = uniqueSorted(candidates);
    }
    return current;
}

function assertSubset(name: string, child: string[], parent: string[]): void {
    const allowed = new Set(parent.map((value) => value.toLowerCase()));
    const pathScoped = name !== 'effect';
    if (child.some((value) => !allowed.has(value.toLowerCase())
        && (!pathScoped || !parent.some((candidate) => pathInside(value.toLowerCase(), candidate.toLowerCase()))))) {
        throw new ForgeNativeError(`forge_native_${name}_scope_broader_than_authority`);
    }
}

export function intersectNativeAuthority(
    input: NativeAuthorityIntersectionInput,
): NativeAuthorityIntersectionResult {
    const records = [input.durable_set, input.immutable_request, input.connection_policy, input.run_lease];
    if (records.some((record) => !sameScalarFields(record, input.durable_set))) {
        throw new ForgeNativeError('forge_native_authority_scalar_mismatch');
    }
    for (const record of records.slice(1)) {
        assertSubset('read', record.read_allowlist, input.durable_set.read_allowlist);
        assertSubset('write', record.write_allowlist, input.durable_set.write_allowlist);
        assertSubset('test', record.test_allowlist, input.durable_set.test_allowlist);
        assertSubset('quarantine', record.quarantine_allowlist, input.durable_set.quarantine_allowlist);
        assertSubset('effect', input.durable_set.effect_exclusions, record.effect_exclusions);
    }
    const effective_scope: ForgeNativeAuthorityScope = {
        ...input.durable_set,
        read_allowlist: intersectPathLists(...records.map((record) => record.read_allowlist)),
        write_allowlist: intersectPathLists(...records.map((record) => record.write_allowlist)),
        test_allowlist: intersectPathLists(...records.map((record) => record.test_allowlist)),
        quarantine_allowlist: intersectPathLists(...records.map((record) => record.quarantine_allowlist)),
        effect_exclusions: uniqueSorted(records.flatMap((record) => record.effect_exclusions)),
    };
    if (effective_scope.write_allowlist.length === 0 || effective_scope.test_allowlist.length === 0) {
        throw new ForgeNativeError('forge_native_authority_intersection_empty');
    }
    return { effective_scope, scope_sha256: hashNative(effective_scope) };
}

export function validateNativeCapabilities(capabilities: readonly string[]): void {
    const supplied = new Set(capabilities);
    const missing = FORGE_NATIVE_CAPABILITIES.filter((name) => !supplied.has(name));
    if (missing.length) throw new ForgeNativeError(`forge_native_capability_unavailable:${missing.join(',')}`);
}

function canonicalPath(value: string, name: string): string {
    if (!isCanonicalAbsolutePath(value)) throw new ForgeNativeError(`forge_native_${name}_path_invalid`);
    const lexical = fs.lstatSync(value, { throwIfNoEntry: false });
    if (lexical?.isSymbolicLink()) throw new ForgeNativeError('forge_native_symlink_path_forbidden');
    if (lexical) {
        const resolved = fs.realpathSync(value);
        if (resolved !== value) throw new ForgeNativeError('forge_native_path_realpath_drift');
        if (lexical.isFile() && lexical.nlink !== 1) throw new ForgeNativeError('forge_native_hardlink_path_forbidden');
    }
    return value;
}

function validatePathOwnership(items: ForgeNativeWorkItem[], scope: ForgeNativeAuthorityScope): string[] {
    const seenIds = new Set<string>();
    const seenKeys = new Set<string>();
    const paths: string[] = [];
    for (const item of items) {
        assertId(item.work_item_id, 'work_item_id');
        assertId(item.idempotency_key, 'work_item_idempotency_key');
        if (seenIds.has(item.work_item_id) || seenKeys.has(item.idempotency_key)) {
            throw new ForgeNativeError('forge_native_plan_duplicate_work_item');
        }
        seenIds.add(item.work_item_id);
        seenKeys.add(item.idempotency_key);
        if (!item.useful) throw new ForgeNativeError('forge_native_plan_work_item_not_useful');
        const tests = item.test_paths.map((value) => canonicalPath(value, 'test'));
        if (tests.some((testPath) => !scope.test_allowlist.some((allowed) => pathInside(testPath, canonicalPath(allowed, 'test_allowlist'))))) {
            throw new ForgeNativeError('forge_native_plan_test_path_escape');
        }
        const owned = [...item.write_paths, ...item.output_paths].map((value) => canonicalPath(value, 'work_item'));
        for (const ownedPath of owned) {
            if (!scope.write_allowlist.some((allowed) => pathInside(ownedPath, canonicalPath(allowed, 'allowlist')))) {
                throw new ForgeNativeError('forge_native_plan_path_escape');
            }
            if (paths.some((previous) => pathOverlap(previous, ownedPath))) {
                throw new ForgeNativeError('forge_native_plan_path_overlap');
            }
            paths.push(ownedPath);
        }
    }
    return paths;
}

export function validateNativePlan(
    plan: ForgeNativePlan,
    scope: ForgeNativeAuthorityScope,
): NativePlanValidationResult {
    if (plan.schema !== FORGE_NATIVE_PLAN_SCHEMA) throw new ForgeNativeError('forge_native_plan_schema_invalid');
    assertId(plan.run_id, 'run_id');
    assertId(plan.parent_task_id, 'parent_task_id');
    if (plan.work_items.length > 3) throw new ForgeNativeError('forge_native_plan_leaf_ceiling_exceeded');
    if (plan.work_items.some((item) => item.leaf_index === undefined)) {
        throw new ForgeNativeError('forge_native_plan_leaf_index_missing');
    }
    const indexes = plan.work_items.map((item) => item.leaf_index as number);
    if (new Set(indexes).size !== indexes.length || indexes.some((index) => !Number.isInteger(index) || index < 0 || index > 2)
        || indexes.some((index, position) => index !== position)) {
        throw new ForgeNativeError('forge_native_plan_leaf_index_invalid');
    }
    const leafPaths = validatePathOwnership(plan.work_items, scope);
    const expectedPaths = plan.expected_outputs.map((value) => canonicalPath(value, 'expected_output'));
    if (expectedPaths.some((expectedPath) => !scope.write_allowlist.some((allowed) => pathInside(expectedPath, canonicalPath(allowed, 'allowlist'))))) {
        throw new ForgeNativeError('forge_native_plan_expected_output_escape');
    }
    const parentPaths = plan.integration_paths.map((value) => canonicalPath(value, 'integration'));
    for (const parentPath of parentPaths) {
        if (!scope.write_allowlist.some((allowed) => pathInside(parentPath, canonicalPath(allowed, 'allowlist')))) {
            throw new ForgeNativeError('forge_native_plan_integration_path_escape');
        }
    }
    const expected = { ...plan, plan_sha256: '' };
    const planSha = hashNative(expected);
    if (plan.plan_sha256 && plan.plan_sha256 !== planSha) throw new ForgeNativeError('forge_native_plan_digest_mismatch');
    return { plan: { ...plan, plan_sha256: planSha }, plan_sha256: planSha };
}
