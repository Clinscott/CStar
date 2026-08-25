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
import { isForgeAuthorityRevocation } from './forge_revocation.js';
import {
    classifyCurrentTurnContinuation,
    classifyReservedCurrentTurnRecord,
    selectCurrentTurnRequesterPrefix,
} from './forge_current_turn_continuation.js';

export { classifyCurrentTurnContinuation } from './forge_current_turn_continuation.js';

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
    session_record_count: number;
    selected_record_set_sha256?: string;
    binding_mode:
        | 'ordinary_language'
        | 'exact_request_receipt'
        | 'exact_mission_record'
        | 'current_turn_continuation';
    bound_request_id?: string;
    bound_request_sha256?: string;
    bound_decision_id?: string;
    authorized_at: number;
    expires_at: number;
}

export interface StableForgeInstructionBinding {
    request_id: string;
    request_sha256: string;
    bead_id: string;
    decision_id: string;
    requester_record_set_sha256?: string;
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
    if (
        normalized === 'simplify'
        || normalized === 'simplifying'
        || normalized === 'simplification'
    ) return 'repair';
    if (normalized === 'forge' || normalized === 'forging') return 'route_to_forge';
    return 'build';
}

function isIdentifierCharacter(value: string | undefined): boolean {
    return value !== undefined && /[\p{L}\p{N}_:./-]/u.test(value);
}

function includesExactIdentifier(text: string, identifier: string): boolean {
    const lower = text.toLowerCase();
    const needle = identifier.toLowerCase();
    let offset = lower.indexOf(needle);
    while (offset >= 0) {
        const before = offset === 0 ? undefined : lower[offset - 1];
        const afterOffset = offset + needle.length;
        const after = afterOffset === lower.length ? undefined : lower[afterOffset];
        if (!isIdentifierCharacter(before) && !isIdentifierCharacter(after)) return true;
        offset = lower.indexOf(needle, offset + 1);
    }
    return false;
}

const BOUND_SCOPED_NEGATION = /\b(?:do\s+not|don't|never|must\s+not|not\s+authorized\s+to|no\s+longer)\b[^.\n;]{0,160}\b(?:implement|build|repair|fix|simplify|continue|resume|proceed|authorize|execute)\b/i;
const BOUND_FIRST_PERSON_NEGATION = /\bi\s+(?:(?:am\s+)?not\s+(?:authorizing|permitting|allowing)|do\s+not\s+(?:authorize|permit|allow))\b/i;

function isBoundForgeRevocation(text: string): boolean {
    return BOUND_SCOPED_NEGATION.test(text)
        || BOUND_FIRST_PERSON_NEGATION.test(text)
        || isForgeAuthorityRevocation(text);
}

function isCurrentTurnContinuationRecord(
    text: string,
    binding: StableForgeInstructionBinding,
): boolean {
    try {
        classifyCurrentTurnContinuation(text, binding);
        return true;
    } catch {
        return false;
    }
}

export function classifyBoundForgeIntent(
    text: string,
    binding: StableForgeInstructionBinding,
    mode: 'exact_request_receipt' | 'exact_mission_record',
): { action: ForgeOperatorIntentAction; normalizedText: string; workReferenceText: string } {
    if (UNSAFE_TEXT.test(text)) throw new Error('forge_operator_intent_unsafe_text');
    const normalizedText = text.trim().replace(/\s+/g, ' ');
    const missionDecisionId = binding.decision_id.replace(
        /-i[1-9][0-9]*-[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/,
        '',
    );
    const expected = mode === 'exact_request_receipt'
        ? `Authorize and execute only ${binding.request_id} with request SHA-256 ${binding.request_sha256} for ${binding.bead_id} now`
        : `Continue and implement ${missionDecisionId} on ${binding.bead_id} now`;
    const candidate = normalizedText.endsWith('.')
        ? normalizedText.slice(0, -1).trimEnd() : normalizedText;
    if (candidate.toLocaleLowerCase('en-US') !== expected.toLocaleLowerCase('en-US')) {
        throw new Error('forge_operator_intent_nonoperative_text');
    }
    const action: ForgeOperatorIntentAction = mode === 'exact_mission_record'
        ? 'implement' : 'route_to_forge';
    return { action, normalizedText, workReferenceText: binding.bead_id };
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
        /\b(?:do\s+not|don't|never|must\s+not|not\s+authorized\s+to)\s+(?:build|implement|repair|fix|simplify|forge|send|route|dispatch|continue|resume)\b/i.test(normalizedText)
        || /\bnot\s+(?:authorizing|permitting|allowing)\b[^.]{0,100}\b(?:forge|build|implement|repair|fix|simplify|continue|resume)\b/i.test(normalizedText)
        || /\b(?:revoke|withdraw|cancel|stop|pause)\b[^.]{0,100}\b(?:forge|build|work|request|authorization|permission)\b/i.test(normalizedText)
        || /\b(?:but|however)\b[^.]{0,100}\b(?:do\s+not|don't|not\s+authorized|revoke|stop|pause)\b[^.]{0,100}\b(?:forge|build|implement|repair|fix|simplify)\b/i.test(normalizedText)
        || /\b(?:not|except|exclude|excluding|without|skip|omit|instead\s+of|rather\s+than)\b/i.test(normalizedText)
    ) {
        throw new Error('forge_operator_intent_negated');
    }

    const body = stripAuthorizationPrefix(normalizedText);
    const route = body.match(
        /^(?:send|route|dispatch)\s+(.+?)\s+(?:to|through|via)\s+(?:the\s+)?(?:cstar\s+)?forge(?:[.!]|$)/i,
    );
    const direct = body.match(/^(build|implement|repair|fix|simplify|forge)\s+(.+)/i);
    const resumeGerund = body.match(
        /^(?:continue|resume)\s+(building|implementing|repairing|fixing|simplifying|forging)\s+(.+)/i,
    );
    const resumeNamed = body.match(
        /^(?:continue|resume)\s+(.+?)\s+(build|implementation|repair|fix|simplification)(?:[.!]|$)/i,
    );
    let action: ForgeOperatorIntentAction;
    let subject: string;
    if (route) {
        action = 'route_to_forge';
        subject = route[1]!;
    } else if (direct) {
        action = actionForVerb(direct[1]!);
        subject = direct[2]!;
        if (direct[1]!.toLowerCase() === 'simplify') {
            subject = subject.replace(
                /\s+first(?:,\s*|\s+)then\s+(?:begin|continue|proceed)[.!]*$/i,
                '',
            );
        }
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
    stableBinding?: StableForgeInstructionBinding,
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
    if (intentRecords.length !== turn.recordCount || intentRecords.length === 0) {
        throw new Error('forge_operator_intent_root_user_record_set_incomplete');
    }
    let currentRecord: IntentRecord;
    let classified: ReturnType<typeof classifyForgeIntent>;
    let bindingMode: VerifiedForgeOperatorIntent['binding_mode'];
    let matchingRecords: IntentRecord[];
    if (turn.recordCount === 1) {
        currentRecord = intentRecords[0]!;
        matchingRecords = [currentRecord];
        try {
            classified = classifyForgeIntent(currentRecord.text);
            bindingMode = 'ordinary_language';
        } catch (error) {
            if (!stableBinding) throw error;
            classified = classifyCurrentTurnContinuation(currentRecord.text, stableBinding);
            bindingMode = 'current_turn_continuation';
        }
    } else {
        if (!stableBinding) {
            throw new Error('forge_operator_intent_exact_request_binding_required');
        }
        const reservedKinds = new Map(intentRecords.map((record) => [
            record.recordSha256,
            classifyReservedCurrentTurnRecord(record.text),
        ]));
        if ([...reservedKinds.values()].includes('malformed_wrapper')) {
            throw new Error('forge_operator_intent_subagent_notification_malformed');
        }
        const authorityRecords = intentRecords.filter((record) =>
            !reservedKinds.get(record.recordSha256)?.startsWith('reserved_'));
        if (authorityRecords.some((record) => isBoundForgeRevocation(record.text))) {
            throw new Error('forge_operator_intent_negated');
        }
        const missionDecisionId = stableBinding.decision_id.replace(
            /-i[1-9][0-9]*-[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/,
            '',
        );
        const receiptRecords = authorityRecords.filter((record) =>
            includesExactIdentifier(record.text, stableBinding.request_id)
            && includesExactIdentifier(record.text, stableBinding.request_sha256)
            && includesExactIdentifier(record.text, stableBinding.bead_id));
        const missionRecords = authorityRecords.filter((record) =>
            includesExactIdentifier(record.text, missionDecisionId)
            && includesExactIdentifier(record.text, stableBinding.bead_id));
        const continuationRecords = authorityRecords.filter((record) =>
            isCurrentTurnContinuationRecord(record.text, stableBinding));
        matchingRecords = [...new Map(
            [...receiptRecords, ...missionRecords, ...continuationRecords]
                .map((record) => [record.recordSha256, record]),
        ).values()];
        if (matchingRecords.length === 0) {
            throw new Error('forge_operator_intent_exact_request_binding_missing');
        }
        if (matchingRecords.length !== 1) {
            throw new Error('forge_operator_intent_exact_request_binding_ambiguous');
        }
        currentRecord = matchingRecords[0]!;
        if (continuationRecords.some(
            (record) => record.recordSha256 === currentRecord.recordSha256,
        )) {
            if (authorityRecords.length !== 1) {
                throw new Error('forge_operator_intent_current_turn_continuation_extra_record');
            }
            bindingMode = 'current_turn_continuation';
            classified = classifyCurrentTurnContinuation(currentRecord.text, stableBinding);
        } else {
            bindingMode = receiptRecords.some(
                (record) => record.recordSha256 === currentRecord.recordSha256,
            )
                ? 'exact_request_receipt' : 'exact_mission_record';
            classified = classifyBoundForgeIntent(currentRecord.text, stableBinding, bindingMode);
        }
    }
    const turnTimestamp = Date.parse(turn.timestamp);
    const expiresAt = turnTimestamp + AUTHORIZATION_AGE_MS;
    if (!Number.isFinite(turnTimestamp) || now >= expiresAt) {
        throw new Error('forge_operator_intent_expired');
    }
    const messageSha256 = sha256(JSON.stringify(bindingMode === 'ordinary_language'
        ? {
            schema: 'cstar.forge_operator_intent_message.v1',
            thread_id: metadata.thread_id,
            turn_id: metadata.turn_id,
            records: [{
                index: 0,
                record_sha256: currentRecord.recordSha256,
                content: currentRecord.content,
            }],
        }
        : {
            schema: 'cstar.forge_operator_intent_message.v2',
            thread_id: metadata.thread_id,
            turn_id: metadata.turn_id,
            turn_record_set_sha256: turn.recordSetSha256,
            selected_record_sha256: currentRecord.recordSha256,
            records: matchingRecords.map((record, index) => ({
                index,
                record_sha256: record.recordSha256,
                content: record.content,
            })),
        }));
    return {
        intent: 'forge_execute',
        action: classified.action,
        normalized_text: classified.normalizedText,
        work_reference_text: classified.workReferenceText,
        operator_authorization_ref: [
            'cstar-forge-intent', bindingMode === 'ordinary_language' ? 'v1' : 'v2',
            'thread', metadata.thread_id,
            'turn', metadata.turn_id,
            'record-set-sha256', turn.recordSetSha256,
            ...(bindingMode === 'ordinary_language'
                ? [] : ['request-sha256', stableBinding!.request_sha256]),
        ].join(':'),
        thread_id: metadata.thread_id,
        turn_id: metadata.turn_id,
        message_sha256: messageSha256,
        session_record_sha256: turn.recordSha256,
        session_record_set_sha256: turn.recordSetSha256,
        session_record_count: turn.recordCount,
        selected_record_set_sha256: bindingMode === 'current_turn_continuation'
            ? selectCurrentTurnRequesterPrefix({
                thread_id: metadata.thread_id,
                turn_id: metadata.turn_id,
                requester_record_set_sha256: stableBinding!.requester_record_set_sha256,
                operative_record_sha256: currentRecord.recordSha256,
                records: intentRecords.map((record) => ({
                    timestamp: record.timestamp,
                    record_sha256: record.recordSha256,
                })),
            })
            : undefined,
        binding_mode: bindingMode,
        bound_request_id: bindingMode !== 'ordinary_language'
            ? stableBinding!.request_id : undefined,
        bound_request_sha256: bindingMode !== 'ordinary_language'
            ? stableBinding!.request_sha256 : undefined,
        bound_decision_id: bindingMode !== 'ordinary_language'
            ? stableBinding!.decision_id : undefined,
        authorized_at: turnTimestamp,
        expires_at: expiresAt,
    };
}
