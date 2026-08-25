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

const SHA256 = /^[a-f0-9]{64}$/;

function hashTurnRecordSet(
    expectedThreadId: string,
    turnId: string,
    records: TurnRecord[],
): string {
    return sha256(JSON.stringify({
        schema: 'cstar.codex_root_user_turn_record_set.v1',
        thread_id: expectedThreadId,
        turn_id: turnId,
        records: records.map(({ timestamp, recordSha256: hash }, index) => ({
            index,
            timestamp,
            record_sha256: hash,
        })),
    }));
}

function turnFromRecords(
    expectedThreadId: string,
    turnId: string,
    records: TurnRecord[],
): CanonicalCodexUserTurn {
    const terminal = records[records.length - 1]!;
    return {
        firstTimestamp: records[0]!.timestamp,
        timestamp: terminal.timestamp,
        recordSha256: terminal.recordSha256,
        recordSetSha256: hashTurnRecordSet(expectedThreadId, turnId, records),
        recordCount: records.length,
        recordSha256s: records.map((record) => record.recordSha256),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Host-carried reviewer output is not an operator instruction, even when the
 * host temporarily carries it in a user-shaped response record. Ignore every
 * such record rather than letting an embedded stop/grant phrase steer CStar. */
function isSubagentNotificationCarrier(payload: Record<string, unknown> | undefined): boolean {
    if (payload?.type !== 'message' || payload.role !== 'user' || !Array.isArray(payload.content)) {
        return false;
    }
    const text = payload.content.map((entry) => (
        isRecord(entry) && entry.type === 'input_text' && typeof entry.text === 'string'
            ? entry.text : null
    ));
    return text.every((entry) => entry !== null)
        && /^\s*<subagent_notification>\s*[\s\S]*<\/subagent_notification>\s*$/i.test(text.join(''));
}

/** Project one session row onto the only records that can carry user authority. */
export function classifyCodexSessionRecord(
    row: Record<string, unknown>,
): CodexSessionRecordClassification {
    const payload = isRecord(row.payload) ? row.payload : undefined;
    const metadata = payload && isRecord(payload.internal_chat_message_metadata_passthrough)
        ? payload.internal_chat_message_metadata_passthrough
        : undefined;
    const userShapedNotification = isSubagentNotificationCarrier(payload);
    const canonicalRootUser = !userShapedNotification && row.type === 'response_item'
        && payload?.type === 'message' && payload.role === 'user';
    const explicitlyUserLike = payload?.role === 'user' || payload?.type === 'user_message';
    return {
        kind: userShapedNotification ? 'non-user' : canonicalRootUser
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
function createCanonicalCodexUserTurnAccumulatorInternal(
    expectedThreadId: string,
    turnId: string,
    now: number,
    maxRecordAgeMs: number,
    allowHistorical = false,
    sealedRecordSetSha256?: string,
): CanonicalCodexUserTurnAccumulator {
    let canonicalSessionMetaCount = 0;
    let noncanonicalSessionMetaFound = false;
    let matchingSegmentStarted = false;
    let matchingSegmentClosed = false;
    let matchingBytes = 0;
    let matchingRecordCount = 0;
    let lastMatchingTimestampMs: number | null = null;
    let sealedPrefix: CanonicalCodexUserTurn | null = null;
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
        if (lastMatchingTimestampMs !== null && timestampMs < lastMatchingTimestampMs) {
            throw new Error('codex_request_identity_turn_timestamps_nonmonotonic');
        }

        const recordSha256 = sha256(rawLine);
        if (seenRecordHashes.has(recordSha256)) {
            throw new Error('codex_request_identity_duplicate_turn_record');
        }
        seenRecordHashes.add(recordSha256);
        matchingBytes += Buffer.byteLength(rawLine, 'utf-8');
        matchingRecordCount += 1;
        if (matchingRecordCount > MAX_TURN_RECORDS || matchingBytes > MAX_TURN_RECORD_BYTES) {
            throw new Error('codex_request_identity_turn_record_set_limit_exceeded');
        }
        lastMatchingTimestampMs = timestampMs;
        matchingSegmentStarted = true;

        // A policy seals an ordered prefix, not an unfinished live turn. Keep
        // validating later records for lineage and bounds, but do not let
        // appended informational records rewrite the sealed evidence.
        if (sealedPrefix !== null) return;
        records.push({ timestamp: row.timestamp, timestampMs, recordSha256 });
        if (sealedRecordSetSha256 !== undefined
            && hashTurnRecordSet(expectedThreadId, turnId, records) === sealedRecordSetSha256) {
            sealedPrefix = turnFromRecords(expectedThreadId, turnId, records);
        }
    };
    const projection = createCodexPlatformContextProjection(consumeProjected);
    const finish = (): CanonicalCodexUserTurn => {
        projection.finish();
        if (canonicalSessionMetaCount === 0 || noncanonicalSessionMetaFound) {
            throw new Error('codex_request_identity_session_is_not_canonical_root_user');
        }
        if (sealedRecordSetSha256 !== undefined) {
            if (sealedPrefix === null) {
                throw new Error('codex_request_identity_sealed_prefix_not_found');
            }
            return sealedPrefix;
        }
        if (records.length === 0) throw new Error('codex_request_identity_turn_match_count:0');
        if (matchingSegmentClosed && !allowHistorical) {
            throw new Error('codex_request_identity_turn_not_latest');
        }
        return turnFromRecords(expectedThreadId, turnId, records);
    };
    return { consume: projection.consume, finish };
}

export function createCanonicalCodexUserTurnAccumulator(
    expectedThreadId: string,
    turnId: string,
    now: number,
    maxRecordAgeMs: number,
    allowHistorical = false,
): CanonicalCodexUserTurnAccumulator {
    return createCanonicalCodexUserTurnAccumulatorInternal(
        expectedThreadId, turnId, now, maxRecordAgeMs, allowHistorical,
    );
}

/**
 * Revalidate a previously sealed ordered root-user prefix while permitting
 * later records in the still-open host turn to be inspected separately.
 */
export function createSealedCanonicalCodexUserTurnAccumulator(
    expectedThreadId: string,
    turnId: string,
    now: number,
    maxRecordAgeMs: number,
    sealedRecordSetSha256: string,
): CanonicalCodexUserTurnAccumulator {
    if (!SHA256.test(sealedRecordSetSha256)) {
        throw new Error('codex_request_identity_sealed_prefix_hash_invalid');
    }
    return createCanonicalCodexUserTurnAccumulatorInternal(
        expectedThreadId, turnId, now, maxRecordAgeMs, true, sealedRecordSetSha256,
    );
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
