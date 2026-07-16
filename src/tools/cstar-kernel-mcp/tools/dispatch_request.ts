import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { registry } from '../../pennyone/pathRegistry.js';
import { errorResponse, mcpGuardrail, textResponse, type McpTextResponse } from '../contracts/responses.js';
import {
    CODE_ROOT,
    readBoundedFileInside,
    resolveExistingPathInside,
} from '../contracts/runtime.js';
import { resolveDispatchActionAuthority } from './dispatch_action_authority.js';

export type DispatchRequestKind = 'researcher' | 'forge';
export type DispatchSpendMode = 'no_spend' | 'dry_run' | 'live_authorized';

export interface DispatchMetricContract {
    name: string;
    threshold: string;
    acceptance_rule?: string;
    unit?: string;
}

export interface DispatchSpendPolicy {
    mode: DispatchSpendMode;
    max_retries?: number;
    live_source_allowed?: boolean;
    operator_authorization_ref?: string;
}

export interface DispatchPackageLock {
    path: string;
    sha256: string;
}

export interface DispatchCallbackContract {
    expected_packet: string;
    callback_required?: boolean;
    callback_thread_id?: string;
}

export interface DispatchRequestArgs {
    bead_id?: string;
    decision_id?: string;
    state_update_thread_id?: string;
    owner_pmt_thread_id?: string;
    source_callback_thread_id: string;
    objective: string;
    prompt?: string;
    target_paths?: string[];
    required_output_paths?: string[];
    system_under_test?: string;
    scope: string;
    authority_lane: 'green' | 'yellow' | 'red';
    required_metrics: DispatchMetricContract[];
    artifact_expectations: string[];
    prohibited_actions: string[];
    requested_actions?: string[];
    spend_policy: DispatchSpendPolicy;
    live_source_policy?: string;
    fixture_policy?: 'synthetic_only';
    retry_policy?: {
        budget: number;
        spent?: number;
    };
    callback_contract: DispatchCallbackContract;
    package_locks?: DispatchPackageLock[];
    dispatch_surface_ref?: string;
}

export function makeDispatchDecisionId(kind: DispatchRequestKind, args: DispatchRequestArgs): string {
    if (args.decision_id?.trim()) {
        return args.decision_id.trim();
    }
    const base = (args.bead_id || args.objective || kind)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || kind;
    return `decision-${kind}-${base}-${Date.now().toString(36)}`;
}

export function normalizeActionList(values: string[] | undefined): string[] {
    return (values ?? [])
        .map((value) => value.trim())
        .filter(Boolean);
}

export function resolveStateUpdateThreadId(args: DispatchRequestArgs): string {
    return args.state_update_thread_id?.trim() || args.owner_pmt_thread_id?.trim() || '';
}

export function findDispatchValidationError(
    args: DispatchRequestArgs,
    options: { require_operator_authorization_ref?: boolean } = {},
): string | null {
    if (!args.bead_id?.trim() && !args.decision_id?.trim()) {
        return 'bead_id or decision_id is required';
    }
    if (!args.source_callback_thread_id?.trim()) {
        return 'source_callback_thread_id is required';
    }
    if (!args.objective?.trim()) {
        return 'objective is required';
    }
    if (!args.scope?.trim()) {
        return 'scope is required';
    }
    if (!Array.isArray(args.required_metrics) || args.required_metrics.length === 0) {
        return 'required_metrics must include at least one metric with an acceptance threshold';
    }
    for (const metric of args.required_metrics) {
        if (!metric.name?.trim() || !metric.threshold?.trim()) {
            return 'each required_metrics entry needs name and threshold';
        }
    }
    if (!Array.isArray(args.artifact_expectations) || args.artifact_expectations.filter(Boolean).length === 0) {
        return 'artifact_expectations must include at least one expected artifact/report/package';
    }
    if (!Array.isArray(args.prohibited_actions) || args.prohibited_actions.filter(Boolean).length === 0) {
        return 'prohibited_actions must explicitly list blocked actions';
    }
    if (!args.callback_contract?.expected_packet?.trim()) {
        return 'callback_contract.expected_packet is required';
    }
    const retryBudget = args.retry_policy?.budget;
    const retrySpent = args.retry_policy?.spent ?? 0;
    if (retryBudget !== undefined && (retryBudget < 0 || retrySpent < 0 || retrySpent > retryBudget)) {
        return 'retry_policy must have non-negative budget/spent and spent must not exceed budget';
    }
    try {
        resolveDispatchActionAuthority(args);
    } catch (error) {
        return error instanceof Error ? error.message : 'dispatch_action_authority_invalid';
    }
    const liveRequested = args.spend_policy.mode === 'live_authorized'
        || args.spend_policy.live_source_allowed === true;
    if (
        liveRequested
        && options.require_operator_authorization_ref !== false
        && !args.spend_policy.operator_authorization_ref?.trim()
    ) {
        return 'live spend/source policy requires operator_authorization_ref';
    }
    if (args.spend_policy.mode === 'live_authorized' && args.fixture_policy !== 'synthetic_only') {
        return 'live Forge execution requires fixture_policy synthetic_only';
    }
    return null;
}

export function resolveDispatchSurface(
    kind: DispatchRequestKind,
    args: DispatchRequestArgs,
    root: string = CODE_ROOT,
) {
    const candidates = args.dispatch_surface_ref
        ? [args.dispatch_surface_ref]
        : kind === 'researcher'
            ? ['.agents/skills/researcher/SKILL.md']
            : [
                'docs/operations/corvus-forge-skill-spec.md',
                'docs/operations/corvus-forge-pipeline-playbook.md',
            ];
    const proofs = candidates.map((candidate) => {
        const absolute = path.resolve(root, candidate);
        let resolvedPath: string | null = null;
        let containmentError: string | null = null;
        try {
            resolvedPath = resolveExistingPathInside(root, absolute, 'file');
        } catch (error) {
            containmentError = error instanceof Error ? error.message : String(error);
        }
        return {
            ref: candidate,
            path: resolvedPath ?? absolute,
            exists: fs.existsSync(absolute),
            inside_project: resolvedPath !== null,
            containment_error: containmentError,
        };
    });
    const found = proofs.find((proof) => proof.exists && proof.inside_project) ?? null;
    return {
        requested_ref: args.dispatch_surface_ref ?? null,
        found: found !== null,
        selected: found,
        checked: proofs,
    };
}

export function hasDuplicatePackageLockMismatch(locks: DispatchPackageLock[] | undefined): boolean {
    const seen = new Map<string, string>();
    for (const lock of locks ?? []) {
        const key = lock.path.trim();
        const value = lock.sha256.trim();
        const existing = seen.get(key);
        if (existing !== undefined && existing !== value) {
            return true;
        }
        seen.set(key, value);
    }
    return false;
}

export function verifyDispatchPackageLocks(
    locks: DispatchPackageLock[] | undefined,
    root: string,
): Array<{ path: string; sha256: string; bytes: number }> {
    return (locks ?? []).map((lock) => {
        if (!/^[a-f0-9]{64}$/i.test(lock.sha256.trim())) {
            throw new Error(`dispatch_package_lock_sha256_invalid:${lock.path}`);
        }
        const absolute = path.isAbsolute(lock.path)
            ? path.resolve(lock.path)
            : path.resolve(root, lock.path);
        const locked = readBoundedFileInside(root, absolute, 64 * 1024 * 1024);
        const actual = createHash('sha256').update(locked.content).digest('hex');
        if (actual !== lock.sha256.trim().toLowerCase()) {
            throw new Error(`dispatch_package_lock_hash_mismatch:${lock.path}`);
        }
        return { path: locked.path, sha256: actual, bytes: locked.content.byteLength };
    });
}

export async function handleDispatchRequest(
    kind: DispatchRequestKind,
    args: DispatchRequestArgs,
): Promise<McpTextResponse> {
    try {
        const validationError = findDispatchValidationError(args);
        const decisionId = makeDispatchDecisionId(kind, args);
        if (validationError) {
            return textResponse({
                status: 'rejected',
                dispatch_kind: kind,
                decision_id: decisionId,
                bead_id: args.bead_id ?? null,
                error: validationError,
                guardrail: mcpGuardrail(
                    'block',
                    'refuse',
                    'Dispatch request failed the CStar control-plane request contract.',
                    ['dispatch_contract'],
                    ['request_validation'],
                ),
            }, true);
        }

        const root = registry.getRoot();
        const actionAuthority = resolveDispatchActionAuthority(args, root);
        if (kind === 'researcher' && actionAuthority.primary_action === 'project_files') {
            return textResponse({
                status: 'rejected',
                dispatch_kind: kind,
                decision_id: decisionId,
                bead_id: args.bead_id ?? null,
                error: 'researcher_project_files_action_forbidden',
                guardrail: mcpGuardrail(
                    'block',
                    'refuse',
                    'Researcher requests cannot carry implementation-write authority.',
                    ['dispatch_action_authority'],
                    ['route_to_forge'],
                ),
            }, true);
        }
        const surface = resolveDispatchSurface(kind, args);
        const liveAuthority = args.spend_policy.mode === 'live_authorized'
            && Boolean(args.spend_policy.operator_authorization_ref)
            && surface.found;
        const receiptId = `dispatch-${kind}-${decisionId}-${Date.now().toString(36)}`;
        const failClosedReason = !surface.found
            ? 'missing_authorized_dispatch_surface'
            : liveAuthority
                ? null
                : 'no_live_dispatch_authority';

        return textResponse({
            status: failClosedReason ? 'dry_run_no_spend' : 'ready_for_authorized_dispatch',
            dispatch_kind: kind,
            decision_id: decisionId,
            receipt_id: receiptId,
            bead_id: args.bead_id ?? null,
            state_update_thread_id: resolveStateUpdateThreadId(args) || null,
            legacy_owner_pmt_thread_id_accepted: !args.state_update_thread_id?.trim()
                && Boolean(args.owner_pmt_thread_id?.trim()),
            source_callback_thread_id: args.source_callback_thread_id,
            objective: args.objective,
            prompt: args.prompt ?? null,
            target_paths: args.target_paths ?? [],
            system_under_test: args.system_under_test ?? null,
            scope: args.scope,
            authority_lane: args.authority_lane,
            required_metrics: args.required_metrics,
            artifact_expectations: args.artifact_expectations,
            prohibited_actions: actionAuthority.prohibited_actions,
            requested_actions: actionAuthority.requested_actions,
            action_authority: actionAuthority,
            spend_policy: {
                ...args.spend_policy,
                live_source_allowed: args.spend_policy.live_source_allowed === true,
            },
            live_source_policy: args.live_source_policy ?? 'no live source collection unless separately authorized',
            retry_policy: args.retry_policy ?? { budget: args.spend_policy.max_retries ?? 0, spent: 0 },
            callback_contract: {
                ...args.callback_contract,
                callback_required: args.callback_contract.callback_required !== false,
                callback_thread_id: args.callback_contract.callback_thread_id ?? args.source_callback_thread_id,
            },
            package_locks: args.package_locks ?? [],
            authorized_dispatch_surface: surface,
            dispatch_execution: {
                attempted: false,
                live_spend: false,
                live_source_collection: false,
                codex_worker_fallback_allowed: false,
                fail_closed_reason: failClosedReason,
            },
            guardrail: mcpGuardrail(
                failClosedReason ? 'caution' : 'allow',
                failClosedReason ? 'verify' : 'continue',
                failClosedReason
                    ? 'Request recorded as a no-spend receipt; live dispatch is blocked until an authorized surface and operator approval are present.'
                    : 'Request contract is complete and an authorized surface exists; live dispatch still requires the supplied operator authorization.',
                failClosedReason ? [failClosedReason] : [],
                ['dispatch_authority'],
            ),
            next_action: failClosedReason
                ? 'Return this receipt to CoS and send its bounded state packet to the configured information repository; do not substitute a Codex worker or ad hoc shell path.'
                : `Dispatch through the authorized ${kind} surface only, then record CStar validation/result evidence.`,
        });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function handleResearcherRequest(args: DispatchRequestArgs): Promise<McpTextResponse> {
    return handleDispatchRequest('researcher', args);
}

export async function handleForgeRequest(args: DispatchRequestArgs): Promise<McpTextResponse> {
    return handleDispatchRequest('forge', args);
}
