import { createHash } from 'node:crypto';

import type { McpRequestContext } from '../contracts/request_context.js';
import {
    classifyCodexSessionRecord,
    createCanonicalCodexUserTurnAccumulator,
} from './codex_request_identity.js';
import {
    createCodexPlatformContextProjection,
    scanFixedCodexSession,
} from './codex_session_authority_projection.js';
import {
    findCodexSessionFile,
    MAX_CODEX_SESSION_FILE_BYTES,
    resolveCodexSessionsRoot,
} from './codex_session_locator.js';
import { parseCodexTurnMetadata } from './operator_authorization.js';
import type { SpokeAttachmentAuthorityForStore } from '../../pennyone/intel/spoke_attachment_store.js';
import type { SpokeAttachmentAction } from './spoke_schemas.js';

const CURRENT_ROOT_TURN_MAX_AGE_MS = 15 * 60 * 1000;
const SHA256 = /^[a-f0-9]{64}$/;

export interface CurrentRootTurnGrantTarget {
    action: SpokeAttachmentAction;
    slug: string;
    root_path: string;
}

export interface CurrentRootTurnAuthorityRecord {
    text: string;
    record_sha256: string;
}

export interface CurrentRootTurnAttachmentRecordSet {
    thread_id: string;
    turn_id: string;
    timestamp: string;
    record_set_sha256: string;
    record_count: number;
    records: CurrentRootTurnAuthorityRecord[];
}

export interface CurrentRootTurnGrantResult {
    action: CurrentRootTurnGrantTarget['action'];
    authority: SpokeAttachmentAuthorityForStore;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizedStandalone(text: string): string {
    return text.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/u, '').trim().toLocaleLowerCase('en-US');
}

export function isTerseAttachmentRevocation(text: string): boolean {
    const normalized = normalizedStandalone(text);
    return /^(?:stop|pause|never mind|(?:cancel|revoke|withdraw) (?:it|this|that)|do not (?:proceed|continue|resume))$/u
        .test(normalized);
}

export function isExplicitAttachmentRevocation(text: string): boolean {
    return isTerseAttachmentRevocation(text)
        || /\b(?:revoke|withdraw|cancel|deny|denied|pause|paused|hold|held)\b[^.\n]{0,120}\b(?:attachment|link|project|unlink|mission|set|grant|authority|proceed|continue)\b/i.test(text)
        || /\b(?:attachment|link|project|unlink|mission|set|grant|authority)\b[^.\n]{0,120}\b(?:revoked|withdrawn|cancelled|canceled|denied|paused|on hold|held)\b/i.test(text);
}

function nonoperativeGrantText(text: string): boolean {
    return /[?"'“”‘’`\u0000]/u.test(text)
        || /\b(?:if|when|unless|provided|assuming|maybe|might|could|would|should|can|may|reported|says|said|according|quoted|quotation|revoke|revoked|deny|denied|pause|paused|hold|held|stop|stopped|cancel|cancelled|canceled|do\s+not|don't|never|not|without)\b/i.test(text);
}

function grantLike(text: string): boolean {
    return /\b(?:authorize|cstar_spoke_attachment|spoke)\b/i.test(text);
}

interface CapturedCurrentRootTurnGrantTarget {
    slug: string;
    root_path: string;
}

function captureCurrentRootTurnGrantTarget(
    text: string,
    action: SpokeAttachmentAction,
): CapturedCurrentRootTurnGrantTarget | null {
    const fixedAction = escapeRegex(action);
    const patterns = [
        new RegExp(`^authorize\\s+cstar_spoke_attachment\\s+${fixedAction}\\s+(\\S+)\\s+(\\S+)\\s+now[.!]?$`, 'i'),
        new RegExp(`^i\\s+authorize\\s+cstar_spoke_attachment\\s+${fixedAction}\\s+(\\S+)\\s+(\\S+)\\s+now[.!]?$`, 'i'),
        new RegExp(`^i\\s+authorize\\s+you\\s+to\\s+${fixedAction}\\s+spoke\\s+(\\S+)\\s+at\\s+(\\S+)\\s+now[.!]?$`, 'i'),
        new RegExp(`^i\\s+authorize\\s+${fixedAction}\\s+spoke\\s+(\\S+)\\s+at\\s+(\\S+)\\s+now[.!]?$`, 'i'),
    ];
    for (const pattern of patterns) {
        const match = pattern.exec(text);
        if (match) return { slug: match[1]!, root_path: match[2]! };
    }
    return null;
}

export function parseCurrentRootTurnGrant(
    records: readonly CurrentRootTurnAuthorityRecord[],
    target: CurrentRootTurnGrantTarget,
): { selected_record_sha256: string; selected_record_index: number } {
    if (records.length === 0 || records.some((record) => !SHA256.test(record.record_sha256))
        || new Set(records.map((record) => record.record_sha256)).size !== records.length) {
        throw new Error('spoke_attachment_current_turn_record_set_invalid');
    }
    if (records.some((record) => isTerseAttachmentRevocation(record.text))) {
        throw new Error('spoke_attachment_current_turn_revoked');
    }
    const candidates = records.flatMap((record, index) => {
        const raw = record.text;
        if (raw.includes('\n') || raw.includes('\r') || nonoperativeGrantText(raw)) return [];
        const capturedTarget = captureCurrentRootTurnGrantTarget(raw.trim(), target.action);
        return capturedTarget ? [{ record, index, capturedTarget }] : [];
    });
    if (records.some(({ text }) => nonoperativeGrantText(text) && grantLike(text))) {
        throw new Error('spoke_attachment_current_turn_nonoperative');
    }
    if (candidates.some(({ capturedTarget }) => (
        capturedTarget.slug !== target.slug || capturedTarget.root_path !== target.root_path
    ))) {
        throw new Error('spoke_attachment_current_turn_target_mismatch');
    }
    const matches = candidates;
    if (matches.length === 0) throw new Error('spoke_attachment_current_turn_grant_missing');
    if (matches.length !== 1) throw new Error('spoke_attachment_current_turn_grant_duplicate');
    return {
        selected_record_sha256: matches[0]!.record.record_sha256,
        selected_record_index: matches[0]!.index,
    };
}

function canonicalRecordText(row: Record<string, unknown>): string {
    const payload = isRecord(row.payload) ? row.payload : undefined;
    const content = payload?.content;
    if (!Array.isArray(content) || content.length === 0) return '\u0000';
    if (content.some((entry) => !isRecord(entry) || entry.type !== 'input_text' || typeof entry.text !== 'string')) {
        return '\u0000';
    }
    return content.map((entry) => (entry as { text: string }).text).join('');
}

export function readCurrentRootTurnAttachmentRecordSet(input: {
    request_context?: McpRequestContext;
    now: number;
}): CurrentRootTurnAttachmentRecordSet {
    const metadata = parseCodexTurnMetadata(input.request_context);
    const sessionFile = findCodexSessionFile(resolveCodexSessionsRoot(), metadata.thread_id);
    const accumulator = createCanonicalCodexUserTurnAccumulator(
        metadata.thread_id,
        metadata.turn_id,
        input.now,
        CURRENT_ROOT_TURN_MAX_AGE_MS,
    );
    const records: CurrentRootTurnAuthorityRecord[] = [];
    const projection = createCodexPlatformContextProjection(({ row, rawLine }) => {
        const classification = classifyCodexSessionRecord(row);
        if (classification.kind !== 'canonical-root-user' || classification.turnId !== metadata.turn_id) return;
        records.push({ text: canonicalRecordText(row), record_sha256: sha256(rawLine) });
    });
    scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, (record) => {
        accumulator.consume(record);
        projection.consume(record);
    });
    const turn = accumulator.finish();
    projection.finish();
    if (records.length !== turn.recordCount
        || records.some((record, index) => record.record_sha256 !== turn.recordSha256s[index])) {
        throw new Error('spoke_attachment_current_turn_record_set_mismatch');
    }
    return {
        thread_id: metadata.thread_id,
        turn_id: metadata.turn_id,
        timestamp: turn.timestamp,
        record_set_sha256: turn.recordSetSha256,
        record_count: turn.recordCount,
        records,
    };
}

export async function resolveCurrentRootTurnAttachmentAuthority(input: {
    target: CurrentRootTurnGrantTarget;
    request_context?: McpRequestContext;
    now?: number;
}): Promise<CurrentRootTurnGrantResult> {
    const now = input.now ?? Date.now();
    const recordSet = readCurrentRootTurnAttachmentRecordSet({
        request_context: input.request_context,
        now,
    });
    const selected = parseCurrentRootTurnGrant(recordSet.records, input.target);
    const timestamp = Date.parse(recordSet.timestamp);
    if (!Number.isFinite(timestamp) || timestamp > now + 60_000
        || now - timestamp > CURRENT_ROOT_TURN_MAX_AGE_MS) {
        throw new Error('spoke_attachment_current_turn_expired');
    }
    return {
        action: input.target.action,
        authority: {
            kind: 'current_root_turn',
            source_authority_id: `current-root-turn:${recordSet.thread_id}:${recordSet.turn_id}:${selected.selected_record_sha256}:${recordSet.record_set_sha256}`,
            thread_id: recordSet.thread_id,
            turn_id: recordSet.turn_id,
            record_sha256: selected.selected_record_sha256,
            record_set_sha256: recordSet.record_set_sha256,
            record_count: recordSet.record_count,
            selected_record_index: selected.selected_record_index,
            child_expires_at: timestamp + CURRENT_ROOT_TURN_MAX_AGE_MS,
        },
    };
}
