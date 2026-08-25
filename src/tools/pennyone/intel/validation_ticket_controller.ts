import { createHash, randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';

import type { HallForgeAttemptRecord, HallForgeRequestRecord } from '../../../types/forge.js';
import {
    type HallValidationEvidenceManifest,
    VALIDATION_EVIDENCE_SHA256,
} from '../../../types/validation_evidence.js';
import {
    forgeAuthorizationLineageMatchesRequest,
    getForgeAttemptByExecutionReceipt,
    getForgeAuthorizationByRequest,
    getForgeRequest,
} from './forge_receipt_controller.js';
import {
    HALL_FORGE_VALIDATION_TICKETS_IMMUTABLE_UPDATE_TRIGGER_NAME,
    HALL_FORGE_VALIDATION_TICKETS_IMMUTABLE_UPDATE_TRIGGER_SQL,
} from './schema_tables_runtime.js';

const TICKET_PREFIX = 'cstar-validation-ticket.v1';
const TICKET_ID = /^[a-f0-9]{32}$/;
const TICKET_NONCE = /^[A-Za-z0-9_-]{43}$/;
const DEFAULT_TICKET_TTL_MS = 15 * 60 * 1000;
const MAX_TICKET_TTL_MS = 24 * 60 * 60 * 1000;

export type ValidationTicketErrorCode =
    | 'validation_ticket_malformed'
    | 'validation_ticket_not_found'
    | 'validation_ticket_already_issued'
    | 'validation_ticket_delivery_not_pending'
    | 'validation_ticket_repository_invalid'
    | 'validation_ticket_repository_mismatch'
    | 'validation_ticket_bead_invalid'
    | 'validation_ticket_bead_mismatch'
    | 'validation_ticket_receipt_invalid'
    | 'validation_ticket_receipt_mismatch'
    | 'validation_ticket_attempt_invalid'
    | 'validation_ticket_attempt_mismatch'
    | 'validation_ticket_scope_invalid'
    | 'validation_ticket_scope_mismatch'
    | 'validation_ticket_validator_invalid'
    | 'validation_ticket_validator_mismatch'
    | 'validation_ticket_validator_not_independent'
    | 'validation_ticket_expiry_invalid'
    | 'validation_ticket_expired'
    | 'validation_ticket_replayed'
    | 'validation_ticket_validation_id_invalid'
    | 'validation_ticket_binding_invalid';

export class ValidationTicketError extends Error {
    readonly code: ValidationTicketErrorCode;

    constructor(code: ValidationTicketErrorCode) {
        super(code);
        this.name = 'ValidationTicketError';
        this.code = code;
    }
}

export interface ValidationTicketIssueInput {
    repository_id: string;
    bead_id: string;
    execution_receipt_id: string;
    attempt_id: string;
    scope_sha256: string;
    validator_thread_id: string;
    validator_turn_id: string;
    expires_at?: number;
    now?: number;
}

export interface ValidationTicketIssueResult {
    ticket: string;
    ticket_id: string;
    repository_id: string;
    bead_id: string;
    execution_receipt_id: string;
    attempt_id: string;
    scope_sha256: string;
    expires_at: number;
}

export interface ValidationTicketConsumeInput {
    ticket: string;
    repository_id: string;
    bead_id: string;
    execution_receipt_id: string;
    attempt_id: string;
    scope_sha256: string;
    validator_thread_id: string;
    validator_turn_id: string;
    validation_id: string;
    now?: number;
}

export interface VerifiedValidationIdentityInput {
    validator_identity: string;
    request_thread_id?: string;
    request_turn_id?: string;
    manifest: HallValidationEvidenceManifest;
}

export interface IndependentValidatorIdentity {
    thread_id: string;
    turn_id: string;
}

export interface ConsumedValidationTicket {
    ticket_id: string;
    repository_id: string;
    bead_id: string;
    execution_receipt_id: string;
    attempt_id: string;
    scope_sha256: string;
    validator_thread_id: string;
    validator_turn_id: string;
    expires_at: number;
    consumed_at: number;
    validation_id: string;
}

interface StoredValidationTicket extends Omit<ConsumedValidationTicket, 'consumed_at' | 'validation_id'> {
    ticket_sha256: string;
    nonce_sha256: string;
    consumed_at: number | null;
    validation_id: string | null;
}

interface TicketParts {
    token: string;
    ticket_id: string;
    nonce: string;
    ticket_sha256: string;
    nonce_sha256: string;
}

function fail(code: ValidationTicketErrorCode): never {
    throw new ValidationTicketError(code);
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function text(value: unknown, code: ValidationTicketErrorCode): string {
    if (typeof value !== 'string' || value.trim().length === 0) fail(code);
    return value.trim();
}

function scopeHash(value: unknown, code: ValidationTicketErrorCode): string {
    const normalized = text(value, code).toLowerCase();
    if (!VALIDATION_EVIDENCE_SHA256.test(normalized)) fail(code);
    return normalized;
}

function ticketParts(value: unknown): TicketParts {
    if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
        fail('validation_ticket_malformed');
    }
    const parts = value.split('.');
    if (parts.length !== 4 || `${parts[0]}.${parts[1]}` !== TICKET_PREFIX
        || !TICKET_ID.test(parts[2]) || !TICKET_NONCE.test(parts[3])) {
        fail('validation_ticket_malformed');
    }
    return {
        token: value,
        ticket_id: parts[2],
        nonce: parts[3],
        ticket_sha256: sha256(value),
        nonce_sha256: sha256(parts[3]),
    };
}

export function deriveIndependentValidatorIdentity(
    evidence: VerifiedValidationIdentityInput,
): IndependentValidatorIdentity {
    if (evidence.manifest.schema === 'cstar.validation-evidence.v3') {
        const validatorThreadId = evidence.manifest.independence.validator_thread_id;
        const validatorTurnId = evidence.manifest.independence.validator_turn_id;
        if (!validatorThreadId || !validatorTurnId
            || evidence.validator_identity
                !== `codex-subagent:${validatorThreadId}:turn:${validatorTurnId}`) {
            fail('validation_ticket_validator_invalid');
        }
        return { thread_id: validatorThreadId, turn_id: validatorTurnId };
    }
    if (evidence.manifest.schema === 'cstar.validation-evidence.v2') {
        const validatorThreadId = text(
            evidence.request_thread_id, 'validation_ticket_validator_invalid',
        );
        const validatorTurnId = text(
            evidence.request_turn_id, 'validation_ticket_validator_invalid',
        );
        if (evidence.manifest.independence.validator_thread_id !== validatorThreadId
            || evidence.validator_identity
            !== `codex-thread:${validatorThreadId}:turn:${validatorTurnId}`) {
            fail('validation_ticket_validator_invalid');
        }
        return { thread_id: validatorThreadId, turn_id: validatorTurnId };
    }
    fail('validation_ticket_validator_invalid');
}

function issueExpiry(input: ValidationTicketIssueInput, now: number): number {
    const expiresAt = input.expires_at ?? now + DEFAULT_TICKET_TTL_MS;
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now
        || expiresAt - now > MAX_TICKET_TTL_MS) {
        fail('validation_ticket_expiry_invalid');
    }
    return expiresAt;
}

function forgeBinding(
    db: Database.Database,
    input: ValidationTicketIssueInput,
): { attempt: HallForgeAttemptRecord; request: HallForgeRequestRecord } {
    const repositoryId = text(input.repository_id, 'validation_ticket_repository_invalid');
    const beadId = text(input.bead_id, 'validation_ticket_bead_invalid');
    const executionReceiptId = text(input.execution_receipt_id, 'validation_ticket_receipt_invalid');
    const attemptId = text(input.attempt_id, 'validation_ticket_attempt_invalid');
    const requestedScope = scopeHash(input.scope_sha256, 'validation_ticket_scope_invalid');
    const validatorThreadId = text(input.validator_thread_id, 'validation_ticket_validator_invalid');
    text(input.validator_turn_id, 'validation_ticket_validator_invalid');

    const attempt = getForgeAttemptByExecutionReceipt(db, executionReceiptId);
    if (!attempt) fail('validation_ticket_receipt_mismatch');
    if (attempt.attempt_id !== attemptId) fail('validation_ticket_attempt_mismatch');
    const request = getForgeRequest(db, attempt.request_id);
    if (!request) fail('validation_ticket_binding_invalid');
    if (request.repo_id !== repositoryId) fail('validation_ticket_repository_mismatch');
    if (request.bead_id !== beadId) fail('validation_ticket_bead_mismatch');
    if (request.target_paths_sha256.toLowerCase() !== requestedScope) {
        fail('validation_ticket_scope_mismatch');
    }
    if (attempt.status !== 'STARTED'
        || !attempt.result_status?.startsWith('DELIVERED_PENDING_VALIDATION:')) {
        fail('validation_ticket_delivery_not_pending');
    }

    const authorization = getForgeAuthorizationByRequest(db, request.request_id);
    if (!forgeAuthorizationLineageMatchesRequest(request, authorization)) {
        fail('validation_ticket_binding_invalid');
    }
    if (validatorThreadId === request.requester_thread_id
        || validatorThreadId === authorization.operator_thread_id) {
        fail('validation_ticket_validator_not_independent');
    }
    return { attempt, request };
}

function storedTicket(row: Record<string, unknown>): StoredValidationTicket {
    return {
        ticket_id: String(row.ticket_id),
        ticket_sha256: String(row.ticket_sha256),
        nonce_sha256: String(row.nonce_sha256),
        repository_id: String(row.repo_id),
        bead_id: String(row.bead_id),
        execution_receipt_id: String(row.execution_receipt_id),
        attempt_id: String(row.attempt_id),
        scope_sha256: String(row.scope_sha256),
        validator_thread_id: String(row.validator_thread_id),
        validator_turn_id: String(row.validator_turn_id),
        expires_at: Number(row.expires_at),
        consumed_at: row.consumed_at === null || row.consumed_at === undefined
            ? null : Number(row.consumed_at),
        validation_id: row.consumed_validation_id === null || row.consumed_validation_id === undefined
            ? null : String(row.consumed_validation_id),
    };
}

function normalizeTriggerSql(sql: string): string {
    return sql
        .replace(/\bIF\s+NOT\s+EXISTS\b/gi, '')
        .replace(/;\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function assertCanonicalImmutableUpdateTrigger(db: Database.Database): void {
    const persisted = db.prepare(`
        SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?
    `).get(HALL_FORGE_VALIDATION_TICKETS_IMMUTABLE_UPDATE_TRIGGER_NAME) as
        { sql?: string } | undefined;
    if (typeof persisted?.sql !== 'string'
        || normalizeTriggerSql(persisted.sql)
            !== normalizeTriggerSql(HALL_FORGE_VALIDATION_TICKETS_IMMUTABLE_UPDATE_TRIGGER_SQL)) {
        fail('validation_ticket_binding_invalid');
    }
}

function replaceExpiredTicket(
    db: Database.Database,
    existing: Record<string, unknown>,
    input: ValidationTicketIssueInput,
    binding: { attempt: HallForgeAttemptRecord; request: HallForgeRequestRecord },
    expiresAt: number,
    now: number,
    token: string,
    ticketId: string,
    nonce: string,
    scope: string,
): ValidationTicketIssueResult {
    assertCanonicalImmutableUpdateTrigger(db);
    db.prepare(`DROP TRIGGER ${HALL_FORGE_VALIDATION_TICKETS_IMMUTABLE_UPDATE_TRIGGER_NAME}`).run();
    try {
        const replaced = db.prepare(`
            UPDATE hall_forge_validation_tickets
            SET ticket_id = ?, ticket_sha256 = ?, nonce_sha256 = ?,
                validator_thread_id = ?, validator_turn_id = ?,
                expires_at = ?, issued_at = ?, consumed_at = NULL,
                consumed_validation_id = NULL
            WHERE ticket_id = ? AND execution_receipt_id = ? AND attempt_id = ?
              AND consumed_at IS NULL AND expires_at <= ?
        `).run(
            ticketId,
            sha256(token),
            sha256(nonce),
            input.validator_thread_id.trim(),
            input.validator_turn_id.trim(),
            expiresAt,
            now,
            String(existing.ticket_id),
            binding.attempt.execution_receipt_id,
            binding.attempt.attempt_id,
            now,
        );
        if (replaced.changes !== 1) fail('validation_ticket_already_issued');
        db.exec(HALL_FORGE_VALIDATION_TICKETS_IMMUTABLE_UPDATE_TRIGGER_SQL);
        assertCanonicalImmutableUpdateTrigger(db);
    } catch (error) {
        db.exec(HALL_FORGE_VALIDATION_TICKETS_IMMUTABLE_UPDATE_TRIGGER_SQL);
        assertCanonicalImmutableUpdateTrigger(db);
        throw error;
    }
    return {
        ticket: token,
        ticket_id: ticketId,
        repository_id: binding.request.repo_id,
        bead_id: binding.request.bead_id,
        execution_receipt_id: binding.attempt.execution_receipt_id,
        attempt_id: binding.attempt.attempt_id,
        scope_sha256: scope,
        expires_at: expiresAt,
    };
}

export function issueIndependentValidatorTicket(
    db: Database.Database,
    input: ValidationTicketIssueInput,
): ValidationTicketIssueResult {
    const now = input.now ?? Date.now();
    if (!Number.isSafeInteger(now) || now < 0) fail('validation_ticket_expiry_invalid');
    const expiresAt = issueExpiry(input, now);
    const issued = db.transaction(() => {
        const binding = forgeBinding(db, input);
        const existing = db.prepare(`
            SELECT ticket_id, repo_id, bead_id, execution_receipt_id, attempt_id,
                   scope_sha256, expires_at, consumed_at
            FROM hall_forge_validation_tickets
            WHERE execution_receipt_id = ? OR attempt_id = ?
        `).get(binding.attempt.execution_receipt_id, binding.attempt.attempt_id);
        if (existing) {
            const row = existing as Record<string, unknown>;
            if (String(row.repo_id) !== binding.request.repo_id) {
                fail('validation_ticket_repository_mismatch');
            }
            if (String(row.bead_id) !== binding.request.bead_id) {
                fail('validation_ticket_bead_mismatch');
            }
            if (String(row.execution_receipt_id) !== binding.attempt.execution_receipt_id) {
                fail('validation_ticket_receipt_mismatch');
            }
            if (String(row.attempt_id) !== binding.attempt.attempt_id) {
                fail('validation_ticket_attempt_mismatch');
            }
            const scope = input.scope_sha256.trim().toLowerCase();
            if (String(row.scope_sha256) !== scope) fail('validation_ticket_scope_mismatch');
            const existingExpiresAt = Number(row.expires_at);
            if (!Number.isSafeInteger(existingExpiresAt)) fail('validation_ticket_binding_invalid');
            if (row.consumed_at !== null && row.consumed_at !== undefined) {
                fail('validation_ticket_already_issued');
            }
            if (existingExpiresAt > now) fail('validation_ticket_already_issued');

            const ticketId = randomBytes(16).toString('hex');
            const nonce = randomBytes(32).toString('base64url');
            const token = `${TICKET_PREFIX}.${ticketId}.${nonce}`;
            return replaceExpiredTicket(
                db, row, input, binding, expiresAt, now, token, ticketId, nonce, scope,
            );
        }

        const ticketId = randomBytes(16).toString('hex');
        const nonce = randomBytes(32).toString('base64url');
        const token = `${TICKET_PREFIX}.${ticketId}.${nonce}`;
        const scope = input.scope_sha256.trim().toLowerCase();
        db.prepare(`
            INSERT INTO hall_forge_validation_tickets (
                ticket_id, ticket_sha256, nonce_sha256, repo_id, bead_id,
                execution_receipt_id, attempt_id, scope_sha256,
                validator_thread_id, validator_turn_id, expires_at, issued_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            ticketId,
            sha256(token),
            sha256(nonce),
            binding.request.repo_id,
            binding.request.bead_id,
            binding.attempt.execution_receipt_id,
            binding.attempt.attempt_id,
            scope,
            input.validator_thread_id.trim(),
            input.validator_turn_id.trim(),
            expiresAt,
            now,
        );
        return {
            ticket: token,
            ticket_id: ticketId,
            repository_id: binding.request.repo_id,
            bead_id: binding.request.bead_id,
            execution_receipt_id: binding.attempt.execution_receipt_id,
            attempt_id: binding.attempt.attempt_id,
            scope_sha256: scope,
            expires_at: expiresAt,
        };
    });
    return issued.immediate();
}

export function consumeIndependentValidatorTicket(
    db: Database.Database,
    input: ValidationTicketConsumeInput,
): ConsumedValidationTicket {
    const parts = ticketParts(input.ticket);
    const row = db.prepare(`
        SELECT ticket_id, ticket_sha256, nonce_sha256, repo_id, bead_id,
               execution_receipt_id, attempt_id, scope_sha256,
               validator_thread_id, validator_turn_id, expires_at,
               consumed_at, consumed_validation_id
        FROM hall_forge_validation_tickets WHERE ticket_sha256 = ?
    `).get(parts.ticket_sha256) as Record<string, unknown> | undefined;
    if (!row) fail('validation_ticket_not_found');
    const stored = storedTicket(row);
    if (stored.ticket_id !== parts.ticket_id || stored.nonce_sha256 !== parts.nonce_sha256) {
        fail('validation_ticket_binding_invalid');
    }
    if (stored.consumed_at !== null) fail('validation_ticket_replayed');
    if (input.repository_id !== stored.repository_id) fail('validation_ticket_repository_mismatch');
    if (input.bead_id !== stored.bead_id) fail('validation_ticket_bead_mismatch');
    if (input.execution_receipt_id !== stored.execution_receipt_id) {
        fail('validation_ticket_receipt_mismatch');
    }
    if (input.attempt_id !== stored.attempt_id) fail('validation_ticket_attempt_mismatch');
    if (scopeHash(input.scope_sha256, 'validation_ticket_scope_invalid') !== stored.scope_sha256) {
        fail('validation_ticket_scope_mismatch');
    }
    if (input.validator_thread_id !== stored.validator_thread_id
        || input.validator_turn_id !== stored.validator_turn_id) {
        fail('validation_ticket_validator_mismatch');
    }
    const validationId = text(input.validation_id, 'validation_ticket_validation_id_invalid');
    const now = input.now ?? Date.now();
    if (!Number.isSafeInteger(now) || now >= stored.expires_at) fail('validation_ticket_expired');

    const consumedAt = now;
    const changed = db.prepare(`
        UPDATE hall_forge_validation_tickets
        SET consumed_at = ?, consumed_validation_id = ?
        WHERE ticket_id = ? AND consumed_at IS NULL
    `).run(consumedAt, validationId, stored.ticket_id);
    if (changed.changes !== 1) fail('validation_ticket_replayed');
    return {
        ticket_id: stored.ticket_id,
        repository_id: stored.repository_id,
        bead_id: stored.bead_id,
        execution_receipt_id: stored.execution_receipt_id,
        attempt_id: stored.attempt_id,
        scope_sha256: stored.scope_sha256,
        validator_thread_id: stored.validator_thread_id,
        validator_turn_id: stored.validator_turn_id,
        expires_at: stored.expires_at,
        consumed_at: consumedAt,
        validation_id: validationId,
    };
}

export const issueForgeValidationTicket = issueIndependentValidatorTicket;
export const consumeForgeValidationTicket = consumeIndependentValidatorTicket;
