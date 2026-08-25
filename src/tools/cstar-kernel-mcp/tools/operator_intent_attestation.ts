import { createHash } from 'node:crypto';

import type { McpRequestContext } from '../contracts/request_context.js';
import {
    classifyCodexSessionRecord,
    createCanonicalCodexUserTurnAccumulator,
} from './codex_request_identity.js';
import { scanFixedCodexSession, type FixedCodexSessionRecord } from './codex_session_authority_projection.js';
import {
    findCodexSessionFile,
    MAX_CODEX_SESSION_FILE_BYTES,
    resolveCodexSessionsRoot,
} from './codex_session_locator.js';
import { parseCodexTurnMetadata } from './operator_authorization.js';

export interface VerifiedOperatorIntentAttestation {
    intent: 'goal_resume';
    operator_resume_ref: string;
    thread_id: string;
    turn_id: string;
    message_sha256: string;
    session_record_sha256: string;
    session_record_set_sha256: string;
    session_record_count: number;
    session_record_first_timestamp: string;
    session_record_timestamp: string;
}

interface IntentRecord {
    recordSha256: string;
    content: Array<{ type: 'input_text'; text: string }>;
    text: string;
}

const GOAL_RESUME_ACTION = '(?:resume|restart|continue|proceed(?:\\s+with)?)';
const GOAL_RESUME_SCOPE = '(?:(?:the|this|our|active)\\s+)?(?:goal|mission|work|bead|audit)';
const GOAL_RESUME_TAIL = [
    '(?:\\s+to\\s+completion',
    '|\\s+and\\s+(?:',
    'work\\s+the\\s+problems(?:\\s+that\\s+arise)?\\s+to\\s+completion',
    '|continue\\s+the\\s+audit(?:\\s+to\\s+completion)?',
    '|(?:continue|proceed|carry\\s+on)\\s+to\\s+completion',
    '|(?:complete|finish)\\s+(?:it|the\\s+(?:goal|mission|work|audit))',
    '|(?:resolve|address|fix)\\s+(?:the\\s+)?(?:problem|problems|blocker|blockers|issues)',
    '))?',
].join('');
const GOAL_RESUME_IMPERATIVE = new RegExp(
    `^\\s*(?:please\\s+)?${GOAL_RESUME_ACTION}\\s+${GOAL_RESUME_SCOPE}${GOAL_RESUME_TAIL}[.!]?\\s*$`,
    'i',
);
const GOAL_RESUME_AUTHORIZATION = new RegExp(
    `^\\s*(?:i\\s+authorize\\s+you|you\\s+are\\s+authorized|you\\s+have\\s+my\\s+authorization)\\s+to\\s+${GOAL_RESUME_ACTION}\\s+${GOAL_RESUME_SCOPE}${GOAL_RESUME_TAIL}[.!]?\\s*$`,
    'i',
);

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseIntentRecord(record: FixedCodexSessionRecord, turnId: string): IntentRecord | null {
    const classification = classifyCodexSessionRecord(record.row);
    if (classification.kind !== 'canonical-root-user' || classification.turnId !== turnId) return null;
    const payload = isRecord(record.row.payload) ? record.row.payload : undefined;
    const rawContent = payload?.content;
    if (!Array.isArray(rawContent) || rawContent.length === 0) {
        throw new Error('goal_resume_operator_turn_uninspectable');
    }
    const content = rawContent.map((entry) => {
        if (!isRecord(entry) || entry.type !== 'input_text' || typeof entry.text !== 'string') {
            throw new Error('goal_resume_operator_turn_uninspectable');
        }
        return { type: 'input_text' as const, text: entry.text };
    });
    const text = content.map((entry) => entry.text).join('');
    if (!text.trim()) throw new Error('goal_resume_operator_turn_uninspectable');
    return { recordSha256: sha256(record.rawLine), content, text };
}

function assertGoalResumeSemantics(text: string): void {
    if (
        /\b(?:example|hypothetical|not\s+permission|do\s+not\s+treat|if\s+i\s+were\s+to)\b/i.test(text)
        || /\b(?:do\s+not|don't|never|must\s+not|not\s+authorized\s+to)\s+(?:resume|restart|continue|proceed)\b/i.test(text)
        || /\b(?:do\s+not|don't|never)\s+(?:authorize|permit|allow)\b[^.\n]{0,80}\b(?:resume|restart|continue|proceed)\b/i.test(text)
        || /\bnot\s+(?:authorizing|permitting|allowing)\b[^.\n]{0,80}\b(?:resume|restart|continue|proceed)\b/i.test(text)
        || /\b(?:revoke|withdraw|cancel|stop|pause)\b[^.\n]{0,80}\b(?:goal|mission|work|authorization|permission)\b/i.test(text)
    ) {
        throw new Error('goal_resume_operator_signal_negated');
    }
    if (/\b(?:but|however|quoted|quotation|button\s+label|label|phrase|not\s+an\s+instruction|do\s+not\s+act|don't\s+act)\b/i.test(text)) {
        throw new Error('goal_resume_operator_signal_missing');
    }
    if (text.includes('?')) throw new Error('goal_resume_operator_signal_missing');
    const terseSignal = /^\s*(?:resume|continue|proceed|restart)(?:\s+(?:it|goal|work|mission))?[.!]?\s*$/i.test(text);
    const imperativeSignal = GOAL_RESUME_IMPERATIVE.test(text);
    const authorizationSignal = GOAL_RESUME_AUTHORIZATION.test(text);
    if (!terseSignal && !imperativeSignal && !authorizationSignal) {
        throw new Error('goal_resume_operator_signal_missing');
    }
}

export async function verifyCurrentGoalResumeIntent(
    context: McpRequestContext | undefined,
    now = Date.now(),
): Promise<VerifiedOperatorIntentAttestation> {
    const metadata = parseCodexTurnMetadata(context);
    const sessionFile = findCodexSessionFile(resolveCodexSessionsRoot(), metadata.thread_id);
    const canonical = createCanonicalCodexUserTurnAccumulator(
        metadata.thread_id,
        metadata.turn_id,
        now,
        24 * 60 * 60 * 1000,
    );
    const intentRecords: IntentRecord[] = [];
    scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, (record) => {
        canonical.consume(record);
        const intentRecord = parseIntentRecord(record, metadata.turn_id);
        if (intentRecord) intentRecords.push(intentRecord);
    });
    const turn = canonical.finish();
    if (
        intentRecords.length !== turn.recordCount
        || intentRecords.some((record, index) => record.recordSha256 !== turn.recordSha256s[index])
    ) {
        throw new Error('goal_resume_operator_turn_projection_mismatch');
    }
    const text = intentRecords.map((record) => record.text).join('\n');
    assertGoalResumeSemantics(text);
    const messageSha256 = sha256(JSON.stringify({
        schema: 'cstar.operator_goal_resume_message.v1',
        thread_id: metadata.thread_id,
        turn_id: metadata.turn_id,
        records: intentRecords.map((record, index) => ({
            index,
            record_sha256: record.recordSha256,
            content: record.content,
        })),
    }));
    return {
        intent: 'goal_resume',
        operator_resume_ref: `codex-thread:${metadata.thread_id}:turn:${metadata.turn_id}:record-set-sha256:${turn.recordSetSha256}`,
        thread_id: metadata.thread_id,
        turn_id: metadata.turn_id,
        message_sha256: messageSha256,
        session_record_sha256: turn.recordSha256,
        session_record_set_sha256: turn.recordSetSha256,
        session_record_count: turn.recordCount,
        session_record_first_timestamp: turn.firstTimestamp,
        session_record_timestamp: turn.timestamp,
    };
}
