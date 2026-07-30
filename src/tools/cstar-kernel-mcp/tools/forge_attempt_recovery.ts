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
