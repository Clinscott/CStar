import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { TextDecoder } from 'node:util';

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

export interface FixedCodexSessionSnapshot {
    content: string;
    sha256: string;
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
    };
}

function optionalLineageFieldIsEmpty(value: unknown): boolean {
    return value === undefined || value === null || value === '';
}

function sameOpenedFile(left: fs.Stats, right: fs.Stats): boolean {
    return left.dev === right.dev
        && left.ino === right.ino
        && left.uid === right.uid
        && left.gid === right.gid
        && left.mode === right.mode
        && left.nlink === right.nlink
        && left.size === right.size
        && left.mtimeMs === right.mtimeMs
        && left.ctimeMs === right.ctimeMs;
}

function assertOpenedSessionFileIsSafe(stat: fs.Stats, maxFileBytes: number): void {
    if (
        !stat.isFile() || stat.nlink !== 1
        || stat.uid !== process.getuid?.() || (stat.mode & 0o022) !== 0
        || stat.size === 0 || stat.size > maxFileBytes
    ) {
        throw new Error('codex_request_identity_opened_session_file_is_unsafe');
    }
}

export function readFixedCodexSessionSnapshot(
    sessionFile: string,
    maxFileBytes: number,
): FixedCodexSessionSnapshot {
    const beforeOpen = fs.lstatSync(sessionFile);
    if (beforeOpen.isSymbolicLink()) {
        throw new Error('codex_request_identity_opened_session_file_is_unsafe');
    }
    const descriptor = fs.openSync(sessionFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const opened = fs.fstatSync(descriptor);
        assertOpenedSessionFileIsSafe(opened, maxFileBytes);
        if (!sameOpenedFile(beforeOpen, opened)) {
            throw new Error('codex_request_identity_session_changed_before_open');
        }

        const snapshot = Buffer.allocUnsafe(opened.size);
        let offset = 0;
        while (offset < snapshot.length) {
            const read = fs.readSync(descriptor, snapshot, offset, snapshot.length - offset, offset);
            if (read === 0) break;
            offset += read;
        }
        if (offset !== snapshot.length) {
            throw new Error('codex_request_identity_session_changed_during_read');
        }
        if (snapshot[snapshot.length - 1] !== 0x0a) {
            throw new Error('codex_request_identity_session_has_incomplete_final_line');
        }

        const afterRead = fs.fstatSync(descriptor);
        let afterPath: fs.Stats;
        try {
            afterPath = fs.lstatSync(sessionFile);
        } catch {
            throw new Error('codex_request_identity_session_changed_during_read');
        }
        if (afterPath.isSymbolicLink() || !sameOpenedFile(opened, afterRead) || !sameOpenedFile(opened, afterPath)) {
            throw new Error('codex_request_identity_session_changed_during_read');
        }
        try {
            return {
                content: new TextDecoder('utf-8', { fatal: true }).decode(snapshot),
                sha256: createHash('sha256').update(snapshot).digest('hex'),
            };
        } catch {
            throw new Error('codex_request_identity_session_utf8_invalid');
        }
    } finally {
        fs.closeSync(descriptor);
    }
}

/** Bind one Codex turn inside an already sealed session snapshot. */
export function readCanonicalCodexUserTurnFromSnapshot(
    snapshot: FixedCodexSessionSnapshot,
    expectedThreadId: string,
    turnId: string,
    now: number,
    maxRecordAgeMs: number,
    allowHistorical = false,
): CanonicalCodexUserTurn {
    const rawLines = snapshot.content.split('\n');
    rawLines.pop();

    let canonicalSessionMetaCount = 0;
    let noncanonicalSessionMetaFound = false;
    let matchingSegmentStarted = false;
    let matchingSegmentClosed = false;
    let matchingBytes = 0;
    const seenRecordHashes = new Set<string>();
    const records: TurnRecord[] = [];

    for (const rawLineWithPossibleCr of rawLines) {
        const rawLine = rawLineWithPossibleCr.endsWith('\r')
            ? rawLineWithPossibleCr.slice(0, -1)
            : rawLineWithPossibleCr;
        let unknownRow: unknown;
        try {
            unknownRow = JSON.parse(rawLine);
        } catch {
            throw new Error('codex_request_identity_session_json_malformed');
        }
        if (!isRecord(unknownRow)) {
            throw new Error('codex_request_identity_session_record_invalid');
        }
        const row = unknownRow;
        const payload = isRecord(row.payload) ? row.payload : undefined;

        if (row.type === 'session_meta') {
            const canonical = payload?.id === expectedThreadId
                && payload.thread_source === 'user'
                && optionalLineageFieldIsEmpty(payload.parent_thread_id)
                && optionalLineageFieldIsEmpty(payload.agent_path)
                && optionalLineageFieldIsEmpty(payload.forked_from_id);
            if (canonical) canonicalSessionMetaCount += 1;
            else noncanonicalSessionMetaFound = true;
            continue;
        }

        const classification = classifyCodexSessionRecord(row);
        const rowTurnId = classification.turnId;
        if (rowTurnId === turnId && classification.kind === 'noncanonical-user-like') {
            throw new Error('codex_request_identity_turn_record_is_not_canonical_root_user');
        }
        if (classification.kind !== 'canonical-root-user') continue;

        if (rowTurnId !== turnId) {
            if (matchingSegmentStarted) matchingSegmentClosed = true;
            continue;
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
        if (!payload || (
            (payload.thread_source !== undefined && payload.thread_source !== 'user')
            || !optionalLineageFieldIsEmpty(payload.parent_thread_id)
            || !optionalLineageFieldIsEmpty(payload.agent_path)
            || !optionalLineageFieldIsEmpty(payload.forked_from_id)
        )) {
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
    }

    if (canonicalSessionMetaCount === 0 || noncanonicalSessionMetaFound) {
        throw new Error('codex_request_identity_session_is_not_canonical_root_user');
    }
    if (records.length === 0) throw new Error('codex_request_identity_turn_match_count:0');
    if (matchingSegmentClosed && !allowHistorical) throw new Error('codex_request_identity_turn_not_latest');

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
}

/** Read one fixed snapshot, then bind a complete ordered root-user turn. */
export async function readCanonicalCodexUserTurn(
    sessionFile: string,
    expectedThreadId: string,
    turnId: string,
    now: number,
    maxFileBytes: number,
    maxRecordAgeMs: number,
    allowHistorical = false,
): Promise<CanonicalCodexUserTurn> {
    return readCanonicalCodexUserTurnFromSnapshot(
        readFixedCodexSessionSnapshot(sessionFile, maxFileBytes),
        expectedThreadId,
        turnId,
        now,
        maxRecordAgeMs,
        allowHistorical,
    );
}
