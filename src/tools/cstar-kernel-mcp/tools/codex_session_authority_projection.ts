import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { TextDecoder } from 'node:util';

const SCAN_CHUNK_BYTES = 64 * 1024;
const MAX_JSONL_RECORD_BYTES = 64 * 1024 * 1024;
const MAX_JSONL_RECORDS = 1_000_000;
const MAX_PLATFORM_CONTEXT_ENVELOPE_BYTES = 1024 * 1024;
const MAX_PLATFORM_CONTEXT_ENVELOPE_SPAN_MS = 1_000;
const MAX_USER_EVENT_MIRROR_SPAN_MS = 1_000;
const MAX_GOAL_CONTEXT_BYTES = 256 * 1024;

export interface FixedCodexSessionRecord {
    index: number;
    rawLine: string;
    row: Record<string, unknown>;
}

export interface FixedCodexSessionScan {
    fileBytes: number;
    recordCount: number;
    sha256: string;
}

export interface CodexPlatformContextProjection {
    consume(record: FixedCodexSessionRecord): void;
    finish(): void;
}

interface PlatformContextCandidate {
    turnId: string;
    currentDate: string;
    timezone: string;
    workspaceRoots: string[];
    permissionProfile: string;
    fileSystem: string;
    subagents?: string;
}

interface CanonicalUserMirrorCandidate {
    index: number;
    timestamp: string;
    message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalLineageFieldIsEmpty(value: unknown): boolean {
    return value === undefined || value === null || value === '';
}

export function codexUserRecordHasRootLineage(row: Record<string, unknown>): boolean {
    const payload = isRecord(row.payload) ? row.payload : undefined;
    const metadata = payload && isRecord(payload.internal_chat_message_metadata_passthrough)
        ? payload.internal_chat_message_metadata_passthrough : undefined;
    return Boolean(payload && metadata)
        && (payload!.thread_source === undefined || payload!.thread_source === 'user')
        && optionalLineageFieldIsEmpty(payload!.parent_thread_id)
        && optionalLineageFieldIsEmpty(payload!.agent_path)
        && optionalLineageFieldIsEmpty(payload!.forked_from_id)
        && (metadata!.thread_source === undefined || metadata!.thread_source === 'user')
        && optionalLineageFieldIsEmpty(metadata!.parent_thread_id)
        && optionalLineageFieldIsEmpty(metadata!.forked_from_thread_id)
        && optionalLineageFieldIsEmpty(metadata!.forked_from_id)
        && optionalLineageFieldIsEmpty(metadata!.agent_path)
        && optionalLineageFieldIsEmpty(metadata!.subagent_kind);
}

function canonicalUserTurnId(record: FixedCodexSessionRecord): string | null {
    const payload = isRecord(record.row.payload) ? record.row.payload : undefined;
    const metadata = payload && isRecord(payload.internal_chat_message_metadata_passthrough)
        ? payload.internal_chat_message_metadata_passthrough : undefined;
    return record.row.type === 'response_item'
        && payload?.type === 'message'
        && payload.role === 'user'
        && typeof metadata?.turn_id === 'string'
        && codexUserRecordHasRootLineage(record.row)
        ? metadata.turn_id : null;
}

function isReservedGoalContext(record: FixedCodexSessionRecord): boolean {
    if (!canonicalUserTurnId(record)) return false;
    const payload = isRecord(record.row.payload) ? record.row.payload : undefined;
    const content = payload?.content;
    if (!Array.isArray(content) || content.length !== 1) return false;
    const item = content[0];
    if (!isRecord(item) || item.type !== 'input_text' || typeof item.text !== 'string') return false;
    if (Buffer.byteLength(item.text, 'utf-8') > MAX_GOAL_CONTEXT_BYTES) return false;
    return /^<codex_internal_context source="goal">\r?\n[\s\S]*\r?\n<\/codex_internal_context>\r?\n?$/.test(item.text);
}

function canonicalUserMirrorCandidate(
    record: FixedCodexSessionRecord,
): CanonicalUserMirrorCandidate | null {
    if (!canonicalUserTurnId(record) || typeof record.row.timestamp !== 'string') return null;
    const payload = isRecord(record.row.payload) ? record.row.payload : undefined;
    const content = payload?.content;
    if (!Array.isArray(content) || content.length === 0) return null;
    const text = content.map((item) => (
        isRecord(item) && item.type === 'input_text' && typeof item.text === 'string'
            ? item.text : null
    ));
    if (text.some((value) => value === null)) return null;
    return { index: record.index, timestamp: record.row.timestamp, message: text.join('') };
}

function isExactUserEventMirror(
    record: FixedCodexSessionRecord,
    source: CanonicalUserMirrorCandidate,
): boolean {
    const payload = isRecord(record.row.payload) ? record.row.payload : undefined;
    const sourceTimestamp = Date.parse(source.timestamp);
    const mirrorTimestamp = typeof record.row.timestamp === 'string'
        ? Date.parse(record.row.timestamp) : Number.NaN;
    if (
        record.index !== source.index + 1
        || !Number.isFinite(sourceTimestamp) || !Number.isFinite(mirrorTimestamp)
        || mirrorTimestamp < sourceTimestamp
        || mirrorTimestamp - sourceTimestamp > MAX_USER_EVENT_MIRROR_SPAN_MS
        || record.row.type !== 'event_msg'
        || payload?.type !== 'user_message'
        || payload.message !== source.message
        || !['images', 'local_images', 'text_elements'].every(
            (key) => Array.isArray(payload[key]) && payload[key].length === 0,
        )
        || !['audio', 'local_audio'].every(
            (key) => payload[key] === undefined
                || (Array.isArray(payload[key]) && payload[key].length === 0),
        )
        || (payload.client_id !== undefined && typeof payload.client_id !== 'string')
    ) {
        return false;
    }
    const allowed = new Set(['type', 'client_id', 'message', 'images', 'local_images', 'text_elements', 'audio', 'local_audio']);
    const allowedRowKeys = new Set(['timestamp', 'type', 'payload']);
    return Object.keys(record.row).every((key) => allowedRowKeys.has(key))
        && Object.keys(payload).every((key) => allowed.has(key));
}

function isPlatformContextCandidate(record: FixedCodexSessionRecord): PlatformContextCandidate | null {
    const turnId = canonicalUserTurnId(record);
    const payload = isRecord(record.row.payload) ? record.row.payload : undefined;
    const content = payload?.content;
    if (!turnId || !Array.isArray(content) || content.length !== 1) return null;
    const item = content[0];
    if (!isRecord(item) || item.type !== 'input_text' || typeof item.text !== 'string') return null;
    const lines = item.text.split('\n');
    if (lines[0] !== '<environment_context>' || lines.at(-1) !== '</environment_context>') return null;
    const currentDate = /^  <current_date>([^<>\r]+)<\/current_date>$/.exec(lines[1] ?? '')?.[1];
    const timezone = /^  <timezone>([^<>\r]+)<\/timezone>$/.exec(lines[2] ?? '')?.[1];
    const filesystem = /^  <filesystem><workspace_roots>((?:<root>[^<>\r]+<\/root>)+)<\/workspace_roots><permission_profile type="([^"<>\r]+)"><file_system type="([^"<>\r]+)" \/><\/permission_profile><\/filesystem>$/.exec(lines[3] ?? '');
    if (!currentDate || !timezone || !filesystem) return null;
    const rootMarkup = filesystem[1]!;
    const rootMatches = [...rootMarkup.matchAll(/<root>([^<>\r]+)<\/root>/g)];
    if (rootMatches.length === 0 || rootMatches.map((match) => match[0]).join('') !== rootMarkup) return null;

    let subagents: string | undefined;
    if (lines.length !== 5) {
        if (lines.length < 8 || lines[4] !== '  <subagents>' || lines.at(-2) !== '  </subagents>') return null;
        const subagentLines = lines.slice(5, -2);
        if (subagentLines.length === 0 || subagentLines.some((line) => !line.startsWith('    ') || !line.slice(4))) {
            return null;
        }
        subagents = subagentLines.map((line) => line.slice(4)).join('\n');
    }
    return {
        turnId,
        currentDate,
        timezone,
        workspaceRoots: rootMatches.map((match) => match[1]!),
        permissionProfile: filesystem[2]!,
        fileSystem: filesystem[3]!,
        ...(subagents === undefined ? {} : { subagents }),
    };
}

function worldStateMatches(
    record: FixedCodexSessionRecord,
    candidate: PlatformContextCandidate,
): boolean {
    const payload = isRecord(record.row.payload) ? record.row.payload : undefined;
    const state = payload && isRecord(payload.state) ? payload.state : undefined;
    const environments = state && isRecord(state.environments) ? state.environments : undefined;
    return record.row.type === 'world_state'
        && payload?.full === false
        && environments?.current_date === candidate.currentDate
        && environments?.subagents === candidate.subagents;
}

function turnContextMatches(
    record: FixedCodexSessionRecord,
    candidate: PlatformContextCandidate,
): boolean {
    const payload = isRecord(record.row.payload) ? record.row.payload : undefined;
    const permission = payload && isRecord(payload.permission_profile)
        ? payload.permission_profile : undefined;
    const sandbox = payload && isRecord(payload.sandbox_policy) ? payload.sandbox_policy : undefined;
    const workspaceRoots = payload?.workspace_roots;
    const expectedSandbox = candidate.fileSystem === 'unrestricted'
        ? 'danger-full-access' : candidate.fileSystem;
    return record.row.type === 'turn_context'
        && payload?.turn_id === candidate.turnId
        && payload.current_date === candidate.currentDate
        && payload.timezone === candidate.timezone
        && Array.isArray(workspaceRoots)
        && workspaceRoots.length === candidate.workspaceRoots.length
        && workspaceRoots.every((root, index) => root === candidate.workspaceRoots[index])
        && permission?.type === candidate.permissionProfile
        && sandbox?.type === expectedSandbox;
}

function recordTimestampMs(record: FixedCodexSessionRecord): number | null {
    if (typeof record.row.timestamp !== 'string') return null;
    const parsed = Date.parse(record.row.timestamp);
    return Number.isFinite(parsed) ? parsed : null;
}

function isConsecutive(
    records: FixedCodexSessionRecord[],
    next: FixedCodexSessionRecord,
): boolean {
    const previous = records[records.length - 1];
    return !previous || next.index === previous.index + 1;
}

function timestampsProveEnvelope(records: FixedCodexSessionRecord[]): boolean {
    const timestamps = records.map(recordTimestampMs);
    if (timestamps.some((value) => value === null)) return false;
    const values = timestamps as number[];
    return values.every((value, index) => index === 0 || value >= values[index - 1]!)
        && values[values.length - 1]! - values[0]! <= MAX_PLATFORM_CONTEXT_ENVELOPE_SPAN_MS;
}

/** Remove only a complete host envelope, reserved goal packet, or exact adjacent
 * user-event mirror. Every near miss is replayed and remains fail-closed. */
export function createCodexPlatformContextProjection(
    visitor: (record: FixedCodexSessionRecord) => void,
): CodexPlatformContextProjection {
    let pending: FixedCodexSessionRecord[] = [];
    let pendingCandidate: PlatformContextCandidate | null = null;
    let pendingBytes = 0;
    let mirrorCandidate: CanonicalUserMirrorCandidate | null = null;

    const visit = (record: FixedCodexSessionRecord): void => {
        visitor(record);
        mirrorCandidate = canonicalUserMirrorCandidate(record);
    };

    const emitPending = (): void => {
        for (const record of pending) visit(record);
        pending = [];
        pendingCandidate = null;
        pendingBytes = 0;
    };
    const buffer = (record: FixedCodexSessionRecord): boolean => {
        pendingBytes += Buffer.byteLength(record.rawLine, 'utf-8');
        pending.push(record);
        return pendingBytes <= MAX_PLATFORM_CONTEXT_ENVELOPE_BYTES;
    };
    const consume = (record: FixedCodexSessionRecord): void => {
        if (mirrorCandidate && isExactUserEventMirror(record, mirrorCandidate)) {
            mirrorCandidate = null;
            return;
        }
        mirrorCandidate = null;
        if (pending.length === 0) {
            // Goal continuation packets are reserved host context, never operator
            // authority. Exact user-authored lookalikes are also ignored, which can
            // only fail closed; text outside the complete envelope is retained.
            if (isReservedGoalContext(record)) return;
            const candidate = isPlatformContextCandidate(record);
            if (!candidate) {
                visit(record);
                return;
            }
            pendingCandidate = candidate;
            if (!buffer(record)) emitPending();
            return;
        }

        const expectedWorldState = pending.length === 1
            && isConsecutive(pending, record)
            && pendingCandidate !== null
            && worldStateMatches(record, pendingCandidate);
        if (expectedWorldState) {
            if (!buffer(record)) emitPending();
            return;
        }

        const expectedTurnContext = pending.length === 2
            && isConsecutive(pending, record)
            && pendingCandidate !== null
            && turnContextMatches(record, pendingCandidate);
        if (expectedTurnContext) {
            if (!buffer(record)) emitPending();
            return;
        }

        const provesCompleteEnvelope = pending.length === 3
            && isConsecutive(pending, record)
            && canonicalUserTurnId(record) === pendingCandidate?.turnId
            && timestampsProveEnvelope([...pending, record]);
        if (provesCompleteEnvelope) {
            const [, worldState, turnContext] = pending;
            pending = [];
            pendingCandidate = null;
            pendingBytes = 0;
            visit(worldState!);
            visit(turnContext!);
            visit(record);
            return;
        }

        emitPending();
        consume(record);
    };
    return { consume, finish: emitPending };
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

/**
 * Scan one immutable descriptor, validating every JSONL row before any caller
 * may use its bounded authority state. The visitor must not retain unrelated
 * row content and receives decoded raw-line bytes only for the current row.
 */
export function scanFixedCodexSession(
    sessionFile: string,
    maxFileBytes: number,
    visitor: (record: FixedCodexSessionRecord) => void,
): FixedCodexSessionScan {
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

        const digest = createHash('sha256');
        const chunk = Buffer.allocUnsafe(Math.min(SCAN_CHUNK_BYTES, opened.size));
        let lineFragments: Buffer[] = [];
        let lineBytes = 0;
        let offset = 0;
        let recordCount = 0;
        let finalByte: number | undefined;
        let firstRecordFailure: { index: number; error: Error } | undefined;
        let firstVisitorFailure: { index: number; error: Error } | undefined;

        const rememberRecordFailure = (index: number, message: string): void => {
            firstRecordFailure ??= { index, error: new Error(message) };
        };
        const processLine = (terminalFragment: Buffer): void => {
            const index = recordCount++;
            if (recordCount > MAX_JSONL_RECORDS) {
                rememberRecordFailure(index, 'codex_request_identity_session_record_count_limit_exceeded');
                lineFragments = [];
                lineBytes = 0;
                return;
            }
            const totalBytes = lineBytes + terminalFragment.length;
            if (totalBytes > MAX_JSONL_RECORD_BYTES) {
                rememberRecordFailure(index, 'codex_request_identity_session_record_limit_exceeded');
                lineFragments = [];
                lineBytes = 0;
                return;
            }
            if (firstRecordFailure) {
                lineFragments = [];
                lineBytes = 0;
                return;
            }
            const rawBytes = lineFragments.length === 0
                ? terminalFragment
                : Buffer.concat([...lineFragments, terminalFragment], totalBytes);
            lineFragments = [];
            lineBytes = 0;
            const startsWithBom = index === 0 && rawBytes.length >= 3
                && rawBytes[0] === 0xef && rawBytes[1] === 0xbb && rawBytes[2] === 0xbf;
            let rawLineWithPossibleCr: string;
            try {
                rawLineWithPossibleCr = new TextDecoder('utf-8', {
                    fatal: true,
                    ignoreBOM: true,
                }).decode(startsWithBom ? rawBytes.subarray(3) : rawBytes);
            } catch {
                rememberRecordFailure(index, 'codex_request_identity_session_utf8_invalid');
                return;
            }
            const rawLine = rawLineWithPossibleCr.endsWith('\r')
                ? rawLineWithPossibleCr.slice(0, -1)
                : rawLineWithPossibleCr;
            let unknownRow: unknown;
            try {
                unknownRow = JSON.parse(rawLine);
            } catch {
                rememberRecordFailure(index, 'codex_request_identity_session_json_malformed');
                return;
            }
            if (!isRecord(unknownRow)) {
                rememberRecordFailure(index, 'codex_request_identity_session_record_invalid');
                return;
            }
            if (!firstVisitorFailure) {
                try {
                    visitor({ index, rawLine, row: unknownRow });
                } catch (error) {
                    firstVisitorFailure = {
                        index,
                        error: error instanceof Error
                            ? error : new Error('codex_request_identity_record_projection_failed'),
                    };
                }
            }
        };

        while (offset < opened.size) {
            const requested = Math.min(chunk.length, opened.size - offset);
            const read = fs.readSync(descriptor, chunk, 0, requested, offset);
            if (read === 0) {
                throw new Error('codex_request_identity_session_changed_during_read');
            }
            const bytes = chunk.subarray(0, read);
            digest.update(bytes);
            finalByte = bytes[bytes.length - 1];
            let cursor = 0;
            while (cursor < bytes.length) {
                const newline = bytes.indexOf(0x0a, cursor);
                if (newline < 0) {
                    const fragment = bytes.subarray(cursor);
                    lineBytes += fragment.length;
                    if (lineBytes > MAX_JSONL_RECORD_BYTES) {
                        rememberRecordFailure(recordCount, 'codex_request_identity_session_record_limit_exceeded');
                        lineFragments = [];
                        lineBytes = 0;
                    } else if (!firstRecordFailure) {
                        lineFragments.push(Buffer.from(fragment));
                    }
                    break;
                }
                processLine(bytes.subarray(cursor, newline));
                cursor = newline + 1;
            }
            offset += read;
        }

        const afterRead = fs.fstatSync(descriptor);
        let afterPath: fs.Stats;
        try {
            afterPath = fs.lstatSync(sessionFile);
        } catch {
            throw new Error('codex_request_identity_session_changed_during_read');
        }
        if (
            afterPath.isSymbolicLink()
            || !sameOpenedFile(opened, afterRead)
            || !sameOpenedFile(opened, afterPath)
        ) {
            throw new Error('codex_request_identity_session_changed_during_read');
        }
        if (finalByte !== 0x0a) {
            throw new Error('codex_request_identity_session_has_incomplete_final_line');
        }
        const firstFailure = firstRecordFailure && firstVisitorFailure
            ? (firstRecordFailure.index <= firstVisitorFailure.index
                ? firstRecordFailure.error : firstVisitorFailure.error)
            : firstRecordFailure?.error ?? firstVisitorFailure?.error;
        if (firstFailure) throw firstFailure;
        return { fileBytes: opened.size, recordCount, sha256: digest.digest('hex') };
    } finally {
        fs.closeSync(descriptor);
    }
}
