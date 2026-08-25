import { createHash } from 'node:crypto';

import type { McpRequestContext } from '../contracts/request_context.js';
import {
    classifyCodexSessionRecord,
    createCanonicalCodexUserTurnAccumulator,
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
    parseCodexTurnMetadata,
    verifyCodexRequestIdentity,
} from './operator_authorization.js';

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
        'provider=hermes',
        'model=minimax/MiniMax-M3',
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
    scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, (record) => {
        canonical.consume(record);
        const text = exactChallengeText(record, metadata.turn_id);
        if (text !== null) texts.push(text);
    });
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
