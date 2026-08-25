import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

import type {
    CodexHostPathIdentity,
    CodexHostWorkerJobContract,
    ExecutableWorkerJobContract,
} from '../../../types/worker_job.js';
import {
    normalizeCodexHostWorkerJobContract,
} from './worker_job_validation.js';
import {
    createWorkerJob,
    reserveWorkerJobDispatch,
} from './worker_job_ledger.js';
import { WorkerJobLedgerError } from './worker_job_errors.js';
import {
    ensureSafeDirectoryTree,
    publishPrivateFileNoClobber,
    assertSafePrivateArtifact,
} from '../../cstar-kernel-mcp/tools/forge_adapter_artifacts.js';
import {
    RESEARCHER_NATIVE_HANDOFF_SCHEMA,
    researcherNativeHandoffSchema,
    researcherNativeWorkPackageSchema,
    type ResearcherNativeHandoff,
    type ResearcherNativeWorkPackage,
} from '../../cstar-kernel-mcp/contracts/researcher_host_completion.js';

const HANDOFF_FILE = 'codex-host-researcher-handoff.json';

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]));
}

export function stableResearcherJson(value: unknown): string {
    return JSON.stringify(stable(value));
}

function existingParent(value: string): string {
    let current = path.resolve(value);
    while (true) {
        const stat = fs.lstatSync(current, { throwIfNoEntry: false });
        if (stat) {
            if (stat.isSymbolicLink()) throw new Error('researcher_host_path_symlink');
            if (!stat.isDirectory()) current = path.dirname(current);
            return current;
        }
        const parent = path.dirname(current);
        if (parent === current) throw new Error('researcher_host_path_parent_missing');
        current = parent;
    }
}

function pathIdentity(value: string): CodexHostPathIdentity {
    if (!path.isAbsolute(value) || path.resolve(value) !== value) {
        throw new Error('researcher_host_path_not_canonical');
    }
    const parentPath = existingParent(path.dirname(value));
    const parentStat = fs.lstatSync(parentPath);
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
        throw new Error('researcher_host_path_parent_invalid');
    }
    const parentResolved = fs.realpathSync(parentPath);
    if (parentResolved !== parentPath) throw new Error('researcher_host_path_parent_noncanonical');
    const parentDevice = String(parentStat.dev);
    const parentInode = String(parentStat.ino);
    const stat = fs.lstatSync(value, { throwIfNoEntry: false });
    if (!stat) {
        const suffix: string[] = [];
        let current = value;
        while (!fs.lstatSync(current, { throwIfNoEntry: false })) {
            suffix.unshift(path.basename(current));
            const parent = path.dirname(current);
            if (parent === current) throw new Error('researcher_host_path_uninspectable');
            current = parent;
        }
        return {
            path: value, state: 'missing', resolved_path: null, device: null, inode: null,
            nlink: null, parent_path: parentPath, parent_resolved_path: parentResolved,
            parent_device: parentDevice, parent_inode: parentInode, missing_suffix: suffix,
        };
    }
    if (stat.isSymbolicLink() || fs.realpathSync(value) !== value) {
        throw new Error('researcher_host_path_identity_invalid');
    }
    if (!stat.isFile() && !stat.isDirectory()) throw new Error('researcher_host_path_type_invalid');
    return {
        path: value,
        state: stat.isFile() ? 'file' : 'directory',
        resolved_path: value,
        device: String(stat.dev),
        inode: String(stat.ino),
        nlink: stat.isFile() ? stat.nlink : null,
        parent_path: parentPath,
        parent_resolved_path: parentResolved,
        parent_device: parentDevice,
        parent_inode: parentInode,
        missing_suffix: [],
    };
}

function expectedArtifacts(packageValue: ResearcherNativeWorkPackage) {
    return packageValue.expected_artifacts.map((artifact) => ({
        name: artifact.name,
        artifact_kind: 'report' as const,
        required: true as const,
    }));
}

function executableContract(
    packageValue: ResearcherNativeWorkPackage,
    jobId: string,
    now: number,
): ExecutableWorkerJobContract {
    const attemptId = packageValue.attempt_id;
    const zeroEvidence = sha256(`${packageValue.request_id}\n${attemptId}\nzero`);
    return {
        worker_kind: 'researcher',
        bead_id: packageValue.bead_id,
        decision_id: packageValue.decision_id,
        canonical_request_id: packageValue.request_id,
        canonical_request_sha256: packageValue.request_sha256,
        authorization_id: packageValue.authorization_id,
        authorization_expires_at: packageValue.authorization_expires_at,
        adapter_runtime_binding_sha256: packageValue.adapter_sha256,
        idempotency_key: packageValue.idempotency_key,
        execution_deadline_at: packageValue.authorization_expires_at,
        attempt_id: attemptId,
        objective: packageValue.objective,
        expected_artifacts: expectedArtifacts(packageValue),
        provider_evidence: {
            attempt_id: attemptId, provider_started: false,
            provider_requests_started: 0, observed_at: now, evidence_sha256: zeroEvidence,
        },
        spend_evidence: {
            attempt_id: attemptId, spend_uncertain: false,
            known_spend_observed: false, observed_at: now,
            evidence_sha256: sha256(`${packageValue.request_id}\n${attemptId}\nspend-zero`),
        },
    };
}

function buildHostJob(
    packageValue: ResearcherNativeWorkPackage,
    jobId: string,
): CodexHostWorkerJobContract {
    const pathBindings = packageValue.output_paths.map(pathIdentity);
    const base = {
        schema: 'cstar.codex_host_worker_job.v2',
        worker_kind: 'researcher', workflow_surface: 'researcher',
        bead_id: packageValue.bead_id, decision_id: packageValue.decision_id,
        canonical_request_id: packageValue.request_id,
        canonical_request_sha256: packageValue.request_sha256,
        authorization_id: packageValue.authorization_id,
        authorization_expires_at: packageValue.authorization_expires_at,
        runner_owner: 'codex-host', requested_model: 'gpt-5.6-luna', requested_reasoning: 'max',
        selector_status: 'enforced', actual_identity: packageValue.selector.actual_identity,
        transport: 'codex-host', cognition_launch: false, cstar_launch: false,
        provider_requests_started: 0, spend_uncertain: false, known_spend_observed: false,
        network_accessed: false, idempotency_key: packageValue.idempotency_key,
        execution_deadline_at: packageValue.authorization_expires_at,
        attempt_id: packageValue.attempt_id, objective: packageValue.objective,
        expected_artifacts: expectedArtifacts(packageValue),
        job_id: jobId, host_launch_required: true,
        project_root: packageValue.output_root,
        target_paths: packageValue.output_paths,
        output_paths: packageValue.output_paths,
        target_paths_sha256: sha256(JSON.stringify(packageValue.output_paths)),
        path_identity_bindings: pathBindings,
    };
    return normalizeCodexHostWorkerJobContract({
        ...base, dispatch_receipt_sha256: dispatchReceiptHash(base),
    });
}

function dispatchReceiptHash(job: unknown): string {
    const unsigned = job && typeof job === 'object'
        ? Object.fromEntries(Object.entries(job as Record<string, unknown>)
            .filter(([key]) => key !== 'dispatch_receipt_sha256')) : job;
    return sha256(stableResearcherJson(unsigned));
}

function handoffHash(workPackage: ResearcherNativeWorkPackage, job?: unknown): string {
    return sha256(stableResearcherJson({
        schema: RESEARCHER_NATIVE_HANDOFF_SCHEMA, work_package: workPackage,
        ...(job ? { job } : {}),
    }));
}

function destinationFor(controlRoot: string, requestId: string, idempotencyKey: string): string {
    const execution = `researcher-execute-${sha256(`${requestId}\n${idempotencyKey}`).slice(0, 32)}`;
    if (!/^[A-Za-z0-9._-]+$/.test(execution)) throw new Error('researcher_host_execution_id_invalid');
    return path.join(controlRoot, 'work', 'researcher-native-executions', execution, HANDOFF_FILE);
}

function readExisting(destination: string): ResearcherNativeHandoff | null {
    if (!fs.lstatSync(destination, { throwIfNoEntry: false })) return null;
    assertSafePrivateArtifact(destination);
    let parsed: unknown;
    try { parsed = JSON.parse(fs.readFileSync(destination, 'utf8')); } catch {
        throw new Error('researcher_host_handoff_malformed');
    }
    const result = researcherNativeHandoffSchema.safeParse(parsed);
    if (!result.success) throw new Error('researcher_host_handoff_malformed');
    if (result.data.handoff_path !== destination
        || result.data.job.dispatch_receipt_sha256 !== dispatchReceiptHash(result.data.job)
        || result.data.handoff_sha256 !== handoffHash(result.data.work_package, result.data.job)) {
        throw new Error('researcher_host_handoff_hash_mismatch');
    }
    return result.data;
}

function equivalentPackage(left: ResearcherNativeWorkPackage, right: ResearcherNativeWorkPackage): boolean {
    return stableResearcherJson(left) === stableResearcherJson(right);
}

export interface ResearcherNativeDispatchInput {
    controlRoot: string;
    db: Database.Database;
    workPackage: ResearcherNativeWorkPackage;
    hostOwnerId?: string;
    leaseDurationMs?: number;
    now?: number;
}

export interface ResearcherNativeDispatchResult {
    handoff: ResearcherNativeHandoff;
    job_id: string;
    attempt_id: string;
    dispatch_id: string;
    lease_token: string | null;
    replayed: boolean;
}

export function dispatchResearcherNativeWorker(
    input: ResearcherNativeDispatchInput,
): ResearcherNativeDispatchResult {
    const parsed = researcherNativeWorkPackageSchema.safeParse(input.workPackage);
    if (!parsed.success) throw new Error('researcher_native_work_package_invalid');
    const packageValue = parsed.data;
    const now = input.now ?? Date.now();
    if (!Number.isSafeInteger(now) || now < 0 || packageValue.authorization_expires_at <= now) {
        throw new Error('researcher_native_authorization_expired');
    }
    const destination = destinationFor(input.controlRoot, packageValue.request_id, packageValue.idempotency_key);
    const existing = readExisting(destination);
    if (existing) {
        if (!equivalentPackage(existing.work_package, packageValue)) {
            throw new Error('researcher_native_handoff_duplicate_conflict');
        }
        const jobId = existing.work_package.job_id;
        const job = existing.job;
        const resolvedJobId = job.job_id ?? jobId;
        return {
            handoff: { ...existing, status: 'replayed' }, job_id: resolvedJobId,
            attempt_id: job.attempt_id,
            dispatch_id: `worker-dispatch-${sha256(resolvedJobId).slice(0, 32)}`,
            lease_token: null, replayed: true,
        };
    }
    const provisionalJobId = `worker-job-${sha256(`${packageValue.request_id}\n${packageValue.idempotency_key}`).slice(0, 32)}`;
    const contract = executableContract(packageValue, provisionalJobId, now);
    const created = createWorkerJob(input.db, contract, now);
    const jobId = created.job.job_id;
    const hostJob = buildHostJob(packageValue, jobId);
    const reservation = created.job.state === 'QUEUED'
        ? reserveWorkerJobDispatch(
            input.db, jobId, input.hostOwnerId ?? 'codex-host-researcher',
            input.leaseDurationMs ?? 900_000, now,
        ) : null;
    const finalPackage = researcherNativeWorkPackageSchema.parse({
        ...packageValue, job_id: jobId,
    });
    if (hostJob.job_id !== jobId) throw new WorkerJobLedgerError(
        'WORKER_JOB_CONTRACT_INVALID', 'Researcher host job identity drifted.',
    );
    const handoff: ResearcherNativeHandoff = {
        schema: RESEARCHER_NATIVE_HANDOFF_SCHEMA,
        status: 'queued', work_package: finalPackage,
        job: hostJob,
        handoff_sha256: handoffHash(finalPackage, hostJob), handoff_path: destination,
        host_launch_required: true, cstar_launch: false, provider_attempted: false,
    };
    const parsedHandoff = researcherNativeHandoffSchema.parse(handoff);
    const directory = ensureSafeDirectoryTree(input.controlRoot, path.dirname(destination));
    publishPrivateFileNoClobber(directory, destination, `${stableResearcherJson(parsedHandoff)}\n`);
    const consumed = readExisting(destination);
    if (!consumed) throw new Error('researcher_host_handoff_missing_after_publish');
    return {
        handoff: consumed, job_id: jobId, attempt_id: finalPackage.attempt_id,
        dispatch_id: reservation?.dispatch_id ?? `worker-dispatch-${sha256(jobId).slice(0, 32)}`,
        lease_token: reservation?.lease_token ?? null, replayed: false,
    };
}

export function parseResearcherNativeHandoff(value: unknown): ResearcherNativeHandoff {
    const parsed = researcherNativeHandoffSchema.safeParse(value);
    if (!parsed.success) throw new Error('researcher_host_handoff_malformed');
    if (parsed.data.handoff_sha256 !== handoffHash(parsed.data.work_package, parsed.data.job)) {
        throw new Error('researcher_host_handoff_hash_mismatch');
    }
    if (parsed.data.job.dispatch_receipt_sha256 !== dispatchReceiptHash(parsed.data.job)) {
        throw new Error('researcher_host_job_hash_mismatch');
    }
    return parsed.data;
}

export function researcherNativeHandoffPath(
    controlRoot: string,
    requestId: string,
    idempotencyKey: string,
): string {
    return destinationFor(controlRoot, requestId, idempotencyKey);
}

export { handoffHash as researcherNativeHandoffHash };
