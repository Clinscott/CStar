import { createHash } from 'node:crypto';

import {
    codexUserRecordHasRootLineage,
    createCodexPlatformContextProjection,
    scanFixedCodexSession,
    type FixedCodexSessionRecord,
} from './codex_session_authority_projection.js';

const MAX_TURN_RECORDS = 256;
const MAX_TURN_RECORD_BYTES = 4 * 1024 * 1024;

export interface CanonicalCodexUserTurn {
    firstTimestamp: string;
    timestamp: string;
    recordSha256: string;
    recordSetSha256: string;
    recordCount: number;
    recordSha256s: string[];
}

interface TurnRecord {
    timestamp: string;
    timestampMs: number;
    recordSha256: string;
}

export type CodexSessionRecordKind =
    | 'canonical-root-user'
    | 'noncanonical-user-like'
    | 'non-user';

export interface CodexSessionRecordClassification {
    kind: CodexSessionRecordKind;
    turnId: unknown;
    rootLineage: boolean;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Project one session row onto the only records that can carry user authority. */
export function classifyCodexSessionRecord(
    row: Record<string, unknown>,
): CodexSessionRecordClassification {
    const payload = isRecord(row.payload) ? row.payload : undefined;
    const metadata = payload && isRecord(payload.internal_chat_message_metadata_passthrough)
        ? payload.internal_chat_message_metadata_passthrough
        : undefined;
    const canonicalRootUser = row.type === 'response_item'
        && payload?.type === 'message'
        && payload.role === 'user';
    const explicitlyUserLike = payload?.role === 'user' || payload?.type === 'user_message';
    return {
        kind: canonicalRootUser
            ? 'canonical-root-user'
            : explicitlyUserLike ? 'noncanonical-user-like' : 'non-user',
        turnId: metadata?.turn_id,
        rootLineage: canonicalRootUser && codexUserRecordHasRootLineage(row),
    };
}

function optionalLineageFieldIsEmpty(value: unknown): boolean {
    return value === undefined || value === null || value === '';
}

function threadSourceIsCanonicalRoot(value: unknown): boolean {
    return value === undefined || value === 'user';
}

export interface CanonicalCodexUserTurnAccumulator {
    consume(record: FixedCodexSessionRecord): void;
    finish(): CanonicalCodexUserTurn;
}

/** Track one selected turn without retaining unrelated session rows. */
export function createCanonicalCodexUserTurnAccumulator(
    expectedThreadId: string,
    turnId: string,
    now: number,
    maxRecordAgeMs: number,
    allowHistorical = false,
): CanonicalCodexUserTurnAccumulator {
    let canonicalSessionMetaCount = 0;
    let noncanonicalSessionMetaFound = false;
    let matchingSegmentStarted = false;
    let matchingSegmentClosed = false;
    let matchingBytes = 0;
    const seenRecordHashes = new Set<string>();
    const records: TurnRecord[] = [];

    const consumeProjected = ({ row, rawLine }: FixedCodexSessionRecord): void => {
        const payload = isRecord(row.payload) ? row.payload : undefined;

        if (row.type === 'session_meta') {
            const canonical = payload?.id === expectedThreadId
                && threadSourceIsCanonicalRoot(payload.thread_source)
                && optionalLineageFieldIsEmpty(payload.parent_thread_id)
                && optionalLineageFieldIsEmpty(payload.agent_path)
                && optionalLineageFieldIsEmpty(payload.forked_from_id);
            if (canonical) canonicalSessionMetaCount += 1;
            else noncanonicalSessionMetaFound = true;
            return;
        }

        const classification = classifyCodexSessionRecord(row);
        const rowTurnId = classification.turnId;
        if (classification.kind === 'noncanonical-user-like') {
            if (rowTurnId === turnId) {
                throw new Error('codex_request_identity_turn_record_is_not_canonical_root_user');
            }
            if (matchingSegmentStarted && rowTurnId !== undefined) {
                matchingSegmentClosed = true;
            }
            return;
        }
        if (classification.kind !== 'canonical-root-user') return;

        if (rowTurnId !== turnId) {
            if (matchingSegmentStarted) matchingSegmentClosed = true;
            return;
        }
        if (matchingSegmentClosed) {
            throw new Error('codex_request_identity_turn_records_noncontiguous');
        }
        if (canonicalSessionMetaCount === 0) {
            if (noncanonicalSessionMetaFound) {
                throw new Error('codex_request_identity_session_is_not_canonical_root_user');
            }
            throw new Error('codex_request_identity_turn_precedes_canonical_session_meta');
        }
        if (!payload || !classification.rootLineage) {
            throw new Error('codex_request_identity_turn_record_lineage_invalid');
        }
        if (!Array.isArray(payload.content) || payload.content.length === 0) {
            throw new Error('codex_request_identity_turn_is_incomplete');
        }
        const content = payload.content.map((entry) => {
            if (!isRecord(entry)) throw new Error('codex_request_identity_turn_is_incomplete');
            return entry;
        });
        const inputText = content
            .filter((entry) => entry.type === 'input_text' && typeof entry.text === 'string')
            .map((entry) => entry.text as string);
        if (
            typeof row.timestamp !== 'string' || inputText.length === 0
            || inputText.every((text) => !text.trim())
        ) {
            throw new Error('codex_request_identity_turn_is_incomplete');
        }

        const timestampMs = Date.parse(row.timestamp);
        if (!Number.isFinite(timestampMs) || timestampMs > now + 60_000 || now - timestampMs > maxRecordAgeMs) {
            throw new Error('codex_request_identity_turn_expired_or_future_dated');
        }
        if (records.length && timestampMs < records[records.length - 1]!.timestampMs) {
            throw new Error('codex_request_identity_turn_timestamps_nonmonotonic');
        }

        const recordSha256 = sha256(rawLine);
        if (seenRecordHashes.has(recordSha256)) {
            throw new Error('codex_request_identity_duplicate_turn_record');
        }
        seenRecordHashes.add(recordSha256);
        matchingBytes += Buffer.byteLength(rawLine, 'utf-8');
        if (records.length >= MAX_TURN_RECORDS || matchingBytes > MAX_TURN_RECORD_BYTES) {
            throw new Error('codex_request_identity_turn_record_set_limit_exceeded');
        }
        matchingSegmentStarted = true;
        records.push({ timestamp: row.timestamp, timestampMs, recordSha256 });
    };
    const projection = createCodexPlatformContextProjection(consumeProjected);
    const finish = (): CanonicalCodexUserTurn => {
        projection.finish();
        if (canonicalSessionMetaCount === 0 || noncanonicalSessionMetaFound) {
            throw new Error('codex_request_identity_session_is_not_canonical_root_user');
        }
        if (records.length === 0) throw new Error('codex_request_identity_turn_match_count:0');
        if (matchingSegmentClosed && !allowHistorical) {
            throw new Error('codex_request_identity_turn_not_latest');
        }
        const terminal = records[records.length - 1]!;
        const recordSetSha256 = sha256(JSON.stringify({
            schema: 'cstar.codex_root_user_turn_record_set.v1',
            thread_id: expectedThreadId,
            turn_id: turnId,
            records: records.map(({ timestamp, recordSha256: hash }, index) => ({
                index,
                timestamp,
                record_sha256: hash,
            })),
        }));
        return {
            firstTimestamp: records[0]!.timestamp,
            timestamp: terminal.timestamp,
            recordSha256: terminal.recordSha256,
            recordSetSha256,
            recordCount: records.length,
            recordSha256s: records.map((record) => record.recordSha256),
        };
    };
    return { consume: projection.consume, finish };
}

/** Scan one fixed descriptor, then bind a complete ordered root-user turn. */
export async function readCanonicalCodexUserTurn(
    sessionFile: string,
    expectedThreadId: string,
    turnId: string,
    now: number,
    maxFileBytes: number,
    maxRecordAgeMs: number,
    allowHistorical = false,
): Promise<CanonicalCodexUserTurn> {
    const accumulator = createCanonicalCodexUserTurnAccumulator(
        expectedThreadId,
        turnId,
        now,
        maxRecordAgeMs,
        allowHistorical,
    );
    scanFixedCodexSession(sessionFile, maxFileBytes, accumulator.consume);
    return accumulator.finish();
}
