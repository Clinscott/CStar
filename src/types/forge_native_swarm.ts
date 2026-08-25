import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const FORGE_NATIVE_CONNECTION_ID = 'forge-native-codex-swarm-v1' as const;
export const FORGE_NATIVE_GENERATION = 1 as const;
export const FORGE_NATIVE_REQUEST_SCHEMA = 'cstar.forge_native_swarm_request.v1' as const;
export const FORGE_NATIVE_AUTHORIZATION_SCHEMA = 'cstar.forge_native_swarm_authorization.v1' as const;
export const FORGE_NATIVE_EXECUTE_SCHEMA = 'cstar.forge_native_swarm_execute_binding.v1' as const;
export const FORGE_NATIVE_WORKER_PACKAGE_SCHEMA = 'cstar.forge_native_worker_package.v1' as const;
export const FORGE_NATIVE_CONTROL_RECEIPT_SCHEMA = 'cstar.forge_native_control_receipt.v1' as const;
export const FORGE_NATIVE_PLAN_SCHEMA = 'cstar.forge_native_swarm_plan.v1' as const;
export const FORGE_NATIVE_WORKER_RECEIPT_SCHEMA = 'cstar.forge_native_worker_receipt.v1' as const;
export const FORGE_NATIVE_DELIVERY_SCHEMA = 'cstar.forge_native_delivery_receipt.v1' as const;
export const FORGE_NATIVE_REQUESTED_MODEL = 'gpt-5.6-luna' as const;
export const FORGE_NATIVE_REQUESTED_REASONING = 'max' as const;
export const FORGE_NATIVE_ACTUAL_UNREPORTED = 'unreported' as const;

export const FORGE_NATIVE_CAPABILITIES = [
    'spawn_agent', 'list_agents', 'send_message', 'followup_task', 'wait_agent', 'interrupt_agent',
] as const;
export type ForgeNativeCapability = typeof FORGE_NATIVE_CAPABILITIES[number];

export const FORGE_NATIVE_RUN_STATES = [
    'RESERVED', 'PLANNED', 'RUNNING', 'DELIVERED_UNVERIFIED', 'CANCEL_REQUESTED', 'CANCELLED', 'UNKNOWN',
] as const;
export type ForgeNativeRunState = typeof FORGE_NATIVE_RUN_STATES[number];

export const FORGE_NATIVE_WORKER_STATES = [
    'PLANNED', 'SPAWNED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN',
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
    generation?: number;
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
    requested_identity: { model: typeof FORGE_NATIVE_REQUESTED_MODEL; reasoning: typeof FORGE_NATIVE_REQUESTED_REASONING };
    capabilities: ForgeNativeCapability[];
    deadline_at: number;
    idempotency_key: string;
    evidence_root?: string;
    binding_sha256?: string;
};

export type ForgeNativeAuthorization = {
    schema: typeof FORGE_NATIVE_AUTHORIZATION_SCHEMA;
    request_id: string;
    request_sha256: string;
    authorization_id: string;
    authorization_ref: string;
    authority: ForgeNativeAuthorityScope;
    scope_sha256: string;
    evidence_root: string;
    requested_identity: { model: typeof FORGE_NATIVE_REQUESTED_MODEL; reasoning: typeof FORGE_NATIVE_REQUESTED_REASONING };
    actual_identity: typeof FORGE_NATIVE_ACTUAL_UNREPORTED;
    actual_identity_attested: false;
    binding_sha256: string;
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

export type ForgeNativeExecuteBinding = {
    schema: typeof FORGE_NATIVE_EXECUTE_SCHEMA;
    run_id: string;
    request_id: string;
    request_sha256: string;
    scope_sha256: string;
    evidence_root: string;
    worker_package: ForgeNativeWorkerPackage;
    control_receipt: ForgeNativeControlReceipt;
    requested_identity: { model: typeof FORGE_NATIVE_REQUESTED_MODEL; reasoning: typeof FORGE_NATIVE_REQUESTED_REASONING };
    actual_identity: typeof FORGE_NATIVE_ACTUAL_UNREPORTED;
    actual_identity_attested: false;
    binding_sha256: string;
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

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const HEX = /^[a-f0-9]{64}$/;

export function isCanonicalAbsolutePath(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && !value.includes('\0')
        && path.isAbsolute(value) && path.resolve(value) === value
        && !value.split(path.sep).some((segment) => segment === '.' || segment === '..');
}

export function resolveActualIdentity(attestation: unknown): string {
    return typeof attestation === 'string' && attestation.trim()
        ? attestation.trim()
        : FORGE_NATIVE_ACTUAL_UNREPORTED;
}

export function assertIdentitySeparation(
    requested: { model: string; reasoning: string }, actual: unknown, attested: boolean,
): ForgeNativeIdentity {
    if (requested.model !== FORGE_NATIVE_REQUESTED_MODEL || requested.reasoning !== FORGE_NATIVE_REQUESTED_REASONING) {
        throw new ForgeNativeError('forge_native_requested_identity_policy_mismatch');
    }
    const identity = resolveActualIdentity(actual);
    if (identity !== FORGE_NATIVE_ACTUAL_UNREPORTED && attested !== true) {
        throw new ForgeNativeError('forge_native_actual_identity_unattested');
    }
    return {
        requested_model: FORGE_NATIVE_REQUESTED_MODEL,
        requested_reasoning: FORGE_NATIVE_REQUESTED_REASONING,
        actual_identity: identity,
        actual_identity_attested: identity !== FORGE_NATIVE_ACTUAL_UNREPORTED && attested === true,
    };
}

function stableValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
                .map(([key, item]) => [key, stableValue(item)]),
        );
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
    if (typeof value !== 'string' || !ID.test(value)) throw new ForgeNativeError(`forge_native_${name}_invalid`);
}

function assertDigest(value: unknown, name: string): asserts value is string {
    if (typeof value !== 'string' || !HEX.test(value)) throw new ForgeNativeError(`forge_native_${name}_invalid`);
}

function inside(candidate: string, parent: string): boolean {
    const relative = path.relative(parent, candidate);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function pathOverlap(left: string, right: string): boolean {
    const candidate = left.toLowerCase();
    const parent = right.toLowerCase();
    return inside(candidate, parent) || inside(parent, candidate);
}

function intersectPaths(...lists: string[][]): string[] {
    let current = uniqueSorted(lists[0] ?? []);
    for (const next of lists.slice(1)) {
        current = uniqueSorted(current.flatMap((left) => next.flatMap((right) => pathOverlap(left, right)
            ? [inside(left.toLowerCase(), right.toLowerCase()) ? left : right]
            : [])));
    }
    return current;
}

function assertPathList(name: string, values: string[], required: boolean): void {
    if (required && values.length === 0) throw new ForgeNativeError(`forge_native_${name}_scope_empty`);
    for (const value of values) {
        if (!isCanonicalAbsolutePath(value)) throw new ForgeNativeError(`forge_native_${name}_path_invalid`);
    }
}

function sameScalar(left: ForgeNativeAuthorityScope, right: ForgeNativeAuthorityScope): boolean {
    return left.decision_id === right.decision_id
        && left.set_batch_id === right.set_batch_id
        && left.connection_id === right.connection_id
        && (left.generation ?? FORGE_NATIVE_GENERATION) === (right.generation ?? FORGE_NATIVE_GENERATION)
        && left.request_id === right.request_id
        && left.request_sha256 === right.request_sha256
        && left.source_repository === right.source_repository
        && left.source_head === right.source_head
        && left.execution_root === right.execution_root
        && left.model_policy_sha256 === right.model_policy_sha256
        && stableNativeJson(left.retry_policy) === stableNativeJson(right.retry_policy)
        && left.cancellation_policy === right.cancellation_policy;
}

function assertSubset(name: string, child: string[], parent: string[]): void {
    if (name === 'effect') {
        if (child.some((item) => !parent.includes(item))) {
            throw new ForgeNativeError('forge_native_effect_scope_broader_than_authority');
        }
        return;
    }
    if (child.some((item) => !parent.some((allowed) => inside(item.toLowerCase(), allowed.toLowerCase())))) {
        throw new ForgeNativeError(`forge_native_${name}_scope_broader_than_authority`);
    }
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

export function intersectNativeAuthority(
    input: NativeAuthorityIntersectionInput,
): NativeAuthorityIntersectionResult {
    const records = [input.durable_set, input.immutable_request, input.connection_policy, input.run_lease];
    for (const record of records) {
        if (record.connection_id !== FORGE_NATIVE_CONNECTION_ID || !sameScalar(record, input.durable_set)) {
            throw new ForgeNativeError('forge_native_authority_scalar_mismatch');
        }
        assertId(record.decision_id, 'decision_id');
        assertId(record.set_batch_id, 'set_batch_id');
        assertId(record.request_id, 'request_id');
        assertDigest(record.request_sha256, 'request_sha256');
        assertDigest(record.model_policy_sha256, 'model_policy_sha256');
        assertPathList('read', record.read_allowlist, false);
        assertPathList('write', record.write_allowlist, true);
        assertPathList('test', record.test_allowlist, true);
        assertPathList('quarantine', record.quarantine_allowlist, false);
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
        generation: input.durable_set.generation ?? FORGE_NATIVE_GENERATION,
        read_allowlist: intersectPaths(...records.map((record) => record.read_allowlist)),
        write_allowlist: intersectPaths(...records.map((record) => record.write_allowlist)),
        test_allowlist: intersectPaths(...records.map((record) => record.test_allowlist)),
        quarantine_allowlist: intersectPaths(...records.map((record) => record.quarantine_allowlist)),
        effect_exclusions: uniqueSorted(records.flatMap((record) => record.effect_exclusions)),
    };
    if (!effective_scope.write_allowlist.length || !effective_scope.test_allowlist.length) {
        throw new ForgeNativeError('forge_native_authority_intersection_empty');
    }
    return { effective_scope, scope_sha256: hashNative(effective_scope) };
}

export function validateNativeCapabilities(capabilities: readonly string[]): void {
    const unknown = capabilities.filter((name) => !FORGE_NATIVE_CAPABILITIES.includes(name as ForgeNativeCapability));
    if (unknown.length) throw new ForgeNativeError(`forge_native_capability_unknown:${uniqueSorted(unknown).join(',')}`);
    const missing = FORGE_NATIVE_CAPABILITIES.filter((name) => !capabilities.includes(name));
    if (missing.length) throw new ForgeNativeError(`forge_native_capability_unavailable:${missing.join(',')}`);
}

function inspectPath(value: string, code: string): string {
    if (!isCanonicalAbsolutePath(value)) throw new ForgeNativeError(code);
    const stat = fs.lstatSync(value, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) throw new ForgeNativeError('forge_native_symlink_path_forbidden');
    if (stat?.isFile() && stat.nlink !== 1) throw new ForgeNativeError('forge_native_hardlink_path_forbidden');
    return value;
}

function validateWorkItems(items: ForgeNativeWorkItem[], scope: ForgeNativeAuthorityScope): string[] {
    const ids = new Set<string>();
    const keys = new Set<string>();
    const owned: string[] = [];
    for (const item of items) {
        assertId(item.work_item_id, 'work_item_id');
        assertId(item.idempotency_key, 'work_item_idempotency_key');
        if (ids.has(item.work_item_id) || keys.has(item.idempotency_key)) {
            throw new ForgeNativeError('forge_native_plan_duplicate_work_item');
        }
        ids.add(item.work_item_id);
        keys.add(item.idempotency_key);
        if (!item.useful) throw new ForgeNativeError('forge_native_plan_work_item_not_useful');
        for (const testPath of item.test_paths.map((value) => inspectPath(value, 'forge_native_plan_test_path_invalid'))) {
            if (!scope.test_allowlist.some((allowed) => inside(testPath.toLowerCase(), allowed.toLowerCase()))) {
                throw new ForgeNativeError('forge_native_plan_test_path_escape');
            }
        }
        for (const value of [...item.write_paths, ...item.output_paths]
            .map((entry) => inspectPath(entry, 'forge_native_plan_path_invalid'))) {
            if (!scope.write_allowlist.some((allowed) => inside(value.toLowerCase(), allowed.toLowerCase()))) {
                throw new ForgeNativeError('forge_native_plan_path_escape');
            }
            if (owned.some((prior) => pathOverlap(prior, value))) {
                throw new ForgeNativeError('forge_native_plan_path_overlap');
            }
            owned.push(value);
        }
    }
    return owned;
}

export type NativePlanValidationResult = { plan: ForgeNativePlan; plan_sha256: string };

export function validateNativePlan(plan: ForgeNativePlan, scope: ForgeNativeAuthorityScope): NativePlanValidationResult {
    if (plan.schema !== FORGE_NATIVE_PLAN_SCHEMA) throw new ForgeNativeError('forge_native_plan_schema_invalid');
    assertId(plan.run_id, 'run_id');
    assertId(plan.parent_task_id, 'parent_task_id');
    if (plan.work_items.length > 3) throw new ForgeNativeError('forge_native_plan_leaf_ceiling_exceeded');
    const indexes = plan.work_items.map((value) => value.leaf_index);
    if (indexes.some((value) => value === undefined)
        || new Set(indexes).size !== indexes.length
        || indexes.some((value, index) => value !== index)) {
        throw new ForgeNativeError('forge_native_plan_leaf_index_invalid');
    }
    validateWorkItems(plan.work_items, scope);
    for (const value of plan.expected_outputs
        .map((entry) => inspectPath(entry, 'forge_native_plan_expected_output_invalid'))) {
        if (!scope.write_allowlist.some((allowed) => inside(value.toLowerCase(), allowed.toLowerCase()))) {
            throw new ForgeNativeError('forge_native_plan_expected_output_escape');
        }
    }
    for (const value of plan.integration_paths
        .map((entry) => inspectPath(entry, 'forge_native_plan_integration_path_invalid'))) {
        if (!scope.write_allowlist.some((allowed) => inside(value.toLowerCase(), allowed.toLowerCase()))) {
            throw new ForgeNativeError('forge_native_plan_integration_path_escape');
        }
    }
    const digest = hashNative({ ...plan, plan_sha256: '' });
    if (plan.plan_sha256 && plan.plan_sha256 !== digest) throw new ForgeNativeError('forge_native_plan_digest_mismatch');
    return { plan: { ...plan, plan_sha256: digest }, plan_sha256: digest };
}
