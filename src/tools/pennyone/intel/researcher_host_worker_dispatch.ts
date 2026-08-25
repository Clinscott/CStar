import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

import type { DispatchRequestArgs } from '../../cstar-kernel-mcp/tools/dispatch_request.js';
import { resolveDispatchActionAuthority } from '../../cstar-kernel-mcp/tools/dispatch_action_authority.js';
import {
    researcherAdapterBindingSchema,
    researcherAuthorityBindingSchema,
    researcherNativeWorkPackageSchema,
    researcherRequestSchema,
    type ResearcherRequestInput,
} from '../../cstar-kernel-mcp/contracts/researcher_host_completion.js';
import {
    codexHostWorkerJobContractSchema,
} from '../../cstar-kernel-mcp/contracts/worker_jobs.js';
import type {
    CodexHostWorkerJobContract,
    ExecutableWorkerJobContract,
    ResearcherNativeHostWorkerHandoff,
} from '../../../types/worker_job.js';
import { createWorkerJob, reserveWorkerJobDispatch } from './worker_job_ledger.js';
import { normalizeResearcherHostWorkerJobContract, sha256 } from './worker_job_validation.js';

const REQUEST_ID = /^researcher-request-v2-[a-f0-9]{32}$/;
const HANDOFF_FILE = 'codex-host-worker-handoff.json';
const UNBOUND_HASH = sha256('cstar.researcher.native.unbound');

export function stableResearcherValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableResearcherValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stableResearcherValue(item)]));
    }
    return value;
}

export function stableResearcherJson(value: unknown): string {
    return `${JSON.stringify(stableResearcherValue(value))}\n`;
}

export function researcherDigest(value: unknown): string {
    return crypto.createHash('sha256').update(stableResearcherJson(value), 'utf8').digest('hex');
}

function canonicalRequestProjection(value: ResearcherRequestInput): Record<string, unknown> {
    const { request_id: _requestId, request_sha256: _requestSha256, ...projection } = value;
    return projection;
}

export function hashResearcherRequest(value: ResearcherRequestInput): string {
    return researcherDigest(canonicalRequestProjection(value));
}

export function buildResearcherRequestId(requestSha256: string): string {
    if (!/^[a-f0-9]{64}$/.test(requestSha256)) throw new Error('CSTAR_RESEARCHER_REQUEST_INVALID');
    return `researcher-request-v2-${requestSha256.slice(0, 32)}`;
}

function boundedId(value: string, fallback: string): string {
    const normalized = value.trim().replace(/[^A-Za-z0-9._:/-]+/g, '-').replace(/^-+|-+$/g, '');
    return (normalized || fallback).slice(0, 192);
}

function noSpendHash(mode: string): string {
    return researcherDigest({ schema: 'cstar.researcher_authorization.v1', mode });
}

export interface ResearcherAuthorizationInput {
    set_id: string;
    authorization_id: string;
    authorization_sha256: string;
    authorization_expires_at: number;
}

export interface ResearcherAdapterBindingInput {
    adapter_id: 'cstar.researcher_preserved_adapter.v1';
    adapter_sha256: string;
    selected_source_manifest_sha256: string;
    callable_policy_sha256: string;
}

export interface ResearcherRequestBuildOptions {
    decision_id?: string;
    authorization?: ResearcherAuthorizationInput;
    adapter_binding?: ResearcherAdapterBindingInput;
    output_root?: string | null;
    now?: number;
}

function defaultAdapterBinding(): ResearcherAdapterBindingInput {
    return {
        adapter_id: 'cstar.researcher_preserved_adapter.v1',
        adapter_sha256: UNBOUND_HASH,
        selected_source_manifest_sha256: UNBOUND_HASH,
        callable_policy_sha256: UNBOUND_HASH,
    };
}

function expectedArtifacts(args: DispatchRequestArgs) {
    const names = [...new Set((args.artifact_expectations ?? [])
        .map((value) => value.trim()).filter(Boolean))];
    return (names.length ? names : ['researcher-report']).map((name) => ({
        name: name.replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 128) || 'researcher-report',
        artifact_kind: 'report' as const,
        required: true as const,
    }));
}

function requestIdempotencyKey(args: DispatchRequestArgs, decisionId: string): string {
    if (args.idempotency_key?.trim()) return boundedId(args.idempotency_key, 'researcher-idempotency');
    const seed = researcherDigest({ bead_id: args.bead_id ?? null, decision_id: decisionId,
        objective: args.objective, scope: args.scope, prompt: args.prompt ?? null });
    return `researcher-idempotency-${seed.slice(0, 32)}`;
}

export function buildResearcherRequest(
    args: DispatchRequestArgs,
    options: ResearcherRequestBuildOptions = {},
): ResearcherRequestInput {
    const now = options.now ?? Date.now();
    const decisionId = boundedId(options.decision_id ?? args.decision_id ?? '', 'researcher-decision');
    const setId = options.authorization?.set_id
        ?? `set:researcher:${boundedId(args.bead_id ?? decisionId, 'request')}`;
    const authorization = options.authorization ?? {
        set_id: setId,
        authorization_id: `authorization:researcher:no-spend-${researcherDigest({ decisionId }).slice(0, 24)}`,
        authorization_sha256: noSpendHash(args.spend_policy.mode),
        authorization_expires_at: Math.floor(now / 86_400_000) * 86_400_000 + 172_800_000,
    };
    const adapter = options.adapter_binding ?? defaultAdapterBinding();
    const sourceLive = args.spend_policy.live_source_allowed === true;
    const sourceGrants = sourceLive ? [] : [];
    const outputRoot = options.output_root ?? null;
    const actionAuthority = resolveDispatchActionAuthority(args);
    if (actionAuthority.primary_action === 'project_files') {
        throw new Error('CSTAR_RESEARCHER_LEGACY_ROUTE_FORBIDDEN');
    }
    const base: ResearcherRequestInput = {
        schema: 'cstar.researcher_request.v2',
        contract_version: 'v2',
        bead_id: boundedId(args.bead_id ?? '', 'researcher-bead'),
        set_id: boundedId(authorization.set_id, setId),
        decision_id: decisionId,
        authorization_id: boundedId(authorization.authorization_id, 'researcher-authorization'),
        authorization_sha256: authorization.authorization_sha256,
        authorization_expires_at: authorization.authorization_expires_at,
        source_callback_thread_id: args.source_callback_thread_id,
        objective: args.objective.trim(),
        research_questions: [args.prompt?.trim() || args.objective.trim()],
        target_spokes: [args.scope.trim()],
        primary_requested_action: 'report',
        source_grants: sourceGrants,
        source_budget: { max_queries: 0, max_items: 0, max_tool_calls: 0, max_provider_requests: 0 },
        spend_policy: { mode: sourceLive ? 'live_authorized' : 'no_spend', live_source_allowed: sourceLive, max_retries: 0 },
        retry_policy: { budget: 0, spent: 0, repairs: 0, replays: 0, fallbacks: 0 },
        selector: { requested_model: 'gpt-5.6-luna', requested_reasoning: 'max', selector_status: 'enforced', actual_identity: 'unreported' },
        adapter_binding: adapter,
        output_boundary: { root: outputRoot, allowed_paths: [], public_artifact_paths: [] },
        expected_artifacts: expectedArtifacts(args),
        metrics: (args.required_metrics ?? []).map((metric) => ({
            name: metric.name.trim(), threshold: metric.threshold.trim(),
            ...(metric.acceptance_rule ? { acceptance_rule: metric.acceptance_rule.trim() } : {}),
            ...(metric.unit ? { unit: metric.unit.trim() } : {}),
        })),
        prohibitions: [...new Set((args.prohibited_actions ?? []).map((value) => value.trim()).filter(Boolean))],
        idempotency_key: requestIdempotencyKey(args, decisionId),
    };
    const requestSha256 = hashResearcherRequest(base);
    const request = researcherRequestSchema.parse({ ...base,
        request_id: buildResearcherRequestId(requestSha256), request_sha256: requestSha256 });
    return request;
}

export function buildResearcherAuthorityBinding(request: ResearcherRequestInput) {
    const requestSha256 = request.request_sha256 ?? hashResearcherRequest(request);
    const requestId = request.request_id ?? buildResearcherRequestId(requestSha256);
    return researcherAuthorityBindingSchema.parse({
        schema: 'cstar.researcher_authority_binding.v1',
        request_id: requestId,
        request_sha256: requestSha256,
        bead_id: request.bead_id,
        set_id: request.set_id,
        decision_id: request.decision_id,
        authorization_id: request.authorization_id,
        authorization_sha256: request.authorization_sha256,
        expires_at: request.authorization_expires_at,
        action: 'report',
        one_use: true,
    });
}

function zeroEvidence(attemptId: string, label: string, now: number) {
    return { attempt_id: attemptId, provider_started: false, provider_requests_started: 0,
        observed_at: now, evidence_sha256: researcherDigest({ attemptId, label, value: 0 }) };
}

export function buildResearcherLedgerContract(
    request: ResearcherRequestInput,
    attemptId: string,
    now = Date.now(),
): ExecutableWorkerJobContract {
    const requestSha256 = request.request_sha256 ?? hashResearcherRequest(request);
    return {
        worker_kind: 'researcher', bead_id: request.bead_id, decision_id: request.decision_id,
        canonical_request_id: request.request_id ?? buildResearcherRequestId(requestSha256),
        canonical_request_sha256: requestSha256, authorization_id: request.authorization_id,
        authorization_expires_at: request.authorization_expires_at,
        adapter_runtime_binding_sha256: researcherDigest(request.adapter_binding),
        idempotency_key: request.idempotency_key, execution_deadline_at: request.authorization_expires_at,
        attempt_id: attemptId, objective: request.objective, expected_artifacts: request.expected_artifacts,
        provider_evidence: zeroEvidence(attemptId, 'provider', now),
        spend_evidence: { attempt_id: attemptId, spend_uncertain: false, known_spend_observed: false,
            observed_at: now, evidence_sha256: researcherDigest({ attemptId, label: 'spend', value: 0 }) },
    };
}

function researcherJobBase(request: ResearcherRequestInput, jobId: string, attemptId: string): Record<string, unknown> {
    const binding = request.adapter_binding;
    return {
        schema: 'cstar.codex_host_worker_job.v2', worker_kind: 'researcher', workflow_surface: 'researcher',
        bead_id: request.bead_id, decision_id: request.decision_id,
        canonical_request_id: request.request_id, canonical_request_sha256: request.request_sha256,
        authorization_id: request.authorization_id, authorization_expires_at: request.authorization_expires_at,
        runner_owner: 'codex-host', requested_model: 'gpt-5.6-luna', requested_reasoning: 'max',
        selector_status: 'enforced', actual_identity: null, transport: 'codex-host', cognition_launch: false,
        cstar_launch: false, provider_requests_started: 0, spend_uncertain: false, known_spend_observed: false,
        network_accessed: false, idempotency_key: request.idempotency_key,
        execution_deadline_at: request.authorization_expires_at, attempt_id: attemptId,
        objective: request.objective, expected_artifacts: request.expected_artifacts, job_id: jobId,
        host_launch_required: true, set_id: request.set_id, researcher_request_sha256: request.request_sha256,
        adapter_id: binding.adapter_id, adapter_sha256: binding.adapter_sha256,
        selected_source_manifest_sha256: binding.selected_source_manifest_sha256,
        callable_policy_sha256: binding.callable_policy_sha256,
        source_grants_sha256: researcherDigest(request.source_grants),
        source_budget_sha256: researcherDigest(request.source_budget),
        output_boundary_sha256: researcherDigest(request.output_boundary),
        max_host_attempts: 1, max_descendants: 0, max_peer_messages: 0,
        max_retries: 0, max_replays: 0, max_fallbacks: 0,
    };
}

export function buildResearcherHostWorkerJob(
    request: ResearcherRequestInput,
    jobId: string,
    attemptId: string,
): CodexHostWorkerJobContract {
    const base = researcherJobBase(request, jobId, attemptId);
    return normalizeResearcherHostWorkerJobContract({
        ...base,
        dispatch_receipt_sha256: researcherDigest(base),
    } as CodexHostWorkerJobContract);
}

export function researcherHandoffHash(
    workPackage: Record<string, unknown>,
    job: CodexHostWorkerJobContract,
): string {
    return researcherDigest({ schema: 'cstar.researcher_native_host_worker_handoff.v1', work_package: workPackage, job });
}

function handoffPath(controlRoot: string, requestId: string): string {
    if (!path.isAbsolute(controlRoot) || path.resolve(controlRoot) !== controlRoot || !REQUEST_ID.test(requestId)) {
        throw new Error('CSTAR_RESEARCHER_PATH_IDENTITY_MISMATCH');
    }
    return path.join(controlRoot, 'work', 'researcher-executions', requestId, HANDOFF_FILE);
}

export function researcherHostWorkerHandoffPath(controlRoot: string, requestId: string): string {
    return handoffPath(controlRoot, requestId);
}

function ensureDirectory(root: string, destination: string): void {
    if (!fs.existsSync(root)) throw new Error('CSTAR_RESEARCHER_OUTPUT_MANIFEST_MISMATCH');
    const rootStat = fs.lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('CSTAR_RESEARCHER_PATH_IDENTITY_MISMATCH');
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    let current = path.dirname(destination);
    while (current !== root) {
        const stat = fs.lstatSync(current);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('CSTAR_RESEARCHER_PATH_IDENTITY_MISMATCH');
        current = path.dirname(current);
    }
}

function readHandoff(destination: string): ResearcherNativeHostWorkerHandoff | null {
    const stat = fs.lstatSync(destination, { throwIfNoEntry: false });
    if (!stat) return null;
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('CSTAR_RESEARCHER_PATH_IDENTITY_MISMATCH');
    let parsed: unknown;
    try { parsed = JSON.parse(fs.readFileSync(destination, 'utf8')); } catch { throw new Error('CSTAR_RESEARCHER_OUTPUT_MANIFEST_MISMATCH'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('CSTAR_RESEARCHER_OUTPUT_MANIFEST_MISMATCH');
    const candidate = parsed as ResearcherNativeHostWorkerHandoff;
    const computed = researcherHandoffHash(candidate.work_package, candidate.job);
    if (candidate.schema !== 'cstar.researcher_native_host_worker_handoff.v1'
        || candidate.handoff_sha256 !== computed || candidate.host_launch_required !== true
        || candidate.cstar_launch !== false || candidate.provider_attempted !== false) {
        throw new Error('CSTAR_RESEARCHER_OUTPUT_MANIFEST_MISMATCH');
    }
    return candidate;
}

export function readResearcherHostWorkerHandoff(
    controlRoot: string,
    requestId: string,
): ResearcherNativeHostWorkerHandoff {
    const handoff = readHandoff(handoffPath(controlRoot, requestId));
    if (!handoff) throw new Error('CSTAR_RESEARCHER_HANDOFF_NOT_FOUND');
    return handoff;
}

function sameHandoffInputs(left: ResearcherNativeHostWorkerHandoff, right: ResearcherNativeHostWorkerHandoff): boolean {
    return left.request_sha256 === right.request_sha256
        && left.handoff_sha256 === right.handoff_sha256
        && stableResearcherJson(left.work_package) === stableResearcherJson(right.work_package)
        && stableResearcherJson(left.job) === stableResearcherJson(right.job);
}

export function persistResearcherHostWorkerHandoff(
    controlRoot: string,
    workPackage: Record<string, unknown>,
    job: CodexHostWorkerJobContract,
    leaseToken?: string,
): { handoff: ResearcherNativeHostWorkerHandoff; replayed: boolean } {
    const requestId = String(workPackage.request_id ?? '');
    const destination = handoffPath(controlRoot, requestId);
    ensureDirectory(controlRoot, destination);
    const existing = readHandoff(destination);
    const hash = researcherHandoffHash(workPackage, job);
    if (existing) {
        const candidate: ResearcherNativeHostWorkerHandoff = {
            ...existing, request_sha256: String(workPackage.request_sha256),
            job, work_package: workPackage, handoff_sha256: hash, handoff_path: destination,
        };
        if (!sameHandoffInputs(existing, candidate)) throw new Error('CSTAR_RESEARCHER_COMPLETION_REPLAY_CONFLICT');
        return { handoff: { ...existing, status: 'replayed' }, replayed: true };
    }
    const queued: ResearcherNativeHostWorkerHandoff = {
        schema: 'cstar.researcher_native_host_worker_handoff.v1', status: 'queued',
        request_sha256: String(workPackage.request_sha256), work_package: workPackage, job,
        handoff_sha256: hash, handoff_path: destination, host_launch_required: true,
        cstar_launch: false, provider_attempted: false, ...(leaseToken ? { lease_token: leaseToken } : {}),
    };
    let fd: number | undefined;
    try {
        fd = fs.openSync(destination, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
        fs.writeFileSync(fd, stableResearcherJson(queued));
        fs.closeSync(fd); fd = undefined;
        const persisted = readHandoff(destination);
        if (!persisted) throw new Error('CSTAR_RESEARCHER_OUTPUT_MANIFEST_MISMATCH');
        return { handoff: persisted, replayed: false };
    } catch (error) {
        if (fd !== undefined) try { fs.closeSync(fd); } catch { /* preserve original error */ }
        const raced = readHandoff(destination);
        if (raced && sameHandoffInputs(raced, queued)) return { handoff: { ...raced, status: 'replayed' }, replayed: true };
        throw error;
    }
}

export interface ResearcherHostDispatchOptions extends ResearcherRequestBuildOptions {
    db?: Database.Database;
    control_root?: string;
    host_owner_id?: string;
}

export function dispatchResearcherHostWorker(
    args: DispatchRequestArgs,
    options: ResearcherHostDispatchOptions = {},
): { request: ResearcherRequestInput; work_package: Record<string, unknown>; job: CodexHostWorkerJobContract; handoff?: ResearcherNativeHostWorkerHandoff; replayed: boolean } {
    const request = buildResearcherRequest(args, options);
    if (request.selector.selector_status !== 'enforced') throw new Error('CSTAR_RESEARCHER_SELECTOR_UNENFORCED');
    const requestSha256 = request.request_sha256!;
    const attemptId = `researcher-attempt-${requestSha256.slice(0, 32)}`;
    let jobId = `researcher-host-job-${requestSha256.slice(0, 32)}`;
    let leaseToken: string | undefined;
    let replayed = false;
    if (options.db) {
        const created = createWorkerJob(options.db, buildResearcherLedgerContract(request, attemptId, options.now), options.now);
        jobId = created.job.job_id;
        replayed = created.deduplicated;
        if (!created.deduplicated) {
            const reservation = reserveWorkerJobDispatch(
                options.db, jobId, options.host_owner_id ?? 'codex-host-researcher', 900_000, options.now,
            );
            leaseToken = reservation.lease_token;
        }
    }
    const job = buildResearcherHostWorkerJob(request, jobId, attemptId);
    const authority = buildResearcherAuthorityBinding(request);
    const workPackage = researcherNativeWorkPackageSchema.parse({
        schema: 'cstar.researcher_native_work_package.v1', request_id: request.request_id,
        request_sha256: requestSha256, job_id: jobId, attempt_id: attemptId, authority,
        request, adapter_binding: request.adapter_binding, output_boundary: request.output_boundary,
        selector: request.selector, actual_identity: 'unreported', max_host_attempts: 1,
        max_descendants: 0, max_peer_messages: 0, max_retries: 0, max_replays: 0, max_fallbacks: 0,
        terminal_schema: 'cstar.researcher_terminal_receipt.v1',
    });
    let handoff: ResearcherNativeHostWorkerHandoff | undefined;
    if (options.control_root) {
        const persisted = persistResearcherHostWorkerHandoff(options.control_root, workPackage, job, leaseToken);
        handoff = persisted.handoff; replayed = replayed || persisted.replayed;
    }
    return { request, work_package: workPackage, job, handoff, replayed };
}

export function assertResearcherHostJob(value: unknown): CodexHostWorkerJobContract {
    const parsed = codexHostWorkerJobContractSchema.safeParse(value);
    if (!parsed.success || parsed.data.workflow_surface !== 'researcher'
        || parsed.data.worker_kind !== 'researcher' || parsed.data.host_launch_required !== true
        || parsed.data.max_host_attempts !== 1 || parsed.data.max_descendants !== 0
        || parsed.data.max_peer_messages !== 0 || parsed.data.max_retries !== 0
        || parsed.data.max_replays !== 0 || parsed.data.max_fallbacks !== 0) {
        throw new Error('CSTAR_RESEARCHER_REQUEST_INVALID');
    }
    return parsed.data as CodexHostWorkerJobContract;
}
