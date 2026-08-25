import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

import type { HallForgeAttemptRecord, HallForgeAuthorizationRecord, HallForgeRequestRecord } from '../../../types/forge.js';
import { CODEX_HOST_WORKER_HANDOFF_SCHEMA, CODEX_HOST_WORKER_JOB_SCHEMA } from '../../../types/worker_job.js';
import type { CodexHostWorkerHandoff, CodexHostWorkerJobContract, CodexHostWorkerValidationTicketBinding, CodexHostWorkerValidationTicketRequest } from '../../../types/worker_job.js';
import { codexHostWorkerJobContractSchema } from '../../cstar-kernel-mcp/contracts/worker_jobs.js';
import { mcpGuardrail, textResponse, type McpTextResponse } from '../../cstar-kernel-mcp/contracts/responses.js';
import { verifyDispatchPackageLocks } from '../../cstar-kernel-mcp/tools/dispatch_request.js';
import type { ForgeExecutionArgs } from '../../cstar-kernel-mcp/tools/forge_execute_contract.js';
import { reserveVerifiedForgeExecution } from '../../cstar-kernel-mcp/tools/forge_execute_reservation.js';
import { assertForgePathIdentity, assertForgeRequiredOutputsContained, buildForgeRequestId, canonicalizeForgeRequest, hashCanonicalForgeRequest, hashForgeTargetPaths, stableJson, type CanonicalForgeRequest } from '../../cstar-kernel-mcp/tools/forge_request_contract.js';
import { assertSafePrivateArtifact, ensureSafeDirectoryTree, forgeExecutionPathSegment, publishPrivateFileNoClobber } from '../../cstar-kernel-mcp/tools/forge_adapter_artifacts.js';
import { finalizeForgeAttempt, getForgeAttempt, markForgeAttemptStarted } from './forge_receipt_controller.js';
import { normalizeCodexHostWorkerJobContract } from './worker_job_validation.js';
import type { ForgeRuntimeReadinessAssertion } from '../../cstar-kernel-mcp/contracts/runtime.js';
import {
    assertForgeHostPathIdentityBindings,
    captureForgeHostPathIdentities,
} from './forge_host_path_identity.js';

const HANDOFF_FILE = 'codex-host-worker-handoff.json';
const DIGEST = /^[a-f0-9]{64}$/;

function sha256(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function inside(candidate: string, root: string): boolean {
    const relative = path.relative(root, candidate);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function canonicalDirectory(value: string, code: string): string {
    if (!path.isAbsolute(value) || path.resolve(value) !== value) throw new Error(code);
    const stat = fs.lstatSync(value, { throwIfNoEntry: false });
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${code}_unsafe`);
    const real = fs.realpathSync(value);
    if (real !== value) throw new Error(`${code}_noncanonical`);
    return real;
}
function existingAncestor(value: string): string {
    let current = path.resolve(value);
    while (true) {
        const stat = fs.lstatSync(current, { throwIfNoEntry: false });
        if (stat) {
            if (stat.isSymbolicLink()) throw new Error('forge_host_project_path_symlink');
            return stat.isDirectory() ? current : path.dirname(current);
        }
        const parent = path.dirname(current);
        if (parent === current) throw new Error('forge_host_project_path_uninspectable');
        current = parent;
    }
}
function nearestGitRoot(value: string): string | null {
    let current = existingAncestor(value);
    while (true) {
        const marker = fs.lstatSync(path.join(current, '.git'), { throwIfNoEntry: false });
        if (marker && !marker.isSymbolicLink()) return canonicalDirectory(current, 'forge_host_project_root_invalid');
        const parent = path.dirname(current);
        if (parent === current) return null;
        current = parent;
    }
}
function commonAncestor(values: string[]): string {
    const first = values[0];
    if (!first) throw new Error('forge_host_project_root_missing');
    const segments = first.split(path.sep);
    for (const value of values.slice(1)) {
        const candidate = value.split(path.sep);
        let length = 0;
        while (length < segments.length && length < candidate.length && segments[length] === candidate[length]) length += 1;
        segments.splice(length);
    }
    const result = segments.join(path.sep) || path.parse(first).root;
    if (result === path.parse(result).root) throw new Error('forge_host_project_root_ambiguous');
    return result;
}
function requirePath(value: string, root: string, field: string): void {
    if (!path.isAbsolute(value) || path.resolve(value) !== value) throw new Error(`forge_host_${field}_not_canonical`);
    if (!inside(value, root)) throw new Error(`forge_host_${field}_outside_project_root`);
}

function authoritativeRoot(args: ForgeExecutionArgs, canonical: CanonicalForgeRequest): string {
    const paths = [...canonical.target_paths, ...canonical.required_output_paths];
    if (!paths.length) throw new Error('forge_host_project_paths_missing');
    paths.forEach((value) => {
        if (!path.isAbsolute(value) || path.resolve(value) !== value) throw new Error('forge_host_canonical_paths_must_be_absolute');
    });
    const explicit = args.project_root?.trim();
    const root = explicit ? canonicalDirectory(explicit, 'forge_host_project_root_invalid') : (() => {
        const gitRoots = [...new Set(paths.map(nearestGitRoot).filter((value): value is string => value !== null))];
        if (gitRoots.length > 1) throw new Error('forge_host_project_roots_ambiguous');
        return gitRoots[0] ?? canonicalDirectory(commonAncestor(paths.map(existingAncestor)), 'forge_host_project_root_invalid');
    })();
    paths.forEach((value) => requirePath(value, root, 'canonical_path'));
    return root;
}
function verifyPaths(root: string, canonical: CanonicalForgeRequest): void {
    if (!canonical.target_paths.length) throw new Error('forge_host_canonical_target_paths_missing');
    for (const field of ['target_paths', 'required_output_paths'] as const) {
        const values = canonical[field];
        if (new Set(values).size !== values.length) throw new Error(`forge_host_${field}_duplicate`);
        values.forEach((value) => requirePath(value, root, field));
    }
    assertForgePathIdentity(canonical.target_paths, canonical.required_output_paths);
    if (canonical.required_output_paths.length) {
        assertForgeRequiredOutputsContained(root, canonical.target_paths, canonical.required_output_paths);
    }
}

export function isCurrentForgeV3Request(request: HallForgeRequestRecord): boolean {
    let value: unknown;
    try { value = JSON.parse(request.request_summary_json); } catch { throw new Error('forge_request_summary_invalid'); }
    if (!isRecord(value) || typeof value.schema !== 'string') throw new Error('forge_request_summary_invalid');
    if (value.schema === 'cstar.forge_request.v3') return true;
    if (value.schema === 'cstar.forge_request.v2') return false;
    throw new Error('forge_request_schema_unsupported');
}
function recordedCanonical(request: HallForgeRequestRecord): CanonicalForgeRequest {
    let value: unknown;
    try { value = JSON.parse(request.request_summary_json); } catch { throw new Error('forge_request_summary_invalid'); }
    if (!isRecord(value) || value.schema !== 'cstar.forge_request.v3') throw new Error('forge_current_request_schema_required');
    const canonical = value as unknown as CanonicalForgeRequest;
    if (stableJson(canonical) !== request.request_summary_json || hashCanonicalForgeRequest(canonical) !== request.request_sha256 || buildForgeRequestId(request.request_sha256) !== request.request_id || hashForgeTargetPaths(canonical) !== request.target_paths_sha256) throw new Error('forge_current_request_integrity_mismatch');
    return canonical;
}
function verifyScope(args: ForgeExecutionArgs, request: HallForgeRequestRecord, decisionId: string): { canonical: CanonicalForgeRequest; projectRoot: string; pathIdentityBindings: ReturnType<typeof captureForgeHostPathIdentities> } {
    const canonical = recordedCanonical(request);
    const projectRoot = authoritativeRoot(args, canonical);
    verifyPaths(projectRoot, canonical);
    const pathIdentityBindings = captureForgeHostPathIdentities(
        canonical.target_paths,
        canonical.required_output_paths,
    );
    const current = canonicalizeForgeRequest(args, projectRoot, decisionId, canonical.adapter_ref, canonical.write_capability, canonical.max_attempts, canonical.adapter_runtime, canonical.hermes_runtime);
    if (stableJson(current) !== request.request_summary_json || hashCanonicalForgeRequest(current) !== request.request_sha256 || hashForgeTargetPaths(current) !== request.target_paths_sha256) throw new Error('forge_execution_request_hash_mismatch');
    return { canonical, projectRoot, pathIdentityBindings };
}
function actualIdentity(runtimeReadiness: unknown): string | null {
    if (!isRecord(runtimeReadiness)) return null;
    const proof = isRecord(runtimeReadiness.forge_runtime_proof) ? runtimeReadiness.forge_runtime_proof : null;
    const receipt = proof && isRecord(proof.receipt) ? proof.receipt : null;
    const value = proof?.actual_identity ?? receipt?.actual_identity;
    return typeof value === 'string' && value.trim() && value.trim() !== 'unreported' ? value.trim() : null;
}
function expectedArtifacts(canonical: CanonicalForgeRequest): Array<{ name: string; artifact_kind: 'other'; required: true }> {
    const used = new Set<string>();
    return canonical.artifact_expectations.map((raw, index) => {
        let name = raw.trim().replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 128) || `artifact-${index + 1}`;
        while (used.has(name)) name = `${name.slice(0, 120)}-${index + 1}`;
        used.add(name);
        return { name, artifact_kind: 'other' as const, required: true as const };
    });
}

type TicketPair = { binding: CodexHostWorkerValidationTicketBinding; request: CodexHostWorkerValidationTicketRequest };
function ticketBinding(args: ForgeExecutionArgs, request: HallForgeRequestRecord, authorization: HallForgeAuthorizationRecord, attempt: HallForgeAttemptRecord): TicketPair {
    const supplied = args.validation_ticket_request;
    const scope = request.target_paths_sha256.toLowerCase();
    if (!DIGEST.test(scope) || (supplied && supplied.scope_sha256.toLowerCase() !== scope)) throw new Error('forge_validation_ticket_scope_mismatch');
    if (supplied && Boolean(supplied.validator_thread_id) !== Boolean(supplied.validator_turn_id)) throw new Error('forge_validation_ticket_validator_incomplete');
    const expiresAt = supplied?.expires_at ?? authorization.expires_at;
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || expiresAt > authorization.expires_at) throw new Error('forge_validation_ticket_expiry_invalid');
    const binding: CodexHostWorkerValidationTicketBinding = { schema: 'cstar.validation_ticket_binding.v1', repository_id: request.repo_id, bead_id: request.bead_id, execution_receipt_id: attempt.execution_receipt_id, attempt_id: attempt.attempt_id, scope_sha256: scope, one_use: true };
    return {
        binding,
        request: { ...binding, schema: 'cstar.validation_ticket_request.v1', expires_at: expiresAt, ...(supplied?.validator_thread_id ? { validator_thread_id: supplied.validator_thread_id } : {}), ...(supplied?.validator_turn_id ? { validator_turn_id: supplied.validator_turn_id } : {}) },
    };
}
function buildJob(args: ForgeExecutionArgs, request: HallForgeRequestRecord, authorization: HallForgeAuthorizationRecord, attempt: HallForgeAttemptRecord, canonical: CanonicalForgeRequest, projectRoot: string, runtimeReadiness: unknown, ticket: TicketPair, pathIdentityBindings: ReturnType<typeof captureForgeHostPathIdentities>): CodexHostWorkerJobContract {
    const base = {
        schema: CODEX_HOST_WORKER_JOB_SCHEMA, worker_kind: 'forge' as const, workflow_surface: 'forge' as const,
        bead_id: request.bead_id, decision_id: request.decision_id, canonical_request_id: request.request_id,
        canonical_request_sha256: request.request_sha256, authorization_id: authorization.authorization_id,
        authorization_expires_at: authorization.expires_at, runner_owner: 'codex-host' as const,
        requested_model: 'gpt-5.6-luna' as const, requested_reasoning: 'max' as const, selector_status: 'enforced' as const,
        actual_identity: actualIdentity(runtimeReadiness), transport: 'codex-host' as const,
        cognition_launch: false as const, cstar_launch: false as const, provider_requests_started: 0 as const,
        spend_uncertain: false as const, known_spend_observed: false as const, network_accessed: false as const,
        idempotency_key: args.idempotency_key.trim(), execution_deadline_at: authorization.expires_at,
        attempt_id: attempt.attempt_id, objective: canonical.objective, expected_artifacts: expectedArtifacts(canonical),
        job_id: `codex-host-job-${sha256(`${request.request_id}\n${args.idempotency_key.trim()}`).slice(0, 32)}`,
        host_launch_required: true as const, project_root: projectRoot, target_paths: canonical.target_paths,
        output_paths: canonical.required_output_paths, target_paths_sha256: request.target_paths_sha256,
        path_identity_bindings: pathIdentityBindings,
        validation_ticket_binding: ticket.binding, validation_ticket_request: ticket.request,
    };
    return normalizeCodexHostWorkerJobContract({ ...base, dispatch_receipt_sha256: sha256(stableJson(base)) });
}

export function forgeCodexHostWorkerHandoffPath(controlRoot: string, executionReceiptId: string): string {
    if (forgeExecutionPathSegment(executionReceiptId) !== executionReceiptId) throw new Error('forge_host_execution_receipt_invalid');
    return path.join(controlRoot, 'work', 'forge-executions', executionReceiptId, HANDOFF_FILE);
}
function handoffHash(job: CodexHostWorkerJobContract): string { return sha256(stableJson({ schema: CODEX_HOST_WORKER_HANDOFF_SCHEMA, job })); }
function replayInputProjection(job: CodexHostWorkerJobContract): Record<string, unknown> {
    const { actual_identity: _actualIdentity, dispatch_receipt_sha256: _dispatchReceipt, ...inputs } = job;
    return inputs;
}
function replayInputsMatch(left: CodexHostWorkerJobContract, right: CodexHostWorkerJobContract): boolean {
    return stableJson(replayInputProjection(left)) === stableJson(replayInputProjection(right));
}
export function parseForgeCodexHostWorkerHandoff(value: unknown): CodexHostWorkerHandoff {
    if (!isRecord(value) || Object.keys(value).sort().join(',') !== ['cstar_launch', 'handoff_path', 'handoff_sha256', 'host_launch_required', 'job', 'provider_attempted', 'schema', 'status'].sort().join(',')) throw new Error('forge_codex_host_handoff_malformed');
    if (value.schema !== CODEX_HOST_WORKER_HANDOFF_SCHEMA || !['queued', 'replayed'].includes(String(value.status)) || value.host_launch_required !== true || value.cstar_launch !== false || value.provider_attempted !== false || typeof value.handoff_path !== 'string' || !path.isAbsolute(value.handoff_path) || typeof value.handoff_sha256 !== 'string' || !DIGEST.test(value.handoff_sha256)) throw new Error('forge_codex_host_handoff_malformed');
    const parsed = codexHostWorkerJobContractSchema.safeParse(value.job);
    if (!parsed.success) throw new Error('forge_codex_host_job_invalid');
    const job = normalizeCodexHostWorkerJobContract(parsed.data as CodexHostWorkerJobContract);
    if (job.workflow_surface !== 'forge' || job.runner_owner !== 'codex-host' || job.transport !== 'codex-host' || job.provider_requests_started !== 0 || job.spend_uncertain !== false || job.known_spend_observed !== false || !job.project_root || !job.target_paths || !job.output_paths || !job.path_identity_bindings || !job.validation_ticket_binding || !job.validation_ticket_request || job.dispatch_receipt_sha256 !== sha256(stableJson({ ...job, dispatch_receipt_sha256: undefined }))) throw new Error('forge_codex_host_job_invalid');
    if (value.handoff_sha256 !== handoffHash(job)) throw new Error('forge_codex_host_handoff_hash_mismatch');
    return { schema: CODEX_HOST_WORKER_HANDOFF_SCHEMA, status: value.status as 'queued' | 'replayed', job, handoff_sha256: value.handoff_sha256, handoff_path: value.handoff_path, host_launch_required: true, cstar_launch: false, provider_attempted: false };
}
function readHandoff(destination: string): CodexHostWorkerHandoff | null {
    const stat = fs.lstatSync(destination, { throwIfNoEntry: false });
    if (!stat) return null;
    assertSafePrivateArtifact(destination);
    let value: unknown;
    try { value = JSON.parse(fs.readFileSync(destination, 'utf8')); } catch { throw new Error('forge_codex_host_handoff_malformed'); }
    const handoff = parseForgeCodexHostWorkerHandoff(value);
    if (handoff.handoff_path !== destination) throw new Error('forge_codex_host_handoff_path_mismatch');
    assertForgeHostPathIdentityBindings(handoff.job.path_identity_bindings ?? []);
    return handoff;
}
export function persistForgeCodexHostWorkerHandoff(controlRoot: string, job: CodexHostWorkerJobContract, afterPublishForTest?: () => void): { handoff: CodexHostWorkerHandoff; replayed: boolean } {
    const receipt = `forge-execute-${sha256(`${job.canonical_request_id}\n${job.idempotency_key}`).slice(0, 32)}`;
    const destination = forgeCodexHostWorkerHandoffPath(controlRoot, receipt);
    const directory = ensureSafeDirectoryTree(controlRoot, path.dirname(destination));
    const existing = readHandoff(destination);
    if (existing) {
        if (!replayInputsMatch(existing.job, job)) throw new Error('forge_codex_host_handoff_duplicate_conflict');
        return { handoff: { ...existing, status: 'replayed' }, replayed: true };
    }
    const queued: CodexHostWorkerHandoff = { schema: CODEX_HOST_WORKER_HANDOFF_SCHEMA, status: 'queued', job, handoff_sha256: handoffHash(job), handoff_path: destination, host_launch_required: true, cstar_launch: false, provider_attempted: false };
    assertForgeHostPathIdentityBindings(job.path_identity_bindings ?? []);
    let published = false;
    try {
        publishPrivateFileNoClobber(directory, destination, `${stableJson(queued)}\n`);
        published = true;
        afterPublishForTest?.();
        const consumed = readHandoff(destination);
        if (!consumed) throw new Error('forge_codex_host_handoff_missing_after_publish');
        return { handoff: consumed, replayed: false };
    } catch (error) {
        if (published) {
            try { assertSafePrivateArtifact(destination); fs.unlinkSync(destination); } catch { /* Preserve the original fail-closed reason. */ }
        }
        if (!fs.lstatSync(destination, { throwIfNoEntry: false })) throw error;
        const raced = readHandoff(destination);
        if (!raced || !replayInputsMatch(raced.job, job)) throw new Error('forge_codex_host_handoff_duplicate_conflict');
        return { handoff: { ...raced, status: 'replayed' }, replayed: true };
    }
    return { handoff: queued, replayed: false };
}

function hostResponse(request: HallForgeRequestRecord, attempt: HallForgeAttemptRecord, handoff: CodexHostWorkerHandoff, locks: unknown, runtimeReadiness: unknown, replayed: boolean): McpTextResponse {
    return textResponse({ status: replayed ? 'host_handoff_replayed' : 'host_handoff_queued', execution_kind: 'forge', forge_request_receipt_id: request.request_id, execution_receipt_id: attempt.execution_receipt_id, attempt_id: attempt.attempt_id, attempt_status: attempt.status, request_status: request.status, replayed, host_handoff: handoff, worker_job: handoff.job, package_lock_proofs: locks, forge_execution: { mode: 'live_authorized', attempted: false, provider_attempted: false, adapter_invoked: false, live_spend: false, spend_uncertain: false, known_spend_observed: false, live_source_collection: false, network_accessed: false, cognition_launch: false, cstar_launch: false, requested_model: 'gpt-5.6-luna', requested_reasoning: 'max', actual_identity: actualIdentity(runtimeReadiness), codex_worker_fallback_allowed: false, fail_closed_reason: null }, guardrail: mcpGuardrail('caution', 'verify', 'CStar persisted one host-owned asynchronous handoff without launching cognition, network, a provider, or a process.', [], ['forge_codex_host_worker_handoff', 'independent_validation_ticket']), next_action: 'The Codex host owns handoff consumption. After delivery, request and consume the one-use independent-validator ticket before recording the Forge result; never retry an UNKNOWN attempt.' });
}
function terminalResponse(request: HallForgeRequestRecord, attempt: HallForgeAttemptRecord, reason: string): McpTextResponse {
    return textResponse({ status: attempt.status === 'UNKNOWN' ? 'ambiguous_replay' : 'host_handoff_terminal_replay', execution_kind: 'forge', forge_request_receipt_id: request.request_id, execution_receipt_id: attempt.execution_receipt_id, attempt_id: attempt.attempt_id, attempt_status: attempt.status, request_status: request.status, replayed: true, forge_execution: { attempted: false, provider_attempted: false, adapter_invoked: false, live_spend: false, spend_uncertain: attempt.status === 'UNKNOWN', known_spend_observed: attempt.known_spend_observed === 1, codex_worker_fallback_allowed: false, fail_closed_reason: reason }, guardrail: mcpGuardrail('block', 'refuse', 'The current v3 host attempt is terminal or ambiguous; CStar will not fall back to a legacy adapter or create another provider attempt.', [reason], ['forge_execution_idempotency', 'forge_legacy_fallback_rejected']), next_action: 'Do not retry this idempotency key. Complete independent validation or open an explicit repair decision.' });
}

export function dispatchCurrentForgeV3({
    controlRoot,
    request,
    authorization,
    args,
    decisionId,
    runtimeReadiness,
    assertRuntimeReady,
    surfaceFound,
    releaseReadDb,
}: {
    controlRoot: string;
    request: HallForgeRequestRecord;
    authorization: HallForgeAuthorizationRecord;
    args: ForgeExecutionArgs;
    decisionId: string;
    runtimeReadiness: unknown;
    assertRuntimeReady: ForgeRuntimeReadinessAssertion;
    surfaceFound: boolean;
    releaseReadDb: () => void;
}): Promise<McpTextResponse> {
    if (!surfaceFound) throw new Error('missing_authorized_dispatch_surface');
    if (args.execution_adapter_ref?.trim() || request.adapter_ref) {
        throw new Error('forge_v3_legacy_execution_adapter_forbidden');
    }
    if (!request.write_capability) throw new Error('forge_request_write_capability_missing');
    if (request.live_source_allowed !== 0 || args.spend_policy.live_source_allowed === true) {
        throw new Error('forge_live_source_not_authorized');
    }
    releaseReadDb();
    return dispatchForgeCodexHostWorker({
        controlRoot,
        request,
        authorization,
        args,
        decisionId,
        runtimeReadiness,
        assertRuntimeReady,
    });
}

export async function dispatchForgeCodexHostWorker({ controlRoot, request, authorization, args, decisionId, runtimeReadiness, assertRuntimeReady }: { controlRoot: string; request: HallForgeRequestRecord; authorization: HallForgeAuthorizationRecord; args: ForgeExecutionArgs; decisionId: string; runtimeReadiness: unknown; assertRuntimeReady: ForgeRuntimeReadinessAssertion }): Promise<McpTextResponse> {
    let db: Database.Database | null = null;
    let attempt: HallForgeAttemptRecord | null = null;
    let finalizeOnFailure = false;
    try {
        const { canonical, projectRoot, pathIdentityBindings } = verifyScope(args, request, decisionId);
        const locks = verifyDispatchPackageLocks(args.package_locks, projectRoot);
        const executionReceiptId = `forge-execute-${sha256(`${request.request_id}\n${args.idempotency_key.trim()}`).slice(0, 32)}`;
        assertRuntimeReady();
        const reservation = reserveVerifiedForgeExecution({ root: controlRoot, request, authorization, args, executionReceiptId, adapterRef: request.adapter_ref ?? '', canonical, mode: 'codex-host' });
        db = reservation.db;
        attempt = reservation.attempt;
        finalizeOnFailure = reservation.kind === 'reserved';
        if (reservation.kind === 'reserved') assertRuntimeReady();
        if (attempt.provider && attempt.provider !== 'codex-host') return terminalResponse(request, attempt, 'forge_v3_legacy_provider_attempt_rejected');
        if (attempt.requested_model && attempt.requested_model !== 'gpt-5.6-luna') return terminalResponse(request, attempt, 'forge_v3_requested_model_drift');
        if (attempt.status === 'UNKNOWN' || attempt.provider_requests_started || attempt.known_spend_observed === 1) return terminalResponse(request, attempt, 'forge_v3_unknown_spend_no_retry');
        const destination = forgeCodexHostWorkerHandoffPath(controlRoot, executionReceiptId);
        const existing = readHandoff(destination);
        if (existing) {
            if (existing.job.attempt_id !== attempt.attempt_id || existing.job.canonical_request_id !== request.request_id) return terminalResponse(request, attempt, 'forge_codex_host_handoff_binding_mismatch');
            const ticket = ticketBinding(args, request, authorization, attempt);
            const candidate = buildJob(args, request, authorization, attempt, canonical, projectRoot, runtimeReadiness, ticket, pathIdentityBindings);
            if (!replayInputsMatch(existing.job, candidate)) return terminalResponse(request, attempt, 'forge_codex_host_handoff_replay_input_conflict');
            return hostResponse(request, attempt, { ...existing, status: 'replayed' }, locks, runtimeReadiness, true);
        }
        if (reservation.kind === 'replay') return terminalResponse(request, attempt, 'forge_codex_host_handoff_missing');
        const ticket = ticketBinding(args, request, authorization, attempt);
        const job = buildJob(args, request, authorization, attempt, canonical, projectRoot, runtimeReadiness, ticket, pathIdentityBindings);
        // Recheck identity immediately before changing the attempt and publishing
        // the host handoff. The request-time check cannot cover a later hardlink.
        assertForgeHostPathIdentityBindings(job.path_identity_bindings ?? []);
        if (attempt.status === 'RESERVED') attempt = markForgeAttemptStarted(db, attempt.attempt_id);
        const persisted = persistForgeCodexHostWorkerHandoff(controlRoot, job);
        finalizeOnFailure = false;
        return hostResponse(request, getForgeAttempt(db, attempt.attempt_id) ?? attempt, persisted.handoff, locks, runtimeReadiness, persisted.replayed);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (db && attempt && finalizeOnFailure) {
            try {
                const terminal = finalizeForgeAttempt(db, { attempt_id: attempt.attempt_id, status: 'FAILED_FINAL', error_code: message, provider: 'codex-host', requested_model: 'gpt-5.6-luna', model_source: 'unreported', reasoning_profile: 'max', adapter_version: CODEX_HOST_WORKER_JOB_SCHEMA });
                return textResponse({ status: 'failed_final', execution_kind: 'forge', forge_request_receipt_id: request.request_id, execution_receipt_id: terminal.attempt.execution_receipt_id, attempt_id: terminal.attempt.attempt_id, attempt_status: terminal.attempt.status, request_status: terminal.request.status, forge_execution: { attempted: false, provider_attempted: false, adapter_invoked: false, live_spend: false, spend_uncertain: false, known_spend_observed: false, codex_worker_fallback_allowed: false, fail_closed_reason: message }, guardrail: mcpGuardrail('block', 'refuse', 'The host handoff could not be durably persisted; no provider attempt was started and the one-shot grant is closed.', [message], ['forge_codex_host_worker_handoff']) });
            } catch { /* Preserve the typed fail-closed response below. */ }
        }
        return textResponse({ status: 'blocked', execution_kind: 'forge', forge_request_receipt_id: request.request_id, forge_execution: { attempted: false, provider_attempted: false, adapter_invoked: false, live_spend: false, spend_uncertain: false, known_spend_observed: false, codex_worker_fallback_allowed: false, fail_closed_reason: message }, guardrail: mcpGuardrail('block', 'refuse', 'Current v3 Forge host dispatch failed closed before any provider or legacy adapter path.', [message], ['forge_codex_host_worker_handoff']) });
    }
}
