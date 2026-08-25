import fs from 'node:fs';
import path from 'node:path';

import type {
    CodexHostWorkerHandoff,
    CodexHostWorkerJobContract,
} from '../../../types/worker_job.js';
import { parseForgeCodexHostWorkerHandoff } from './forge_host_worker_dispatch.js';
import { assertForgeHostPathIdentityBindings } from './forge_host_path_identity.js';

const HANDOFF_FILE = 'codex-host-worker-handoff.json';
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_HANDOFF_BYTES = 1024 * 1024;

export const CODEX_HOST_WORKER_CONSUMPTION_RECEIPT_SCHEMA =
    'cstar.forge_codex_host_worker_consumption_receipt.v1' as const;

export interface ForgeCodexHostWorkerExpectedReturnBinding {
    handoff_path: string;
    handoff_sha256: string;
    forge_request_receipt_id: string;
    execution_receipt_id: string;
    canonical_request_sha256: string;
    attempt_id: string;
    scope_sha256: string;
    bead_id?: string;
    decision_id?: string;
    job_id?: string;
    idempotency_key?: string;
    target_paths?: string[];
    output_paths?: string[];
}

export interface ConsumeForgeCodexHostWorkerHandoffInput {
    handoffPath: string;
    expectedReturnBinding?: Partial<ForgeCodexHostWorkerExpectedReturnBinding>;
    expectedHandoffSha256?: string;
    expectedRequestId?: string;
    expectedRequestSha256?: string;
    expectedExecutionReceiptId?: string;
    expectedAttemptId?: string;
    expectedScopeSha256?: string;
    expectedBeadId?: string;
    expectedDecisionId?: string;
    expectedJobId?: string;
    expectedIdempotencyKey?: string;
    expectedTargetPaths?: string[];
    expectedOutputPaths?: string[];
    controlRoot?: string;
}

export interface ForgeCodexHostWorkerConsumptionReceipt {
    schema: typeof CODEX_HOST_WORKER_CONSUMPTION_RECEIPT_SCHEMA;
    status: 'ready_for_host_execution';
    handoff_path: string;
    handoff_sha256: string;
    forge_request_receipt_id: string;
    execution_receipt_id: string;
    attempt_id: string;
    canonical_request_sha256: string;
    scope_sha256: string;
    runner_owner: 'codex-host';
    requested_model: 'gpt-5.6-luna';
    requested_reasoning: 'max';
    selector_status: 'enforced';
    actual_identity: string | null;
    transport: 'codex-host';
    provider_requests_started: 0;
    network_accessed: false;
    cognition_launch: false;
    cstar_launch: false;
    path_identity_revalidated: true;
    observed_at: number;
}

export interface ForgeCodexHostWorkerConsumptionResult {
    receipt: ForgeCodexHostWorkerConsumptionReceipt;
    job: CodexHostWorkerJobContract;
}

function fail(code: string): never {
    throw new Error(code);
}

function requiredText(value: unknown, missingCode: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) fail(missingCode);
    return value.trim();
}

function requiredPath(value: unknown, missingCode: string): string {
    if (typeof value !== 'string' || value.length === 0) fail(missingCode);
    if (value !== value.trim()) fail('forge_codex_host_handoff_path_mismatch');
    return value;
}

function requiredDigest(value: unknown, missingCode: string): string {
    const text = requiredText(value, missingCode);
    if (!DIGEST.test(text)) fail('forge_codex_host_consumer_binding_invalid');
    return text;
}

function sameIdentity(left: fs.Stats, right: fs.Stats): boolean {
    return String(left.dev) === String(right.dev)
        && String(left.ino) === String(right.ino)
        && left.nlink === right.nlink;
}

function currentUid(): number {
    if (typeof process.getuid !== 'function') fail('forge_codex_host_handoff_owner');
    return process.getuid();
}

function assertPrivateDirectory(directory: string): void {
    const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
    if (!stat) fail('forge_codex_host_handoff_parent_missing');
    if (stat.isSymbolicLink()) fail('forge_codex_host_handoff_symlink_forbidden');
    if (!stat.isDirectory()) fail('forge_codex_host_handoff_unsafe_type');
    if (stat.uid !== currentUid()) fail('forge_codex_host_handoff_owner');
    if ((stat.mode & 0o022) !== 0) fail('forge_codex_host_handoff_mode');
    if (fs.realpathSync(directory) !== directory) fail('forge_codex_host_handoff_symlink_forbidden');
}

function assertPrivateFile(stat: fs.Stats): void {
    if (stat.isSymbolicLink()) fail('forge_codex_host_handoff_symlink_forbidden');
    if (!stat.isFile()) fail('forge_codex_host_handoff_unsafe_type');
    if (stat.nlink !== 1) fail('forge_codex_host_handoff_link_count');
    if (stat.uid !== currentUid()) fail('forge_codex_host_handoff_owner');
    if ((stat.mode & 0o077) !== 0 || (stat.mode & 0o400) === 0) {
        fail('forge_codex_host_handoff_mode');
    }
    if (stat.size > MAX_HANDOFF_BYTES) fail('forge_codex_host_handoff_size');
}

function expectedControlRoot(handoffPath: string, supplied?: string): string {
    const derived = path.dirname(path.dirname(path.dirname(path.dirname(handoffPath))));
    if (!supplied) return derived;
    if (!path.isAbsolute(supplied) || path.resolve(supplied) !== supplied) {
        fail('forge_codex_host_handoff_path_mismatch');
    }
    if (path.join(supplied, 'work', 'forge-executions', path.basename(path.dirname(handoffPath)), HANDOFF_FILE) !== handoffPath) {
        fail('forge_codex_host_handoff_path_mismatch');
    }
    return supplied;
}

function assertHandoffPath(handoffPath: string, executionReceiptId: string, controlRoot?: string): void {
    if (!path.isAbsolute(handoffPath) || path.resolve(handoffPath) !== handoffPath) {
        fail('forge_codex_host_handoff_path_mismatch');
    }
    const executionDirectory = path.dirname(handoffPath);
    const forgeExecutionsDirectory = path.dirname(executionDirectory);
    const workDirectory = path.dirname(forgeExecutionsDirectory);
    if (path.basename(handoffPath) !== HANDOFF_FILE
        || path.basename(executionDirectory) !== executionReceiptId
        || path.basename(forgeExecutionsDirectory) !== 'forge-executions'
        || path.basename(workDirectory) !== 'work') {
        fail('forge_codex_host_handoff_path_mismatch');
    }
    const root = expectedControlRoot(handoffPath, controlRoot);
    const relative = path.relative(root, executionDirectory);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        fail('forge_codex_host_handoff_path_mismatch');
    }
    let current = root;
    assertPrivateDirectory(current);
    for (const segment of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        assertPrivateDirectory(current);
    }
}

function readHandoffNoFollow(handoffPath: string): string {
    const before = fs.lstatSync(handoffPath, { throwIfNoEntry: false });
    if (!before) fail('forge_codex_host_handoff_missing');
    assertPrivateFile(before);
    const noFollow = fs.constants.O_NOFOLLOW;
    if (!noFollow) fail('forge_codex_host_handoff_nofollow_unavailable');
    let descriptor: number | null = null;
    try {
        try {
            descriptor = fs.openSync(handoffPath, fs.constants.O_RDONLY | noFollow);
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') fail('forge_codex_host_handoff_missing');
            if (code === 'ELOOP') fail('forge_codex_host_handoff_symlink_forbidden');
            fail('forge_codex_host_handoff_unreadable');
        }
        const opened = fs.fstatSync(descriptor);
        assertPrivateFile(opened);
        if (!sameIdentity(before, opened)) fail('forge_codex_host_handoff_replaced_before_open');
        const content = fs.readFileSync(descriptor, 'utf8');
        const after = fs.fstatSync(descriptor);
        assertPrivateFile(after);
        if (!sameIdentity(opened, after) || opened.size !== after.size) {
            fail('forge_codex_host_handoff_changed_during_read');
        }
        return content;
    } finally {
        if (descriptor !== null) fs.closeSync(descriptor);
    }
}

function normalizedExpected(input: ConsumeForgeCodexHostWorkerHandoffInput): ForgeCodexHostWorkerExpectedReturnBinding {
    const supplied = input.expectedReturnBinding ?? {};
    const expected = {
        handoff_path: supplied.handoff_path ?? input.handoffPath,
        handoff_sha256: supplied.handoff_sha256 ?? input.expectedHandoffSha256,
        forge_request_receipt_id: supplied.forge_request_receipt_id ?? input.expectedRequestId,
        execution_receipt_id: supplied.execution_receipt_id ?? input.expectedExecutionReceiptId,
        canonical_request_sha256: supplied.canonical_request_sha256 ?? input.expectedRequestSha256,
        attempt_id: supplied.attempt_id ?? input.expectedAttemptId,
        scope_sha256: supplied.scope_sha256 ?? input.expectedScopeSha256,
        bead_id: supplied.bead_id ?? input.expectedBeadId,
        decision_id: supplied.decision_id ?? input.expectedDecisionId,
        job_id: supplied.job_id ?? input.expectedJobId,
        idempotency_key: supplied.idempotency_key ?? input.expectedIdempotencyKey,
        target_paths: supplied.target_paths ?? input.expectedTargetPaths,
        output_paths: supplied.output_paths ?? input.expectedOutputPaths,
    };
    return {
        handoff_path: requiredPath(expected.handoff_path, 'forge_codex_host_consumer_binding_missing'),
        handoff_sha256: requiredDigest(expected.handoff_sha256, 'forge_codex_host_consumer_binding_missing'),
        forge_request_receipt_id: requiredText(expected.forge_request_receipt_id, 'forge_codex_host_consumer_binding_missing'),
        execution_receipt_id: requiredText(expected.execution_receipt_id, 'forge_codex_host_consumer_binding_missing'),
        canonical_request_sha256: requiredDigest(expected.canonical_request_sha256, 'forge_codex_host_consumer_binding_missing'),
        attempt_id: requiredText(expected.attempt_id, 'forge_codex_host_consumer_binding_missing'),
        scope_sha256: requiredDigest(expected.scope_sha256, 'forge_codex_host_consumer_binding_missing'),
        ...(expected.bead_id ? { bead_id: requiredText(expected.bead_id, 'forge_codex_host_consumer_binding_invalid') } : {}),
        ...(expected.decision_id ? { decision_id: requiredText(expected.decision_id, 'forge_codex_host_consumer_binding_invalid') } : {}),
        ...(expected.job_id ? { job_id: requiredText(expected.job_id, 'forge_codex_host_consumer_binding_invalid') } : {}),
        ...(expected.idempotency_key ? { idempotency_key: requiredText(expected.idempotency_key, 'forge_codex_host_consumer_binding_invalid') } : {}),
        ...(expected.target_paths ? { target_paths: expected.target_paths } : {}),
        ...(expected.output_paths ? { output_paths: expected.output_paths } : {}),
    };
}

function assertOptionalArrayMatch(actual: string[] | undefined, expected: string[] | undefined): void {
    if (expected && (!actual || JSON.stringify(actual) !== JSON.stringify(expected))) {
        fail('forge_codex_host_handoff_binding_mismatch');
    }
}

function assertExpectedBinding(
    handoff: CodexHostWorkerHandoff,
    expected: ForgeCodexHostWorkerExpectedReturnBinding,
): void {
    const job = handoff.job;
    if (handoff.handoff_path !== expected.handoff_path || handoff.handoff_sha256 !== expected.handoff_sha256) {
        fail('forge_codex_host_handoff_binding_mismatch');
    }
    if (job.canonical_request_id !== expected.forge_request_receipt_id
        || job.canonical_request_sha256 !== expected.canonical_request_sha256
        || job.attempt_id !== expected.attempt_id
        || job.target_paths_sha256 !== expected.scope_sha256) {
        fail('forge_codex_host_handoff_binding_mismatch');
    }
    const binding = job.validation_ticket_binding;
    const request = job.validation_ticket_request;
    if (!binding || !request
        || binding.execution_receipt_id !== expected.execution_receipt_id
        || request.execution_receipt_id !== expected.execution_receipt_id
        || binding.attempt_id !== expected.attempt_id
        || request.attempt_id !== expected.attempt_id
        || binding.scope_sha256 !== expected.scope_sha256
        || request.scope_sha256 !== expected.scope_sha256) {
        fail('forge_codex_host_handoff_binding_mismatch');
    }
    if (expected.bead_id && job.bead_id !== expected.bead_id) fail('forge_codex_host_handoff_binding_mismatch');
    if (expected.decision_id && job.decision_id !== expected.decision_id) fail('forge_codex_host_handoff_binding_mismatch');
    if (expected.job_id && job.job_id !== expected.job_id) fail('forge_codex_host_handoff_binding_mismatch');
    if (expected.idempotency_key && job.idempotency_key !== expected.idempotency_key) fail('forge_codex_host_handoff_binding_mismatch');
    assertOptionalArrayMatch(job.target_paths, expected.target_paths);
    assertOptionalArrayMatch(job.output_paths, expected.output_paths);
}

function assertCurrentForgeHostJob(job: CodexHostWorkerJobContract): void {
    if (job.workflow_surface !== 'forge' || job.worker_kind !== 'forge'
        || job.runner_owner !== 'codex-host' || job.transport !== 'codex-host'
        || job.requested_model !== 'gpt-5.6-luna' || job.requested_reasoning !== 'max'
        || job.selector_status !== 'enforced' || job.host_launch_required !== true
        || job.actual_identity === 'unreported'
        || job.cognition_launch !== false || job.cstar_launch !== false
        || job.provider_requests_started !== 0 || job.spend_uncertain !== false
        || job.known_spend_observed !== false || job.network_accessed !== false
        || !job.project_root || !job.target_paths || !job.output_paths
        || !job.path_identity_bindings || !job.validation_ticket_binding
        || !job.validation_ticket_request) {
        fail('forge_codex_host_legacy_v2_forbidden');
    }
}

function assertExecutionWindow(job: CodexHostWorkerJobContract): void {
    const now = Date.now();
    if (now >= job.authorization_expires_at || now >= job.execution_deadline_at) {
        fail('forge_codex_host_execution_deadline_elapsed');
    }
}

export function consumeForgeCodexHostWorkerHandoff(
    input: ConsumeForgeCodexHostWorkerHandoffInput,
): ForgeCodexHostWorkerConsumptionResult {
    const expected = normalizedExpected(input);
    assertHandoffPath(expected.handoff_path, expected.execution_receipt_id, input.controlRoot);
    const content = readHandoffNoFollow(expected.handoff_path);
    let handoff: CodexHostWorkerHandoff;
    try {
        handoff = parseForgeCodexHostWorkerHandoff(JSON.parse(content));
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('forge_')) throw error;
        fail('forge_codex_host_handoff_malformed');
    }
    assertExpectedBinding(handoff, expected);
    assertCurrentForgeHostJob(handoff.job);
    assertExecutionWindow(handoff.job);
    // This is intentionally the final filesystem validation before the job is exposed.
    const pathIdentityBindings = handoff.job.path_identity_bindings;
    if (!pathIdentityBindings) fail('forge_codex_host_legacy_v2_forbidden');
    assertForgeHostPathIdentityBindings(pathIdentityBindings);
    const receipt: ForgeCodexHostWorkerConsumptionReceipt = {
        schema: CODEX_HOST_WORKER_CONSUMPTION_RECEIPT_SCHEMA,
        status: 'ready_for_host_execution',
        handoff_path: expected.handoff_path,
        handoff_sha256: expected.handoff_sha256,
        forge_request_receipt_id: expected.forge_request_receipt_id,
        execution_receipt_id: expected.execution_receipt_id,
        attempt_id: expected.attempt_id,
        canonical_request_sha256: expected.canonical_request_sha256,
        scope_sha256: expected.scope_sha256,
        runner_owner: 'codex-host',
        requested_model: 'gpt-5.6-luna',
        requested_reasoning: 'max',
        selector_status: 'enforced',
        actual_identity: handoff.job.actual_identity,
        transport: 'codex-host',
        provider_requests_started: 0,
        network_accessed: false,
        cognition_launch: false,
        cstar_launch: false,
        path_identity_revalidated: true,
        observed_at: Date.now(),
    };
    return { receipt, job: handoff.job };
}
