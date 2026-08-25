import { createHash } from 'node:crypto';

import type { ForgeOperatorIntentAction } from '../../pennyone/intel/forge_authorization_policy.js';
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
import { parseCodexTurnMetadata } from './operator_authorization.js';

const AUTHORIZATION_AGE_MS = 24 * 60 * 60 * 1_000;
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/u;

export interface VerifiedForgeOperatorIntent {
    intent: 'forge_execute';
    action: ForgeOperatorIntentAction;
    normalized_text: string;
    work_reference_text: string;
    operator_authorization_ref: string;
    thread_id: string;
    turn_id: string;
    message_sha256: string;
    session_record_sha256: string;
    session_record_set_sha256: string;
    session_record_count: 1;
    authorized_at: number;
    expires_at: number;
}

interface IntentRecord {
    turnId: string;
    timestamp: string;
    recordSha256: string;
    content: Array<{ type: 'input_text'; text: string }>;
    text: string;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseIntentRecord(record: FixedCodexSessionRecord): IntentRecord | null {
    const classification = classifyCodexSessionRecord(record.row);
    if (classification.kind !== 'canonical-root-user') return null;
    if (!classification.rootLineage || typeof classification.turnId !== 'string') {
        throw new Error('forge_operator_intent_turn_uninspectable');
    }
    if (typeof record.row.timestamp !== 'string') {
        throw new Error('forge_operator_intent_turn_uninspectable');
    }
    const payload = isRecord(record.row.payload) ? record.row.payload : undefined;
    if (!Array.isArray(payload?.content) || payload.content.length === 0) {
        throw new Error('forge_operator_intent_turn_uninspectable');
    }
    const content = payload.content.map((entry) => {
        if (!isRecord(entry) || entry.type !== 'input_text' || typeof entry.text !== 'string') {
            throw new Error('forge_operator_intent_turn_uninspectable');
        }
        return { type: 'input_text' as const, text: entry.text };
    });
    const text = content.map((entry) => entry.text).join('');
    if (!text.trim()) throw new Error('forge_operator_intent_turn_uninspectable');
    return {
        turnId: classification.turnId,
        timestamp: record.row.timestamp,
        recordSha256: sha256(record.rawLine),
        content,
        text,
    };
}

function stripAuthorizationPrefix(text: string): string {
    return text.replace(
        /^(?:i\s+authorize\s+(?:you|forge)|you\s+are\s+authorized|you\s+have\s+my\s+authorization)\s+(?:to\s+)?/i,
        '',
    );
}

function actionForVerb(verb: string): ForgeOperatorIntentAction {
    const normalized = verb.toLowerCase();
    if (normalized === 'implement' || normalized === 'implementing' || normalized === 'implementation') {
        return 'implement';
    }
    if (normalized === 'repair' || normalized === 'repairing') return 'repair';
    if (normalized === 'fix' || normalized === 'fixing') return 'fix';
    if (normalized === 'forge' || normalized === 'forging') return 'route_to_forge';
    return 'build';
}

function classifyForgeIntent(text: string): {
    action: ForgeOperatorIntentAction;
    normalizedText: string;
    workReferenceText: string;
} {
    if (UNSAFE_TEXT.test(text)) throw new Error('forge_operator_intent_unsafe_text');
    const normalizedText = text.trim().replace(/\s+/g, ' ');
    if (normalizedText.includes('?')) throw new Error('forge_operator_intent_question_rejected');
    if (
        /\b(?:example|for\s+example|hypothetical|placeholder|button\s+label|documentation|quoted|quotation|if\s+i\s+were\s+to|i\s+would\s+say)\b/i.test(normalizedText)
        || /\b(?:if|unless|until|when|whenever|once|before|after|later|pending|contingent)\b/i.test(normalizedText)
        || /\b(?:subject\s+to|provided\s+that|only\s+after|once\s+(?:i|we|you|they|approval|review))\b/i.test(normalizedText)
        || /\b(?:saying|that\s+says|described\s+as|labelled|labeled|named|titled)\b/i.test(normalizedText)
        || /^(?:when|would|could|should)\b/i.test(normalizedText)
        || /["“”‘’`]/u.test(normalizedText)
        || /'[^'\r\n]{1,200}'/u.test(normalizedText)
        || /^(?:>)/.test(normalizedText)
    ) {
        throw new Error('forge_operator_intent_nonoperative_text');
    }
    if (
        /\b(?:do\s+not|don't|never|must\s+not|not\s+authorized\s+to)\s+(?:build|implement|repair|fix|forge|send|route|dispatch|continue|resume)\b/i.test(normalizedText)
        || /\bnot\s+(?:authorizing|permitting|allowing)\b[^.]{0,100}\b(?:forge|build|implement|repair|fix|continue|resume)\b/i.test(normalizedText)
        || /\b(?:revoke|withdraw|cancel|stop|pause)\b[^.]{0,100}\b(?:forge|build|work|request|authorization|permission)\b/i.test(normalizedText)
        || /\b(?:but|however)\b[^.]{0,100}\b(?:do\s+not|don't|not\s+authorized|revoke|stop|pause)\b[^.]{0,100}\b(?:forge|build|implement|repair|fix)\b/i.test(normalizedText)
        || /\b(?:not|except|exclude|excluding|without|skip|omit|instead\s+of|rather\s+than)\b/i.test(normalizedText)
    ) {
        throw new Error('forge_operator_intent_negated');
    }

    const body = stripAuthorizationPrefix(normalizedText);
    const route = body.match(
        /^(?:send|route|dispatch)\s+(.+?)\s+(?:to|through|via)\s+(?:the\s+)?(?:cstar\s+)?forge(?:[.!]|$)/i,
    );
    const direct = body.match(/^(build|implement|repair|fix|forge)\s+(.+)/i);
    const resumeGerund = body.match(
        /^(?:continue|resume)\s+(building|implementing|repairing|fixing|forging)\s+(.+)/i,
    );
    const resumeNamed = body.match(
        /^(?:continue|resume)\s+(.+?)\s+(build|implementation|repair|fix)(?:[.!]|$)/i,
    );
    let action: ForgeOperatorIntentAction;
    let subject: string;
    if (route) {
        action = 'route_to_forge';
        subject = route[1]!;
    } else if (direct) {
        action = actionForVerb(direct[1]!);
        subject = direct[2]!;
    } else if (resumeGerund) {
        action = actionForVerb(resumeGerund[1]!);
        subject = resumeGerund[2]!;
    } else if (resumeNamed) {
        action = actionForVerb(resumeNamed[2]!);
        subject = resumeNamed[1]!;
    } else {
        throw new Error('forge_operator_intent_missing');
    }
    const boundedSubject = subject.trim().replace(/[.!]+$/g, '').trim();
    if (
        !boundedSubject
        || /^(?:this|that|it|these|those|the\s+(?:work|request|thing|proposal|feature))$/i.test(boundedSubject)
    ) {
        throw new Error('forge_operator_intent_work_reference_required');
    }
    return { action, normalizedText, workReferenceText: boundedSubject };
}

export async function verifyCurrentForgeOperatorIntent(
    context: McpRequestContext | undefined,
    now = Date.now(),
): Promise<VerifiedForgeOperatorIntent> {
    const metadata = parseCodexTurnMetadata(context);
    const sessionFile = findCodexSessionFile(resolveCodexSessionsRoot(), metadata.thread_id);
    const canonical = createCanonicalCodexUserTurnAccumulator(
        metadata.thread_id,
        metadata.turn_id,
        now,
        AUTHORIZATION_AGE_MS,
    );
    const intentRecords: IntentRecord[] = [];
    let currentTurnSeen = false;
    const projection = createCodexPlatformContextProjection((record) => {
        const classification = classifyCodexSessionRecord(record.row);
        if (classification.kind === 'noncanonical-user-like' && currentTurnSeen) {
            throw new Error('forge_operator_intent_noncanonical_user_like_record');
        }
        const intentRecord = parseIntentRecord(record);
        if (!intentRecord) return;
        if (intentRecord.turnId === metadata.turn_id) {
            currentTurnSeen = true;
            intentRecords.push(intentRecord);
        } else if (currentTurnSeen) {
            throw new Error('forge_operator_intent_turn_not_latest');
        }
    });
    scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, (record) => {
        canonical.consume(record);
        projection.consume(record);
    });
    projection.finish();
    const turn = canonical.finish();
    if (
        turn.recordCount !== 1
        || intentRecords.length !== 1
        || intentRecords[0]!.recordSha256 !== turn.recordSha256
    ) {
        throw new Error('forge_operator_intent_single_root_user_record_required');
    }
    const currentRecord = intentRecords[0]!;
    const classified = classifyForgeIntent(currentRecord.text);
    const turnTimestamp = Date.parse(turn.timestamp);
    const expiresAt = turnTimestamp + AUTHORIZATION_AGE_MS;
    if (!Number.isFinite(turnTimestamp) || now >= expiresAt) {
        throw new Error('forge_operator_intent_expired');
    }
    const messageSha256 = sha256(JSON.stringify({
        schema: 'cstar.forge_operator_intent_message.v1',
        thread_id: metadata.thread_id,
        turn_id: metadata.turn_id,
        records: [{
            index: 0,
            record_sha256: currentRecord.recordSha256,
            content: currentRecord.content,
        }],
    }));
    return {
        intent: 'forge_execute',
        action: classified.action,
        normalized_text: classified.normalizedText,
        work_reference_text: classified.workReferenceText,
        operator_authorization_ref: [
            'cstar-forge-intent', 'v1',
            'thread', metadata.thread_id,
            'turn', metadata.turn_id,
            'record-set-sha256', turn.recordSetSha256,
        ].join(':'),
        thread_id: metadata.thread_id,
        turn_id: metadata.turn_id,
        message_sha256: messageSha256,
        session_record_sha256: turn.recordSha256,
        session_record_set_sha256: turn.recordSetSha256,
        session_record_count: 1,
        authorized_at: turnTimestamp,
        expires_at: expiresAt,
    };
}
