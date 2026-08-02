import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

import type { HallForgeAttemptRecord, HallForgeRequestRecord } from '../../../types/forge.js';
import {
    finalizeForgeAttempt,
    getForgeAttempt,
    getForgeRequest,
} from '../../pennyone/intel/forge_receipt_controller.js';
import { readBoundedUtf8FileInside } from '../contracts/runtime.js';
import { assertSafePrivateArtifact } from './forge_adapter_artifacts.js';
import {
    FORGE_EXECUTION_GRACE_MS,
    isForgeExecutionOwnerAlive,
    parseForgeExecutionOwnerProof,
} from './forge_execution_owner.js';

const EXECUTION_RECEIPT = /^forge-execute-[a-f0-9]{32}$/;
const TRACE_NAME = 'adapter-execution-envelope.json';
const TRACE_MAX_BYTES = 512 * 1024;

export type ForgeAttemptRecoveryClassification =
    | 'not_started'
    | 'owner_alive'
    | 'owner_terminated'
    | 'deadline_pending'
    | 'deadline_elapsed'
    | 'terminal_trace_unreconciled';

export interface ForgeAttemptRecoveryState {
    readonly classification: ForgeAttemptRecoveryClassification;
    readonly trace_status: string | null;
    readonly owner_proof: 'verified_alive' | 'verified_terminated' | 'unavailable';
    readonly reconcile_after_unix_ms: number | null;
    readonly reconciled: boolean;
}

export type ForgeDurableDispatchState =
    | 'queued'
    | 'running'
    | 'delivered'
    | 'validating'
    | 'accepted'
    | 'repair_queued'
    | 'needs_input'
    | 'domain_terminal'
    | 'unknown';

export interface ForgeAttemptDispatchClassification {
    readonly state: ForgeDurableDispatchState;
    readonly retry_allowed: boolean;
    readonly provider_spend_state: 'not_started' | 'known' | 'ambiguous';
}

/** Translate legacy Forge receipts into the durable dispatch vocabulary. */
export function classifyForgeAttemptForDurableDispatch(
    attempt: HallForgeAttemptRecord,
): ForgeAttemptDispatchClassification {
    const invalidProviderCount = (value: number | undefined): boolean => value !== undefined
        && (!Number.isSafeInteger(value) || value < 0);
    const invalidOptionalFlag = (value: number | undefined): boolean => value !== undefined
        && value !== 0 && value !== 1;
    const malformedEvidence = invalidProviderCount(attempt.provider_requests_started)
        || invalidProviderCount(attempt.provider_requests_ambiguous)
        || invalidOptionalFlag(attempt.live_spend)
        || ![0, 1].includes(attempt.live_spend_unknown)
        || ![0, 1].includes(attempt.known_spend_observed);
    const ambiguous = malformedEvidence || attempt.status === 'UNKNOWN'
        || attempt.live_spend_unknown === 1
        || (attempt.provider_requests_ambiguous ?? 0) > 0;
    const providerSpendState = ambiguous
        ? 'ambiguous'
        : attempt.known_spend_observed === 1 || attempt.live_spend === 1
            || (attempt.provider_requests_started ?? 0) > 0
            ? 'known' : 'not_started';
    const exactZeroProviderEvidence = attempt.provider_evidence_valid === 1
        && attempt.provider_requests_started === 0
        && attempt.provider_requests_completed === 0
        && attempt.provider_requests_ambiguous === 0
        && attempt.live_spend === 0
        && attempt.live_spend_unknown === 0
        && attempt.known_spend_observed === 0;
    if (ambiguous) return { state: 'unknown', retry_allowed: false, provider_spend_state: providerSpendState };
    if (attempt.status === 'RESERVED') return {
        state: attempt.result_status === undefined && providerSpendState === 'not_started'
            ? 'queued' : 'unknown',
        retry_allowed: false,
        provider_spend_state: providerSpendState,
    };
    if (attempt.status === 'STARTED') {
        if (attempt.result_status === undefined) return {
            state: 'running', retry_allowed: false, provider_spend_state: providerSpendState,
        };
        if (/^DELIVERED_PENDING_VALIDATION:.+/.test(attempt.result_status)) return {
            state: 'delivered', retry_allowed: false, provider_spend_state: providerSpendState,
        };
        if (attempt.result_status === 'VALIDATING') return {
            state: 'validating', retry_allowed: false, provider_spend_state: providerSpendState,
        };
        return { state: 'unknown', retry_allowed: false, provider_spend_state: providerSpendState };
    }
    if (attempt.status === 'FAILED_RETRYABLE') {
        const exactZeroProvider = attempt.result_status === undefined
            && attempt.attempt_budget_class === 'mechanical_no_provider'
            && exactZeroProviderEvidence
            && providerSpendState === 'not_started';
        return {
            state: exactZeroProvider ? 'repair_queued' : 'domain_terminal',
            retry_allowed: exactZeroProvider,
            provider_spend_state: providerSpendState,
        };
    }
    if (attempt.status === 'FAILED_FINAL') {
        const mechanical = attempt.result_status === undefined
            && attempt.attempt_budget_class === 'mechanical_no_provider'
            && exactZeroProviderEvidence && providerSpendState === 'not_started';
        return {
            state: mechanical ? 'repair_queued' : 'domain_terminal',
            retry_allowed: mechanical,
            provider_spend_state: providerSpendState,
        };
    }
    if (attempt.status === 'SUCCEEDED') {
        const acceptedVerdict = ['SUCCESS', 'ACCEPTED', 'PASS', 'PASSED']
            .includes(attempt.validation_verdict?.trim().toUpperCase() ?? '');
        const exactAccepted = attempt.result_status === 'VALIDATION_ACCEPTED'
            && Boolean(attempt.validation_id)
            && acceptedVerdict
            && attempt.validation_authority === 'verified_v2'
            && /^[a-f0-9]{64}$/i.test(attempt.validation_evidence_sha256 ?? '')
            && /^[a-f0-9]{64}$/i.test(attempt.result_artifact_sha256 ?? '');
        return {
            state: exactAccepted ? 'accepted' : 'unknown',
            retry_allowed: false,
            provider_spend_state: providerSpendState,
        };
    }
    return { state: 'unknown', retry_allowed: false, provider_spend_state: providerSpendState };
}

function tracePath(root: string, attempt: HallForgeAttemptRecord): string | null {
    if (!EXECUTION_RECEIPT.test(attempt.execution_receipt_id)) return null;
    return path.join(
        root,
        'work',
        'forge-executions',
        attempt.execution_receipt_id,
        TRACE_NAME,
    );
}

function readStartedTrace(root: string, attempt: HallForgeAttemptRecord): Record<string, unknown> | null {
    const candidate = tracePath(root, attempt);
    if (!candidate || !fs.lstatSync(candidate, { throwIfNoEntry: false })) return null;
    try {
        assertSafePrivateArtifact(candidate);
        const artifact = readBoundedUtf8FileInside(root, candidate, TRACE_MAX_BYTES);
        const parsed = JSON.parse(artifact.content) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        const record = parsed as Record<string, unknown>;
        if (record.schema !== 'cstar.forge_adapter_execution_trace.v2'
            || record.execution_receipt_id !== attempt.execution_receipt_id
            || record.forge_request_receipt_id !== attempt.request_id) return null;
        return record;
    } catch {
        return null;
    }
}

export function inspectForgeAttemptRecovery(
    root: string,
    attempt: HallForgeAttemptRecord,
    now = Date.now(),
): ForgeAttemptRecoveryState {
    if (attempt.status !== 'STARTED') return {
        classification: 'not_started', trace_status: null,
        owner_proof: 'unavailable', reconcile_after_unix_ms: null, reconciled: false,
    };
    const trace = readStartedTrace(root, attempt);
    const traceStatus = typeof trace?.status === 'string' ? trace.status : null;
    if (traceStatus && traceStatus !== 'started') return {
        classification: 'terminal_trace_unreconciled', trace_status: traceStatus,
        owner_proof: 'unavailable', reconcile_after_unix_ms: null, reconciled: false,
    };
    const owner = parseForgeExecutionOwnerProof(trace?.execution_owner);
    if (owner) {
        const alive = isForgeExecutionOwnerAlive(owner);
        if (alive === true) return {
            classification: 'owner_alive', trace_status: traceStatus,
            owner_proof: 'verified_alive', reconcile_after_unix_ms: null, reconciled: false,
        };
        if (alive === false) return {
            classification: 'owner_terminated', trace_status: traceStatus,
            owner_proof: 'verified_terminated', reconcile_after_unix_ms: null, reconciled: false,
        };
    }
    const reconcileAfter = (attempt.spawn_started_at ?? attempt.updated_at) + FORGE_EXECUTION_GRACE_MS;
    return {
        classification: now >= reconcileAfter ? 'deadline_elapsed' : 'deadline_pending',
        trace_status: traceStatus,
        owner_proof: 'unavailable',
        reconcile_after_unix_ms: reconcileAfter,
        reconciled: false,
    };
}

export function reconcileForgeAttemptIfAbandoned(
    root: string,
    db: Database.Database,
    attempt: HallForgeAttemptRecord,
    now = Date.now(),
): { attempt: HallForgeAttemptRecord; request: HallForgeRequestRecord; recovery: ForgeAttemptRecoveryState } {
    const recovery = inspectForgeAttemptRecovery(root, attempt, now);
    if (recovery.classification !== 'owner_terminated'
        && recovery.classification !== 'deadline_elapsed') {
        return {
            attempt: getForgeAttempt(db, attempt.attempt_id) ?? attempt,
            request: getForgeRequest(db, attempt.request_id)!,
            recovery,
        };
    }
    const terminal = finalizeForgeAttempt(db, {
        attempt_id: attempt.attempt_id,
        status: 'UNKNOWN',
        error_code: recovery.classification === 'owner_terminated'
            ? 'forge_execution_owner_terminated_before_terminal_trace'
            : 'forge_execution_deadline_elapsed_without_terminal_trace',
        now,
    });
    return {
        ...terminal,
        recovery: { ...recovery, reconciled: true },
    };
}
