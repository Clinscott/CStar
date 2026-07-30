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
    selected_record_sha256?: string;
    selected_record_index?: number;
}

export interface GoalResumeIntentBinding {
    repair_bead_id: string;
    continued_bead_id?: string;
    decision_id?: string;
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
const GOAL_REPAIR_CONTINUATION = /(?:^|[.!]\s*)(?:(?:fix|repair)\s+(?:the\s+)?(?:error|failure|issue|problem)\s+and\s+(?:continue|resume|proceed(?:\s+with)?)\s+(?:the\s+)?(?:build|work|goal|mission)|(?:the\s+)?(?:error|failure|issue|problem)\s+should\s+be\s+(?:fixed|repaired)\s+and\s+(?:the\s+)?(?:build|work)\s+(?:should\s+)?(?:proceed|continue|resume))(?:[.!]|$)/i;
const GOAL_CONTINUATION_CORRECTION = /(?:^|[.!]\s*)(?:(?:the|this|our|active)\s+)?(?:goal|build|work)\s+should\s+have\s+(?:continued|resumed|proceeded)(?:\s+after\s+(?:the\s+)?(?:router|routing|local|mechanical|pre-provider)\s+(?:fix|repair|error|failure))?(?:[.!]|$)/i;

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

function assertGoalResumeNotNegated(text: string): void {
    if (
        /\b(?:example|hypothetical|not\s+permission|do\s+not\s+treat|if\s+i\s+were\s+to)\b/i.test(text)
        || /\b(?:do\s+not|don't|never|must\s+not|not\s+authorized\s+to)\s+(?:resume|restart|continue|continuation|proceed|carry)\b/i.test(text)
        || /\b(?:do\s+not|don't|never)\s+(?:authorize|permit|allow)\b[^.\n]{0,80}\b(?:resume|restart|continue|continuation|proceed|carry)\b/i.test(text)
        || /\bnot\s+(?:authorizing|permitting|allowing)\b[^.\n]{0,80}\b(?:resume|restart|continue|continuation|proceed|carry)\b/i.test(text)
        || /\b(?:revoke|withdraw|cancel|stop|pause)\b[^.\n]{0,80}\b(?:goal|mission|work|authorization|permission)\b/i.test(text)
        || /\b(?:error|failure|issue|problem)\s+should\s+not\s+be\s+(?:fixed|repaired)\b/i.test(text)
        || /\b(?:goal|build|work)\s+should\s+not\s+have\s+(?:continued|resumed|proceeded)\b/i.test(text)
    ) {
        throw new Error('goal_resume_operator_signal_negated');
    }
}

function isTerseGoalResumeRevocation(text: string): boolean {
    const normalized = text.trim().replace(/\s+/g, ' ');
    return /^(?:(?:stop|pause|never\s+mind)|(?:cancel|revoke|withdraw)(?:\s+(?:it|this|that))?|do\s+not\s+(?:proceed|continue|resume))[.!]?$/i
        .test(normalized);
}

function containsExactInstructionReference(text: string, reference: string): boolean {
    const identifierCharacter = /[\p{L}\p{N}_:./-]/u;
    const normalizedText = text.toLocaleLowerCase('en-US');
    const normalizedReference = reference.toLocaleLowerCase('en-US');
    let offset = normalizedText.indexOf(normalizedReference);
    while (offset >= 0) {
        const before = offset > 0 ? normalizedText[offset - 1] : undefined;
        const after = normalizedText[offset + normalizedReference.length];
        if ((!before || !identifierCharacter.test(before))
            && (!after || !identifierCharacter.test(after))) return true;
        offset = normalizedText.indexOf(normalizedReference, offset + normalizedReference.length);
    }
    return false;
}

function assertGoalResumeSemantics(text: string): void {
    assertGoalResumeNotNegated(text);
    if (/\b(?:but|however|quoted|quotation|button\s+label|label|phrase|not\s+an\s+instruction|do\s+not\s+act|don't\s+act)\b/i.test(text)
        || /["“”‘’`]/u.test(text)) {
        throw new Error('goal_resume_operator_signal_missing');
    }
    if (text.includes('?')) throw new Error('goal_resume_operator_signal_missing');
    const terseSignal = /^\s*(?:resume|continue|proceed|restart)(?:\s+(?:it|goal|work|mission))?[.!]?\s*$/i.test(text);
    const imperativeSignal = GOAL_RESUME_IMPERATIVE.test(text);
    const authorizationSignal = GOAL_RESUME_AUTHORIZATION.test(text);
    const repairContinuationSignal = GOAL_REPAIR_CONTINUATION.test(text);
    const continuationCorrectionSignal = GOAL_CONTINUATION_CORRECTION.test(text);
    if (!terseSignal && !imperativeSignal && !authorizationSignal
        && !repairContinuationSignal && !continuationCorrectionSignal) {
        throw new Error('goal_resume_operator_signal_missing');
    }
}

function isExactStructuredGoalResumeGrant(
    text: string,
    binding: GoalResumeIntentBinding,
): boolean {
    const references = [
        binding.repair_bead_id,
        binding.continued_bead_id,
        binding.decision_id,
    ].filter((value): value is string => Boolean(value));
    if (references.length === 0
        || references.some((reference) => !containsExactInstructionReference(text, reference))) {
        return false;
    }
    const expected = [
        `Authorize goal continuation for repair ${binding.repair_bead_id}`,
        binding.continued_bead_id ? ` with continued ${binding.continued_bead_id}` : '',
        binding.decision_id ? ` and decision ${binding.decision_id}` : '',
        ' now',
    ].join('');
    const normalizedText = text.trim().replace(/\s+/g, ' ');
    const candidate = normalizedText.endsWith('.')
        ? normalizedText.slice(0, -1).trimEnd() : normalizedText;
    return candidate.toLocaleLowerCase('en-US') === expected.toLocaleLowerCase('en-US');
}

function selectStructuredGoalResumeGrant(
    records: IntentRecord[],
    binding: GoalResumeIntentBinding,
): { record: IntentRecord; index: number } {
    records.forEach((record) => {
        if (isTerseGoalResumeRevocation(record.text)) {
            throw new Error('goal_resume_operator_signal_negated');
        }
        assertGoalResumeNotNegated(record.text);
    });
    const matches = records
        .map((record, index) => ({ record, index }))
        .filter(({ record }) => isExactStructuredGoalResumeGrant(record.text, binding));
    if (matches.length === 0) throw new Error('goal_resume_operator_signal_missing');
    if (matches.length !== 1) throw new Error('goal_resume_operator_signal_ambiguous');
    return matches[0]!;
}

export async function verifyCurrentGoalResumeIntent(
    context: McpRequestContext | undefined,
    now = Date.now(),
    binding?: GoalResumeIntentBinding,
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
    const intentProjection = createCodexPlatformContextProjection((record) => {
        const intentRecord = parseIntentRecord(record, metadata.turn_id);
        if (intentRecord) intentRecords.push(intentRecord);
    });
    scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, (record) => {
        canonical.consume(record);
        intentProjection.consume(record);
    });
    intentProjection.finish();
    const turn = canonical.finish();
    if (
        intentRecords.length !== turn.recordCount
        || intentRecords.some((record, index) => record.recordSha256 !== turn.recordSha256s[index])
    ) {
        throw new Error('goal_resume_operator_turn_projection_mismatch');
    }
    const text = intentRecords.map((record) => record.text).join('\n');
    const selectedGrant = binding
        ? selectStructuredGoalResumeGrant(intentRecords, binding)
        : undefined;
    if (!binding) assertGoalResumeSemantics(text);
    const records = intentRecords.map((record, index) => ({
        index,
        record_sha256: record.recordSha256,
        content: record.content,
    }));
    const messageSha256 = sha256(JSON.stringify(binding
        ? {
            schema: 'cstar.operator_goal_resume_message.v2',
            thread_id: metadata.thread_id,
            turn_id: metadata.turn_id,
            instruction_binding: binding,
            turn_record_set_sha256: turn.recordSetSha256,
            selected_record_sha256: selectedGrant!.record.recordSha256,
            selected_record_index: selectedGrant!.index,
            records,
        }
        : {
            schema: 'cstar.operator_goal_resume_message.v1',
            thread_id: metadata.thread_id,
            turn_id: metadata.turn_id,
            instruction_binding: null,
            records,
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
        selected_record_sha256: selectedGrant?.record.recordSha256,
        selected_record_index: selectedGrant?.index,
    };
}
