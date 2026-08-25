import { createHash } from 'node:crypto';

import {
    classifyCodexSessionRecord,
    createCanonicalCodexUserTurnAccumulator,
    type CanonicalCodexUserTurn,
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
import type { McpRequestContext } from '../contracts/request_context.js';
import { tryGetReadDb } from '../../pennyone/intel/database.js';
import {
    verifyCodexRequestIdentity,
    type VerifiedCodexRequestIdentity,
} from './operator_authorization.js';
import { isForgeAuthorityRevocation } from './forge_revocation.js';
import { isForgeSetIdentityConsumed } from './forge_set_manifest_consumption.js';
import { retryAppendOnlyCodexSessionRead } from './codex_session_append_retry.js';

export const FORGE_SET_AUTHORIZATION_AGE_MS = 24 * 60 * 60 * 1_000;

export interface VerifiedForgeSetSignal {
    record_sha256: string;
    content: Array<{ type: 'input_text'; text: string }>;
    root_session_record_set_sha256: string;
    root_session_record_count: number;
    root_session_file_bytes: number;
}

export interface PersistedForgeSetAuthorityFields {
    thread_id: string;
    turn_id: string;
    record_sha256: string;
    record_set_sha256: string;
    record_count: number;
}

export interface ForgeSetMutationIdentityFields {
    thread_id: string;
    turn_id: string;
    record_set_sha256: string;
}

export interface VerifiedForgeSetAuthority {
    identity: VerifiedCodexRequestIdentity;
    signal: VerifiedForgeSetSignal;
}

interface SetRecord {
    record_sha256: string;
    content: Array<{ type: 'input_text'; text: string }>;
    text: string;
    timestamp: string;
}

interface HistoricalRootTurn {
    turn_id: string;
    first_index: number;
    records: SetRecord[];
}

function persistedSetIsConsumed(identity: VerifiedCodexRequestIdentity): boolean {
    let db;
    try {
        db = tryGetReadDb();
    } catch (error) {
        if (error instanceof Error && error.message === 'hall_store_missing') return false;
        throw new Error('forge_set_manifest_consumption_uninspectable', { cause: error });
    }
    return db ? isForgeSetIdentityConsumed(db, {
        thread_id: identity.thread_id,
        turn_id: identity.turn_id,
        record_sha256: identity.turn_record_sha256,
        record_set_sha256: identity.turn_record_set_sha256,
    }) : false;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const EXACT_SET_DIRECTIVES = new Set([
    'set',
    'set the researcher v2 complete-system batch',
    'set a new goal to prove the validity of the entire pipeline',
]);

function isExactSet(text: string): boolean {
    if (/[^A-Za-z0-9. \t\r\n-]/u.test(text)) return false;
    const normalized = text.replace(/[ \t\r\n]+/g, ' ').trim();
    const candidate = normalized.endsWith('.')
        ? normalized.slice(0, -1).trimEnd() : normalized;
    if (candidate.endsWith('.')) return false;
    const directive = candidate.toLocaleLowerCase('en-US');
    return EXACT_SET_DIRECTIVES.has(directive);
}

function mentionsSetInstruction(text: string): boolean {
    return /(?:^|[^\p{L}\p{N}_])set(?:$|[^\p{L}\p{N}_])/iu.test(text);
}

function isForgeSetAuthorityRevocation(text: string): boolean {
    return isForgeAuthorityRevocation(text)
        || /^\s*(?:(?:cancel|revoke|withdraw)(?:\s+(?:it|this|that))?|never\s+mind)[.!]?\s*$/i
            .test(text);
}

function hashCanonicalTurnRecordSet(
    threadId: string,
    turnId: string,
    records: Array<Pick<SetRecord, 'timestamp' | 'record_sha256'>>,
): string {
    return sha256(JSON.stringify({
        schema: 'cstar.codex_root_user_turn_record_set.v1',
        thread_id: threadId,
        turn_id: turnId,
        records: records.map((record, index) => ({
            index,
            timestamp: record.timestamp,
            record_sha256: record.record_sha256,
        })),
    }));
}

function parseCanonicalSetRecord(record: FixedCodexSessionRecord): {
    turn_id: string;
    record: SetRecord;
} | null {
    const classification = classifyCodexSessionRecord(record.row);
    if (classification.kind !== 'canonical-root-user'
        || typeof classification.turnId !== 'string') {
        return null;
    }
    const payload = isRecord(record.row.payload) ? record.row.payload : undefined;
    if (!classification.rootLineage || !Array.isArray(payload?.content)
        || payload.content.length === 0 || typeof record.row.timestamp !== 'string') return null;
    const content: SetRecord['content'] = [];
    for (const entry of payload.content) {
        if (!isRecord(entry) || entry.type !== 'input_text' || typeof entry.text !== 'string') {
            return null;
        }
        content.push({ type: 'input_text', text: entry.text });
    }
    return {
        turn_id: classification.turnId,
        record: {
            record_sha256: sha256(record.rawLine),
            content,
            text: content.map((entry) => entry.text).join(''),
            timestamp: record.row.timestamp,
        },
    };
}

function parseSetRecord(record: FixedCodexSessionRecord, turnId: string): SetRecord | null {
    const parsed = parseCanonicalSetRecord(record);
    return parsed?.turn_id === turnId ? parsed.record : null;
}

function assertCompleteOrderedTurn(
    identity: Pick<VerifiedCodexRequestIdentity, 'thread_id' | 'turn_id'>,
    turn: CanonicalCodexUserTurn,
    records: SetRecord[],
): void {
    if (records.length !== turn.recordCount
        || records.some((record, index) => record.record_sha256 !== turn.recordSha256s[index])
        || hashCanonicalTurnRecordSet(identity.thread_id, identity.turn_id, records)
            !== turn.recordSetSha256) {
        throw new Error('forge_set_manifest_operator_signal_uninspectable');
    }
}

function isHistoricalSingleSetPrefix(
    identity: VerifiedCodexRequestIdentity,
    records: SetRecord[],
): boolean {
    const first = records[0];
    if (!first) return false;
    return identity.turn_record_count === 1
        && identity.turn_record_sha256 === first.record_sha256
        && identity.turn_first_timestamp === first.timestamp
        && identity.turn_timestamp === first.timestamp
        && identity.turn_record_set_sha256 === hashCanonicalTurnRecordSet(
            identity.thread_id, identity.turn_id, [first],
        );
}

function assertHistoricalSetTail(records: SetRecord[]): void {
    for (const record of records.slice(1)) {
        if (isForgeSetAuthorityRevocation(record.text)) {
            throw new Error('forge_set_manifest_operator_signal_revoked');
        }
        if (mentionsSetInstruction(record.text)) {
            throw new Error('forge_set_manifest_operator_signal_ambiguous');
        }
    }
}

/** Bind one exact SET snapshot while inspecting the complete current ordered evidence. */
export function readExactForgeSetSignal(
    identity: VerifiedCodexRequestIdentity,
    now = Date.now(),
    allowHistorical = false,
): VerifiedForgeSetSignal | null {
    const sessionFile = findCodexSessionFile(resolveCodexSessionsRoot(), identity.thread_id);
    const canonical = createCanonicalCodexUserTurnAccumulator(
        identity.thread_id,
        identity.turn_id,
        now,
        FORGE_SET_AUTHORIZATION_AGE_MS,
        allowHistorical,
    );
    const records: SetRecord[] = [];
    const noncanonicalUserLikeIndexes: number[] = [];
    let authorityRecordIndex: number | null = null;
    const authorityTimestamp = Date.parse(identity.turn_timestamp);
    const projection = createCodexPlatformContextProjection((record) => {
        const parsed = parseSetRecord(record, identity.turn_id);
        if (parsed) {
            records.push(parsed);
            if (parsed.record_sha256 === identity.turn_record_sha256) {
                authorityRecordIndex = record.index;
            }
        }
        const classification = classifyCodexSessionRecord(record.row);
        if (classification.kind === 'noncanonical-user-like') {
            noncanonicalUserLikeIndexes.push(record.index);
            return;
        }
        if (classification.kind !== 'canonical-root-user'
            || classification.turnId === identity.turn_id) return;
        const recordTimestamp = Date.parse(String(record.row.timestamp ?? ''));
        if (!Number.isFinite(recordTimestamp)) {
            throw new Error('forge_set_manifest_operator_signal_uninspectable');
        }
        if (recordTimestamp < authorityTimestamp) return;
        const payload = isRecord(record.row.payload) ? record.row.payload : undefined;
        const content = Array.isArray(payload?.content) ? payload.content : [];
        if (content.every((entry) => isRecord(entry)
            && entry.type === 'input_text' && typeof entry.text === 'string')) {
            const text = content.map((entry) => (entry as { text: string }).text).join('');
            if (isForgeSetAuthorityRevocation(text)) {
                throw new Error('forge_set_manifest_operator_signal_revoked');
            }
        }
    });
    const sessionSnapshot = scanFixedCodexSession(
        sessionFile, MAX_CODEX_SESSION_FILE_BYTES, (record) => {
        canonical.consume(record);
        projection.consume(record);
        },
    );
    projection.finish();
    const turn = canonical.finish();
    if (authorityRecordIndex === null
        || noncanonicalUserLikeIndexes.some((index) => index > authorityRecordIndex!)) {
        throw new Error('forge_set_manifest_operator_signal_uninspectable');
    }
    assertCompleteOrderedTurn(identity, turn, records);
    const exactCurrentTurn = turn.recordSha256 === identity.turn_record_sha256
        && turn.recordSetSha256 === identity.turn_record_set_sha256
        && turn.recordCount === identity.turn_record_count
        && turn.firstTimestamp === identity.turn_first_timestamp
        && turn.timestamp === identity.turn_timestamp;
    if (!exactCurrentTurn && (!allowHistorical || !isHistoricalSingleSetPrefix(identity, records))) {
        throw new Error('forge_set_manifest_request_identity_drift');
    }
    const boundRecords = exactCurrentTurn ? records : records.slice(0, 1);
    const matches = boundRecords.filter((record) => isExactSet(record.text));
    if (matches.length === 0) return null;
    if (boundRecords.length !== 1 || matches.length !== 1
        || matches[0]!.record_sha256 !== identity.turn_record_sha256) {
        throw new Error('forge_set_manifest_operator_signal_ambiguous');
    }
    if (!exactCurrentTurn) assertHistoricalSetTail(records);
    return {
        record_sha256: matches[0]!.record_sha256,
        content: matches[0]!.content,
        root_session_record_set_sha256: sessionSnapshot.sha256,
        root_session_record_count: sessionSnapshot.recordCount,
        root_session_file_bytes: sessionSnapshot.fileBytes,
    };
}

function readUniqueHistoricalForgeSetIdentity(
    current: VerifiedCodexRequestIdentity,
    now: number,
): VerifiedCodexRequestIdentity | null {
    const sessionFile = findCodexSessionFile(resolveCodexSessionsRoot(), current.thread_id);
    const turns: HistoricalRootTurn[] = [];
    const turnsById = new Map<string, HistoricalRootTurn>();
    const uninspectableIndexes: number[] = [];
    let lastCanonicalTurnId: string | null = null;
    const projection = createCodexPlatformContextProjection((record) => {
        const classification = classifyCodexSessionRecord(record.row);
        if (classification.kind === 'noncanonical-user-like') {
            uninspectableIndexes.push(record.index);
            return;
        }
        if (classification.kind !== 'canonical-root-user') return;
        const parsed = parseCanonicalSetRecord(record);
        if (!parsed) {
            uninspectableIndexes.push(record.index);
            return;
        }
        let turn = turnsById.get(parsed.turn_id);
        if (!turn) {
            turn = {
                turn_id: parsed.turn_id,
                first_index: record.index,
                records: [],
            };
            turnsById.set(parsed.turn_id, turn);
            turns.push(turn);
        }
        turn.records.push(parsed.record);
        lastCanonicalTurnId = parsed.turn_id;
    });
    scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, projection.consume);
    projection.finish();
    const currentTurn = turnsById.get(current.turn_id);
    if (!currentTurn || lastCanonicalTurnId !== current.turn_id
        || currentTurn.records.length !== current.turn_record_count
        || currentTurn.records.at(-1)?.record_sha256 !== current.turn_record_sha256
        || hashCanonicalTurnRecordSet(current.thread_id, current.turn_id, currentTurn.records)
            !== current.turn_record_set_sha256) {
        throw new Error('forge_set_manifest_request_identity_drift');
    }
    const exactTurns = turns.filter((turn) => turn.first_index < currentTurn.first_index
        && turn.records.some((record) => isExactSet(record.text)));
    const eligibleTurns = exactTurns.filter((turn) => {
        const record = turn.records[0];
        if (!record || turn.records.length !== 1) return true;
        const identity: VerifiedCodexRequestIdentity = {
            source: 'codex_request_meta',
            session_id: current.session_id,
            thread_id: current.thread_id,
            turn_id: turn.turn_id,
            thread_source: 'user',
            turn_record_sha256: record.record_sha256,
            turn_record_set_sha256: hashCanonicalTurnRecordSet(
                current.thread_id, turn.turn_id, turn.records,
            ),
            turn_record_count: 1,
            turn_first_timestamp: record.timestamp,
            turn_timestamp: record.timestamp,
        };
        return !persistedSetIsConsumed(identity);
    });
    if (eligibleTurns.length === 0) return null;
    if (eligibleTurns.length !== 1 || eligibleTurns[0]!.records.length !== 1) {
        throw new Error('forge_set_manifest_operator_signal_ambiguous');
    }
    const selected = eligibleTurns[0]!;
    const selectedRecord = selected.records[0]!;
    const selectedTimestamp = Date.parse(selectedRecord.timestamp);
    if (!Number.isFinite(selectedTimestamp) || selectedTimestamp > now + 60_000
        || now - selectedTimestamp > FORGE_SET_AUTHORIZATION_AGE_MS) {
        throw new Error('forge_set_manifest_request_identity_drift');
    }
    if (uninspectableIndexes.some((index) => index > selected.first_index)) {
        throw new Error('forge_set_manifest_operator_signal_uninspectable');
    }
    for (const turn of turns) {
        if (turn.first_index <= selected.first_index) continue;
        if (turn.records.some((record) => isForgeSetAuthorityRevocation(record.text))) {
            throw new Error('forge_set_manifest_operator_signal_revoked');
        }
    }
    return {
        source: 'codex_request_meta',
        session_id: current.session_id,
        thread_id: current.thread_id,
        turn_id: selected.turn_id,
        thread_source: 'user',
        turn_record_sha256: selectedRecord.record_sha256,
        turn_record_set_sha256: hashCanonicalTurnRecordSet(
            current.thread_id, selected.turn_id, selected.records,
        ),
        turn_record_count: 1,
        turn_first_timestamp: selectedRecord.timestamp,
        turn_timestamp: selectedRecord.timestamp,
    };
}

/** Use the current exact SET or one unrevoked prior SET while a repair is in step. */
export async function verifyCurrentOrHistoricalForgeSetAuthority(
    requestContext: McpRequestContext | undefined,
    now = Date.now(),
): Promise<VerifiedForgeSetAuthority | null> {
    const current = await verifyCodexRequestIdentity(requestContext, now);
    const currentSignal = readExactForgeSetSignal(current, now, false);
    if (currentSignal && persistedSetIsConsumed(current)) {
        throw new Error('forge_set_manifest_operator_signal_consumed');
    }
    const historical = readUniqueHistoricalForgeSetIdentity(current, now);
    if (currentSignal && historical) {
        throw new Error('forge_set_manifest_operator_signal_ambiguous');
    }
    if (currentSignal) return { identity: current, signal: currentSignal };
    if (!historical) return null;
    const signal = readExactForgeSetSignal(historical, now, true);
    if (!signal) throw new Error('forge_set_manifest_operator_signal_missing');
    return { identity: historical, signal };
}

function readHistoricalForgeSetIdentity(
    fields: ForgeSetMutationIdentityFields,
    now = Date.now(),
): VerifiedCodexRequestIdentity {
    const sessionFile = findCodexSessionFile(resolveCodexSessionsRoot(), fields.thread_id);
    const canonical = createCanonicalCodexUserTurnAccumulator(
        fields.thread_id,
        fields.turn_id,
        now,
        FORGE_SET_AUTHORIZATION_AGE_MS,
        true,
    );
    scanFixedCodexSession(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, canonical.consume);
    const turn = canonical.finish();
    let recordSha256 = turn.recordSha256;
    let recordSetSha256 = turn.recordSetSha256;
    let recordCount = turn.recordCount;
    let firstTimestamp = turn.firstTimestamp;
    let timestamp = turn.timestamp;
    if (turn.recordSetSha256 !== fields.record_set_sha256) {
        // SET v1 was mintable only from one canonical root record, so its only
        // compatibility-safe historical snapshot is the mechanically derived
        // first-record prefix. Later records remain fully scanned above/below.
        const historicalPrefix = [{
            timestamp: turn.firstTimestamp,
            record_sha256: turn.recordSha256s[0]!,
        }];
        if (hashCanonicalTurnRecordSet(
            fields.thread_id, fields.turn_id, historicalPrefix,
        ) !== fields.record_set_sha256) {
            throw new Error('forge_set_manifest_persisted_record_drift');
        }
        recordSha256 = historicalPrefix[0]!.record_sha256;
        recordSetSha256 = fields.record_set_sha256;
        recordCount = 1;
        firstTimestamp = historicalPrefix[0]!.timestamp;
        timestamp = historicalPrefix[0]!.timestamp;
    }
    if (recordSetSha256 !== fields.record_set_sha256) {
        throw new Error('forge_set_manifest_persisted_record_drift');
    }
    return {
        source: 'codex_request_meta',
        session_id: fields.thread_id,
        thread_id: fields.thread_id,
        turn_id: fields.turn_id,
        thread_source: 'user',
        turn_record_sha256: recordSha256,
        turn_record_set_sha256: recordSetSha256,
        turn_record_count: recordCount,
        turn_first_timestamp: firstTimestamp,
        turn_timestamp: timestamp,
    };
}

export function readForgeSetSignalFromMutationIdentity(
    fields: ForgeSetMutationIdentityFields,
    now = Date.now(),
): { identity: VerifiedCodexRequestIdentity; signal: VerifiedForgeSetSignal } {
    const sessionFile = findCodexSessionFile(resolveCodexSessionsRoot(), fields.thread_id);
    return retryAppendOnlyCodexSessionRead(sessionFile, MAX_CODEX_SESSION_FILE_BYTES, () => {
        const identity = readHistoricalForgeSetIdentity(fields, now);
        const signal = readExactForgeSetSignal(identity, now, true);
        if (!signal) throw new Error('forge_set_manifest_operator_signal_missing');
        return { identity, signal };
    });
}

export function readPersistedForgeSetSignal(
    fields: PersistedForgeSetAuthorityFields,
    now = Date.now(),
): { identity: VerifiedCodexRequestIdentity; signal: VerifiedForgeSetSignal } {
    const { identity, signal } = readForgeSetSignalFromMutationIdentity(fields, now);
    if (identity.turn_record_sha256 !== fields.record_sha256
        || identity.turn_record_set_sha256 !== fields.record_set_sha256
        || identity.turn_record_count !== fields.record_count) {
        throw new Error('forge_set_manifest_persisted_record_drift');
    }
    return { identity, signal };
}
