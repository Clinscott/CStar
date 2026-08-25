import { createHash } from 'node:crypto';

import type { McpRequestContext } from '../contracts/request_context.js';
import {
    classifyCodexSessionRecord,
    createCanonicalCodexUserTurnAccumulator,
} from './codex_request_identity.js';
import {
    createCodexPlatformContextProjection,
    scanFixedCodexSession,
    type FixedCodexSessionRecord,
} from './codex_session_authority_projection.js';
import {
    findCodexSessionFile,
    MAX_CODEX_SESSION_FILE_BYTES,
    resolveCodexSessionsRoot,
} from './codex_session_locator.js';
import {
    parseCodexTurnMetadata,
    verifyCodexRequestIdentity,
    type VerifiedCodexRequestIdentity,
} from './operator_authorization.js';
import { isForgeAuthorityRevocation } from './forge_revocation.js';

const AUTHORIZATION_AGE_MS = 24 * 60 * 60 * 1_000;
const REQUEST_ID = /^dispatch-forge-[a-f0-9]{32}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export interface ForgeChallengeAuthorization {
    reference: string;
    thread_id: string;
    turn_id: string;
    message_sha256: string;
    session_record_sha256: string;
    session_record_set_sha256: string;
    session_record_count: 1;
    authorized_at: number;
    expires_at: number;
}

export interface HistoricalForgeChallengeAuthorization extends Omit<
    ForgeChallengeAuthorization,
    'expires_at'
> {
    scope_authority: 'historical_exact_challenge';
}

interface HistoricalChallengeCandidate {
    turnId: string;
    timestamp: string;
    timestampMs: number;
    index: number;
    recordSha256: string;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function buildForgeAuthorizationChallenge(
    requestId: string,
    requestSha256: string,
    executionGrantSha256?: string,
): string {
    if (!REQUEST_ID.test(requestId) || !SHA256.test(requestSha256)
        || (executionGrantSha256 !== undefined && !SHA256.test(executionGrantSha256))) {
        throw new Error('forge_authorization_challenge_binding_invalid');
    }
    const runtimeLineage = executionGrantSha256
        ? [
            'legacy_v2_provider=hermes',
            'legacy_v2_model=minimax/MiniMax-M3',
        ]
        : [
            'transport=codex-host',
            'requested_selector=gpt-5.6-luna',
            'requested_reasoning=max',
            'actual_identity=unreported',
        ];
    return [
        'CSTAR_FORGE_AUTHORIZE',
        executionGrantSha256 ? 'v2-compat-v1' : 'v1',
        `request_id=${requestId}`,
        `request_sha256=${requestSha256}`,
        ...(executionGrantSha256
            ? [`compatibility_manifest_sha256=${executionGrantSha256}`]
            : []),
        'attempt_limit=1',
        'retry_limit=0',
        'fixture_policy=synthetic_only',
        'live_source=false',
        ...runtimeLineage,
    ].join(' ');
}

export function hashForgeAuthorizationChallenge(
    requestId: string,
    requestSha256: string,
    executionGrantSha256?: string,
): string {
    return sha256(buildForgeAuthorizationChallenge(
        requestId,
        requestSha256,
        executionGrantSha256,
    ));
}

function exactChallengeText(record: FixedCodexSessionRecord, turnId: string): string | null {
    const classification = classifyCodexSessionRecord(record.row);
    if (classification.kind !== 'canonical-root-user' || classification.turnId !== turnId) return null;
    const payload = isRecord(record.row.payload) ? record.row.payload : null;
    const content = payload?.content;
    if (!Array.isArray(content) || content.length !== 1) {
        throw new Error('forge_authorization_challenge_must_be_sole_input_text');
    }
    const item = content[0];
    if (!isRecord(item) || item.type !== 'input_text' || typeof item.text !== 'string') {
        throw new Error('forge_authorization_challenge_must_be_sole_input_text');
    }
    return item.text;
}

function inspectableRootUserText(record: FixedCodexSessionRecord): string | null {
    const classification = classifyCodexSessionRecord(record.row);
    if (classification.kind !== 'canonical-root-user' || !classification.rootLineage
        || typeof classification.turnId !== 'string') return null;
    const payload = isRecord(record.row.payload) ? record.row.payload : undefined;
    const content = payload?.content;
    if (!Array.isArray(content) || content.length === 0
        || content.some((item) => !isRecord(item)
            || item.type !== 'input_text' || typeof item.text !== 'string')) return null;
    const text = content.map((item) => String((item as Record<string, unknown>).text)).join('');
    return text.trim() ? text : null;
}

function singletonRecordSetSha256(
    threadId: string,
    turnId: string,
    timestamp: string,
    recordSha256: string,
): string {
    return sha256(JSON.stringify({
        schema: 'cstar.codex_root_user_turn_record_set.v1',
        thread_id: threadId,
        turn_id: turnId,
        records: [{ index: 0, timestamp, record_sha256: recordSha256 }],
    }));
}

export async function verifyCurrentForgeAuthorizationChallenge(
    context: McpRequestContext | undefined,
    requestId: string,
    requestSha256: string,
    executionGrantSha256?: string,
    now = Date.now(),
): Promise<ForgeChallengeAuthorization> {
    const expected = buildForgeAuthorizationChallenge(
        requestId,
        requestSha256,
        executionGrantSha256,
    );
    const metadata = parseCodexTurnMetadata(context);
    const initial = await verifyCodexRequestIdentity(context, now);
    const sessionFile = findCodexSessionFile(resolveCodexSessionsRoot(), metadata.thread_id);
    const canonical = createCanonicalCodexUserTurnAccumulator(
        metadata.thread_id,
        metadata.turn_id,
        now,
        AUTHORIZATION_AGE_MS,
    );
    const texts: string[] = [];
    const textProjection = createCodexPlatformContextProjection((record) => {
        const text = exactChallengeText(record, metadata.turn_id);
        if (text !== null) texts.push(text);
    });
    scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, (record) => {
        canonical.consume(record);
        textProjection.consume(record);
    });
    textProjection.finish();
    const turn = canonical.finish();
    if (
        initial.turn_record_set_sha256 !== turn.recordSetSha256
        || initial.turn_record_count !== turn.recordCount
        || turn.recordCount !== 1
        || texts.length !== 1
        || texts[0] !== expected
    ) {
        throw new Error('forge_authorization_challenge_exact_match_required');
    }
    const turnTimestamp = Date.parse(turn.timestamp);
    const expiresAt = turnTimestamp + AUTHORIZATION_AGE_MS;
    if (!Number.isFinite(turnTimestamp) || now >= expiresAt) {
        throw new Error('forge_authorization_challenge_expired');
    }
    return {
        reference: [
            'cstar-forge-challenge', requestId,
            'thread', metadata.thread_id,
            'turn', metadata.turn_id,
            'record-set-sha256', turn.recordSetSha256,
        ].join(':'),
        thread_id: metadata.thread_id,
        turn_id: metadata.turn_id,
        message_sha256: sha256(expected),
        session_record_sha256: turn.recordSha256,
        session_record_set_sha256: turn.recordSetSha256,
        session_record_count: 1,
        authorized_at: turnTimestamp,
        expires_at: expiresAt,
    };
}

/** Recover prior exact scope authority without treating its expired lease as
 * current. Freshness comes from a separately verified current goal-resume turn. */
export async function verifyHistoricalForgeAuthorizationChallenge({
    threadId,
    currentIdentity,
    requestId,
    requestSha256,
}: {
    threadId: string;
    currentIdentity: VerifiedCodexRequestIdentity;
    requestId: string;
    requestSha256: string;
}): Promise<HistoricalForgeChallengeAuthorization> {
    if (currentIdentity.thread_id !== threadId) {
        throw new Error('forge_goal_continuation_current_identity_mismatch');
    }
    const beforeTimestampMs = Date.parse(currentIdentity.turn_timestamp);
    if (!Number.isFinite(beforeTimestampMs)
        || !Number.isSafeInteger(currentIdentity.turn_record_count)
        || currentIdentity.turn_record_count < 1) {
        throw new Error('forge_goal_continuation_current_identity_invalid');
    }
    const expected = buildForgeAuthorizationChallenge(requestId, requestSha256);
    const sessionFile = findCodexSessionFile(resolveCodexSessionsRoot(), threadId);
    const candidates: HistoricalChallengeCandidate[] = [];
    const currentTerminalIndices: number[] = [];
    const discovery = createCodexPlatformContextProjection((record) => {
        const classification = classifyCodexSessionRecord(record.row);
        if (classification.kind !== 'canonical-root-user' || !classification.rootLineage
            || typeof classification.turnId !== 'string') return;
        const recordSha256 = sha256(record.rawLine);
        if (classification.turnId === currentIdentity.turn_id
            && recordSha256 === currentIdentity.turn_record_sha256) {
            currentTerminalIndices.push(record.index);
        }
        const payload = isRecord(record.row.payload) ? record.row.payload : undefined;
        const content = payload?.content;
        const item = Array.isArray(content) && content.length === 1 ? content[0] : undefined;
        const timestamp = typeof record.row.timestamp === 'string' ? record.row.timestamp : '';
        const timestampMs = Date.parse(timestamp);
        if (isRecord(item) && item.type === 'input_text' && item.text === expected
            && Number.isFinite(timestampMs) && timestampMs <= beforeTimestampMs) {
            candidates.push({
                turnId: classification.turnId,
                timestamp,
                timestampMs,
                index: record.index,
                recordSha256,
            });
            if (candidates.length > 64) throw new Error('forge_historical_challenge_match_limit_exceeded');
        }
    });
    scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, discovery.consume);
    discovery.finish();
    if (currentTerminalIndices.length !== 1) {
        throw new Error('forge_goal_continuation_current_identity_mismatch');
    }
    const currentTerminalIndex = currentTerminalIndices[0]!;
    const selected = candidates.filter((candidate) => candidate.index < currentTerminalIndex)
        .sort((left, right) =>
            right.timestampMs - left.timestampMs || right.index - left.index)[0];
    if (!selected) throw new Error('forge_historical_challenge_not_found');

    const current = createCanonicalCodexUserTurnAccumulator(
        threadId,
        currentIdentity.turn_id,
        Math.max(Date.now(), beforeTimestampMs),
        Number.MAX_SAFE_INTEGER,
    );
    let selectedSeen = false;
    const lineage = createCodexPlatformContextProjection((record) => {
        const classification = classifyCodexSessionRecord(record.row);
        if (record.index < selected.index) return;
        if (record.index === selected.index) {
            if (classification.kind !== 'canonical-root-user' || !classification.rootLineage
                || classification.turnId !== selected.turnId
                || record.row.timestamp !== selected.timestamp
                || sha256(record.rawLine) !== selected.recordSha256
                || exactChallengeText(record, selected.turnId) !== expected) {
                throw new Error('forge_goal_continuation_historical_record_mismatch');
            }
            selectedSeen = true;
            return;
        }
        if (!selectedSeen) {
            throw new Error('forge_goal_continuation_historical_lineage_incomplete');
        }
        if (classification.kind === 'noncanonical-user-like') {
            throw new Error('forge_goal_continuation_later_user_record_uninspectable');
        }
        if (classification.kind !== 'canonical-root-user') return;
        if (!classification.rootLineage || typeof classification.turnId !== 'string') {
            throw new Error('forge_goal_continuation_later_user_record_uninspectable');
        }
        const text = inspectableRootUserText(record);
        if (text === null) throw new Error('forge_goal_continuation_later_user_record_uninspectable');
        if (isForgeAuthorityRevocation(text)) throw new Error('forge_goal_continuation_revoked');
    });
    scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, (record) => {
        current.consume(record);
        lineage.consume(record);
    });
    lineage.finish();
    const currentTurn = current.finish();
    if (!selectedSeen
        || currentTurn.recordSha256 !== currentIdentity.turn_record_sha256
        || currentTurn.recordSetSha256 !== currentIdentity.turn_record_set_sha256
        || currentTurn.recordCount !== currentIdentity.turn_record_count
        || currentTurn.firstTimestamp !== currentIdentity.turn_first_timestamp
        || currentTurn.timestamp !== currentIdentity.turn_timestamp) {
        throw new Error('forge_goal_continuation_historical_lineage_incomplete');
    }
    const selectedRecordSetSha256 = singletonRecordSetSha256(
        threadId, selected.turnId, selected.timestamp, selected.recordSha256,
    );
    return {
        scope_authority: 'historical_exact_challenge',
        reference: [
            'cstar-forge-challenge', requestId,
            'thread', threadId,
            'turn', selected.turnId,
            'record-set-sha256', selectedRecordSetSha256,
        ].join(':'),
        thread_id: threadId,
        turn_id: selected.turnId,
        message_sha256: sha256(expected),
        session_record_sha256: selected.recordSha256,
        session_record_set_sha256: selectedRecordSetSha256,
        session_record_count: 1,
        authorized_at: selected.timestampMs,
    };
}
