import { createHash } from 'node:crypto';
import fs from 'node:fs';

import type { McpRequestContext } from '../contracts/request_context.js';
import {
    classifyCodexSessionRecord,
    createCanonicalCodexUserTurnAccumulator,
    type CanonicalCodexUserTurn,
} from './codex_request_identity.js';
import {
    scanFixedCodexSession,
    type FixedCodexSessionRecord,
} from './codex_session_authority_projection.js';
import {
    findCodexSessionFile,
    MAX_CODEX_SESSION_FILE_BYTES,
    resolveCodexSessionsRoot,
} from './codex_session_locator.js';
import {
    assertOperatorAuthorizationScope,
    hasContradictoryForgeLaneInstruction,
    type OperatorAuthorizationScope,
} from './operator_authorization_scope.js';
export type { OperatorAuthorizationScope } from './operator_authorization_scope.js';

const CODEX_AUTHORIZATION_REF = /^codex-thread:([0-9a-f-]{36}):turn:([0-9a-f-]{36}):sha256:([a-f0-9]{64})$/;
const MAX_AUTHORIZATION_AGE_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface VerifiedCodexRequestIdentity {
    source: 'codex_request_meta';
    session_id: string;
    thread_id: string;
    turn_id: string;
    thread_source: 'user';
    turn_record_sha256: string;
    turn_record_set_sha256: string;
    turn_record_count: number;
    turn_first_timestamp: string;
    turn_timestamp: string;
}

export interface VerifiedOperatorAuthorization {
    provider: 'codex-session';
    reference: string;
    thread_id: string;
    turn_id: string;
    message_sha256: string;
    session_record_sha256: string;
    session_record_set_sha256: string;
    session_record_count: number;
    session_record_first_timestamp: string;
    session_record_timestamp: string;
    authorized_at: number;
    expires_at: number;
    authorized_paths: string[];
    authorization_profile: 'gpt56-cstar-exact-request-v3';
    authorized_bead_id: string | null;
    authorized_decision_id: string | null;
    authorized_package_lock_sha256s: string[];
    synthetic_fixtures_only: boolean;
    max_attempts: 1;
    live_source_allowed: false;
}

interface CodexTurnMetadata {
    session_id?: unknown;
    thread_id?: unknown;
    turn_id?: unknown;
    parent_thread_id?: unknown;
    forked_from_thread_id?: unknown;
    subagent_kind?: unknown;
    thread_source?: unknown;
}

export interface ParsedCodexTurnMetadata {
    session_id: string;
    thread_id: string;
    turn_id: string;
}

interface AuthorizedTurn {
    text: string;
    canonicalContent: string;
    timestamp: string;
    recordSha256: string;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isLaterAuthorizationConflict(text: string): boolean {
    return hasContradictoryForgeLaneInstruction(text)
        || /\b(?:do\s+not|don't|no\s+longer)\s+authorize\b/i.test(text)
        || (/\b(?:revoke|withdraw|cancel)\b/i.test(text)
            && /\b(?:authorization|permission|forge|audit|execute|spend)\b/i.test(text))
        || /^\s*(?:stop|pause|cancel|wait|hold\s+on)[.!]?\s*$/i.test(text);
}

function optionalIdentityFieldIsEmpty(value: unknown): boolean {
    return value === undefined || value === null || value === '';
}

function createAuthorizedTurnMatcher(
    expectedThreadId: string,
    turnId: string,
    expectedMessageSha256: string,
): { consume(record: FixedCodexSessionRecord): void; finish(): AuthorizedTurn } {
    let canonicalUserSession = false;
    let matched: AuthorizedTurn | null = null;
    let matchingRecords = 0;
    let matchedAuthorization = false;
    const consume = ({ row, rawLine }: FixedCodexSessionRecord): void => {
        const payload = isRecord(row.payload) ? row.payload : undefined;
        if (row.type === 'session_meta') {
            canonicalUserSession = payload?.id === expectedThreadId
                && payload.thread_source === 'user'
                && optionalIdentityFieldIsEmpty(payload.parent_thread_id)
                && optionalIdentityFieldIsEmpty(payload.agent_path)
                && optionalIdentityFieldIsEmpty(payload.forked_from_id);
            return;
        }
        const classification = classifyCodexSessionRecord(row);
        if (classification.kind === 'noncanonical-user-like') {
            if (matchedAuthorization && classification.turnId !== undefined) {
                throw new Error('operator_authorization_later_user_record_uninspectable');
            }
            return;
        }
        if (classification.kind !== 'canonical-root-user' || !payload) return;
        const rawContent: unknown = payload.content;
        const content = Array.isArray(rawContent) ? rawContent.filter(isRecord) : [];
        const text = content
            .filter((entry) => entry.type === 'input_text' && typeof entry.text === 'string')
            .map((entry) => entry.text as string)
            .join('');
        const canonicalInputTextContent = Array.isArray(rawContent)
            && content.length === rawContent.length && content.length > 0
            && content.every((entry) => entry.type === 'input_text' && typeof entry.text === 'string')
            && Boolean(text.trim());
        if (matchedAuthorization && !canonicalInputTextContent) {
            throw new Error('operator_authorization_later_user_record_uninspectable');
        }
        if (matchedAuthorization && isLaterAuthorizationConflict(text)) {
            throw new Error('operator_authorization_later_revocation_found');
        }
        const metadata = isRecord(payload.internal_chat_message_metadata_passthrough)
            ? payload.internal_chat_message_metadata_passthrough : undefined;
        if (metadata?.turn_id !== turnId) return;
        if (!canonicalUserSession) {
            throw new Error('operator_authorization_turn_is_not_from_canonical_user_thread');
        }
        if (!canonicalInputTextContent || typeof row.timestamp !== 'string') {
            throw new Error('operator_authorization_turn_is_incomplete');
        }
        const canonicalContent = JSON.stringify(content.map((entry) => ({ type: 'input_text', text: entry.text })));
        if (sha256(canonicalContent) !== expectedMessageSha256) return;
        matchingRecords += 1;
        matchedAuthorization = true;
        matched = { text, canonicalContent, timestamp: row.timestamp, recordSha256: sha256(rawLine) };
    };
    const finish = (): AuthorizedTurn => {
        if (matchingRecords !== 1 || !matched) {
            throw new Error(`operator_authorization_turn_match_count:${matchingRecords}`);
        }
        return matched;
    };
    return { consume, finish };
}

export function parseCodexTurnMetadata(context: McpRequestContext | undefined): ParsedCodexTurnMetadata {
    const meta = context?._meta;
    if (!isRecord(meta)) throw new Error('codex_request_identity_metadata_required');
    const topLevelThreadId = meta.threadId;
    const turnMetadata = meta['x-codex-turn-metadata'];
    if (typeof topLevelThreadId !== 'string' || !UUID_PATTERN.test(topLevelThreadId)) {
        throw new Error('codex_request_identity_thread_id_invalid');
    }
    if (!isRecord(turnMetadata)) throw new Error('codex_request_identity_turn_metadata_required');
    const nested = turnMetadata as CodexTurnMetadata;
    if (
        typeof nested.session_id !== 'string'
        || typeof nested.thread_id !== 'string'
        || typeof nested.turn_id !== 'string'
        || !UUID_PATTERN.test(nested.session_id)
        || !UUID_PATTERN.test(nested.thread_id)
        || !UUID_PATTERN.test(nested.turn_id)
    ) {
        throw new Error('codex_request_identity_turn_metadata_ids_invalid');
    }
    if (nested.thread_id !== topLevelThreadId || nested.session_id !== nested.thread_id) {
        throw new Error('codex_request_identity_thread_mismatch');
    }
    if (nested.thread_source !== 'user') {
        throw new Error('codex_request_identity_requires_root_user_thread');
    }
    if (
        !optionalIdentityFieldIsEmpty(nested.parent_thread_id)
        || !optionalIdentityFieldIsEmpty(nested.forked_from_thread_id)
        || !optionalIdentityFieldIsEmpty(nested.subagent_kind)
    ) {
        throw new Error('codex_request_identity_rejects_parent_fork_or_subagent');
    }
    return {
        session_id: nested.session_id,
        thread_id: nested.thread_id,
        turn_id: nested.turn_id,
    };
}

function verifiedRequestIdentity(
    metadata: ParsedCodexTurnMetadata,
    turn: CanonicalCodexUserTurn,
): VerifiedCodexRequestIdentity {
    return {
        source: 'codex_request_meta',
        session_id: metadata.session_id,
        thread_id: metadata.thread_id,
        turn_id: metadata.turn_id,
        thread_source: 'user',
        turn_record_sha256: turn.recordSha256,
        turn_record_set_sha256: turn.recordSetSha256,
        turn_record_count: turn.recordCount,
        turn_first_timestamp: turn.firstTimestamp,
        turn_timestamp: turn.timestamp,
    };
}

/** Bind one MCP request to a canonical root-user turn in one fixed scan. */
export async function verifyCodexRequestIdentity(
    context: McpRequestContext | undefined,
    now = Date.now(),
): Promise<VerifiedCodexRequestIdentity> {
    const metadata = parseCodexTurnMetadata(context);
    const sessionsRoot = resolveCodexSessionsRoot();
    const sessionFile = findCodexSessionFile(sessionsRoot, metadata.thread_id);
    const accumulator = createCanonicalCodexUserTurnAccumulator(
        metadata.thread_id,
        metadata.turn_id,
        now,
        MAX_AUTHORIZATION_AGE_MS,
    );
    scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, accumulator.consume);
    return verifiedRequestIdentity(metadata, accumulator.finish());
}

export async function verifyOperatorAuthorization(
    reference: string,
    scope: OperatorAuthorizationScope = {},
): Promise<VerifiedOperatorAuthorization> {
    const match = CODEX_AUTHORIZATION_REF.exec(reference.trim());
    if (!match) {
        throw new Error('operator_authorization_reference_format_invalid');
    }
    const [, threadId, turnId, expectedMessageSha256] = match;
    let callerThreadId = scope.caller_thread_id ?? process.env.CSTAR_MCP_CALLER_THREAD_ID?.trim();
    const callerTransport = scope.caller_transport ?? process.env.CSTAR_MCP_CALLER_TRANSPORT?.trim();
    if (callerTransport !== 'direct-stdio') {
        throw new Error('operator_authorization_requires_direct_stdio_connection');
    }
    const now = scope.now ?? Date.now();
    let requestMetadata: ParsedCodexTurnMetadata | undefined;
    if (scope.request_context) {
        requestMetadata = parseCodexTurnMetadata(scope.request_context);
        if (callerThreadId && callerThreadId !== requestMetadata.thread_id) {
            throw new Error('operator_authorization_request_identity_mismatch');
        }
        callerThreadId = requestMetadata.thread_id;
    }
    if (!callerThreadId || callerThreadId !== threadId) {
        throw new Error('operator_authorization_thread_not_bound_to_connection');
    }
    const sessionsRoot = resolveCodexSessionsRoot();
    const sessionFile = findCodexSessionFile(sessionsRoot, threadId!);
    const requestAccumulator = requestMetadata
        ? createCanonicalCodexUserTurnAccumulator(
            requestMetadata.thread_id,
            requestMetadata.turn_id,
            now,
            MAX_AUTHORIZATION_AGE_MS,
        ) : undefined;
    const authorizationMatcher = createAuthorizedTurnMatcher(
        threadId!,
        turnId!,
        expectedMessageSha256!,
    );
    const authorizationAccumulator = createCanonicalCodexUserTurnAccumulator(
        threadId!,
        turnId!,
        now,
        MAX_AUTHORIZATION_AGE_MS,
        true,
    );
    let requestFailure: Error | undefined;
    let matcherFailure: Error | undefined;
    let authorizationFailure: Error | undefined;
    scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, (record) => {
        if (requestAccumulator && !requestFailure) {
            try { requestAccumulator.consume(record); } catch (error) {
                requestFailure = error instanceof Error ? error : new Error('codex_request_identity_projection_failed');
            }
        }
        if (!matcherFailure) {
            try { authorizationMatcher.consume(record); } catch (error) {
                matcherFailure = error instanceof Error ? error : new Error('operator_authorization_projection_failed');
            }
        }
        if (!authorizationFailure) {
            try { authorizationAccumulator.consume(record); } catch (error) {
                authorizationFailure = error instanceof Error ? error : new Error('operator_authorization_projection_failed');
            }
        }
    });
    if (requestFailure) throw requestFailure;
    const requestIdentity = requestAccumulator && requestMetadata
        ? verifiedRequestIdentity(requestMetadata, requestAccumulator.finish())
        : undefined;
    if (matcherFailure) throw matcherFailure;
    const authorizedTurn = authorizationMatcher.finish();
    const authorizedAt = Date.parse(authorizedTurn.timestamp);
    if (!Number.isFinite(authorizedAt) || authorizedAt > now + 60_000 || now - authorizedAt > MAX_AUTHORIZATION_AGE_MS) {
        throw new Error('operator_authorization_expired_or_future_dated');
    }
    if (authorizationFailure) throw authorizationFailure;
    const canonicalTurn = authorizationAccumulator.finish();
    if (!canonicalTurn.recordSha256s.includes(authorizedTurn.recordSha256)) {
        throw new Error('operator_authorization_reference_record_not_in_canonical_turn');
    }
    if (requestIdentity?.turn_id === turnId && (
        requestIdentity.turn_record_sha256 !== canonicalTurn.recordSha256
        || requestIdentity.turn_record_set_sha256 !== canonicalTurn.recordSetSha256
        || requestIdentity.turn_record_count !== canonicalTurn.recordCount
    )) {
        throw new Error('operator_authorization_request_identity_mismatch');
    }
    const messageSha256 = sha256(authorizedTurn.canonicalContent);
    if (messageSha256 !== expectedMessageSha256) {
        throw new Error('operator_authorization_message_hash_mismatch');
    }
    const authorizedPaths = assertOperatorAuthorizationScope(authorizedTurn.text, scope);
    return {
        provider: 'codex-session',
        reference: reference.trim(),
        thread_id: threadId!,
        turn_id: turnId!,
        message_sha256: messageSha256,
        session_record_sha256: authorizedTurn.recordSha256,
        session_record_set_sha256: canonicalTurn.recordSetSha256,
        session_record_count: canonicalTurn.recordCount,
        session_record_first_timestamp: canonicalTurn.firstTimestamp,
        session_record_timestamp: canonicalTurn.timestamp,
        authorized_at: authorizedAt,
        expires_at: authorizedAt + MAX_AUTHORIZATION_AGE_MS,
        authorized_paths: authorizedPaths,
        authorization_profile: 'gpt56-cstar-exact-request-v3',
        authorized_bead_id: scope.bead_id?.trim() || null,
        authorized_decision_id: scope.decision_id?.trim() || null,
        authorized_package_lock_sha256s: (scope.package_lock_sha256s ?? [])
            .map((digest) => digest.trim().toLowerCase()),
        synthetic_fixtures_only: scope.requires_synthetic_fixtures_only === true,
        max_attempts: 1,
        live_source_allowed: false,
    };
}
